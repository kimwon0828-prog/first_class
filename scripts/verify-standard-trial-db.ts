// 2차-1 migration(20261023120000)을 로컬 DB 에서 "적용하지 않고" 검증한다.
//
//   npx tsx scripts/verify-standard-trial-db.ts
//
// 로컬 Supabase DB 컨테이너(docker, 이름에 supabase_db) 안에서
//   BEGIN → migration 전문 → 검증 → ROLLBACK
// 순서로 한 transaction 에 넣어 돌린다. 끝나면 스키마 · 데이터가 그대로다(커밋하지 않는다).
// 호스팅 DB 에는 연결하지 않는다 — docker exec 로 로컬 컨테이너의 psql 만 쓴다.
//
// 여기서 고정하는 것.
//   1. 체험 종료 시각 SQL(standard_trial_period_end) = TS(resolveStandardTrialPeriodEnd)
//      경계: 23:59 KST · 00:00 KST · 월말 · 윤년 · 연말
//   2. 승인하면 같은 transaction 에서 trialing 구독이 생긴다(standard · signup_approval · 기간 · 이벤트 시각 null)
//   3. 재승인은 already_reviewed, 관리자가 아니면 forbidden — 구독이 두 번 생기지 않는다
//   4. 같은 사업자번호(숫자만)는 체험을 다시 받지 않는다 · 번호가 없으면 받는다
//   5. 기존 구독 행은 바뀌지 않는다
//   6. 체험 첫 결제(renewal_succeeded)가 active 로 바꾸고 trial 열 · 기준일을 지킨다
//      첫 결제 실패(payment_failed)는 past_due + 종료 시각 + 3일 유예
//   7. 체크 제약: trial 열 짝 · purpose 값 · register_card 기준일 없음
//   8. 알림 기록: claimed · sent · skipped 는 하나뿐, dry_run · failed 는 자리를 차지하지 않는다
//   9. 권한: 알림 기록 · 종료 시각 함수는 anon · authenticated 에 열리지 않는다

import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { promisify } from "node:util"

import { resolveStandardTrialPeriodEnd } from "@/features/billing/lib/standard-trial"

const execFileAsync = promisify(execFile)
const MIGRATION = "supabase/migrations/20261023120000_standard_trial_on_approval.sql"

const findLocalDbContainer = async (): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync("docker", ["ps", "--filter", "name=supabase_db", "--format", "{{.Names}}"])
    return stdout.trim().split("\n").filter(Boolean)[0] ?? null
  } catch {
    return null
  }
}

const runSql = (container: string, sql: string) =>
  new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    const child = execFile(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ stdout, stderr, code: error ? 1 : 0 })
    )
    child.stdin?.end(sql)
  })

const BOUNDARIES: Array<{ label: string; approvedAt: string }> = [
  { label: "10-23 23:59 KST", approvedAt: "2026-10-23T14:59:00Z" },
  { label: "10-24 00:00 KST", approvedAt: "2026-10-23T15:00:00Z" },
  { label: "월말 11-30 23:00 KST", approvedAt: "2026-11-30T14:00:00Z" },
  { label: "연말 12-31 23:59:59 KST", approvedAt: "2026-12-31T14:59:59Z" },
  { label: "윤년 2027-12-01 09:00 KST(→ 2028-02-29)", approvedAt: "2027-12-01T00:00:00Z" },
  { label: "윤년 2월 29일 승인", approvedAt: "2028-02-29T05:00:00Z" },
  { label: "1월 31일 승인", approvedAt: "2028-01-31T03:00:00Z" }
]

const ADMIN = "a1000000-0000-4000-8000-000000000001"
const U1 = "a1000000-0000-4000-8000-000000000011"
const U2 = "a1000000-0000-4000-8000-000000000012"
const U3 = "a1000000-0000-4000-8000-000000000013"
const U4 = "a1000000-0000-4000-8000-000000000014"
const U5 = "a1000000-0000-4000-8000-000000000015"
const R1 = "b1000000-0000-4000-8000-000000000011"
const R2 = "b1000000-0000-4000-8000-000000000012"
const R3 = "b1000000-0000-4000-8000-000000000013"
const R4 = "b1000000-0000-4000-8000-000000000014"
const R5 = "b1000000-0000-4000-8000-000000000015"

