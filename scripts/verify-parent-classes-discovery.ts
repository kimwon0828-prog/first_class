// Run: npx tsx scripts/verify-parent-classes-discovery.ts — no DB writes or network.
import assert from "node:assert/strict"
import { buildClassesHref } from "@/features/classes/lib/classes-href"
import { selectEligibleDiscoveryClasses, formatDiscoveryPrice } from "@/features/classes/lib/class-discovery-results"
import { resolveSelectedChildId } from "@/features/children/lib/child-selection"
import { isChildEligibleForClass } from "@/shared/constants/grade-options"

let count = 0
const check = (label: string, verify: () => void) => { verify(); count++; console.log(`PASS ${label}`) }
const classes = [
  ...Array.from({ length: 12 }, (_, i) => ({ id: `middle-${i}`, targetAge: "중1~중3" })),
  { id: "elementary", targetAge: "초1~초3" },
  { id: "unknown", targetAge: "" },
  { id: "legacy-age", targetAge: "8~10세" }
]
check("eligibility is applied before any preview cap", () => assert.deepEqual(selectEligibleDiscoveryClasses(classes, { grade: "초2" }).map(x => x.id), ["elementary"]))
check("unselected preserves general discovery and order", () => assert.deepEqual(selectEligibleDiscoveryClasses(classes, null), classes))
check("input collection is not mutated", () => { const original = JSON.stringify(classes); selectEligibleDiscoveryClasses(classes, { grade: "초2" }); assert.equal(JSON.stringify(classes), original) })
check("invalid child grade fails closed", () => assert.equal(selectEligibleDiscoveryClasses(classes, { grade: "알 수 없음" }).length, 0))
check("all supported combinations match application eligibility", () => {
  for (const grade of ["초1", "초6", "중1", "중3", "고1", "7세", "", "unknown"])
    assert.deepEqual(selectEligibleDiscoveryClasses(classes, { grade }), classes.filter(c => isChildEligibleForClass(grade, c.targetAge)))
})
check("foreign child ID never personalizes", () => assert.equal(resolveSelectedChildId("foreign", [{ id: "owned" }]), null))
check("owned child ID remains selected", () => assert.equal(resolveSelectedChildId("owned", [{ id: "owned" }]), "owned"))
const context = { q: "학원 & 지점", subjectCategory: "music", subject: "piano", sido: "서울", sigungu: "노원구", radius: "3", child: "child&1" }
check("category change clears only subsubject", () => {
  const params = new URL(buildClassesHref({ ...context, subjectCategory: "math", subject: null }), "http://local").searchParams
  assert.equal(params.get("subjectCategory"), "math"); assert.equal(params.get("subject"), null)
  for (const key of ["q", "sido", "sigungu", "radius", "child"] as const) assert.equal(params.get(key), context[key])
})
check("reset subject keeps region, search and child", () => {
  const params = new URL(buildClassesHref({ ...context, subjectCategory: null, subject: null }), "http://local").searchParams
  assert.equal(params.get("subjectCategory"), null); assert.equal(params.get("child"), context.child); assert.equal(params.get("q"), context.q)
})
check("clear search filters keeps discovery context", () => {
  const params = new URL(buildClassesHref({ ...context, q: null, subjectCategory: null, subject: null }), "http://local").searchParams
  assert.equal(params.get("q"), null); assert.equal(params.get("sido"), context.sido); assert.equal(params.get("child"), context.child)
})
check("missing prices are not free", () => { for (const price of [null, undefined, NaN, Infinity, -1]) assert.equal(formatDiscoveryPrice(price), "가격 정보 확인 필요") })
check("zero is free; real amount is formatted", () => { assert.equal(formatDiscoveryPrice(0), "무료"); assert.equal(formatDiscoveryPrice(10000), "10,000원") })
console.log(`ALL PASS (${count})`)
