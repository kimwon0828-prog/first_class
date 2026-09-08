-- 결제 이력 · 결제수단 · webhook 이벤트 저장소.
--
-- 세 가지를 일부러 나눈다.
--   organization_subscriptions      지금 상태 (한 조직 한 행)
--   organization_payments           결제 이력 (여러 행)
--   organization_billing_customers  결제수단 credential
--   billing_webhook_events          provider 이벤트 수신 기록(멱등 근거)
--
-- 상태와 이력을 한 테이블에 섞으면 "결제는 됐는데 권한이 안 열렸다" 를 사후에
-- 확인할 수 없다. 대사(reconciliation)의 근거가 이력이다.
--
-- 이 migration 은 그릇만 만든다. 실제 PG 호출은 BILLING-3B 다.

-- ─────────────────────────────────────────────────────────────
-- 1. 결제 이력
-- ─────────────────────────────────────────────────────────────

create table if not exists public.organization_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  provider text not null,
  -- provider 가 만든 결제 식별자. provider 안에서만 유일하다.
  provider_payment_id text,
  provider_transaction_id text,
  -- 우리가 만든 멱등 키. 같은 키로 두 번 결제되지 않게 한다.
  idempotency_key text not null,
  plan_code text not null,
  amount integer not null,
  currency text not null default 'KRW',
  status text not null,
  -- 이 결제가 사 준 이용 기간.
  period_start timestamptz,
  period_end timestamptz,
  provider_created_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_payments_provider_check check (provider in ('toss')),
  constraint organization_payments_plan_code_check check (plan_code in ('standard', 'pro')),
  constraint organization_payments_status_check
    check (status in ('pending', 'succeeded', 'failed', 'canceled', 'refunded')),
  constraint organization_payments_amount_check check (amount > 0),
  constraint organization_payments_currency_check check (currency = 'KRW'),
  constraint organization_payments_period_check
    check (period_start is null or period_end is null or period_end > period_start)
);

-- 같은 멱등 키로 결제가 두 번 만들어지지 않는다.
create unique index if not exists organization_payments_idempotency_key_uidx
  on public.organization_payments (idempotency_key);
-- 같은 provider 결제가 두 번 기록되지 않는다.
create unique index if not exists organization_payments_provider_payment_uidx
  on public.organization_payments (provider, provider_payment_id)
  where provider_payment_id is not null;
create index if not exists organization_payments_organization_created_idx
  on public.organization_payments (organization_id, created_at desc);

comment on table public.organization_payments is
  '구독 결제 이력. 현재 구독 상태(organization_subscriptions)와 분리해 대사·CS 근거로 쓴다.';

-- ─────────────────────────────────────────────────────────────
-- 2. 결제수단
--
-- billing key 는 카드번호가 아니어도 결제를 일으킬 수 있는 credential 이다.
-- 카드 원번호 · CVC · 유효기간 원본은 저장하지 않는다(표시용 마스킹만).
-- ─────────────────────────────────────────────────────────────

create table if not exists public.organization_billing_customers (
  organization_id uuid primary key
    references public.organizations(id)
    on delete cascade,
  provider text not null,
  provider_customer_key text not null,
  billing_key text not null,
  billing_key_status text not null default 'active',
  card_company text,
  card_number_masked text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_billing_customers_provider_check check (provider in ('toss')),
  constraint organization_billing_customers_status_check
    check (billing_key_status in ('active', 'invalid', 'removed')),
  -- 마스킹된 표시값만 허용한다. 숫자만 12자리 이상이면 원번호일 수 있다.
  constraint organization_billing_customers_card_masked_check
    check (
      card_number_masked is null
      or card_number_masked ~ '\*'
    )
);

comment on table public.organization_billing_customers is
  '조직별 결제수단. billing_key 는 결제 credential 이라 authenticated 에 노출하지 않는다.';

-- ─────────────────────────────────────────────────────────────
-- 3. webhook 이벤트
--
-- 같은 이벤트가 여러 번 와도 한 번만 처리하기 위한 기록이다.
-- payload 전체를 저장하지 않는다 — 필요한 식별값만 둔다.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  provider_created_at timestamptz,
  organization_id uuid
    references public.organizations(id)
    on delete set null,
  provider_payment_id text,
  processing_status text not null default 'received',
  processed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  constraint billing_webhook_events_provider_check check (provider in ('toss')),
  constraint billing_webhook_events_status_check
    check (processing_status in ('received', 'processed', 'ignored', 'failed'))
);

create unique index if not exists billing_webhook_events_provider_event_uidx
  on public.billing_webhook_events (provider, provider_event_id);

comment on table public.billing_webhook_events is
  'provider webhook 수신 기록. 같은 이벤트를 두 번 처리하지 않기 위한 멱등 근거다.';

-- ─────────────────────────────────────────────────────────────
-- 4. 권한
--
-- 결제 이력은 향후 Studio 에서 보여줄 수 있으므로 자기 조직 SELECT 만 연다.
-- 결제수단과 webhook 기록은 authenticated 가 읽을 이유가 없다.
-- 쓰기는 전부 service_role / billing 함수만 한다.
-- ─────────────────────────────────────────────────────────────

alter table public.organization_payments enable row level security;
alter table public.organization_billing_customers enable row level security;
alter table public.billing_webhook_events enable row level security;

revoke all on table public.organization_payments from anon, authenticated;
revoke all on table public.organization_billing_customers from anon, authenticated;
revoke all on table public.billing_webhook_events from anon, authenticated;

grant select on table public.organization_payments to authenticated;

drop policy if exists organization_payments_select_same_org on public.organization_payments;
create policy organization_payments_select_same_org
on public.organization_payments
for select
to authenticated
using (
  app.current_org_id() is not null
  and organization_id = app.current_org_id()
);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.organization_payments'::regclass
      and tgname = 'set_organization_payments_updated_at'
      and not tgisinternal
  ) then
    create trigger set_organization_payments_updated_at
    before update on public.organization_payments
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.organization_billing_customers'::regclass
      and tgname = 'set_organization_billing_customers_updated_at'
      and not tgisinternal
  ) then
    create trigger set_organization_billing_customers_updated_at
    before update on public.organization_billing_customers
    for each row execute function public.set_updated_at();
  end if;
end
$$;
