-- COMPAT: additive onboarding only. No profile/application hardening triggers.
-- Existing rows receive false; only explicit server onboarding enrolls new Apple Parents.
alter table public.profiles add column phone_verified_at timestamptz;
alter table public.profiles add column phone_verification_required boolean not null default false;
create function app.normalized_parent_phone(p_phone text) returns text language sql immutable set search_path='' as $$
 select case when d ~ '^8210[0-9]{8}$' then '0'||substr(d,3) else d end from (select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') d) s;
$$;
revoke all on function app.normalized_parent_phone(text) from public,anon,authenticated;
create table app.parent_phone_challenges (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 phone text not null check(phone ~ '^010[0-9]{8}$'), otp_hash text not null check(otp_hash ~ '^[0-9a-f]{64}$'),
 ip_hash text not null, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '5 minutes',
 attempts integer not null default 0 check(attempts between 0 and 5), sent_at timestamptz, consumed_at timestamptz,
 send_failed boolean not null default false
);
create index parent_phone_challenge_user_created on app.parent_phone_challenges(user_id,created_at desc);
create index parent_phone_challenge_phone_created on app.parent_phone_challenges(phone,created_at desc);
create table app.parent_phone_verifications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone_verification_required boolean not null default false,
 phone_hash text unique, phone text check(phone ~ '^010[0-9]{8}$'), verified_at timestamptz,
 check ((verified_at is null and phone is null and phone_hash is null) or (verified_at is not null and phone is not null and phone_hash is not null))
);
-- Pre-profile enrollment/proof, not an editable contact source. Existing profiles always win.
alter table app.parent_phone_challenges enable row level security;
alter table app.parent_phone_verifications enable row level security;
revoke all on app.parent_phone_challenges,app.parent_phone_verifications from public,anon,authenticated;
-- Access only through explicitly granted functions. Client cannot read hashes or mark verified.
create function app.apple_parent_phone_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.identities where user_id=p_user and provider='apple')
 and not exists(select 1 from auth.identities where user_id=p_user and provider='kakao')
 and not exists(select 1 from public.profiles where id=p_user and role<>'parent')
 and not exists(select 1 from auth.users where id=p_user and raw_user_meta_data->>'signup_intent' in ('teacher_invite','staff_invite','teacher_public'));
