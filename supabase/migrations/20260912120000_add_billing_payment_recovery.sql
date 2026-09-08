-- BILLING-3B.1: 결제 시도를 PG 호출 전에 저장하고, checkout/갱신을 재개할 수 있게 한다.

alter table public.organization_payments
  add column if not exists provider_order_id text,
  add column if not exists provider_idempotency_key text,
  add column if not exists attempt_kind text,
  add column if not exists attempt_number smallint,
  add column if not exists checkout_session_id uuid
    references public.billing_checkout_sessions(id) on delete set null,
  add column if not exists billing_anchor_day smallint;

alter table public.organization_payments
  add constraint organization_payments_attempt_kind_check
    check (attempt_kind is null or attempt_kind in ('initial', 'renewal')),
  add constraint organization_payments_attempt_status_check
    check (attempt_kind is null or status in ('pending', 'succeeded', 'failed')),
  add constraint organization_payments_attempt_number_check
    check (attempt_number is null or attempt_number >= 0),
  add constraint organization_payments_attempt_link_check
    check (
      attempt_kind is null
      or (attempt_kind = 'initial' and attempt_number = 0 and checkout_session_id is not null)
      or (attempt_kind = 'renewal' and checkout_session_id is null)
    ),
  add constraint organization_payments_anchor_day_check
    check (billing_anchor_day is null or billing_anchor_day between 1 and 31),
  add constraint organization_payments_pending_identity_check
    check (
      status <> 'pending'
      or (
        provider_order_id is not null
        and provider_idempotency_key is not null
        and attempt_kind is not null
        and period_start is not null
        and period_end is not null
      )
    );

create unique index if not exists organization_payments_provider_order_uidx
  on public.organization_payments (provider, provider_order_id)
  where provider_order_id is not null;
create unique index if not exists organization_payments_provider_idempotency_uidx
  on public.organization_payments (provider, provider_idempotency_key)
  where provider_idempotency_key is not null;
create index if not exists organization_payments_pending_created_idx
  on public.organization_payments (created_at)
  where status = 'pending';

alter table public.billing_checkout_sessions
  add column if not exists billing_key_issue_idempotency_key text,
  add column if not exists processing_token uuid,
  add column if not exists processing_started_at timestamptz;

update public.billing_checkout_sessions
set billing_key_issue_idempotency_key = 'billing-key:' || id::text
where billing_key_issue_idempotency_key is null;

alter table public.billing_checkout_sessions
  alter column billing_key_issue_idempotency_key set not null,
  add constraint billing_checkout_sessions_issue_idempotency_length_check
    check (char_length(billing_key_issue_idempotency_key) between 1 and 300);

create unique index if not exists billing_checkout_sessions_issue_idempotency_uidx
  on public.billing_checkout_sessions (billing_key_issue_idempotency_key);

alter table public.organization_subscriptions
  add column if not exists billing_anchor_day smallint;

alter table public.organization_subscriptions
  add constraint organization_subscriptions_billing_anchor_day_check
    check (billing_anchor_day is null or billing_anchor_day between 1 and 31);

-- 기존 checkout 구독도 가장 최근 완료 세션의 KST 기준일을 canonical 구독 행으로 옮긴다.
update public.organization_subscriptions s
set billing_anchor_day = (
  select c.anchor_day
  from public.billing_checkout_sessions c
  where c.organization_id = s.organization_id
    and c.status = 'completed'
    and c.anchor_day is not null
  order by c.completed_at desc
  limit 1
)
where s.billing_anchor_day is null
  and exists (
    select 1 from public.billing_checkout_sessions c
    where c.organization_id = s.organization_id
      and c.status = 'completed'
      and c.anchor_day is not null
  );

