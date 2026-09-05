// 기존 예약 엑셀 가져오기 검증.
//
//   npx supabase start && npx tsx scripts/verify-reservation-import.ts
//
// 여기서 고정하는 계약.
//   1. 이관 예약은 학부모 계정 없이 존재할 수 있다(parent_id = NULL).
//   2. 그래도 어떤 학부모의 `/my` 에도 나타나지 않는다 — RLS 가 parent_id = auth.uid() 라서다.
//   3. 기존 Marketplace 신청(parent_id 있음)의 동작은 그대로다.
//   4. 이관 이력은 자기 조직만 읽을 수 있고, 학원 사용자가 직접 쓸 수 없다.
//   5. 선택한 행 전체가 하나의 transaction 이다 — 한 행이라도 실패하면 아무것도 남지 않는다.
//   6. 같은 batch 를 다시 제출해도 신청이 두 벌 생기지 않는다.
//   7. 가져오기로는 SMS 가 한 건도 발생하지 않는다.
//   8. 다른 조직의 수업·선생님 id 를 넣으면 전부 거절된다.
//   9. 확정 예약은 예약 블록과 confirmed 필드가 함께 만들어지고, 서울 시각이 밀리지 않는다.
//
// 로컬 Supabase 전용이다. production 에는 실행하지 않는다.

import { createHmac } from "node:crypto"

const REST_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321"
const SERVICE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
const JWT_SECRET =
  process.env.SUPABASE_LOCAL_JWT_SECRET ??
  "super-secret-jwt-token-with-at-least-32-characters-long"

if (!REST_URL.includes("127.0.0.1") && !REST_URL.includes("localhost")) {
  console.error("이 스크립트는 로컬 Supabase 전용이다.")
  process.exit(1)
}

// seed.sql 이 만드는 고정 fixture.
const TEACHER_PROFILE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"
const PARENT_PROFILE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
const ORG_ID = "11111111-1111-1111-1111-111111111111"
const CLASS_ID = "33333333-3333-3333-3333-333333333331"

// 이 스크립트가 만들고 지우는 fixture.
const OTHER_ORG_ID = "e0a10000-0000-4000-8000-000000000001"
const IMPORTED_APP_ID = "e0a11111-0000-4000-8000-000000000001"
const PARENT_APP_ID = "e0a11111-0000-4000-8000-000000000002"
const BATCH_ID = "e0a12222-0000-4000-8000-000000000001"
// seed.sql 의 학원 명부 선생님.
const TEACHER_ROSTER_ID = "22222222-2222-2222-2222-222222222221"

/** 이 스크립트가 RPC 로 만든 batch. teardown 에서 정리한다. */
const createdBatchIds: string[] = []

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

/** 로컬 GoTrue 와 같은 비밀키로 서명한 access token. 로그인 세션과 같은 권한이다. */
const createToken = (subject: string) => {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64url(
    JSON.stringify({ sub: subject, role: "authenticated", aud: "authenticated", iat: now, exp: now + 1800 })
  )
  const signature = base64url(createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest())
  return `${header}.${payload}.${signature}`
}

const request = async (path: string, token: string, init?: RequestInit) => {
  const response = await fetch(`${REST_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {})
    }
  })
  const text = await response.text()
  return { ok: response.ok, status: response.status, body: text ? JSON.parse(text) : null }
}

const admin = async (path: string, init?: RequestInit) => {
  const result = await request(path, SERVICE_KEY, init)
  if (!result.ok) {
    throw new Error(`${path} → ${result.status} ${JSON.stringify(result.body)}`)
  }
  return result.body
}

let teacherTokenForRpc = ""

const rpc = async (name: string, args: Record<string, unknown>) => {
  const response = await fetch(`${REST_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${teacherTokenForRpc}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  })
  const text = await response.text()
  return { ok: response.ok, status: response.status, body: text ? JSON.parse(text) : null }
}

/** preview 단계와 같은 방식으로 batch 를 만든다. */
const createBatch = async () => {
  const result = await rpc("create_studio_import_batch", {
    p_import_type: "trial_reservations",
    p_original_file_name: "검증.xlsx",
    p_total_rows: 3,
    p_valid_rows: 3
  })

  if (!result.ok || typeof result.body !== "string") {
    throw new Error(`batch 생성 실패: ${JSON.stringify(result.body)}`)
  }

  createdBatchIds.push(result.body)
  return result.body
}

