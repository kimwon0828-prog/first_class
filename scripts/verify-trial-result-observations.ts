// 수업 관찰 항목의 저장 계약 검증.
//
//   npx tsx scripts/verify-trial-result-observations.ts
//
// 여기서 고정하는 것.
//   1. canonical code 가 정확히 7개다.
//   2. 문구를 저장하던 시절의 값 7개가 모두 code 로 매핑된다.
//   3. 알 수 없는 값은 null 이다 — 조용히 통과하지 않는다.
//   4. code 와 label 이 1:1 이고 문구가 판단형이 아니다.
//
// 순수 함수만 쓴다. DB · 네트워크를 건드리지 않는다.
// 실데이터 점검(§9)은 배포 전 READ ONLY 조회로 따로 한다.

import {
  LEGACY_TRIAL_RESULT_OBSERVATION_LABELS,
  TRIAL_RESULT_OBSERVATION_CODES,
  TRIAL_RESULT_OBSERVATION_OPTIONS,
  getTrialResultObservationLabel,
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

console.log("\n── 2. legacy 문구 매핑 ──")
const legacyEntries = Object.entries(LEGACY_TRIAL_RESULT_OBSERVATION_LABELS)
check("legacy 매핑이 7개다", legacyEntries.length === 7, `actual ${legacyEntries.length}`)
for (const [legacy, code] of legacyEntries) {
  check(`"${legacy}" → ${code}`, normalizeTrialResultObservation(legacy) === code)
}
check(
  "legacy 매핑 결과가 code 집합 안에 있다",
  legacyEntries.every(([, code]) => TRIAL_RESULT_OBSERVATION_CODES.has(code))
)
check(
  "매핑이 1:1 이다(두 문구가 같은 code 로 가지 않는다)",
  new Set(legacyEntries.map(([, code]) => code)).size === 7
)

console.log("\n── 3. code 는 그대로 통과한다 ──")
for (const code of CANONICAL) {
  check(`${code} 유지`, normalizeTrialResultObservation(code) === code)
}
check("앞뒤 공백은 무시한다", normalizeTrialResultObservation("  sustained_engagement  ") === "sustained_engagement")

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
}

console.log("\n── 5. label 계약 ──")
check(
  "모든 code 에 label 이 있다",
  codes.every((code) => (getTrialResultObservationLabel(code) ?? "").length > 0)
)
check(
  "label 이 중복되지 않는다",
  new Set(TRIAL_RESULT_OBSERVATION_OPTIONS.map((option) => option.label)).size === 7
)
check("알 수 없는 값의 label 은 null 이다", getTrialResultObservationLabel("made_up") === null)
check(
  "legacy 문구를 넣어도 새 label 이 나온다",
  getTrialResultObservationLabel("집중을 잘했어요") ===
    TRIAL_RESULT_OBSERVATION_OPTIONS.find((option) => option.value === "sustained_engagement")?.label
)

console.log("\n── 6. 판단형 문구가 남아 있지 않다 ──")
// Observation over Judgment. 성향·능력 진단으로 읽히는 표현을 막는다.
const JUDGMENT_MARKERS = ["잘했", "뛰어", "우수", "빨랐", "부족", "높아요", "좋아요", "능력", "성향"]
for (const option of TRIAL_RESULT_OBSERVATION_OPTIONS) {
  const hit = JUDGMENT_MARKERS.find((marker) => option.label.includes(marker))
  check(`${option.value} label 이 관찰형이다`, !hit, hit ? `"${hit}" 포함: ${option.label}` : "")
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
