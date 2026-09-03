// 상담 저장 form 에서 정규수업 희망 일정을 읽어 write 값으로 바꾼다.
//
// 여기가 지키는 규칙은 하나다:
//   "필드가 전달되지 않음"과 "undecided"는 다른 사실이다.
//
//   미전달    → Case 의 희망 일정을 건드리지 않는다(지우지 않는다).
//   undecided → 상담했지만 학부모가 아직 못 정했다는 명시적 기록이다.
//
// client 가 보낸 JSON 을 그대로 믿지 않는다. 검증·정규화는 전부
// regular-schedule-preference 의 domain module 을 재사용한다(중복 구현 금지).

import {
  areRegularSchedulePreferencesEqual,
  parseRegularSchedulePreference,
  validateRegularSchedulePreference,
  type RegularSchedulePreference
} from "@/features/studio/lib/regular-schedule-preference"
import type {
  RegularSchedulePreferenceWrite,
  StudioApplicationDetail
} from "@/shared/lib/db/adapter"

export const REGULAR_SCHEDULE_PREFERENCE_FIELD = "regularSchedulePreference"
export const REGULAR_SCHEDULE_PREFERENCE_NOTE_FIELD = "regularSchedulePreferenceNote"

export type RegularSchedulePreferenceInput =
  /** form 에 필드 자체가 없다. 기존 값을 유지한다. */
  | { status: "absent" }
  | { status: "invalid" }
  | {
      status: "present"
      /** null 이면 "기록 없음"으로 되돌린다는 명시적 요청이다. */
      preference: RegularSchedulePreference | null
      note: string | null
    }

const normalizeOptionalText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

/**
 * form 에서 희망 일정 입력을 읽는다.
 *
 * 두 필드 모두 없으면 absent 다. 값 필드가 있으면 JSON 으로 파싱한 뒤
 * server validator 를 통과시킨다 — client 가 보낸 형태를 신뢰하지 않는다.
 */
export const readRegularSchedulePreferenceInput = (
  formData: FormData
): RegularSchedulePreferenceInput => {
  const rawPreference = formData.get(REGULAR_SCHEDULE_PREFERENCE_FIELD)
  const rawNote = formData.get(REGULAR_SCHEDULE_PREFERENCE_NOTE_FIELD)

  if (rawPreference === null && rawNote === null) {
    return { status: "absent" }
  }

  const note = normalizeOptionalText(rawNote)

  // 값 필드가 비어 있으면 "기록 없음으로 되돌리기"다. note 만 보낸 경우도 여기에 해당한다.
  const preferenceText = normalizeOptionalText(rawPreference)
  if (!preferenceText) {
    return { status: "present", preference: null, note }
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(preferenceText)
  } catch {
    return { status: "invalid" }
  }

  const validation = validateRegularSchedulePreference(decoded)
  if (!validation.ok) {
    return { status: "invalid" }
  }

  // canonical 값만 저장한다(요일 정렬 등이 적용된 형태).
  return { status: "present", preference: validation.value, note }
}

export type ResolvedRegularSchedulePreferenceWrite = {
  /** Case 컬럼 write. undefined 면 건드리지 않는다. */
  caseWrite: RegularSchedulePreferenceWrite | undefined
  /** 이번 상담 log 에 남길 스냅샷. 미전달이면 현재 Case 값이다. */
  snapshot: RegularSchedulePreference | null
  snapshotNote: string | null
}

/** 현재 Case 에 저장된 값을 canonical 로 되돌린다. 읽을 수 없으면 null. */
const readCurrentPreference = (current: StudioApplicationDetail) => {
  const parsed = parseRegularSchedulePreference(current.regularSchedulePreference)
  return parsed.status === "valid" ? parsed.value : null
}

/**
 * 입력과 현재 값을 합쳐 실제 write 를 만든다.
 *
 * updated_at 은 "희망 일정 record 가 실제로 바뀐 시각"이다.
 * 등록 상태만 바뀌거나, 같은 값을 다시 제출했거나, 새 상담이 기존 값을 스냅샷으로
 * 복사했을 뿐이면 갱신하지 않는다.
 */
export const resolveRegularSchedulePreferenceWrite = ({
  input,
  current,
  now
}: {
  input: RegularSchedulePreferenceInput
  current: StudioApplicationDetail
  now: string
}): ResolvedRegularSchedulePreferenceWrite => {
  const currentPreference = readCurrentPreference(current)
  const currentNote = current.regularSchedulePreferenceNote

  if (input.status !== "present") {
    // 미전달. Case 는 그대로 두고, 스냅샷에는 이 시점의 Case 상태를 찍는다.
    return {
      caseWrite: undefined,
      snapshot: currentPreference,
      snapshotNote: currentNote
    }
  }

  // raw JSON 문자열이 아니라 canonical 값끼리 비교한다. [4,2] 와 [2,4] 는 같은 값이다.
  const preferenceChanged = !areRegularSchedulePreferencesEqual(
    currentPreference,
    input.preference
  )
  const noteChanged = currentNote !== input.note

  return {
    caseWrite: {
      preference: input.preference,
      note: input.note,
      updatedAt:
        preferenceChanged || noteChanged
          ? now
          : (current.regularSchedulePreferenceUpdatedAt ?? null)
    },
    snapshot: input.preference,
    snapshotNote: input.note
  }
}
