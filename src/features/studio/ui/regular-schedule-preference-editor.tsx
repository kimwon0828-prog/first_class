"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  MAX_REGULAR_SCHEDULE_PREFERENCE_GROUPS,
  formatRegularSchedulePreferenceGroup,
  parseRegularSchedulePreference,
  validateRegularSchedulePreference,
  type IsoWeekday,
  type RegularSchedulePreference,
  type RegularSchedulePreferenceGroup
} from "@/features/studio/lib/regular-schedule-preference"
import {
  REGULAR_SCHEDULE_PREFERENCE_FIELD,
  REGULAR_SCHEDULE_PREFERENCE_NOTE_FIELD
} from "@/features/studio/lib/regular-schedule-preference-input"

import styles from "./regular-schedule-preference-editor.module.css"

/** 1=월 … 7=일. ISO 순서 그대로 보여준다. */
const WEEKDAYS: Array<{ value: IsoWeekday; label: string }> = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 7, label: "일" }
]

const WEEKDAY_SHORTCUTS: Array<{ label: string; days: IsoWeekday[] }> = [
  // 실제 legacy 입력의 6/20건이 '평일'/'주말' 표현이었다. 매번 개별 탭하게 하지 않는다.
  { label: "평일", days: [1, 2, 3, 4, 5] },
  { label: "주말", days: [6, 7] }
]

const TIME_MODES = [
  { value: "range", label: "범위" },
  { value: "after", label: "이후" },
  { value: "before", label: "이전" },
  { value: "any", label: "시간 무관" }
] as const

type TimeMode = (typeof TIME_MODES)[number]["value"]

/** 24시간제만 만든다. '5시' 같은 오전/오후 모호성을 구조적으로 차단한다. */
const TIME_OPTIONS = Array.from({ length: 34 }, (_, index) => {
  const minutes = 7 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
})

type DraftGroup = {
  key: string
  dayMode: "selected" | "any"
  days: IsoWeekday[]
  timeMode: TimeMode
  startTime: string
  endTime: string
}

const createDraftGroup = (): DraftGroup => ({
  key: crypto.randomUUID(),
  dayMode: "selected",
  days: [],
  timeMode: "after",
  startTime: "17:00",
  endTime: "19:00"
})

const toDraftGroup = (group: RegularSchedulePreferenceGroup): DraftGroup => ({
  key: crypto.randomUUID(),
  dayMode: group.dayMode,
  days: [...group.days],
  timeMode: group.timeMode,
  startTime: group.startTime ?? "17:00",
  endTime: group.endTime ?? "19:00"
})

