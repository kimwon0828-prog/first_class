import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { formatRegularPrice, formatRegularPriceInput, parseRegularPrice } from "../src/shared/lib/regular-price"
import { formatDiscoveryPrice } from "../src/features/classes/lib/class-discovery-results"

const fixtures = [
  ["trial_class", 10000, "monthly", 180000, "주 2회 기준", "체험수업 10,000원", "월 180,000원"],
  ["trial_class", 0, "per_session", 35000, "40분 수업", "무료 체험수업", "회당 35,000원"],
  ["level_test", 10000, "monthly", 250000, "", "레벨테스트 10,000원", "월 250,000원"],
  ["level_test", 0, "consultation", null, "레벨에 따라 상담 후 안내", "무료 레벨테스트", "상담 후 안내"],
  ["trial_class", 10000, null, null, null, "체험수업 10,000원", null]
] as const
for (const [programType, trialPrice, type, amount, note, trialLabel, regularLabel] of fixtures) {
  assert.equal(formatDiscoveryPrice({ programType, trialPrice }), trialLabel)
  const result = parseRegularPrice({ type, amount, note })
  assert.ok(result.ok)
  assert.equal(formatRegularPrice(result.value), regularLabel)
}
for (const amount of [0, 1000, 10000, 2147483647]) {
  const result = parseRegularPrice({ type: "monthly", amount, note: "" })
  assert.ok(result.ok)
  assert.equal(result.value.amount, amount)
}
for (const amount of ["", null, undefined, -1, "1.5", "1e3", NaN, Infinity, "180,000", 2147483648])
  assert.equal(parseRegularPrice({ type: "monthly", amount, note: "" }).ok, false, String(amount))
assert.equal(parseRegularPrice({ type: "yearly", amount: 100, note: "" }).ok, false)
assert.equal(parseRegularPrice({ type: "monthly", amount: 1, note: "가".repeat(121) }).ok, false)
assert.equal(parseRegularPrice({ type: "monthly", amount: 1, note: "가".repeat(120) }).ok, true)
assert.deepEqual(parseRegularPrice({ type: "consultation", amount: 180000, note: " 안내 " }),
  { ok: true, value: { type: "consultation", amount: null, note: "안내" } })
assert.deepEqual(parseRegularPrice({ type: "", amount: 180000, note: "주 2회" }),
  { ok: true, value: { type: null, amount: null, note: null } })
assert.equal(formatRegularPrice({ type: "monthly", amount: null }), null)
assert.equal(formatRegularPriceInput("180000"), "180,000")
// Whitelist extension must not alter any schedule/ownership behavior of the existing RPC.
const oldSql = readFileSync("supabase/migrations/20260924160000_studio_rolling_schedule_v1.sql", "utf8")
const migration = readFileSync("supabase/migrations/20260927120000_add_regular_tuition_display.sql", "utf8")
const oldFunction = oldSql.slice(oldSql.indexOf("create function public.save_studio_class_operating_rule("), oldSql.indexOf("\nrevoke all on function public.save_studio_class_operating_rule"))
assert.equal(migration.slice(migration.indexOf("create or replace function")).trim(), oldFunction
  .replace("create function", "create or replace function")
  .replace("'target_age','description','trial_price',", "'target_age','description','trial_price','regular_price_type','regular_price_amount','regular_price_note',").trim())
for (const file of ["src/features/classes/ui/class-card.tsx", "src/features/classes/ui/home-class-card.tsx", "app/favorites/favorites-client.tsx", "src/features/studio/ui/studio-classes-manager.tsx", "src/features/applications/ui/class-detail-application-sheet.tsx"])
  assert.doesNotMatch(readFileSync(file, "utf8"), /regularPrice|regular_price|formatRegularPrice/)
console.log("PASS regular tuition: 7 fixtures, integer/null validation, labels, removal, unchanged Rolling RPC body and list/application boundaries")
