// 수업 관찰 항목의 저장 계약 검증.
//
//   npx tsx scripts/verify-trial-result-observations.ts
//
// 여기서 고정하는 것.
//   1.  canonical code 가 정확히 7개다.
//   2.  문구를 저장하던 시절의 값이 정확히 7개다.
//   3.  둘 사이에 임의의 semantic mapping 이 없다.
//   4.  알 수 없는 값은 거절한다.
//   5.  canonical 중복은 하나로 접힌다.
//   6.  기존 legacy 배열이 원문 그대로 보존된다.
//   7.  legacy row 가 Studio 화면에서 사라지지 않는다.
//   8.  updated_by 가 배선돼 있다.
//   9.  학부모 노출이 0 이다.
//   10. DB 허용 집합 = canonical 7 + legacy 7.
//
// 1–7 은 순수 함수로, 8–10 은 소스 검사로 본다. DB · 네트워크를 건드리지 않는다.
// 실데이터 점검은 배포 전 READ ONLY 조회로 따로 한다(아래 §11 참고).

import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  LEGACY_TRIAL_RESULT_OBSERVATION_LABELS,
  LEGACY_TRIAL_RESULT_OBSERVATION_LABEL_SET,
  TRIAL_RESULT_OBSERVATION_CODES,
  TRIAL_RESULT_OBSERVATION_OPTIONS,
  describeTrialResultObservation,
  getTrialResultObservationLabel,
  isLegacyTrialResultObservation,
  normalizeTrialResultObservation
} from "@/features/studio/lib/trial-result-options"

const CANONICAL = [
  "sustained_engagement",
  "active_participation",
  "verbal_explanation",
  "independent_after_instruction",
  "needs_some_guidance",
  "needs_repeated_guidance",
  "ready_for_more_challenge"
]

const LEGACY = [
  "집중을 잘했어요",
  "적극적으로 참여했어요",
  "발표를 잘했어요",
  "이해가 빨랐어요",
  "도움이 조금 필요했어요",
  "난이도가 높아 보였어요",
  "난이도가 쉬워 보였어요"
]

const MIGRATION_PATH = "supabase/migrations/20260913090000_harden_trial_result_observations.sql"
const ACTION_PATH = "src/features/studio/actions/upsert-trial-result.ts"
const ADAPTER_PATH = "src/shared/lib/db/supabase-adapter.ts"
const WORKFLOW_PATH = "src/features/studio/ui/application-trial-result-workflow.tsx"

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

let failures = 0

