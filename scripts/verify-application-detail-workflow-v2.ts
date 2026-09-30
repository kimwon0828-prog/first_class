// Pure fixture verification. No DB, credentials, or network.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { deriveApplicationDetailWorkflow, hasTrialRecordContent, type ApplicationWorkflowEvidence } from "@/features/studio/lib/application-detail-workflow-state"
import { createWorkflowApplication, createWorkflowEvidence, createWorkflowRecord, WORKFLOW_NOW } from "./fixtures/application-detail-workflow"
import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"

let count = 0
function run(name: string, overrides: Partial<StudioApplicationDetail>, configure: (e: ApplicationWorkflowEvidence) => void,
  expected: string | null, permissions = { canWriteTrialResults: true, canWriteConsultations: true }) {
  const application = createWorkflowApplication(overrides), evidence = createWorkflowEvidence()
  configure(evidence)
  const before = JSON.stringify({ application, evidence })
  const result = deriveApplicationDetailWorkflow({ application, evidence, nowIso: WORKFLOW_NOW, ...permissions })
  assert.equal(result.primary?.action ?? null, expected, name)
  assert.deepEqual(result.steps.map(s => s.id), ["trial", "record", "report", "registration"])
  assert.equal(JSON.stringify({ application, evidence }), before, "pure helper must not mutate input")
  assert.ok(result.steps.filter(s => s.state === "current").length <= 1)
  if (result.closed) assert.equal(result.primary, null)
  console.log(`PASS ${++count}. ${name}`)
  return result
}
const noop = () => {}
const record = { trialResult: createWorkflowRecord() }
const published = (e: ApplicationWorkflowEvidence) => { e.report.version = 1; e.report.publishedAt = "2026-09-26T10:00:00.000Z" }
run("confirmed before start", { status: "confirmed", completedAt: null, confirmedBlockStartAt: "2026-09-28T08:00:00.000Z" }, noop, null)
run("completed missing record", {}, noop, "record")
run("written unpublished", record, e => { e.report.canPublish = true }, "report")
run("published awaiting Parent", record, published, "registration")
run("Parent considering", record, e => { published(e); e.parentDecision.value = "considering" }, "registration")
for (const value of ["planned", "declined"] as const) run(`Parent ${value}`, record, e => { published(e); e.parentDecision.value = value }, "registration")
for (const value of ["enrolled", "not_enrolled"] as const) {
  const result = run(value, { ...record, registrationStatus: value }, e => { e.registration.result = value }, null)
  assert.equal(result.closed, true)
  run(`terminal ${value} missing record`, { registrationStatus: value }, e => { e.registration.result = value }, null)
}
run("no-show", { status: "canceled", noShowAt: WORKFLOW_NOW }, noop, null)
run("cancel", { status: "canceled" }, noop, null)
run("Parent unlinked can record result", { ...record, parentId: null }, noop, "registration")
run("Free can record result without report/Parent response", record, noop, "registration")
for (const key of ["report", "parentDecision", "registration"] as const) {
  const result = run(`${key} load failure`, record, e => { e[key].error = "fixture load error" }, key === "parentDecision" ? "registration" : null)
  if (key !== "parentDecision") assert.ok(result.steps.some(s => s.state === "error"))
}
run("trial result load failure is not missing", {}, e => { e.trialResultError = "fixture load error" }, null)
run("registration unknown prevents false record CTA", {}, e => { e.registration.error = "fixture load error" }, null)
run("new", { status: "new", completedAt: null }, noop, "status")
run("reviewing", { status: "reviewing", completedAt: null }, noop, "status")
run("unassigned reviewing", { status: "reviewing", assignedTeacherId: null }, noop, "status")
run("in-trial unassigned may complete", { status: "confirmed", assignedTeacherId: null, completedAt: null }, noop, "status")
run("contact today KST before scheduled hour", { ...record, nextContactAt: "2026-09-27T14:00:00.000Z" }, e => { e.report.canPublish = true }, "report")
run("contact previous KST date", { ...record, nextContactAt: "2026-09-26T14:59:00.000Z" }, noop, "registration")
run("future contact waiting", { ...record, nextContactAt: "2026-09-27T15:00:00.000Z" }, published, "registration")
run("missing record precedes due contact", { nextContactAt: "2026-09-26T10:00:00.000Z" }, noop, "record")
run("new version after record change", record, e => { published(e); e.report.changed = true; e.report.canPublish = true }, "registration")
run("no record permission", {}, noop, null, { canWriteTrialResults: false, canWriteConsultations: false })
assert.equal(hasTrialRecordContent(createWorkflowRecord({ observations: [], recommendedCourse: null, recommendedLevel: null, recommendedSchedule: null, note: null, publicSummary: "공개 총평만 작성" })), true)
assert.equal(hasTrialRecordContent(createWorkflowRecord({ observations: [], recommendedCourse: null, recommendedLevel: null, recommendedSchedule: null, note: null, publicSummary: " " })), false)
const workflow = readFileSync("src/features/studio/ui/application-trial-result-workflow.tsx", "utf8")
const report = readFileSync("src/features/studio/ui/application-report-publishing.tsx", "utf8")
assert.ok(workflow.includes("<ConsultationLogDialog"))
assert.ok(readFileSync("src/features/studio/ui/consultation-log-dialog.tsx", "utf8").includes("createConsultationLogAction.bind(null, application.id)"))
assert.ok(workflow.includes("<RegistrationResultEditor"))
assert.ok(workflow.includes('aria-label="시스템 이력"'))
assert.ok(!report.includes("open={!assessmentChangedSincePublish}"))
assert.ok(!report.includes("open={!publishedSnapshot"))
console.log(`PASS ${count} workflow fixtures + record content, existing transaction and opt-in preview contracts`)

