-- 학원(organization) 단위 요금제 상태와 내부 전체 권한 override 저장소.
--
-- 두 가지를 일부러 분리한다.
--   organization_subscriptions          결제 사실(billing truth)
--   organization_entitlement_overrides  결제와 무관한 내부 전체 권한
--
-- 실험/개발용 조직에 최고 기능을 열어 주더라도 "결제한 것처럼" 위조하지 않는다.
-- subscription_status 를 active 로 바꾸거나 plan_code 를 pro 로 적는 방식은 금지다.
-- override 는 별도 테이블의 사실이고, 두 값을 합치는 것은 resolver 의 책임이다.
--
-- 이 migration 은 그릇만 만든다.
--   - 실제 PG 연동 컬럼은 넣지 않는다(BILLING-3 이 정한다).
--   - 특정 조직 UUID 를 넣는 data migration 을 포함하지 않는다.
--   - FREE 는 row 로 표현하지 않는다. row 가 없으면 FREE 다.

-- ─────────────────────────────────────────────────────────────
-- 1. 요금제 상태
--
-- FREE 학원은 이 테이블에 row 가 없다. 새로 입점한 학원이 billing row 없이
-- 바로 무료 기능을 쓸 수 있어야 하므로 "무료도 row 가 있어야 한다" 로 만들지 않는다.
-- 따라서 이 테이블의 row 는 사실상 "유료 계약이 존재한다" 는 뜻이다.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.organization_subscriptions (
  organization_id uuid primary key
    references public.organizations(id)
    on delete cascade,
  -- 판매 중인 것은 standard 하나다. pro 는 도메인만 열어 두고 상품으로 노출하지 않는다.
  plan_code text not null,
  subscription_status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_subscriptions_plan_code_check
    check (plan_code in ('standard', 'pro')),
  constraint organization_subscriptions_status_check
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  constraint organization_subscriptions_period_check
    check (
      current_period_start is null
      or current_period_end is null
      or current_period_end > current_period_start
    )
);

comment on table public.organization_subscriptions is
  'organization 단위 요금제 상태. row 가 없으면 FREE 다. 개인 계정 단위 구독은 두지 않는다.';

-- ─────────────────────────────────────────────────────────────
-- 2. 내부 전체 권한 override
--
-- 상업적 entitlement 만 연다. 관리자 권한이나 보안 권한과는 무관하다.
-- expires_at 이 있으면 그 시각까지만 유효하다.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.organization_entitlement_overrides (
  organization_id uuid primary key
    references public.organizations(id)
    on delete cascade,
  full_access boolean not null default false,
  -- 왜 부여했는지 남긴다. 나중에 "이 조직이 왜 무료인데 전부 열려 있나" 를 설명할 수 있어야 한다.
  reason text not null,
  granted_by uuid
    references public.profiles(id)
    on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_entitlement_overrides_reason_check
    check (char_length(btrim(reason)) between 1 and 200)
);

comment on table public.organization_entitlement_overrides is
  '결제와 무관한 내부 전체 권한. 상업 기능만 열며 admin/보안 권한과는 무관하다. 쓰기는 service_role 전용이다.';

-- ─────────────────────────────────────────────────────────────
-- 3. 권한
--
-- 두 테이블 모두 자기 조직 SELECT 만 허용한다.
-- 학원 사용자가 스스로 요금제나 override 를 만들 수 없어야 하므로
-- INSERT / UPDATE / DELETE 권한 자체를 주지 않는다(정책 이전에 grant 로 막는다).
-- 쓰기는 service_role 과 migration/admin 운영 작업만 한다.
-- ─────────────────────────────────────────────────────────────

alter table public.organization_subscriptions enable row level security;
alter table public.organization_entitlement_overrides enable row level security;

revoke all on table public.organization_subscriptions from anon;
revoke all on table public.organization_subscriptions from authenticated;
revoke all on table public.organization_entitlement_overrides from anon;
revoke all on table public.organization_entitlement_overrides from authenticated;

grant select on table public.organization_subscriptions to authenticated;
grant select on table public.organization_entitlement_overrides to authenticated;

drop policy if exists organization_subscriptions_select_same_org on public.organization_subscriptions;
create policy organization_subscriptions_select_same_org
on public.organization_subscriptions
for select
to authenticated
using (
  app.current_org_id() is not null
  and organization_id = app.current_org_id()
);

drop policy if exists organization_entitlement_overrides_select_same_org
  on public.organization_entitlement_overrides;
create policy organization_entitlement_overrides_select_same_org
on public.organization_entitlement_overrides
for select
to authenticated
using (
  app.current_org_id() is not null
  and organization_id = app.current_org_id()
);

-- ─────────────────────────────────────────────────────────────
-- 4. updated_at
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.organization_subscriptions'::regclass
      and tgname = 'set_organization_subscriptions_updated_at'
      and not tgisinternal
  ) then
    create trigger set_organization_subscriptions_updated_at
    before update on public.organization_subscriptions
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.organization_entitlement_overrides'::regclass
      and tgname = 'set_organization_entitlement_overrides_updated_at'
      and not tgisinternal
  ) then
    create trigger set_organization_entitlement_overrides_updated_at
    before update on public.organization_entitlement_overrides
    for each row execute function public.set_updated_at();
  end if;
end
$$;