-- 기존 결제 이벤트 RPC를 pending-aware 버전으로 교체한다.
-- 같은 attempt의 pending만 final로 바뀔 수 있고, final은 다시 열리지 않는다.
drop function public.apply_billing_event(
  uuid, text, timestamptz, text, text, text, text, integer, timestamptz, timestamptz, text
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
  p_failure_code text default null,
  p_provider_order_id text default null,
  p_provider_idempotency_key text default null,
  p_attempt_kind text default null,
  p_attempt_number smallint default null,
  p_checkout_session_id uuid default null,
  p_billing_anchor_day smallint default null
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
  v_payment_was_pending boolean := false;
  v_verified_correction boolean := false;
begin
  if p_organization_id is null then raise exception 'billing_organization_required'; end if;
  if p_event_type not in (
    'initial_payment_succeeded', 'renewal_succeeded', 'payment_failed',
    'billing_method_invalid', 'cancel_scheduled', 'cancel_schedule_reverted',
    'immediate_canceled', 'period_expired'
  ) then raise exception 'billing_event_type_not_supported'; end if;

  if p_event_type in ('initial_payment_succeeded', 'renewal_succeeded', 'payment_failed') then
    if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
      raise exception 'billing_idempotency_key_required';
    end if;

    select * into v_existing
    from public.organization_payments
    where idempotency_key = p_idempotency_key
    for update;

    if found then
      if v_existing.organization_id <> p_organization_id
        or (p_provider_order_id is not null and v_existing.provider_order_id is distinct from p_provider_order_id)
        or (p_provider_idempotency_key is not null and v_existing.provider_idempotency_key is distinct from p_provider_idempotency_key)
        or (p_attempt_kind is not null and v_existing.attempt_kind is distinct from p_attempt_kind)
        or (p_plan_code is not null and v_existing.plan_code is distinct from p_plan_code)
        or (p_amount is not null and v_existing.amount is distinct from p_amount)
      then
        raise exception 'billing_idempotency_key_conflict';
      end if;

      if v_existing.status = 'failed'
        and p_event_type in ('initial_payment_succeeded', 'renewal_succeeded')
        and p_provider_payment_id is not null
      then
        -- provider API로 검증된 성공만 확정 실패를 교정할 수 있다.
        v_payment_was_pending := true;
        v_verified_correction := true;
      elsif v_existing.status <> 'pending' then
        if (v_existing.status = 'succeeded' and p_event_type in ('initial_payment_succeeded', 'renewal_succeeded'))
          or (v_existing.status = 'failed' and p_event_type = 'payment_failed')
        then
          return jsonb_build_object('mode', 'duplicate', 'paymentId', v_existing.id);
        end if;
        return jsonb_build_object('mode', 'terminal_conflict', 'paymentId', v_existing.id, 'status', v_existing.status);
      else
        v_payment_was_pending := true;
      end if;
    end if;
  end if;

  select * into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;
  v_has_subscription := found;

  -- 기존 계약: 사전 attempt가 없는 stale 이벤트는 이력도 만들지 않는다.
  if not v_payment_was_pending
    and v_has_subscription
    and v_subscription.last_billing_event_at is not null
    and p_event_at is not null
    and p_event_at <= v_subscription.last_billing_event_at
  then
    return jsonb_build_object('mode', 'stale', 'status', v_subscription.subscription_status);
  end if;

  -- 결제 행은 구독 이벤트가 stale이어도 반드시 final로 정리한다.
  if p_event_type in ('initial_payment_succeeded', 'renewal_succeeded') then
    if p_period_start is null or p_period_end is null then raise exception 'billing_period_required'; end if;
    if v_payment_was_pending then
      update public.organization_payments
      set status = 'succeeded', provider_payment_id = p_provider_payment_id,
          provider_created_at = p_event_at, paid_at = coalesce(p_event_at, v_now),
          period_start = p_period_start, period_end = p_period_end,
          billing_anchor_day = coalesce(p_billing_anchor_day, billing_anchor_day),
          failure_code = null, failed_at = null
      where id = v_existing.id;
    else
      insert into public.organization_payments (
        organization_id, provider, provider_payment_id, idempotency_key,
        provider_order_id, provider_idempotency_key, attempt_kind, attempt_number,
        checkout_session_id, billing_anchor_day, plan_code, amount, status,
        period_start, period_end, provider_created_at, paid_at
      ) values (
        p_organization_id, p_provider, p_provider_payment_id, p_idempotency_key,
        p_provider_order_id, p_provider_idempotency_key, p_attempt_kind, p_attempt_number,
        p_checkout_session_id, p_billing_anchor_day, p_plan_code, p_amount, 'succeeded',
        p_period_start, p_period_end, p_event_at, coalesce(p_event_at, v_now)
      );
    end if;
  elsif p_event_type = 'payment_failed' then
    if v_payment_was_pending then
      update public.organization_payments
      set status = 'failed', provider_payment_id = p_provider_payment_id,
          provider_created_at = p_event_at, failed_at = coalesce(p_event_at, v_now),
          failure_code = p_failure_code
      where id = v_existing.id;
    else
      insert into public.organization_payments (
        organization_id, provider, provider_payment_id, idempotency_key,
        provider_order_id, provider_idempotency_key, attempt_kind, attempt_number,
        checkout_session_id, billing_anchor_day, plan_code, amount, status,
        period_start, period_end, provider_created_at, failed_at, failure_code
      ) values (
        p_organization_id, p_provider, p_provider_payment_id, p_idempotency_key,
        p_provider_order_id, p_provider_idempotency_key, p_attempt_kind, p_attempt_number,
        p_checkout_session_id, p_billing_anchor_day, p_plan_code, p_amount, 'failed',
        p_period_start, p_period_end, p_event_at, coalesce(p_event_at, v_now), p_failure_code
      );
    end if;
  end if;

  if not v_verified_correction
    and v_has_subscription and v_subscription.last_billing_event_at is not null
    and p_event_at is not null and p_event_at <= v_subscription.last_billing_event_at
  then
    return jsonb_build_object('mode', 'stale', 'status', v_subscription.subscription_status);
  end if;

  if p_event_type in ('initial_payment_succeeded', 'renewal_succeeded') then
    insert into public.organization_subscriptions (
      organization_id, plan_code, subscription_status, current_period_start,
      current_period_end, cancel_at_period_end, grace_period_end,
      last_billing_event_at, billing_anchor_day
    ) values (
      p_organization_id, p_plan_code, 'active', p_period_start,
      p_period_end, false, null, p_event_at, p_billing_anchor_day
    )
    on conflict (organization_id) do update set
      plan_code = excluded.plan_code,
      subscription_status = 'active',
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = false,
      grace_period_end = null,
      last_billing_event_at = excluded.last_billing_event_at,
      billing_anchor_day = coalesce(excluded.billing_anchor_day, organization_subscriptions.billing_anchor_day);

  elsif p_event_type in ('payment_failed', 'billing_method_invalid') then
    if not v_has_subscription then
      return jsonb_build_object('mode', 'ignored', 'reason', 'subscription_missing');
    end if;
    if v_subscription.subscription_status in ('canceled', 'expired') then
      return jsonb_build_object('mode', 'ignored', 'reason', 'subscription_terminal', 'status', v_subscription.subscription_status);
    end if;
    v_failed_at := coalesce(p_event_at, v_now);
    if v_subscription.subscription_status = 'past_due' and v_subscription.grace_period_end is not null then
      v_grace_period_end := v_subscription.grace_period_end;
    elsif v_subscription.current_period_end is null then
      v_grace_period_end := null;
    else
      v_grace_period_end := greatest(v_subscription.current_period_end, v_failed_at) + interval '3 days';
    end if;
    update public.organization_subscriptions
    set subscription_status = 'past_due', grace_period_end = v_grace_period_end,
        last_billing_event_at = p_event_at
    where organization_id = p_organization_id;

  elsif p_event_type = 'cancel_scheduled' then
    if not v_has_subscription then raise exception 'billing_subscription_not_found'; end if;
    update public.organization_subscriptions set cancel_at_period_end = true,
      last_billing_event_at = p_event_at where organization_id = p_organization_id;
  elsif p_event_type = 'cancel_schedule_reverted' then
    if not v_has_subscription then raise exception 'billing_subscription_not_found'; end if;
    if v_subscription.current_period_end is null or v_subscription.current_period_end <= v_now then
      raise exception 'billing_period_already_ended';
    end if;
    update public.organization_subscriptions set cancel_at_period_end = false,
      last_billing_event_at = p_event_at where organization_id = p_organization_id;
  elsif p_event_type = 'immediate_canceled' then
    if not v_has_subscription then raise exception 'billing_subscription_not_found'; end if;
    update public.organization_subscriptions set subscription_status = 'canceled',
      cancel_at_period_end = false, grace_period_end = null,
      last_billing_event_at = p_event_at where organization_id = p_organization_id;
  elsif p_event_type = 'period_expired' then
    if not v_has_subscription then
      return jsonb_build_object('mode', 'ignored', 'reason', 'subscription_missing');
    end if;
    update public.organization_subscriptions set subscription_status = 'expired',
      grace_period_end = null, last_billing_event_at = p_event_at
    where organization_id = p_organization_id;
  end if;

  select * into v_subscription from public.organization_subscriptions
  where organization_id = p_organization_id;
  return jsonb_build_object(
    'mode', 'applied', 'status', v_subscription.subscription_status,
    'currentPeriodEnd', v_subscription.current_period_end,
    'cancelAtPeriodEnd', v_subscription.cancel_at_period_end,
    'gracePeriodEnd', v_subscription.grace_period_end
  );
end;
$$;

revoke all on function public.apply_billing_event(
  uuid, text, timestamptz, text, text, text, text, integer, timestamptz,
  timestamptz, text, text, text, text, smallint, uuid, smallint
) from public, authenticated, anon;

grant execute on function public.apply_billing_event(
  uuid, text, timestamptz, text, text, text, text, integer, timestamptz,
  timestamptz, text, text, text, text, smallint, uuid, smallint
) to service_role;
