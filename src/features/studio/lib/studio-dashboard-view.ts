// Dashboard 표시 모델.
//
// 새 query 를 만들지 않는다. /studio/schedule 과 같은 listStudioApplications 한 번의 결과에서
// 세 영역(오늘 확인할 일 / 체험 일정 / 최근 등록 결과)을 전부 파생한다.
//
// 상태 판정은 기존 helper 만 쓴다. Dashboard 가 새로 판정하는 상태는 없다.
//   - getCaseStage / isCaseClosedStage : status + no_show_at + registration_status → 한 단계
//   - getStudioStatusLabel / getStudioStatusTone : 공식 배지 매핑(디자인 시스템 §2.2)
//   - buildStudioScheduleEvents : 캘린더와 같은 KST 일정 파생
//
// ⚠️ StudioApplicationSummary 에는 next_contact_at / trial_results / consultation_logs 가 없다.
//    그래서 "다음 연락일이 지났다" 같은 후속 연락 판정은 이 화면에서 하지 않는다.
//    그 판정은 Case 목록의 getCaseAttentionState 가 담당한다(중복 판정을 만들지 않는다).

import {
  getStudioRegistrationStatusLabel,
  getStudioRegistrationStatusTone,
  getStudioStatusLabel,
  getStudioStatusTone,
  type StudioStatusTone
} from "@/features/studio/lib/application-status-labels"
import { getCaseStage, isCaseClosedStage } from "@/features/studio/lib/case-view-model"
import { buildStudioScheduleEvents } from "@/features/studio/lib/studio-schedule-events"
import {
  formatSelectedDateLabel,
  getSeoulTodayKey,
  toSeoulDateKey
} from "@/features/studio/lib/studio-schedule-month"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

/** 각 섹션에 한 번에 보여줄 최대 행 수. 나머지는 "모두 보기" 로 넘긴다. */
export const STUDIO_DASHBOARD_SECTION_LIMIT = 5

/**
 * "지금 확인할 일" 의 종류.
 *
 * 종류와 우선순위는 case-view-model 의 getCaseAttentionState 판정 순서를 그대로 따른다.
 * 다만 next_contact_at / 체험 결과 기록 여부는 이 read model 에 없으므로,
 * 그 두 축에 의존하는 종류(OVERDUE_CONTACT 등)는 여기서 만들지 않는다.
 */
export type StudioDashboardActionKind =
  | "UNASSIGNED"
  | "NEEDS_COMPLETION"
  | "REVIEW_NEW"
  | "NEEDS_REGISTRATION"
  | "CONFIRM_SCHEDULE"

const ACTION_LABELS: Record<StudioDashboardActionKind, string> = {
  UNASSIGNED: "담당자를 배정해 주세요.",
  NEEDS_COMPLETION: "체험이 끝났다면 완료 처리해 주세요.",
  REVIEW_NEW: "신청 내용을 확인해 주세요.",
  NEEDS_REGISTRATION: "체험 결과와 등록 여부를 기록해 주세요.",
  CONFIRM_SCHEDULE: "체험 일정을 확정해 주세요."
}

/** 위에 있을수록 먼저 처리한다. getCaseAttentionState 의 우선순위와 같은 순서다. */
const ACTION_ORDER: StudioDashboardActionKind[] = [
  "UNASSIGNED",
  "NEEDS_COMPLETION",
  "REVIEW_NEW",
  "NEEDS_REGISTRATION",
  "CONFIRM_SCHEDULE"
]

export type StudioDashboardActionItem = {
  id: string
  href: string
  kind: StudioDashboardActionKind
  studentName: string
  studentGrade: string
  classTitle: string
  statusLabel: string
  statusTone: StudioStatusTone
  actionLabel: string
}

export type StudioDashboardScheduleItem = {
  id: string
  href: string
  timeLabel: string
  /** 오늘 일정에는 날짜를 붙이지 않는다. 다가오는 일정에서만 채운다. */
  dateLabel: string | null
  studentName: string
  classTitle: string
  teacherName: string | null
  statusLabel: string
  statusTone: StudioStatusTone
}

