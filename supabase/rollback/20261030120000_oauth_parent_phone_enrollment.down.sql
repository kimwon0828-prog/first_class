-- ROLLBACK for 20261030120000_oauth_parent_phone_enrollment.sql (prepared 2026-10-30, not applied anywhere).
-- Restores the exact previous definitions copied from 20261004100000 (COMPAT) and 20261004120000 (HARDENING),
-- then removes the two added functions. No table, row, trigger, RLS or grant is changed by either direction.
-- Rows written while the migration was live stay valid under the previous definitions:
--   enrollment rows for new signups and OTP proofs are the same shape the COMPAT functions already read.
-- Run only after the web code that calls enroll_oauth_parent_phone is rolled back (it then falls back for Apple
-- signups and returns a retryable error for Google signups, which stay OFF).
begin;
create or replace function app.apple_parent_phone_required(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select role = 'parent' and phone_verification_required and phone_verified_at is null
     from public.profiles where id = p_user),
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
  required := case when p.id is not null then p.phone_verification_required
    else coalesce(v.phone_verification_required,false) end;
  verified_at := case when p.id is not null then p.phone_verified_at else v.verified_at end;
  return jsonb_build_object('required',required,'verified',verified_at is not null,
    'phoneVerifiedAt',verified_at,'profileMissing',p.id is null,
    'phone',case when p.id is not null then p.phone else v.phone end);
end;
$$;

create or replace function public.verify_parent_phone_challenge(p_user uuid,p_session uuid,p_id uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c app.parent_phone_challenges; v_hash text;
begin
 if not app.apple_parent_phone_required(p_user) or not exists(select 1 from auth.sessions where id=p_session and user_id=p_user)
 or exists(select 1 from app.parent_account_deletions where parent_id=p_user)
 or exists(select 1 from auth.users where id=p_user and raw_user_meta_data->>'signup_intent' in ('teacher_invite','staff_invite','teacher_public')) then return jsonb_build_object('status','unauthorized'); end if;
 select * into c from app.parent_phone_challenges where id=p_id and user_id=p_user and session_id=p_session for update;
 if not found or c.consumed_at is not null then return jsonb_build_object('status','used'); end if;
 if c.sent_at is null or c.send_failed then return jsonb_build_object('status','unavailable'); end if;
 if c.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
 if c.attempts>=5 then return jsonb_build_object('status','attempts_exceeded'); end if;
 update app.parent_phone_challenges set attempts=attempts+1 where id=c.id;
 if p_hash is null or c.otp_hash<>p_hash then return jsonb_build_object('status',case when c.attempts>=4 then 'attempts_exceeded' else 'invalid_code' end); end if;
 perform 1 from public.profiles where id=p_user for update;
 perform pg_advisory_xact_lock(hashtextextended(c.phone,610041001));
 v_hash:=encode(sha256(convert_to(c.phone,'UTF8')),'hex');
 if exists(select 1 from public.profiles where id<>p_user and role='parent' and app.normalized_parent_phone(phone)=c.phone)
 or exists(select 1 from app.parent_phone_verifications where user_id<>p_user and phone_hash=v_hash) then
  update app.parent_phone_challenges set consumed_at=now() where id=c.id;
  return jsonb_build_object('status','duplicate_phone');
 end if;
 insert into app.parent_phone_verifications(user_id,phone_verification_required,phone_hash,phone,verified_at) values(p_user,true,v_hash,c.phone,now())
 on conflict(user_id) do update set phone_hash=excluded.phone_hash,phone=excluded.phone,verified_at=now();
 update public.profiles set phone=c.phone,phone_verified_at=now() where id=p_user and role='parent' and phone_verification_required;
 update app.parent_phone_challenges set consumed_at=now() where id=c.id;
 return jsonb_build_object('status','verified');
end;
$$;

create or replace function public.get_my_parent_phone_challenge() returns jsonb language plpgsql security definer set search_path='' as $$
declare c app.parent_phone_challenges;
begin
 select * into c from app.parent_phone_challenges
 where user_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid
 order by created_at desc limit 1;
 if c.id is null then return '{}'::jsonb; end if;
 return jsonb_build_object('phone',c.phone,'retryAfter',greatest(0,ceil(extract(epoch from c.created_at+interval '60 seconds'-now()))),
 'challengeId',case when c.sent_at is not null and not c.send_failed and c.consumed_at is null and c.expires_at>now() and c.attempts<5 then c.id else null end);
end;
$$;

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
      raise exception 'parent_phone_verification_state_immutable' using errcode = '42501';
    end if;
    -- Grandfather contact/name/birth-date edits retain their existing contract.
    if not old.phone_verification_required then
      if new.phone_verified_at is distinct from old.phone_verified_at then
        raise exception 'parent_phone_verification_state_immutable' using errcode = '42501';
      end if;
      return new;
    end if;
  else
    -- Serialize against the existing enrollment RPC's auth.users row lock.
    -- No provider lookup: a pre-profile enrollment cannot be bypassed by an
    -- INSERT with omitted/default-false verification fields.
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

create or replace function app.guard_parent_phone_application_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = new.parent_id for share;
  if p.phone_verification_required = true and p.phone_verified_at is null then
    raise exception 'parent_phone_verification_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop function if exists public.enroll_oauth_parent_phone(uuid);
drop function if exists app.oauth_parent_phone_eligible(uuid);
commit;
