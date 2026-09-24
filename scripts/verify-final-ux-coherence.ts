// 화면 전반의 일관성 계약 검증.
//
//   npx tsx scripts/verify-final-ux-coherence.ts
//
// R8 은 기능을 만들지 않는다. 고정하는 것은 "같은 것을 같게 말하는가" 다.
//
//   1. 같은 뜻에 다른 이름을 쓰지 않는다 (결과 미확정 · 미등록).
//   2. 같은 기간 필터로 서로 다른 모집단을 조용히 쓰지 않는다.
//   3. 학부모 화면에 평가 · 점수 · 성향 언어가 없다.
//   4. 학부모 화면 폭 계약을 지킨다.
//   5. 화면마다 primary CTA 가 하나다.
//   6. 조회 실패와 데이터 없음을 구분한다.
//   7. 학원 내부 값이 학부모 화면으로 새지 않는다.
//   8. 날짜는 공용 KST helper 하나로 읽는다.
//
// 순수 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripTs = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
const stripJsx = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const clean = (source: string) => stripJsx(stripTs(source))

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(resolve(process.cwd(), dir))) {
    const rel = join(dir, entry)
    const full = resolve(process.cwd(), rel)
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue
      walk(rel, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(rel)
    }
  }
  return out
}

/** 학부모가 실제로 보는 화면·컴포넌트. */
const PARENT_SURFACES = [
  ...walk("app/record"),
  ...walk("app/my"),
  ...walk("src/features/record"),
  ...walk("src/features/profile"),
  ...walk("src/features/decisions/ui")
]
const DASHBOARD_PAGE = "app/studio/(dashboard)/page.tsx"
const DASHBOARD_CODE = clean(read(DASHBOARD_PAGE))

console.log("── 1. 같은 뜻에 같은 이름 ──")
{
  // "결정 대기" 는 "결과 미확정" 과 같은 뜻이다. 한 화면에 둘 다 있으면 안 된다.
  const offenders = [
    "src/features/studio/lib/studio-dashboard-analytics.ts",
    "src/features/reports/lib/conversion-infographic-model.ts",
    DASHBOARD_PAGE
  ].filter((path) => clean(read(path)).includes("결정 대기"))
  check("'결정 대기' 를 남겨 두지 않는다", offenders.length === 0, offenders.join(", "))
  check(
    "도넛이 '결과 미확정' 을 쓴다",
    clean(read("src/features/studio/lib/studio-dashboard-analytics.ts")).includes("결과 미확정")
  )
  check(
    "공유 리포트도 같은 말을 쓴다",
    clean(read("src/features/reports/lib/conversion-infographic-model.ts")).includes("결과 미확정")
  )
  check(
    // 학원 정보가 비어 있는 것과 학생이 등록하지 않은 것은 다른 사실이다.
    "학원 정보 미입력을 '미등록' 이라 부르지 않는다",
    !clean(read("src/features/studio/ui/studio-mypage-profile-page.tsx")).includes('"미등록"')
  )
  check(
    "결과 미확정을 미등록에 합치지 않는다",
    clean(read("src/features/studio/lib/studio-dashboard-analytics.ts")).includes("미확정") &&
      !DASHBOARD_CODE.includes("미등록으로 간주") &&
      !DASHBOARD_CODE.includes("미등록 처리")
  )
}

