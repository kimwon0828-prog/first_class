import type { CaseFilterKey, CaseViewKey } from "./case-filters"

export type CasesOrderRow = {
  id: string; status: string; registration_status: string | null
  created_at: string | null; requested_slot_at: string | null; confirmed_slot_at: string | null
  completed_at: string | null; enrolled_at: string | null; lost_at: string | null
  canceled_at: string | null; no_show_at: string | null; next_contact_at: string | null
  confirmed_block: { start_at: string; end_at: string } | { start_at: string; end_at: string }[] | null
}
export type CasesOrderLog = {
  application_id: string; from_status: string | null; to_status: string; note: string | null; created_at: string
}
export type CasesRegistrationClock = {
  application_id: string; result: string; resolved_at: string | null; superseded_at: string | null
}
export type CasesResultRecord = { at: string | null; label: string }
export const caseTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}
const latest = (values: Array<string | null | undefined>) => values
  .filter((at): at is string => caseTimestamp(at) !== null)
  .sort((a, b) => caseTimestamp(b)! - caseTimestamp(a)!)[0] ?? null

// Only explicit result transitions count. Same-status reason/note edits and contact
// records do not advance this clock. Legacy free text does not prove a transition.
function registrationTransition(log: CasesOrderLog, status: string | null) {
  if (log.from_status !== "completed" || log.to_status !== "completed" || !log.note) return false
  try {
    const value = JSON.parse(log.note)
    return value?.event === "registration_result_saved" && typeof value.before?.status === "string" &&
      value.after?.status === status && value.before.status !== value.after.status
  } catch { return false }
}
export function getCasesResultRecord(row: CasesOrderRow, logs: CasesOrderLog[], results: CasesRegistrationClock[]): CasesResultRecord {
  const ownLogs = logs.filter(log => log.application_id === row.id)
  if (row.no_show_at) return { at: latest([row.no_show_at]), label: "노쇼 처리" }
  if (row.status === "canceled" || row.canceled_at) return {
    at: latest([row.canceled_at]) ?? latest(ownLogs.filter(log => log.to_status === "canceled" && log.from_status !== "canceled").map(log => log.created_at)),
    label: "취소 처리"
  }
  const status = row.registration_status
  const label = status === "pending" ? "고민 중 전환" : status === "enrolled" ? "등록 완료" : "미등록"
  const transitionAt = latest(ownLogs.filter(log => registrationTransition(log, status)).map(log => log.created_at))
  if (status === "pending") return { at: transitionAt, label }
  // Immutable current result first; a later consultation must not change result order.
  const resultAt = latest(results.filter(result => result.application_id === row.id && result.result === status && !result.superseded_at).map(result => result.resolved_at))
  return { at: resultAt ?? transitionAt ?? latest([status === "enrolled" ? row.enrolled_at : row.lost_at]), label }
}
const compareTime = (a: number | null, b: number | null, descending = false) => {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return descending ? b - a : a - b
}
const stableId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const blockStart = (row: CasesOrderRow) => {
  const block = Array.isArray(row.confirmed_block) ? row.confirmed_block[0] : row.confirmed_block
  return caseTimestamp(block?.start_at) ?? caseTimestamp(row.confirmed_slot_at)
}
const activeGroup = (row: CasesOrderRow) => row.status === "new" || row.status === "reviewing" ||
  (row.status === "confirmed" && blockStart(row) === null) ? 0 : row.status === "confirmed" ? 1 : 2

export function orderStudioCases<T extends CasesOrderRow>(rows: T[], view: CaseViewKey, filter: CaseFilterKey,
  records: Map<string, CasesResultRecord>, now = new Date()): T[] {
  return [...rows].sort((a, b) => {
    let difference = 0
    if (view === "active") {
      difference = activeGroup(a) - activeGroup(b)
      if (!difference && activeGroup(a) < 2) {
        difference = compareTime(blockStart(a) ?? caseTimestamp(a.requested_slot_at), blockStart(b) ?? caseTimestamp(b.requested_slot_at)) ||
          compareTime(caseTimestamp(a.created_at), caseTimestamp(b.created_at))
      } else if (!difference) {
        // Existing remaining-work cohort stays receipt-newest; schedule cohorts precede it.
        difference = compareTime(caseTimestamp(a.created_at), caseTimestamp(b.created_at), true)
      }
    } else if (filter === "pending") {
      // DB timestamptz values are absolute instants: KST and UTC representations compare identically.
      const aContact = caseTimestamp(a.next_contact_at), bContact = caseTimestamp(b.next_contact_at)
      const aDue = aContact !== null && aContact <= now.getTime(), bDue = bContact !== null && bContact <= now.getTime()
      difference = Number(bDue) - Number(aDue)
      if (!difference && aDue && bDue) difference = compareTime(aContact, bContact)
      if (!difference) difference = compareTime(caseTimestamp(a.completed_at), caseTimestamp(b.completed_at)) ||
        compareTime(caseTimestamp(a.created_at), caseTimestamp(b.created_at))
    } else {
      // Unknown historical clocks use completion then receipt ONLY for deterministic ordering.
      // They remain visibly "처리일 미기록" and never use updated_at/last_activity_at.
      const resultTime = (row: T) => caseTimestamp(records.get(row.id)?.at) ?? caseTimestamp(row.completed_at) ?? caseTimestamp(row.created_at)
      difference = compareTime(resultTime(a), resultTime(b), true)
    }
    return difference || stableId(a.id, b.id)
  })
}
