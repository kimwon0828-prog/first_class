-- 2차-1 요금제 변경: 새로 승인된 학원에 스탠다드 90일 무료 체험.
--
-- 이 migration 이 하는 일
--   1. organization_subscriptions.trial_origin · trial_ends_at
--                                                  자동 체험(승인) 행을 수동 trialing(PoC)과 구분하고,
--                                                  첫 결제 뒤에도 원래 체험 종료 시각을 남긴다
--   2. standard_trial_period_end()                 체험 종료 시각 = (승인일 KST + 90일) 00:00 KST
--   3. approve_teacher_signup_request              승인과 같은 transaction 에서 trialing 구독을 만든다
--   4. billing_checkout_sessions.purpose           "카드만 등록"(빌링키만 발급, 결제 없음) 세션을 구분한다
--   5. organization_billing_notices                체험 종료 알림의 중복 발송 방지 기록
--
-- 이 migration 이 하지 않는 일
--   - 기존 승인 학원 · 데모 override · 수동 trialing(PoC) 행에 대한 DML 없음.
--   - apply_billing_event 변경 없음. 체험 첫 결제는 기존 renewal_succeeded / payment_failed
--     이벤트를 그대로 쓴다(trialing → active, 실패 시 past_due + 3일 유예).
--   - organization_payments 제약 변경 없음. 첫 결제는 attempt_kind = 'renewal',
--     checkout_session_id = null 로 남는다(기존 attempt_link_check 그대로 통과).
--   - 가격은 DB 에 두지 않는다(plan-catalog.ts 가 단일 출처). 90일은 이 함수에 상수로 있고,
--     scripts/verify-standard-trial.ts 가 STANDARD_TRIAL_DAYS 와의 일치를 고정한다.
--
-- 적용 순서: 이 migration 을 먼저 적용하고 앱을 배포한다. 새 앱은 trial_origin · purpose 열을
-- 읽고 쓰므로 열이 없으면 구독 조회가 실패한다. 이전 앱은 새 열을 읽지 않으므로 이 migration 만
-- 먼저 적용돼도 동작이 바뀌지 않는다(새로 승인된 학원이 "체험 이용 중"으로 보일 뿐이다).
--
-- 되돌리기: 이 파일 맨 아래 주석의 down SQL(리포 migration 으로 두지 않는다).

-- ─────────────────────────────────────────────────────────────
-- 1. 체험 출처
--
-- null               기존 행 전부(수동 trialing PoC · 결제로 생긴 active 등). 의미를 바꾸지 않는다.
-- 'signup_approval'  승인 RPC 가 만든 자동 체험.
--
-- 알림 · 상단 안내 · 카드 등록 · 체험 첫 결제 규칙은 이 값이 'signup_approval' 인 행에만 붙는다.
--
-- trial_ends_at 은 체험 종료 시각이다. 체험 중에는 current_period_end 와 같고, 첫 결제가 성공해
-- current_period_end 가 다음 달로 넘어가도 그대로 남는다. 종료 뒤 결과 알림(무료 전환 · 결제 성공 ·
-- 결제 실패)과 카드 등록 동의 창(종료 30일 전 ~ 종료)이 이 값을 기준으로 한다.
--
-- apply_billing_event 의 upsert 는 두 열을 건드리지 않으므로, 체험 → 유료 전환 뒤에도
-- "이 조직은 자동 체험을 이미 받았다" 는 사실이 남는다(중복 체험 판정 근거).
-- ─────────────────────────────────────────────────────────────

alter table public.organization_subscriptions
  add column if not exists trial_origin text,
  add column if not exists trial_ends_at timestamptz;

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_trial_origin_check;
alter table public.organization_subscriptions
  add constraint organization_subscriptions_trial_origin_check
    check (trial_origin is null or trial_origin in ('signup_approval'));

-- 둘은 함께 있거나 함께 없다.
alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_trial_pair_check;
alter table public.organization_subscriptions
  add constraint organization_subscriptions_trial_pair_check
    check ((trial_origin is null) = (trial_ends_at is null));

comment on column public.organization_subscriptions.trial_origin is
  '자동 체험 출처. signup_approval = 승인 RPC 가 만든 90일 체험. null = 기존 행(수동 trialing 포함).';
comment on column public.organization_subscriptions.trial_ends_at is
  '자동 체험 종료 시각((승인일 KST + 90일) 00:00 KST). 첫 결제 뒤에도 바뀌지 않는다.';

-- 체험 종료 알림 · 첫 결제 후보 조회용.
create index if not exists organization_subscriptions_trial_ends_idx
  on public.organization_subscriptions (trial_ends_at)
  where trial_origin is not null;

