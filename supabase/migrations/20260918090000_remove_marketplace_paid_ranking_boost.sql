-- 공개 Marketplace 의 유료 우선 노출을 없앤다.
--
-- 정책(AGENTS.md 요금제 정책).
--   학부모가 보는 순서는 학원이 돈을 냈는지와 무관하다.
--   Marketplace 입점은 무료·스탠다드 공통이고, 스탠다드가 파는 것은
--   학부모 리포트 발행과 전환 분석이지 검색 결과의 윗자리가 아니다.
--
-- 지금까지의 구조.
--   marketplace_boosted_organizations  결제 사실로 "우대 자격 있는 학원" 을 뽑던 view
--   marketplace_ranked_classes         classes + boost_eligible 정렬 키를 붙이던 view
--   공개 목록이 `order by boost_eligible desc, created_at desc` 로 조회했다.
--
-- 두 view 를 모두 없앤다. boost_eligible 을 false 로 고정해 껍데기만 남기지 않는 이유는,
-- 정렬 키가 남아 있는 한 order by 한 줄로 우대가 되살아나기 때문이다. 조회할 view 가
-- 없으면 그 실수를 할 수 없다.
--
-- ⚠️ 배포 순서와 무관하게 안전하다.
--    이 migration 이 코드보다 먼저 적용돼도, 이전 버전 앱은 ranked 조회 실패를
--    organic(= classes) 목록으로 되돌리는 fallback 을 이미 갖고 있다. 목록이 비지 않는다.
--    코드가 먼저 배포되면 앱은 classes 를 직접 읽으므로 이 view 를 쓰지 않는다.
--
-- ⚠️ organization_has_paid_access() 는 남긴다.
--    이 migration 으로 SQL consumer 가 0이 되지만, billing lifecycle 의 기간 판정
--    규칙을 SQL 쪽에 고정해 둔 정의이고 TS resolver 와의 동치를 verifier 가 검사한다.
--    Marketplace 정리를 핑계로 billing 함수를 함께 지우지 않는다.
--
-- classes 테이블과 그 RLS 는 건드리지 않는다. 입점·공개 노출은 그대로다.

drop view if exists public.marketplace_ranked_classes;
drop view if exists public.marketplace_boosted_organizations;
