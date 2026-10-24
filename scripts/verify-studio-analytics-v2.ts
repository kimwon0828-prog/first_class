// 분석 화면(Figma 2148:6580) 표시 모델 검증(순수 함수 · DB 없음).
//
//   npx tsx scripts/verify-studio-analytics-v2.ts
//
// Figma 예시 숫자(신청 24 · 일정 확정 21 · 체험 완료 18 · 등록 7 · 불참 2, 9월보다 6명)를
// fixture 로 재현해 고정한다.
//   1. 카드 4개 문구 · 전환율 = 등록 ÷ 체험 완료 · 결과 대기 · 불참 분모(확정 + 불참)
//   2. 직전 같은 길이 기간 비교(10월 1~24일 → 9월 7~30일, "9월보다")
//   3. 흐름 "이전 단계의 N%" · 가장 크게 줄어든 단계 · 안내 문장(고민 중 N명)
//   4. 미등록 사유: 새 목록 · 옛 값 매핑 · 복수 사유 · 1위 · 사유 기록 없음
//   5. "희망 시간 불일치" 희망 요일 문장(정규수업 희망 일정에서)
//   6. 수업별 전환: 신청 많은 순 · 체험 · 등록 · 전환율
//   7. 기간 칩 이름(10월 · 9월)

import {
  buildStudioAnalyticsView,
  resolveAnalyticsMonthLabels,
  resolvePreviousStudioDateRange
} from "@/features/studio/lib/studio-analytics-view"
import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

const NOW = new Date("2026-10-24T03:00:00.000Z") // 10월 24일 12:00 KST
const OCT = "2026-10-10T01:00:00.000Z"
const SEP = "2026-09-15T01:00:00.000Z"

type Kind = "new" | "confirmed" | "no_show" | "pending" | "enrolled" | "not_enrolled"
const CLASSES = [
  { id: "robot", title: "로봇 코딩 체험", category: "coding_it_robotics" },
  { id: "science", title: "어린이 과학 실험 체험", category: "science" },
  { id: "python", title: "파이썬 입문 레벨테스트", category: "coding_it_robotics" }
]

const preference = (...days: number[]) => ({
  version: 1,
  state: "specified",
  groups: [{ dayMode: "selected", days, timeMode: "any", startTime: null, endTime: null }]
})

const app = (
  id: string,
  kind: Kind,
  classIndex: number,
  extra: Partial<StudioApplicationSummary> = {},
  createdAt = OCT
): StudioApplicationSummary =>
  ({
    id,
    classId: CLASSES[classIndex].id,
    classTitle: CLASSES[classIndex].title,
    classSubjectCategory: CLASSES[classIndex].category,
    programType: "trial_class",
    childName: "학생",
    childGrade: "elem_3",
    status: kind === "new" ? "new" : kind === "confirmed" ? "confirmed" : kind === "no_show" ? "canceled" : "completed",
    noShowAt: kind === "no_show" ? "2026-10-12T07:00:00.000Z" : null,
    registrationStatus: kind === "enrolled" ? "enrolled" : kind === "not_enrolled" ? "not_enrolled" : kind === "pending" ? "pending" : "undecided",
    unregisteredReason: null,
    registrationReasonIds: [],
    regularSchedulePreference: null,
    requestedSlotAt: "2026-10-30T07:00:00.000Z",
    confirmedSlotAt: kind === "confirmed" ? "2026-10-30T07:00:00.000Z" : null,
    confirmedBlockStartAt: null,
    confirmedBlockEndAt: null,
    scheduleStartTime: "16:00:00",
    scheduleEndTime: "17:00:00",
    completedAt: null,
    canceledAt: kind === "no_show" ? "2026-10-12T07:00:00.000Z" : null,
    createdAt,
    updatedAt: createdAt,
    ...extra
  }) as unknown as StudioApplicationSummary

