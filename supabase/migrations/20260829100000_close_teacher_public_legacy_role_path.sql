-- Phase 3A: teacher_public_profiles 의 legacy 공개 경로(profiles.role = 'teacher')를 닫는다.
--
-- 배경
--   기존 WHERE 는 `t.profile_id is null or p.role = 'teacher'` 였다.
--   두 번째 가지는 role 체계가 teacher/academy 로 갈라지기 전의 잔재이며,
--   지금은 profiles.role='teacher' 가 0건이라 실제로 아무 row 도 통과하지 않는다.
--   그러나 값 자체는 CHECK 제약이 여전히 허용하므로, 누군가 profile role 을
--   'teacher' 로 바꾸면 학원 운영 계정에 딸린 system teacher row 가
--   그 즉시 학부모 화면에 공개된다. 이 트랩을 닫는 것이 이번 migration 의 전부다.
--
-- 데이터 영향
--   production 실측 기준 변경 전후 view row 는 15건으로 동일하다(차이 0).
--   조건을 좁히기만 하므로 새로 노출되는 row 는 존재할 수 없다.
--
-- 임시 조건이라는 점
--   `t.profile_id is null` 은 Phase 3A 의 임시 안전 조건이다.
--   system teacher 7건(PURE_MAPPING 5 / USED_AS_TEACHER 2)이 남아 있는 동안에만 유효하다.
--   Phase 3B/3C 에서 그 7건을 정리해 "모든 teachers row = 실제 명부 row" invariant 가
--   성립하면, Phase 3D 에서 profile_id 조건 자체를 제거해
--   로그인 계정과 연결된 실제 강사(원장 겸 강사 등)도 공개할 수 있게 만든다.
--
-- 보존 대상 (이번 migration 이 바꾸지 않는 것)
--   컬럼 이름/별칭, public_visibility CASE masking 7종,
--   masking 하지 않는 specialty / career_years, security_invoker = true,
--   profiles LEFT JOIN 및 teacher_name 의 p.name 폴백 표현, 권한.
--   DDL 은 이 VIEW 하나뿐이며 teachers / classes / trial_applications /
--   schedule_blocks / teacher_signup_requests 는 일절 건드리지 않는다.

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
  and t.profile_id is null;

-- CREATE OR REPLACE VIEW 는 기존 권한을 보존하지만, 20260708110000 과 20260825122000 이
-- 세워 둔 권한 상태를 명시적으로 고정해 둔다.
revoke all on table public.teacher_public_profiles from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.teacher_public_profiles
  from authenticated;
grant select on table public.teacher_public_profiles to authenticated;
grant select on table public.teacher_public_profiles to service_role;
