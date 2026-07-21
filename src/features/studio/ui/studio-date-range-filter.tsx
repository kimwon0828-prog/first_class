"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"

import {
  STUDIO_DATE_RANGE_PRESET_OPTIONS,
  buildStudioDateRangeFromPreset,
  type StudioDateRangePreset,
  type StudioResolvedDateRange
} from "@/features/studio/lib/studio-date-range"

import styles from "./studio-date-range-filter.module.css"

type StudioDateRangeFilterProps = {
  selectedRange: StudioResolvedDateRange
  basePath: string
  title?: string
  description?: string
}

const getDefaultCustomDates = () => {
  const todayRange = buildStudioDateRangeFromPreset("today")
  const end = todayRange?.endDate ?? new Date().toISOString().slice(0, 10)
  return {
    startDate: end,
    endDate: end
  }
}

export const StudioDateRangeFilter = ({
  selectedRange,
  basePath,
  title = "기간 필터",
  description = "신청일 기준으로 데이터를 확인합니다."
}: StudioDateRangeFilterProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [draftPreset, setDraftPreset] = useState<StudioDateRangePreset>(selectedRange.preset)
  const defaultCustomDates = useMemo(() => getDefaultCustomDates(), [])
  const [startDate, setStartDate] = useState(selectedRange.startDate ?? defaultCustomDates.startDate)
  const [endDate, setEndDate] = useState(selectedRange.endDate ?? defaultCustomDates.endDate)

  useEffect(() => {
    setDraftPreset(selectedRange.preset)
    setStartDate(selectedRange.startDate ?? defaultCustomDates.startDate)
    setEndDate(selectedRange.endDate ?? defaultCustomDates.endDate)
  }, [defaultCustomDates.endDate, defaultCustomDates.startDate, selectedRange.endDate, selectedRange.preset, selectedRange.startDate])

  const updateRange = (nextStartDate: string | null, nextEndDate: string | null) => {
    const params = new URLSearchParams(searchParams?.toString())

    if (!nextStartDate || !nextEndDate) {
      params.delete("startDate")
      params.delete("endDate")
    } else {
      params.set("startDate", nextStartDate)
      params.set("endDate", nextEndDate)
    }

    const query = params.toString()
    startTransition(() => {
      router.push(query ? `${basePath}?${query}` : basePath)
    })
  }

  const handlePresetChange = (nextPreset: StudioDateRangePreset) => {
    setDraftPreset(nextPreset)

    if (nextPreset === "custom") {
      return
    }

    const range = buildStudioDateRangeFromPreset(nextPreset)
    updateRange(range?.startDate ?? null, range?.endDate ?? null)
  }

  const handleCustomApply = () => {
    if (!startDate || !endDate || startDate > endDate) {
      return
    }

    updateRange(startDate, endDate)
  }

  const canApplyCustomRange = Boolean(startDate && endDate && startDate <= endDate)

  return (
    <section className={styles.filterCard} aria-label="기간 필터" aria-busy={isPending}>
      <div className={styles.filterTop}>
        <div className={styles.filterHeading}>
          <h2 className={styles.filterTitle}>{title}</h2>
          <p className={styles.filterDescription}>{description}</p>
        </div>
        {isPending ? (
          <span className={styles.status} role="status" aria-live="polite">
            불러오는 중...
          </span>
        ) : null}
      </div>

      <div className={styles.controlGrid}>
        <label className={styles.selectWrap}>
          <span className={styles.label}>빠른 선택</span>
          <select
            value={draftPreset}
            onChange={(event) => handlePresetChange(event.target.value as StudioDateRangePreset)}
            className={styles.select}
            disabled={isPending}
          >
            {STUDIO_DATE_RANGE_PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {draftPreset === "custom" ? (
          <div className={styles.customGrid}>
            <div className={styles.dateGrid}>
              <label className={styles.selectWrap}>
                <span className={styles.label}>시작일</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className={styles.dateInput}
                  disabled={isPending}
                />
              </label>
              <label className={styles.selectWrap}>
                <span className={styles.label}>종료일</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className={styles.dateInput}
                  disabled={isPending}
                />
              </label>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={handleCustomApply}
                disabled={!canApplyCustomRange || isPending}
              >
                {isPending ? "불러오는 중..." : "기간 적용"}
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => {
                  const fallbackRange = buildStudioDateRangeFromPreset("thisMonth")
                  setStartDate(fallbackRange?.startDate ?? defaultCustomDates.startDate)
                  setEndDate(fallbackRange?.endDate ?? defaultCustomDates.endDate)
                }}
                disabled={isPending}
              >
                이번 달로 초기화
              </button>
            </div>
            <p className={styles.helperText}>
              종료일은 해당 날짜의 마지막 시간까지 포함해 조회합니다.
            </p>
          </div>
        ) : (
          <p className={styles.helperText}>현재 선택: {selectedRange.label}</p>
        )}
      </div>
    </section>
  )
}