$$;
revoke all on function app.apple_parent_phone_eligible(uuid) from public,anon,authenticated;
create function app.apple_parent_phone_required(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app.apple_parent_phone_eligible(p_user) and coalesce(
  (select phone_verification_required and phone_verified_at is null from public.profiles where id=p_user),
  (select phone_verification_required and verified_at is null from app.parent_phone_verifications where user_id=p_user),false);
$$;
revoke all on function app.apple_parent_phone_required(uuid) from public,anon,authenticated;
create function app.parent_phone_status(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; v app.parent_phone_verifications; required boolean; verified_at timestamptz;
begin
 select * into p from public.profiles where id=p_user;
 if (p.role is not null and p.role<>'parent') or exists(select 1 from app.parent_account_deletions where parent_id=p_user)
 or exists(select 1 from auth.users where id=p_user and raw_user_meta_data->>'signup_intent' in ('teacher_invite','staff_invite','teacher_public')) then
  return jsonb_build_object('required',false,'verified',false,'phoneVerifiedAt',null,'profileMissing',p.id is null,'excluded',true);
 end if;
 if not app.apple_parent_phone_eligible(p_user) then
  return jsonb_build_object('required',false,'verified',false,'phoneVerifiedAt',null,'profileMissing',p.id is null,'excluded',false);
 end if;
 select * into v from app.parent_phone_verifications where user_id=p_user;
 -- Never infer required from a missing phone or an Apple identity. Explicit flag only.
 required:=case when p.id is not null then p.phone_verification_required else coalesce(v.phone_verification_required,false) end;
 verified_at:=case when p.id is not null then p.phone_verified_at else v.verified_at end;
 return jsonb_build_object('required',required,'verified',verified_at is not null,'phoneVerifiedAt',verified_at,
 'profileMissing',p.id is null,'phone',case when p.id is not null then p.phone else v.phone end);
end;
$$;
revoke all on function app.parent_phone_status(uuid) from public,anon,authenticated;
create function public.get_my_parent_phone_status() returns jsonb language sql stable security definer set search_path='' as $$
 select app.parent_phone_status(auth.uid());
$$;
revoke all on function public.get_my_parent_phone_status() from public,anon;
grant execute on function public.get_my_parent_phone_status() to authenticated;

-- Called only by the verified server OAuth/profile-creation path. It never changes existing profiles.
create function public.enroll_new_apple_parent_phone(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=p_user for update;
 if not found then return jsonb_build_object('required',false,'verified',false,'phoneVerifiedAt',null,'excluded',true); end if;
 if not app.apple_parent_phone_eligible(p_user) or exists(select 1 from app.parent_account_deletions where parent_id=p_user) then
  return app.parent_phone_status(p_user);
 end if;
 if not exists(select 1 from public.profiles where id=p_user) then
  insert into app.parent_phone_verifications(user_id,phone_verification_required) values(p_user,true) on conflict(user_id) do nothing;
 end if;
 return app.parent_phone_status(p_user);
end;
$$;
revoke all on function public.enroll_new_apple_parent_phone(uuid) from public,anon,authenticated;
grant execute on function public.enroll_new_apple_parent_phone(uuid) to service_role;

create function public.begin_parent_phone_challenge(p_user uuid,p_session uuid,p_id uuid,p_phone text,p_hash text,p_ip_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare last_at timestamptz;
begin
 if not app.apple_parent_phone_required(p_user) or not exists(select 1 from auth.sessions where id=p_session and user_id=p_user)
 or exists(select 1 from app.parent_account_deletions where parent_id=p_user)
 or exists(select 1 from auth.users where id=p_user and raw_user_meta_data->>'signup_intent' in ('teacher_invite','staff_invite','teacher_public')) then return jsonb_build_object('status','unauthorized'); end if;
 if p_phone is null or p_phone !~ '^010[0-9]{8}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','invalid_phone'); end if;
 -- Serialize issuance so concurrent requests cannot race rate counts.
 perform pg_advisory_xact_lock(610041000);
 select max(created_at) into last_at from app.parent_phone_challenges where user_id=p_user;
 if last_at>now()-interval '60 seconds' then return jsonb_build_object('status','cooldown','retryAfter',ceil(extract(epoch from last_at+interval '60 seconds'-now()))); end if;
 if (select count(*) from app.parent_phone_challenges where user_id=p_user and created_at>now()-interval '1 hour')>=5
 or (select count(*) from app.parent_phone_challenges where phone=p_phone and created_at>now()-interval '1 hour')>=5
 or (select count(*) from app.parent_phone_challenges where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=20 then return jsonb_build_object('status','rate_limited'); end if;
 update app.parent_phone_challenges set consumed_at=now() where user_id=p_user and consumed_at is null;
 insert into app.parent_phone_challenges(id,user_id,session_id,phone,otp_hash,ip_hash) values(p_id,p_user,p_session,p_phone,p_hash,p_ip_hash);
 return jsonb_build_object('status','created','challengeId',p_id,'retryAfter',60);
end;
$$;
create function public.mark_parent_phone_challenge_sent(p_user uuid,p_id uuid,p_sent boolean)
returns void language sql security definer set search_path='' as $$
 update app.parent_phone_challenges set sent_at=case when p_sent then now() else null end,send_failed=not p_sent
 where id=p_id and user_id=p_user and consumed_at is null;
$$;
create function public.verify_parent_phone_challenge(p_user uuid,p_session uuid,p_id uuid,p_hash text)
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
revoke all on function public.begin_parent_phone_challenge(uuid,uuid,uuid,text,text,text),public.mark_parent_phone_challenge_sent(uuid,uuid,boolean),public.verify_parent_phone_challenge(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_parent_phone_challenge(uuid,uuid,uuid,text,text,text),public.mark_parent_phone_challenge_sent(uuid,uuid,boolean),public.verify_parent_phone_challenge(uuid,uuid,uuid,text) to service_role;

-- COMPAT: no trigger/constraint on profile writes or application inserts.
-- Auth FK cascade removes enrollment/challenges on account deletion. Pending deletion is denied by RPCs.
-- Direct REST column tampering/insert hardening is intentionally deferred to a separate rollout.

-- Resume only the caller's active login challenge after refresh; never expose a digest.
create function public.get_my_parent_phone_challenge() returns jsonb language plpgsql security definer set search_path='' as $$
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
revoke all on function public.get_my_parent_phone_challenge() from public,anon;
grant execute on function public.get_my_parent_phone_challenge() to authenticated;
