// 공개 수업 목록의 Standard 우선 노출 정렬 검증.
//
//   npx supabase start && npx tsx scripts/verify-marketplace-ranking.ts
//
// 앱이 실제로 보내는 질의(public-class-safe-projection 의 buildPublicClassesQuery)와
// 같은 형태로 조회한다.
//   from marketplace_ranked_classes
//   where is_active
//   order by boost_eligible desc, created_at desc
//   (+ limit)
//
// 여기서 고정하는 계약.
//   1. Standard 는 오래된 수업이어도 Free 최신 수업보다 위다.
//   2. 각 그룹 안에서는 기존 organic 순서(created_at desc)가 그대로다.
//   3. 정렬이 limit 보다 먼저다 — 기본 화면 fetch limit(10) 안으로 Standard 가 들어온다.
//   4. 내부 전체 권한만 있는 조직은 우선 노출을 받지 못한다.
//   5. boost 는 filter 가 아니다 — 무료 수업이 목록에서 사라지지 않는다.
//   6. 과목 필터가 boost 와 무관하게 그대로 동작한다.
//   7. 정렬 source 가 죽어도 organic 목록은 그대로 나온다(fail-safe organic).
//
// 로컬 Supabase 전용이다.

const REST_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321"
const SERVICE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

if (!REST_URL.includes("127.0.0.1") && !REST_URL.includes("localhost")) {
  console.error("이 스크립트는 로컬 Supabase 전용이다.")
  process.exit(1)
}

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

const STANDARD_ORG = "c0a10000-0000-4000-8000-000000000001"
const FREE_ORG = "c0a10000-0000-4000-8000-000000000002"
const INTERNAL_ORG = "c0a10000-0000-4000-8000-000000000003"
const ORGS = [STANDARD_ORG, FREE_ORG, INTERNAL_ORG]
const CLASS_PREFIX = "c0a11111"
const classId = (index: number) => `${CLASS_PREFIX}-0000-4000-8000-${String(index).padStart(12, "0")}`

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

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString()

/** 앱과 같은 조회. limit 은 기본 discovery 화면의 fetch limit 을 흉내낸다. */
const listRanked = async (options?: { limit?: number; subjectFilter?: string }) => {
  const params = [
    "select=id,title,organization_id,created_at,boost_eligible",
    "is_active=eq.true",
    `organization_id=in.(${ORGS.join(",")})`,
    "order=boost_eligible.desc,created_at.desc"
  ]
  if (options?.subjectFilter) {
    params.push(`subject=eq.${encodeURIComponent(options.subjectFilter)}`)
  }
  if (options?.limit) {
    params.push(`limit=${options.limit}`)
  }
  return (await admin(`marketplace_ranked_classes?${params.join("&")}`)) as Array<{
    id: string
    title: string
    organization_id: string
    created_at: string
    boost_eligible: boolean
  }>
}

/** 로컬 DB 에 직접 SQL 을 보낸다(권한 회수/복구 전용). */
const sql = async (statement: string) => {
  const { execFile } = await import("node:child_process")
  const { promisify } = await import("node:util")
  await promisify(execFile)("docker", [
    "exec",
    "-i",
    "supabase_db_first-class-mvp",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-q",
    "-c",
    statement
  ])
}

