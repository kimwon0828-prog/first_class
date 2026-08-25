-- service_role 은 server-only 경로(getSupabaseServiceRoleClient)에서만 사용된다.
-- fresh DB 와 remote 사이의 posture 차이로 fresh 에서 server 경로가 실행되지 않는 문제를 막기 위해,
-- application 이 실제로 수행하는 operation 만 명시적으로 부여한다.
--
-- remote 는 이미 네 테이블 모두 CRUD 를 보유하고 있으므로 이 GRANT 는 remote 를 좁히지 않는다.
-- 넓은 privilege 정리(REVOKE)와 anon/authenticated posture 는 별도 security-hardening 작업이다.
-- 이 migration 은 anon / authenticated 권한, RLS, policy 를 변경하지 않는다.
-- TRUNCATE / REFERENCES / TRIGGER / MAINTAIN 은 어떤 테이블에도 부여하지 않는다.

-- public/studio read, coordinate sync, 가입·주소수정 승인 반영.
-- 조직 생성은 approve_teacher_signup_request(uuid) SECURITY DEFINER 함수가 수행하므로 INSERT 는 부여하지 않는다.
grant select, update
  on table public.organizations
  to service_role;

-- 가입 신청 read + signup/resubmit/승인 update.
-- 행 생성은 auth.users 트리거 또는 사용자 세션 + RLS 경로이므로 INSERT 는 부여하지 않는다.
grant select, update
  on table public.teacher_signup_requests
  to service_role;

-- 정보수정 요청 생성/조회/승인 및 사업자등록증 업로드 실패 시 보상 삭제.
grant select, insert, update, delete
  on table public.academy_update_requests
  to service_role;

-- 공개 수업 safe read 전용. 수업 CRUD 는 user session client 경로이다.
grant select
  on table public.classes
  to service_role;
