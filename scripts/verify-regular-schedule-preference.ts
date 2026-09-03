// 정규수업 희망 일정 domain contract 검증.
//
//   npx tsx scripts/verify-regular-schedule-preference.ts
//
// CONSULT-2 에서 확정한 fixture(valid A~H, invalid 13종)를 그대로 담는다.
// 계약을 바꾸려면 이 파일이 먼저 바뀌어야 한다.

import {
  MAX_REGULAR_SCHEDULE_PREFERENCE_GROUPS,
  formatRegularSchedulePreference,
  isoToPostgresDow,
  parseRegularSchedulePreference,
  postgresDowToIso,
  validateRegularSchedulePreference,
  type RegularSchedulePreferenceErrorCode
} from "@/features/studio/lib/regular-schedule-preference"

let failures = 0

const check = (condition: unknown, message: string) => {
  if (condition) {
    return
  }

  failures += 1
  console.error(`  FAIL  ${message}`)
}

const group = (dayMode: string, days: number[], timeMode: string, startTime: string | null, endTime: string | null) => ({
  dayMode,
  days,
  timeMode,
  startTime,
  endTime
})

// ─────────────────────────────────────────────────────────────
console.log("\n[1] Valid fixtures A~H")

const validFixtures: Array<{ id: string; label: string; input: unknown; formatted: string }> = [
  {
    id: "A",
    label: "화/목 17:00 이후",
    input: { version: 1, state: "specified", groups: [group("selected", [2, 4], "after", "17:00", null)] },
    formatted: "화·목 · 17:00 이후"
  },
  {
    id: "B",
    label: "토 10:00~13:00",
    input: { version: 1, state: "specified", groups: [group("selected", [6], "range", "10:00", "13:00")] },
    formatted: "토 · 10:00~13:00"
  },
  {
    id: "C",
    label: "월/수/금 16:00~19:00",
    input: { version: 1, state: "specified", groups: [group("selected", [1, 3, 5], "range", "16:00", "19:00")] },
    formatted: "월·수·금 · 16:00~19:00"
  },
  {
    id: "D",
    label: "화/목 17시 이후 + 토 10~13",
    input: {
      version: 1,
      state: "specified",
      groups: [
        group("selected", [2, 4], "after", "17:00", null),
        group("selected", [6], "range", "10:00", "13:00")
      ]
    },
    formatted: "화·목 · 17:00 이후 또는 토 · 10:00~13:00"
  },
  {
    id: "E",
    label: "요일 무관 + 17시 이후",
    input: { version: 1, state: "specified", groups: [group("any", [], "after", "17:00", null)] },
    formatted: "요일 무관 · 17:00 이후"
  },
  {
    id: "F",
    label: "화/목 + 시간 무관",
    input: { version: 1, state: "specified", groups: [group("selected", [2, 4], "any", null, null)] },
    formatted: "화·목 · 시간 무관"
  },
  {
    id: "G",
    label: "요일/시간 모두 무관",
    input: { version: 1, state: "specified", groups: [group("any", [], "any", null, null)] },
    formatted: "요일·시간 무관"
  },
  {
    id: "H",
    label: "일정 미정",
    input: { version: 1, state: "undecided", groups: [] },
    formatted: "아직 일정 미정"
  }
]

for (const fixture of validFixtures) {
  const result = validateRegularSchedulePreference(fixture.input)
  check(result.ok, `${fixture.id} (${fixture.label}) 가 거부되었다`)

  if (!result.ok) {
    continue
  }

  // lossless: 통과한 값을 다시 넣어도 같은 값이어야 한다.
  const reparsed = validateRegularSchedulePreference(result.value)
  check(
    reparsed.ok && JSON.stringify(reparsed.value) === JSON.stringify(result.value),
    `${fixture.id} round-trip 불일치`
  )

  const formatted = formatRegularSchedulePreference(result.value)
  check(
    formatted === fixture.formatted,
    `${fixture.id} formatter 불일치: 기대 "${fixture.formatted}" / 실제 "${formatted}"`
  )

  console.log(`  PASS  ${fixture.id}  ${formatted}`)
}

