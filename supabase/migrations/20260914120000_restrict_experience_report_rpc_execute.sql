-- 발행 RPC 의 anon 실행 권한을 거둔다.
--
-- 20260914090000 은 PUBLIC 에서 회수하고 authenticated 에만 부여했는데, Supabase 가
-- public 스키마의 새 함수에 anon / authenticated / service_role 기본 권한을 따로
-- 부여한다. `revoke ... from public` 은 PUBLIC 의사 역할만 건드려 그 명시적 grant 를
-- 지우지 못했다. Production 검증에서 확인했다.
--
-- 지금 당장 위험하지는 않다 — 두 함수 모두 첫 줄에서 auth.uid() 가 null 이면
-- not_authenticated 로 멈춘다. 그래도 로그인하지 않은 요청이 발행 함수를 호출할
-- 이유가 없으므로 권한 자체를 없앤다. 방어는 guard 하나보다 두 겹이 낫다.
--
-- ⚠️ 20260914090000 은 이미 Production 에 적용됐다. 그 파일은 고치지 않는다.

revoke execute on function public.publish_experience_report(uuid, timestamptz) from anon;
revoke execute on function public.withdraw_experience_report(uuid) from anon;

-- 문구 조회 함수도 마찬가지다. 발행된 리포트를 읽는 경로는 RLS 가 지키고,
-- 이 함수는 발행 시점에 서버가 쓰는 것이라 anon 이 부를 일이 없다.
revoke execute on function public.experience_report_observation_label(text) from anon;

-- authenticated 는 그대로 둔다. 실제 권한 판정은 함수 안에서 한다.
grant execute on function public.publish_experience_report(uuid, timestamptz) to authenticated;
grant execute on function public.withdraw_experience_report(uuid) to authenticated;
grant execute on function public.experience_report_observation_label(text) to authenticated;
