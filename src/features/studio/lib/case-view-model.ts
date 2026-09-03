// Studio Case View Model.
//
// Case 는 새 table 이 아니다. PK 는 trial_applications.id 그대로이고, 화면이 필요로 하는
// "지금 어느 단계인가 / 지금 무엇을 해야 하는가" 만 애플리케이션 레이어에서 파생한다.
// DB enum(ApplicationStatus, ApplicationRegistrationStatus)은 건드리지 않는다.
//
// 상태 판정은 기존 helper 를 재사용한다. 같은 로직을 두 번 쓰지 않기 위해서다.
//   - getStudioDisplayStatus  : canceled + no_show_at → "no_show" 접기
//   - getConsultationPipelineGroup : 체험 완료 이후 후속 연락 그룹 판정
// 이 파일은 순수 함수만 둔다(서버 전용 import 없음).

import { getStudioDisplayStatus } from "@/features/studio/lib/application-status-labels"
import {
  isTrialScheduledEndPassed,
  isTrialStarted,
  type TrialScheduleWindow
} from "@/features/studio/lib/trial-completion"
import { getConsultationPipelineGroup } from "@/shared/lib/consultation-pipeline"
import type {
  ApplicationRegistrationStatus,
  ApplicationStatus,
  ConsultationLogChannel,
  ConsultationSentiment
} from "@/shared/lib/db/adapter"
import { formatSeoulDateKey } from "@/shared/lib/seoul-datetime"

/** 화면용 단일 단계. status + no_show_at + registration_status 를 하나로 접은 파생 값이다. */
export type CaseStage =
  // 진행
  | "new"
  | "reviewing"
  | "confirmed"
  /** 표시 전용. confirmed + 시작 시각 도달. DB enum 이 아니다. */
  | "in_trial"
  | "completed"
  // 종료
  | "enrolled"
  | "not_enrolled"
  | "canceled"
  | "no_show"

export const CASE_ACTIVE_STAGES = ["new", "reviewing", "confirmed", "in_trial", "completed"] as const
export const CASE_CLOSED_STAGES = ["enrolled", "not_enrolled", "canceled", "no_show"] as const

export const CASE_STAGE_LABELS: Record<CaseStage, string> = {
  new: "신규 신청",
  reviewing: "신청 확인",
  confirmed: "일정 확정",
  in_trial: "체험 중",
  completed: "체험 완료",
  enrolled: "등록",
  not_enrolled: "미등록",
  canceled: "취소",
  no_show: "노쇼"
}

export const isCaseClosedStage = (stage: CaseStage): boolean =>
  (CASE_CLOSED_STAGES as readonly string[]).includes(stage)

export type CaseStageInput = {
  status: ApplicationStatus
  noShowAt: string | null
  registrationStatus: ApplicationRegistrationStatus
}

/**
 * 판정 우선순위
 *   1. canceled + no_show_at   → no_show
 *   2. canceled                → canceled
 *   3. completed + enrolled    → enrolled
 *   4. completed + not_enrolled→ not_enrolled
 *   5. 그 외                    → status 그대로
 *
 * 1~2 는 getStudioDisplayStatus 가 이미 담당하므로 그대로 위임하고,
 * 여기서는 completed 를 registration_status 로 한 겹 더 접는 것만 추가한다.
 */
export const getCaseStage = (input: CaseStageInput): CaseStage => {
  const displayStatus = getStudioDisplayStatus({
    status: input.status,
    noShowAt: input.noShowAt
  })

  if (displayStatus === "no_show" || displayStatus === "canceled") {
    return displayStatus
  }

  if (displayStatus === "completed") {
    if (input.registrationStatus === "enrolled") {
      return "enrolled"
    }

    if (input.registrationStatus === "not_enrolled") {
      return "not_enrolled"
    }

    return "completed"
  }

  return displayStatus
}

export type CaseDisplayStageInput = CaseStageInput & TrialScheduleWindow

/**
 * 화면에 보여줄 단계.
 *
 * 확정된 체험이 시작됐으면 DB 가 아직 confirmed 여도 "체험 중" 으로 보여준다.
 *
 * ⚠️ 시간은 "체험 완료" 를 만들지 않는다.
 *   예정 종료 시각이 지나도 계속 `체험 중` 이다. `체험 완료` 는 원장이 명시적으로
 *   완료 처리했을 때(= 실제 status 가 completed 일 때)만 나온다.
 *
 * ⚠️ 표시 의미이지 저장 의미가 아니다.
 *   - DB status 는 그대로 confirmed 다. 이 함수는 아무것도 저장하지 않는다.
 *   - 실적 집계(studio-dashboard-metrics)는 getCaseStage 를 그대로 쓴다.
 *     `체험 중` 을 체험 완료 수치에 넣지 않는다.
 *   - 등록 결정 로직도 실제 status 를 본다.
 *
 * confirmed 가 아닌 단계는 손대지 않는다. 취소/노쇼는 시간이 지나도 취소/노쇼다.
 */
