// Case 활동 기록(Activity) 구성.
//
// 새 audit table 을 만들지 않는다. 이미 상세 query 가 돌려주는 데이터만 합친다.
//   - consultation_logs        (상담 기록)
//   - application_logs         (status 전이)
//   - trial_results.created_at / updated_at
//   - application 의 lifecycle timestamp (created_at / enrolled_at / lost_at)
//
// ⚠️ 없는 이력은 만들지 않는다.
//   담당자 배정/변경 이력과 일정 재변경 이력은 DB 에 남지 않는다(Phase 0 조사의 Event C).
//   "현재 담당이 김원식" 이라는 사실만으로 "8/25 김원식 배정" 같은 항목을 추측해 넣지 않는다.
//
// application_logs 중 from_status === to_status 인 행은 등록 전환 저장 시 남는 부가 로그라
// 전이가 아니다. 같은 순간의 상담 기록과 중복되므로 여기서는 쓰지 않고,
// 등록/미등록은 정확한 enrolled_at / lost_at 으로만 표시한다.

import { getConsultationChannelLabel, getConsultationSentimentLabel } from "@/features/studio/lib/consultation-log-options"
import { getTrialResultRegistrationLabel } from "@/features/studio/lib/trial-result-options"
import type { ApplicationStatus, StudioApplicationDetail } from "@/shared/lib/db/adapter"

export type CaseActivityKind = "consultation" | "lifecycle" | "trial_result"

export type CaseActivityEvent = {
  id: string
  at: string
  kind: CaseActivityKind
  title: string
  /** 제목 옆 보조 정보(작성자 등). */
  meta: string | null
  /** 자유 서술 메모. 상담 내용 등. */
  note: string | null
  /** "등록 상태 · 고민 중" 같은 짧은 항목들. */
  details: string[]
  /** 날짜 표기는 UI 가 한다. 여기서는 원본 ISO 만 넘긴다. */
  nextContactAt: string | null
}

const STATUS_TRANSITION_LABELS: Record<ApplicationStatus, string> = {
  new: "신규 신청",
  reviewing: "상담/확인 시작",
  confirmed: "일정 확정",
  completed: "체험 완료",
  canceled: "신청 취소"
}

const toTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

/** 저장 직후의 updated_at 은 created_at 과 사실상 같다. 수정으로 볼 최소 간격. */
const TRIAL_RESULT_EDIT_THRESHOLD_MS = 60 * 1000

export const buildCaseActivityEvents = (
  application: StudioApplicationDetail
): CaseActivityEvent[] => {
  const events: CaseActivityEvent[] = []

  // 1. 상담 기록. 화면에서 가장 중요한 축이라 먼저 담는다.
  for (const log of application.consultationLogs) {
    const channelLabel = getConsultationChannelLabel(log.channel)
    const sentimentLabel = getConsultationSentimentLabel(log.sentiment)
    const registrationLabel = getTrialResultRegistrationLabel(log.registrationStatusSnapshot)
    const details: string[] = []

    if (sentimentLabel) {
      details.push(`학부모 반응 · ${sentimentLabel}`)
    }

    if (registrationLabel) {
      details.push(`등록 상태 · ${registrationLabel}`)
    }

    events.push({
      id: `consultation-${log.id}`,
      at: log.occurredAt,
      kind: "consultation",
      title:
        log.activityType === "LEGACY_IMPORT"
          ? "이전 상담 기록"
          : channelLabel
            ? `${channelLabel} 상담`
            : "상담 기록",
      meta: null,
      note: log.note?.trim() ? log.note.trim() : null,
      details,
      nextContactAt: log.nextContactAt
    })
  }

  // 2. status 전이. from !== to 인 로그만 실제 전이다.
  const transitionLogs = application.logs.filter((log) => log.fromStatus !== log.toStatus)
  for (const log of transitionLogs) {
    const isNoShow = log.toStatus === "canceled" && Boolean(application.noShowAt)

    events.push({
      id: `lifecycle-${log.id}`,
      at: log.createdAt,
      kind: "lifecycle",
      title: isNoShow ? "노쇼 처리" : STATUS_TRANSITION_LABELS[log.toStatus],
      meta: log.actorName,
      note: null,
      details: [],
      nextContactAt: null
    })
  }

  // 3. 신규 신청. 로그에 남아 있지 않은 경우에만 created_at 으로 보완한다(중복 방지).
  if (!transitionLogs.some((log) => log.toStatus === "new")) {
    events.push({
      id: "lifecycle-created",
      at: application.createdAt,
      kind: "lifecycle",
      title: "신규 신청",
      meta: null,
      note: null,
      details: [],
      nextContactAt: null
    })
  }

  // 4. 등록 / 미등록. 정확한 timestamp 가 있을 때만 넣는다.
  if (application.registrationStatus === "enrolled" && application.enrolledAt) {
    events.push({
      id: "lifecycle-enrolled",
      at: application.enrolledAt,
      kind: "lifecycle",
      title: "등록 완료",
      meta: null,
      note: null,
      details: [],
      nextContactAt: null
    })
  }

  if (application.registrationStatus === "not_enrolled" && application.lostAt) {
    events.push({
      id: "lifecycle-not-enrolled",
      at: application.lostAt,
      kind: "lifecycle",
      title: "미등록 확정",
      meta: null,
      note: null,
      details: [],
      nextContactAt: null
    })
  }

  // 5. 체험 결과 기록 / 수정.
  const trialResult = application.trialResult
  if (trialResult) {
    events.push({
      id: `trial-result-${trialResult.id}`,
      at: trialResult.createdAt,
      kind: "trial_result",
      title: "체험 결과 기록",
      meta: null,
      note: null,
      details: [],
      nextContactAt: null
    })

    const createdAt = toTimestamp(trialResult.createdAt)
    const updatedAt = toTimestamp(trialResult.updatedAt)
    if (createdAt != null && updatedAt != null && updatedAt - createdAt > TRIAL_RESULT_EDIT_THRESHOLD_MS) {
      events.push({
        id: `trial-result-updated-${trialResult.id}`,
        at: trialResult.updatedAt,
        kind: "trial_result",
        title: "체험 결과 수정",
        meta: null,
        note: null,
        details: [],
        nextContactAt: null
      })
    }
  }

  return events
    .filter((event) => toTimestamp(event.at) != null)
    .sort((left, right) => (toTimestamp(right.at) ?? 0) - (toTimestamp(left.at) ?? 0))
}
