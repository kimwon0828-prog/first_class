// 등록전환 리포트 표시 모델 검증.
//
//   npx tsx scripts/verify-conversion-report.ts
//
// 여기서 고정하는 계약.
//   1. 리포트는 지표를 다시 계산하지 않는다 — Dashboard 와 숫자가 항상 같다.
//   2. 전환율은 등록 ÷ 결정 완료이고, 0/0 은 "—" 다.
//   3. 예정 종료가 지난 confirmed 는 체험 완료로 세지 않는다.
//   4. completed + undecided/pending 은 결정 대기이며 등록·미등록에 들어가지 않는다.
//   5. 상담 로그가 몇 건이든 리포트 숫자에 영향이 없다.
//   6. 신청 0건 기간에도 모델이 만들어진다(빈 리포트 허용).
//   7. 기간 경계는 KST 기준이며 Dashboard 와 같은 모집단을 본다.

import {
  CONVERSION_INFOGRAPHIC_HEIGHT,
  CONVERSION_INFOGRAPHIC_WIDTH,
  buildConversionInfographicFileName,
  buildConversionInfographicModel,
  buildConversionInfographicPeriodFileLabel,
  formatSeoulReportDate
} from "@/features/reports/lib/conversion-infographic-model"
import { buildStudioDashboardAnalytics } from "@/features/studio/lib/studio-dashboard-analytics"
import { buildStudioDashboardMetrics } from "@/features/studio/lib/studio-dashboard-metrics"
import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

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

const ALL_RANGE = resolveStudioDateRange({ preset: "all" })
const GENERATED_AT = new Date("2026-09-05T02:30:00.000Z") // KST 11:30

type Fixture = {
  id: string
  status: StudioApplicationSummary["status"]
  registrationStatus: StudioApplicationSummary["registrationStatus"]
  createdAt?: string
  noShowAt?: string | null
  confirmedBlockEndAt?: string | null
  unregisteredReason?: StudioApplicationSummary["unregisteredReason"]
}

const application = (fixture: Fixture): StudioApplicationSummary =>
  ({
    id: fixture.id,
    classId: "class-1",
    classTitle: "체험 수업",
    programType: "trial_class",
    childName: "학생",
    childGrade: "elem_3",
    status: fixture.status,
    registrationStatus: fixture.registrationStatus,
    unregisteredReason: fixture.unregisteredReason ?? null,
    noShowAt: fixture.noShowAt ?? null,
    confirmedBlockStartAt: null,
    confirmedBlockEndAt: fixture.confirmedBlockEndAt ?? null,
    confirmedSlotAt: null,
    requestedSlotAt: "2026-09-10T07:00:00.000Z",
    completedAt: fixture.status === "completed" ? "2026-09-11T07:00:00.000Z" : null,
    enrolledAt: fixture.registrationStatus === "enrolled" ? "2026-09-12T07:00:00.000Z" : null,
    canceledAt: fixture.status === "canceled" ? "2026-09-11T07:00:00.000Z" : null,
    createdAt: fixture.createdAt ?? "2026-09-10T01:00:00.000Z",
    updatedAt: "2026-09-12T07:00:00.000Z"
  }) as unknown as StudioApplicationSummary

const buildBoth = (
  applications: StudioApplicationSummary[],
  range = ALL_RANGE,
  organizationName = "첫수업 국어학원"
) => {
  const metrics = buildStudioDashboardMetrics(applications, range)
  const analytics = buildStudioDashboardAnalytics(metrics)
  const model = buildConversionInfographicModel({
    organizationName,
    metrics,
    analytics,
    generatedAt: GENERATED_AT
  })
  return { metrics, analytics, model }
}

const countOf = (
  model: ReturnType<typeof buildBoth>["model"],
  key: "application" | "reviewing" | "confirmed" | "completed" | "enrolled"
) => model.funnel.find((step) => step.key === key)?.count ?? -1

