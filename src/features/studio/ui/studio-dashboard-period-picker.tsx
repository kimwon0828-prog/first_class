"use client"

import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"

import type { StudioDateRangePreset } from "@/features/studio/lib/studio-date-range"

import styles from "./studio-dashboard-period-control.module.css"

type PeriodOption = {
  value: Exclude<StudioDateRangePreset, "custom">
  label: string
  href: string
}

type StudioDashboardPeriodPickerProps = {
  basePath: string
  options: PeriodOption[]
  selectedPreset: StudioDateRangePreset
  startDate: string
  endDate: string
}

export const StudioDashboardPeriodPicker = ({
  basePath,
  options,
  selectedPreset,
  startDate,
  endDate
}: StudioDashboardPeriodPickerProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const startDateRef = useRef<HTMLInputElement | null>(null)
  const popoverId = useId()

  const closeAndRestoreFocus = () => {
    setIsOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!isOpen) {
      return
    }

    startDateRef.current?.focus()

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAndRestoreFocus()
      }
    }

    document.addEventListener("pointerdown", closeOnPointerDown)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [isOpen])

  return (
    <div className={styles.control} ref={rootRef}>
      <nav className={styles.quickList} aria-label="성과 기간 선택">
        {options.map(option => (
          <Link
            key={option.value}
            href={option.href}
            className={`${styles.periodButton} ${
              selectedPreset === option.value ? styles.periodButtonActive : ""
            }`}
            aria-current={selectedPreset === option.value ? "page" : undefined}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <div className={styles.custom}>
        <button
          ref={triggerRef}
          type="button"
          className={`${styles.periodButton} ${
            selectedPreset === "custom" ? styles.periodButtonActive : ""
          }`}
          aria-expanded={isOpen}
          aria-controls={popoverId}
          onClick={() => setIsOpen(current => !current)}
        >
          직접 설정
        </button>

        {isOpen ? (
          <div
            id={popoverId}
            className={styles.popover}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${popoverId}-title`}
          >
            <h2 id={`${popoverId}-title`} className={styles.popoverTitle}>기간 직접 설정</h2>
            <form
              className={styles.customForm}
              action={basePath}
              method="get"
            >
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>시작일</span>
                  <input
                    ref={startDateRef}
                    type="date"
                    name="startDate"
                    defaultValue={startDate}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span>종료일</span>
                  <input
                    type="date"
                    name="endDate"
                    defaultValue={endDate}
                    required
                  />
                </label>
              </div>
              <div className={styles.formActions}>
                <button type="button" className={styles.cancelButton} onClick={closeAndRestoreFocus}>
                  취소
                </button>
                <button type="submit" className={styles.applyButton}>
                  적용
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  )
}
