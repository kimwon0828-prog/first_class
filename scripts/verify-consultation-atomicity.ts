// 상담 저장 transaction 검증.
//
//   npx supabase start && npx tsx scripts/verify-consultation-atomicity.ts
//
// 원자성은 실제 Postgres 에서만 증명된다. 이 스크립트는 로컬 Supabase 에
// fixture 를 만들고, 로그인한 선생님과 같은 권한(teacher JWT)으로
// create_studio_consultation RPC 를 직접 호출한다.
//
// 검증 대상은 CONSULT-6.1 에서 실제로 재현했던 결함들이다.
//   1. outcome 만 저장되고 상담 로그가 없는 부분 저장  → 이제 전부 rollback
//   2. 같은 submissionId 재시도가 종결 guard 에 막히는 문제 → duplicate 로 판정
//   3. 동시 저장 두 건이 모두 성공하던 race → 하나만 성공
//
// production 에는 절대 실행하지 않는다. 127.0.0.1 로컬 전용이다.

import { createHmac } from "node:crypto"

const REST_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321"
const SERVICE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
const JWT_SECRET =
  process.env.SUPABASE_LOCAL_JWT_SECRET ??
  "super-secret-jwt-token-with-at-least-32-characters-long"

if (!REST_URL.includes("127.0.0.1") && !REST_URL.includes("localhost")) {
  console.error("이 스크립트는 로컬 Supabase 전용이다. hosted URL 로 실행하지 않는다.")
  process.exit(1)
}

// seed.sql 이 만드는 고정 fixture.
const TEACHER_PROFILE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"
const PARENT_PROFILE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
const ORG_ID = "11111111-1111-1111-1111-111111111111"
const CLASS_ID = "33333333-3333-3333-3333-333333333331"

// 이 스크립트가 만들고 지우는 fixture.
const OTHER_ORG_ID = "a71a0000-0000-4000-8000-000000000001"
const OTHER_TEACHER_ID = "a71a0000-0000-4000-8000-000000000002"
const OTHER_CLASS_ID = "a71a0000-0000-4000-8000-000000000003"
const APP = (suffix: string) => `a71a1111-0000-4000-8000-00000000000${suffix}`
const SUB = (suffix: string) => `a71a2222-0000-4000-8000-00000000000${suffix}`

let failures = 0
const check = (condition: unknown, message: string) => {
  if (condition) {
    return
  }
  failures += 1
  console.error(`  FAIL  ${message}`)
}
const passLine = (before: number, message: string) => {
  if (failures === before) {
    console.log(`  PASS  ${message}`)
  }
}

const base64url = (value: Buffer | string) =>
  Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/** 로컬 GoTrue 와 같은 비밀키로 서명한 teacher access token. 로그인 세션과 같은 권한을 갖는다. */
const createTeacherToken = () => {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64url(
    JSON.stringify({
      sub: TEACHER_PROFILE_ID,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp: now + 60 * 30
    })
  )
  const signature = base64url(
    createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest()
  )
  return `${header}.${payload}.${signature}`
}

const TEACHER_TOKEN = createTeacherToken()

type RpcArgs = {
  submissionId: string
  applicationId: string
  registrationStatus: "undecided" | "pending" | "enrolled" | "not_enrolled"
  note?: string
  unregisteredReason?: string | null
  unregisteredReasonNote?: string | null
  nextContactAt?: string | null
  preferenceProvided?: boolean
  preference?: unknown
  preferenceNote?: string | null
}

type RpcOutcome =
  | { ok: true; data: { mode: string; outcomeUpdated: boolean; enrollmentTransition: boolean } }
  | { ok: false; message: string }

const callRpc = async (args: RpcArgs, token = TEACHER_TOKEN): Promise<RpcOutcome> => {
  const response = await fetch(`${REST_URL}/rest/v1/rpc/create_studio_consultation`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_submission_id: args.submissionId,
      p_application_id: args.applicationId,
      p_occurred_at: new Date().toISOString(),
      p_channel: "PHONE",
      p_sentiment: "NEUTRAL",
      p_note: args.note ?? "검증 상담",
      p_registration_status: args.registrationStatus,
      p_unregistered_reason: args.unregisteredReason ?? null,
      p_unregistered_reason_note: args.unregisteredReasonNote ?? null,
      p_next_action: args.registrationStatus === "enrolled" ? "REGISTER" : "NONE",
      p_next_contact_at: args.nextContactAt ?? null,
      p_preference_provided: args.preferenceProvided ?? false,
      p_preference: args.preference ?? null,
      p_preference_note: args.preferenceNote ?? null,
      p_outcome_note: "상담 기록에서 등록 전환을 저장했습니다."
    })
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    return { ok: false, message: String((body as { message?: string })?.message ?? response.status) }
  }

  return { ok: true, data: body as { mode: string; outcomeUpdated: boolean; enrollmentTransition: boolean } }
}

