do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teacher_signup_requests'
      and column_name = 'academy_area'
  ) then
    alter table public.teacher_signup_requests
      add column academy_area text default '후곡학원가';
  end if;
end
$$;

update public.teacher_signup_requests
set academy_area = '후곡학원가'
where academy_area is null
   or academy_area not in ('후곡학원가', '백마학원가', '은행사거리학원가');

alter table public.teacher_signup_requests
  alter column academy_area set default '후곡학원가';

alter table public.teacher_signup_requests
  alter column academy_area set not null;

alter table public.teacher_signup_requests
  drop constraint if exists teacher_signup_requests_academy_area_check;

alter table public.teacher_signup_requests
  add constraint teacher_signup_requests_academy_area_check
  check (academy_area in ('후곡학원가', '백마학원가', '은행사거리학원가'));

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'academy_area'
  ) then
    alter table public.organizations
      add column academy_area text default '후곡학원가';
  end if;
end
$$;

update public.organizations
set academy_area = '후곡학원가'
where academy_area is null
   or academy_area not in ('후곡학원가', '백마학원가', '은행사거리학원가');

alter table public.organizations
  alter column academy_area set default '후곡학원가';

alter table public.organizations
  alter column academy_area set not null;

alter table public.organizations
  drop constraint if exists organizations_academy_area_check;

alter table public.organizations
  add constraint organizations_academy_area_check
  check (academy_area in ('후곡학원가', '백마학원가', '은행사거리학원가'));

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'teacher_seat_limit'
  ) then
    alter table public.organizations
      add column teacher_seat_limit integer not null default 3;
  end if;
end
$$;

update public.organizations
set teacher_seat_limit = 3
where teacher_seat_limit is null
   or teacher_seat_limit < 1;

alter table public.organizations
  alter column teacher_seat_limit set default 3;

alter table public.organizations
  alter column teacher_seat_limit set not null;

alter table public.organizations
  drop constraint if exists organizations_teacher_seat_limit_check;

alter table public.organizations
  add constraint organizations_teacher_seat_limit_check
  check (teacher_seat_limit >= 1);

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
    status,
    teacher_name,
    teacher_phone,
    organization_name,
    branch_name,
    organization_phone,
    academy_area,
    request_note
  ) values (
    new.id,
    'pending',
    teacher_name,
    nullif(meta->>'teacher_phone', ''),
    organization_name,
    nullif(meta->>'branch_name', ''),
    nullif(meta->>'organization_phone', ''),
    academy_area,
    nullif(meta->>'request_note', '')
  );

  return new;
end;
$$;
