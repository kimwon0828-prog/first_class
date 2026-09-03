// 정규수업 희망 일정(체험 이후 등록 상담에서 확인한 등록 가능 일정)의 domain contract.
//
// ⚠️ 비슷해 보이는 세 값이 있다. 절대 섞지 않는다.
//
//   A. trial_applications.preferred_regular_schedule  (text, legacy)
//      체험 "신청 당시" 학부모가 자유 텍스트로 적은 선호 시간대. 참고 자료다.
//      예: '화/목 5시 이후' — 오전/오후조차 확정할 수 없다.
//   B. trial_applications.regular_schedule_preference (jsonb, 이 파일)
//      체험 "이후 등록 상담"에서 원장이 다시 확인한 등록 가능 일정.
//   C. trial_results.recommended_schedule             (text)
//      학원이 "추천"한 일정. 학부모 수요가 아니라 공급 쪽 값이다.
//
// 이 파일은 B 하나만 다룬다. A 를 B 로 변환하지 않는다(추정이 되기 때문이다).
//
// 이 모듈은 순수 함수만 갖는다. DB 를 읽지 않고, 화면을 모른다.

import { isValidTimeValue, timeToMinutes } from "@/features/studio/lib/class-schedule-rule-utils"

/**
 * ISO weekday. 1=월 … 7=일.
 *
 * ⚠️ class_schedules.day_of_week 는 PostgreSQL DOW(0=일 … 6=토)라 체계가 다르다.
 * 변환은 이 파일의 isoToPostgresDow / postgresDowToIso 만 사용한다.
 */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** KST civil time "HH:mm". 특정 날짜가 없는 반복 조건이라 timestamp 를 쓰지 않는다. */
export type CivilTime = string

export type RegularSchedulePreferenceDayRule =
  | { dayMode: "selected"; days: IsoWeekday[] }
  | { dayMode: "any"; days: [] }

export type RegularSchedulePreferenceTimeRule =
  | { timeMode: "range"; startTime: CivilTime; endTime: CivilTime }
  | { timeMode: "after"; startTime: CivilTime; endTime: null }
  | { timeMode: "before"; startTime: null; endTime: CivilTime }
  | { timeMode: "any"; startTime: null; endTime: null }

export type RegularSchedulePreferenceGroup = RegularSchedulePreferenceDayRule &
  RegularSchedulePreferenceTimeRule

export type RegularSchedulePreference =
  | {
      version: 1
      state: "specified"
      groups: [RegularSchedulePreferenceGroup, ...RegularSchedulePreferenceGroup[]]
    }
  | { version: 1; state: "undecided"; groups: [] }

/**
 * 컬럼 값.
 *
 * null      상담에서 아직 기록하지 않음
 * undecided 상담했으나 학부모가 아직 결정하지 못함
 * specified 실제 가능 조건을 확인함
 *
 * 이 셋은 서로 다른 사실이다. 특히 undecided 는 "요일·시간 모두 무관"과 다르다.
 */
export type RegularSchedulePreferenceColumn = RegularSchedulePreference | null

export const MAX_REGULAR_SCHEDULE_PREFERENCE_GROUPS = 3

export const REGULAR_SCHEDULE_PREFERENCE_VERSION = 1

const DAY_MODES = ["selected", "any"] as const
const TIME_MODES = ["range", "after", "before", "any"] as const
const STATES = ["specified", "undecided"] as const

const GROUP_KEYS = ["dayMode", "days", "timeMode", "startTime", "endTime"] as const
const ROOT_KEYS = ["version", "state", "groups"] as const

/** 1=월 … 7=일. index 0 은 쓰지 않는다. */
const ISO_WEEKDAY_LABELS = ["", "월", "화", "수", "목", "금", "토", "일"] as const

// ─────────────────────────────────────────────────────────────
// weekday conversion — 이 두 함수 외에 0-6 / 1-7 변환을 만들지 않는다.
// ─────────────────────────────────────────────────────────────

