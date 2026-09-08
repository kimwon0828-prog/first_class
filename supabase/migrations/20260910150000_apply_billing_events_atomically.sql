-- 결제 이벤트를 하나의 transaction 으로 반영한다.
--
-- 이 함수 하나가 구독 상태를 바꾸는 유일한 경로다.
--   최초 결제 검증 · 갱신 결과 · 검증된 webhook · 대사(reconciliation)
-- 모두 같은 함수를 쓴다. 경로마다 다른 상태 전이 로직을 두지 않는다.
--
-- 지키는 것.
--   멱등    같은 idempotency_key 는 두 번 반영되지 않는다.
--   순서    늦게 도착한 오래된 이벤트가 최신 상태를 덮지 않는다.
--   원자성  결제 이력과 구독 상태가 함께 바뀐다.
--
-- provider 원문 상태는 여기 들어오지 않는다. 호출자가 도메인 이벤트로 정규화한다.

-- 마지막으로 반영한 이벤트 시각. 순서 뒤바뀜 방어의 기준이다.
alter table public.organization_subscriptions
  add column if not exists last_billing_event_at timestamptz;

comment on column public.organization_subscriptions.last_billing_event_at is
  '마지막으로 반영한 결제 이벤트의 provider 발생 시각. 늦게 온 과거 이벤트를 무시하는 기준이다.';

