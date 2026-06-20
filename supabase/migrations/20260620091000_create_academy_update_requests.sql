create table if not exists public.academy_update_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requester_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending',
  requested_academy_name text,
  requested_representative_name text,
  requested_business_registration_number text,
  requested_business_registration_file_path text,
  requested_academy_phone text,
  requested_contact_phone text,
  requested_postal_code text,
  requested_address_line1 text,
  requested_address_line2 text,
  current_snapshot jsonb not null default '{}'::jsonb,
  requested_snapshot jsonb not null default '{}'::jsonb,
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_update_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists academy_update_requests_org_status_created_at_idx
  on public.academy_update_requests (organization_id, status, created_at desc);

create index if not exists academy_update_requests_requester_created_at_idx
  on public.academy_update_requests (requester_profile_id, created_at desc);

create unique index if not exists academy_update_requests_pending_org_idx
  on public.academy_update_requests (organization_id)
  where status = 'pending';

alter table public.academy_update_requests enable row level security;

drop policy if exists academy_update_requests_select_same_org on public.academy_update_requests;
drop policy if exists academy_update_requests_select_academy_org on public.academy_update_requests;
create policy academy_update_requests_select_academy_org
on public.academy_update_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'academy'
      and p.organization_id = academy_update_requests.organization_id
  )
);

drop policy if exists academy_update_requests_insert_same_org on public.academy_update_requests;
drop policy if exists academy_update_requests_insert_academy_org on public.academy_update_requests;
create policy academy_update_requests_insert_academy_org
on public.academy_update_requests
for insert
to authenticated
with check (
  requester_profile_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'academy'
      and p.organization_id = academy_update_requests.organization_id
  )
);

drop policy if exists academy_update_requests_select_admin on public.academy_update_requests;
create policy academy_update_requests_select_admin
on public.academy_update_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists academy_update_requests_update_admin on public.academy_update_requests;
create policy academy_update_requests_update_admin
on public.academy_update_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.academy_update_requests'::regclass
      and tgname = 'set_academy_update_requests_updated_at'
      and not tgisinternal
  ) then
    create trigger set_academy_update_requests_updated_at
    before update on public.academy_update_requests
    for each row execute function public.set_updated_at();
  end if;
end
$$;