/** ISO(1=월…7=일) → PostgreSQL DOW(0=일…6=토). 범위 밖이면 null. */
export const isoToPostgresDow = (day: number): number | null => {
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    return null
  }

  // 7(일) → 0. 1~6 은 그대로다.
  return day % 7
}

/** PostgreSQL DOW(0=일…6=토) → ISO(1=월…7=일). 범위 밖이면 null. */
export const postgresDowToIso = (dow: number): IsoWeekday | null => {
  if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
    return null
  }

  return (dow === 0 ? 7 : dow) as IsoWeekday
}

// ─────────────────────────────────────────────────────────────
// validator
// ─────────────────────────────────────────────────────────────

export type RegularSchedulePreferenceErrorCode =
  | "not_an_object"
  | "unknown_key"
  | "unsupported_version"
  | "invalid_state"
  | "groups_not_an_array"
  | "state_groups_mismatch"
  | "too_many_groups"
  | "invalid_day_mode"
  | "days_not_an_array"
  | "selected_days_required"
  | "any_days_must_be_empty"
  | "invalid_weekday"
  | "duplicate_weekday"
  | "invalid_time_mode"
  | "invalid_time_format"
  | "range_requires_start_and_end"
  | "time_range_reversed"
  | "after_requires_start_time"
  | "after_end_time_must_be_null"
  | "before_requires_end_time"
  | "before_start_time_must_be_null"
  | "any_time_must_be_null"
  | "duplicate_preference_group"

export type RegularSchedulePreferenceFailure = {
  ok: false
  code: RegularSchedulePreferenceErrorCode
  /** group 단위 오류면 그 index. 최상위 오류면 null. */
  groupIndex: number | null
}

export type RegularSchedulePreferenceValidation =
  | { ok: true; value: RegularSchedulePreference }
  | RegularSchedulePreferenceFailure

const fail = (
  code: RegularSchedulePreferenceErrorCode,
  groupIndex: number | null = null
): RegularSchedulePreferenceFailure => ({ ok: false, code, groupIndex })

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).every((key) => allowed.includes(key))

type GroupValidation =
  | { ok: true; value: RegularSchedulePreferenceGroup }
  | RegularSchedulePreferenceFailure

/**
 * 하나의 group 을 검증하고 canonical 형태로 되돌린다.
 *
 * days 는 여기서 오름차순 정렬된다. 중복 group 판정은 반드시 이 정규화 "이후" 해야
 * [2,4] 와 [4,2] 가 같은 조건으로 잡힌다.
 */