export const getCaseDisplayStage = (
  input: CaseDisplayStageInput,
  now: Date = new Date()
): CaseStage => {
  const stage = getCaseStage(input)
  if (stage !== "confirmed") {
    return stage
  }

  return isTrialStarted(input, now) ? "in_trial" : stage
}

/** 목록에서 "지금 눈길이 가야 하는 이유". NONE 이면 급한 일이 없다는 뜻이다. */
export type CaseAttention =
  | "UNASSIGNED"
  | "NEEDS_TRIAL_RESULT"
  | "OVERDUE_CONTACT"
  | "TODAY_CONTACT"
  | "NEEDS_CONSULTATION"
  | "NO_NEXT_CONTACT"
  | "UPCOMING_CONTACT"
  | "NONE"

export type CaseAttentionInput = CaseStageInput &
  TrialScheduleWindow & {
  assignedTeacherId: string | null
  requestedSlotAt: string
  trialResultExists: boolean
  hasAnyConsultationHistory: boolean
  /**
   * ⚠️ trial_applications.next_contact_at 은 consultation_logs.next_contact_at 의
   * denormalized snapshot 이다. 목록 성능 때문에 이 캐시를 Source of Truth 로 쓴다.
   * 상담 기록 "수정" 시 이 캐시가 갱신되지 않는 기존 문제가 있으며 Phase 3 에서 다룬다.
   */
  nextContactAt: string | null
}

const isSameSeoulDay = (value: string, now: Date) => {
  const target = formatSeoulDateKey(value)
  const today = formatSeoulDateKey(now)
  return Boolean(target && today && target === today)
}

/**
 * 우선순위(위에서부터 먼저 이긴다)
 *   1. 종료 Case            → NONE
 *   2. 담당자 미배정         → UNASSIGNED
 *   3. 연락 기한 초과/당일    → OVERDUE_CONTACT / TODAY_CONTACT   (시간에 민감하므로 위)
 *   4. 체험 결과 미기록      → NEEDS_TRIAL_RESULT
 *   5. 그 외 후속 연락 그룹   → NEEDS_CONSULTATION / NO_NEXT_CONTACT / UPCOMING_CONTACT
 *   6. 나머지               → NONE
 *
 * 3/5 의 그룹 판정은 getConsultationPipelineGroup 을 그대로 쓰고,
 * 이 함수는 그 결과의 TODAY_CONTACT 를 "오늘"과 "기한 초과"로 한 번 더 나누기만 한다.
 */
export const getCaseAttentionState = (
  input: CaseAttentionInput,
  now: Date = new Date()
): CaseAttention => {
  const stage = getCaseStage(input)

  if (isCaseClosedStage(stage)) {
    return "NONE"
  }

  if (!input.assignedTeacherId) {
    return "UNASSIGNED"
  }

  const pipelineGroup =
    stage === "completed"
      ? getConsultationPipelineGroup(
          {
            registrationStatus: input.registrationStatus,
            nextContactAt: input.nextContactAt,
            hasAnyConsultationHistory: input.hasAnyConsultationHistory
          },
          now
        )
      : null

  if (pipelineGroup === "TODAY_CONTACT" && input.nextContactAt) {
    return isSameSeoulDay(input.nextContactAt, now) ? "TODAY_CONTACT" : "OVERDUE_CONTACT"
  }

  if (stage === "completed" && !input.trialResultExists) {
    return "NEEDS_TRIAL_RESULT"
  }

  // 확정 체험은 "예정 종료 시각" 이 지났을 때만 완료를 재촉한다.
  // 진행 중에 재촉하면 수업 중인데 끝난 것처럼 말하게 된다.
  // 종료 시각을 모르면 재촉하지 않는다 — 추정하지 않는다.
  // 배지는 그대로 `체험 중` 이다. 이 판정은 문구에만 쓴다.
  if (stage === "confirmed" && isTrialScheduledEndPassed(input, now)) {
    return "NEEDS_TRIAL_RESULT"
  }

  if (pipelineGroup === "NEEDS_CONSULTATION") {
    return "NEEDS_CONSULTATION"
  }

  if (pipelineGroup === "NO_NEXT_CONTACT") {
    return "NO_NEXT_CONTACT"
  }

  if (pipelineGroup === "UPCOMING_CONTACT") {
    return "UPCOMING_CONTACT"
  }

  return "NONE"
}

