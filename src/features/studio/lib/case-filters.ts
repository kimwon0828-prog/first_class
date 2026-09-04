// Case 목록의 URL 파라미터 ↔ DB 조건 매핑.
//
// UX label 과 내부 판정 규칙을 이 파일 한 곳에만 둔다. 페이지가 조건문을 들고 있으면
// 화면마다 판정이 갈라지는 기존 문제(대시보드/신청/상담이 각자 다르게 세던 것)를 반복하게 된다.
//
// 여기의 조건은 전부 trial_applications 한 row 안에서 판정 가능한 것만 쓴다.
// consultation_logs 를 봐야 하는 판정(예: NEEDS_CONSULTATION)은 DB 필터로 쓰지 않는다.
// 그래야 pagination 을 DB range 로 처리할 수 있다.

import type { ApplicationRegistrationStatus, ApplicationStatus } from "@/shared/lib/db/adapter"

export type CaseViewKey = "active" | "closed"

export type CaseActiveFilterKey = "all" | "new" | "reviewing" | "confirmed" | "post_trial"
export type CaseClosedFilterKey = "all" | "enrolled" | "not_enrolled" | "canceled" | "no_show"
export type CaseFilterKey = CaseActiveFilterKey | CaseClosedFilterKey

/** 진행 중으로 보는 registration_status. 체험 완료 후 아직 결론이 안 난 상태다. */
export const CASE_ACTIVE_REGISTRATION_STATUSES: ApplicationRegistrationStatus[] = [
  "undecided",
  "pending"
]
export const CASE_CLOSED_REGISTRATION_STATUSES: ApplicationRegistrationStatus[] = [
  "enrolled",
  "not_enrolled"
]

export const CASE_PRE_COMPLETED_STATUSES: ApplicationStatus[] = ["new", "reviewing", "confirmed"]

/**
 * DB 조건 서술자. supabase query builder 가 그대로 소비한다.
 *
 * - statusIn / registrationStatusIn : 단순 IN
 * - orExpression                    : PostgREST or() 표현식 (그룹 조건이 필요할 때)
 * - noShowAt                        : canceled 안에서 취소/노쇼를 가르는 유일한 축
 */
export type CaseFilterPredicate = {
  statusIn?: ApplicationStatus[]
  registrationStatusIn?: ApplicationRegistrationStatus[]
  orExpression?: string
  noShowAt?: "null" | "not_null"
}

const ACTIVE_OR_EXPRESSION = `status.in.(${CASE_PRE_COMPLETED_STATUSES.join(
  ","
)}),and(status.eq.completed,registration_status.in.(${CASE_ACTIVE_REGISTRATION_STATUSES.join(",")}))`

const CLOSED_OR_EXPRESSION = `status.eq.canceled,and(status.eq.completed,registration_status.in.(${CASE_CLOSED_REGISTRATION_STATUSES.join(
  ","
)}))`

/** view 자체의 기본 스코프. filter=all 일 때 그대로 쓰인다. */
export const CASE_VIEW_PREDICATES: Record<CaseViewKey, CaseFilterPredicate> = {
  active: { orExpression: ACTIVE_OR_EXPRESSION },
  closed: { orExpression: CLOSED_OR_EXPRESSION }
}

export type CaseFilterOption<K extends string> = {
  key: K
  label: string
  /** label 아래 보조 설명이 필요한 필터만 채운다. */
  description?: string
}

export const CASE_ACTIVE_FILTERS: Array<CaseFilterOption<CaseActiveFilterKey>> = [
  { key: "all", label: "전체" },
  { key: "new", label: "신규 신청" },
  { key: "reviewing", label: "신청 확인" },
  { key: "confirmed", label: "일정 확정" },
  { key: "post_trial", label: "체험 후 관리", description: "체험을 마치고 아직 등록 결론이 나지 않은 Case" }
]

export const CASE_CLOSED_FILTERS: Array<CaseFilterOption<CaseClosedFilterKey>> = [
  { key: "all", label: "전체" },
  { key: "enrolled", label: "등록" },
  { key: "not_enrolled", label: "미등록" },
  { key: "canceled", label: "취소" },
  { key: "no_show", label: "노쇼" }
]