const validateGroup = (raw: unknown, index: number): GroupValidation => {
  if (!isPlainObject(raw)) {
    return fail("not_an_object", index)
  }

  if (!hasOnlyKeys(raw, GROUP_KEYS)) {
    return fail("unknown_key", index)
  }

  // ── 요일
  const dayMode = raw.dayMode
  if (typeof dayMode !== "string" || !DAY_MODES.includes(dayMode as (typeof DAY_MODES)[number])) {
    return fail("invalid_day_mode", index)
  }

  if (!Array.isArray(raw.days)) {
    return fail("days_not_an_array", index)
  }

  const rawDays = raw.days
  for (const day of rawDays) {
    if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 7) {
      // class_schedules 의 0(일요일)을 그대로 넘긴 경우도 여기서 걸린다.
      return fail("invalid_weekday", index)
    }
  }

  if (new Set(rawDays).size !== rawDays.length) {
    return fail("duplicate_weekday", index)
  }

  if (dayMode === "selected" && rawDays.length === 0) {
    return fail("selected_days_required", index)
  }

  if (dayMode === "any" && rawDays.length !== 0) {
    return fail("any_days_must_be_empty", index)
  }

  // canonical sorting. [4,2] → [2,4]
  const days = [...(rawDays as IsoWeekday[])].sort((left, right) => left - right)

  const dayRule: RegularSchedulePreferenceDayRule =
    dayMode === "any" ? { dayMode: "any", days: [] } : { dayMode: "selected", days }

  // ── 시간
  const timeMode = raw.timeMode
  if (
    typeof timeMode !== "string" ||
    !TIME_MODES.includes(timeMode as (typeof TIME_MODES)[number])
  ) {
    return fail("invalid_time_mode", index)
  }

  const startTime: unknown = raw.startTime ?? null
  const endTime: unknown = raw.endTime ?? null

  const checkTime = (value: unknown): value is CivilTime =>
    typeof value === "string" && isValidTimeValue(value)

  let timeRule: RegularSchedulePreferenceTimeRule

  if (timeMode === "range") {
    if (startTime === null || endTime === null) {
      return fail("range_requires_start_and_end", index)
    }
    if (!checkTime(startTime) || !checkTime(endTime)) {
      return fail("invalid_time_format", index)
    }
    // 자정 넘김(22:00 → 02:00)은 v1 미지원이라 단순 비교로 충분하다.
    if ((timeToMinutes(startTime) ?? 0) >= (timeToMinutes(endTime) ?? 0)) {
      return fail("time_range_reversed", index)
    }
    timeRule = { timeMode: "range", startTime, endTime }
  } else if (timeMode === "after") {
    if (startTime === null) {
      return fail("after_requires_start_time", index)
    }
    if (endTime !== null) {
      return fail("after_end_time_must_be_null", index)
    }
    if (!checkTime(startTime)) {
      return fail("invalid_time_format", index)
    }
    timeRule = { timeMode: "after", startTime, endTime: null }
  } else if (timeMode === "before") {
    if (endTime === null) {
      return fail("before_requires_end_time", index)
    }
    if (startTime !== null) {
      return fail("before_start_time_must_be_null", index)
    }
    if (!checkTime(endTime)) {
      return fail("invalid_time_format", index)
    }
    timeRule = { timeMode: "before", startTime: null, endTime }
  } else {
    if (startTime !== null || endTime !== null) {
      return fail("any_time_must_be_null", index)
    }
    timeRule = { timeMode: "any", startTime: null, endTime: null }
  }

  return { ok: true, value: { ...dayRule, ...timeRule } as RegularSchedulePreferenceGroup }
}

/** 정규화된 group 의 동등 비교 키. days 가 정렬된 뒤에만 의미가 있다. */
const groupIdentity = (group: RegularSchedulePreferenceGroup) =>
  [
    group.dayMode,
    group.days.join(","),
    group.timeMode,
    group.startTime ?? "",
    group.endTime ?? ""
  ].join("|")

/**
 * 임의의 값을 검증하고 canonical RegularSchedulePreference 로 되돌린다.
 *
 * 통과한 값은 요일이 정렬되어 있고, 중복 group 이 없으며, 모든 invariant 를 만족한다.
 * 실패해도 throw 하지 않는다 — 화면 하나가 Case 상세 전체를 죽이면 안 된다.
 */
export const validateRegularSchedulePreference = (
  input: unknown
): RegularSchedulePreferenceValidation => {
  if (!isPlainObject(input)) {
    return fail("not_an_object")
  }

  if (!hasOnlyKeys(input, ROOT_KEYS)) {
    return fail("unknown_key")
  }

  if (input.version !== REGULAR_SCHEDULE_PREFERENCE_VERSION) {
    return fail("unsupported_version")
  }

  const state = input.state
  if (typeof state !== "string" || !STATES.includes(state as (typeof STATES)[number])) {
    return fail("invalid_state")
  }

  if (!Array.isArray(input.groups)) {
    return fail("groups_not_an_array")
  }

  if (input.groups.length > MAX_REGULAR_SCHEDULE_PREFERENCE_GROUPS) {
    return fail("too_many_groups")
  }

  // state 와 groups 는 1:1 이어야 한다.
  // specified + [] 는 "요일·시간 모두 무관"이 아니라 그냥 깨진 값이다.
  if ((state === "undecided") !== (input.groups.length === 0)) {
    return fail("state_groups_mismatch")
  }

  if (state === "undecided") {
    return { ok: true, value: { version: 1, state: "undecided", groups: [] } }
  }

  const groups: RegularSchedulePreferenceGroup[] = []
  const seen = new Set<string>()

  for (const [index, rawGroup] of input.groups.entries()) {
    const result = validateGroup(rawGroup, index)
    if (!result.ok) {
      return result
    }

    const identity = groupIdentity(result.value)
    if (seen.has(identity)) {
      // 조용히 버리지 않는다. 저장했다고 생각한 조건이 사라지면 사용자는 버그로 읽는다.
      return fail("duplicate_preference_group", index)
    }

    seen.add(identity)
    groups.push(result.value)
  }

  return {
    ok: true,
    value: {
      version: 1,
      state: "specified",
      groups: groups as [RegularSchedulePreferenceGroup, ...RegularSchedulePreferenceGroup[]]
    }
  }
}