const importRow = (
  rowNumber: number,
  overrides: Record<string, unknown>
) => ({
  rowNumber,
  fingerprint: `fingerprint-${rowNumber}-${Math.random().toString(16).slice(2)}`,
  classId: CLASS_ID,
  childName: `이관학생${rowNumber}`,
  childGrade: "elem_3",
  childSchool: null,
  parentName: "이관보호자",
  parentPhone: "01011112222",
  memo: null,
  requestedSlotAt: "2026-09-15T07:00:00.000Z",
  teacherId: null,
  confirmedStartAt: null,
  confirmedEndAt: null,
  ...overrides
})

const teardown = async () => {
  await admin(`application_logs?application_id=in.(${IMPORTED_APP_ID},${PARENT_APP_ID})`, { method: "DELETE" })
  await admin(`trial_applications?id=in.(${IMPORTED_APP_ID},${PARENT_APP_ID})`, { method: "DELETE" })
  await admin(`studio_import_rows?batch_id=eq.${BATCH_ID}`, { method: "DELETE" })
  await admin(`studio_import_batches?id=eq.${BATCH_ID}`, { method: "DELETE" })
  await admin(`studio_import_batches?organization_id=eq.${OTHER_ORG_ID}`, { method: "DELETE" })
  if (createdBatchIds.length > 0) {
    const filter = `in.(${createdBatchIds.join(",")})`
    const applications = (await admin(
      `trial_applications?import_batch_id=${filter}&select=id`
    )) as Array<{ id: string }>
    const applicationFilter =
      applications.length > 0
        ? `in.(${applications.map((row) => row.id).join(",")})`
        : "eq.00000000-0000-4000-8000-000000000000"

    await admin(`application_logs?application_id=${applicationFilter}`, { method: "DELETE" })
    // 블록을 먼저 지우면 FK 가 confirmed_schedule_block_id 만 NULL 로 만들어
    // confirmed_state_check 를 깨뜨린다. 확정 필드를 함께 비운 뒤 지운다.
    await admin(`trial_applications?import_batch_id=${filter}`, {
      method: "PATCH",
      body: JSON.stringify({ confirmed_slot_at: null, confirmed_schedule_block_id: null })
    })
    await admin(`schedule_blocks?related_application_id=${applicationFilter}`, { method: "DELETE" })
    await admin(`trial_applications?import_batch_id=${filter}`, { method: "DELETE" })
    await admin(`studio_import_rows?batch_id=${filter}`, { method: "DELETE" })
    await admin(`studio_import_batches?id=${filter}`, { method: "DELETE" })
  }
  await admin(`organizations?id=eq.${OTHER_ORG_ID}`, { method: "DELETE" })
}

