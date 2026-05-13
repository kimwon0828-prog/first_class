-- Phase 2-1: role data transition (operator -> teacher) and teachers table backfill.

do $$
declare
  invalid_operator_count integer;
  remaining_operator_count integer;
  missing_teacher_row_count integer;
begin
  -- Safety: operator rows must have organization_id before converting to teacher.
  select count(*)
  into invalid_operator_count
  from public.profiles
  where role = 'operator'
    and organization_id is null;

  if invalid_operator_count > 0 then
    raise exception
      'operator rows without organization_id found: % (fix data before migration)',
      invalid_operator_count;
  end if;

  update public.profiles
  set role = 'teacher'
  where role = 'operator';

  -- Backfill teachers row only when missing. This avoids duplicate teacher rows.
  insert into public.teachers (
    id,
    profile_id,
    organization_id,
    intro,
    specialty,
    career_years
  )
  select
    gen_random_uuid(),
    p.id,
    p.organization_id,
    null,
    null,
    0
  from public.profiles p
  where p.role = 'teacher'
    and p.organization_id is not null
    and not exists (
      select 1
      from public.teachers t
      where t.profile_id = p.id
    );

  select count(*)
  into remaining_operator_count
  from public.profiles
  where role = 'operator';

  if remaining_operator_count > 0 then
    raise exception
      'operator rows remain after transition: %',
      remaining_operator_count;
  end if;

  select count(*)
  into missing_teacher_row_count
  from public.profiles p
  where p.role = 'teacher'
    and p.organization_id is not null
    and not exists (
      select 1
      from public.teachers t
      where t.profile_id = p.id
    );

  if missing_teacher_row_count > 0 then
    raise exception
      'teacher profiles without teachers row remain: %',
      missing_teacher_row_count;
  end if;
end
$$;