export type StudioDashboardResultItem = {
  id: string
  href: string
  studentName: string
  classTitle: string
  /** 등록은 enrolled_at, 미등록은 체험 완료 시각이다. 라벨이 어느 쪽인지 함께 말해 준다. */
  whenLabel: string | null
  outcomeLabel: string
  outcomeTone: StudioStatusTone
}

export type StudioDashboardView = {
  actionItems: StudioDashboardActionItem[]
  /** 잘라내기 전 전체 건수. 섹션 헤더의 "N건" 이 쓴다. */
  actionTotalCount: number
  scheduleMode: "today" | "upcoming"
  scheduleItems: StudioDashboardScheduleItem[]
  todayScheduleCount: number
  resultItems: StudioDashboardResultItem[]
  todayLabel: string
}

const toDetailHref = (applicationId: string) => `/studio/applications/${applicationId}`

const normalizeClassTitle = (value: string | null | undefined) =>
  value?.trim() || "수업 정보 없음"

const toTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * 확정 일정이 없으면 희망 일정으로 본다(캘린더 / Case 목록과 같은 규칙).
 * 시각 비교는 절대 시각끼리 하므로 타임존 영향을 받지 않는다.
 */
const hasTrialTimePassed = (item: StudioApplicationSummary, nowMs: number) => {
  const slotAt = toTimestamp(item.confirmedSlotAt ?? item.requestedSlotAt)
  return slotAt != null && slotAt <= nowMs
}

const resolveActionKind = (
  item: StudioApplicationSummary,
  nowMs: number
): StudioDashboardActionKind | null => {
  const stage = getCaseStage({
    status: item.status,
    noShowAt: item.noShowAt,
    registrationStatus: item.registrationStatus ?? "undecided"
  })

  // 종료된 Case 는 처리할 일이 없다.
  if (isCaseClosedStage(stage)) {
    return null
  }

  if (!item.assignedTeacherId) {
    return "UNASSIGNED"
  }

  if (stage === "confirmed") {
    return hasTrialTimePassed(item, nowMs) ? "NEEDS_COMPLETION" : null
  }

  if (stage === "new") {
    return "REVIEW_NEW"
  }

  if (stage === "reviewing") {
    return "CONFIRM_SCHEDULE"
  }

  // 여기 남는 진행 stage 는 completed + (undecided | pending) 뿐이다.
  return "NEEDS_REGISTRATION"
}

/** 등록 결과가 난 시점. 미등록은 lost_at 이 read model 에 없어 체험 완료 시각으로 본다. */
const resolveDecidedAt = (item: StudioApplicationSummary) =>
  item.registrationStatus === "enrolled" ? (item.enrolledAt ?? item.completedAt) : item.completedAt

const buildActionItems = (applications: StudioApplicationSummary[], now: Date) => {
  const nowMs = now.getTime()
  const matched: Array<{ item: StudioApplicationSummary; kind: StudioDashboardActionKind }> = []

  for (const item of applications) {
    const kind = resolveActionKind(item, nowMs)
    if (kind) {
      matched.push({ item, kind })
    }
  }

  matched.sort((left, right) => {
    const orderDelta = ACTION_ORDER.indexOf(left.kind) - ACTION_ORDER.indexOf(right.kind)
    if (orderDelta !== 0) {
      return orderDelta
    }

    // 시간 약속이 있는 그룹만 시각 순(오래 지난 것 먼저)이다.
    if (left.kind === "NEEDS_COMPLETION") {
      const leftAt = toTimestamp(left.item.confirmedSlotAt ?? left.item.requestedSlotAt) ?? 0
      const rightAt = toTimestamp(right.item.confirmedSlotAt ?? right.item.requestedSlotAt) ?? 0
      return leftAt - rightAt
    }

    // 나머지는 Case 목록 기본 정렬과 같은 신청 최신순이다.
    return (right.item.createdAt ?? "").localeCompare(left.item.createdAt ?? "")
  })

  return matched.map<StudioDashboardActionItem>(({ item, kind }) => ({
    id: item.id,
    href: toDetailHref(item.id),
    kind,
    studentName: item.childName,
    studentGrade: item.childGrade,
    classTitle: normalizeClassTitle(item.classTitle),
    statusLabel: getStudioStatusLabel(item),
    statusTone: getStudioStatusTone(item),
    actionLabel: ACTION_LABELS[kind]
  }))
}

