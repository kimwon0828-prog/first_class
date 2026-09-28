// No network/DB: execute the real creation action against in-memory dependencies.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"
import { mockDataAdapter } from "@/shared/lib/db/mock-adapter"
import { isChildEligibleForClass } from "@/shared/constants/grade-options"
import type { TrialApplicationInput, ChildProfile } from "@/shared/lib/db/adapter"
import { createWorkflowApplication } from "./fixtures/application-detail-workflow"

const read = (p: string) => readFileSync(p, "utf8")
const actionPath = "src/features/applications/actions/create-trial-application.ts"
const actionSource = read(actionPath)
let ownedChildren: ChildProfile[] = []
let submitted: TrialApplicationInput | null = null
let childReads = 0
let classSubject = "piano"
const dependencies: Record<string, unknown> = {
  "@/shared/constants/grade-options": { isChildEligibleForClass },
  "@/features/notifications/sms/send-studio-notification": { sendStudioNotificationSafely: async () => {} },
  "@/features/auth/lib/profile-sync": { getMyProfile: async () => ({ id: "parent", role: "parent", name: "테스트 보호자", phone: "01000000000" }) },
  "@/features/auth/lib/session": { requireSession: async () => ({ user: { id: "parent" } }) },
  "@/integrations/supabase/server": { getSupabaseServerClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) },
  "@/shared/lib/cross-product-navigation-server": { resolveStudioCrossProductHref: async (p: string) => p },
  "@/shared/lib/db": { dataAdapter: {
    getClassById: async () => ({ title: "수업", targetAge: "초1~초6", subject: classSubject }),
    listMyChildren: async (parentId: string) => { assert.equal(parentId, "parent"); childReads++; return ownedChildren },
    listAvailableScheduleSlotsByClassId: async () => [],
    createTrialApplication: async (input: TrialApplicationInput) => { submitted = structuredClone(input); return { id: "new-app", ...input } }
  } }
}
const exports: Record<string, (...args: unknown[]) => Promise<{ status: string }>> = {}
const compiled = ts.transpileModule(actionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
vm.runInNewContext(compiled, { exports, require: (key: string) => { assert.ok(key in dependencies, `Unexpected dependency ${key}`); return dependencies[key] }, FormData }, { filename: actionPath })
const child = (interestSubjects: string | null): ChildProfile => ({ id: "child", parentId: "parent", name: "테스트 학생", grade: "초2", schoolName: "테스트 학교", notes: "학생 메모", currentLevel: "중급", interestSubjects, goalNote: "목표", createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" })
const form = (childId = "child") => {
  const data = new FormData()
  for (const [key, value] of Object.entries({ childId, childName: "테스트 학생", childGrade: "초2", childNotes: "신청 메모", currentLevel: "신청 수준", goalNote: "신청 목표", selectedScheduleOptionId: "schedule_block:test", privacyAgreed: "yes", thirdPartyAgreed: "yes", guardianAgreed: "yes", interestSubjects: "조작된 hidden 값" })) data.set(key, value)
  return data
}
const run = async () => {
  for (const [interest, subject] of [["수학", "piano"], ["영어", "math"], [null, "piano"], ["  ", "piano"], ["수학, 과학 · 사고력", "piano"]] as const) {
    ownedChildren = [child(interest)]; classSubject = subject; submitted = null; childReads = 0
    const result = await exports.createTrialApplicationAction("class", undefined, form())
    assert.equal(result.status, "success")
    assert.ok(submitted)
    const snapshot = submitted as TrialApplicationInput
    assert.equal(snapshot.interestSubjects, interest?.trim() || null)
    assert.equal(childReads, 1, "reuse owned-child read")
    assert.equal(snapshot.currentLevel, "신청 수준")
    assert.equal(snapshot.childNotes, "신청 메모")
    assert.equal(snapshot.goalNote, "신청 목표")
    ownedChildren[0].interestSubjects = "프로필 변경 이후"
    assert.equal(snapshot.interestSubjects, interest?.trim() || null)
  }
  ownedChildren = []; submitted = null
  assert.equal((await exports.createTrialApplicationAction("class", undefined, form())).status, "error")
  assert.equal(submitted, null, "unowned child cannot create an application")
  assert.equal((await exports.createTrialApplicationAction("class", undefined, form(""))).status, "success")
  assert.equal((submitted as unknown as TrialApplicationInput).interestSubjects, null, "manual application cannot use forged input")

  // Real mock adapter round trip and profile changes after submission.
  const profile = await mockDataAdapter.createChildProfile({ parentId: "parent", name: "테스트 아이", grade: "초2", schoolName: null, notes: null, currentLevel: null, interestSubjects: "수학", goalNote: null })
  const slot = (await mockDataAdapter.listAvailableScheduleSlotsByClassId("class-1")).find(s => !s.isClosed)
  assert.ok(slot)
  const application = await mockDataAdapter.createTrialApplication({ ...(submitted as unknown as TrialApplicationInput), classId: "class-1", childId: profile.id, interestSubjects: profile.interestSubjects, selectedScheduleOptionId: slot.optionId })
  await mockDataAdapter.updateChildProfile({ ...profile, childId: profile.id, interestSubjects: "영어" })
  const detail = await mockDataAdapter.getStudioApplicationDetail(application.id, "org-1")
  assert.equal(detail?.interestSubjects, "수학")
  assert.equal(detail.currentLevel, "신청 수준")
  assert.equal(detail.childNotes, "신청 메모")
  assert.equal(detail.goalNote, "신청 목표")
  assert.equal(createWorkflowApplication().interestSubjects, null, "legacy fixture has no snapshot")

  const page = read("app/studio/(dashboard)/applications/[id]/page.tsx")
  assert.ok(page.includes('{ label: "관심 과목", value: detailView.interestSubjects }'))
  assert.ok(!page.includes('{ label: "관심 과목", value: detailView.classSubject }'))
  assert.ok(page.includes('const interestSubjects = normalizeText(data.interestSubjects)'))
  assert.ok(page.includes('.filter(item => item.value)'), "null snapshot row stays hidden")
  const adapter = read("src/shared/lib/db/supabase-adapter.ts")
  assert.ok(adapter.includes('interest_subjects: input.interestSubjects ?? null'))
  assert.ok(adapter.includes('interestSubjects: (data as TrialApplicationRow).interest_subjects ?? null'))
  const migration = read("supabase/migrations/20260928120000_add_application_interest_subjects_snapshot.sql").replace(/^\s*--.*$/gm, "")
  assert.ok(migration.includes('add column interest_subjects text'))
  assert.ok(!/\b(update|delete|drop|grant|revoke|default)\b/i.test(migration))
  console.log("PASS A–E: owned-child action snapshot, profile change isolation, null/no fallback, string preservation, old fields; forged/unowned input; mock DTO round trip; additive migration contract")
}
run().catch(error => { console.error(error); process.exitCode = 1 })
