import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { CASE_ACTIVE_FILTERS, CASE_CLOSED_FILTERS, resolveCaseFilter, resolveCaseView } from "@/features/studio/lib/case-filters"
import { CASES_ACTIONS, CASES_ACTION_SECTIONS, deriveCasesWorkflow, getCasesNextActions } from "@/features/studio/lib/cases-workflow"
import { casesWorkflowFixtures, CASES_NOW, createCasesFixtureItems } from "./fixtures/cases-workflow-v2"

assert.deepEqual(CASE_ACTIVE_FILTERS.map(x => x.label), ["전체", "일정 확정 대기", "체험 예정·진행"])
assert.deepEqual(CASE_CLOSED_FILTERS.map(x => x.label), ["전체", "고민중", "등록 완료", "미등록", "취소", "노쇼"])
assert.equal(resolveCaseFilter("active", "new"), "schedule_needed")
assert.equal(resolveCaseFilter("active", "reviewing"), "schedule_needed")
assert.equal(resolveCaseView("active", "post_trial"), "closed")
const base = casesWorkflowFixtures[0].input
for (const status of ["new", "reviewing"] as const) {
  const w = deriveCasesWorkflow({ ...base, status }, CASES_NOW)
  assert.equal(w.closed, false); assert.equal(w.filter, "schedule_needed"); assert.equal(w.action, "schedule")
}
for (const [start, end, label] of [
  ["2026-10-01T03:00:00Z", "2026-10-01T04:00:00Z", "체험 예정"],
  ["2026-09-30T02:30:00Z", "2026-09-30T03:30:00Z", "체험 진행 중"],
  ["2026-09-30T01:00:00Z", "2026-09-30T02:00:00Z", "완료 확인 필요"]
]) {
  const w = deriveCasesWorkflow({ ...base, status: "confirmed", confirmedBlockStartAt: start, confirmedBlockEndAt: end }, CASES_NOW)
  assert.equal(w.closed, false); assert.equal(w.filter, "confirmed"); assert.equal(w.progress, label); assert.equal(w.action, "trial")
}
for (const status of [null, "undecided", "pending", "enrolled", "not_enrolled"] as const) {
  for (const record of [false, true]) for (const sent of [false, true]) {
    const w = deriveCasesWorkflow({ ...base, status: "completed", registrationStatus: status, recordFinalized: record, reportSent: sent }, CASES_NOW)
    assert.equal(w.closed, true)
    assert.equal(w.filter, status === null || status === "undecided" ? "all" : status)
    assert.equal(w.action, !record ? "record" : !sent ? "report" : status === "pending" ? "consultation" : status === null || status === "undecided" ? "registration" : null)
  }
}
const items = createCasesFixtureItems()
assert.equal(items.filter(x => !x.workflow.closed).length, 2)
assert.equal(items.filter(x => x.workflow.closed).length, 10)
assert.deepEqual(getCasesNextActions(items.find(x => x.id === "fixture-F")!), ["consultation", "registration"])
assert.deepEqual(getCasesNextActions(items.find(x => x.id === "fixture-G")!), ["detail"])
assert.equal(CASES_ACTIONS.report.title, "리포트 확인") // No persisted report draft/editor in the existing contract.
const detail = readFileSync("src/features/studio/ui/application-trial-result-workflow.tsx", "utf8")
assert(detail.includes('id="trial-record"')); assert(detail.includes('id="consultation-records"')); assert(detail.includes('id="confirm-schedule"'))
assert(readFileSync("src/features/studio/ui/registration-result-editor.tsx", "utf8").includes('id="registration-result-title"'))
assert(readFileSync("src/features/studio/ui/application-report-publishing.tsx", "utf8").includes('id="report-publishing-title"'))
assert.equal(CASES_ACTION_SECTIONS.record, "trial-record")
assert.equal(CASES_ACTION_SECTIONS.registration, "registration-result-title")
const page = readFileSync("app/studio/(dashboard)/cases/page.tsx", "utf8")
assert(page.includes("일정 확정부터 체험 진행까지 관리하세요.")); assert(page.includes("체험 결과와 등록 여부를 관리하세요."))
assert(!page.includes("ActionForm")); assert(!page.includes("onClick")) // Row tasks only navigate; search is the sole submit.
console.log("PASS Cases classification: all 20 completion combinations, future/in-trial/overdue kept active, canonical tabs, legacy URL, pending tasks and existing section destinations")
