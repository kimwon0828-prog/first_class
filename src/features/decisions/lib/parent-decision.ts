/**
 * 체험을 마친 뒤 학부모가 직접 남긴 "지금 생각".
 *
 * ⚠️ 등록 결과가 아니다.
 *
 * trial_applications.registration_status 는 학원이 판단해 적는 운영 값이고
 * (undecided · pending · enrolled · not_enrolled), 이건 학부모 본인의 의향이다.
 * 주체도 의미도 달라서 값 이름을 일부러 겹치지 않게 했다 —
 * enrolled / not_enrolled 를 여기 쓰지 않는다.
 *
 * 둘을 서로 변환하지 않는다. 학원이 "고민 중" 이라고 적어 둔 것과 학부모가
 * 스스로 "고민 중" 이라고 고른 것은 다른 사실이다.
 */
export type ParentDecision = "planned" | "considering" | "declined"

export const PARENT_DECISION_OPTIONS: ReadonlyArray<{
  value: ParentDecision
  label: string
}> = [
  { value: "planned", label: "등록할 생각이에요" },
  { value: "considering", label: "조금 더 고민 중이에요" },
  { value: "declined", label: "이번에는 등록하지 않을게요" }
]

export const PARENT_DECISION_VALUES: ReadonlySet<string> = new Set(
  PARENT_DECISION_OPTIONS.map((option) => option.value)
)

export const isParentDecision = (value: unknown): value is ParentDecision =>
  typeof value === "string" && PARENT_DECISION_VALUES.has(value)

export const getParentDecisionLabel = (value: ParentDecision): string =>
  PARENT_DECISION_OPTIONS.find((option) => option.value === value)?.label ?? value

/**
 * 지금 생각을 물어도 되는 상태인가.
 *
 * 이미 등록 여부가 확정된 신청에는 다시 묻지 않는다. 결과가 나온 뒤에
 * "등록할 생각인가요" 를 묻는 것은 무의미하고, 학부모에게는 학원이 무엇을
 * 적어 뒀는지 모르는 채 답하라는 말이 된다.
 *
 * 판정 근거는 RegistrationResult 다 — registration_status 원문이 아니다.
 * "확정된 결과가 있는가" 하나만 받는다. 무엇으로 확정됐는지(enrolled 인지
 * not_enrolled 인지)는 이 판정에 필요 없고, 학부모 화면이 알 필요도 없다.
 *
 * ⚠️ 이 판정이 ParentDecision 을 만들지 않는다. 표시 여부만 정한다.
 */
export const canCollectParentDecision = (
  hasCurrentRegistrationResult: boolean | null | undefined
): boolean => hasCurrentRegistrationResult !== true

/**
 * 등록하지 않겠다고 할 때 부모가 직접 고르는 이유.
 *
 * ⚠️ 학원이 적는 unregistered_reason 과 다른 값이다.
 *
 * 코드가 비슷해 보여도(둘 다 "일정" 이 있다) 같은 사실이 아니다. 하나는 부모가
 * 자기 입으로 말한 것이고 하나는 학원이 상담 뒤 분류한 것이다. 서로 변환하거나
 * 한쪽으로 채우지 않는다 — 그러면 누가 한 말인지 알 수 없게 된다.
 */
export type ParentDeclineReason =
  | "schedule_mismatch"
  | "price"
  | "distance"
  | "child_preference"
  | "class_mismatch"
  | "chose_another"
  | "other"

export const PARENT_DECLINE_REASON_OPTIONS: ReadonlyArray<{
  value: ParentDeclineReason
  label: string
}> = [
  { value: "schedule_mismatch", label: "시간대가 맞지 않아요" },
  { value: "price", label: "비용이 고민돼요" },
  { value: "distance", label: "위치나 거리가 부담돼요" },
  { value: "child_preference", label: "아이가 원하지 않아요" },
  { value: "class_mismatch", label: "수업이 생각과 달랐어요" },
  { value: "chose_another", label: "다른 학원을 선택했어요" },
  { value: "other", label: "기타" }
]

const PARENT_DECLINE_REASON_VALUES: ReadonlySet<string> = new Set(
  PARENT_DECLINE_REASON_OPTIONS.map((option) => option.value)
)

export const isParentDeclineReason = (value: unknown): value is ParentDeclineReason =>
  typeof value === "string" && PARENT_DECLINE_REASON_VALUES.has(value)

export const getParentDeclineReasonLabel = (value: ParentDeclineReason): string =>
  PARENT_DECLINE_REASON_OPTIONS.find((option) => option.value === value)?.label ?? value

/** 시간대가 이유일 때만 언제가 좋은지 묻는다. 그 외에는 물을 이유가 없다. */
export const requiresPreferredSchedule = (
  reason: ParentDeclineReason | null | undefined
): boolean => reason === "schedule_mismatch"

/**
 * 가능한 요일.
 *
 * ⚠️ 특정 날짜가 아니다.
 *
 * 학부모가 아는 것은 "9월 22일" 이 아니라 "화·목 오후 4시 이후" 다.
 * 날짜 하나를 받으면 학원은 그날만 제안할 수 있고, 그날이 안 되면
 * 대화가 거기서 끝난다.
 */