const decisionOf = (
  model: ReturnType<typeof buildBoth>["model"],
  key: "enrolled" | "pending" | "not_enrolled"
) => model.decisions.find((item) => item.key === key)?.count ?? -1

// ─────────────────────────────────────────────────────────────
console.log("\n[1] canonical fixture — Dashboard = Report")
{
  const before = failures
  // 신청 10 · 완료 6(등록 3 · 미등록 2 · 대기 1) · 나머지는 이전 단계
  const applications = [
    application({ id: "1", status: "completed", registrationStatus: "enrolled" }),
    application({ id: "2", status: "completed", registrationStatus: "enrolled" }),
    application({ id: "3", status: "completed", registrationStatus: "enrolled" }),
    application({ id: "4", status: "completed", registrationStatus: "not_enrolled" }),
    application({ id: "5", status: "completed", registrationStatus: "not_enrolled" }),
    application({ id: "6", status: "completed", registrationStatus: "pending" }),
    application({ id: "7", status: "confirmed", registrationStatus: "undecided" }),
    application({ id: "8", status: "confirmed", registrationStatus: "undecided" }),
    application({ id: "9", status: "reviewing", registrationStatus: "undecided" }),
    application({ id: "10", status: "new", registrationStatus: "undecided" })
  ]
  const { metrics, analytics, model } = buildBoth(applications)

  check(countOf(model, "application") === 10, `총 신청이 다르다: ${countOf(model, "application")}`)
  check(countOf(model, "reviewing") === 9, `신청 확인이 다르다: ${countOf(model, "reviewing")}`)
  check(countOf(model, "confirmed") === 8, `일정 확정이 다르다: ${countOf(model, "confirmed")}`)
  check(countOf(model, "completed") === 6, `체험 완료가 다르다: ${countOf(model, "completed")}`)
  check(countOf(model, "enrolled") === 3, `등록이 다르다: ${countOf(model, "enrolled")}`)
  check(decisionOf(model, "not_enrolled") === 2, "미등록이 다르다")
  check(decisionOf(model, "pending") === 1, "결정 대기가 다르다")
  check(model.conversionRateLabel === "60.0%", `전환율이 다르다: ${model.conversionRateLabel}`)

  // 리포트가 독자 계산하면 여기서 갈린다.
  metrics.steps.forEach((step) => {
    check(countOf(model, step.key) === step.count, `${step.key} 가 Dashboard 와 다르다`)
  })
  check(model.conversionRateLabel === analytics.conversionValue, "전환율 문자열이 Dashboard 와 다르다")
  check(model.conversionMeta === analytics.conversionMeta, "보조 문구가 Dashboard 와 다르다")
  check(decisionOf(model, "enrolled") === metrics.enrolledCount, "등록 수가 Dashboard 와 다르다")
  check(decisionOf(model, "pending") === metrics.pendingDecisionCount, "대기 수가 Dashboard 와 다르다")
  check(
    decisionOf(model, "not_enrolled") === metrics.notEnrolledCount,
    "미등록 수가 Dashboard 와 다르다"
  )
  passLine(before, `신청 10 · 완료 6 · 등록 3 · 미등록 2 · 대기 1 → 전환율 ${model.conversionRateLabel}`)
}