-- ─────────────────────────────────────────────────────────────
-- 2. 체험 종료 시각 — (승인일 KST 날짜 + 90일) 00:00 KST
--
-- 승인일을 1일째로 세면 90일째(마지막 체험일)가 끝나는 자정이다. 화면 · 문자의
-- "M월 D일까지 / M월 D일에 끝나요" 의 D 는 종료 시각 전날(마지막 체험일)이다.
-- 앱의 resolveStandardTrialPeriodEnd(standard-trial.ts)와 같은 규칙이며,
-- scripts/verify-standard-trial-db.ts 가 경계(23:59 KST · 월말 · 윤년)에서 둘의 일치를 고정한다.
-- 한국은 일광절약시간이 없어 자정이 언제나 15:00 UTC 다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.standard_trial_period_end(p_approved_at timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select ((((p_approved_at at time zone 'Asia/Seoul')::date + 90)::timestamp) at time zone 'Asia/Seoul')
$$;

revoke all on function public.standard_trial_period_end(timestamptz) from public, anon, authenticated;
grant execute on function public.standard_trial_period_end(timestamptz) to service_role;

comment on function public.standard_trial_period_end(timestamptz) is
  '스탠다드 무료 체험 종료 시각 = (승인일 KST + 90일) 00:00 KST. 승인 RPC 가 쓴다.';

-- ─────────────────────────────────────────────────────────────
-- 3. 승인 RPC — trialing 구독을 같은 transaction 에서 만든다
--
-- 20260831180000 정의에서 바뀐 것은 "구독 행 insert" 블록 하나다.
-- SECURITY DEFINER / search_path / 반환 타입 / 에러 semantics(forbidden · not_found ·
-- already_reviewed)는 그대로다.
--
-- 체험 기간: 시작 = 승인 시각, 종료 = standard_trial_period_end(승인 시각).
--
-- 원자성
--   조직 생성 · 프로필 연결 · 신청 상태 변경 · 구독 insert 가 한 함수(한 transaction)다.
--   구독 insert 가 실패하면 승인 전체가 롤백된다 — "승인됐는데 체험이 없는" 상태가 생기지 않는다.
--
-- 재승인 · 중복
--   - 같은 신청: FOR UPDATE 로 잠근 뒤 status <> 'pending' 이면 already_reviewed. 두 번 승인되지 않는다.
--   - 조직은 승인마다 새로 만들어지므로 PK 충돌은 없지만, on conflict do nothing 으로 한 번 더 막는다.
--   - 같은 사업자등록번호(숫자만)로 이미 자동 체험을 받은 조직이 있으면 체험을 만들지 않는다.
--     사업자번호가 비어 있으면 비교할 수 없어 체험을 준다(가입 폼에서 필수라 실제로는 드물다).
--     조직이 삭제되면 그 조직의 체험 기록도 함께 사라진다(cascade) — 알려진 한계다.
--
-- last_billing_event_at 은 null 로 둔다. 값을 넣으면 그보다 이른 p_event_at 의 이벤트가
-- apply_billing_event 에서 stale 로 버려질 수 있다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.approve_teacher_signup_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  r public.teacher_signup_requests%rowtype;
  org_id uuid;
  v_now timestamptz := now();
  v_trial_end timestamptz;
  v_brn text;
  v_trial_already_used boolean := false;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'forbidden';
  end if;

  select *
  into r
  from public.teacher_signup_requests
  where id = request_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if r.status <> 'pending' then
    raise exception 'already_reviewed';
  end if;

  insert into public.organizations (name, branch_name, address, address_detail)
  values (r.organization_name, r.branch_name, r.address, r.address_detail)
  returning id into org_id;

  insert into public.profiles (id, role, name, phone, organization_id)
  values (r.user_id, 'academy', r.teacher_name, r.teacher_phone, org_id)
  on conflict (id) do update
    set role = 'academy',
        name = excluded.name,
        phone = excluded.phone,
        organization_id = excluded.organization_id,
        updated_at = now();

  -- teachers INSERT 없음. 선생님 명부는 Studio 에서 직접 등록할 때만 만들어진다
  -- (createStudioTeacher: profile_id = NULL).

  -- ── 스탠다드 90일 무료 체험 ─────────────────────────────
  v_brn := nullif(regexp_replace(coalesce(r.business_registration_number, ''), '\D', '', 'g'), '');

  if v_brn is not null then
    select exists (
      select 1
      from public.teacher_signup_requests t
      join public.organization_subscriptions s
        on s.organization_id = t.approved_organization_id
      where t.status = 'approved'
        and t.id <> r.id
        and s.trial_origin = 'signup_approval'
        and regexp_replace(coalesce(t.business_registration_number, ''), '\D', '', 'g') = v_brn
    )
    into v_trial_already_used;
  end if;

  if not v_trial_already_used then
    v_trial_end := public.standard_trial_period_end(v_now);

    insert into public.organization_subscriptions (
      organization_id,
      plan_code,
      subscription_status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      grace_period_end,
      last_billing_event_at,
      billing_anchor_day,
      trial_origin,
      trial_ends_at
    ) values (
      org_id,
      'standard',
      'trialing',
      v_now,
      v_trial_end,
      false,
      null,
      null,
      null,
      'signup_approval',
      v_trial_end
    )
    on conflict (organization_id) do nothing;
  end if;

  update public.teacher_signup_requests
  set status = 'approved',
      approved_organization_id = org_id,
      reviewed_at = v_now,
      updated_at = v_now
  where id = request_id;
end;
$$;

-- CREATE OR REPLACE 는 기존 ACL 을 보존하지만, 권한 상태를 명시적으로 고정해 둔다.
grant execute on function public.approve_teacher_signup_request(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. 카드만 등록하는 checkout 세션
--
-- subscribe      기존 흐름. 빌링키 발급 → 최초 결제 → initial_payment_succeeded → active
-- register_card  자동 체험 중. 빌링키 발급 → organization_billing_customers 저장 → 끝. 결제하지 않는다.
--
-- register_card 세션도 amount · order_id · payment_idempotency_key 를 채운다(NOT NULL · unique
-- 제약을 바꾸지 않기 위해서). 이 order_id 로는 결제를 만들지 않는다 — 체험 첫 결제는
-- 갱신과 같은 결정적 주문번호(조직 · 기간 종료 · 차수)를 쓴다.
--
-- "체험 중에 카드를 등록하고 자동 결제에 동의했다" 의 근거가 이 세션이다. 동의 시각 = completed_at.
-- 첫 결제 후보는 completed_at 이 [trial_ends_at - 30일, trial_ends_at) 안에 있는 register_card 세션이
-- 있는 trialing 구독뿐이다(앱 코드: renewal-candidates.ts, 전자상거래법 무료→유료 전환 동의 30일).
-- ─────────────────────────────────────────────────────────────

alter table public.billing_checkout_sessions
  add column if not exists purpose text not null default 'subscribe';

alter table public.billing_checkout_sessions
  drop constraint if exists billing_checkout_sessions_purpose_check;
alter table public.billing_checkout_sessions
  add constraint billing_checkout_sessions_purpose_check
    check (purpose in ('subscribe', 'register_card'));

-- 카드만 등록한 세션은 구독 주기를 시작하지 않는다.
alter table public.billing_checkout_sessions
  drop constraint if exists billing_checkout_sessions_register_card_anchor_check;
alter table public.billing_checkout_sessions
  add constraint billing_checkout_sessions_register_card_anchor_check
    check (purpose <> 'register_card' or anchor_day is null);

create index if not exists billing_checkout_sessions_register_card_completed_idx
  on public.billing_checkout_sessions (organization_id, completed_at desc)
  where status = 'completed' and purpose = 'register_card';

comment on column public.billing_checkout_sessions.purpose is
  'subscribe = 최초 결제까지. register_card = 체험 중 빌링키만 발급(결제 없음). completed_at 이 자동 결제 동의 시각이다.';

-- ⚠️ 기존 갱신 기준일 backfill(20260912120000)은 status = completed 세션의 anchor_day 를 읽는다.
--    register_card 세션은 anchor_day 가 null 이라 그 규칙에 걸리지 않는다.

-- ─────────────────────────────────────────────────────────────
-- 5. 체험 종료 알림 기록
--
-- sms_logs 를 쓰지 않는 이유
--   - sms_logs 는 신청(trial_application) 단위 기록이고 event_type CHECK 목록을 늘려야 한다.
--   - 중복 방지 unique 키가 없다. 기존 리마인더는 "보내기 전에 조회" 로 막아 동시 실행에 약하다.
--
-- 규칙
--   (조직, 알림 종류, 체험 종료 시각) 하나에 claimed · sent · skipped 인 행은 하나뿐이다(partial unique).
--   보내기 전에 status = 'claimed' 로 insert ... on conflict do nothing 해서 자리를 잡고,
--   보낸 뒤 sent / failed / dry_run / skipped 로 바꾼다.
--
--   skipped(받을 번호가 없음)는 그 알림의 최종 결정이라 자리를 차지한다.
--   dry_run · failed 는 자리를 차지하지 않는다. 그래서
--     - 로컬 · 문자 꺼짐(SMS_SEND_ENABLED)에서 돌린 dry_run 이 운영의 실제 발송을 막지 않고
--     - 실패한 발송은 다음 실행에서 다시 시도된다(알림 창 안에서만 — 앱 코드가 정한다).
--   claimed 가 1시간 넘게 남아 있으면(작업 중 중단) 앱 코드가 failed 로 내린 뒤 다시 잡는다.
--
-- period_end 를 키에 넣는 이유: 기간이 바뀐 경우에 이전 기간의 기록이 새 알림을 막지 않게 한다.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.organization_billing_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  notice_kind text not null,
  period_end timestamptz not null,
  status text not null default 'claimed',
  recipient_phone_masked text,
  message_preview text,
  provider_message_id text,
  error_message text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_billing_notices_kind_check
    check (notice_kind in (
      'trial_ends_in_30_days',
      'trial_ends_in_7_days',
      'trial_ends_in_1_day',
      'trial_ended_free',
      'trial_first_charge_succeeded',
      'trial_first_charge_failed'
    )),
  constraint organization_billing_notices_status_check
    check (status in ('claimed', 'sent', 'dry_run', 'failed', 'skipped')),
  constraint organization_billing_notices_masked_phone_check
    check (recipient_phone_masked is null or recipient_phone_masked ~ '\*')
);

create unique index if not exists organization_billing_notices_once_uidx
  on public.organization_billing_notices (organization_id, notice_kind, period_end)
  where status in ('claimed', 'sent', 'skipped');

create index if not exists organization_billing_notices_org_created_idx
  on public.organization_billing_notices (organization_id, created_at desc);

comment on table public.organization_billing_notices is
  '체험 종료 · 첫 결제 결과 문자 기록. (조직, 종류, 종료 시각)당 claimed/sent/skipped 는 하나뿐이다. 서버 전용.';

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.organization_billing_notices'::regclass
      and tgname = 'set_organization_billing_notices_updated_at'
      and not tgisinternal
  ) then
    create trigger set_organization_billing_notices_updated_at
    before update on public.organization_billing_notices
    for each row execute function public.set_updated_at();
  end if;
