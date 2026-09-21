import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { applicationChildLabel, applicationSchedule } from "@/features/applications/lib/parent-application-card"
import { selectInProgressApplications, selectCanceledApplications } from "@/features/applications/lib/parent-application-split"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
const app = (id: string, status: ParentApplicationSummary["status"], createdAt: string) => ({id, status, createdAt}) as ParentApplicationSummary
const rows = [app("new", "new", "2026-09-21"), app("review", "reviewing", "2026-09-20"), app("past", "confirmed", "2026-09-19"), app("done", "completed", "2026-09-22"), app("cancel", "canceled", "2026-09-18")]
assert.deepEqual(selectInProgressApplications(rows).map(x=>x.id), ["new","review","past"])
assert.deepEqual(selectCanceledApplications(rows).map(x=>x.id), ["cancel"])
assert.equal(applicationSchedule({confirmedSlotAt:"2026-09-21T15:00:00Z",requestedSlotAt:"2026-09-01T01:00:00Z"})?.label,"확정 일정")
assert.ok(applicationSchedule({confirmedSlotAt:null,requestedSlotAt:"2026-09-21T15:00:00Z"})?.text.includes("22"))
assert.equal(applicationSchedule({confirmedSlotAt:null,requestedSlotAt:"invalid"}),null)
assert.equal(applicationChildLabel({childName:"아이",childGrade:"unknown-code"}),"아이 · 학년 확인 필요")
const ui=readFileSync("app/my/applications/applications-list.tsx","utf8")
for(const token of ['role="tab"','aria-selected','ArrowLeft','router.refresh()', 'href="/classes"','`/record/${item.id}`','onError','ImageFallback']) assert.ok(ui.includes(token),token)
assert.ok(!ui.includes("cancelMyApplicationAction"))
assert.ok(readFileSync("app/my/applications/error.tsx","utf8").includes("ApplicationsFailure reload"))
console.log("PASS Applications V1: status split, order, Seoul date, confirmed precedence, grade fallback, retry, tabs, image fallback, detail-only cancellation")
