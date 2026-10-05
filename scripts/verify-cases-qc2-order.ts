import assert from "node:assert/strict"
import { CASE_CLOSED_FILTERS, resolveCaseFilter } from "@/features/studio/lib/case-filters"
import { getCasesResultRecord, orderStudioCases, type CasesOrderRow, type CasesOrderLog } from "@/features/studio/lib/cases-order"

const now = new Date("2026-10-05T09:00:00+09:00")
const row = (id: string, overrides: Partial<CasesOrderRow> = {}): CasesOrderRow => ({
  id, status: "completed", registration_status: "pending", created_at: "2026-09-01T00:00:00Z",
  requested_slot_at: null, confirmed_slot_at: null, confirmed_block: null, completed_at: "2026-09-02T00:00:00Z",
  enrolled_at: null, lost_at: null, canceled_at: null, no_show_at: null, next_contact_at: null, ...overrides
})
const ids = (rows: CasesOrderRow[]) => rows.map(row => row.id)
assert.deepEqual(CASE_CLOSED_FILTERS.map(x => x.key), ["all", "pending", "enrolled", "not_enrolled", "canceled", "no_show"])
assert.equal(resolveCaseFilter("closed", "pending"), "pending")
assert.equal(resolveCaseFilter("active", "pending"), "all")
const active = [
  row("confirmed-early", { status: "confirmed", confirmed_slot_at: "2026-10-06T01:00:00Z" }),
  row("wait-later", { status: "new", requested_slot_at: "2026-10-09T01:00:00Z" }),
  row("wait-tie-newer", { status: "reviewing", requested_slot_at: "2026-10-07T01:00:00Z", created_at: "2026-09-02T00:00:00Z" }),
  row("wait-tie-older", { status: "new", requested_slot_at: "2026-10-07T10:00:00+09:00" }),
  row("wait-no-time-b", { status: "new" }), row("wait-no-time-a", { status: "confirmed" }),
  row("confirmed-block", { status: "confirmed", confirmed_slot_at: "2026-10-01T00:00:00Z", confirmed_block: { start_at: "2026-10-08T01:00:00Z", end_at: "2026-10-08T02:00:00Z" } }),
  row("work")
]
assert.deepEqual(ids(orderStudioCases(active, "active", "all", new Map(), now)), [
  "wait-tie-older", "wait-tie-newer", "wait-later", "wait-no-time-a", "wait-no-time-b", "confirmed-early", "confirmed-block", "work"
])
const pending = [
  row("future", { next_contact_at: "2026-10-05T09:00:01+09:00", completed_at: "2026-08-01T00:00:00Z" }),
  row("undated", { completed_at: "2026-07-01T00:00:00Z" }),
  row("due-older-completion", { next_contact_at: "2026-10-05T08:00:00+09:00" }),
  row("due-newer-completion", { next_contact_at: "2026-10-04T23:00:00Z", completed_at: "2026-09-03T00:00:00Z" }),
  row("overdue", { next_contact_at: "2026-10-04T23:59:59+09:00" }),
  row("exact-now", { next_contact_at: now.toISOString() }),
  row("missing-completion", { completed_at: null })
]
assert.deepEqual(ids(orderStudioCases(pending, "closed", "pending", new Map(), now)), [
  "overdue", "due-older-completion", "due-newer-completion", "exact-now", "undated", "future", "missing-completion"
])
assert.deepEqual(ids(orderStudioCases(pending, "closed", "pending", new Map(), new Date("2026-10-05T00:00:00Z"))), ids(orderStudioCases(pending, "closed", "pending", new Map(), now)))
const boundary = [row("midnight", { next_contact_at: "2026-12-31T15:00:00Z" }), row("old", { completed_at: "2020-01-01T00:00:00Z" })]
assert.equal(orderStudioCases(boundary, "closed", "pending", new Map(), new Date("2026-12-31T23:59:59+09:00"))[0].id, "old")
assert.equal(orderStudioCases(boundary, "closed", "pending", new Map(), new Date("2027-01-01T00:00:00+09:00"))[0].id, "midnight")

const change = (id: string, before: string, after: string, at: string): CasesOrderLog => ({ application_id: id,
  from_status: "completed", to_status: "completed", created_at: at, note: JSON.stringify({ event: "registration_result_saved", before: { status: before }, after: { status: after } }) })
const logs = [change("pending", "undecided", "pending", "2026-09-03T00:00:00Z"), change("pending", "pending", "pending", "2026-10-05T00:00:00Z")]
assert.equal(getCasesResultRecord(row("pending"), logs, []).at, "2026-09-03T00:00:00Z")
logs.push(change("pending", "not_enrolled", "pending", "2026-10-04T00:00:00Z"))
assert.equal(getCasesResultRecord(row("pending"), logs, []).at, "2026-10-04T00:00:00Z")
assert.equal(getCasesResultRecord(row("legacy"), [{ ...logs[0], application_id: "legacy", note: "체험 결과에서 등록 전환을 저장했습니다." }], []).at, null)
const results = [{ application_id: "enrolled", result: "enrolled", resolved_at: "2026-09-10T00:00:00Z", superseded_at: null }]
assert.equal(getCasesResultRecord(row("enrolled", { registration_status: "enrolled", enrolled_at: "2026-10-05T00:00:00Z" }), [], results).at, results[0].resolved_at)
const ended = [
  row("legacy", { registration_status: "not_enrolled", completed_at: "2026-07-01T00:00:00Z" }),
  row("lost", { registration_status: "not_enrolled", lost_at: "2026-10-05T00:00:00Z" }),
  row("enrolled", { registration_status: "enrolled" }),
  row("pending"), row("no-show", { status: "canceled", no_show_at: "2026-10-02T00:00:00Z" }),
  row("cancel", { status: "canceled", canceled_at: "2026-10-03T00:00:00Z" })
]
const clocks = new Map(ended.map(x => [x.id, getCasesResultRecord(x, logs, results)]))
assert.deepEqual(ids(orderStudioCases(ended, "closed", "all", clocks, now)), ["lost", "pending", "cancel", "no-show", "enrolled", "legacy"])
const contactEdited = ended.map(x => ({ ...x, updated_at: "2030-01-01T00:00:00Z", last_activity_at: "2030-01-01T00:00:00Z" }))
assert.deepEqual(ids(orderStudioCases(contactEdited, "closed", "all", clocks, now)), ids(orderStudioCases(ended, "closed", "all", clocks, now)))
assert.deepEqual(ids(orderStudioCases([row("b"), row("a")], "closed", "all", new Map(), now)), ["a", "b"])
assert.equal(getCasesResultRecord(row("cancel", { status: "canceled" }), [{ application_id: "cancel", from_status: "new", to_status: "canceled", note: null, created_at: "2026-10-01T00:00:00Z" }], []).at, "2026-10-01T00:00:00Z")
console.log("PASS QC2: tab mapping, waiting priority, schedule/receipt/id ties, block-first time, due/future/null contacts, KST midnight, immutable result clocks, explicit pending transitions, contact-edit invariance, legacy unknown clocks")