// G 와 H 는 의미가 다르다. 구조로 구분되는지 확인한다.
const flexible = validateRegularSchedulePreference(validFixtures[6].input)
const undecided = validateRegularSchedulePreference(validFixtures[7].input)
check(
  flexible.ok && undecided.ok && flexible.value.state !== undecided.value.state,
  "G(모두 무관)와 H(일정 미정)가 같은 state 로 저장된다"
)

// ─────────────────────────────────────────────────────────────
console.log("\n[2] Invalid fixtures")

const invalidFixtures: Array<{ label: string; input: unknown; code: RegularSchedulePreferenceErrorCode }> = [
  {
    label: "range 18:00~17:00",
    input: { version: 1, state: "specified", groups: [group("selected", [2], "range", "18:00", "17:00")] },
    code: "time_range_reversed"
  },
  {
    label: "selected + days []",
    input: { version: 1, state: "specified", groups: [group("selected", [], "after", "17:00", null)] },
    code: "selected_days_required"
  },
  {
    label: "any + days [2]",
    input: { version: 1, state: "specified", groups: [group("any", [2], "after", "17:00", null)] },
    code: "any_days_must_be_empty"
  },
  {
    label: "after + startTime null",
    input: { version: 1, state: "specified", groups: [group("selected", [2], "after", null, null)] },
    code: "after_requires_start_time"
  },
  {
    label: "duplicate group",
    input: {
      version: 1,
      state: "specified",
      groups: [
        group("selected", [2, 4], "after", "17:00", null),
        group("selected", [2, 4], "after", "17:00", null)
      ]
    },
    code: "duplicate_preference_group"
  },
  {
    label: "duplicate group (요일 순서만 다름)",
    input: {
      version: 1,
      state: "specified",
      groups: [
        group("selected", [2, 4], "after", "17:00", null),
        group("selected", [4, 2], "after", "17:00", null)
      ]
    },
    code: "duplicate_preference_group"
  },
  {
    label: "specified + groups []",
    input: { version: 1, state: "specified", groups: [] },
    code: "state_groups_mismatch"
  },
  {
    label: "undecided + groups non-empty",
    input: { version: 1, state: "undecided", groups: [group("selected", [2], "any", null, null)] },
    code: "state_groups_mismatch"
  },
  {
    label: "days [2,2,4]",
    input: { version: 1, state: "specified", groups: [group("selected", [2, 2, 4], "any", null, null)] },
    code: "duplicate_weekday"
  },
  {
    label: "days [0] (PostgreSQL DOW 오용)",
    input: { version: 1, state: "specified", groups: [group("selected", [0], "any", null, null)] },
    code: "invalid_weekday"
  },
  {
    label: "days [8]",
    input: { version: 1, state: "specified", groups: [group("selected", [8], "any", null, null)] },
    code: "invalid_weekday"
  },
  {
    label: "any time + startTime",
    input: { version: 1, state: "specified", groups: [group("selected", [2], "any", "17:00", null)] },
    code: "any_time_must_be_null"
  },
  {
    label: "groups 4개",
    input: {
      version: 1,
      state: "specified",
      groups: [
        group("selected", [1], "any", null, null),
        group("selected", [2], "any", null, null),
        group("selected", [3], "any", null, null),
        group("selected", [4], "any", null, null)
      ]
    },
    code: "too_many_groups"
  },
  {
    label: "version 2",
    input: { version: 2, state: "specified", groups: [] },
    code: "unsupported_version"
  },
  {
    label: "시간 형식 '5시'",
    input: { version: 1, state: "specified", groups: [group("selected", [2], "after", "5시", null)] },
    code: "invalid_time_format"
  },
  {
    label: "시간 형식 '25:00'",
    input: { version: 1, state: "specified", groups: [group("selected", [2], "after", "25:00", null)] },
    code: "invalid_time_format"
  },
  {
    label: "unknown key",
    input: { version: 1, state: "undecided", groups: [], note: "메모는 별도 컬럼이다" },
    code: "unknown_key"
  },
  {
    label: "not an object",
    input: "specified",
    code: "not_an_object"
  }
]

