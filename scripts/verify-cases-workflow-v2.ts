import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { deriveCasesWorkflow } from "@/features/studio/lib/cases-workflow"
import { CASE_ACTIVE_FILTERS, getCaseFilterPredicate, resolveCaseFilter, resolveCasePage, sanitizeCaseSearchQuery } from "@/features/studio/lib/case-filters"
import { casesWorkflowFixtures, CASES_NOW } from "./fixtures/cases-workflow-v2"
for (const {name,input,expected} of casesWorkflowFixtures) {
  const w=deriveCasesWorkflow(input,CASES_NOW)
  assert.deepEqual([w.progress,w.action,w.registration,w.closed],expected,name)
  for (const nextContactAt of [null,"2020-01-01T00:00:00Z","2030-01-01T00:00:00Z"]) for(const hasAnyConsultationHistory of [false,true])
    assert.deepEqual(deriveCasesWorkflow({...input,...{nextContactAt,hasAnyConsultationHistory,assignedTeacherId:null}},CASES_NOW),w)
}
const base=casesWorkflowFixtures[0].input
assert.equal(deriveCasesWorkflow({...base,status:"reviewing"},CASES_NOW).filter,"schedule_needed")
assert.equal(deriveCasesWorkflow({...base,status:"confirmed",confirmedSlotAt:null},CASES_NOW).filter,"schedule_needed")
assert.equal(deriveCasesWorkflow({...base,status:"confirmed",confirmedSlotAt:"2026-09-01T00:00:00Z"},CASES_NOW).progress,"일정 확정")
assert.equal(deriveCasesWorkflow({...base,status:"confirmed",confirmedSlotAt:"2026-09-01T00:00:00Z",confirmedBlockStartAt:"2026-10-01T00:00:00Z"},CASES_NOW).progress,"체험 예정")
assert.equal(deriveCasesWorkflow({...base,status:"completed",recordFinalized:false,registrationStatus:"enrolled"},CASES_NOW).action,"record")
assert.deepEqual(CASE_ACTIVE_FILTERS.map(f=>f.key),["all","new","schedule_needed","confirmed","post_trial"])
assert.equal(resolveCaseFilter("active","reviewing"),"schedule_needed")
assert.equal(resolveCaseFilter("active","confirmed"),"confirmed")
assert.equal(resolveCaseFilter("closed","post_trial"),"all")
assert.equal(resolveCasePage("-1"),1);assert.equal(resolveCasePage("9999"),400)
assert.equal(sanitizeCaseSearchQuery(" a,(b)*% "),"a b")
assert.match(getCaseFilterPredicate("active","post_trial").orExpression,/record.is.null,report.is.null/)
const page=readFileSync('app/studio/(dashboard)/cases/page.tsx','utf8'),query=readFileSync('src/features/studio/queries/get-studio-cases.ts','utf8')
assert(!/getCaseContactPresentation|getCaseNextAction|nextContactAt|현재 단계/.test(page))
assert(!/next_contact_at|hasAnyConsultationHistory|getConsultationPipelineGroup/.test(query))
assert(query.indexOf('.or(getCaseFilterPredicate')<query.indexOf('await query.range'))
assert.match(query,/count: "exact"/);assert.match(query,/\.eq\("classes.organization_id", organizationId\)/)
assert(!/\.from\(/.test(query.slice(query.indexOf('result.items = rows.map'))))
assert.match(page,/<span>진행 상태<\/span>/);assert.match(page,/<span>등록 상태<\/span>/)
console.log('PASS A–L; consultation/contact/assignee invariance; real completion and block-first timing; legacy URL/search/page; relational filtering before exact count/range; no row query')