const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) {
    failures += 1
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

console.log("── 1. canonical code 7개 ──")
const codes = TRIAL_RESULT_OBSERVATION_OPTIONS.map((option) => option.value)
check("code 가 정확히 7개다", codes.length === 7, `actual ${codes.length}`)
check("code 집합이 기대와 같다", CANONICAL.every((code) => codes.includes(code as never)))
check("code 에 중복이 없다", new Set(codes).size === codes.length)
check("TRIAL_RESULT_OBSERVATION_CODES 가 같은 집합이다", TRIAL_RESULT_OBSERVATION_CODES.size === 7)
check(
  "모든 code 에 label 이 있고 서로 다르다",
  codes.every((code) => (getTrialResultObservationLabel(code) ?? "").length > 0) &&
    new Set(TRIAL_RESULT_OBSERVATION_OPTIONS.map((option) => option.label)).size === 7
)

console.log("\n── 2. legacy 문구 7개 ──")
check(
  "legacy 목록이 정확히 7개다",
  LEGACY_TRIAL_RESULT_OBSERVATION_LABELS.length === 7,
  `actual ${LEGACY_TRIAL_RESULT_OBSERVATION_LABELS.length}`
)
check(
  "legacy 집합이 기대와 같다",
  LEGACY.every((label) => LEGACY_TRIAL_RESULT_OBSERVATION_LABEL_SET.has(label)) &&
    LEGACY_TRIAL_RESULT_OBSERVATION_LABEL_SET.size === 7
)
for (const label of LEGACY) {
  check(`"${label}" 를 legacy 로 인식한다`, isLegacyTrialResultObservation(label))
}
check("canonical code 는 legacy 가 아니다", CANONICAL.every((code) => !isLegacyTrialResultObservation(code)))

console.log("\n── 3. legacy ↔ canonical 임의 매핑이 없다 ──")
// 이것이 R0.1 의 핵심이다. "난이도가 높아 보였어요" 는 관찰자의 인상이고
// needs_repeated_guidance 는 아이가 실제로 한 일이다. 같은 사실이 아니다.
for (const label of LEGACY) {
  check(`"${label}" 가 code 로 변환되지 않는다`, normalizeTrialResultObservation(label) === null)
  check(`"${label}" 가 새 문구로 바꿔 보이지 않는다`, getTrialResultObservationLabel(label) === null)
}
const optionsSource = readSource("src/features/studio/lib/trial-result-options.ts")
check(
  "options 에 legacy → code 매핑 객체가 없다",
  !/["'][^"']*했어요["']\s*:\s*["'][a-z_]+["']/.test(optionsSource)
)
const migrationSource = readSource(MIGRATION_PATH)
check(
  "migration 에 observations UPDATE 가 없다",
  !/update\s+public\.trial_results[\s\S]*?set\s+observations/i.test(migrationSource)
)
check("migration 에 문구 → code case 문이 없다", !/when\s+'[^']*했어요'\s+then/i.test(migrationSource))

console.log("\n── 4. 알 수 없는 값은 거절한다 ──")
for (const bad of [
  "made_up_code",
  "집중력이 높아요",
  "<script>alert(1)</script>",
  "SUSTAINED_ENGAGEMENT",
  "",
  "   ",
  null,
  undefined,
  42,
  {}
]) {
  check(`${JSON.stringify(bad)} → null`, normalizeTrialResultObservation(bad) === null)
  check(`${JSON.stringify(bad)} 는 화면 표시 대상이 아니다`, describeTrialResultObservation(bad) === null)
}
const actionSource = readSource(ACTION_PATH)
check(
  "action 이 legacy payload 를 별도로 거절한다",
  actionSource.includes('status: isLegacyTrialResultObservation(value) ? "legacy" : "unknown"') &&
    actionSource.includes('submitted.status === "legacy"')
)

console.log("\n── 5. canonical 은 그대로 통과하고 중복은 접힌다 ──")
for (const code of CANONICAL) {
  check(`${code} 유지`, normalizeTrialResultObservation(code) === code)
}
check(
  "앞뒤 공백은 무시한다",
  normalizeTrialResultObservation("  sustained_engagement  ") === "sustained_engagement"
)
const deduped = Array.from(
  new Set(
    ["sustained_engagement", "sustained_engagement", "  sustained_engagement  ", "needs_some_guidance"]
      .map((value) => normalizeTrialResultObservation(value))
      .filter((value): value is NonNullable<typeof value> => value !== null)
  )
)
check("중복 canonical 은 하나로 접힌다", deduped.length === 2, `actual ${deduped.length}`)
check(
  "action 과 adapter 둘 다 dedup 한다",
  actionSource.includes("Array.from(new Set(normalized))") &&
    readSource(ADAPTER_PATH).includes("Array.from(new Set(input.observations")
)

console.log("\n── 6. 기존 legacy 배열이 원문 그대로 보존된다 ──")
const storedLegacyRow = ["난이도가 높아 보였어요", "이해가 빨랐어요"]
const describedRow = storedLegacyRow.map((value) => describeTrialResultObservation(value))
check(
  "저장된 legacy 값이 원문 문자열 그대로 나온다",
  describedRow.every((item, index) => item?.text === storedLegacyRow[index])
)
check("legacy 로 분류된다", describedRow.every((item) => item?.kind === "legacy"))
check(
  "관찰을 건드리지 않은 저장은 기존 배열을 다시 쓴다",
  actionSource.includes('formData.get("observationsTouched") === "true"') &&
    actionSource.includes("observationsTouched ? submitted.values : preservedObservations")
)

console.log("\n── 7. legacy row 가 Studio 에서 사라지지 않는다 ──")
const workflowSource = readSource(WORKFLOW_PATH)
check("화면이 legacy 와 canonical 을 갈라 읽는다", workflowSource.includes("splitStoredObservations"))
check(
  "legacy 원문 표시 영역이 있다",
  workflowSource.includes("기존 관찰 기록") && workflowSource.includes("storedObservations.legacy")
)
check(
  "legacy 값을 canonical 토글에 체크하지 않는다",
  workflowSource.includes("splitStoredObservations(values).canonical")
)
check(
  "편집 폼이 touched 플래그를 보낸다",
  workflowSource.includes('name="observationsTouched"')
)

console.log("\n── 8. updated_by ──")
check(
  "migration 이 updated_by 를 추가한다",
  /add column if not exists updated_by uuid/i.test(migrationSource)
)
check("기존 row 를 채우지 않는다(backfill 없음)", !/set\s+updated_by/i.test(migrationSource))
check("adapter 가 저장할 때 actor 를 넣는다", readSource(ADAPTER_PATH).includes("updated_by: input.actorId"))

console.log("\n── 9. 학부모 노출 0 ──")
// observations 는 Studio 전용이다. 학부모 화면·public projection 어디에도
// 나가지 않는다. Report 는 아직 없다.
const PARENT_SURFACES = [
  "app/classes",
  "app/my",
  "app/academies",
  "app/favorites",
  "app/record",
  "src/features/my",
  "src/features/classes",
  "src/features/favorites",
  "src/features/academies"
]
// 경로가 사라지면 검사도 조용히 사라진다. 존재부터 확인한다.
const missingSurfaces = PARENT_SURFACES.filter((dir) => !existsSync(resolve(process.cwd(), dir)))
check("검사 대상 학부모 경로가 모두 존재한다", missingSurfaces.length === 0, missingSurfaces.join(", "))

const parentHits = PARENT_SURFACES.filter((dir) => existsSync(resolve(process.cwd(), dir))).flatMap(
  (dir) =>
    execSync(`grep -rln observations '${dir}' || true`, { encoding: "utf8" }).split("\n").filter(Boolean)
)
check("학부모 경로에 observations 참조가 없다", parentHits.length === 0, parentHits.join(", "))

console.log("\n── 10. DB 허용 집합 = canonical 7 + legacy 7 ──")
const allowedBlock = migrationSource.slice(
  migrationSource.indexOf("observations <@ array["),
  migrationSource.indexOf("]::text[]")
)
const allowedValues = Array.from(allowedBlock.matchAll(/'([^']+)'/g)).map((match) => match[1])
check("CHECK 허용 값이 14개다", allowedValues.length === 14, `actual ${allowedValues.length}`)
check("canonical 7개가 모두 들어 있다", CANONICAL.every((code) => allowedValues.includes(code)))
check("legacy 7개가 모두 들어 있다", LEGACY.every((label) => allowedValues.includes(label)))
check(
  "그 밖의 값이 없다",
  allowedValues.every((value) => CANONICAL.includes(value) || LEGACY.includes(value))
)
check("transitional 임이 명시돼 있다", migrationSource.includes("transitional"))
check("cardinality 상한이 7 이다", /cardinality\(observations\)\s*<=\s*7/.test(migrationSource))

console.log("\n── 11. 배포 전 READ ONLY 실데이터 점검(수동) ──")
console.log(`        migration 적용 전후로 아래를 실행해 같은 결과가 나오는지 확인한다.

        select id, observations from public.trial_results
        where cardinality(observations) > 0
        order by id;

        기대: migration 은 데이터를 쓰지 않으므로 배열이 글자 그대로 동일하다.
        Production 기준 legacy 8 rows 의 문자열이 하나도 바뀌지 않아야 한다.`)

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
