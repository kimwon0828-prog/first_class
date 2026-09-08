-- 갱신 실패 유예가 이미 결제된 기간을 잘라먹지 않게 한다.
--
-- 이전 계약은 유예를 "실패 시각 + 3일" 로 잡았다. 갱신 결제가 이용기간이 끝나기 전에
-- 실패하면 이미 결제된 기간보다 접근이 먼저 닫힌다.
--
--   current_period_end = 10-10, 실패 = 10-05  →  이전: 10-08 종료(10-10 까지의 권리 침해)
--
-- 3일은 결제된 기간 "이후" 의 추가 유예다. 따라서 기준점은 둘 중 늦은 쪽이다.
--
--   grace_period_end = max(current_period_end, failure_at) + 3 days
--
-- 기간을 모르면(current_period_end is null) 유예를 주지 않는다.
-- 그 구독은 이미 기간 판정으로 닫혀 있으므로, 실패 이벤트가 오히려 접근을 열어 주면 안 된다.
--
-- 유예 시각은 호출자가 정하지 않는다. 잠근 구독 행을 보고 DB 가 계산한다 —
-- 그래야 provider/경로마다 다른 값이 들어오지 않는다.

drop function if exists public.apply_billing_event(
  uuid, text, timestamptz, text, text, text, text, integer, timestamptz, timestamptz, timestamptz, text
);

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
      return jsonb_build_object('mode', 'ignored', 'reason', 'subscription_missing');
    end if;

    v_failed_at := coalesce(p_event_at, v_now);

    -- 이미 결제된 기간이 끝난 뒤부터 3일이다. 기간을 모르면 유예를 주지 않는다.
    v_grace_period_end := case
      when v_subscription.current_period_end is null then null
      else greatest(v_subscription.current_period_end, v_failed_at) + interval '3 days'
    end;

    update public.organization_subscriptions
    set subscription_status = 'past_due',
        grace_period_end = v_grace_period_end,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'cancel_scheduled' then
    if not found then
      raise exception 'billing_subscription_not_found';
    end if;

    update public.organization_subscriptions
    set cancel_at_period_end = true,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'cancel_schedule_reverted' then
    if not found then
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