// ─────────────────────────────────────────────────────────────
// parser
// ─────────────────────────────────────────────────────────────

export type RegularSchedulePreferenceParseResult =
  /** 컬럼이 null. 상담에서 아직 기록하지 않았다. */
  | { status: "empty" }
  | { status: "valid"; value: RegularSchedulePreference }
  /** 미래 버전. 원본을 건드리지 않고 화면이 "지원하지 않는 버전"으로 표시한다. */
  | { status: "unreadable_version"; version: number }
  | { status: "corrupt"; code: RegularSchedulePreferenceErrorCode }

/**
 * DB 에서 읽은 값을 해석한다.
 *
 * 미래 버전을 조용히 v1 로 해석하지 않는다 — 원장이 실제로 확인하지 않은 일정을
 * 화면에 띄우게 된다. 어떤 경우에도 throw 하지 않고, 원본을 고쳐 쓰지도 않는다.
 */
export const parseRegularSchedulePreference = (
  input: unknown
): RegularSchedulePreferenceParseResult => {
  if (input === null || input === undefined) {
    return { status: "empty" }
  }

  if (isPlainObject(input) && typeof input.version === "number") {
    if (!Number.isInteger(input.version)) {
      return { status: "corrupt", code: "unsupported_version" }
    }

    if (input.version !== REGULAR_SCHEDULE_PREFERENCE_VERSION) {
      return { status: "unreadable_version", version: input.version }
    }
  }

  const validation = validateRegularSchedulePreference(input)
  if (!validation.ok) {
    return { status: "corrupt", code: validation.code }
  }

  return { status: "valid", value: validation.value }
}

// ─────────────────────────────────────────────────────────────
// formatter — DB 를 읽지 않는다. 넘겨받은 값만 문자열로 만든다.
// ─────────────────────────────────────────────────────────────

const formatDays = (group: RegularSchedulePreferenceGroup) =>
  group.dayMode === "any"
    ? "요일 무관"
    : group.days.map((day) => ISO_WEEKDAY_LABELS[day]).join("·")

const formatTime = (group: RegularSchedulePreferenceGroup) => {
  switch (group.timeMode) {
    case "range":
      return `${group.startTime}~${group.endTime}`
    case "after":
      return `${group.startTime} 이후`
    case "before":
      return `${group.endTime} 이전`
    case "any":
      return "시간 무관"
  }
}

/** 한 조건 그룹의 표시 문자열. 예: "화·목 · 17:00 이후" */
export const formatRegularSchedulePreferenceGroup = (
  group: RegularSchedulePreferenceGroup
) => {
  // 둘 다 무관이면 "요일 무관 · 시간 무관"보다 한 마디가 읽기 좋다.
  if (group.dayMode === "any" && group.timeMode === "any") {
    return "요일·시간 무관"
  }

  return `${formatDays(group)} · ${formatTime(group)}`
}

/** 전체 값의 표시 줄들. 그룹이 여러 개면 UI 가 "또는"으로 이어 붙인다. */
export const formatRegularSchedulePreferenceLines = (
  preference: RegularSchedulePreference
): string[] =>
  preference.state === "undecided"
    ? ["아직 일정 미정"]
    : preference.groups.map(formatRegularSchedulePreferenceGroup)

/** 한 줄로 합친 표시 문자열. */
export const formatRegularSchedulePreference = (preference: RegularSchedulePreference) =>
  formatRegularSchedulePreferenceLines(preference).join(" 또는 ")
