-- 상담 저장 RPC 의 anon EXECUTE 를 거둔다.
--
-- create_studio_consultation 은 원래 security invoker 였다. 호출자의 RLS 를
-- 그대로 통과해야 해서, 권한이 조금 넓게 남아 있어도 남의 조직 신청은 애초에
-- 조회 단계에서 걸러졌다.
--
-- P1.1(20260915090000)에서 이 함수를 security definer 로 바꿨다. 학부모 경계를
-- 위해 trial_applications 의 authenticated 권한을 거두면서, 호출자 권한으로
-- 돌던 이 함수가 같이 멈추기 때문이었다. 내부에 이미 같은 검사가 있어서
-- (profiles 의 role 이 academy | admin 인지, 대상 신청이 자기 조직인지)
-- 경계가 넓어지지는 않았다.
--
-- 다만 그때부터 이 함수는 소유자 권한으로 돈다. 그런 함수에 로그인하지 않은
-- 호출자의 실행 권한이 남아 있을 이유가 없다. 지금도 anon 이 부르면 첫 줄의
-- auth.uid() 검사에 걸려 not_authenticated 로 끝나지만, 막히는 것과 부를 수
-- 없는 것은 다른 보장이다.
--
-- anon 권한은 `revoke ... from public` 으로 사라지지 않는다. Supabase 가
-- public schema 의 함수에 anon / authenticated EXECUTE 를 default privilege 로
-- 직접 붙이기 때문이다 — PUBLIC 권한이 아니라 그 role 에 적힌 권한이다.
-- R2 에서 발행 RPC 로 같은 것을 겪었다
-- (20260914120000_restrict_experience_report_rpc_execute.sql).
--
-- ⚠️ 권한만 다룬다. 함수 본문 · security 속성 · search_path · RLS · 데이터는
--    건드리지 않는다. 적용 전 ACL 은
--      postgres=X | anon=X | authenticated=X | service_role=X
--    이고, 적용 후 anon 하나만 빠진다.

-- PUBLIC 은 이미 빠져 있다(20260906090000 에서 거뒀다). 계약을 파일에 남겨
-- 두기 위해 다시 적는다 — 이미 없으므로 아무것도 바뀌지 않는다.
revoke all on function public.create_studio_consultation(
  uuid, uuid, timestamptz, text, text, text, text, text, text, text, timestamptz, boolean, jsonb, text, text
) from public;

revoke all on function public.create_studio_consultation(
  uuid, uuid, timestamptz, text, text, text, text, text, text, text, timestamptz, boolean, jsonb, text, text
) from anon;

-- 남는 권한을 명시한다. 이미 있는 권한이라 새로 열리는 것은 없다.
grant execute on function public.create_studio_consultation(
  uuid, uuid, timestamptz, text, text, text, text, text, text, text, timestamptz, boolean, jsonb, text, text
) to authenticated;