/**
 * 진행 중 필터.
 *
 * 네 개 필터(new/reviewing/confirmed/post_trial)는 서로 겹치지 않고,
 * 합치면 view=active 전체와 정확히 같다.
 *
 * ⚠️ 파생 단계 `체험 중` 은 여기에 필터로 두지 않는다. 배지의 canonical 시작 시각은
 *    resolveTrialStartAtMs(confirmed_block.start_at → confirmed_slot_at)인데,
 *    PostgREST 는 논리식(or)에서 embed 컬럼을 참조할 수 없고, embed 를 !inner 로 걸면
 *    시작 시각을 모르는 confirmed Case(확정 블록 없음)가 목록에서 통째로 사라진다.
 *    같은 의미를 DB 에서 정확히 표현할 수 없으므로 필터로 만들지 않는다.
 *    자세한 근거는 scripts/verify-case-in-trial-filter.ts 참고.
 *
 * "체험 후 관리" 는 next_contact_at 유무로 더 쪼개지 않는다. 다음 연락이 잡혔는지,
 * 오늘인지, 지났는지는 목록 안에서 getCaseAttentionState() / getCaseNextAction() 이
 * 이미 구분해 주므로 필터를 둘로 나누면 같은 개념이 두 곳에서 판정된다.
 */
const ACTIVE_FILTER_PREDICATES: Record<CaseActiveFilterKey, CaseFilterPredicate> = {
  all: CASE_VIEW_PREDICATES.active,
  new: { statusIn: ["new"] },
  reviewing: { statusIn: ["reviewing"] },
  confirmed: { statusIn: ["confirmed"] },
  post_trial: {
    statusIn: ["completed"],
    registrationStatusIn: CASE_ACTIVE_REGISTRATION_STATUSES
  }
}

/**
 * 완료·종료 필터.
 *
 * 취소/노쇼는 DB 상 같은 status='canceled' 이고 no_show_at 유무로만 갈린다
 * (isCanceledApplication / isNoShowApplication 과 같은 규칙을 DB 조건으로 옮긴 것).
 */
const CLOSED_FILTER_PREDICATES: Record<CaseClosedFilterKey, CaseFilterPredicate> = {
  all: CASE_VIEW_PREDICATES.closed,
  enrolled: { statusIn: ["completed"], registrationStatusIn: ["enrolled"] },
  not_enrolled: { statusIn: ["completed"], registrationStatusIn: ["not_enrolled"] },
  canceled: { statusIn: ["canceled"], noShowAt: "null" },
  no_show: { statusIn: ["canceled"], noShowAt: "not_null" }
}

export const resolveCaseView = (value: string | null | undefined): CaseViewKey =>
  value === "closed" ? "closed" : "active"

export const resolveCaseFilter = (view: CaseViewKey, value: string | null | undefined): CaseFilterKey => {
  if (view === "closed") {
    return CASE_CLOSED_FILTERS.some((option) => option.key === value)
      ? (value as CaseClosedFilterKey)
      : "all"
  }

  return CASE_ACTIVE_FILTERS.some((option) => option.key === value)
    ? (value as CaseActiveFilterKey)
    : "all"
}

export const getCaseFilterPredicate = (
  view: CaseViewKey,
  filter: CaseFilterKey
): CaseFilterPredicate => {
  if (view === "closed") {
    return CLOSED_FILTER_PREDICATES[filter as CaseClosedFilterKey] ?? CASE_VIEW_PREDICATES.closed
  }

  return ACTIVE_FILTER_PREDICATES[filter as CaseActiveFilterKey] ?? CASE_VIEW_PREDICATES.active
}

export const getCaseFilterOptions = (view: CaseViewKey) =>
  view === "closed" ? CASE_CLOSED_FILTERS : CASE_ACTIVE_FILTERS

export const CASE_PAGE_SIZE = 25

export const resolveCasePage = (value: string | null | undefined): number => {
  const parsed = Number.parseInt(String(value ?? "1"), 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1
  }

  // 과도한 offset 요청으로 DB 를 훑지 않도록 상한을 둔다.
  return Math.min(parsed, 400)
}

/**
 * PostgREST or() 표현식은 콤마/괄호로 항을 나눈다. 검색어에 이 문자가 들어가면
 * 표현식이 깨지므로 제거한다. ilike 패턴 문자(*, %)도 함께 막는다.
 */
export const sanitizeCaseSearchQuery = (value: string | null | undefined): string => {
  return String(value ?? "")
    .trim()
    .replace(/[(),*%\\"']/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .trim()
}
