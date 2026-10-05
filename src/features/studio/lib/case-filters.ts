// Cases URL state and relational PostgREST predicates. Filter before DB pagination.
export type CaseViewKey = "active" | "closed"
export type CaseActiveFilterKey = "all" | "new" | "schedule_needed" | "reviewing" | "confirmed" | "post_trial"
export type CaseClosedFilterKey = "all" | "pending" | "enrolled" | "not_enrolled" | "canceled" | "no_show"
export type CaseFilterKey = CaseActiveFilterKey | CaseClosedFilterKey
export type CaseFilterOption<K extends string> = { key: K; label: string; description?: string }
export const CASE_ACTIVE_FILTERS: CaseFilterOption<CaseActiveFilterKey>[] = [
  { key: "all", label: "전체" }, { key: "new", label: "신청 접수" },
  { key: "schedule_needed", label: "일정 확정 필요", description: "확인 중이거나 확정 일정이 없는 신청" },
  { key: "confirmed", label: "체험 예정", description: "일정이 확정되어 체험 진행·완료 확인이 필요한 신청" },
  { key: "post_trial", label: "결과 정리 필요" }
]
export const CASE_CLOSED_FILTERS: CaseFilterOption<CaseClosedFilterKey>[] = [
  { key: "all", label: "전체" }, { key: "pending", label: "고민중" }, { key: "enrolled", label: "등록 완료" },
  { key: "not_enrolled", label: "미등록" }, { key: "canceled", label: "취소" }, { key: "no_show", label: "노쇼" }
]
const live = "no_show_at.is.null,canceled_at.is.null,status.neq.canceled"
const unfinished = "or(record.is.null,report.is.null,registration_status.in.(undecided,pending))"
const pending = `and(${live},status.eq.completed,registration_status.eq.pending)`
const decided = `and(${live},registration_status.in.(enrolled,not_enrolled))`
const scheduled = "or(confirmed_slot_at.not.is.null,confirmed_block.not.is.null)"
export type CaseFilterPredicate = { orExpression: string }
export const CASE_VIEW_PREDICATES: Record<CaseViewKey, CaseFilterPredicate> = {
  active: { orExpression: `and(${live},or(status.in.(new,reviewing,confirmed),and(status.eq.completed,${unfinished})))` },
  // Result filters and the whole result list use the same inclusion rules.
  // Remaining record/report work may still appear in the active work list.
  closed: { orExpression: `no_show_at.not.is.null,canceled_at.not.is.null,status.eq.canceled,${pending},${decided}` }
}
export function getCaseFilterPredicate(view: CaseViewKey, filter: CaseFilterKey): CaseFilterPredicate {
  if (filter === "all") return CASE_VIEW_PREDICATES[view]
  if (view === "closed") {
    if (filter === "pending") return { orExpression: pending }
    if (filter === "no_show") return { orExpression: "no_show_at.not.is.null" }
    if (filter === "canceled") return { orExpression: "and(no_show_at.is.null,or(status.eq.canceled,canceled_at.not.is.null))" }
    // Registration results are independent of remaining record/report work.
    // Terminal cancel/no-show stay in their own filters.
    if (filter === "enrolled" || filter === "not_enrolled") return { orExpression: `and(${live},registration_status.eq.${filter})` }
  } else {
    if (filter === "new") return { orExpression: `and(${live},status.eq.new)` }
    if (filter === "schedule_needed" || filter === "reviewing") return { orExpression: `and(${live},or(status.eq.reviewing,and(status.eq.confirmed,confirmed_slot_at.is.null,confirmed_block.is.null)))` }
    if (filter === "confirmed") return { orExpression: `and(${live},status.eq.confirmed,${scheduled})` }
    if (filter === "post_trial") return { orExpression: `and(${live},status.eq.completed,${unfinished})` }
  }
  return CASE_VIEW_PREDICATES[view]
}
export const resolveCaseView = (value: string | null | undefined): CaseViewKey => value === "closed" ? "closed" : "active"
export function resolveCaseFilter(view: CaseViewKey, value: string | null | undefined): CaseFilterKey {
  const normalized = value === "reviewing" ? "schedule_needed" : value
  return getCaseFilterOptions(view).some(option => option.key === normalized) ? normalized as CaseFilterKey : "all"
}
export const getCaseFilterOptions = (view: CaseViewKey) => view === "closed" ? CASE_CLOSED_FILTERS : CASE_ACTIVE_FILTERS

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
