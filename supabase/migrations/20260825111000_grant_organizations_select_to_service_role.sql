-- 20260624183000_secure_organizations_and_teacher_public_profiles.sql 이 organizations 권한을
-- 잠글 때 service_role 의 SELECT 를 명시적으로 복구하지 않아, fresh DB 와 remote 사이에
-- service-role permission posture 가 어긋나 있었다.
-- 공개 class/organization 조회는 이미 service-role 서버 경로를 사용하고 있으므로,
-- 그 posture 를 migration 에 명시해 fresh DB 와 remote 를 동일하게 만든다.
--
-- SELECT 만 부여한다. RLS, 정책, anon/authenticated 권한은 변경하지 않는다.
grant select on table public.organizations to service_role;