const admin = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${REST_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {})
    }
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${path} → ${response.status} ${text}`)
  }

  return text ? JSON.parse(text) : null
}

const readApplication = async (id: string) => {
  const rows = (await admin(
    `trial_applications?id=eq.${id}&select=registration_status,enrolled_at,lost_at,unregistered_reason,unregistered_reason_note,next_contact_at,last_activity_at,regular_schedule_preference,regular_schedule_preference_note,regular_schedule_preference_updated_at`
  )) as Array<Record<string, unknown>>
  return rows[0] ?? null
}

const countRows = async (path: string) => {
  const rows = (await admin(path)) as Array<unknown>
  return rows.length
}

const seedApplication = async (id: string, classId = CLASS_ID) => {
  await admin("trial_applications", {
    method: "POST",
    body: JSON.stringify({
      id,
      parent_id: PARENT_PROFILE_ID,
      class_id: classId,
      child_name: "원자성검증",
      child_grade: "초1",
      requested_slot_at: new Date(Date.now() - 86400000).toISOString(),
      status: "completed",
      registration_status: "pending",
      completed_at: new Date(Date.now() - 3600000).toISOString()
    })
  })
}

const teardown = async () => {
  const ids = ["1", "2", "3", "4", "5", "6"].map(APP)
  const filter = `in.(${ids.join(",")})`
  await admin(`sms_logs?trial_application_id=${filter}`, { method: "DELETE" })
  await admin(`application_logs?application_id=${filter}`, { method: "DELETE" })
  await admin(`consultation_logs?application_id=${filter}`, { method: "DELETE" })
  await admin(`consultation_logs?id=in.(${["1", "2", "3", "4", "5", "6"].map(SUB).join(",")})`, {
    method: "DELETE"
  })
  await admin(`trial_applications?id=${filter}`, { method: "DELETE" })
  await admin(`classes?id=eq.${OTHER_CLASS_ID}`, { method: "DELETE" })
  await admin(`teachers?id=eq.${OTHER_TEACHER_ID}`, { method: "DELETE" })
  await admin(`organizations?id=eq.${OTHER_ORG_ID}`, { method: "DELETE" })
}

const run = async () => {
  const reachable = await fetch(`${REST_URL}/rest/v1/`, {
    headers: { apikey: SERVICE_KEY }
  }).catch(() => null)

  if (!reachable) {
    console.error(`로컬 Supabase(${REST_URL})에 연결하지 못했다. npx supabase start 후 다시 실행한다.`)
    process.exit(1)
  }

  await teardown()

  // ───────────────────────────────────────────────────────────
  console.log("\n[1] 정상 저장 — 하나의 transaction")
  {
    const before = failures
    await seedApplication(APP("1"))
    const result = await callRpc({
      submissionId: SUB("1"),
      applicationId: APP("1"),
      registrationStatus: "enrolled",
      nextContactAt: null
    })

    check(result.ok && result.data.mode === "created", `created 가 아니다: ${JSON.stringify(result)}`)
    check(result.ok && result.data.outcomeUpdated, "outcomeUpdated 가 false 다")
    check(result.ok && result.data.enrollmentTransition, "enrollmentTransition 이 false 다")

    const app = await readApplication(APP("1"))
    check(app?.registration_status === "enrolled", "registration_status 가 enrolled 가 아니다")
    check(Boolean(app?.enrolled_at), "enrolled_at 이 비어 있다")
    check(app?.lost_at === null, "lost_at 이 남아 있다")
    check((await countRows(`consultation_logs?application_id=eq.${APP("1")}&select=id`)) === 1, "상담 로그가 1건이 아니다")
    check((await countRows(`application_logs?application_id=eq.${APP("1")}&select=id`)) === 1, "감사 로그가 1건이 아니다")
    passLine(before, "등록 전환 저장 → Case · 상담 로그 · 감사 로그가 함께 남는다")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[2] 같은 submissionId 재시도 — 종결 상태여도 duplicate")
  {
    const before = failures
    const result = await callRpc({
      submissionId: SUB("1"),
      applicationId: APP("1"),
      registrationStatus: "enrolled",
      note: "재시도 draft"
    })

    check(result.ok && result.data.mode === "duplicate", `duplicate 가 아니다: ${JSON.stringify(result)}`)
    check(result.ok && !result.data.enrollmentTransition, "duplicate 인데 enrollmentTransition 이 true 다(SMS 중복 위험)")
    check((await countRows(`consultation_logs?application_id=eq.${APP("1")}&select=id`)) === 1, "재시도로 상담 로그가 늘었다")
    check((await countRows(`application_logs?application_id=eq.${APP("1")}&select=id`)) === 1, "재시도로 감사 로그가 늘었다")

    const logs = (await admin(`consultation_logs?id=eq.${SUB("1")}&select=note`)) as Array<{ note: string }>
    check(logs[0]?.note === "검증 상담", "duplicate 재시도가 기존 상담 내용을 덮어썼다")
    passLine(before, "commit 후 재시도 → mutation 0, duplicate 로 판정(종결 오류 아님)")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[3] 부분 저장 불가 — 상담 로그 INSERT 실패 시 전부 rollback")
  {
    const before = failures
    await seedApplication(APP("2"))
    await seedApplication(APP("3"))
    // 다른 신청이 같은 submissionId 를 선점한 상태. CONSULT-6.1 의 F1 재현 조건 그대로다.
    await admin("consultation_logs", {
      method: "POST",
      body: JSON.stringify({
        id: SUB("2"),
        application_id: APP("3"),
        activity_type: "CONSULTATION",
        note: "선점"
      })
    })

    const result = await callRpc({
      submissionId: SUB("2"),
      applicationId: APP("2"),
      registrationStatus: "enrolled"
    })

    check(!result.ok, "id 소유가 다른데 성공했다")
    check(
      !result.ok && result.message.includes("consultation_submission_conflict"),
      `기대한 도메인 오류가 아니다: ${JSON.stringify(result)}`
    )

    const app = await readApplication(APP("2"))
    check(app?.registration_status === "pending", "실패했는데 registration_status 가 바뀌었다")
    check(app?.enrolled_at === null, "실패했는데 enrolled_at 이 기록됐다")
    check((await countRows(`consultation_logs?application_id=eq.${APP("2")}&select=id`)) === 0, "실패했는데 상담 로그가 남았다")
    check((await countRows(`application_logs?application_id=eq.${APP("2")}&select=id`)) === 0, "실패했는데 감사 로그가 남았다")
    passLine(before, "상담 로그 실패 → outcome · 스냅샷 · 감사 로그 전부 rollback (F1 재현 불가)")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[4] 동시 저장 — 하나만 성공")
  {
    const before = failures
    await seedApplication(APP("4"))
    const [a, b] = await Promise.all([
      callRpc({ submissionId: SUB("3"), applicationId: APP("4"), registrationStatus: "enrolled" }),
      callRpc({
        submissionId: SUB("4"),
        applicationId: APP("4"),
        registrationStatus: "not_enrolled",
        unregisteredReason: "distance"
      })
    ])

    const succeeded = [a, b].filter((item) => item.ok)
    const failed = [a, b].filter((item) => !item.ok)
    check(succeeded.length === 1, `동시 요청 중 ${succeeded.length}건이 성공했다(1건이어야 한다)`)
    check(
      failed.length === 1 && !failed[0]!.ok && failed[0]!.message.includes("application_registration_terminal"),
      `패배한 요청이 종결 충돌로 끝나지 않았다: ${JSON.stringify(failed)}`
    )

    const app = await readApplication(APP("4"))
    const logs = (await admin(
      `consultation_logs?application_id=eq.${APP("4")}&select=registration_status_snapshot`
    )) as Array<{ registration_status_snapshot: string }>
    check(logs.length === 1, `상담 로그가 ${logs.length}건이다(1건이어야 한다)`)
    check(
      logs[0]?.registration_status_snapshot === app?.registration_status,
      "Case 최종 상태와 상담 스냅샷이 어긋난다"
    )
    // 등록 전환 알림은 성공한 쪽이 enrolled 일 때만 나가야 한다.
    const enrollmentSignals = [a, b].filter((item) => item.ok && item.data.enrollmentTransition)
    check(
      enrollmentSignals.length === (app?.registration_status === "enrolled" ? 1 : 0),
      "최종 상태와 모순되는 등록 전환 신호가 나왔다"
    )
    passLine(before, `동시 저장 → 1건 성공 · 1건 종결 충돌 · 상담 로그 1건 (최종 ${app?.registration_status})`)
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[5] 희망 일정 — 미전달 · 동일 값 · 변경")
  {
    const before = failures
    await seedApplication(APP("5"))
    const preference = {
      version: 1,
      state: "specified",
      groups: [{ days: [2, 4], startTime: "17:00", endTime: "19:00" }]
    }

    // (C) 새 값 → current 변경 + updated_at 기록
    const first = await callRpc({
      submissionId: SUB("5"),
      applicationId: APP("5"),
      registrationStatus: "pending",
      preferenceProvided: true,
      preference,
      preferenceNote: "화목 선호"
    })
    check(first.ok, `희망 일정 저장 실패: ${JSON.stringify(first)}`)
    const afterFirst = await readApplication(APP("5"))
    check(Boolean(afterFirst?.regular_schedule_preference), "희망 일정이 저장되지 않았다")
    check(Boolean(afterFirst?.regular_schedule_preference_updated_at), "updated_at 이 기록되지 않았다")
    const firstUpdatedAt = afterFirst?.regular_schedule_preference_updated_at

    // (B) 같은 값 재저장 → updated_at 유지
    await callRpc({
      submissionId: SUB("6"),
      applicationId: APP("5"),
      registrationStatus: "pending",
      preferenceProvided: true,
      preference,
      preferenceNote: "화목 선호"
    })
    const afterSame = await readApplication(APP("5"))
    check(
      afterSame?.regular_schedule_preference_updated_at === firstUpdatedAt,
      "같은 값을 다시 저장했는데 updated_at 이 갱신됐다"
    )

    // (A) 미전달 → current 유지 + 스냅샷에는 현재 값 복사
    await seedApplication(APP("6"))
    await admin(`trial_applications?id=eq.${APP("6")}`, {
      method: "PATCH",
      body: JSON.stringify({
        regular_schedule_preference: preference,
        regular_schedule_preference_note: "기존 값",
        regular_schedule_preference_updated_at: "2026-01-01T00:00:00.000Z"
      })
    })
    await callRpc({
      submissionId: SUB("4").replace(/4$/, "9"),
      applicationId: APP("6"),
      registrationStatus: "pending"
    })
    const afterAbsent = await readApplication(APP("6"))
    check(
      afterAbsent?.regular_schedule_preference_note === "기존 값",
      "미전달인데 Case 희망 일정이 바뀌었다"
    )
    check(
      String(afterAbsent?.regular_schedule_preference_updated_at).startsWith("2026-01-01"),
      "미전달인데 updated_at 이 갱신됐다"
    )
    const snapshot = (await admin(
      `consultation_logs?application_id=eq.${APP("6")}&select=regular_schedule_preference_note_snapshot`
    )) as Array<{ regular_schedule_preference_note_snapshot: string | null }>
    check(
      snapshot[0]?.regular_schedule_preference_note_snapshot === "기존 값",
      "미전달 상담의 스냅샷에 현재 값이 복사되지 않았다"
    )
    passLine(before, "미전달 유지 · 동일 값 유지 · 변경 시에만 updated_at bump")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[6] 다른 조직 신청 — mutation 0")
  {
    const before = failures
    await admin("organizations", {
      method: "POST",
      body: JSON.stringify({ id: OTHER_ORG_ID, name: "다른 학원", branch_name: "본점" })
    })
    await admin("teachers", {
      method: "POST",
      body: JSON.stringify({
        id: OTHER_TEACHER_ID,
        organization_id: OTHER_ORG_ID,
        display_name: "다른 선생님"
      })
    })
    await admin("classes", {
      method: "POST",
      body: JSON.stringify({
        id: OTHER_CLASS_ID,
        organization_id: OTHER_ORG_ID,
        teacher_id: OTHER_TEACHER_ID,
        title: "다른 조직 수업",
        subject: "미술",
        target_age: "7-9",
        description: "cross-org fixture",
        trial_price: 0,
        is_active: true
      })
    })
    await seedApplication(APP("2").replace(/2$/, "7"), OTHER_CLASS_ID)

    const result = await callRpc({
      submissionId: SUB("2").replace(/2$/, "8"),
      applicationId: APP("2").replace(/2$/, "7"),
      registrationStatus: "enrolled"
    })

    check(!result.ok, "다른 조직 신청에 저장이 성공했다")
    check(
      !result.ok && result.message.includes("application_not_found_or_forbidden"),
      `기대한 도메인 오류가 아니다: ${JSON.stringify(result)}`
    )
    const app = await readApplication(APP("2").replace(/2$/, "7"))
    check(app?.registration_status === "pending", "다른 조직 신청의 상태가 바뀌었다")
    check(
      (await countRows(`consultation_logs?application_id=eq.${APP("2").replace(/2$/, "7")}&select=id`)) === 0,
      "다른 조직 신청에 상담 로그가 생겼다"
    )
    await admin(`trial_applications?id=eq.${APP("2").replace(/2$/, "7")}`, { method: "DELETE" })
    passLine(before, "다른 조직 신청 → mutation 0 · 도메인 오류")
  }

  await teardown()

  if (failures > 0) {
    console.error(`\nFAIL: ${failures}건 실패`)
    process.exit(1)
  }

  console.log("\nPASS: 상담 저장 원자성 검증 완료")
}

run().catch(async (error) => {
  console.error("\n검증 중 예외:", error)
  await teardown().catch(() => undefined)
  process.exit(1)
})
