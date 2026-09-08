-- 유료 접근을 결제 기간으로 닫는다.
--
-- BILLING-2 의 판정은 trialing / active 이면 기간과 무관하게 열려 있었다.
-- lifecycle job 이 상태를 늦게 갱신하거나 실패하면 기간이 끝난 학원이 계속
-- 유료 기능을 쓰게 된다. 상태 갱신과 별개로 기간만으로도 닫히게 한다.
--
-- 함께 정리하는 것.
--   canceled              = 즉시 종료(해지 예약이 아니다)
--   해지 예약             = active + cancel_at_period_end = true
--   past_due              = 갱신 실패, grace_period_end 까지만 열린다
--
-- ⚠️ 같은 판정이 TS resolver(resolveStudioEntitlements)에도 있다.
--    둘이 갈리면 Studio 는 무료인데 Marketplace 는 우선 노출되는 상태가 된다.
--    scripts/verify-billing-lifecycle.ts 가 두 판정의 일치를 고정한다.

-- ─────────────────────────────────────────────────────────────
-- 1. 유예 종료 시각
--
-- current_period_end + 3일로 계산할 수도 있지만, 결제 실패가 기간 종료 전에
-- 일어나면 유예가 실제보다 길어진다(기간이 아직 남았는데 3일이 더 붙는다).
-- 실패 시점에 정한 유예 종료 시각을 그대로 저장한다.
-- ─────────────────────────────────────────────────────────────

alter table public.organization_subscriptions
  add column if not exists grace_period_end timestamptz;

comment on column public.organization_subscriptions.grace_period_end is
  '갱신 실패(past_due) 유예 종료 시각. 다른 상태에서는 NULL 이다.';

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_grace_period_check;

alter table public.organization_subscriptions
  add constraint organization_subscriptions_grace_period_check
  check (
    grace_period_end is null
    or subscription_status = 'past_due'
  );

-- ─────────────────────────────────────────────────────────────
-- 2. 유료 접근 판정 (SQL 단일 정의)
--
-- Marketplace view 와 향후 lifecycle 함수가 같은 함수를 쓴다.
-- TS resolver 와는 verifier 로 동치를 고정한다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.organization_has_paid_access(
  p_status text,
  p_current_period_end timestamptz,
  p_grace_period_end timestamptz,
  p_now timestamptz default now()
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    -- 기간을 모르면 닫는다. 추정하지 않는다.
    when p_status in ('trialing', 'active') then
      p_current_period_end is not null and p_current_period_end > p_now
    -- 갱신 실패는 유예 종료까지만 연다.
    when p_status = 'past_due' then
      p_grace_period_end is not null and p_grace_period_end > p_now
    -- canceled 는 즉시 종료다. 해지 예약은 active + cancel_at_period_end 로 표현한다.
    else false
  end
$$;

comment on function public.organization_has_paid_access(text, timestamptz, timestamptz, timestamptz) is
  '결제 기간 기준 유료 접근 여부. 내부 전체 권한은 포함하지 않는다.';

-- ─────────────────────────────────────────────────────────────
-- 3. Marketplace 우선 노출 자격을 같은 판정으로 맞춘다
-- ─────────────────────────────────────────────────────────────

create or replace view public.marketplace_boosted_organizations as
select
  subscription.organization_id,
  true as boost_eligible
from public.organization_subscriptions as subscription
where subscription.plan_code in ('standard', 'pro')
  and public.organization_has_paid_access(
    subscription.subscription_status,
    subscription.current_period_end,
    subscription.grace_period_end
  );
