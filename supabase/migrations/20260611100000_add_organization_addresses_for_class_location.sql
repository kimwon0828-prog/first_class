do $$
begin
  alter table public.organizations
    add column if not exists address text,
    add column if not exists address_detail text;
end
$$;

do $$
begin
  alter table public.teacher_signup_requests
    add column if not exists address text,
    add column if not exists address_detail text;
end
$$;

update public.organizations o
set
  address = coalesce(o.address, r.address),
  address_detail = coalesce(o.address_detail, r.address_detail)
from public.teacher_signup_requests r
where r.approved_organization_id = o.id
  and (o.address is null or o.address_detail is null)
  and (r.address is not null or r.address_detail is not null);

create or replace function public.create_teacher_signup_request_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  signup_intent text;
  teacher_name text;
  organization_name text;
  academy_area text;
begin
  meta := new.raw_user_meta_data;
  signup_intent := coalesce(meta->>'signup_intent', '');

  if signup_intent <> 'teacher_public' then
    return new;
  end if;

  if exists (
    select 1
    from public.teacher_signup_requests r
    where r.user_id = new.id
      and r.status in ('pending', 'approved')
  ) then
    return new;
  end if;

  teacher_name := coalesce(
    nullif(meta->>'teacher_name', ''),
    nullif(meta->>'name', ''),
    '학원 관리자'
  );
  organization_name := coalesce(nullif(meta->>'organization_name', ''), '미입력');
  academy_area := coalesce(nullif(meta->>'academy_area', ''), '후곡학원가');

  if academy_area not in ('후곡학원가', '백마학원가', '은행사거리학원가') then
    academy_area := '후곡학원가';
  end if;

  insert into public.teacher_signup_requests (
    user_id,
    signup_email,
    status,
    teacher_name,
    teacher_phone,
    organization_name,
    branch_name,
    organization_phone,
    academy_area,
    address,
    address_detail,
    request_note
  ) values (
    new.id,
    new.email,
    'pending',
    teacher_name,
    nullif(meta->>'teacher_phone', ''),
    organization_name,
    nullif(meta->>'branch_name', ''),
    nullif(meta->>'organization_phone', ''),
    academy_area,
    nullif(meta->>'address', ''),
    nullif(meta->>'address_detail', ''),
    nullif(meta->>'request_note', '')
  );

  return new;
end;
$$;

drop function if exists public.list_pending_teacher_signup_requests();

create or replace function public.list_pending_teacher_signup_requests()
returns table (
  request_id uuid,
  user_id uuid,
  signup_email text,
  organization_name text,
  academy_area text,
  branch_name text,
  address text,
  address_detail text,
  teacher_name text,
  teacher_phone text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, app
as $$
  select
    r.id as request_id,
    r.user_id,
    r.signup_email,
    r.organization_name,
    r.academy_area,
    r.branch_name,
    r.address,
    r.address_detail,
    r.teacher_name,
    r.teacher_phone,
    r.status,
    r.created_at
  from public.teacher_signup_requests r
  where exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
    and r.status = 'pending'
  order by r.created_at desc
$$;

create or replace function public.approve_teacher_signup_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  r public.teacher_signup_requests%rowtype;
  org_id uuid;
  teacher_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'forbidden';
  end if;

  select *
  into r
  from public.teacher_signup_requests
  where id = request_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if r.status <> 'pending' then
    raise exception 'already_reviewed';
  end if;

  insert into public.organizations (name, branch_name, academy_area, address, address_detail)
  values (r.organization_name, r.branch_name, r.academy_area, r.address, r.address_detail)
  returning id into org_id;

  insert into public.profiles (id, role, name, phone, organization_id)
  values (r.user_id, 'academy', r.teacher_name, r.teacher_phone, org_id)
  on conflict (id) do update
    set role = 'academy',
        name = excluded.name,
        phone = excluded.phone,
        organization_id = excluded.organization_id,
        updated_at = now();

  insert into public.teachers (profile_id, organization_id, display_name, intro, specialty, career_years, is_active)
  values (r.user_id, org_id, coalesce(nullif(trim(r.teacher_name), ''), '학원 관리자'), null, null, 0, true)
  returning id into teacher_id;

  update public.teacher_signup_requests
  set status = 'approved',
      approved_organization_id = org_id,
      approved_teacher_id = teacher_id,
      reviewed_at = now(),
      updated_at = now()
  where id = request_id;
end;
$$;
