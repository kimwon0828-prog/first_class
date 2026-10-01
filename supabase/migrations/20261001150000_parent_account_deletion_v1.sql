-- Parent account deletion: preserve Academy snapshots/history; detach ownership.
-- Local release V1. Production rollout requires separate approval.
begin;

create table app.parent_account_deletions (
  parent_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  state text not null check (state in ('processing','db_cleaned'))
);
alter table app.parent_account_deletions enable row level security;
revoke all on app.parent_account_deletions from public, anon, authenticated;

-- No arguments: callers cannot inspect another user's pending state.
create function public.get_my_parent_account_deletion_status()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from app.parent_account_deletions where parent_id = auth.uid()
  );
$$;
revoke all on function public.get_my_parent_account_deletion_status() from public, anon;
grant execute on function public.get_my_parent_account_deletion_status() to authenticated;

-- Even profile-sync or a retained JWT cannot recreate a half-deleted account.
create function app.guard_deleted_parent_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from app.parent_account_deletions where parent_id = new.id) then
    raise exception 'parent_account_deletion_pending' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_deleted_parent_profile() from public, anon, authenticated;
create trigger guard_deleted_parent_profile before insert or update on public.profiles
for each row execute function app.guard_deleted_parent_profile();

-- Only the transaction of the self-deletion RPC can bypass the personal-response
-- DELETE guard. UPDATE remains immutable; no client-controlled GUC bypass.
create or replace function app.reject_parent_experience_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() in ('authenticated','anon') then
    if tg_op = 'DELETE' and current_user = 'postgres' and old.parent_id = auth.uid()
      and exists (select 1 from app.parent_account_deletions
                  where parent_id = auth.uid() and state = 'processing') then
      return old;
    end if;
    raise exception 'feedback_already_submitted';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Keep log facts and notes; a deleted account is no longer its live actor.
alter table public.application_logs alter column actor_id drop not null;

create function public.prepare_my_parent_account_deletion()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null or auth.role() <> 'authenticated' then
    raise exception 'parent_auth_required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 610011500));
  if exists (select 1 from app.parent_account_deletions where parent_id=v_uid and state='db_cleaned') then
    return 'db_cleaned';
  end if;
  select role into v_role from public.profiles where id=v_uid for update;
  if v_role is distinct from 'parent' then
    raise exception 'parent_auth_required' using errcode='42501';
  end if;
  -- Never silently rewrite Studio-authored records or mixed-role identities.
  if exists (select 1 from public.teachers where profile_id=v_uid)
    or exists (select 1 from public.academy_update_requests where requester_profile_id=v_uid)
    or exists (select 1 from public.registration_results where recorded_by=v_uid)
    or exists (select 1 from public.trial_results where created_by=v_uid or updated_by=v_uid)
    or exists (select 1 from public.experience_reports where published_by=v_uid or withdrawn_by=v_uid or superseded_by=v_uid)
  then raise exception 'parent_account_role_conflict' using errcode='42501'; end if;

  insert into app.parent_account_deletions(parent_id,state) values(v_uid,'processing');
  delete from public.experience_feedback where parent_id=v_uid;
  delete from public.parent_decisions where parent_id=v_uid;
  delete from public.parent_report_engagement where parent_id=v_uid;
  delete from public.parent_notification_reads where parent_id=v_uid;
  update public.trial_applications set parent_id=null, child_id=null where parent_id=v_uid;
  -- Include references to owned children even if an older import already detached parent_id.
  update public.trial_applications set child_id=null where child_id in
    (select id from public.children where parent_id=v_uid);
  update public.application_logs set actor_id=null where actor_id=v_uid;
  delete from public.children where parent_id=v_uid;
  delete from public.profiles where id=v_uid;
  update app.parent_account_deletions set state='db_cleaned' where parent_id=v_uid;
  return 'db_cleaned';
end;
$$;
revoke all on function public.prepare_my_parent_account_deletion() from public, anon, service_role;
grant execute on function public.prepare_my_parent_account_deletion() to authenticated;

-- Object ownership is metadata, not a user FK. Enumerate only this authenticated
-- pending account's objects; the server removes actual files via Storage API.
create function public.get_my_parent_deletion_storage_objects()
returns table(bucket_id text, object_name text) language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where coalesce(o.owner_id, o.owner::text)=auth.uid()::text
    and exists (select 1 from app.parent_account_deletions where parent_id=auth.uid() and state='db_cleaned');
$$;
revoke all on function public.get_my_parent_deletion_storage_objects() from public, anon, service_role;
grant execute on function public.get_my_parent_deletion_storage_objects() to authenticated;
create policy block_pending_parent_storage on storage.objects as restrictive for all to authenticated
using (not public.get_my_parent_account_deletion_status())
with check (not public.get_my_parent_account_deletion_status());

notify pgrst, 'reload schema';
commit;
