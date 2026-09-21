import type { ApplicationStatus, ParentApplicationSummary } from "@/shared/lib/db/adapter"

/**
 * 신청 현황과 교육 기록을 가르는 단 하나의 규칙.
 *
 * 네 화면이 서로 다른 질문에 답한다. 한 신청은 그중 한 자리에만 있어야 한다.
 *
 *   /my/applications  내가 신청한 것이 지금 어떻게 진행되고 있지?
 *   /my/schedule      다음 수업이 언제지?            (확정된 미래만)
 *   /record           아이가 무엇을 경험했지?         (실제로 다녀온 것만)
 *   /notifications의 리포트 안내       내가 지금 해야 할 일이 뭐지?
 *
 * ⚠️ status 문자열을 새로 만들지 않는다. adapter 의 ApplicationStatus 가 전부다:
 *    new · reviewing · confirmed · completed · canceled
 */

/** 신청 현황이 맡는 상태. completed 만 빠진다 — 그건 기록이다. */
export const APPLICATION_STATUS_IN_PROGRESS: readonly ApplicationStatus[] = [
  "new",
  "reviewing",
  "confirmed"
]

/** 취소도 신청 현황에 남는다. 내가 취소한 신청도 다시 확인할 수 있어야 한다. */
export const APPLICATION_STATUS_CANCELED: ApplicationStatus = "canceled"

/** 기록이 맡는 상태. */
export const EXPERIENCE_STATUS_COMPLETED: ApplicationStatus = "completed"

const toTime = (value: string | null): number => {
  if (!value) {
    return 0
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const byNewestCreated = (left: ParentApplicationSummary, right: ParentApplicationSummary) =>
  toTime(right.createdAt) - toTime(left.createdAt) || right.id.localeCompare(left.id)

/** 아직 진행 중인 신청. 확인 중 · 확정 대기 · 확정까지. */
export const selectInProgressApplications = (
  applications: readonly ParentApplicationSummary[]
): ParentApplicationSummary[] =>
  applications
    .filter((item) => APPLICATION_STATUS_IN_PROGRESS.includes(item.status))
    .sort(byNewestCreated)

/**
 * 취소된 신청.
 *
 * ⚠️ 목록에서 지우지 않는다. 다만 예정 일정처럼 보이게 하지도 않는다 —
 *    화면이 따로 묶고, 확정 시각을 일정처럼 강조하지 않는다.
 */
export const selectCanceledApplications = (
  applications: readonly ParentApplicationSummary[]
): ParentApplicationSummary[] =>
  applications
    .filter((item) => item.status === APPLICATION_STATUS_CANCELED)
    .sort(byNewestCreated)

/**
 * 실제로 다녀온 경험.
 *
 * ⚠️ 목록 기준일 뿐이다. /record/[experienceId] 의 접근 권한은 이것과 무관하며
 *    이번 단계에서 좁히지 않는다.
 */
export const selectCompletedExperiences = (
  applications: readonly ParentApplicationSummary[]
): ParentApplicationSummary[] =>
  applications
    .filter((item) => item.status === EXPERIENCE_STATUS_COMPLETED)
    .sort(
      (left, right) =>
        toTime(right.completedAt) - toTime(left.completedAt) || right.id.localeCompare(left.id)
    )

/** 신청 현황이 보여 줄 것이 하나라도 있는가(취소만 있어도 비어 있지 않다). */
export const hasAnyApplicationStatusItem = (
  applications: readonly ParentApplicationSummary[]
): boolean =>
  selectInProgressApplications(applications).length > 0 ||
  selectCanceledApplications(applications).length > 0
