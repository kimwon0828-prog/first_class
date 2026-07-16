do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teachers'
      and column_name = 'public_visibility'
  ) then
    alter table public.teachers
      add column public_visibility jsonb;
  end if;
end
$$;

update public.teachers
set public_visibility =
  jsonb_build_object(
    'name', true,
    'intro', true,
    'subjects', true,
    'targetStudents', true,
    'specialties', true,
    'shortIntro', true,
    'teachingStyle', true
  ) || case
    when jsonb_typeof(public_visibility) = 'object' then public_visibility
    else '{}'::jsonb
  end;

alter table public.teachers
  alter column public_visibility set default jsonb_build_object(
    'name', true,
    'intro', true,
    'subjects', true,
    'targetStudents', true,
    'specialties', true,
    'shortIntro', true,
    'teachingStyle', true
  );

alter table public.teachers
  alter column public_visibility set not null;

create or replace view public.teacher_public_profiles
with (security_invoker = true)
as
select
  t.id as teacher_id,
  case
    when coalesce((t.public_visibility ->> 'name')::boolean, true)
      then coalesce(nullif(trim(t.display_name), ''), nullif(trim(p.name), ''), '이름 미등록 선생님')
    else null
  end as teacher_name,
  case
    when coalesce((t.public_visibility ->> 'intro')::boolean, true)
      then t.intro
    else null
  end as intro,
  t.specialty,
  t.career_years,
  case
    when coalesce((t.public_visibility ->> 'subjects')::boolean, true)
      then t.subjects
    else null
  end as subjects,
  case
    when coalesce((t.public_visibility ->> 'targetStudents')::boolean, true)
      then t.target_students
    else null
  end as target_students,
  case
    when coalesce((t.public_visibility ->> 'specialties')::boolean, true)
      then t.specialties
    else null
  end as specialties,
  case
    when coalesce((t.public_visibility ->> 'shortIntro')::boolean, true)
      then t.short_intro
    else null
  end as short_intro,
  case
    when coalesce((t.public_visibility ->> 'teachingStyle')::boolean, true)
      then t.teaching_style
    else null
  end as teaching_style
from public.teachers t
left join public.profiles p on p.id = t.profile_id
where t.is_active = true
  and (
    t.profile_id is null
    or p.role = 'teacher'
  );

revoke all on table public.teacher_public_profiles from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.teacher_public_profiles
  from authenticated;
grant select on table public.teacher_public_profiles to authenticated;
