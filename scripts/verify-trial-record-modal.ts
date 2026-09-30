import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { formatTrialRecommendedSchedule, TRIAL_RECOMMENDED_PERIODS } from "@/features/studio/lib/trial-recommended-schedule"
import { buildExperienceReportSnapshotV2, decodeExperienceReportSnapshot } from "@/features/reports/lib/experience-report-snapshot"
import { mockDataAdapter } from "@/shared/lib/db/mock-adapter"
import { createWorkflowApplication, createWorkflowRecord } from "./fixtures/application-detail-workflow"

async function main() {
  assert.equal(formatTrialRecommendedSchedule([], ""), "")
  assert.equal(formatTrialRecommendedSchedule([2], ""), "화")
  assert.equal(formatTrialRecommendedSchedule([], "evening"), "저녁")
  assert.equal(formatTrialRecommendedSchedule([4, 2, 4], "evening"), "화·목 / 저녁")
  const app = createWorkflowApplication()
  for (const period of TRIAL_RECOMMENDED_PERIODS) {
    const recommendedSchedule = formatTrialRecommendedSchedule([2, 4], period.value)
    assert.equal(recommendedSchedule, `화·목 / ${period.label}`)
    const built = buildExperienceReportSnapshotV2({
      programType: app.classProgramType ?? "trial_class", confirmedSlotAt: app.confirmedSlotAt, completedAt: app.completedAt,
      childName: app.childName, childGrade: app.childGrade, academyName: app.academyName ?? "TEST 학원", classTitle: app.classTitle ?? "TEST 수업",
      ...createWorkflowRecord({ recommendedSchedule, note: "PRIVATE_SENTINEL" })
    })
    assert.equal(built.status, "ok")
    if (built.status !== "ok") throw new Error("snapshot failed")
    assert.equal(built.snapshot.recommendation.schedule, recommendedSchedule)
    assert.equal(decodeExperienceReportSnapshot(2, built.snapshot)?.recommendation.schedule, recommendedSchedule)
    assert(!JSON.stringify(built.snapshot).includes("PRIVATE_SENTINEL"))
  }
  console.log("PASS single/multiple days, four periods, optional blanks, deterministic text; Parent snapshot round-trip without private note")

  // In-memory adapter only: no DB, network, environment switching, or Production writes.
  const input = {
    applicationId: `record-modal-mock-${crypto.randomUUID()}`, actorId: "test-teacher",
    observations: ["active_participation"], parentReaction: null, recommendedCourse: "기초반",
    recommendedLevel: "입문", recommendedSchedule: "화·목 / 저녁", publicSummary: "학부모 총평",
    note: "PRIVATE_SENTINEL", nextAction: null
  }
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => mockDataAdapter.upsertStudioTrialResult(input)))
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1)
  assert(results.filter(result => result.status === "rejected").every(result => result.status === "rejected" && result.reason.message === "trial_result_already_finalized"))
  await assert.rejects(mockDataAdapter.upsertStudioTrialResult({ ...input, recommendedSchedule: "변경 시도" }), /trial_result_already_finalized/)
  const source = readFileSync("src/features/studio/actions/upsert-trial-result.ts", "utf8")
  const db = readFileSync("supabase/migrations/20260930110000_studio_experience_workflow_phase1_expand.sql", "utf8")
  assert(source.includes("if (current.trialResult) return"))
  assert(source.includes('recommendedSchedule: normalizeOptionalText(formData.get("recommendedSchedule"))'))
  assert(db.includes("for update"))
  assert(db.includes("raise exception 'trial_result_already_finalized'"))
  assert(db.includes("p_content->>'recommendedSchedule'"))
  console.log("PASS mock one-time finalization, 10 concurrent calls -> 1 success; unchanged action/RPC string and locking guards (not a live DB test)")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