// 10월: 신청 24 = 등록 7 · 미등록 6 · 결과 대기 5 · 확정(체험 전) 3 · 불참 2 · 신규 1
const october: StudioApplicationSummary[] = [
  // 로봇 12: 등록 4 · 미등록 3 · 대기 2 · 확정 2 · 신규 1
  ...["e1", "e2", "e3", "e4"].map((id) => app(id, "enrolled", 0)),
  app("n1", "not_enrolled", 0, { registrationReasonIds: ["schedule_mismatch"], regularSchedulePreference: preference(6) }),
  app("n2", "not_enrolled", 0, { registrationReasonIds: ["schedule_mismatch"], regularSchedulePreference: preference(6, 7) }),
  app("n3", "not_enrolled", 0, { registrationReasonIds: ["schedule_mismatch"], regularSchedulePreference: preference(2) }),
  app("p1", "pending", 0),
  app("p2", "pending", 0),
  app("c1", "confirmed", 0),
  app("c2", "confirmed", 0),
  app("w1", "new", 0),
  // 과학 7: 등록 2 · 미등록 2 · 대기 2 · 불참 1
  app("e5", "enrolled", 1),
  app("e6", "enrolled", 1),
  // 옛 단일 사유 — 새 분류로 옮겨 센다
  app("n4", "not_enrolled", 1, { unregisteredReason: "schedule_mismatch" }),
  app("n5", "not_enrolled", 1, { registrationReasonIds: ["price_burden", "chose_other_academy"], unregisteredReason: "distance" }),
  app("p3", "pending", 1),
  app("p4", "pending", 1),
  app("x1", "no_show", 1),
  // 파이썬 5: 등록 1 · 미등록 1 · 대기 1 · 확정 1 · 불참 1
  app("e7", "enrolled", 2),
  app("n6", "not_enrolled", 2, { unregisteredReason: "comparing_other_academies" }),
  app("p5", "pending", 2),
  app("c3", "confirmed", 2),
  app("x2", "no_show", 2)
]
// 9월 7~30일: 신청 18
const september = Array.from({ length: 18 }, (_, index) => app(`s${index}`, "enrolled", 0, {}, SEP))
// 직전 기간 밖(9월 1일) — 세지 않는다
const outside = [app("old", "enrolled", 0, {}, "2026-09-01T01:00:00.000Z")]

const range = resolveStudioDateRange({ startDate: "2026-10-01", endDate: "2026-10-24" })
const view = buildStudioAnalyticsView({ applications: [...october, ...september, ...outside], range, consideringCount: 6, now: NOW })
const card = (key: string) => view.cards.find((item) => item.key === key)

console.log("[1] 카드")
check("신청 24명", card("application")?.value === "24명", card("application")?.value)
check("체험 완료 18명 · 신청의 75%", card("completed")?.value === "18명" && card("completed")?.caption === "신청의 75%", card("completed")?.caption ?? "")
check("등록 7명 · 체험한 학생의 39% (7 ÷ 18)", card("enrolled")?.value === "7명" && card("enrolled")?.caption === "체험한 학생의 39%", card("enrolled")?.caption ?? "")
check("등록 카드 결과 대기 5명", card("enrolled")?.sub === "결과 대기 5명", card("enrolled")?.sub ?? "")
check("등록 카드만 초록", view.cards.filter((item) => item.tone === "brand").map((item) => item.key).join() === "enrolled")
check("불참 2명 · 확정의 9% (2 ÷ (21 + 2))", card("no_show")?.label === "불참" && card("no_show")?.value === "2명" && card("no_show")?.caption === "확정의 9%", card("no_show")?.caption ?? "")

console.log("\n[2] 직전 같은 길이 기간")
const previous = resolvePreviousStudioDateRange(range)
check("10월 1~24일 → 9월 7~30일", previous?.startDate === "2026-09-07" && previous?.endDate === "2026-09-30", `${previous?.startDate} ~ ${previous?.endDate}`)
check("9월보다 6명 늘었어요(24 − 18)", card("application")?.caption === "9월보다 6명 늘었어요", card("application")?.caption ?? "")
const thisMonth = resolveStudioDateRange({ preset: "thisMonth" })
check("이번 달 칩도 '9월보다'", (() => {
  const v = buildStudioAnalyticsView({ applications: [], range: { ...thisMonth, startDate: "2026-10-01", endDate: "2026-10-24" }, consideringCount: 0, now: NOW })
  return v.cards[0].caption === "9월과 같아요"
})())
check("직접 고른 기간은 '직전 같은 기간보다'", (() => {
  const custom = resolveStudioDateRange({ startDate: "2026-10-05", endDate: "2026-10-11" })
  return buildStudioAnalyticsView({ applications: october, range: custom, consideringCount: 0, now: NOW }).cards[0].caption?.startsWith("직전 같은 기간보다") === true
})())
check("전체 기간이면 비교 문장이 없다", buildStudioAnalyticsView({ applications: october, range: resolveStudioDateRange({ preset: "all" }), consideringCount: 0, now: NOW }).cards[0].caption === null)