console.log("\n── 2. 기간 필터가 무엇을 세는지 밝힌다 ──")
{
  check("신청일 기준을 명시한다", DASHBOARD_CODE.includes("신청일 기준"))
  check("기간은 분석에만 적용한다", DASHBOARD_CODE.includes("기간 선택은 분석에만 적용됩니다"))
  check("기간 state는 하나다", (DASHBOARD_CODE.match(/resolveStudioDateRange\(/g) ?? []).length === 1)
  check("업무 조회는 기간 제한이 없다", DASHBOARD_CODE.includes("getStudioApplications(teacher.organizationId)"))
  check("핵심 인포그래픽이 업무보다 먼저 온다", DASHBOARD_CODE.indexOf('id="dashboard-flow-title"') < DASHBOARD_CODE.indexOf('id="dashboard-actions-title"'))
  check("대형 전환/부모 의향 matrix 조회를 제거한다", !DASHBOARD_CODE.includes("getStudioConversionAnalytics"))

}

console.log("\n── 3. 학부모 화면에 평가 언어가 없다 ──")
{
  const TRAIT_WORDS = [
    "강점", "약점", "성향", "적성", "점수", "등급", "순위", "랭킹", "상위",
    "백분율", "진단", "분석 결과", "추천 유형", "능력치", "지수"
  ]
  for (const path of PARENT_SURFACES) {
    const code = clean(read(path))
    const hits = TRAIT_WORDS.filter((word) => code.includes(word))
    if (hits.length > 0) {
      check(`${path} 에 평가 언어가 없다`, false, hits.join(", "))
    }
  }
  check(
    "학부모 화면 전체에 평가 언어 없음",
    PARENT_SURFACES.every((path) => TRAIT_WORDS.every((word) => !clean(read(path)).includes(word)))
  )
  check(
    "교육 프로필이 선생님의 관찰 원문으로 말한다",
    clean(read("app/record/profile/page.tsx")).includes("선생님의 관찰")
  )
  check(
    "리포트가 '체험 리포트' 다",
    clean(read("app/record/[experienceId]/report/report-frame.tsx")).includes("체험 리포트") &&
      !clean(read("app/record/[experienceId]/report/page.tsx")).includes("결과표")
  )
  check(
    "부모 의향을 운영 상태처럼 묻지 않는다",
    clean(read("src/features/decisions/ui/parent-decision-form.tsx")).includes("현재 생각은 어떤가요") &&
      !clean(read("src/features/decisions/ui/parent-decision-form.tsx")).includes("등록 상태 선택")
  )
}

console.log("\n── 4. 학부모 폭 계약 ──")
{
  const PARENT_PAGE_CSS = [
    "app/record/page.module.css",
    "app/record/profile/page.module.css",
    "app/record/[experienceId]/page.module.css",
    "app/record/[experienceId]/report/page.module.css"
  ]
  for (const path of PARENT_PAGE_CSS) {
    const css = read(path)
    check(`${path.split("/").slice(-2).join("/")} 가 --col 폭을 쓴다`, css.includes("max-width: var(--col)"))
  }
  check(
    // desktop 에서 갑자기 2단이 되면 같은 제품이 두 개처럼 보인다.
    "학부모 화면이 2-column 으로 벌어지지 않는다",
    PARENT_PAGE_CSS.every(
      (path) => !/grid-template-columns:\s*(1fr\s+1fr|repeat\(2)/.test(read(path))
    )
  )
  check("--col 이 480px 이다", read("app/globals.css").includes("--col: 480px"))
}

console.log("\n── 5. primary CTA 는 하나 ──")
{
  // 같은 무게의 버튼이 여러 개면 무엇부터 할지 알 수 없다.
  const countPrimary = (path: string) =>
    (clean(read(path)).match(/styles\.primaryButton|styles\.primaryCta|styles\.primaryAction/g) ?? [])
      .length
  for (const path of [
    "app/record/page.tsx",
    "app/record/[experienceId]/page.tsx",
    "app/record/profile/page.tsx"
  ]) {
    check(`${path.split("/").slice(1).join("/")} 의 primary CTA ≤ 1`, countPrimary(path) <= 1, `actual ${countPrimary(path)}`)
  }
}

console.log("\n── 6. 실패와 없음을 구분한다 ──")
{
  for (const [label, path, errorToken, emptyToken] of [
    ["교육 프로필", "app/record/profile/page.tsx", 'result.state === "error"', "아직 발행된 체험 리포트가 없어요"],
    ["대시보드", DASHBOARD_PAGE, "{error ?", "선택 기간에 접수된 신청이 없습니다"]
  ] as const) {
    const code = clean(read(path))
    check(`${label} 이 조회 실패와 데이터 없음을 나눈다`, code.includes(errorToken) && code.includes(emptyToken))
  }
  check("빈 도넛에 안내를 표시한다", DASHBOARD_CODE.includes("아직 체험 완료 기록이 없습니다."))
  check("0으로 나누지 않는다", DASHBOARD_CODE.includes('total ? `${(segment.count / total * 100).toFixed(1)}%` : "—"'))

}

console.log("\n── 7. 학원 내부 값이 학부모 화면에 없다 ──")
{
  const INTERNAL = [
    "registrationStatus", "registration_status", "unregisteredReason", "unregistered_reason",
    "consultationNote", "consultation_note", "followUpNote", "nextContactAt",
    "assignedTeacherId", "trialFeedback", "lostAt", "enrolledAt"
  ]
  const leaks: string[] = []
  for (const path of PARENT_SURFACES) {
    const code = clean(read(path))
    for (const field of INTERNAL) {
      if (new RegExp(`[.\\s"'\`]${field}\\b`).test(code)) leaks.push(`${path}:${field}`)
    }
  }
  check("학부모 화면에 학원 내부 필드가 없다", leaks.length === 0, leaks.slice(0, 6).join(", "))
}

console.log("\n── 8. 날짜는 공용 helper 로 읽는다 ──")
{
  const offenders: string[] = []
  for (const path of PARENT_SURFACES) {
    const code = clean(read(path))
    // 실행 환경 timezone 을 따르는 호출은 KST 화면에서 하루가 밀린다.
    if (/\.getFullYear\(\)|\.getMonth\(\)|\.getDate\(\)/.test(code)) offenders.push(path)
  }
  check("학부모 화면이 local timezone getter 를 쓰지 않는다", offenders.length === 0, offenders.join(", "))
  check(
    "공용 KST helper 를 쓴다",
    clean(read("src/features/profile/lib/education-profile-timeline.ts")).includes("getSeoulDateTimeParts") &&
      clean(read("app/record/[experienceId]/report/page.tsx")).includes("getSeoulDateTimeParts")
  )
}

console.log("\n── 9. 접근성 ──")
{
  check(
    // h2 다음에 h4 가 오면 보조기기가 한 단계를 건너뛴 것으로 읽는다.
    "부모 리포트 미리보기가 heading 단계를 건너뛰지 않는다",
    !clean(read("src/features/studio/ui/application-report-publishing.tsx")).includes(
      "<h4 className={styles.reportSectionTitle}>"
    )
  )
  check(
    "차트는 숫자 범례를 제공한다",
    DASHBOARD_CODE.includes("<strong>{segment.count}</strong>")
  )
  check(
    "분석 섹션에 접근성 이름이 있다",
    DASHBOARD_CODE.includes('aria-label="핵심 성과 분석"')
  )
  check(
    "자녀 선택이 현재 선택을 색 말고도 알린다",
    clean(read("src/features/record/ui/record-home.tsx")).includes("HomeChildSelector") &&
      clean(read("src/features/children/ui/home-child-selector.tsx")).includes("aria-current")
  )
}

console.log("\n── 10. 질의가 늘지 않았다 ──")
{
  const adapter = clean(read("src/shared/lib/db/supabase-adapter.ts"))
  check(
    "전환 분석은 표당 한 번씩이다",
    adapter.includes("Promise.all([") && adapter.includes('.in("application_id", applicationIds)')
  )
  check(
    "교육 프로필도 두 번으로 끝난다",
    (() => {
      // 함수 경계로 자른다. 넉넉히 잘라 보면 다음 함수의 질의까지 세어진다.
      const start = adapter.indexOf("async listMyPublishedReportsByChild")
      const rest = adapter.slice(start + 1)
      const next = rest.search(/\n  async [a-zA-Z]/)
      const block = next === -1 ? rest : rest.slice(0, next)
      return (block.match(/await supabase\s*\n?\s*\.from\(/g) ?? []).length <= 2
    })()
  )
  check(
    "대시보드가 신청을 한 번만 읽는다",
    (DASHBOARD_CODE.match(/getStudioApplications\(/g) ?? []).length === 1
  )
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
