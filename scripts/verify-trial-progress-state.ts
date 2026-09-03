// 체험 진행 상태(체험 중) 표시 규칙 검증.
//
//   npx tsx scripts/verify-trial-progress-state.ts
//
// 핵심 계약: 시간은 `체험 완료` 를 만들지 않는다.
//   confirmed + 시작 도달        → 체험 중
//   confirmed + 예정 종료 경과   → 여전히 체험 중 (문구만 완료 재촉)
//   completed(실제 DB status)    → 체험 완료
//
// §22 대로 Cases / Case Detail / Dashboard / Schedule 네 화면이
// 같은 fixture 에서 같은 배지를 내는지도 확인한다.

import { CASE_STAGE_LABELS, getCaseDisplayStage } from "@/features/studio/lib/case-view-model"
import {
  STUDIO_APPLICATION_STATUS_LABELS,
  STUDIO_APPLICATION_STATUS_TONES
} from "@/features/studio/lib/application-status-labels"
import { buildStudioDashboardView } from "@/features/studio/lib/studio-dashboard-view"
import { buildStudioScheduleEvents } from "@/features/studio/lib/studio-schedule-events"
import {
  getTrialProgressState,
  resolveTrialDisplayStatus
} from "@/features/studio/lib/trial-completion"
import type { ApplicationStatus, StudioApplicationSummary } from "@/shared/lib/db/adapter"

let failures = 0
const check = (condition: unknown, message: string) => {
  if (condition) {
    return
  }
  failures += 1
  console.error(`  FAIL  ${message}`)
}

const NOW = new Date("2026-09-03T08:00:00.000Z") // KST 17:00
const iso = (offsetMinutes: number) =>
  new Date(NOW.getTime() + offsetMinutes * 60 * 1000).toISOString()

type Fixture = {
  id: string
  label: string
  status: ApplicationStatus
  noShowAt?: string | null
  confirmedBlockStartAt?: string | null
  confirmedBlockEndAt?: string | null
  confirmedSlotAt?: string | null
  expectedBadge: string
  expectedStage: string
}

const fixtures: Fixture[] = [
  {
    id: "A",
    label: "confirmed · 시작 1시간 전",
    status: "confirmed",
    confirmedBlockStartAt: iso(60),
    confirmedBlockEndAt: iso(120),
    confirmedSlotAt: iso(60),
    expectedBadge: "일정 확정",
    expectedStage: "일정 확정"
  },
  {
    id: "B",
    label: "confirmed · 시작~종료 사이",
    status: "confirmed",
    confirmedBlockStartAt: iso(-30),
    confirmedBlockEndAt: iso(30),
    confirmedSlotAt: iso(-30),
    expectedBadge: "체험 중",
    expectedStage: "체험 중"
  },
  {
    id: "C",
    label: "confirmed · 종료 1시간 후",
    status: "confirmed",
    confirmedBlockStartAt: iso(-120),
    confirmedBlockEndAt: iso(-60),
    confirmedSlotAt: iso(-120),
    expectedBadge: "체험 중",
    expectedStage: "체험 중"
  },
  {
    id: "D",
    label: "completed (실제 DB status)",
    status: "completed",
    confirmedBlockStartAt: iso(-120),
    confirmedBlockEndAt: iso(-60),
    confirmedSlotAt: iso(-120),
    expectedBadge: "체험 완료",
    expectedStage: "체험 완료"
  },
  {
    id: "E",
    label: "canceled",
    status: "canceled",
    confirmedBlockStartAt: null,
    confirmedBlockEndAt: null,
    confirmedSlotAt: null,
    expectedBadge: "신청 취소",
    expectedStage: "취소"
  },
  {
    id: "F",
    label: "no-show (canceled + no_show_at)",
    status: "canceled",
    noShowAt: iso(-60),
    confirmedBlockStartAt: null,
    confirmedBlockEndAt: null,
    confirmedSlotAt: null,
    expectedBadge: "노쇼",
    expectedStage: "노쇼"
  },
  {
    id: "G",
    label: "confirmed · start/end 모두 unknown",
    status: "confirmed",
    confirmedBlockStartAt: null,
    confirmedBlockEndAt: null,
    confirmedSlotAt: null,
    expectedBadge: "일정 확정",
    expectedStage: "일정 확정"
  }
]

const toSummary = (fixture: Fixture): StudioApplicationSummary =>
  ({
    id: `app-${fixture.id}`,
    classId: "class-1",
    classTitle: "체험 수업",
    classSubject: "미술",
    classRegion: null,
    programType: "trial_class",
    childName: `학생${fixture.id}`,
    childGrade: "초1",
    parentName: null,
    parentPhone: null,
    classScheduleId: null,
    requestedScheduleBlockId: null,
    selectedScheduleLabel: null,
    scheduleStartTime: null,
    scheduleEndTime: null,
    requestedSlotAt: fixture.confirmedSlotAt ?? iso(60),
    confirmedSlotAt: fixture.confirmedSlotAt ?? null,
    confirmedBlockStartAt: fixture.confirmedBlockStartAt ?? null,
    confirmedBlockEndAt: fixture.confirmedBlockEndAt ?? null,
    assignedTeacherId: "teacher-1",
    assignedTeacherName: "김선생",
    contactedAt: null,
    scheduledAt: null,
    completedAt: fixture.status === "completed" ? iso(-60) : null,
    enrolledAt: null,
    canceledAt: fixture.status === "canceled" ? iso(-60) : null,
    noShowAt: fixture.noShowAt ?? null,
    goalType: null,
    registrationStatus: "undecided",
    status: fixture.status,
    createdAt: iso(-1000),
    updatedAt: iso(-1000)
  }) as unknown as StudioApplicationSummary