console.log("\n[3] 흐름")
check(
  "4단: 신청 24 · 일정 확정 21 · 체험 완료 18 · 등록 7",
  view.flow.map((step) => `${step.label}${step.count}`).join(" ") === "신청24 일정 확정21 체험 완료18 등록7",
  view.flow.map((step) => `${step.label}${step.count}`).join(" ")
)
check(
  "이전 단계의 88% · 86% · 39%",
  view.flow.map((step) => step.fromPrevious).join("|") === "|이전 단계의 88%|이전 단계의 86%|이전 단계의 39%",
  view.flow.map((step) => step.fromPrevious).join("|")
)
check("가장 크게 줄어든 단계 = 등록", view.flow.filter((step) => step.biggestDrop).map((step) => step.key).join() === "enrolled")
check("등록 막대만 초록", view.flow.filter((step) => step.tone === "brand").map((step) => step.key).join() === "enrolled")
check("막대 길이는 신청 대비(등록 29.2%)", view.flow[3].widthPercent === 29.2 && view.flow[0].widthPercent === 100, String(view.flow[3].widthPercent))
check(
  "안내 문장 + 학생 보기",
  view.insight?.text === "체험 후 등록까지가 가장 크게 줄어요. 고민 중인 6명에게 다시 연락해 보세요." && view.insight.showStudents,
  view.insight?.text ?? ""
)
check("고민 중 0명이면 학생 보기 없음", buildStudioAnalyticsView({ applications: october, range, consideringCount: 0, now: NOW }).insight?.showStudents === false)
check("신청이 없으면 안내 없음", buildStudioAnalyticsView({ applications: [], range, consideringCount: 3, now: NOW }).insight === null)

console.log("\n[4] 등록하지 않은 이유")
check(
  "희망 시간 불일치 4 · 다른 학원 선택 2 · 비용 부담 1",
  view.reasons.map((reason) => `${reason.label}:${reason.count}`).join(" ") === "희망 시간 불일치:4 다른 학원 선택:2 비용 부담:1",
  view.reasons.map((reason) => `${reason.label}:${reason.count}`).join(" ")
)
check("옛 단일 사유(일정 불일치 · 다른 학원 비교 중)를 새 분류로 센다", view.reasons[0].count === 4 && view.reasons[1].count === 2)
check("새 사유가 있으면 옛 값(거리)은 세지 않는다", !view.reasons.some((reason) => reason.key === "distance_or_transport"))
check("1위만 진한 색", view.reasons.filter((reason) => reason.top).map((reason) => reason.key).join() === "schedule_mismatch")
check("막대는 1위 대비(4 → 100%, 2 → 50%)", view.reasons[0].widthPercent === 100 && view.reasons[1].widthPercent === 50)
const unrecorded = buildStudioAnalyticsView({ applications: [app("u1", "not_enrolled", 0)], range, consideringCount: 0, now: NOW }).reasons
check("사유가 없으면 '사유 기록 없음' 으로 한 번 센다(진한 색 아님)", unrecorded.length === 1 && unrecorded[0].label === "사유 기록 없음" && !unrecorded[0].top)

console.log("\n[5] 희망 요일 문장")
check(
  "\"희망 시간 불일치\" 4명 중 2명이 토요일을 원했어요.",
  view.reasonDayNote === "\"희망 시간 불일치\" 4명 중 2명이 토요일을 원했어요.",
  view.reasonDayNote ?? "null"
)
check(
  "희망 요일 기록이 없으면 문장 없음",
  buildStudioAnalyticsView({ applications: [app("q1", "not_enrolled", 0, { registrationReasonIds: ["schedule_mismatch"] })], range, consideringCount: 0, now: NOW }).reasonDayNote === null
)

console.log("\n[6] 수업별 전환")
check(
  "신청 많은 순: 로봇 12 · 과학 7 · 파이썬 5",
  view.classRows.map((row) => `${row.title}:${row.applicationCount}`).join(" ") === "로봇 코딩 체험:12 어린이 과학 실험 체험:7 파이썬 입문 레벨테스트:5",
  view.classRows.map((row) => `${row.title}:${row.applicationCount}`).join(" ")
)
check(
  "체험 · 등록 · 전환율: 로봇 9·4·44% · 과학 6·2·33% · 파이썬 3·1·33%",
  view.classRows.map((row) => `${row.completedCount}·${row.enrolledCount}·${row.rateText}`).join(" ") === "9·4·44% 6·2·33% 3·1·33%",
  view.classRows.map((row) => `${row.completedCount}·${row.enrolledCount}·${row.rateText}`).join(" ")
)
check("과목 아이콘 코드가 따라간다", view.classRows[1].categoryCode === "science")

console.log("\n[7] 기간 칩 이름")
const labels = resolveAnalyticsMonthLabels(NOW)
check("이번 달 = 10월 · 지난달 = 9월", labels.thisMonth === "10월" && labels.lastMonth === "9월")
check("1월이면 지난달 = 12월", resolveAnalyticsMonthLabels(new Date("2027-01-05T03:00:00Z")).lastMonth === "12월")

if (failures > 0) {
  console.error(`FAIL: 분석 화면 검증 실패 ${failures}건`)
  process.exit(1)
}
console.log("\nPASS: 분석 화면 표시 모델 검증 완료")
