-- iOS Push foundation only. Registration default OFF; no event capture/sending/inbox changes.
begin;
create table public.parent_push_settings (
  singleton boolean primary key default true check(singleton), registration_enabled boolean not null default false
);
insert into public.parent_push_settings(singleton) values(true);
alter table public.parent_push_settings enable row level security;
revoke all on public.parent_push_settings from public,anon,authenticated;
grant all on public.parent_push_settings to service_role;

create table public.parent_push_devices (
  id uuid primary key, -- random installation ID; never a Parent identity
  parent_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  secret_hash text not null,
  expo_push_token text unique,
  platform text not null check(platform in ('ios','android')),
  enabled boolean not null default false,
  permission_status text not null check(permission_status in ('granted','denied','undetermined')),
  app_version text check(length(app_version)<=50),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(expo_push_token is null or expo_push_token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  check(not enabled or (permission_status='granted' and expo_push_token is not null))
);
alter table public.parent_push_devices enable row level security;
revoke all on public.parent_push_devices from public,anon,authenticated;
grant select(id,parent_id,expo_push_token,platform,enabled,permission_status,app_version,last_seen_at,created_at,updated_at) on public.parent_push_devices to authenticated;
grant update(enabled) on public.parent_push_devices to authenticated;
grant all on public.parent_push_devices to service_role;
create policy parent_push_read_own on public.parent_push_devices for select to authenticated
 using(parent_id=auth.uid() and app.current_role()='parent');
create policy parent_push_update_own on public.parent_push_devices for update to authenticated
 using(parent_id=auth.uid() and app.current_role()='parent') with check(parent_id=auth.uid() and app.current_role()='parent');

-- Narrow possession-authorized account switch; no arbitrary parent_id argument.
-- A token alone cannot claim another installation. Secret is 256 random bits in
-- native SecureStore; only its digest is persisted. Never returned by table grants.
create function public.register_parent_push_device(p_installation_id uuid,p_secret text,p_token text,p_platform text,p_permission text,p_version text)
returns void language plpgsql security definer set search_path='' as $$
declare sid uuid; existing public.parent_push_devices;
begin
  if auth.uid() is null or app.current_role() is distinct from 'parent'
    or exists(select 1 from app.parent_account_deletions where parent_id=auth.uid()) then raise exception 'push_forbidden'; end if;
  if not exists(select 1 from public.parent_push_settings where registration_enabled) then raise exception 'push_disabled'; end if;
  sid:=(auth.jwt()->>'session_id')::uuid;
  if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid()) then raise exception 'push_session_required'; end if;
  if p_secret is null or p_secret !~ '^[0-9a-f]{64}$' or p_installation_id is null
    or p_platform not in ('ios','android') or p_platform is null
    or p_permission not in ('granted','denied','undetermined') or p_permission is null
    or length(p_version)>50 or (p_permission='granted' and p_token is null)
    or (p_token is not null and p_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$') then raise exception 'push_invalid_input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_installation_id::text,0));
  select * into existing from public.parent_push_devices where id=p_installation_id for update;
  if found and existing.secret_hash<>encode(sha256(convert_to(p_secret,'UTF8')),'hex') then raise exception 'push_device_conflict'; end if;
  if exists(select 1 from public.parent_push_devices where expo_push_token=p_token and id<>p_installation_id) then raise exception 'push_device_conflict'; end if;
  insert into public.parent_push_devices(id,parent_id,session_id,secret_hash,expo_push_token,platform,enabled,permission_status,app_version)
    values(p_installation_id,auth.uid(),sid,encode(sha256(convert_to(p_secret,'UTF8')),'hex'),p_token,p_platform,p_permission='granted',p_permission,p_version)
    on conflict(id) do update set parent_id=auth.uid(),session_id=sid,expo_push_token=excluded.expo_push_token,
      platform=excluded.platform,enabled=excluded.enabled,permission_status=excluded.permission_status,
      app_version=excluded.app_version,last_seen_at=now(),updated_at=now();
end;
$$;
revoke all on function public.register_parent_push_device(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.register_parent_push_device(uuid,text,text,text,text,text) to authenticated;


commit;
