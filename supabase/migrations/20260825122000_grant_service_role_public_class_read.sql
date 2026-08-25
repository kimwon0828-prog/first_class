-- /classes public server read graph 를 fresh DB 에서도 Remote 와 동일하게 실행하기 위한 정합화.
-- service_role 은 server-only 경로에서만 사용되며, 이 경로가 실제 수행하는 것은 SELECT 뿐이다.
-- Remote 는 이미 6개 객체 모두 service_role SELECT 를 보유하고 있으므로 멱등 GRANT 가 된다.
--
-- anon / authenticated 권한, RLS, policy, view 정의는 변경하지 않는다.
-- INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER / MAINTAIN 은 부여하지 않는다.

-- /classes 카드 일정 요약
grant select on table public.class_schedules to service_role;

-- 공개 클래스 과목 마스터 라벨 (attachSubjectMaster 가 service-role client 로 조회)
grant select on table public.subject_categories to service_role;
grant select on table public.subjects to service_role;

-- 공개 선생님 프로필.
-- public.teacher_public_profiles 는 security_invoker = true VIEW 이므로
-- 뷰 SELECT 만으로는 부족하고 하위 teachers / profiles SELECT 가 함께 필요하다.
-- (뷰를 SECURITY DEFINER 로 바꾸거나 정의를 수정하지 않는다.)
grant select on table public.teacher_public_profiles to service_role;
grant select on table public.teachers to service_role;
grant select on table public.profiles to service_role;