for (const fixture of invalidFixtures) {
  const result = validateRegularSchedulePreference(fixture.input)
  if (result.ok) {
    check(false, `"${fixture.label}" 가 통과되었다 (거부되어야 함)`)
    continue
  }

  check(
    result.code === fixture.code,
    `"${fixture.label}" 에러 코드 불일치: 기대 ${fixture.code} / 실제 ${result.code}`
  )
  console.log(`  PASS  ${fixture.label}  →  ${result.code}`)
}

// ─────────────────────────────────────────────────────────────
console.log("\n[3] Normalizer")

const unsorted = validateRegularSchedulePreference({
  version: 1,
  state: "specified",
  groups: [group("selected", [4, 2, 6], "after", "17:00", null)]
})
check(
  unsorted.ok && JSON.stringify(unsorted.value.groups[0]?.days) === "[2,4,6]",
  "canonical sorting 실패: [4,2,6] → [2,4,6] 이 아니다"
)
console.log("  PASS  [4,2,6] → [2,4,6]")

check(MAX_REGULAR_SCHEDULE_PREFERENCE_GROUPS === 3, "group 상한이 3 이 아니다")
console.log(`  PASS  MAX_GROUPS = ${MAX_REGULAR_SCHEDULE_PREFERENCE_GROUPS}`)

// ─────────────────────────────────────────────────────────────
console.log("\n[4] Parser fail-safe")

check(parseRegularSchedulePreference(null).status === "empty", "null 이 empty 가 아니다")
console.log("  PASS  null → empty")

const future = parseRegularSchedulePreference({ version: 2, state: "specified", groups: [] })
check(future.status === "unreadable_version", "version 2 가 unreadable_version 이 아니다")
check(
  future.status === "unreadable_version" && future.version === 2,
  "unreadable_version 이 원본 version 을 보존하지 않는다"
)
console.log("  PASS  version 2 → unreadable_version (원본 보존, throw 없음)")

for (const broken of [{}, { version: 1 }, { version: 1, state: "specified" }, { version: 1, state: "nope", groups: [] }]) {
  const parsed = parseRegularSchedulePreference(broken)
  check(parsed.status === "corrupt", `${JSON.stringify(broken)} 가 corrupt 로 분류되지 않았다`)
}
console.log("  PASS  깨진 shape 4종 → corrupt")

const valid = parseRegularSchedulePreference(validFixtures[0].input)
check(valid.status === "valid", "정상 값이 valid 가 아니다")
console.log("  PASS  정상 값 → valid")

// ─────────────────────────────────────────────────────────────
console.log("\n[5] Weekday conversion")

// ISO 1=월…7=일  ↔  PostgreSQL 0=일…6=토
const expected: Array<[number, number]> = [
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 5],
  [6, 6],
  [7, 0]
]

for (const [iso, dow] of expected) {
  check(isoToPostgresDow(iso) === dow, `isoToPostgresDow(${iso}) !== ${dow}`)
  check(postgresDowToIso(dow) === iso, `postgresDowToIso(${dow}) !== ${iso}`)
}
console.log("  PASS  ISO 1~7 ↔ PostgreSQL 0~6 왕복 7종")

for (const invalid of [0, 8, -1, 1.5, Number.NaN]) {
  check(isoToPostgresDow(invalid) === null, `isoToPostgresDow(${invalid}) 가 null 이 아니다`)
}
for (const invalid of [7, -1, 2.5, Number.NaN]) {
  check(postgresDowToIso(invalid) === null, `postgresDowToIso(${invalid}) 가 null 이 아니다`)
}
console.log("  PASS  범위 밖 입력 → null")

// ─────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\nFAIL: ${failures}건 실패`)
  process.exit(1)
}

console.log("\nPASS: 정규수업 희망 일정 domain contract 검증 완료")