const buildResultItems = (applications: StudioApplicationSummary[]) => {
  return applications
    .filter((item) => {
      const stage = getCaseStage({
        status: item.status,
        noShowAt: item.noShowAt,
        registrationStatus: item.registrationStatus ?? "undecided"
      })
      return stage === "enrolled" || stage === "not_enrolled"
    })
    .map((item) => ({ item, decidedAt: resolveDecidedAt(item) }))
    .sort(
      (left, right) => (toTimestamp(right.decidedAt) ?? 0) - (toTimestamp(left.decidedAt) ?? 0)
    )
    .slice(0, STUDIO_DASHBOARD_SECTION_LIMIT)
    .map<StudioDashboardResultItem>(({ item, decidedAt }) => {
      const dateKey = decidedAt ? toSeoulDateKey(decidedAt) : null
      const dateText = dateKey ? formatSelectedDateLabel(dateKey) : null
      const suffix = item.registrationStatus === "enrolled" ? "등록" : "체험 완료"

      return {
        id: item.id,
        href: toDetailHref(item.id),
        studentName: item.childName,
        classTitle: normalizeClassTitle(item.classTitle),
        whenLabel: dateText ? `${dateText} ${suffix}` : null,
        outcomeLabel: getStudioRegistrationStatusLabel(item.registrationStatus),
        outcomeTone: getStudioRegistrationStatusTone(item.registrationStatus)
      }
    })
}

/**
 * 일정 섹션.
 *
 * 오늘 일정이 하나라도 있으면 오늘만 보여준다. 하나도 없을 때만 앞으로의 일정을 보여준다.
 * "다음 7일" 같은 고정 기간을 새로 만들지 않는다 — 가장 가까운 몇 건을 날짜와 함께 보여주면
 * 기간 정책 없이도 같은 질문("다음 체험이 언제인가")에 답할 수 있다.
 */
const buildScheduleSection = (applications: StudioApplicationSummary[], todayKey: string) => {
  const events = buildStudioScheduleEvents(applications)
  const todayEvents = events.filter((event) => event.dateKey === todayKey)
  const isToday = todayEvents.length > 0
  const visible = isToday
    ? todayEvents
    : events.filter((event) => event.dateKey > todayKey).slice(0, STUDIO_DASHBOARD_SECTION_LIMIT)

  return {
    scheduleMode: (isToday ? "today" : "upcoming") as "today" | "upcoming",
    todayScheduleCount: todayEvents.length,
    scheduleItems: visible.slice(0, STUDIO_DASHBOARD_SECTION_LIMIT).map<StudioDashboardScheduleItem>(
      (event) => ({
        id: event.id,
        href: event.detailHref,
        timeLabel: event.timeLabel,
        dateLabel: isToday ? null : formatSelectedDateLabel(event.dateKey),
        studentName: event.childName,
        classTitle: event.classTitle,
        teacherName: event.assignedTeacherName,
        statusLabel: event.statusLabel,
        statusTone: event.tone
      })
    )
  }
}

export const buildStudioDashboardView = (
  applications: StudioApplicationSummary[],
  now: Date = new Date()
): StudioDashboardView => {
  const todayKey = getSeoulTodayKey(now)
  const actionItems = buildActionItems(applications, now)
  const schedule = buildScheduleSection(applications, todayKey)

  return {
    actionItems: actionItems.slice(0, STUDIO_DASHBOARD_SECTION_LIMIT),
    actionTotalCount: actionItems.length,
    scheduleMode: schedule.scheduleMode,
    scheduleItems: schedule.scheduleItems,
    todayScheduleCount: schedule.todayScheduleCount,
    resultItems: buildResultItems(applications),
    todayLabel: formatSelectedDateLabel(todayKey)
  }
}