const orgOf = (request: string) => `(select approved_organization_id from public.teacher_signup_requests where id = '${request}')`

const buildSql = (migration: string) => {
  const boundaryChecks = BOUNDARIES.map(({ label, approvedAt }) => {
    const expected = resolveStandardTrialPeriodEnd(new Date(approvedAt)).toISOString()
    return `insert into _r (ok, label) select public.standard_trial_period_end('${approvedAt}'::timestamptz) = '${expected}'::timestamptz, 'SQL 종료 시각 = TS 종료 시각 · ${label} → ${expected}';`
  }).join("\n")

  return `
begin;
${migration}

create temp table _r (n serial, ok boolean, label text);

-- 1. 종료 시각 경계
${boundaryChecks}

-- 기존 구독 행 snapshot
create temp table _before as
  select organization_id, plan_code, subscription_status, current_period_end, cancel_at_period_end
  from public.organization_subscriptions;

-- fixtures (transaction 안에서만 존재한다)
insert into auth.users (id, email) values
  ('${ADMIN}', 'trial-admin@verify.local'), ('${U1}', 'trial-u1@verify.local'), ('${U2}', 'trial-u2@verify.local'),
  ('${U3}', 'trial-u3@verify.local'), ('${U4}', 'trial-u4@verify.local'), ('${U5}', 'trial-u5@verify.local');
insert into public.organizations (id, name) values ('c1000000-0000-4000-8000-000000000001', '검증 운영');
insert into public.profiles (id, role, name, organization_id) values ('${ADMIN}', 'admin', '검증 관리자', 'c1000000-0000-4000-8000-000000000001')
  on conflict (id) do update set role = 'admin', organization_id = excluded.organization_id;
insert into public.teacher_signup_requests (id, user_id, teacher_name, organization_name, status, business_registration_number) values
  ('${R1}', '${U1}', '원장1', '검증학원1', 'pending', '123-45-67890'),
  ('${R2}', '${U2}', '원장2', '검증학원2', 'pending', '1234567890'),
  ('${R3}', '${U3}', '원장3', '검증학원3', 'pending', null),
  ('${R4}', '${U4}', '원장4', '검증학원4', 'pending', '999-88-77777'),
  ('${R5}', '${U5}', '원장5', '검증학원5', 'pending', '555-44-33333');

select set_config('request.jwt.claims', json_build_object('sub', '${ADMIN}', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '${ADMIN}', true);

-- 2. 승인 → trialing
select public.approve_teacher_signup_request('${R1}');
insert into _r (ok, label) select exists (
  select 1 from public.organization_subscriptions s
  where s.organization_id = ${orgOf(R1)}
    and s.plan_code = 'standard' and s.subscription_status = 'trialing'
    and s.trial_origin = 'signup_approval'
    and s.current_period_start = now()
    and s.current_period_end = public.standard_trial_period_end(now())
    and s.trial_ends_at = s.current_period_end
    and s.last_billing_event_at is null and s.grace_period_end is null and s.billing_anchor_day is null
    and s.cancel_at_period_end = false
), '승인하면 같은 transaction 에서 스탠다드 trialing 체험이 생긴다';
insert into _r (ok, label) select (select status from public.teacher_signup_requests where id = '${R1}') = 'approved', '신청은 approved 로 바뀐다';

-- 3. 재승인 · 권한
do $$ begin
  perform public.approve_teacher_signup_request('${R1}');
  insert into _r (ok, label) values (false, '재승인이 거절되지 않았다');
exception when others then
  insert into _r (ok, label) values (sqlerrm = 'already_reviewed', '재승인은 already_reviewed (' || sqlerrm || ')');
end $$;
insert into _r (ok, label) select (select count(*) from public.organization_subscriptions where organization_id = ${orgOf(R1)}) = 1, '재승인 시도 뒤에도 구독은 하나뿐이다';

select set_config('request.jwt.claims', json_build_object('sub', '${U1}', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '${U1}', true);
do $$ begin
  perform public.approve_teacher_signup_request('${R5}');
  insert into _r (ok, label) values (false, '관리자가 아닌데 승인됐다');
exception when others then
  insert into _r (ok, label) values (sqlerrm = 'forbidden', '관리자가 아니면 forbidden (' || sqlerrm || ')');
end $$;
insert into _r (ok, label) select (select status from public.teacher_signup_requests where id = '${R5}') = 'pending', '거절된 승인은 신청을 바꾸지 않는다';
select set_config('request.jwt.claims', json_build_object('sub', '${ADMIN}', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '${ADMIN}', true);

-- 4. 사업자번호당 1회
select public.approve_teacher_signup_request('${R2}');
insert into _r (ok, label) select ${orgOf(R2)} is not null and not exists (
  select 1 from public.organization_subscriptions where organization_id = ${orgOf(R2)}
), '같은 사업자번호(하이픈 차이)는 체험을 다시 받지 않는다 — 승인은 된다';
select public.approve_teacher_signup_request('${R3}');
insert into _r (ok, label) select exists (
  select 1 from public.organization_subscriptions where organization_id = ${orgOf(R3)} and trial_origin = 'signup_approval'
), '사업자번호가 없으면 체험을 받는다';
select public.approve_teacher_signup_request('${R4}');
insert into _r (ok, label) select exists (
  select 1 from public.organization_subscriptions where organization_id = ${orgOf(R4)} and trial_origin = 'signup_approval'
), '다른 사업자번호는 체험을 받는다';

-- 5. 기존 행
insert into _r (ok, label) select not exists (
  select 1 from _before b
  join public.organization_subscriptions s using (organization_id)
  where s.plan_code is distinct from b.plan_code
     or s.subscription_status is distinct from b.subscription_status
     or s.current_period_end is distinct from b.current_period_end
     or s.cancel_at_period_end is distinct from b.cancel_at_period_end
     or s.trial_origin is not null or s.trial_ends_at is not null
), '기존 구독 행은 그대로다(' || (select count(*) from _before) || '행)';

-- 6. 체험 첫 결제 성공 (R3 조직) · 실패 (R4 조직)
select public.apply_billing_event(
  ${orgOf(R3)}, 'renewal_succeeded', now() + interval '89 days',
  'trial-first:verify-r3', 'toss', 'pay-verify-r3', 'standard', 39000,
  (select trial_ends_at from public.organization_subscriptions where organization_id = ${orgOf(R3)}),
  (select trial_ends_at + interval '1 month' from public.organization_subscriptions where organization_id = ${orgOf(R3)}),
  null, 'fst-verify-r3', 'fst-verify-r3', 'renewal', 0::smallint, null,
  extract(day from ((select trial_ends_at from public.organization_subscriptions where organization_id = ${orgOf(R3)}) at time zone 'Asia/Seoul'))::smallint
);
insert into _r (ok, label) select exists (
  select 1 from public.organization_subscriptions s
  where s.organization_id = ${orgOf(R3)}
    and s.subscription_status = 'active'
    and s.trial_origin = 'signup_approval'
    and s.current_period_start = s.trial_ends_at
    and s.current_period_end = s.trial_ends_at + interval '1 month'
    and s.billing_anchor_day = extract(day from (s.trial_ends_at at time zone 'Asia/Seoul'))
), '첫 결제 성공 → active · 새 기간은 종료 시각부터 · trial 열 유지 · 기준일 = 종료 시각(KST)의 일';
insert into _r (ok, label) select exists (
  select 1 from public.organization_payments
  where organization_id = ${orgOf(R3)} and attempt_kind = 'renewal' and checkout_session_id is null and status = 'succeeded' and amount = 39000
), '첫 결제 원장: attempt_kind renewal · checkout 없음 · 39,000원';

select public.apply_billing_event(
  ${orgOf(R4)}, 'payment_failed', now() + interval '89 days',
  'trial-first:verify-r4', 'toss', null, 'standard', 39000,
  (select trial_ends_at from public.organization_subscriptions where organization_id = ${orgOf(R4)}),
  (select trial_ends_at + interval '1 month' from public.organization_subscriptions where organization_id = ${orgOf(R4)}),
  'CARD_LIMIT_EXCEEDED', 'fst-verify-r4', 'fst-verify-r4', 'renewal', 0::smallint, null, null
);
insert into _r (ok, label) select exists (
  select 1 from public.organization_subscriptions s
  where s.organization_id = ${orgOf(R4)}
    and s.subscription_status = 'past_due'
    and s.grace_period_end = s.trial_ends_at + interval '3 days'
    and s.trial_origin = 'signup_approval'
), '첫 결제 실패 → past_due · 유예 = 종료 시각 + 3일';

-- 7. 체크 제약
do $$ begin
  update public.organization_subscriptions set trial_ends_at = null where organization_id = ${orgOf(R1)};
  insert into _r (ok, label) values (false, 'trial_origin 만 있고 trial_ends_at 이 없는 행이 허용됐다');
exception when check_violation then
  insert into _r (ok, label) values (true, 'trial_origin · trial_ends_at 은 함께 있거나 함께 없다');
end $$;
do $$ begin
  insert into public.billing_checkout_sessions (organization_id, customer_key, plan_code, amount, order_id, payment_idempotency_key, billing_key_issue_idempotency_key, expires_at, purpose, anchor_day)
  values (${orgOf(R1)}, 'verify-ck-1', 'standard', 39000, 'verify-order-1', 'verify-pay-1', 'verify-bk-1', now() + interval '30 minutes', 'register_card', 5);
  insert into _r (ok, label) values (false, 'register_card 세션에 기준일이 허용됐다');
exception when check_violation then
  insert into _r (ok, label) values (true, 'register_card 세션은 기준일을 갖지 않는다');
end $$;
do $$ begin
  insert into public.billing_checkout_sessions (organization_id, customer_key, plan_code, amount, order_id, payment_idempotency_key, billing_key_issue_idempotency_key, expires_at, purpose)
  values (${orgOf(R1)}, 'verify-ck-2', 'standard', 39000, 'verify-order-2', 'verify-pay-2', 'verify-bk-2', now() + interval '30 minutes', 'bogus');
  insert into _r (ok, label) values (false, '알 수 없는 purpose 가 허용됐다');
exception when check_violation then
  insert into _r (ok, label) values (true, 'purpose 는 subscribe · register_card 뿐이다');
end $$;
insert into public.billing_checkout_sessions (organization_id, customer_key, plan_code, amount, order_id, payment_idempotency_key, billing_key_issue_idempotency_key, expires_at)
  values (${orgOf(R1)}, 'verify-ck-3', 'standard', 39000, 'verify-order-3', 'verify-pay-3', 'verify-bk-3', now() + interval '30 minutes');
insert into _r (ok, label) select (select purpose from public.billing_checkout_sessions where customer_key = 'verify-ck-3') = 'subscribe', '기존 checkout 은 purpose 기본값 subscribe';

-- 8. 알림 기록
create temp table _claims (kind text, inserted int);
with x as (
  insert into public.organization_billing_notices (organization_id, notice_kind, period_end)
  values (${orgOf(R1)}, 'trial_ends_in_7_days', '2027-01-21T15:00:00Z')
  on conflict do nothing returning 1
) insert into _claims select 'first', count(*) from x;
with x as (
  insert into public.organization_billing_notices (organization_id, notice_kind, period_end)
  values (${orgOf(R1)}, 'trial_ends_in_7_days', '2027-01-21T15:00:00Z')
  on conflict do nothing returning 1
) insert into _claims select 'second', count(*) from x;
insert into _r (ok, label) select (select inserted from _claims where kind = 'first') = 1 and (select inserted from _claims where kind = 'second') = 0,
  '같은 알림은 한 번만 claimed 된다';
insert into public.organization_billing_notices (organization_id, notice_kind, period_end, status)
  values (${orgOf(R1)}, 'trial_ends_in_1_day', '2027-01-21T15:00:00Z', 'dry_run'),
         (${orgOf(R1)}, 'trial_ends_in_1_day', '2027-01-21T15:00:00Z', 'failed');
with x as (
  insert into public.organization_billing_notices (organization_id, notice_kind, period_end)
  values (${orgOf(R1)}, 'trial_ends_in_1_day', '2027-01-21T15:00:00Z')
  on conflict do nothing returning 1
) insert into _claims select 'after_dry_run', count(*) from x;
insert into _r (ok, label) select (select inserted from _claims where kind = 'after_dry_run') = 1, 'dry_run · failed 는 자리를 차지하지 않는다';
insert into public.organization_billing_notices (organization_id, notice_kind, period_end, status)
  values (${orgOf(R1)}, 'trial_ended_free', '2027-01-21T15:00:00Z', 'skipped');
with x as (
  insert into public.organization_billing_notices (organization_id, notice_kind, period_end)
  values (${orgOf(R1)}, 'trial_ended_free', '2027-01-21T15:00:00Z')
  on conflict do nothing returning 1
) insert into _claims select 'after_skipped', count(*) from x;
insert into _r (ok, label) select (select inserted from _claims where kind = 'after_skipped') = 0, 'skipped(받을 번호 없음)는 최종 결정이라 자리를 차지한다';
do $$ begin
  insert into public.organization_billing_notices (organization_id, notice_kind, period_end)
  values (${orgOf(R1)}, 'trial_ends_in_30_days', '2027-01-21T15:00:00Z');
  insert into _r (ok, label) values (true, '30일 전 알림 종류가 허용된다');
exception when others then
  insert into _r (ok, label) values (false, '30일 전 알림 종류가 거부됐다: ' || sqlerrm);
end $$;
do $$ begin
  insert into public.organization_billing_notices (organization_id, notice_kind, period_end, recipient_phone_masked)
  values (${orgOf(R1)}, 'trial_first_charge_failed', '2027-01-21T15:00:00Z', '01012345678');
  insert into _r (ok, label) values (false, '마스킹하지 않은 번호가 저장됐다');
exception when check_violation then
  insert into _r (ok, label) values (true, '알림 기록에는 마스킹된 번호만 남는다');
end $$;

-- 9. 권한
insert into _r (ok, label) select not has_table_privilege('authenticated', 'public.organization_billing_notices', 'select')
  and not has_table_privilege('anon', 'public.organization_billing_notices', 'select'), '알림 기록은 학원 · 익명에게 열리지 않는다';
insert into _r (ok, label) select not has_function_privilege('anon', 'public.standard_trial_period_end(timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.standard_trial_period_end(timestamptz)', 'execute'), '종료 시각 함수는 서버 전용이다';
insert into _r (ok, label) select has_function_privilege('authenticated', 'public.approve_teacher_signup_request(uuid)', 'execute'), '승인 RPC 실행 권한은 그대로다(관리자 판정은 함수 안)';

select (case when ok then 'PASS' else 'FAIL' end) || '|' || label from _r order by n;
rollback;
select 'ROLLED_BACK|' || (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'organization_subscriptions' and column_name = 'trial_origin');
`
}

