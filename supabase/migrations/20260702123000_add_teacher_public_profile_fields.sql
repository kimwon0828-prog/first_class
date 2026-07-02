alter table public.teachers
  add column if not exists subjects text,
  add column if not exists target_students text,
  add column if not exists specialties text,
  add column if not exists short_intro text,
  add column if not exists teaching_style text;

create or replace view public.teacher_public_profiles
with (security_invoker = true)
as
select
  t.id as teacher_id,
  coalesce(nullif(trim(t.display_name), ''), nullif(trim(p.name), ''), '이름 미등록 선생님') as teacher_name,
  t.intro,
  t.specialty,
  t.career_years,
  t.subjects,
  t.target_students,
  t.specialties,
  t.short_intro,
  t.teaching_style
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
