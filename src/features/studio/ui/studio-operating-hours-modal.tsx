"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  buildSlotsFromStartAndLast,
  createDraftTemplateForMode,
  createOperatingHoursGroupDraft,
  createOperatingHoursTimeRangeDraft,
  type CreateClassScheduleDraft,
  type OperatingHoursGroupDraft,
  type OperatingHoursMode
} from "@/features/studio/lib/studio-operating-hours"
import {
  formatWeekdaySet,
  isValidDateInput,
  timeToMinutes,
  weekdayLabels
} from "@/features/studio/lib/class-schedule-rule-utils"

import { formatSeoulDateKey } from "@/shared/lib/seoul-datetime"

import styles from "./studio-operating-hours-modal.module.css"

type StudioOperatingHoursModalProps = {
  isOpen: boolean
  title: string
  value: CreateClassScheduleDraft
  onClose: () => void
  onSave: (next: CreateClassScheduleDraft) => void
}

const intervalOptions = ["30", "40", "50", "60", "90", "120"]

const cloneDraft = (value: CreateClassScheduleDraft): CreateClassScheduleDraft => ({
  ...value,
  groups: value.groups.map((group) => ({
    ...group,
    weekdays: [...group.weekdays],
    timeRanges: group.timeRanges.map((range) => ({ ...range }))
  })),
  extraSlots: [...value.extraSlots],
  closedDates: [...value.closedDates],
  closedSlotKeys: [...value.closedSlotKeys]
})

const hasOverlappingRanges = (group: OperatingHoursGroupDraft, intervalMinutes: number) => {
  const slots = group.timeRanges.flatMap((range) =>
    buildSlotsFromStartAndLast(range.startTime, range.lastStartTime, intervalMinutes).map((slot) => ({
      ...slot,
      id: range.id
    }))
  )

  for (let index = 0; index < slots.length; index += 1) {
    const left = slots[index]
    const leftStart = timeToMinutes(left.startTime)
    const leftEnd = timeToMinutes(left.endTime)
    if (leftStart == null || leftEnd == null) {
      continue
    }
    for (let otherIndex = index + 1; otherIndex < slots.length; otherIndex += 1) {
      const right = slots[otherIndex]
      const rightStart = timeToMinutes(right.startTime)
      const rightEnd = timeToMinutes(right.endTime)
      if (rightStart == null || rightEnd == null) {
        continue
      }
      if (leftStart < rightEnd && rightStart < leftEnd) {
        return true
      }
    }
  }

  return false
}

const validateDraft = (draft: CreateClassScheduleDraft, todayKey: string, existingStartDate: string) => {
  if (!isValidDateInput(draft.operationStartDate)) {
    return "운영 시작일을 입력해 주세요."
  }

  if (draft.operationStartDate < todayKey && draft.operationStartDate !== existingStartDate) {
    return "운영 시작일은 오늘보다 빠를 수 없습니다."
  }

  if (!draft.isAlwaysOpen) {
    if (!isValidDateInput(draft.operationEndDate)) {
      return "운영 종료일을 입력해 주세요."
    }
    if (draft.operationEndDate < draft.operationStartDate) {
      return "운영 종료일은 시작일보다 빠를 수 없습니다."
    }
  }

  const intervalMinutes = Number(draft.intervalMinutes)
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    return "예약 간격을 다시 확인해 주세요."
  }

  const selectedWeekdaySet = new Set<number>()

  if (!draft.defaultCapacity.trim() && !draft.usePerTimeRangeCapacity) {
    return "타임당 정원을 입력해 주세요."
  }

  if (!draft.usePerTimeRangeCapacity) {
    const sharedCapacity = Number(draft.defaultCapacity)
    if (!Number.isInteger(sharedCapacity) || sharedCapacity < 1) {
      return "타임당 정원은 1명 이상의 정수로 입력해 주세요."
    }
  }

  for (const group of draft.groups) {
    if (group.weekdays.length === 0) {
      return "운영 요일을 1개 이상 선택해 주세요."
    }

    if (draft.operatingMode === "custom") {
      for (const weekday of group.weekdays) {
        if (selectedWeekdaySet.has(weekday)) {
          return "같은 요일은 여러 그룹에 중복 선택할 수 없습니다."
        }
        selectedWeekdaySet.add(weekday)
      }
    }

    if (group.timeRanges.length === 0) {
      return "운영시간을 1개 이상 추가해 주세요."
    }

    for (const range of group.timeRanges) {
      if (!range.startTime || !range.lastStartTime) {
        return "시작 시간과 마지막 시간을 입력해 주세요."
      }
      if (range.lastStartTime < range.startTime) {
        return "마지막 시간은 시작 시간보다 빠를 수 없습니다."
      }
      if (draft.usePerTimeRangeCapacity) {
        if (!range.capacity.trim()) {
          return "타임당 정원을 입력해 주세요."
        }
        const capacity = Number(range.capacity)
        if (!Number.isInteger(capacity) || capacity < 1) {
          return "타임당 정원은 1명 이상의 정수로 입력해 주세요."
        }
      }
      const slots = buildSlotsFromStartAndLast(range.startTime, range.lastStartTime, intervalMinutes)
      if (slots.length === 0) {
        return "예약 간격에 맞는 운영시간을 입력해 주세요."
      }
    }

    if (hasOverlappingRanges(group, intervalMinutes)) {
      return "같은 요일 그룹 안에서는 시간 구간이 겹칠 수 없습니다."
    }
  }

  return null
}

