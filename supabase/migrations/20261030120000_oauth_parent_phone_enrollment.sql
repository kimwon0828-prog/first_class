-- LOCAL ONLY (2026-10-30). Production 적용은 별도 승인 후 이 파일 하나만 적용한다.
-- Row rewrite / backfill 없음. 기존 이용자의 인증 상태를 일괄로 바꾸지 않는다.
--
-- Apple·Google 로그인 Parent는 서버에서 휴대폰 인증을 마쳐야 서비스에 들어간다.
-- 기존 COMPAT/HARDENING은 "profile이 없던 신규 Apple"만 등록했다. 이 변경은
--   1) Google identity를 같은 대상으로 넣고,
--   2) 인증 기록이 없는 기존 Apple·Google Parent도 본인이 로그인한 요청에서
--      service-only RPC가 한 명씩 등록(required=true)하게 한다.
-- 저장돼 있던 profiles.phone 문자열은 인증으로 취급하지 않는다. 인증 완료는 기존
-- OTP verify RPC가 만든 private proof(app.parent_phone_verifications)뿐이다.
--
-- Kakao 연결만으로 면제하지 않는다. Supabase Auth의 Kakao provider는 Kakao 전화번호를
-- identity에 저장하지 않으므로 서버에 신뢰할 수 있는 Kakao 번호가 없다.
-- Kakao만 연결된 계정은 등록 대상이 아니며 기존 흐름을 그대로 유지한다.
begin;

create function app.oauth_parent_phone_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.identities where user_id = p_user and provider in ('apple','google'))
    and not exists (select 1 from public.profiles where id = p_user and role <> 'parent')
    and not exists (select 1 from app.parent_account_deletions where parent_id = p_user)
    and not exists (select 1 from auth.users where id = p_user and (
      raw_user_meta_data->>'signup_intent' in ('teacher_invite','staff_invite','teacher_public')
      or coalesce(raw_app_meta_data->'app_store_review', 'false'::jsonb) = 'true'::jsonb));
$$;
revoke all on function app.oauth_parent_phone_eligible(uuid) from public,anon,authenticated;

-- Profile 유무와 무관하게 "명시적 요구 + 인증 시각 없음"만 대기 상태다.
-- 기존 profile은 profile flag 또는 private 등록 중 하나라도 required면 required다.
create or replace function app.apple_parent_phone_required(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.role = 'parent' and p.phone_verified_at is null
        and (p.phone_verification_required or coalesce(v.phone_verification_required, false))
     from public.profiles p left join app.parent_phone_verifications v on v.user_id = p.id
     where p.id = p_user),
    (select phone_verification_required and verified_at is null
     from app.parent_phone_verifications where user_id = p_user), false);
$$;