/**
 * "지금 무엇을 해야 하는가".
 *
 * 이번 Phase 에서는 새 mutation 을 만들지 않는다. label 은 안내 문구이고,
 * 실제 조작은 기존 상세 화면(/studio/applications/{id})에서 한다.
 */
export type CaseNextAction = {
  key: CaseAttention | "REVIEW_NEW" | "CONFIRM_SCHEDULE" | "NONE"
  label: string
  /**
   * 강조 톤. 대부분의 다음 행동은 "언젠가 하면 되는 일" 이므로 default 다.
   * 약속한 시각이 있는 것만 색을 쓴다.
   *   - warning : 오늘 하기로 한 일
   *   - danger  : 약속한 시각이 이미 지난 일
   * 전부 경고색이면 강조가 아무 의미도 없어진다.
   */
  tone: CaseNextActionTone
}

export type CaseNextActionTone = "default" | "warning" | "danger"

const NEXT_ACTION_NONE: CaseNextAction = { key: "NONE", label: "", tone: "default" }

export const getCaseNextAction = (
  input: CaseAttentionInput,
  now: Date = new Date()
): CaseNextAction => {
  const stage = getCaseStage(input)

  if (isCaseClosedStage(stage)) {
    return NEXT_ACTION_NONE
  }

  const attention = getCaseAttentionState(input, now)

  switch (attention) {
    case "UNASSIGNED":
      return { key: attention, label: "담당자를 배정해 주세요.", tone: "default" }
    case "OVERDUE_CONTACT":
      return { key: attention, label: "예정된 연락 시간이 지났어요.", tone: "danger" }
    case "TODAY_CONTACT":
      return { key: attention, label: "오늘 다시 연락하기로 했어요.", tone: "warning" }
    case "NEEDS_TRIAL_RESULT":
      return {
        key: attention,
        label:
          stage === "confirmed"
            ? "체험 완료 처리 후 결과를 기록해 주세요."
            : "체험 결과를 기록해 주세요.",
        tone: "default"
      }
    case "NEEDS_CONSULTATION":
      return { key: attention, label: "첫 상담 기록을 남겨 주세요.", tone: "default" }
    case "NO_NEXT_CONTACT":
      return { key: attention, label: "다음 연락일이 정해지지 않았어요.", tone: "default" }
    case "UPCOMING_CONTACT":
      return { key: attention, label: "다음 연락일이 예정되어 있어요.", tone: "default" }
    default:
      break
  }

  if (stage === "new") {
    return { key: "REVIEW_NEW", label: "신청 내용을 확인해 주세요.", tone: "default" }
  }

  if (stage === "reviewing") {
    return { key: "CONFIRM_SCHEDULE", label: "체험 일정을 확정해 주세요.", tone: "default" }
  }

  return NEXT_ACTION_NONE
}

/** 목록 한 행이 쓰는 최종 View Model. UI 는 여기서 다시 판정하지 않는다. */
export type StudioCaseListItem = {
  id: string

  student: {
    name: string
    grade: string
  }
  guardian: {
    name: string | null
    phone: string | null
  }
  klass: {
    id: string
    title: string | null
    subject: string | null
  }
  assignee: {
    teacherId: string | null
    teacherName: string | null
  }

  /** 원본 값도 함께 둔다. 상세 이동 후의 액션 가드와 비교할 때 필요하다. */
  status: ApplicationStatus
  registrationStatus: ApplicationRegistrationStatus
  stage: CaseStage

  requestedSlotAt: string
  confirmedSlotAt: string | null
  /** 확정 체험의 종료 시각 파생용. class_schedules 를 못 읽으면 null 이다. */
  scheduleStartTime: string | null
  scheduleEndTime: string | null
  trialResultExists: boolean

  latestConsultation: {
    occurredAt: string
    channel: ConsultationLogChannel | null
    sentiment: ConsultationSentiment | null
    note: string | null
    createdByName: string | null
  } | null
  consultationCount: number

  /** denormalized snapshot. CaseAttentionInput.nextContactAt 주석 참고. */
  nextContactAt: string | null
  lastActivityAt: string | null

  attention: CaseAttention
  nextAction: CaseNextAction

  createdAt: string
  completedAt: string | null
  enrolledAt: string | null
  lostAt: string | null
  canceledAt: string | null
  noShowAt: string | null
}

/** 종료 Case 의 "언제 끝났는가". 목록의 최근 활동 컬럼이 쓴다. */
export const getCaseClosedAt = (item: StudioCaseListItem): string | null => {
  switch (item.stage) {
    case "enrolled":
      return item.enrolledAt ?? item.completedAt
    case "not_enrolled":
      return item.lostAt ?? item.completedAt
    case "no_show":
      return item.noShowAt ?? item.canceledAt
    case "canceled":
      return item.canceledAt
    default:
      return null
  }
}
