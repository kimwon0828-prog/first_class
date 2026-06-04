create or replace function app.current_role()
returns text
language sql
stable
security definer
set search_path = public, app
as $$
  select
    case
      when role in ('academy', 'admin') then 'teacher'
      else role
    end
  from public.profiles
  where id = auth.uid()
$$;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('parent', 'teacher', 'academy', 'admin'));

alter table public.profiles
  drop constraint if exists profiles_role_org_check;

alter table public.profiles
  add constraint profiles_role_org_check
  check (
    (role = 'parent' and organization_id is null)
    or (role in ('teacher', 'academy', 'admin') and organization_id is not null)
  );
