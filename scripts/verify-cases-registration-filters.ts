import assert from "node:assert/strict"
import { getCaseFilterPredicate } from "../src/features/studio/lib/case-filters"
import { deriveCasesWorkflow } from "../src/features/studio/lib/cases-workflow"
import { casesRegistrationFilterFixtures, CASES_NOW } from "./fixtures/cases-workflow-v2"
// Evaluate the actual flat registration predicate against A–I, independently of workflow membership.
function matches(filter: "enrolled" | "not_enrolled", input: typeof casesRegistrationFilterFixtures[number]["input"]) {
  const values: Record<string, string | null> = { registration_status: input.registrationStatus, status: input.status, canceled_at: input.canceledAt, no_show_at: input.noShowAt }
  return getCaseFilterPredicate("closed", filter).orExpression.slice(4, -1).split(",").every(clause => {
    const [key, operator, value] = clause.split(".")
    assert(key in values, `Unexpected work prerequisite: ${key}`)
    if (operator === "is") return values[key] === null
    if (operator === "eq") return values[key] === value
    assert.equal(operator, "neq"); return values[key] !== value
  })
}
assert.deepEqual(casesRegistrationFilterFixtures.filter(f => matches("not_enrolled", f.input)).map(f => f.name), ["A","B","C","D"])
assert.deepEqual(casesRegistrationFilterFixtures.filter(f => matches("enrolled", f.input)).map(f => f.name), ["E"])
for (const name of ["B","C","D","E"]) {
  const fixture = casesRegistrationFilterFixtures.find(f => f.name === name)!
  const workflow = deriveCasesWorkflow(fixture.input, CASES_NOW)
  assert.equal(workflow.closed, true); assert.equal(workflow.filter, fixture.input.registrationStatus)
  assert(matches(name === "E" ? "enrolled" : "not_enrolled", fixture.input))
}
assert.equal(deriveCasesWorkflow(casesRegistrationFilterFixtures[1].input, CASES_NOW).action, "report")
assert.equal(deriveCasesWorkflow(casesRegistrationFilterFixtures[2].input, CASES_NOW).action, "record")
console.log("PASS registration filter A–I: result axis independent of remaining work, trial-completed membership without work prerequisites, cancel/no-show excluded")
