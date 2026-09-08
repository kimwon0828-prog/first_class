-- 자동결제 등록(checkout) 의도를 서버에 남긴다.
--
-- Toss 결제창은 인증이 끝나면 successUrl 로 authKey · customerKey 만 돌려준다.
-- 그 두 값만으로는 "누가 시작한 결제인가" 를 알 수 없다. 저장해 둔 의도와 맞춰 보지 않으면
--   - 다른 조직의 callback 을 우리 조직 결제로 반영하거나(cross-org replay)
--   - 같은 callback 이 두 번 들어와 두 번 결제하는
-- 일을 막을 수 없다.
--
-- organization_billing_customers 로는 대신할 수 없다. 그 테이블은 billing_key 가
-- NOT NULL 이라 빌링키가 나오기 전(=결제창을 띄운 시점)에는 행을 만들 수 없다.
--
-- 재생(replay) 방어는 status 를 조건부로 옮기는 것으로 한다.
--   update ... set status='authorized' where id=? and status='pending'
-- 0행이면 이미 처리된 callback 이다.
--
-- anchor_day 는 이 결제로 시작한 구독 주기의 기준일이다. 갱신 때 이 값을 써서
-- 1/31 → 2/28 → 3/31 처럼 결제일이 밀리지 않게 한다. 수동 trialing 조직처럼
-- checkout 을 거치지 않은 구독에는 없으며, 그때는 직전 기간 종료일을 기준으로 삼는다.

create table if not exists public.billing_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'toss',
  -- Toss 에 넘긴 구매자 식별자. 조직 id 가 아니라 난수다.
  customer_key text not null,
  plan_code text not null,
  -- 서버 카탈로그에서 읽은 금액. client 가 보낸 값이 아니다.
  amount integer not null,
  -- 최초 결제의 Toss 주문번호와 원장 멱등 키. 시작 시점에 확정한다.
  order_id text not null,
  payment_idempotency_key text not null,
  status text not null default 'pending',
  anchor_day smallint,
  requested_by uuid references public.profiles(id) on delete set null,
  authorized_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_checkout_sessions_provider_check check (provider = 'toss'),
  constraint billing_checkout_sessions_plan_code_check check (plan_code in ('standard', 'pro')),
  constraint billing_checkout_sessions_amount_check check (amount > 0),
  constraint billing_checkout_sessions_status_check
    check (status in ('pending', 'authorized', 'completed', 'failed', 'expired')),
  constraint billing_checkout_sessions_anchor_day_check
    check (anchor_day is null or anchor_day between 1 and 31)
);

comment on table public.billing_checkout_sessions is
  '자동결제 등록 의도. callback 의 조직·재생 검증과 최초 결제 멱등의 기준이다.';
comment on column public.billing_checkout_sessions.anchor_day is
  '이 결제로 시작한 구독 주기의 기준일(KST). 갱신 결제일이 밀리지 않게 한다.';

create unique index if not exists billing_checkout_sessions_customer_key_key
  on public.billing_checkout_sessions (provider, customer_key);
create unique index if not exists billing_checkout_sessions_order_id_key
  on public.billing_checkout_sessions (provider, order_id);
create unique index if not exists billing_checkout_sessions_idempotency_key_key
  on public.billing_checkout_sessions (payment_idempotency_key);
create index if not exists billing_checkout_sessions_organization_idx
  on public.billing_checkout_sessions (organization_id, created_at desc);
-- 갱신 기준일 조회: 조직의 가장 최근 완료 세션.
create index if not exists billing_checkout_sessions_completed_idx
  on public.billing_checkout_sessions (organization_id, completed_at desc)
  where status = 'completed';

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.billing_checkout_sessions'::regclass
      and tgname = 'set_billing_checkout_sessions_updated_at'
  ) then
    create trigger set_billing_checkout_sessions_updated_at
    before update on public.billing_checkout_sessions
    for each row execute function public.set_updated_at();
  end if;
end
$$;

-- checkout 의도는 서버만 다룬다. 학원 계정이 직접 읽거나 만들 이유가 없다.
alter table public.billing_checkout_sessions enable row level security;

revoke all on table public.billing_checkout_sessions from anon, authenticated;
grant all on table public.billing_checkout_sessions to service_role;