end
$$;

-- 권한: 서버(service_role) 전용. 학원 화면은 이 기록을 읽지 않는다
-- (상단 안내 · 사이드바는 구독 행의 기간으로 계산한다).
alter table public.organization_billing_notices enable row level security;
revoke all on table public.organization_billing_notices from anon, authenticated;
grant all on table public.organization_billing_notices to service_role;

-- ─────────────────────────────────────────────────────────────
-- 6. 사후 검증
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organization_subscriptions'
      and column_name = 'trial_origin'
  ) then
    raise exception 'pricing_v2_trial_origin_missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'billing_checkout_sessions'
      and column_name = 'purpose'
  ) then
    raise exception 'pricing_v2_checkout_purpose_missing';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'approve_teacher_signup_request'
      and pg_get_functiondef(p.oid) ilike '%signup_approval%'
  ) then
    raise exception 'pricing_v2_approval_rpc_not_replaced';
  end if;

  -- 기존 행은 하나도 자동 체험으로 바뀌지 않았다(이 migration 은 기존 행에 DML 을 하지 않는다).
  if exists (
    select 1 from public.organization_subscriptions
    where trial_origin is not null or trial_ends_at is not null
  ) then
    raise exception 'pricing_v2_existing_rows_touched';
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────
-- 되돌리기(down) — 실행하지 않는다. 필요할 때 새 migration 으로 옮겨 적용한다.
--
-- ⚠️ 되돌려도 이미 만들어진 자동 체험 행(trialing)은 지우지 않는다. trial_origin 열이 사라지면
--    수동 trialing 과 구분되지 않을 뿐, 종료 시각에 무료로 닫히는 동작은 그대로다.
--    체험 중 등록된 카드(organization_billing_customers)도 남는다 — 앱을 먼저 되돌려
--    trialing 첫 결제 후보 조회가 사라진 뒤에 적용한다.
--
--   -- 1) 승인 RPC 를 20260831180000 정의로 되돌린다(그 파일의 create or replace function 전문).
--   -- 2) 알림 기록
--   drop table if exists public.organization_billing_notices;
--   -- 3) 카드만 등록 세션
--   drop index if exists public.billing_checkout_sessions_register_card_completed_idx;
--   alter table public.billing_checkout_sessions
--     drop constraint if exists billing_checkout_sessions_register_card_anchor_check,
--     drop constraint if exists billing_checkout_sessions_purpose_check,
--     drop column if exists purpose;
--   -- 4) 체험 종료 시각 함수
--   drop function if exists public.standard_trial_period_end(timestamptz);
--   -- 5) 체험 출처
--   drop index if exists public.organization_subscriptions_trial_ends_idx;
--   alter table public.organization_subscriptions
--     drop constraint if exists organization_subscriptions_trial_pair_check,
--     drop constraint if exists organization_subscriptions_trial_origin_check,
--     drop column if exists trial_ends_at,
--     drop column if exists trial_origin;
-- ─────────────────────────────────────────────────────────────
