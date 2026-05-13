-- Phase 2-2: enforce profiles.role as parent|teacher only.

do $$
declare
  invalid_role_count integer;
  invalid_org_rule_count integer;
begin
  select count(*)
  into invalid_role_count
  from public.profiles
  where role not in ('parent', 'teacher');

  if invalid_role_count > 0 then
    raise exception
      'profiles with invalid role for new policy found: %',
      invalid_role_count;
  end if;

  select count(*)
  into invalid_org_rule_count
  from public.profiles
  where (role = 'parent' and organization_id is not null)
     or (role = 'teacher' and organization_id is null);

  if invalid_org_rule_count > 0 then
    raise exception
      'profiles violating parent/teacher organization rule found: %',
      invalid_org_rule_count;
  end if;
end
$$;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('parent', 'teacher'));

alter table public.profiles
  drop constraint if exists profiles_role_org_check;

alter table public.profiles
  add constraint profiles_role_org_check
  check (
    (role = 'parent' and organization_id is null)
    or (role = 'teacher' and organization_id is not null)
  );
