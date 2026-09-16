import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"

/**
 * 학부모가 "지금 실제로 해야 하는 일".
 *
 * ⚠️ 알림함이 아니다. 상태 안내는 Action 이 아니다 —
 *    "학원 확인 중" · "예약 확정됨" · "다가오는 수업" 은 여기 오지 않는다.
 *    다가오는 일정은 /my/schedule 의 책임이다.
 *
 * ⚠️ 읽음/안읽음을 발명하지 않는다. 그런 상태가 DB 에 없다.
 *    V1 의 판정은 객관적인 두 사실의 조합뿐이다 —
 *      살아 있는 발행본이 있다  AND  아직 ParentDecision 이 없다.
 */
export type ParentActionKind = "report_review"

export type ParentAction = {
  /** 목록 key. 한 경험에 한 Action 이라 experienceId 와 kind 로 충분하다. */
  id: string
  kind: ParentActionKind
  experienceId: string
  childName: string
  childGrade: string
  classTitle: string | null
  academyName: string | null
  title: string
  ctaLabel: string
  href: string
}

/** Home 이 미리 보여 주는 개수. 전체는 /my/actions 가 맡는다. */
export const PARENT_ACTION_PREVIEW_LIMIT = 3

/**
 * 발행본 · 결정을 확인해 볼 경험.
 *
 * 끝난 경험만 본다. 아직 다녀오지 않은 체험에는 발행본이 있을 수 없고,
 * 취소된 신청에 대해서는 아무것도 묻지 않는다.
 */
export const selectParentActionCandidates = (
  applications: readonly ParentApplicationSummary[]
): ParentApplicationSummary[] =>
  applications.filter(
    (item) => item.status === "completed" && Boolean(item.completedAt) && !item.canceledAt
  )

const toTime = (value: string | null): number => {
  if (!value) {
    return 0
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * 지금 해야 할 일 목록.
 *
 * Home 의 "지금 확인할 것" 과 /my/actions 가 이 함수 하나를 쓴다 —
 * 두 화면이 서로 다른 목록을 말하면 어느 쪽도 믿을 수 없다.
 *
 * ⚠️ 우선순위 점수 · 마감 · 긴급도를 만들지 않는다. 그런 값이 없다.
 *    최근에 끝난 경험이 앞에 올 뿐이다.
 */
export const selectParentActions = (input: {
  applications: readonly ParentApplicationSummary[]
  /** 지금 살아 있는 발행본이 있는 경험. */
  reportedExperienceIds: ReadonlySet<string>
  /** 이미 ParentDecision 이 남아 있는 경험. 무엇을 골랐는지는 보지 않는다. */
  decidedExperienceIds: ReadonlySet<string>
}): ParentAction[] =>
  selectParentActionCandidates(input.applications)
    .filter(
      (item) =>
        input.reportedExperienceIds.has(item.id) && !input.decidedExperienceIds.has(item.id)
    )
    .sort(
      (left, right) =>
        toTime(right.completedAt) - toTime(left.completedAt) || right.id.localeCompare(left.id)
    )
    .map((item) => ({
      id: `report_review:${item.id}`,
      kind: "report_review" as const,
      experienceId: item.id,
      childName: item.childName,
      childGrade: item.childGrade,
      classTitle: item.classTitle,
      academyName: item.academyName,
      title: "체험 리포트를 확인해 주세요",
      ctaLabel: "확인하기",
      href: `/record/${item.id}/report`
    }))

/** "김사랑 · 영어 레벨테스트" */
export const formatParentActionSubject = (action: ParentAction): string =>
  [action.childName, action.classTitle].filter(Boolean).join(" · ")