create or replace function app.parent_phone_status(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
  v app.parent_phone_verifications;
  required boolean;
  verified_at timestamptz;
begin
  select * into p from public.profiles where id = p_user;
  if (p.role is not null and p.role <> 'parent') or exists (
    select 1 from app.parent_account_deletions where parent_id = p_user
  ) then
    return jsonb_build_object('required',false,'verified',false,'phoneVerifiedAt',null,
      'profileMissing',p.id is null,'excluded',true);
  end if;
  select * into v from app.parent_phone_verifications where user_id = p_user;
  required := case when p.id is not null
    then p.phone_verification_required or coalesce(v.phone_verification_required,false)
    else coalesce(v.phone_verification_required,false) end;
  verified_at := case when p.id is not null then p.phone_verified_at else v.verified_at end;
  return jsonb_build_object('required',required,'verified',verified_at is not null,
    'phoneVerifiedAt',verified_at,'profileMissing',p.id is null,
    'phone',case when p.id is not null then p.phone else v.phone end);
end;
$$;
revoke all on function app.apple_parent_phone_required(uuid),app.parent_phone_status(uuid)
  from public,anon,authenticated;

-- Called only by the verified native server path for the caller's own user id.
-- Never changes a profile; never clears an existing requirement or proof.
create function public.enroll_oauth_parent_phone(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  perform 1 from auth.users where id = p_user for update;
  if not found then
    return jsonb_build_object('required',false,'verified',false,'phoneVerifiedAt',null,'excluded',true);
  end if;
  if not app.oauth_parent_phone_eligible(p_user) then return app.parent_phone_status(p_user); end if;
  select * into p from public.profiles where id = p_user for update;
  if p.id is null or p.phone_verified_at is null then
    insert into app.parent_phone_verifications(user_id, phone_verification_required) values (p_user, true)
    on conflict (user_id) do update set phone_verification_required = true
      where app.parent_phone_verifications.verified_at is null;
  end if;
  return app.parent_phone_status(p_user);
end;
$$;
revoke all on function public.enroll_oauth_parent_phone(uuid) from public,anon,authenticated;
grant execute on function public.enroll_oauth_parent_phone(uuid) to service_role;

-- Same contract as COMPAT, plus: invalid_code reports the remaining tries, and a
-- verified existing profile receives the proof and required=true in this transaction.
create or replace function public.verify_parent_phone_challenge(p_user uuid,p_session uuid,p_id uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c app.parent_phone_challenges; v_hash text;
begin
  if not app.apple_parent_phone_required(p_user)
    or not exists (select 1 from auth.sessions where id = p_session and user_id = p_user)
    or exists (select 1 from app.parent_account_deletions where parent_id = p_user)
    or exists (select 1 from auth.users where id = p_user and raw_user_meta_data->>'signup_intent' in ('teacher_invite','staff_invite','teacher_public'))
  then return jsonb_build_object('status','unauthorized'); end if;
  select * into c from app.parent_phone_challenges where id = p_id and user_id = p_user and session_id = p_session for update;
  if not found or c.consumed_at is not null then return jsonb_build_object('status','used'); end if;
  if c.sent_at is null or c.send_failed then return jsonb_build_object('status','unavailable'); end if;
  if c.expires_at <= now() then return jsonb_build_object('status','expired'); end if;
  if c.attempts >= 5 then return jsonb_build_object('status','attempts_exceeded'); end if;
  update app.parent_phone_challenges set attempts = attempts + 1 where id = c.id;
  if p_hash is null or c.otp_hash <> p_hash then
    return case when c.attempts >= 4 then jsonb_build_object('status','attempts_exceeded')
      else jsonb_build_object('status','invalid_code','attemptsLeft',4 - c.attempts) end;
  end if;
  perform 1 from public.profiles where id = p_user for update;
  perform pg_advisory_xact_lock(hashtextextended(c.phone, 610041001));
  v_hash := encode(sha256(convert_to(c.phone, 'UTF8')), 'hex');
  if exists (select 1 from public.profiles where id <> p_user and role = 'parent' and app.normalized_parent_phone(phone) = c.phone)
    or exists (select 1 from app.parent_phone_verifications where user_id <> p_user and phone_hash = v_hash) then
    update app.parent_phone_challenges set consumed_at = now() where id = c.id;
    return jsonb_build_object('status','duplicate_phone');
  end if;
  insert into app.parent_phone_verifications(user_id,phone_verification_required,phone_hash,phone,verified_at)
  values (p_user,true,v_hash,c.phone,now())
  on conflict (user_id) do update set phone_verification_required = true, phone_hash = excluded.phone_hash,
    phone = excluded.phone, verified_at = now();
  update public.profiles set phone = c.phone, phone_verified_at = now(), phone_verification_required = true
  where id = p_user and role = 'parent';
  update app.parent_phone_challenges set consumed_at = now() where id = c.id;
  return jsonb_build_object('status','verified');
end;
$$;

-- Resume the caller's own active challenge after an app restart. Adds the timing
-- the native OTP screen needs; never exposes a digest or another session's challenge.
create or replace function public.get_my_parent_phone_challenge() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.parent_phone_challenges; active boolean;
begin
  select * into c from app.parent_phone_challenges
  where user_id = auth.uid() and session_id = (auth.jwt()->>'session_id')::uuid
  order by created_at desc limit 1;
  if c.id is null then return '{}'::jsonb; end if;
  active := c.sent_at is not null and not c.send_failed and c.consumed_at is null and c.expires_at > now() and c.attempts < 5;
  return jsonb_build_object('phone',c.phone,
    'retryAfter',greatest(0,ceil(extract(epoch from c.created_at + interval '60 seconds' - now()))),
    'challengeId',case when active then c.id else null end,
    'expiresIn',case when active then ceil(extract(epoch from c.expires_at - now())) else null end,
    'attemptsLeft',case when active then 5 - c.attempts else null end);
end;
$$;

-- Same guard as HARDENING. The only new transition is an enrolled existing profile
-- (required=false) becoming required=true, and only when it copies the private OTP proof.
create or replace function app.guard_parent_phone_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v app.parent_phone_verifications;
begin
  if tg_op = 'UPDATE' then
    if (new.phone_verification_required,new.phone_verified_at,new.phone)
      is not distinct from (old.phone_verification_required,old.phone_verified_at,old.phone) then
      return new;
    end if;
    if new.phone_verification_required is distinct from old.phone_verification_required then
      select * into v from app.parent_phone_verifications where user_id = new.id;
      if old.phone_verification_required or new.phone_verification_required is not true
        or not coalesce(v.phone_verification_required, false) or v.verified_at is null
        or new.phone_verified_at is distinct from v.verified_at or new.phone is distinct from v.phone then
        raise exception 'parent_phone_verification_state_immutable' using errcode = '42501';
      end if;
      return new;
    end if;
    if not old.phone_verification_required then
      if new.phone_verified_at is distinct from old.phone_verified_at then
        raise exception 'parent_phone_verification_state_immutable' using errcode = '42501';
      end if;
      return new;
    end if;
  else
    perform 1 from auth.users where id = new.id for update;
  end if;

  select * into v from app.parent_phone_verifications where user_id = new.id;
  if tg_op = 'INSERT' and not coalesce(v.phone_verification_required,false) then
    if new.phone_verification_required or new.phone_verified_at is not null then
      raise exception 'parent_phone_verification_state_immutable' using errcode = '42501';
    end if;
    return new;
  end if;
  if v.verified_at is null then
    raise exception 'parent_phone_verification_required' using errcode = '42501';
  end if;
  if new.phone_verification_required is distinct from true
    or new.phone_verified_at is distinct from v.verified_at then
    raise exception 'parent_phone_verification_state_immutable' using errcode = '42501';
  end if;
  if new.phone is distinct from v.phone then
    raise exception 'parent_verified_phone_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- INSERT only, as before. An enrolled existing profile is blocked until verified.
create or replace function app.guard_parent_phone_application_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = new.parent_id for share;
  if p.phone_verified_at is null and (p.phone_verification_required or exists (
    select 1 from app.parent_phone_verifications v
    where v.user_id = new.parent_id and v.phone_verification_required)) then
    raise exception 'parent_phone_verification_required' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_parent_phone_profile(),app.guard_parent_phone_application_insert()
  from public,anon,authenticated;
commit;
