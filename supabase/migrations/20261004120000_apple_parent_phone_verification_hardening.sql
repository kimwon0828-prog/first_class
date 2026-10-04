-- LOCAL ONLY. Apply after COMPAT, with separate Production rollout approval.
-- No row rewrites, provider backfill, policy replacement, or Push changes.
begin;

-- Keep the legacy function name used by OTP RPCs. Enrollment alone classifies
-- providers; all subsequent gate/write decisions use the explicit state pair.
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
revoke all on function app.apple_parent_phone_required(uuid),app.parent_phone_status(uuid)
  from public,anon,authenticated;

-- The existing self INSERT/UPDATE RLS allows direct REST calls. Compare changes
-- to the private OTP proof rather than trusting payloads, a JWT role, or a GUC.
-- verify_parent_phone_challenge writes that proof before updating profiles, in
-- the same transaction. Authenticated profile completion may only copy it.
create function app.guard_parent_phone_profile()
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
revoke all on function app.guard_parent_phone_profile() from public,anon,authenticated;
create trigger guard_parent_phone_profile
  before insert or update of phone,phone_verified_at,phone_verification_required on public.profiles
  for each row execute function app.guard_parent_phone_profile();

-- INSERT only: existing applications, status transitions, cancellation, logs,
-- schedules and registration data are not modified. Applies to both program types.
create function app.guard_parent_phone_application_insert()
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
revoke all on function app.guard_parent_phone_application_insert() from public,anon,authenticated;
create trigger guard_parent_phone_application_insert
  before insert on public.trial_applications
  for each row execute function app.guard_parent_phone_application_insert();
commit;
