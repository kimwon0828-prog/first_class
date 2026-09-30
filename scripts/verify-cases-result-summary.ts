import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { getCasesResultSummary } from "../src/features/studio/lib/cases-workflow"
import { createCasesSummaryFixtures } from "./fixtures/cases-workflow-v2"
import { registrationReasons } from "../src/features/registration/lib/registration-input"
const items = createCasesSummaryFixtures()
for (const [index, count] of [[0,1],[1,2],[2,2],[3,0],[4,1]]) assert.equal(getCasesResultSummary(items[index]).reasons.length,count)
assert.equal(getCasesResultSummary(items[2]).remaining,2)
assert.equal(getCasesResultSummary(items[3]).label,"사유 미입력")
assert.deepEqual(items.slice(5).map(item => getCasesResultSummary(item).label),["등록 완료","취소","노쇼"])
assert.deepEqual(getCasesResultSummary({...items[0],registrationReasonIds:["schedule_mismatch","schedule_mismatch","unknown"]}).reasons,[{id:"schedule_mismatch",label:registrationReasons("not_enrolled")[0][1]}])
assert.equal(getCasesResultSummary({...items[0],registrationReasonIds:["unknown"]}).label,"사유 미입력")
assert.equal(getCasesResultSummary({...items[0],registrationStatus:"pending",registrationReasonIds:["price_consideration"]}).reasons[0].label,registrationReasons("pending")[1][1])
const query=readFileSync("src/features/studio/queries/get-studio-cases.ts","utf8")
assert(query.includes("registration_reason_ids"))
assert(!query.includes("registration_note"))
assert(!readFileSync("app/studio/(dashboard)/cases/page.tsx","utf8").match(/registrationNote|registration_note/))
console.log("PASS result summary: canonical taxonomy, 1/2/4 reasons, empty, private note omitted, enrolled/cancel/no-show, legacy IDs and pending")
