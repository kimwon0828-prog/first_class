// 기존 예약 엑셀 가져오기 검증.
//
//   npx supabase start && npx tsx scripts/verify-reservation-import.ts
//
// 여기서 고정하는 계약.
//   1. 이관 예약은 학부모 계정 없이 존재할 수 있다(parent_id = NULL).
//   2. 그래도 어떤 학부모의 `/my` 에도 나타나지 않는다 — RLS 가 parent_id = auth.uid() 라서다.
//   3. 기존 Marketplace 신청(parent_id 있음)의 동작은 그대로다.
//   4. 이관 이력은 자기 조직만 읽을 수 있고, 학원 사용자가 직접 쓸 수 없다.
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

const teardown = async () => {
  await admin(`application_logs?application_id=in.(${IMPORTED_APP_ID},${PARENT_APP_ID})`, { method: "DELETE" })
  await admin(`trial_applications?id=in.(${IMPORTED_APP_ID},${PARENT_APP_ID})`, { method: "DELETE" })
  await admin(`studio_import_rows?batch_id=eq.${BATCH_ID}`, { method: "DELETE" })
  await admin(`studio_import_batches?id=eq.${BATCH_ID}`, { method: "DELETE" })
  await admin(`studio_import_batches?organization_id=eq.${OTHER_ORG_ID}`, { method: "DELETE" })
  await admin(`organizations?id=eq.${OTHER_ORG_ID}`, { method: "DELETE" })
}

const run = async () => {
  await teardown()

  const teacherToken = createToken(TEACHER_PROFILE_ID)
  const parentToken = createToken(PARENT_PROFILE_ID)

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
