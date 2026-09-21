import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { decodeExperienceReportSnapshot, getExperienceReportSummary } from "@/features/reports/lib/experience-report-snapshot"
import { withRecordChild } from "@/features/record/lib/record-href"

const snapshot = {
  experience: { type: "trial_class", date: "2026-09-18T06:00:00Z", child: { displayName: "fixture", grade: "초3" }, academy: { name: "fixture" }, class: { title: "fixture" } },
  observations: [{ code: "sustained_engagement", label: "발행 당시 문장\n그대로 유지" }],
  recommendation: { course: null, level: null, schedule: "화·목 오후 시간 제안\n학원과 별도 확인" }
}
const v1 = decodeExperienceReportSnapshot(1, snapshot)
assert(v1)
assert.equal(getExperienceReportSummary(v1), null)
assert.equal(v1.observations[0].label, snapshot.observations[0].label)
assert.equal(v1.recommendation.schedule, snapshot.recommendation.schedule)
const v2 = decodeExperienceReportSnapshot(2, { ...snapshot, summary: "총평 원문\n두 번째 문단" })
assert(v2)
assert.equal(getExperienceReportSummary(v2), "총평 원문\n두 번째 문단")
assert.equal(decodeExperienceReportSnapshot(2, { ...snapshot, note: "private" }), null)
assert.equal(decodeExperienceReportSnapshot(99, snapshot), null)
assert.equal(withRecordChild("/record/owned", "child + /"), "/record/owned?child=child+%2B+%2F")
const page = readFileSync("app/record/[experienceId]/report/page.tsx", "utf8")
const query = readFileSync("src/features/record/queries/get-my-experience-report.ts", "utf8")
assert(query.indexOf("if (detail.error)") < query.indexOf("if (!experience)"))
assert(query.indexOf("if (!experience)") < query.indexOf("getPublishedExperienceReport(experienceId)"))
assert(page.includes("snapshot.observations.map("))
assert(!page.includes(".slice("))
assert(page.includes("snapshot.recommendation.schedule ? <section"))
assert(page.includes("recommendations.length > 0"))
assert(page.includes("summary ? <section"))
assert(page.includes("<RecordDetailRetry"))
assert(page.includes('const isError = result.status === "error"'))
assert(page.includes('const backHref = withRecordChild(`/record/${experienceId}`, selectedChildId)'))
assert(!page.includes("BottomNav"))
console.log("PASS: snapshot V1/V2, original text, private-field rejection, child context, ownership/error separation, conditional sections and retry")