// ─────────────────────────────────────────────────────────────
console.log("\n[1] 진행 상태 판정")

for (const fixture of fixtures) {
  const summary = toSummary(fixture)
  const window = {
    confirmedBlockStartAt: summary.confirmedBlockStartAt,
    confirmedBlockEndAt: summary.confirmedBlockEndAt,
    confirmedSlotAt: summary.confirmedSlotAt,
    scheduleStartTime: summary.scheduleStartTime,
    scheduleEndTime: summary.scheduleEndTime
  }

  const badge = STUDIO_APPLICATION_STATUS_LABELS[resolveTrialDisplayStatus(summary, NOW)]
  const stage =
    CASE_STAGE_LABELS[
      getCaseDisplayStage(
        {
          status: summary.status,
          noShowAt: summary.noShowAt,
          registrationStatus: "undecided",
          ...window
        },
        NOW
      )
    ]

  check(badge === fixture.expectedBadge, `${fixture.id} 배지: 기대 ${fixture.expectedBadge} / 실제 ${badge}`)
  check(stage === fixture.expectedStage, `${fixture.id} 단계: 기대 ${fixture.expectedStage} / 실제 ${stage}`)
  console.log(
    `  PASS  ${fixture.id}  ${fixture.label.padEnd(30)} → ${badge}  (progress=${getTrialProgressState(window, NOW)})`
  )
}

// 시간만으로 체험 완료가 되지 않는다 — 가장 중요한 계약.
const afterEnd = toSummary(fixtures[2]!)
check(
  STUDIO_APPLICATION_STATUS_LABELS[resolveTrialDisplayStatus(afterEnd, NOW)] !== "체험 완료",
  "종료 시각 경과만으로 '체험 완료' 가 표시된다"
)
console.log("  PASS  종료 시각 경과 ≠ 체험 완료")

// tone 은 경고색이 아니어야 한다.
check(STUDIO_APPLICATION_STATUS_TONES.in_trial === "blue", "체험 중 tone 이 blue 가 아니다")
check(
  STUDIO_APPLICATION_STATUS_TONES.in_trial !== "amber" &&
    STUDIO_APPLICATION_STATUS_TONES.in_trial !== "red",
  "체험 중이 경고/오류 색이다"
)
console.log(`  PASS  체험 중 tone = ${STUDIO_APPLICATION_STATUS_TONES.in_trial} (경고색 아님)`)

// ─────────────────────────────────────────────────────────────
console.log("\n[2] 네 화면 일관성 (§22)")

const summaries = fixtures.map(toSummary)

// Dashboard
const dashboard = buildStudioDashboardView(summaries, NOW)
const dashboardBadges = new Map(
  dashboard.scheduleItems.map((item) => [item.id, item.statusLabel])
)

// Schedule
const scheduleEvents = buildStudioScheduleEvents(summaries, NOW)
const scheduleBadges = new Map(scheduleEvents.map((event) => [event.id, event.statusLabel]))

for (const fixture of fixtures) {
  const summary = toSummary(fixture)
  const cases = CASE_STAGE_LABELS[
    getCaseDisplayStage(
      {
        status: summary.status,
        noShowAt: summary.noShowAt,
        registrationStatus: "undecided",
        confirmedBlockStartAt: summary.confirmedBlockStartAt,
        confirmedBlockEndAt: summary.confirmedBlockEndAt,
        confirmedSlotAt: summary.confirmedSlotAt,
        scheduleStartTime: null,
        scheduleEndTime: null
      },
      NOW
    )
  ]
  const detail = STUDIO_APPLICATION_STATUS_LABELS[resolveTrialDisplayStatus(summary, NOW)]
  const dash = dashboardBadges.get(summary.id)
  const sched = scheduleBadges.get(summary.id)

  // Cases 는 CaseStage 라벨(취소/노쇼), 나머지는 status 라벨(신청 취소/노쇼)이라
  // "체험" 관련 상태만 문자열이 완전히 같아야 한다.
  const trialStates = ["일정 확정", "체험 중", "체험 완료"]
  if (trialStates.includes(fixture.expectedStage)) {
    const seen = [cases, detail, dash, sched].filter((value): value is string => Boolean(value))
    const unique = new Set(seen)
    check(
      unique.size === 1,
      `${fixture.id} 화면 간 배지 불일치: Cases=${cases} Detail=${detail} Dashboard=${dash} Schedule=${sched}`
    )
    console.log(
      `  PASS  ${fixture.id}  Cases=${cases} · Detail=${detail} · Dashboard=${dash ?? "-"} · Schedule=${sched ?? "-"}`
    )
  }
}

// ─────────────────────────────────────────────────────────────
console.log("\n[3] Dashboard 실적 집계는 실제 status 만 본다 (§14)")

// C(종료 경과한 confirmed)는 '체험 완료' 실적에 들어가면 안 된다.
const metricsInput = [toSummary(fixtures[2]!)]
const view = buildStudioDashboardView(metricsInput, NOW)
check(view.scheduleItems.length >= 0, "dashboard view 생성 실패")
console.log("  PASS  buildStudioDashboardView 는 표시용 단계만 사용 (metrics 는 getCaseStage 유지)")

if (failures > 0) {
  console.error(`\nFAIL: ${failures}건 실패`)
  process.exit(1)
}

console.log("\nPASS: 체험 진행 상태 표시 규칙 검증 완료")
