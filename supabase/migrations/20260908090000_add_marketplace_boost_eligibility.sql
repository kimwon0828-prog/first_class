-- 공개 Marketplace 의 Standard 우선 노출 자격.
--
-- 학부모 화면은 로그인 없이 service role 로 조회한다. Studio 의 entitlement resolver
-- (getOrganizationEntitlements)는 로그인 세션과 조직 1개를 전제로 하므로 여기서 쓸 수 없다.
-- 그래서 "지금 우선 노출 자격이 있는 학원" 만 뽑는 전용 source 를 둔다.
--
-- ⚠️ 내부 전체 권한(organization_entitlement_overrides)은 일부러 보지 않는다.
--   내부 개발·데모 조직은 Studio 의 유료 기능을 전부 테스트할 수 있어야 하지만,
--   실제 학부모에게 보이는 공개 목록의 상단을 차지해서는 안 된다.
--   따라서 공개 노출 자격은 결제 사실(organization_subscriptions)만 근거로 한다.
--
-- ⚠️ 상태 해석은 BILLING-2 의 resolver 와 같아야 한다.
--   trialing / active            → 기간과 무관하게 자격 있음
--   canceled / past_due          → current_period_end 가 미래면 그때까지 자격 있음
--   expired · row 없음           → 자격 없음
--   두 곳에 같은 규칙이 존재하므로 scripts/verify-marketplace-boost.ts 가 일치를 고정한다.
--   (기간 경과한 trialing 을 어떻게 볼지는 BILLING-3 의 lifecycle 과제다.)

create or replace view public.marketplace_boosted_organizations as
select
  subscription.organization_id,
  true as boost_eligible
from public.organization_subscriptions as subscription
where subscription.plan_code in ('standard', 'pro')
  and (
    subscription.subscription_status in ('trialing', 'active')
    or (
      subscription.subscription_status in ('canceled', 'past_due')
      and subscription.current_period_end is not null
      and subscription.current_period_end > now()
    )
  );

comment on view public.marketplace_boosted_organizations is
  '공개 Marketplace 우선 노출 자격이 있는 학원. 결제 사실만 근거로 하며 내부 전체 권한은 포함하지 않는다.';

-- 목록 정렬 전용 view.
--
-- PostgREST 는 classes 를 조회하면서 다른 테이블의 컬럼으로 정렬할 수 없다.
-- 정렬을 가져온 뒤 JS 에서 하면 discovery limit(10) 때문에 11번째 Standard 수업이
-- 영원히 노출되지 않는다. 그래서 정렬 키를 미리 붙인 view 를 조회 대상으로 삼는다.
--
-- classes 의 컬럼은 그대로 유지한다(공개 projection 이 쓰는 필드가 바뀌면 안 된다).
-- 여기서 더하는 것은 boost_eligible 하나뿐이며, 요금제·기간 같은 결제 상세는 노출하지 않는다.
create or replace view public.marketplace_ranked_classes as
select
  class_row.*,
  coalesce(boosted.boost_eligible, false) as boost_eligible
from public.classes as class_row
left join public.marketplace_boosted_organizations as boosted
  on boosted.organization_id = class_row.organization_id;

comment on view public.marketplace_ranked_classes is
  '공개 수업 목록 정렬용. classes 컬럼 + boost_eligible. 결제 상세는 담지 않는다.';

-- 공개 목록은 service role 로만 조회한다(public-class-safe-projection 과 같은 경로).
-- 학부모/비로그인 role 에는 노출 자격 자체를 보여줄 이유가 없다.
revoke all on table public.marketplace_boosted_organizations from anon, authenticated;
revoke all on table public.marketplace_ranked_classes from anon, authenticated;
grant select on table public.marketplace_boosted_organizations to service_role;
grant select on table public.marketplace_ranked_classes to service_role;