const run = async () => {
  await teardown()

  const teacherToken = createToken(TEACHER_PROFILE_ID)
  const parentToken = createToken(PARENT_PROFILE_ID)
  teacherTokenForRpc = teacherToken

  await admin("studio_import_batches", {
    method: "POST",
    body: JSON.stringify({
      id: BATCH_ID,
      organization_id: ORG_ID,
      import_type: "trial_reservations",
      original_file_name: "검증.xlsx",
      status: "previewed",
      total_rows: 1,
      valid_rows: 1,
      created_by: TEACHER_PROFILE_ID
    })
  })

  // ───────────────────────────────────────────────────────────
  console.log("\n[1] 학부모 계정 없는 예약 저장")
  {
    const before = failures
    await admin("trial_applications", {
      method: "POST",
      body: JSON.stringify({
        id: IMPORTED_APP_ID,
        parent_id: null,
        class_id: CLASS_ID,
        child_name: "이관학생",
        child_grade: "elem_3",
        parent_name: "이관보호자",
        parent_phone: "01011112222",
        requested_slot_at: new Date(Date.now() + 86400000).toISOString(),
        status: "new",
        import_batch_id: BATCH_ID
      })
    })

    const rows = (await admin(
      `trial_applications?id=eq.${IMPORTED_APP_ID}&select=parent_id,import_batch_id,status,child_name`
    )) as Array<Record<string, unknown>>
    check(rows[0]?.parent_id === null, "parent_id 가 NULL 로 저장되지 않았다")
    check(rows[0]?.import_batch_id === BATCH_ID, "import_batch_id 가 저장되지 않았다")
    check(rows[0]?.child_name === "이관학생", "학생 스냅샷이 저장되지 않았다")
    passLine(before, "학부모 계정 없이 예약이 저장된다(가짜 계정 생성 없음)")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[2] 이관 예약은 학부모 화면에 보이지 않는다")
  {
    const before = failures
    const parentView = await request(
      `trial_applications?select=id&id=eq.${IMPORTED_APP_ID}`,
      parentToken
    )
    check(parentView.ok, `학부모 조회 자체가 실패했다: ${parentView.status}`)
    check(
      Array.isArray(parentView.body) && parentView.body.length === 0,
      "이관 예약이 학부모에게 노출됐다"
    )

    const teacherView = await request(
      `trial_applications?select=id,parent_id&id=eq.${IMPORTED_APP_ID}`,
      teacherToken
    )
    check(
      Array.isArray(teacherView.body) && teacherView.body.length === 1,
      "학원이 이관 예약을 조회하지 못했다"
    )
    passLine(before, "학부모 `/my` 에는 안 보이고 Studio 에서는 보인다")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[3] 기존 학부모 신청 회귀 없음")
  {
    const before = failures
    await admin("trial_applications", {
      method: "POST",
      body: JSON.stringify({
        id: PARENT_APP_ID,
        parent_id: PARENT_PROFILE_ID,
        class_id: CLASS_ID,
        child_name: "기존학생",
        child_grade: "elem_2",
        requested_slot_at: new Date(Date.now() + 172800000).toISOString(),
        status: "new"
      })
    })

    const parentView = await request(
      `trial_applications?select=id,parent_id,import_batch_id&id=eq.${PARENT_APP_ID}`,
      parentToken
    )
    check(
      Array.isArray(parentView.body) && parentView.body.length === 1,
      "기존 학부모 신청이 본인에게 보이지 않는다"
    )
    check(
      parentView.body?.[0]?.import_batch_id === null,
      "Marketplace 신청인데 import_batch_id 가 채워졌다"
    )
    passLine(before, "parent_id 있는 신청은 그대로 본인에게 보인다")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[4] 이관 이력 접근 권한")
  {
    const before = failures
    const own = await request(`studio_import_batches?select=id&id=eq.${BATCH_ID}`, teacherToken)
    check(Array.isArray(own.body) && own.body.length === 1, "자기 조직 batch 를 읽지 못했다")

    await admin("organizations", {
      method: "POST",
      body: JSON.stringify({ id: OTHER_ORG_ID, name: "다른 학원", branch_name: "본원" })
    })
    const otherBatch = (await admin("studio_import_batches", {
      method: "POST",
      body: JSON.stringify({
        organization_id: OTHER_ORG_ID,
        import_type: "trial_reservations",
        status: "previewed"
      })
    })) as Array<{ id: string }>

    const crossOrg = await request(
      `studio_import_batches?select=id&id=eq.${otherBatch[0]!.id}`,
      teacherToken
    )
    check(
      Array.isArray(crossOrg.body) && crossOrg.body.length === 0,
      "다른 조직 이관 이력이 조회됐다"
    )

    const write = await request("studio_import_batches", teacherToken, {
      method: "POST",
      body: JSON.stringify({
        organization_id: ORG_ID,
        import_type: "trial_reservations",
        status: "previewed"
      })
    })
    check(!write.ok, "학원 사용자가 이관 이력을 직접 만들 수 있다")
    passLine(before, "자기 조직만 읽고, 직접 쓰기는 막힌다")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[5] 가져오기 transaction · 확정 예약 · 시간대")
  {
    const before = failures
    const batchId = await createBatch()
    const startAt = "2026-09-15T07:00:00.000Z" // 서울 16:00
    const endAt = "2026-09-15T08:00:00.000Z" // 서울 17:00
    const result = await rpc("import_studio_trial_reservations", {
      p_batch_id: batchId,
      p_rows: [
        importRow(2, { status: "new" }),
        importRow(3, { status: "reviewing" }),
        importRow(4, {
          status: "confirmed",
          teacherId: TEACHER_ROSTER_ID,
          confirmedStartAt: startAt,
          confirmedEndAt: endAt
        })
      ]
    })

    check(result.ok, `가져오기 실패: ${JSON.stringify(result.body)}`)
    check(result.body?.mode === "created", `mode 가 created 가 아니다: ${result.body?.mode}`)
    check(result.body?.importedRows === 3, `저장 건수가 다르다: ${result.body?.importedRows}`)

    const applications = (await admin(
      `trial_applications?import_batch_id=eq.${batchId}&select=status,parent_id,confirmed_slot_at,confirmed_schedule_block_id,assigned_teacher_id,requested_slot_at&order=status.asc`
    )) as Array<Record<string, string | null>>
    check(applications.length === 3, `신청 건수가 다르다: ${applications.length}`)
    check(applications.every((row) => row.parent_id === null), "이관 신청에 parent_id 가 채워졌다")

    const confirmed = applications.find((row) => row.status === "confirmed")
    check(Boolean(confirmed?.confirmed_schedule_block_id), "확정 예약에 블록이 연결되지 않았다")
    check(
      confirmed?.confirmed_slot_at !== null &&
        new Date(confirmed!.confirmed_slot_at!).toISOString() === startAt,
      `확정 시각이 밀렸다: ${confirmed?.confirmed_slot_at}`
    )
    check(confirmed?.assigned_teacher_id === TEACHER_ROSTER_ID, "담당 선생님이 배정되지 않았다")

    const block = (await admin(
      `schedule_blocks?id=eq.${confirmed!.confirmed_schedule_block_id}&select=type,start_at,end_at,teacher_id`
    )) as Array<Record<string, string>>
    check(block[0]?.type === "trial_booked", "예약 블록 타입이 다르다")
    check(new Date(block[0]!.start_at!).toISOString() === startAt, "블록 시작 시각이 밀렸다")
    check(new Date(block[0]!.end_at!).toISOString() === endAt, "블록 종료 시각이 밀렸다")

    const importRows = (await admin(
      `studio_import_rows?batch_id=eq.${batchId}&select=status,row_number&order=row_number.asc`
    )) as Array<{ status: string; row_number: number }>
    check(importRows.length === 3, `가져오기 이력 행이 다르다: ${importRows.length}`)
    check(importRows.every((row) => row.status === "imported"), "이력 상태가 imported 가 아니다")

    const batch = (await admin(
      `studio_import_batches?id=eq.${batchId}&select=status,imported_rows,completed_at`
    )) as Array<Record<string, unknown>>
    check(batch[0]?.status === "completed", "batch 가 completed 가 아니다")
    check(batch[0]?.imported_rows === 3, "batch 저장 건수가 다르다")

    passLine(before, "3건 저장 · 확정 예약 블록 생성 · 서울 16:00 그대로")

    // ── 재시도(응답 유실 가정) ────────────────────────────────
    const retryBefore = failures
    const retry = await rpc("import_studio_trial_reservations", {
      p_batch_id: batchId,
      p_rows: [importRow(2, { status: "new" })]
    })
    check(retry.ok, `재시도가 실패했다: ${JSON.stringify(retry.body)}`)
    check(retry.body?.mode === "duplicate", `재시도가 duplicate 가 아니다: ${retry.body?.mode}`)
    const afterRetry = (await admin(
      `trial_applications?import_batch_id=eq.${batchId}&select=id`
    )) as Array<unknown>
    check(afterRetry.length === 3, `재시도로 신청이 늘었다: ${afterRetry.length}`)
    passLine(retryBefore, "같은 batch 재제출 → mutation 0, 첫 결과 그대로")

    // ── SMS 0 ───────────────────────────────────────────────
    const smsBefore = failures
    const importedApplications = (await admin(
      `trial_applications?import_batch_id=eq.${batchId}&select=id`
    )) as Array<{ id: string }>
    const smsRows = (await admin(
      `sms_logs?trial_application_id=in.(${importedApplications.map((row) => row.id).join(",")})&select=id`
    )) as Array<unknown>
    check(smsRows.length === 0, `가져오기로 SMS 가 발생했다: ${smsRows.length}건`)
    passLine(smsBefore, "가져오기 SMS 0건")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[6] 원자성 — 한 행이라도 실패하면 전부 롤백")
  {
    const before = failures
    const batchId = await createBatch()
    const result = await rpc("import_studio_trial_reservations", {
      p_batch_id: batchId,
      p_rows: [
        importRow(2, { status: "new" }),
        importRow(3, { status: "new" }),
        // 3번째 행에서 실패시킨다(허용되지 않는 상태).
        importRow(4, { status: "completed" })
      ]
    })

    check(!result.ok, "허용되지 않는 상태가 통과했다")
    const applications = (await admin(
      `trial_applications?import_batch_id=eq.${batchId}&select=id`
    )) as Array<unknown>
    const importRows = (await admin(
      `studio_import_rows?batch_id=eq.${batchId}&select=id`
    )) as Array<unknown>
    const batch = (await admin(
      `studio_import_batches?id=eq.${batchId}&select=status,imported_rows`
    )) as Array<Record<string, unknown>>

    check(applications.length === 0, `부분 저장된 신청이 남았다: ${applications.length}`)
    check(importRows.length === 0, `부분 저장된 이력이 남았다: ${importRows.length}`)
    check(batch[0]?.status === "previewed", "실패했는데 batch 상태가 바뀌었다")
    check(batch[0]?.imported_rows === 0, "실패했는데 저장 건수가 기록됐다")
    passLine(before, "3번째 행 실패 → 신청 0 · 블록 0 · 이력 0 (부분 저장 없음)")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[7] 다른 조직 수업·선생님 주입")
  {
    const before = failures
    // [4] 에서 이미 만들었으면 그대로 쓴다.
    await admin("organizations", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: OTHER_ORG_ID, name: "다른 학원", branch_name: "본원" })
    })
    const otherTeacher = (await admin("teachers", {
      method: "POST",
      body: JSON.stringify({
        organization_id: OTHER_ORG_ID,
        display_name: "다른 선생님"
      })
    })) as Array<{ id: string }>
    const otherClass = (await admin("classes", {
      method: "POST",
      body: JSON.stringify({
        organization_id: OTHER_ORG_ID,
        teacher_id: otherTeacher[0]!.id,
        title: "다른 조직 수업",
        subject: "미술",
        target_age: "7-9",
        description: "fixture",
        trial_price: 0,
        is_active: true
      })
    })) as Array<{ id: string }>

    const batchId = await createBatch()
    const crossOrgClass = await rpc("import_studio_trial_reservations", {
      p_batch_id: batchId,
      p_rows: [importRow(2, { status: "new", classId: otherClass[0]!.id })]
    })
    check(!crossOrgClass.ok, "다른 조직 수업이 통과했다")
    check(
      JSON.stringify(crossOrgClass.body).includes("import_class_not_in_organization"),
      `기대한 오류가 아니다: ${JSON.stringify(crossOrgClass.body)}`
    )

    const crossOrgTeacher = await rpc("import_studio_trial_reservations", {
      p_batch_id: batchId,
      p_rows: [
        importRow(2, {
          status: "confirmed",
          teacherId: otherTeacher[0]!.id,
          confirmedStartAt: "2026-09-15T07:00:00.000Z",
          confirmedEndAt: "2026-09-15T08:00:00.000Z"
        })
      ]
    })
    check(!crossOrgTeacher.ok, "다른 조직 선생님이 통과했다")
    check(
      JSON.stringify(crossOrgTeacher.body).includes("import_teacher_not_in_organization"),
      `기대한 오류가 아니다: ${JSON.stringify(crossOrgTeacher.body)}`
    )

    const applications = (await admin(
      `trial_applications?import_batch_id=eq.${batchId}&select=id`
    )) as Array<unknown>
    check(applications.length === 0, "거절됐는데 신청이 남았다")

    await admin(`classes?id=eq.${otherClass[0]!.id}`, { method: "DELETE" })
    await admin(`teachers?id=eq.${otherTeacher[0]!.id}`, { method: "DELETE" })
    passLine(before, "다른 조직 수업·선생님 → 전체 거절, mutation 0")
  }

  await teardown()

  if (failures > 0) {
    console.error(`\nFAIL: ${failures}건 실패`)
    process.exit(1)
  }

  console.log("\nPASS: 예약 가져오기 저장소 검증 완료")
}

run().catch(async (error) => {
  console.error("\n검증 중 예외:", error)
  await teardown().catch(() => undefined)
  process.exit(1)
})