const main = async () => {
  const container = await findLocalDbContainer()
  if (!container) {
    console.error("FAIL: 로컬 Supabase DB 컨테이너(supabase_db*)를 찾지 못했다 — 호스팅 DB 로는 돌리지 않는다")
    process.exit(1)
  }

  const migration = readFileSync(join(process.cwd(), MIGRATION), "utf8")
  const { stdout, stderr, code } = await runSql(container, buildSql(migration))
  if (code !== 0) {
    console.error("FAIL: SQL 실행 실패(transaction 은 롤백됨)")
    console.error(stderr.split("\n").filter((line) => /ERROR|LINE|DETAIL|CONTEXT/.test(line)).slice(0, 12).join("\n"))
    process.exit(1)
  }

  let failures = 0
  let rolledBack = false
  for (const line of stdout.split("\n")) {
    const [status, label] = line.split("|")
    if (status === "PASS" || status === "FAIL") {
      if (status === "FAIL") failures += 1
      console.log(`${status}  ${label}`)
    }
    if (status === "ROLLED_BACK") {
      rolledBack = label === "0"
    }
  }

  console.log(`${rolledBack ? "PASS" : "FAIL"}  ROLLBACK 뒤 로컬 DB 에 trial_origin 열이 없다(적용되지 않았다)`)
  if (!rolledBack) failures += 1

  if (failures > 0) {
    console.error(`FAIL: 체험 migration 검증 실패 ${failures}건`)
    process.exit(1)
  }
  console.log("PASS: 체험 migration 검증 완료(로컬 · 롤백)")
}

void main()