const groupTitle = (mode: OperatingHoursMode, group: OperatingHoursGroupDraft, index: number) => {
  if (mode === "weekdayWeekend") {
    return index === 0 ? "평일" : "주말"
  }

  return formatWeekdaySet(group.weekdays).join("·") || `그룹 ${index + 1}`
}

export const StudioOperatingHoursModal = ({
  isOpen,
  title,
  value,
  onClose,
  onSave
}: StudioOperatingHoursModalProps) => {
  const [draft, setDraft] = useState<CreateClassScheduleDraft>(value)
  const [error, setError] = useState<string | null>(null)
  const todayKey = useMemo(() => formatSeoulDateKey(new Date()) ?? "", [])
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const seeded = value.groups.length > 0 ? cloneDraft(value) : createDraftTemplateForMode(value.operatingMode, value)
    setDraft(seeded)
    setError(null)
  }, [isOpen, value])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousFocus = document.activeElement as HTMLElement | null
    const focusable = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)") ?? [])
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose() }
      if (event.key === "Tab") {
        const items = focusable()
        const first = items[0], last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener("keydown", onKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previousFocus?.focus()
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const updateGroup = (groupId: string, updater: (group: OperatingHoursGroupDraft) => OperatingHoursGroupDraft) => {
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === groupId ? updater(group) : group))
    }))
  }

  const handleDefaultCapacityChange = (capacity: string) => {
    setDraft((current) => ({
      ...current,
      defaultCapacity: capacity,
      groups: current.groups.map((group) => ({
        ...group,
        timeRanges: group.timeRanges.map((range) => ({
          ...range,
          capacity:
            current.usePerTimeRangeCapacity || range.capacity.trim()
              ? range.capacity
              : capacity
        }))
      }))
    }))
  }

  const handlePerTimeRangeCapacityChange = (checked: boolean) => {
    setDraft((current) => ({
      ...current,
      usePerTimeRangeCapacity: checked,
      groups: current.groups.map((group) => ({
        ...group,
        timeRanges: group.timeRanges.map((range) => ({
          ...range,
          capacity:
            checked && !range.capacity.trim() && current.defaultCapacity.trim()
              ? current.defaultCapacity
              : range.capacity
        }))
      }))
    }))
  }

  const handleModeChange = (nextMode: OperatingHoursMode) => {
    setDraft((current) => createDraftTemplateForMode(nextMode, current))
    setError(null)
  }

  const handleSave = () => {
    const message = validateDraft(draft, todayKey, value.operationStartDate)
    if (message) {
      setError(message)
      return
    }

    onSave({
      ...draft,
      operationEndDate: draft.isAlwaysOpen ? "" : draft.operationEndDate
    })
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div ref={modalRef} className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <strong className={styles.sectionTitle}>1. 예약 간격 및 정원</strong>
          </div>
          <div className={styles.rowGrid}>
            <label className={styles.field}>
              <span className={styles.label}>예약 간격</span>
              <select
                className={styles.input}
                value={draft.intervalMinutes}
                onChange={(event) => setDraft((current) => ({ ...current, intervalMinutes: event.target.value }))}
              >
                {intervalOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}분
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>타임당 정원</span>
              <input
                className={styles.input}
                type="number"
                min={1}
                placeholder="정원 입력"
                value={draft.defaultCapacity}
                onChange={(event) => handleDefaultCapacityChange(event.target.value)}
              />
            </label>
          </div>
          <p className={styles.hint}>
            {draft.intervalMinutes}분 수업이 같은 간격으로 생성됩니다. · 타임당 정원 {draft.defaultCapacity ? `${draft.defaultCapacity}명` : "정원 입력"}
          </p>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={draft.usePerTimeRangeCapacity}
              onChange={(event) => handlePerTimeRangeCapacityChange(event.target.checked)}
            />
            <span>시간대별 정원을 다르게 설정</span>
          </label>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <strong className={styles.sectionTitle}>2. 운영 기간</strong>
          </div>
          <div className={styles.rowGrid}>
            <label className={styles.field}>
              <span className={styles.label}>시작일</span>
              <input
                className={styles.input}
                type="date"
                value={draft.operationStartDate}
                min={value.operationStartDate && value.operationStartDate < todayKey ? value.operationStartDate : todayKey}
                onChange={(event) => setDraft((current) => ({ ...current, operationStartDate: event.target.value }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>종료일</span>
              <input
                className={styles.input}
                type="date"
                value={draft.operationEndDate}
                min={draft.operationStartDate || todayKey}
                disabled={draft.isAlwaysOpen}
                onChange={(event) => setDraft((current) => ({ ...current, operationEndDate: event.target.value }))}
              />
            </label>
          </div>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={draft.isAlwaysOpen}
              onChange={(event) => setDraft((current) => ({ ...current, isAlwaysOpen: event.target.checked }))}
            />
            <span>상시 운영 (90일 예약 일정 자동 연장)</span>
          </label>
          {draft.isAlwaysOpen ? (
            <p className={styles.hint}>공개 중인 수업은 앞으로 90일간 예약 일정이 자동으로 열립니다. 비공개로 전환하면 자동 연장이 중단됩니다.</p>
          ) : null}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <strong className={styles.sectionTitle}>3. 운영시간 구분 방식</strong>
          </div>
          <div className={styles.modeList}>
            {[
              { value: "same" as const, label: "모든 요일 같아요" },
              { value: "weekdayWeekend" as const, label: "평일/주말 달라요" },
              { value: "custom" as const, label: "요일별로 달라요" }
            ].map((option) => (
              <label key={option.value} className={styles.radioRow}>
                <input
                  type="radio"
                  checked={draft.operatingMode === option.value}
                  onChange={() => handleModeChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <strong className={styles.sectionTitle}>4. 운영시간 입력</strong>
          </div>
          <p className={styles.helpText}>마지막 시간은 학부모가 선택할 수 있는 마지막 수업 시작 시간입니다.</p>

          <div className={styles.groupList}>
            {draft.groups.map((group, groupIndex) => (
              <section key={group.id} className={styles.groupCard}>
                <div className={styles.groupHeader}>
                  <strong className={styles.groupTitle}>{groupTitle(draft.operatingMode, group, groupIndex)}</strong>
                  {draft.operatingMode === "custom" && draft.groups.length > 1 ? (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          groups: current.groups.filter((item) => item.id !== group.id)
                        }))
                      }
                    >
                      삭제
                    </button>
                  ) : null}
                </div>

                {draft.operatingMode === "same" || draft.operatingMode === "custom" ? (
                  <div className={styles.weekdayRow}>
                    {weekdayLabels.map((label, weekday) => {
                      const selected = group.weekdays.includes(weekday)
                      const blocked =
                        draft.operatingMode === "custom" &&
                        !selected &&
                        draft.groups.some((item) => item.id !== group.id && item.weekdays.includes(weekday))
                      return (
                        <button
                          key={`${group.id}-${label}`}
                          type="button"
                          className={`${styles.weekdayButton} ${selected ? styles.weekdayButtonSelected : ""}`}
                          disabled={blocked}
                          onClick={() =>
                            updateGroup(group.id, (current) => ({
                              ...current,
                              weekdays: selected
                                ? current.weekdays.filter((item) => item !== weekday)
                                : [...current.weekdays, weekday].sort((a, b) => a - b)
                            }))
                          }
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className={styles.weekdayText}>
                    {groupIndex === 0 ? "월~금" : "토·일"}
                  </p>
                )}

                <div className={styles.timeRangeList}>
                  {group.timeRanges.map((range) => (
                    <div key={range.id} className={styles.timeRangeCard}>
                      <div
                        className={`${styles.timeRow} ${
                          draft.usePerTimeRangeCapacity ? styles.timeRowWithCapacity : styles.timeRowWithoutCapacity
                        }`}
                      >
                        <label className={styles.field}>
                          <span className={styles.label}>시작</span>
                          <input
                            className={styles.input}
                            type="time"
                            value={range.startTime}
                            onChange={(event) =>
                              updateGroup(group.id, (current) => ({
                                ...current,
                                timeRanges: current.timeRanges.map((item) =>
                                  item.id === range.id ? { ...item, startTime: event.target.value } : item
                                )
                              }))
                            }
                          />
                        </label>
                        <span className={styles.dash}>-</span>
                        <label className={styles.field}>
                          <span className={styles.label}>마지막</span>
                          <input
                            className={styles.input}
                            type="time"
                            value={range.lastStartTime}
                            onChange={(event) =>
                              updateGroup(group.id, (current) => ({
                                ...current,
                                timeRanges: current.timeRanges.map((item) =>
                                  item.id === range.id ? { ...item, lastStartTime: event.target.value } : item
                                )
                              }))
                            }
                          />
                        </label>
                        {draft.usePerTimeRangeCapacity ? (
                          <label className={styles.field}>
                            <span className={styles.label}>타임당 정원</span>
                            <input
                              className={styles.input}
                              type="number"
                              min={1}
                              placeholder="정원 입력"
                              value={range.capacity}
                              onChange={(event) =>
                                updateGroup(group.id, (current) => ({
                                  ...current,
                                  timeRanges: current.timeRanges.map((item) =>
                                    item.id === range.id ? { ...item, capacity: event.target.value } : item
                                  )
                                }))
                              }
                            />
                          </label>
                        ) : null}
                      </div>
                      <div className={styles.timeRangeFooter}>
                        <span className={styles.rangePreview}>
                          {range.startTime && range.lastStartTime
                            ? `${buildSlotsFromStartAndLast(range.startTime, range.lastStartTime, Number(draft.intervalMinutes)).length}개 타임 생성`
                            : "시간을 입력해 주세요"}
                        </span>
                        {group.timeRanges.length > 1 ? (
                          <button
                            type="button"
                            className={styles.textButton}
                            onClick={() =>
                              updateGroup(group.id, (current) => ({
                                ...current,
                                timeRanges: current.timeRanges.filter((item) => item.id !== range.id)
                              }))
                            }
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() =>
                    updateGroup(group.id, (current) => ({
                      ...current,
                      timeRanges: [...current.timeRanges, createOperatingHoursTimeRangeDraft(draft.defaultCapacity)]
                    }))
                  }
                >
                  + 시간 추가
                </button>
              </section>
            ))}
          </div>

          {draft.operatingMode === "custom" ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  groups: [...current.groups, createOperatingHoursGroupDraft([], current.defaultCapacity)]
                }))
              }
            >
              + 요일 추가
            </button>
          ) : null}
        </div>

        {error ? <p className={styles.errorText}>{error}</p> : null}

        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            취소
          </button>
          <button type="button" className={styles.saveButton} onClick={handleSave}>
            설정 적용
          </button>
        </div>
      </div>
    </div>
  )
}