/** 정렬 view 조회. 실패 여부까지 그대로 돌려준다. */
const listRankedRaw = async () => {
  const response = await fetch(
    `${REST_URL}/rest/v1/marketplace_ranked_classes?select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  )
  return { ok: response.ok, status: response.status }
}

/** fallback 경로. 앱의 organic source 와 같은 필터·정렬이다. */
const listOrganic = async () =>
  (await admin(
    `classes?select=id,title,organization_id,created_at&is_active=eq.true&organization_id=in.(${ORGS.join(
      ","
    )})&order=created_at.desc`
  )) as Array<{ id: string; title: string; organization_id: string; created_at: string }>

const teardown = async () => {
  await admin(`classes?organization_id=in.(${ORGS.join(",")})`, { method: "DELETE" })
  await admin(`organization_subscriptions?organization_id=in.(${ORGS.join(",")})`, { method: "DELETE" })
  await admin(`organization_entitlement_overrides?organization_id=in.(${ORGS.join(",")})`, { method: "DELETE" })
  await admin(`organizations?id=in.(${ORGS.join(",")})`, { method: "DELETE" })
}

const makeClass = (
  index: number,
  organizationId: string,
  title: string,
  createdAt: string,
  subject = "미술"
) => ({
  id: classId(index),
  organization_id: organizationId,
  title,
  subject,
  target_age: "7-9",
  description: "정렬 검증 fixture",
  trial_price: 0,
  is_active: true,
  created_at: createdAt
})

const run = async () => {
  await teardown()

  await admin("organizations", {
    method: "POST",
    body: JSON.stringify([
      { id: STANDARD_ORG, name: "스탠다드 학원", branch_name: "본원" },
      { id: FREE_ORG, name: "무료 학원", branch_name: "본원" },
      { id: INTERNAL_ORG, name: "내부 조직", branch_name: "본원" }
    ])
  })
  await admin("organization_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      organization_id: STANDARD_ORG,
      plan_code: "standard",
      subscription_status: "active",
      current_period_start: iso(-30),
      current_period_end: iso(30)
    })
  })
  await admin("organization_entitlement_overrides", {
    method: "POST",
    body: JSON.stringify({
      organization_id: INTERNAL_ORG,
      full_access: true,
      reason: "검증용 내부 전체 권한"
    })
  })

  // ─────────────────────────────────────────────────────────
  console.log("\n[1] Standard 우선 · 그룹 안에서는 최신순 (A~D)")
  {
    const before = failures
    await admin("classes", {
      method: "POST",
      body: JSON.stringify([
        makeClass(1, FREE_ORG, "A 무료-최신", iso(-1)),
        makeClass(2, FREE_ORG, "B 무료-과거", iso(-40)),
        makeClass(3, STANDARD_ORG, "C 스탠다드-최신", iso(-5)),
        makeClass(4, STANDARD_ORG, "D 스탠다드-과거", iso(-50))
      ])
    })

    const rows = await listRanked()
    const titles = rows.map((row) => row.title)
    check(
      JSON.stringify(titles) ===
        JSON.stringify(["C 스탠다드-최신", "D 스탠다드-과거", "A 무료-최신", "B 무료-과거"]),
      `정렬이 기대와 다르다: ${titles.join(" > ")}`
    )
    check(
      rows.findIndex((row) => row.title === "D 스탠다드-과거") <
        rows.findIndex((row) => row.title === "A 무료-최신"),
      "오래된 Standard 가 최신 무료보다 아래에 있다"
    )
    passLine(before, `${titles.join("  >  ")}`)
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[2] 기본 화면 fetch limit(10) 안으로 Standard 가 들어온다")
  {
    const before = failures
    await admin(`classes?organization_id=in.(${ORGS.join(",")})`, { method: "DELETE" })
    const rows = [makeClass(1, STANDARD_ORG, "스탠다드-아주 오래된 수업", iso(-365))]
    for (let index = 0; index < 10; index += 1) {
      rows.push(makeClass(index + 2, FREE_ORG, `무료-최신 ${index + 1}`, iso(-index - 1)))
    }
    await admin("classes", { method: "POST", body: JSON.stringify(rows) })

    const top10 = await listRanked({ limit: 10 })
    check(top10.length === 10, `limit 10 인데 ${top10.length}건이 왔다`)
    check(
      top10[0]?.title === "스탠다드-아주 오래된 수업",
      `1년 지난 Standard 수업이 최상단이 아니다: ${top10[0]?.title}`
    )
    // 정렬이 limit 뒤였다면 created_at 기준 11번째라 아예 들어오지 못한다.
    check(
      top10.some((row) => row.title === "스탠다드-아주 오래된 수업"),
      "정렬이 limit 이후에 적용됐다 — Standard 수업이 상위 10개에서 누락됐다"
    )
    passLine(before, "무료 최신 10건보다 위 — 정렬이 limit 이전에 적용된다")
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[3] 내부 전체 권한만 있는 조직은 우선 노출 없음")
  {
    const before = failures
    await admin(`classes?organization_id=in.(${ORGS.join(",")})`, { method: "DELETE" })
    await admin("classes", {
      method: "POST",
      body: JSON.stringify([
        makeClass(1, INTERNAL_ORG, "내부-최신", iso(-1)),
        makeClass(2, STANDARD_ORG, "스탠다드-과거", iso(-30)),
        makeClass(3, FREE_ORG, "무료-과거", iso(-20))
      ])
    })

    const rows = await listRanked()
    const internal = rows.find((row) => row.title === "내부-최신")
    check(internal?.boost_eligible === false, "내부 전체 권한 조직이 우선 노출을 받았다")
    check(rows[0]?.title === "스탠다드-과거", `최상단이 Standard 가 아니다: ${rows[0]?.title}`)
    // 내부 조직 수업은 사라지지 않고 organic 순서에 그대로 있다.
    check(
      rows.findIndex((row) => row.title === "내부-최신") <
        rows.findIndex((row) => row.title === "무료-과거"),
      "내부 조직 수업이 organic 순서(최신순)를 벗어났다"
    )
    passLine(before, "Studio 는 열려도 공개 목록에서는 organic — 노출 자체는 유지")
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[4] 같은 조직 수업 여러 개 (현재 동작 기록)")
  {
    const before = failures
    await admin(`classes?organization_id=in.(${ORGS.join(",")})`, { method: "DELETE" })
    await admin("classes", {
      method: "POST",
      body: JSON.stringify([
        makeClass(1, STANDARD_ORG, "스탠다드 1", iso(-3)),
        makeClass(2, STANDARD_ORG, "스탠다드 2", iso(-4)),
        makeClass(3, STANDARD_ORG, "스탠다드 3", iso(-5)),
        makeClass(4, FREE_ORG, "무료 1", iso(-1))
      ])
    })

    const rows = await listRanked()
    check(
      rows.slice(0, 3).every((row) => row.organization_id === STANDARD_ORG),
      "Standard 조직 수업이 연속으로 상단에 오지 않았다"
    )
    check(rows[3]?.title === "무료 1", "무료 수업이 목록에서 사라졌다")
    // v1 계약: 조직 다양성 제한은 없다. MARKET-2 debt 로 남긴다.
    passLine(
      before,
      "한 Standard 조직이 상단을 연속 점유할 수 있다 (조직 다양성 제한은 MARKET-2 debt)"
    )
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[5] boost 는 filter 가 아니다 · 과목 필터 유지")
  {
    const before = failures
    await admin(`classes?organization_id=in.(${ORGS.join(",")})`, { method: "DELETE" })
    await admin("classes", {
      method: "POST",
      body: JSON.stringify([
        makeClass(1, STANDARD_ORG, "스탠다드 미술", iso(-2), "미술"),
        makeClass(2, FREE_ORG, "무료 미술", iso(-1), "미술"),
        makeClass(3, FREE_ORG, "무료 피아노", iso(-1), "피아노")
      ])
    })

    const all = await listRanked()
    check(all.length === 3, `무료 수업이 빠졌다: ${all.length}건`)

    const onlyArt = await listRanked({ subjectFilter: "미술" })
    check(onlyArt.length === 2, `과목 필터 결과가 다르다: ${onlyArt.length}건`)
    check(
      onlyArt[0]?.title === "스탠다드 미술",
      "필터 결과 안에서 Standard 우선이 적용되지 않았다"
    )
    check(
      onlyArt.every((row) => row.title !== "무료 피아노"),
      "과목 필터가 boost 때문에 무너졌다"
    )
    passLine(before, "무료 수업 유지 · 필터 통과 결과 안에서만 순서 변경")
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[6] 정렬 source 장애 → organic fallback")
  {
    const before = failures
    await admin(`classes?organization_id=in.(${ORGS.join(",")})`, { method: "DELETE" })
    await admin("classes", {
      method: "POST",
      body: JSON.stringify([
        makeClass(1, STANDARD_ORG, "스탠다드-과거", iso(-30)),
        makeClass(2, FREE_ORG, "무료-최신", iso(-1))
      ])
    })

    // 정렬 view 를 읽을 수 없게 만든다(권한 회수). 앱이 보는 실패와 같은 형태다.
    await sql("revoke select on table public.marketplace_ranked_classes from service_role;")
    try {
      const rankedFailed = await listRankedRaw()
      check(rankedFailed.ok === false, "정렬 source 가 죽었는데 조회가 성공했다")

      // fallback 대상(classes organic). 필터·limit 은 그대로이고 boost 정렬만 빠진다.
      const organic = await listOrganic()
      check(organic.length === 2, `organic fallback 결과가 다르다: ${organic.length}건`)
      check(
        organic[0]?.title === "무료-최신",
        `fallback 이 created_at desc 가 아니다: ${organic[0]?.title}`
      )
      check(
        organic.some((row) => row.title === "스탠다드-과거"),
        "fallback 에서 Standard 수업이 사라졌다"
      )
    } finally {
      await sql("grant select on table public.marketplace_ranked_classes to service_role;")
    }

    // 복구되면 다시 우선 노출이 적용된다.
    const restored = await listRanked()
    check(restored[0]?.title === "스탠다드-과거", "권한 복구 후 우선 노출이 돌아오지 않았다")
    passLine(before, "정렬 source 장애 → 두 수업 모두 organic 순서로 유지, 복구되면 boost 복원")
  }

  await teardown()

  if (failures > 0) {
    console.error(`\nFAIL: ${failures}건 실패`)
    process.exit(1)
  }

  console.log("\nPASS: Marketplace 정렬 검증 완료")
}

run().catch(async (error) => {
  console.error("\n검증 중 예외:", error)
  await teardown().catch(() => undefined)
  process.exit(1)
})
