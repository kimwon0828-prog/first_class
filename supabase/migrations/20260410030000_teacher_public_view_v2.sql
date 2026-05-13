create or replace view teacher_public_profiles
with (security_invoker = false)
as
select
  t.id as teacher_id,
  p.name as teacher_name,
  t.intro,
  t.specialty,
  t.career_years
from teachers t
join profiles p on p.id = t.profile_id
where p.role = 'teacher';

grant select on teacher_public_profiles to anon;
grant select on teacher_public_profiles to authenticated;