/** draft 를 계약 형태로 바꾼다. 검증은 domain validator 가 한다 — 여기서 다시 판정하지 않는다. */
const toPreferenceValue = (
  state: "specified" | "undecided",
  groups: DraftGroup[]
): unknown => {
  if (state === "undecided") {
    return { version: 1, state: "undecided", groups: [] }
  }

  return {
    version: 1,
    state: "specified",
    groups: groups.map((group) => ({
      dayMode: group.dayMode,
      days: group.dayMode === "any" ? [] : group.days,
      timeMode: group.timeMode,
      startTime:
        group.timeMode === "range" || group.timeMode === "after" ? group.startTime : null,
      endTime: group.timeMode === "range" || group.timeMode === "before" ? group.endTime : null
    }))
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  selected_days_required: "요일을 하나 이상 선택하거나 '요일 무관'을 눌러 주세요.",
  time_range_reversed: "종료 시간이 시작 시간보다 빨라요.",
  duplicate_preference_group: "같은 조건이 이미 있어요.",
  too_many_groups: `조건은 최대 ${MAX_REGULAR_SCHEDULE_PREFERENCE_GROUPS}개까지 추가할 수 있어요.`
}

type RegularSchedulePreferenceEditorProps = {
  /** DB 에서 읽은 원본. 파싱은 이 컴포넌트가 한다. */
  currentPreference: unknown
  currentNote: string | null
  disabled?: boolean
  /** 미등록 사유가 '일정 불일치' 일 때만 안내 문구를 띄운다(강제하지 않는다). */
  showScheduleMismatchGuidance?: boolean
}

/**
 * 정규수업 희망 일정 입력기.
 *
 * 신규 상담 / 상담 수정 양쪽에서 그대로 재사용한다.
 * hidden input 두 개로 form 에 실린다 — 건드리지 않으면 필드가 나가지 않아
 * 서버가 "미전달" 로 읽고 기존 값을 유지한다.
 *
 * ⚠️ 신청 시 자유 입력(preferred_regular_schedule)을 여기에 자동으로 채우지 않는다.
 *    '5시' 가 17:00 인지 05:00 인지 데이터로는 알 수 없다 — 추정이 되기 때문이다.
 */
export const RegularSchedulePreferenceEditor = ({
  currentPreference,
  currentNote,
  disabled = false,
  showScheduleMismatchGuidance = false
}: RegularSchedulePreferenceEditorProps) => {
  const parsed = useMemo(
    () => parseRegularSchedulePreference(currentPreference),
    [currentPreference]
  )

  const initial = parsed.status === "valid" ? parsed.value : null

  // 순수 client UI 상태다. domain model(RegularSchedulePreference JSON)에는 넣지 않는다.
  const [touched, setTouched] = useState(false)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const rootRef = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<"specified" | "undecided">(
    initial?.state === "undecided" ? "undecided" : "specified"
  )
  const [groups, setGroups] = useState<DraftGroup[]>(() =>
    initial && initial.state === "specified"
      ? initial.groups.map(toDraftGroup)
      : [createDraftGroup()]
  )
  const [note, setNote] = useState(currentNote ?? "")

  const markTouched = () => setTouched(true)

  /*
    입력을 시작해 놓고(touched) 유효하지 않은 채 저장을 누르면 그대로 저장하지 않는다.
    hidden input 이 나가지 않아 서버에는 "미전달" 로 보이고, 사용자가 쓰던 값이 조용히
    사라지기 때문이다. 손대지 않은 상태는 원래 "미전달" 이 정상이라 막지 않는다.
  */
  const blockSubmitRef = useRef(false)

  useEffect(() => {
    const form = rootRef.current?.closest("form")
    if (!form) {
      return
    }

    const handleSubmit = (event: Event) => {
      if (!blockSubmitRef.current) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setAttemptedSubmit(true)
    }

    form.addEventListener("submit", handleSubmit, true)
    return () => form.removeEventListener("submit", handleSubmit, true)
  }, [])

  const updateGroup = (key: string, patch: Partial<DraftGroup>) => {
    markTouched()
    setGroups((previous) =>
      previous.map((group) => (group.key === key ? { ...group, ...patch } : group))
    )
  }

  const toggleDay = (key: string, day: IsoWeekday) => {
    markTouched()
    setGroups((previous) =>
      previous.map((group) => {
        if (group.key !== key) {
          return group
        }

        const days = group.days.includes(day)
          ? group.days.filter((item) => item !== day)
          : [...group.days, day].sort((left, right) => left - right)

        return { ...group, dayMode: "selected", days }
      })
    )
  }

  const candidate = toPreferenceValue(state, groups)
  const validation = validateRegularSchedulePreference(candidate)

  /*
    처음 열었을 때 빈 조건은 "잘못 입력함" 이 아니라 "아직 입력 중" 이다.
    사용자가 실제로 조작했거나(touched) 저장을 시도한 뒤에만 빨간 문구를 띄운다.
    유효해지면 저장을 다시 누르지 않아도 즉시 사라진다 — 매 렌더에서 다시 계산하기 때문이다.
    검증 규칙 자체는 domain module 그대로다.
  */
  const shouldShowError = (touched || attemptedSubmit) && !validation.ok
  const errorMessage =
    validation.ok || !shouldShowError
      ? null
      : (ERROR_MESSAGES[validation.code] ?? "희망 일정 값을 확인해 주세요.")

  // 손대지 않았으면 hidden input 을 내보내지 않는다 → 서버가 "미전달" 로 읽어 기존 값을 유지한다.
  const shouldSubmit = touched || note !== (currentNote ?? "")
  const serialized = validation.ok ? JSON.stringify(validation.value) : ""

  blockSubmitRef.current = touched && !validation.ok

  const preview: RegularSchedulePreference | null = validation.ok ? validation.value : null

  return (
    <section ref={rootRef} className={styles.editor} aria-label="정규수업 희망 일정">
      <div className={styles.header}>
        <h4 className={styles.title}>정규수업 희망 일정</h4>
        <p className={styles.description}>
          체험 이후 정규수업으로 등록한다면 가능한 요일과 시간을 확인해 기록해 주세요.
        </p>
      </div>

      {parsed.status === "unreadable_version" || parsed.status === "corrupt" ? (
        <p className={styles.notice} role="status">
          이전에 저장된 희망 일정을 이 화면에서 표시할 수 없어요. 새로 입력하면 교체됩니다.
        </p>
      ) : null}

      {showScheduleMismatchGuidance ? (
        <p className={styles.guidance} role="status">
          희망 일정을 함께 기록하면 향후 수업 편성에 참고할 수 있어요. 입력하지 않아도 저장됩니다.
        </p>
      ) : null}

      <label className={styles.undecidedRow}>
        <input
          type="checkbox"
          checked={state === "undecided"}
          onChange={(event) => {
            markTouched()
            setState(event.target.checked ? "undecided" : "specified")
          }}
          disabled={disabled}
        />
        <span>아직 일정 미정</span>
        <span className={styles.undecidedHelp}>학부모가 아직 가능한 일정을 정하지 못했어요.</span>
      </label>

      {state === "specified"
        ? groups.map((group, index) => (
            <div key={group.key} className={styles.group}>
              <div className={styles.groupHead}>
                <span className={styles.groupLabel}>조건 {index + 1}</span>
                {groups.length > 1 ? (
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => {
                      markTouched()
                      setGroups((previous) => previous.filter((item) => item.key !== group.key))
                    }}
                    disabled={disabled}
                  >
                    삭제
                  </button>
                ) : null}
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>희망 요일</span>
                <div className={styles.chipRow}>
                  {WEEKDAY_SHORTCUTS.map((shortcut) => (
                    <button
                      key={shortcut.label}
                      type="button"
                      className={styles.shortcutChip}
                      onClick={() =>
                        updateGroup(group.key, { dayMode: "selected", days: shortcut.days })
                      }
                      disabled={disabled}
                    >
                      {shortcut.label}
                    </button>
                  ))}
                </div>
                <div className={styles.chipRow}>
                  {WEEKDAYS.map((weekday) => {
                    const selected =
                      group.dayMode === "selected" && group.days.includes(weekday.value)
                    return (
                      <button
                        key={weekday.value}
                        type="button"
                        className={`${styles.dayChip} ${selected ? styles.chipActive : ""}`}
                        onClick={() => toggleDay(group.key, weekday.value)}
                        disabled={disabled}
                        aria-pressed={selected}
                      >
                        {weekday.label}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    className={`${styles.chip} ${group.dayMode === "any" ? styles.chipActive : ""}`}
                    onClick={() =>
                      updateGroup(group.key, {
                        dayMode: group.dayMode === "any" ? "selected" : "any",
                        days: []
                      })
                    }
                    disabled={disabled}
                    aria-pressed={group.dayMode === "any"}
                  >
                    요일 무관
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>희망 시간</span>
                <div className={styles.timeRow}>
                  {group.timeMode === "range" || group.timeMode === "after" ? (
                    <select
                      className={styles.select}
                      value={group.startTime}
                      onChange={(event) =>
                        updateGroup(group.key, { startTime: event.target.value })
                      }
                      disabled={disabled}
                      aria-label="시작 시간"
                    >
                      {TIME_OPTIONS.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {group.timeMode === "range" ? <span className={styles.tilde}>~</span> : null}

                  {group.timeMode === "range" || group.timeMode === "before" ? (
                    <select
                      className={styles.select}
                      value={group.endTime}
                      onChange={(event) => updateGroup(group.key, { endTime: event.target.value })}
                      disabled={disabled}
                      aria-label="종료 시간"
                    >
                      {TIME_OPTIONS.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <select
                    className={styles.select}
                    value={group.timeMode}
                    onChange={(event) =>
                      updateGroup(group.key, { timeMode: event.target.value as TimeMode })
                    }
                    disabled={disabled}
                    aria-label="시간 조건"
                  >
                    {TIME_MODES.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))
        : null}

      {state === "specified" && groups.length < MAX_REGULAR_SCHEDULE_PREFERENCE_GROUPS ? (
        <button
          type="button"
          className={styles.addButton}
          onClick={() => {
            markTouched()
            setGroups((previous) => [...previous, createDraftGroup()])
          }}
          disabled={disabled}
        >
          + 다른 조건 추가
        </button>
      ) : null}

      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : preview && preview.state === "specified" ? (
        <p className={styles.preview}>
          {preview.groups.map(formatRegularSchedulePreferenceGroup).join(" 또는 ")}
        </p>
      ) : null}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>추가 메모</span>
        <input
          className={styles.input}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="예: 목요일 우선"
          disabled={disabled}
        />
      </label>

      {/*
        검증을 통과했고 사용자가 실제로 손댔을 때만 값을 실어 보낸다.
        필드가 아예 없으면 서버는 "미전달" 로 읽고 기존 Case 값을 유지한다.
      */}
      {shouldSubmit && validation.ok ? (
        <>
          <input type="hidden" name={REGULAR_SCHEDULE_PREFERENCE_FIELD} value={serialized} />
          <input type="hidden" name={REGULAR_SCHEDULE_PREFERENCE_NOTE_FIELD} value={note} />
        </>
      ) : null}
    </section>
  )
}
