import type { ChildProfile, ParentApplicationSummary } from "@/shared/lib/db/adapter"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

/**
 * Parent Home 의 개인화 영역이 쓰는 순수 로직.
 *
 * ⚠️ 여기서 새 사실을 만들지 않는다. 이미 학부모 화면이 읽고 있던 값
 *    (신청 상태 · 확정 시각 · 발행본 존재 여부 · 자녀 프로필)만 다시 배열한다.
 *    일치율 · 추천 점수 · 랭킹처럼 근거 없는 지표는 이 파일이 만들지 않는다.
 */

/** 홈 상단 "지금 확인할 것" 한 줄. */
export type ParentHomeHighlight = {
  /** 이 줄이 가리키는 경험(=신청) id. */
  experienceId: string
  kind: "report_ready" | "decision_requested"
  title: string
  href: string
  actionLabel: string
}

/** 홈 "다가오는 수업 일정" 한 장. */
export type ParentHomeUpcoming = {
  experienceId: string
  classTitle: string
  academyName: string | null
  /** 한국 시간으로 읽은 확정 일정. 확정되지 않은 신청은 여기 오지 않는다. */
  scheduleLabel: string
  startAt: string
  href: string
  coverImageUrl: string | null
}

export const PARENT_HOME_HIGHLIGHT_LIMIT = 3
export const PARENT_HOME_UPCOMING_LIMIT = 2
/** 발행본 조회는 최근 완료 경험 몇 건까지만 확인한다. 홈에서 전 이력을 훑지 않는다. */
export const PARENT_HOME_REPORT_LOOKUP_LIMIT = 3

const HOUR_LABELS = ["오전", "오후"] as const

/** "9월 15일 오후 1시" / 분이 있으면 "오후 1시 30분". */
export const formatHomeScheduleLabel = (value: string | null | undefined): string | null => {
  if (!value) {
    return null
  }

  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  const meridiem = parts.hour < 12 ? HOUR_LABELS[0] : HOUR_LABELS[1]
  const rawHour = parts.hour % 12
  const hour = rawHour === 0 ? 12 : rawHour
  const time = parts.minute > 0 ? `${hour}시 ${parts.minute}분` : `${hour}시`

  return `${parts.month}월 ${parts.day}일 ${meridiem} ${time}`
}

/**
 * 헤더의 아이 칩 문구.
 *
 * 아이가 여럿이면 한 명을 골라 대표로 쓰지 않는다 — 홈은 아이를 고르는
 * 화면이 아니고, 임의로 고른 이름은 그 아이의 화면이라는 잘못된 신호가 된다.
 */
export const formatChildChipLabel = (children: readonly ChildProfile[]): string | null => {
  if (children.length === 0) {
    return null
  }

  if (children.length === 1) {
    const [child] = children
    const grade = child.grade.trim()
    return grade ? `${grade} ${child.name}` : child.name
  }

  return `우리 아이 ${children.length}명`
}

const toTime = (value: string | null): number => {
  if (!value) {
    return Number.POSITIVE_INFINITY
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

/**
 * 확정된 앞으로의 일정만 고른다.
 *
 * requestedSlotAt 은 학부모가 희망한 시각이지 학원이 확정한 일정이 아니다.
 * 그걸 "다가오는 수업 일정" 에 섞으면 확정되지 않은 약속을 확정처럼 보여주게 된다.
 */
export const selectUpcomingExperiences = (
  applications: readonly ParentApplicationSummary[],
  now: number
): ParentApplicationSummary[] =>
  applications
    .filter((item) => {
      if (item.status !== "confirmed" || item.canceledAt || item.completedAt) {
        return false
      }

      const startAt = toTime(item.confirmedSlotAt)
      return Number.isFinite(startAt) && startAt >= now
    })
    .sort(
      (left, right) =>
        toTime(left.confirmedSlotAt) - toTime(right.confirmedSlotAt) || left.id.localeCompare(right.id)
    )
    .slice(0, PARENT_HOME_UPCOMING_LIMIT)

/** 발행본 존재 여부를 확인해 볼 후보. 완료된 경험만, 최근 순으로 몇 건. */
export const selectReportLookupCandidates = (
  applications: readonly ParentApplicationSummary[]
): ParentApplicationSummary[] =>
  applications
    .filter((item) => item.status === "completed" && Boolean(item.completedAt) && !item.canceledAt)
    .sort(
      (left, right) =>
        toTime(right.completedAt) - toTime(left.completedAt) || right.id.localeCompare(left.id)
    )
    .slice(0, PARENT_HOME_REPORT_LOOKUP_LIMIT)

/**
 * "지금 확인할 것" 목록.
 *
 * 리포트가 도착한 경험이 먼저다 — 학부모가 읽을 것이 이미 와 있는 쪽이
 * 우리가 무언가를 물어보는 쪽보다 앞선다.
 */
export const buildParentHomeHighlights = (
  applications: readonly ParentApplicationSummary[],
  reportReadyExperienceIds: ReadonlySet<string>
): ParentHomeHighlight[] => {
  const reportReady: ParentHomeHighlight[] = []
  const decisionRequested: ParentHomeHighlight[] = []

  for (const item of applications) {
    if (item.canceledAt) {
      continue
    }

    if (reportReadyExperienceIds.has(item.id)) {
      reportReady.push({
        experienceId: item.id,
        kind: "report_ready",
        title: "수업 리포트가 도착했어요!",
        href: `/record/${item.id}/report`,
        actionLabel: "보기"
      })
      continue
    }

    if (item.canCollectParentDecision) {
      decisionRequested.push({
        experienceId: item.id,
        kind: "decision_requested",
        title: "체험은 어떠셨나요?",
        href: `/record/${item.id}`,
        actionLabel: "알려주기"
      })
    }
  }

  return [...reportReady, ...decisionRequested].slice(0, PARENT_HOME_HIGHLIGHT_LIMIT)
}