create or replace function public.apply_billing_event(
  p_organization_id uuid,
  p_event_type text,
  p_event_at timestamptz,
  p_idempotency_key text default null,
  p_provider text default 'toss',
  p_provider_payment_id text default null,
  p_plan_code text default 'standard',
  p_amount integer default null,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null,
  p_grace_period_end timestamptz default null,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_existing public.organization_payments%rowtype;
  v_now timestamptz := now();
begin
  if p_organization_id is null then
    raise exception 'billing_organization_required';
  end if;

  if p_event_type not in (
    'initial_payment_succeeded',
    'renewal_succeeded',
    'payment_failed',
    'billing_method_invalid',
    'cancel_scheduled',
    'cancel_schedule_reverted',
    'immediate_canceled',
    'period_expired'
  ) then
    raise exception 'billing_event_type_not_supported';
  end if;

  -- 결제 이벤트는 멱등 키가 필수다. 같은 키가 이미 반영됐으면 아무것도 하지 않는다.
  if p_event_type in ('initial_payment_succeeded', 'renewal_succeeded', 'payment_failed') then
    if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
      raise exception 'billing_idempotency_key_required';
    end if;

    select * into v_existing
    from public.organization_payments
    where idempotency_key = p_idempotency_key;

    if found then
      if v_existing.organization_id <> p_organization_id then
        raise exception 'billing_idempotency_key_conflict';
      end if;

      return jsonb_build_object('mode', 'duplicate', 'paymentId', v_existing.id);
    end if;
  end if;

  -- 구독 행을 잠근다. 없으면(최초 결제) 뒤에서 만든다.
  select * into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  -- 순서 방어: 이미 더 최신 이벤트를 반영했으면 무시한다.
  if found
    and v_subscription.last_billing_event_at is not null
    and p_event_at is not null
    and p_event_at <= v_subscription.last_billing_event_at
  then
    return jsonb_build_object('mode', 'stale', 'status', v_subscription.subscription_status);
  end if;

  -- ── 결제 이력 ────────────────────────────────────────────
  if p_event_type in ('initial_payment_succeeded', 'renewal_succeeded') then
    insert into public.organization_payments (
      organization_id, provider, provider_payment_id, idempotency_key,
      plan_code, amount, status, period_start, period_end,
      provider_created_at, paid_at
    )
    values (
      p_organization_id, p_provider, p_provider_payment_id, p_idempotency_key,
      p_plan_code, p_amount, 'succeeded', p_period_start, p_period_end,
      p_event_at, coalesce(p_event_at, v_now)
    );
  elsif p_event_type = 'payment_failed' then
    insert into public.organization_payments (
      organization_id, provider, provider_payment_id, idempotency_key,
      plan_code, amount, status, provider_created_at, failed_at, failure_code
    )
    values (
      p_organization_id, p_provider, p_provider_payment_id, p_idempotency_key,
      p_plan_code, p_amount, 'failed', p_event_at, coalesce(p_event_at, v_now), p_failure_code
    );
  end if;

  -- ── 구독 상태 ────────────────────────────────────────────
  if p_event_type in ('initial_payment_succeeded', 'renewal_succeeded') then
    if p_period_start is null or p_period_end is null then
      raise exception 'billing_period_required';
    end if;

    -- 최초 결제든 갱신이든 같은 행을 갱신한다. 조직당 구독은 하나다.
    insert into public.organization_subscriptions (
      organization_id, plan_code, subscription_status,
      current_period_start, current_period_end,
      cancel_at_period_end, grace_period_end, last_billing_event_at
    )
    values (
      p_organization_id, p_plan_code, 'active',
      p_period_start, p_period_end,
      false, null, p_event_at
    )
    on conflict (organization_id) do update
      set plan_code = excluded.plan_code,
          subscription_status = 'active',
          current_period_start = excluded.current_period_start,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = false,
          grace_period_end = null,
          last_billing_event_at = excluded.last_billing_event_at;

  elsif p_event_type in ('payment_failed', 'billing_method_invalid') then
    if not found then
      -- 구독이 없는데 실패 이벤트가 온 경우다. 이력만 남기고 상태는 만들지 않는다.
      return jsonb_build_object('mode', 'ignored', 'reason', 'subscription_missing');
    end if;

    update public.organization_subscriptions
    set subscription_status = 'past_due',
        grace_period_end = p_grace_period_end,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'cancel_scheduled' then
    if not found then
      raise exception 'billing_subscription_not_found';
    end if;

    -- 해지 예약은 상태를 바꾸지 않는다. 기간 끝까지 그대로 쓴다.
    update public.organization_subscriptions
    set cancel_at_period_end = true,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'cancel_schedule_reverted' then
    if not found then
      raise exception 'billing_subscription_not_found';
    end if;

    -- 기간이 이미 끝났으면 되돌릴 수 없다. 새 결제가 필요하다.
    if v_subscription.current_period_end is null or v_subscription.current_period_end <= v_now then
      raise exception 'billing_period_already_ended';
    end if;

    update public.organization_subscriptions
    set cancel_at_period_end = false,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'immediate_canceled' then
    if not found then
      raise exception 'billing_subscription_not_found';
    end if;

    update public.organization_subscriptions
    set subscription_status = 'canceled',
        cancel_at_period_end = false,
        grace_period_end = null,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'period_expired' then
    if not found then
      return jsonb_build_object('mode', 'ignored', 'reason', 'subscription_missing');
    end if;

    -- 상태 정규화일 뿐이다. 이미 기간으로 접근은 닫혀 있다.
    update public.organization_subscriptions
    set subscription_status = 'expired',
        grace_period_end = null,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;
  end if;

  select * into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id;

  return jsonb_build_object(
    'mode', 'applied',
    'status', v_subscription.subscription_status,
    'currentPeriodEnd', v_subscription.current_period_end,
    'cancelAtPeriodEnd', v_subscription.cancel_at_period_end,
    'gracePeriodEnd', v_subscription.grace_period_end
  );
end;
$$;

-- 서버(서비스 롤)만 부른다. 학원 계정이 자기 구독을 바꿀 수 없어야 한다.
revoke all on function public.apply_billing_event(
  uuid, text, timestamptz, text, text, text, text, integer, timestamptz, timestamptz, timestamptz, text
) from public, authenticated, anon;

grant execute on function public.apply_billing_event(
  uuid, text, timestamptz, text, text, text, text, integer, timestamptz, timestamptz, timestamptz, text
) to service_role;
