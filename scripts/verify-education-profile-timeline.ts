import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildEducationProfile, type EducationProfileSourceReport } from "@/features/profile/lib/education-profile"
import { groupEducationExperiences, educationExperienceDateLabel } from "@/features/profile/lib/education-profile-timeline"
const source = (id: string, date: string, labels: string[], version = 1): EducationProfileSourceReport => ({
  experienceId: id, reportId: `${id}-${version}`, reportVersion: version, experienceDate: date,
  content: { experience: { type: "trial_class", date, child: { displayName: "아이", grade: "초3" }, academy: { name: "학원" }, class: { title: "수업" } },
    observations: labels.map(label => ({ code: "active_participation", label })), recommendation: { course: null, level: null, schedule: null } }
})
const build = (reports: EducationProfileSourceReport[]) => buildEducationProfile({ childId: "child", childName: "아이", reports })
const profile = build([
  source("older", "2026-08-15T06:00:00Z", ["과거 관찰 원문"]),
  source("latest", "2026-08-31T15:00:00Z", ["현재 관찰 원문", "여러 줄\n긴 관찰 원문"]),
  source("empty", "2026-08-18T06:00:00Z", []),
  source("older", "2026-08-15T06:00:00Z", ["과거 원문 최신 발행본"], 2)
])
assert.equal(profile.publishedExperienceCount, 3)
assert.deepEqual(profile.experiences.map(item => item.experienceId), ["latest", "empty", "older"])
assert.deepEqual(profile.experiences[0].observations.map(item => item.label), ["현재 관찰 원문", "여러 줄\n긴 관찰 원문"])
assert.equal(profile.experiences[2].observations[0].label, "과거 원문 최신 발행본")
assert.equal(profile.experiences[2].reportVersion, 2)
assert.equal(profile.experiences[1].observations.length, 0)
assert.equal(build([]).experiences.length, 0)
const groups = groupEducationExperiences(profile.experiences)
assert.deepEqual(groups.map(group => group.label), ["2026년 9월", "2026년 8월"])
assert.equal(educationExperienceDateLabel("2026-08-31T15:00:00Z"), "9월 1일 (화)")
assert.equal(educationExperienceDateLabel("invalid"), null)
assert.equal(groupEducationExperiences(build([source("undated", "invalid", [])]).experiences)[0].key, "undated")
const read = (file: string) => readFileSync(file, "utf8")
const page = read("app/record/profile/page.tsx")
assert(page.includes('groups.length === 0') && page.includes('source.observations.length'))
assert(page.includes('이 리포트에는 남겨진 관찰이 없어요.'))
assert(page.includes('withRecordChild(`/record/${source.experienceId}/report`, childId)'))
assert(!page.includes("describeEvidenceCount") && !page.includes("ParentBottomNav") && !page.includes("ChildSelector"))
assert(page.includes('result.state === "not_found"') && page.includes("notFound()"))
assert(read("app/record/profile/profile-frame.tsx").includes('withRecordChild("/record", childId ?? null)'))
assert(read("app/record/profile/profile-retry.tsx").includes("router.refresh()"))
assert(read("app/record/profile/error.tsx").includes("window.location.reload()"))
assert(page.includes("Suspense") && page.includes("EducationProfileSkeleton"))
console.log("PASS education timeline: unique experience/latest version, historical full text, Seoul month boundary, no-observation vs no-report, context, owned not-found, actual retry, loading, no ranking/selection/nav")

const imageSource = { ...source("image", "2026-09-18", ["원문"]), thumbnailUrl: "https://example.com/class.png" }
assert.equal(build([imageSource]).experiences[0].thumbnailUrl, imageSource.thumbnailUrl)
assert.equal(build([source("missing", "2026-09-18", [])]).experiences[0].thumbnailUrl, null)
const imageQuery = readFileSync("src/features/classes/queries/public-class-safe-projection.ts", "utf8").split("export const getPublicClassImagesByIds")[1]
assert.ok(imageQuery.includes('.select("id, cover_image_url")'))
assert.ok(imageQuery.includes('.in("id", ids).eq("is_active", true)'))
assert.ok(!imageQuery.includes("academy"))
console.log("PASS public image mapping, missing image, narrow active-class batch")