const adapter = readFileSync("src/shared/lib/db/supabase-adapter.ts", "utf8")
const detailQuery = readFileSync("src/features/studio/queries/get-studio-application-detail.ts", "utf8")
const route = readFileSync("app/studio/(dashboard)/applications/[id]/page.tsx", "utf8")
assert.ok(adapter.includes("if (trialResultError && !options?.allowPartialTrialResult)"))
assert.ok(adapter.includes('throw new Error("failed_to_fetch_trial_result")'))
assert.ok(detailQuery.includes("organizationId, options"))
assert.ok(route.includes("{ allowPartialTrialResult: true }"))
assert.ok(route.includes("trialResultError: data.trialResultLoadError"))
for (const file of ["update-application-status", "update-application-assignee", "create-consultation-log", "update-consultation-log", "reopen-registration-consultation", "publish-experience-report"]) {
  assert.ok(!readFileSync(`src/features/studio/actions/${file}.ts`, "utf8").includes("allowPartialTrialResult"), `${file} keeps strict reads`)
}
console.log("PASS presentation-only partial read; mutation callers retain strict reads")

// Final layout: progress exists once; detail and actions have a single home.
assert.equal((workflow.match(/aria-label="신청 진행 단계"/g) ?? []).length, 1)
assert.ok(!workflow.includes('aria-label="지금 할 일"'))
assert.ok(!workflow.includes('aria-expanded={shownStep'))
assert.equal((workflow.match(/\{parentDecisionSection\}/g) ?? []).length, 1)
assert.equal((workflow.match(/\{registrationSection\}/g) ?? []).length, 1)
assert.equal((workflow.match(/<RegistrationResultEditor/g) ?? []).length, 1)
assert.ok(workflow.indexOf('aria-labelledby="record-report-title"') < workflow.indexOf('aria-label="신청 참고 패널"'))
assert.ok(workflow.indexOf('aria-label="신청 참고 패널"') < workflow.indexOf('aria-label="최근 활동"'))
assert.ok(report.includes('publishedSnapshot.observations.slice(0, 3)'))
assert.ok(report.includes('getExperienceReportSummary(publishedSnapshot)'))
assert.ok(!report.includes('application.trialResult?.note'))
console.log("PASS final layout: single progress, independent detail panels, mobile DOM order, actual published snapshot preview")
