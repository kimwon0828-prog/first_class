"use client"

import { useMemo } from "react"

import { addMinutesToTime, weekdayLabels } from "@/features/studio/lib/class-schedule-rule-utils"
import {
  buildOperatingTimeRangeSlots,
  createOperatingHoursGroupDraft,
  createOperatingHoursTimeRangeDraft,
  type CreateClassScheduleDraft,
  type OperatingHoursGroupDraft
} from "@/features/studio/lib/studio-operating-hours"

import styles from "./studio-class-operation-editor.module.css"

export type StudioClassOperationType = "rolling" | "fixed_period" | null

type StudioClassOperationEditorProps = {
  value: CreateClassScheduleDraft
  operationType: StudioClassOperationType
  todayKey: string
  disabled?: boolean
  onChange: (next: CreateClassScheduleDraft) => void
}

const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
const durationOptions = [30, 40, 50, 60, 90, 120]

export const StudioClassOperationEditor = ({
  value,
  operationType,
  todayKey,
  disabled = false,
  onChange
}: StudioClassOperationEditorProps) => {
  const durationMinutes = Number(value.intervalMinutes)
  const inputMode = value.timeInputMode ?? "range"
  const durationValues = Number.isInteger(durationMinutes) && durationMinutes > 0
    ? [...new Set([...durationOptions, durationMinutes])].sort((left, right) => left - right)
    : durationOptions
  const startDateMin = value.operationStartDate && value.operationStartDate < todayKey
    ? value.operationStartDate
    : todayKey

  const updateGroup = (
    groupId: string,
    updater: (group: OperatingHoursGroupDraft) => OperatingHoursGroupDraft
  ) => onChange({
    ...value,
    groups: value.groups.map((group) => group.id === groupId ? updater(group) : group)
  })

  const selectOperationType = (nextType: Exclude<StudioClassOperationType, null>) => {
    const groups = value.groups.length > 0
      ? value.groups
      : [createOperatingHoursGroupDraft([], value.defaultCapacity)]
    onChange({
      ...value,
      isAlwaysOpen: nextType === "rolling",
      operationStartDate: value.operationStartDate || todayKey,
      operationEndDate: nextType === "rolling" ? "" : value.operationEndDate,
      timeInputMode: value.timeInputMode ?? "range",
      operatingMode: groups.length === 1 ? "same" : "custom",
      groups
    })
  }

  const switchToRangeMode = () => onChange({
    ...value,
    timeInputMode: "range",
    usePerTimeRangeCapacity: true,
    groups: value.groups.map((group) => ({
      ...group,
      timeRanges: [createOperatingHoursTimeRangeDraft(group.timeRanges[0]?.capacity ?? value.defaultCapacity)]
    }))
  })

  const totalSlotsPerWeek = useMemo(() => value.groups.reduce((total, group) =>
    total + group.weekdays.length * group.timeRanges.reduce((rangeTotal, range) =>
      rangeTotal + buildOperatingTimeRangeSlots(range, durationMinutes, inputMode).length, 0), 0
  ), [durationMinutes, inputMode, value.groups])

  return (
    <div className={styles.editor}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>운영 방식 *</legend>
        <div className={styles.operationTypeGrid}>
          <label className={`${styles.operationTypeCard} ${operationType === "rolling" ? styles.selected : ""}`}>
            <input type="radio" name="operationTypeChoice" checked={operationType === "rolling"}
              disabled={disabled} onChange={() => selectOperationType("rolling")} />
            <span><strong>상시 운영</strong><small>종료일 없이 계속 운영해요.</small></span>
          </label>
          <label className={`${styles.operationTypeCard} ${operationType === "fixed_period" ? styles.selected : ""}`}>
            <input type="radio" name="operationTypeChoice" checked={operationType === "fixed_period"}
              disabled={disabled} onChange={() => selectOperationType("fixed_period")} />
            <span><strong>기간 지정 운영</strong><small>운영 기간을 정해요.</small></span>
          </label>
        </div>
      </fieldset>

      {operationType ? <>
        {operationType === "fixed_period" ? <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>운영 기간 *</legend>
          <div className={styles.dateRange}>
            <input aria-label="운영 시작일" type="date" value={value.operationStartDate} min={startDateMin}
              disabled={disabled} onChange={(event) => onChange({ ...value, operationStartDate: event.target.value })} />
            <span aria-hidden="true">~</span>
            <input aria-label="운영 종료일" type="date" value={value.operationEndDate}
              min={value.operationStartDate || todayKey} disabled={disabled}
              onChange={(event) => onChange({ ...value, operationEndDate: event.target.value })} />
          </div>
        </fieldset> : null}

        <label className={styles.durationField}>
          <span className={styles.legend}>체험수업 시간 *</span>
          <select aria-label="체험수업 시간" value={value.intervalMinutes} disabled={disabled}
            onChange={(event) => onChange({ ...value, intervalMinutes: event.target.value })}>
            {durationValues.map((duration) => <option key={duration} value={duration}>{duration}분</option>)}
          </select>
          <small>선택한 수업 시간 간격으로 예약 가능 시간을 만들어요.</small>
        </label>

        {inputMode === "individual" ? <div className={styles.individualNotice}>
          <div><strong>기존 개별 시간 설정</strong><p>저장된 시간과 정원을 그대로 유지하고 있어요.</p></div>
          <button type="button" disabled={disabled} onClick={switchToRangeMode}>운영시간 범위로 다시 설정</button>
        </div> : null}

        <fieldset className={styles.fieldset} aria-labelledby="operation-hours-heading">
          <div className={styles.sectionHeading}>
            <span id="operation-hours-heading" className={styles.legend}>운영 시간 설정 *</span>
            {inputMode === "range" ? <small>운영 종료 시각에 끝나는 회차까지만 예약을 받아요.</small> : null}
          </div>
          <div className={styles.groupList}>
            {value.groups.map((group, groupIndex) => {
              const capacities = new Set(group.timeRanges.map((range) => range.capacity.trim()).filter(Boolean))
              const groupCapacity = capacities.size === 1 ? [...capacities][0] : ""
              const previewTimes = [...new Set(group.timeRanges.flatMap((range) =>
                buildOperatingTimeRangeSlots(range, durationMinutes, inputMode).map((slot) => slot.startTime)
              ))].sort()

              return <section key={group.id} className={styles.scheduleGroup}>
                <div className={styles.groupHeader}>
                  <strong>운영시간 그룹 {groupIndex + 1}</strong>
                  {value.groups.length > 1 ? <button type="button" className={styles.removeGroupButton}
                    disabled={disabled} onClick={() => onChange({ ...value,
                      groups: value.groups.filter((item) => item.id !== group.id), operatingMode: "custom" })}>
                    그룹 삭제
                  </button> : null}
                </div>

                <div className={styles.groupField}>
                  <span className={styles.subLabel}>운영 요일 *</span>
                  <div className={styles.weekdayRow} aria-label={`운영시간 그룹 ${groupIndex + 1} 운영 요일`}>
                    {weekdayOrder.map((weekday) => {
                      const selected = group.weekdays.includes(weekday)
                      const blocked = !selected && value.groups.some(
                        (other) => other.id !== group.id && other.weekdays.includes(weekday)
                      )
                      return <button key={`${group.id}-${weekday}`} type="button"
                        className={`${styles.weekdayButton} ${selected ? styles.weekdaySelected : ""}`}
                        aria-pressed={selected} disabled={disabled || blocked}
                        title={blocked ? "다른 운영시간 그룹에서 선택한 요일입니다." : undefined}
                        onClick={() => updateGroup(group.id, (current) => ({ ...current,
                          weekdays: selected ? current.weekdays.filter((item) => item !== weekday)
                            : [...current.weekdays, weekday].sort((left, right) => left - right) }))}>
                        {weekdayLabels[weekday]}
                      </button>
                    })}
                  </div>
                </div>

                <div className={styles.groupField}>
                  <span className={styles.subLabel}>{inputMode === "range" ? "운영 시간 *" : "예약 시작 시간 *"}</span>
                  <div className={styles.timeList}>
                    {group.timeRanges.map((range, rangeIndex) => <div key={range.id} className={styles.timeRow}>
                      <input aria-label={`그룹 ${groupIndex + 1} ${rangeIndex + 1} 시작 시간`} type="time"
                        lang="en-GB" value={range.startTime} disabled={disabled}
                        onChange={(event) => updateGroup(group.id, (current) => ({ ...current,
                          timeRanges: current.timeRanges.map((item) => item.id === range.id
                            ? { ...item, startTime: event.target.value,
                              lastStartTime: inputMode === "individual" ? event.target.value : item.lastStartTime }
                            : item) }))} />
                      {inputMode === "range" ? <>
                        <span aria-hidden="true">~</span>
                        <input aria-label={`그룹 ${groupIndex + 1} ${rangeIndex + 1} 운영 종료 시간`} type="time"
                          lang="en-GB" value={range.operationEndTime ?? ""} disabled={disabled}
                          onChange={(event) => updateGroup(group.id, (current) => ({ ...current,
                            timeRanges: current.timeRanges.map((item) => item.id === range.id
                              ? { ...item, operationEndTime: event.target.value } : item) }))} />
                      </> : <span className={styles.individualEnd}>~ {addMinutesToTime(range.startTime, durationMinutes) || "--:--"}</span>}
                      {inputMode === "individual" ? <label className={styles.slotCapacity}>
                        <input aria-label={`${range.startTime || "미설정"} 정원`} type="number" min={1}
                          value={range.capacity} disabled={disabled} onChange={(event) => onChange({ ...value,
                            usePerTimeRangeCapacity: true,
                            groups: value.groups.map((current) => current.id === group.id ? { ...current,
                              timeRanges: current.timeRanges.map((item) => item.id === range.id
                                ? { ...item, capacity: event.target.value } : item) } : current) })} />
                        <span>명</span>
                      </label> : null}
                      {group.timeRanges.length > 1 ? <button type="button" className={styles.removeButton}
                        disabled={disabled} aria-label={`${range.startTime || "미설정"} 시간대 삭제`}
                        onClick={() => updateGroup(group.id, (current) => ({ ...current,
                          timeRanges: current.timeRanges.filter((item) => item.id !== range.id) }))}>삭제</button> : null}
                    </div>)}
                  </div>
                  <button type="button" className={styles.addTimeButton} disabled={disabled}
                    onClick={() => updateGroup(group.id, (current) => ({ ...current,
                      timeRanges: [...current.timeRanges, createOperatingHoursTimeRangeDraft(groupCapacity || value.defaultCapacity)] }))}>
                    {inputMode === "range" ? "+ 시간대 추가" : "+ 시간 추가"}
                  </button>
                  {inputMode === "range" ? <small className={styles.actionHint}>같은 요일에 다른 시간 범위를 추가해요.</small> : null}
                </div>

                {inputMode === "range" ? <div className={styles.previewBlock}>
                  <div className={styles.previewHeading}>
                    <strong>예약 가능 시간 {previewTimes.length > 0 ? `(${previewTimes.length}개)` : ""}</strong>
                    {previewTimes.length === 0 ? <span>운영 시간을 확인해 주세요.</span> : null}
                  </div>
                  {previewTimes.length > 0 ? <div className={styles.previewChips}>
                    {previewTimes.map((time) => <span key={time}>{time}</span>)}
                  </div> : null}
                </div> : null}

                {inputMode === "range" ? <label className={styles.capacityField}>
                  <span className={styles.subLabel}>회차당 정원 *</span>
                  <span className={styles.capacityInputWrap}>
                    <input type="number" min={1} inputMode="numeric" value={groupCapacity}
                      placeholder={capacities.size > 1 ? "시간별 다름" : "정원"} disabled={disabled}
                      onChange={(event) => onChange({ ...value,
                        usePerTimeRangeCapacity: true,
                        groups: value.groups.map((current) => current.id === group.id ? { ...current,
                          timeRanges: current.timeRanges.map((range) => ({ ...range, capacity: event.target.value }))
                        } : current) })} />
                    <span>명</span>
                  </span>
                </label> : null}
              </section>
            })}
          </div>

          <button type="button" className={styles.addGroupButton} disabled={disabled || value.groups.length >= 7}
            onClick={() => onChange({ ...value, operatingMode: "custom", usePerTimeRangeCapacity: true,
              groups: [...value.groups, createOperatingHoursGroupDraft([], value.defaultCapacity)] })}>
            + 운영시간 그룹 추가
          </button>
          <small className={styles.actionHint}>다른 요일에 다른 운영시간을 설정해요.</small>
          {totalSlotsPerWeek > 336 ? <p className={styles.limitError}>주간 예약 가능 시간이 336개를 넘을 수 없어요.</p> : null}
        </fieldset>
      </> : null}
    </div>
  )
}