export type PreferredDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

export const PREFERRED_DAY_OPTIONS: ReadonlyArray<{ value: PreferredDay; label: string }> = [
  { value: "mon", label: "월" },
  { value: "tue", label: "화" },
  { value: "wed", label: "수" },
  { value: "thu", label: "목" },
  { value: "fri", label: "금" },
  { value: "sat", label: "토" },
  { value: "sun", label: "일" }
]

const PREFERRED_DAY_ORDER = PREFERRED_DAY_OPTIONS.map((option) => option.value)

export const isPreferredDay = (value: unknown): value is PreferredDay =>
  typeof value === "string" && PREFERRED_DAY_ORDER.includes(value as PreferredDay)

/**
 * 시간 조건.
 *
 *   after  이 시간 이후면 괜찮아요
 *   exact  그 시간에 괜찮아요
 *   range  이 사이라면 괜찮아요
 */
export type PreferredTimeMode = "after" | "exact" | "range"

export const PREFERRED_TIME_MODE_OPTIONS: ReadonlyArray<{
  value: PreferredTimeMode
  label: string
}> = [
  { value: "after", label: "이 시간 이후면 괜찮아요" },
  { value: "exact", label: "이 시간에 괜찮아요" },
  { value: "range", label: "이 사이라면 괜찮아요" }
]

export const isPreferredTimeMode = (value: unknown): value is PreferredTimeMode =>
  value === "after" || value === "exact" || value === "range"

/** 끝 시각은 range 에만 있다. */
export const requiresPreferredEndTime = (
  mode: PreferredTimeMode | null | undefined
): boolean => mode === "range"

/** 요일 순으로 정렬한다. 화면과 DB 가 같은 순서를 쓴다. */
export const sortPreferredDays = (days: readonly PreferredDay[]): PreferredDay[] =>
  [...days].sort(
    (a, b) => PREFERRED_DAY_ORDER.indexOf(a) - PREFERRED_DAY_ORDER.indexOf(b)
  )

/** "화·목" */
export const formatPreferredDays = (days: readonly PreferredDay[]): string =>
  sortPreferredDays(days)
    .map((day) => PREFERRED_DAY_OPTIONS.find((option) => option.value === day)?.label ?? day)
    .join("·")

/** "16:00:00" · "16:00" → "오후 4시" / "오후 4시 30분" */
export const formatPreferredTime = (value: string): string => {
  const match = /^(\d{2}):(\d{2})/.exec(value)
  if (!match) {
    return value
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = hour < 12 ? "오전" : "오후"
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  const base = `${meridiem} ${displayHour}시`
  return minute === 0 ? base : `${base} ${minute}분`
}

/**
 * "화·목 / 오후 4시 이후" · "토 / 오전 10시~오후 1시"
 *
 * ⚠️ 년·월·일을 쓰지 않는다. 특정 하루가 아니라 평소 패턴이다.
 */
export const formatPreferredSchedule = (input: {
  days: readonly PreferredDay[] | null
  startTime: string | null
  endTime: string | null
  mode: PreferredTimeMode | null
}): string | null => {
  if (!input.days || input.days.length === 0 || !input.startTime || !input.mode) {
    return null
  }

  const days = formatPreferredDays(input.days)
  const start = formatPreferredTime(input.startTime)

  if (input.mode === "range") {
    if (!input.endTime) {
      return null
    }
    return `${days} / ${start}~${formatPreferredTime(input.endTime)}`
  }

  return input.mode === "after" ? `${days} / ${start} 이후` : `${days} / ${start}`
}

/**
 * 옛 방식으로 받은 희망 날짜.
 *
 * ⚠️ 요일 패턴으로 바꾸지 않는다.
 *
 * "9월 22일" 에서 요일을 뽑아 "월요일마다 가능" 이라고 적는 건 학부모가 한 적
 * 없는 말이다. 그때 적은 것은 그날 하루였고, 그 사실 그대로 보여 준다.
 */
export const formatLegacyPreferredDate = (
  value: string,
  note: string | null
): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  const base = `${Number(match[2])}월 ${Number(match[3])}일`
  return note ? `${base} · ${note}` : base
}

/** 학부모/학원 화면이 받는 현재 선택. raw row 를 그대로 넘기지 않는다. */
export type ParentDecisionSummary = {
  decision: ParentDecision
  createdAt: string
  /** declined 일 때만 값이 있다. */
  declineReason: ParentDeclineReason | null
  /**
   * 시간대가 이유일 때만 값이 있다.
   *
   * ⚠️ 날짜가 아니다. 평소 가능한 요일과 시간이다.
   */
  preferredDays: PreferredDay[] | null
  /** "16:00:00" */
  preferredStartTime: string | null
  /** range 일 때만 값이 있다. */
  preferredEndTime: string | null
  preferredTimeMode: PreferredTimeMode | null
  /** 옛 방식으로 받은 날짜. 새 화면은 이 값을 만들지 않는다. */
  preferredDate: string | null
  preferredTimeNote: string | null
}