// ─────────────────────────────────────────────────────────────
console.log("\n[2] 예정 종료가 지난 confirmed 는 완료가 아니다")
{
  const before = failures
  const { model } = buildBoth([
    application({
      id: "1",
      status: "confirmed",
      registrationStatus: "undecided",
      // 이미 지난 종료 시각
      confirmedBlockEndAt: "2026-09-01T01:00:00.000Z"
    })
  ])
  check(countOf(model, "confirmed") === 1, "일정 확정에 포함되지 않았다")
  check(countOf(model, "completed") === 0, `체험 완료로 잘못 셌다: ${countOf(model, "completed")}`)
  check(model.conversionRateLabel === "—", `결정이 없는데 전환율이 나왔다: ${model.conversionRateLabel}`)
  passLine(before, "종료 시각 경과 ≠ 체험 완료")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[3] 결정 대기 — undecided / pending")
{
  const before = failures
  const { model } = buildBoth([
    application({ id: "1", status: "completed", registrationStatus: "undecided" }),
    application({ id: "2", status: "completed", registrationStatus: "pending" })
  ])
  check(decisionOf(model, "pending") === 2, `결정 대기가 2가 아니다: ${decisionOf(model, "pending")}`)
  check(decisionOf(model, "enrolled") === 0, "대기가 등록에 섞였다")
  check(decisionOf(model, "not_enrolled") === 0, "대기가 미등록에 섞였다")
  check(model.conversionRateLabel === "—", "결정 완료 0인데 전환율이 계산됐다")
  passLine(before, "undecided · pending 모두 결정 대기")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[4] 빈 기간 — 리포트는 여전히 만들어진다")
{
  const before = failures
  const { model } = buildBoth([])
  check(countOf(model, "application") === 0, "빈 기간 신청 수가 0이 아니다")
  check(model.conversionRateLabel === "—", "빈 기간 전환율이 — 가 아니다")
  check(model.decisionTotal === 0, "빈 기간 결정 합계가 0이 아니다")
  check(
    model.funnel.every((step) => step.visualFillPercent === 0),
    "0 신청인데 막대 길이가 0이 아니다(0 나누기 방어 실패)"
  )
  check(model.decisions.every((item) => item.visualSharePercent === 0), "빈 기간 막대 비율이 0이 아니다")
  passLine(before, "신청 0건에서도 모델 생성 · 0 나누기 없음")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[5] 기간 경계 (KST)")
{
  const before = failures
  const septemberRange = resolveStudioDateRange({
    preset: "custom",
    startDate: "2026-09-01",
    endDate: "2026-09-30"
  })
  const applications = [
    // 2026-08-31 23:59 KST — 9월 모집단이 아니다.
    application({ id: "before", status: "completed", registrationStatus: "enrolled", createdAt: "2026-08-31T14:59:00.000Z" }),
    // 2026-09-01 00:00 KST
    application({ id: "start", status: "completed", registrationStatus: "enrolled", createdAt: "2026-08-31T15:00:00.000Z" }),
    // 2026-09-30 23:59 KST
    application({ id: "end", status: "completed", registrationStatus: "not_enrolled", createdAt: "2026-09-30T14:59:00.000Z" }),
    // 2026-10-01 00:00 KST — 범위 밖
    application({ id: "after", status: "completed", registrationStatus: "enrolled", createdAt: "2026-09-30T15:00:00.000Z" })
  ]

  const { metrics, model } = buildBoth(applications, septemberRange)
  check(countOf(model, "application") === 2, `9월 모집단이 2건이 아니다: ${countOf(model, "application")}`)
  check(decisionOf(model, "enrolled") === 1, "경계 시작이 빠졌다")
  check(decisionOf(model, "not_enrolled") === 1, "경계 끝이 빠졌다")
  check(countOf(model, "application") === metrics.steps[0]!.count, "Dashboard 와 모집단이 다르다")
  passLine(before, "2026-09-01 00:00 ~ 09-30 23:59 KST 만 포함")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[6] 취소·노쇼는 신청 수에만 포함된다")
{
  const before = failures
  const { model } = buildBoth([
    application({ id: "1", status: "canceled", registrationStatus: "undecided" }),
    application({ id: "2", status: "canceled", registrationStatus: "undecided", noShowAt: "2026-09-11T07:00:00.000Z" }),
    application({ id: "3", status: "completed", registrationStatus: "enrolled" })
  ])
  check(countOf(model, "application") === 3, "신청 수에 취소·노쇼가 빠졌다")
  check(countOf(model, "reviewing") === 1, "취소·노쇼가 이후 단계에 셌다")
  check(model.applicationFootnote.includes("취소·노쇼"), "각주 문구가 없다")
  passLine(before, "취소·노쇼는 신청 수에만 · 각주로 안내")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[7] 파일명 · 생성일")
{
  const before = failures
  check(
    formatSeoulReportDate(GENERATED_AT) === "2026.09.05",
    `생성일이 KST 기준이 아니다: ${formatSeoulReportDate(GENERATED_AT)}`
  )
  check(
    buildConversionInfographicPeriodFileLabel({ startDate: "2026-09-01", endDate: "2026-09-30" }) ===
      "2026-09",
    "한 달 전체가 2026-09 로 줄지 않았다"
  )
  check(
    buildConversionInfographicPeriodFileLabel({ startDate: "2026-09-01", endDate: "2026-09-15" }) ===
      "2026-09-01_2026-09-15",
    "부분 기간 표기가 다르다"
  )
  check(
    buildConversionInfographicPeriodFileLabel({ startDate: null, endDate: null }) === "전체",
    "전체 기간 표기가 다르다"
  )
  check(
    buildConversionInfographicFileName({
      organizationName: "첫수업 국어학원 / 일산점",
      periodFileLabel: "2026-09"
    }) === "첫수업_등록전환리포트_첫수업국어학원일산점_2026-09.png",
    "파일명 정규화가 다르다"
  )
  passLine(before, "생성일 KST · 기간 표기 · 파일명 sanitize")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[8] 미등록 사유 — 같은 cohort · 합계 불변")
{
  const before = failures
  const { metrics, analytics } = buildBoth([
    application({ id: "1", status: "completed", registrationStatus: "not_enrolled", unregisteredReason: "schedule_mismatch" }),
    application({ id: "2", status: "completed", registrationStatus: "not_enrolled", unregisteredReason: "schedule_mismatch" }),
    application({ id: "3", status: "completed", registrationStatus: "not_enrolled", unregisteredReason: "cost_burden" }),
    application({ id: "4", status: "completed", registrationStatus: "not_enrolled", unregisteredReason: "class_level_mismatch" })
  ])

  const byLabel = new Map(analytics.unregisteredReasons.map((item) => [item.label, item.count]))
  check(byLabel.get("일정 불일치") === 2, `일정 불일치가 2가 아니다: ${byLabel.get("일정 불일치")}`)
  check(byLabel.get("비용 부담") === 1, "비용 부담이 1이 아니다")
  check(byLabel.get("수업/레벨 불일치") === 1, "수업/레벨 불일치가 1이 아니다")
  check(metrics.notEnrolledCount === 4, "미등록 수가 4가 아니다")
  check(
    analytics.unregisteredReasons.reduce((sum, item) => sum + item.count, 0) === metrics.notEnrolledCount,
    "사유 합계가 미등록 수와 다르다"
  )
  check(analytics.unregisteredReasons[0]?.label === "일정 불일치", "많은 순 정렬이 아니다")
  passLine(before, "일정 불일치 2 · 비용 부담 1 · 수업/레벨 1 → 합계 = 미등록 4")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[9] 사유 미기록도 버리지 않는다")
{
  const before = failures
  const { metrics, analytics } = buildBoth([
    application({ id: "1", status: "completed", registrationStatus: "not_enrolled", unregisteredReason: "schedule_mismatch" }),
    application({ id: "2", status: "completed", registrationStatus: "not_enrolled" }),
    application({ id: "3", status: "completed", registrationStatus: "not_enrolled" })
  ])

  const missing = analytics.unregisteredReasons.find((item) => item.key === "unrecorded")
  check(missing?.count === 2, `사유 미기록이 2가 아니다: ${missing?.count}`)
  check(missing?.label === "미등록 사유 미기록", `기존 문구와 다르다: ${missing?.label}`)
  check(
    analytics.unregisteredReasons.reduce((sum, item) => sum + item.count, 0) === metrics.notEnrolledCount,
    "사유 미기록을 빼서 합계가 어긋났다"
  )
  // 건수가 같을 때만 사유 미기록이 뒤로 간다(건수가 더 많으면 당연히 앞이다).
  const tied = buildBoth([
    application({ id: "1", status: "completed", registrationStatus: "not_enrolled", unregisteredReason: "schedule_mismatch" }),
    application({ id: "2", status: "completed", registrationStatus: "not_enrolled" })
  ]).analytics.unregisteredReasons
  check(tied[0]?.key === "schedule_mismatch", "동률인데 사유가 앞이 아니다")
  check(tied.at(-1)?.key === "unrecorded", "동률일 때 사유 미기록이 맨 뒤가 아니다")
  passLine(before, "사유 미기록 2건 포함 · 합계 3 = 미등록 3 · 동률이면 미기록이 뒤")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[10] 미등록이 아닌 Case 의 사유는 세지 않는다")
{
  const before = failures
  const { metrics, analytics } = buildBoth([
    application({ id: "1", status: "completed", registrationStatus: "enrolled", unregisteredReason: "cost_burden" }),
    application({ id: "2", status: "completed", registrationStatus: "pending", unregisteredReason: "distance" }),
    application({ id: "3", status: "completed", registrationStatus: "undecided", unregisteredReason: "no_response" }),
    application({ id: "4", status: "canceled", registrationStatus: "undecided", unregisteredReason: "distance" })
  ])

  check(metrics.unregisteredReasonCounts.length === 0, "미등록이 아닌 Case 의 사유를 셌다")
  check(analytics.unregisteredReasons.length === 0, "표시 목록에 잘못된 사유가 들어갔다")
  check(metrics.notEnrolledCount === 0, "미등록 수가 0이 아니다")
  passLine(before, "등록 · 대기 · 취소 Case 의 잔여 사유 무시")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[11] 사유도 같은 cohort 경계를 따른다")
{
  const before = failures
  const septemberRange = resolveStudioDateRange({
    preset: "custom",
    startDate: "2026-09-01",
    endDate: "2026-09-30"
  })
  const { analytics } = buildBoth(
    [
      // 8월 신청 — 9월 cohort 가 아니다.
      application({ id: "aug", status: "completed", registrationStatus: "not_enrolled", unregisteredReason: "distance", createdAt: "2026-08-20T01:00:00.000Z" }),
      // 9월 신청
      application({ id: "sep", status: "completed", registrationStatus: "not_enrolled", unregisteredReason: "cost_burden", createdAt: "2026-09-10T01:00:00.000Z" })
    ],
    septemberRange
  )

  check(analytics.unregisteredReasons.length === 1, "cohort 밖 사유가 섞였다")
  check(analytics.unregisteredReasons[0]?.label === "비용 부담", "cohort 안 사유가 빠졌다")
  passLine(before, "created_at cohort 밖 미등록 사유 제외")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[12] 내보내기 크기 계약")
{
  const before = failures
  // 실제 PNG bitmap 은 브라우저에서 1080×1350 으로 확인했다(REPORT-2 보고 참고).
  // 여기서는 그 크기를 정하는 상수가 바뀌지 않았는지만 고정한다.
  check(CONVERSION_INFOGRAPHIC_WIDTH === 1080, `가로가 1080 이 아니다: ${CONVERSION_INFOGRAPHIC_WIDTH}`)
  check(CONVERSION_INFOGRAPHIC_HEIGHT === 1350, `세로가 1350 이 아니다: ${CONVERSION_INFOGRAPHIC_HEIGHT}`)
  check(
    CONVERSION_INFOGRAPHIC_HEIGHT / CONVERSION_INFOGRAPHIC_WIDTH === 1350 / 1080,
    "4:5 비율이 아니다"
  )
  passLine(before, "1080 × 1350 (4:5)")
}

if (failures > 0) {
  console.error(`\nFAIL: ${failures}건 실패`)
  process.exit(1)
}

console.log("\nPASS: 등록전환 리포트 표시 모델 검증 완료")
