-- 종료된 구독은 결제 실패 이벤트로 다시 열리지 않는다.
--
-- 확인된 동작(로컬 프로브):
--   expired 구독에 payment_failed 가 들어오면
--     status: expired → past_due
--     grace_period_end: null → max(지난 기간 종료, 실패 시각) + 3일 = 실패 + 3일
--   즉 이미 끝난 조직이 실패 이벤트 하나로 3일간 유료 기능을 다시 얻는다.
--
-- 갱신 재시도는 우리가 만료 처리를 한 뒤에도 provider 쪽에서 계속 도착할 수 있으므로
-- 실제로 일어나는 경로다.
--
-- 계약.
--   active   → past_due + 첫 유예
--   past_due → 기존 유예 유지(20260910210000)
--   trialing → 기존 계약 유지
--   canceled | expired → ignored. 구독 상태 mutation 0.
--
-- 범위는 실패 이벤트뿐이다. initial_payment_succeeded / renewal_succeeded 는 막지 않는다 —
-- 나중에 재결제나 대사(reconciliation)로 검증된 성공이 들어오면 다시 열려야 한다.
--
-- 결제 이력은 현재 계약대로 남긴다. ignored 는 "구독 상태를 바꾸지 않았다" 는 뜻이고,
-- 실패가 있었다는 사실 자체는 감사(audit)를 위해 organization_payments 에 남는다.
--
-- 함께 고치는 것: 구독 존재 여부를 FOUND 대신 명시 변수로 들고 간다.
-- payment_failed 는 구독 조회와 상태 분기 사이에서 결제 이력을 INSERT 하는데,
-- INSERT 가 FOUND 를 true 로 덮어써 'subscription_missing' 판정이 동작하지 않았다.

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
  v_has_subscription boolean;
  v_now timestamptz := now();
  v_failed_at timestamptz;
  v_grace_period_end timestamptz;
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

  select * into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  -- FOUND 는 뒤따르는 INSERT 가 덮어쓴다. 잠근 시점의 사실을 그대로 들고 간다.
  v_has_subscription := found;

  -- 순서 방어: 이미 더 최신 이벤트를 반영했으면 무시한다.
  if v_has_subscription
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

    -- 새 주기가 시작되면 유예를 지운다. 다음 실패는 새 episode 다.
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
    if not v_has_subscription then
      return jsonb_build_object('mode', 'ignored', 'reason', 'subscription_missing');
    end if;

    -- 종료된 구독은 실패 이벤트로 다시 열지 않는다. 구독 상태를 건드리지 않고 끝낸다.
    if v_subscription.subscription_status in ('canceled', 'expired') then
      return jsonb_build_object(
        'mode', 'ignored',
        'reason', 'subscription_terminal',
        'status', v_subscription.subscription_status
      );
    end if;

    v_failed_at := coalesce(p_event_at, v_now);

    if v_subscription.subscription_status = 'past_due'
      and v_subscription.grace_period_end is not null
    then
      -- 같은 실패 episode 의 재시도다. 유예는 처음 한 번만 만든다.
      v_grace_period_end := v_subscription.grace_period_end;
    elsif v_subscription.current_period_end is null then
      -- 기간을 모르면 유예를 주지 않는다. 실패 이벤트가 접근을 열어 주면 안 된다.
      v_grace_period_end := null;
    else
      -- 이 episode 의 첫 실패. 3일은 이미 결제된 기간이 끝난 뒤부터다.
      v_grace_period_end := greatest(v_subscription.current_period_end, v_failed_at)
        + interval '3 days';
    end if;

    update public.organization_subscriptions
    set subscription_status = 'past_due',
        grace_period_end = v_grace_period_end,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'cancel_scheduled' then
    if not v_has_subscription then
      raise exception 'billing_subscription_not_found';
    end if;

    update public.organization_subscriptions
    set cancel_at_period_end = true,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'cancel_schedule_reverted' then
    if not v_has_subscription then
      raise exception 'billing_subscription_not_found';
    end if;

    if v_subscription.current_period_end is null or v_subscription.current_period_end <= v_now then
      raise exception 'billing_period_already_ended';
    end if;

    update public.organization_subscriptions
    set cancel_at_period_end = false,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'immediate_canceled' then
    if not v_has_subscription then
      raise exception 'billing_subscription_not_found';
    end if;

    update public.organization_subscriptions
    set subscription_status = 'canceled',
        cancel_at_period_end = false,
        grace_period_end = null,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'period_expired' then
    if not v_has_subscription then
      return jsonb_build_object('mode', 'ignored', 'reason', 'subscription_missing');
    end if;

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

revoke all on function public.apply_billing_event(
  uuid, text, timestamptz, text, text, text, text, integer, timestamptz, timestamptz, text
) from public, authenticated, anon;

grant execute on function public.apply_billing_event(
  uuid, text, timestamptz, text, text, text, text, integer, timestamptz, timestamptz, text
) to service_role;
