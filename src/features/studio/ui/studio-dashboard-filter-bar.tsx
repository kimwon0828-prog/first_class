"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useTransition } from "react"

import type { StudioDashboardTeacherFilterOption } from "@/shared/lib/db/adapter"
import {
  buildStudioDateRangeFromPreset,
  type StudioResolvedDateRange
} from "@/features/studio/lib/studio-date-range"
import styles from "@/features/studio/ui/studio-dashboard.module.css"

type StudioDashboardFilterBarProps = {
  options: StudioDashboardTeacherFilterOption[]
  selectedTeacherId: string
  selectedRange: StudioResolvedDateRange
  basePath?: string
}

type DashboardDatePreset = "today" | "thisWeek" | "thisMonth" | "last30Days"

const dashboardDatePresetOptions: Array<{ value: DashboardDatePreset; label: string }> = [
  { value: "today", label: "오늘" },
  { value: "thisWeek", label: "이번 주" },
  { value: "thisMonth", label: "이번 달" },
  { value: "last30Days", label: "지난 30일" }
]

const formatYmd = (value: Date) =>
  `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`

const buildDashboardDateRange = (preset: DashboardDatePreset) => {
  if (preset === "today") {
    return buildStudioDateRangeFromPreset("today")
  }

  if (preset === "thisMonth") {
    return buildStudioDateRangeFromPreset("thisMonth")
  }

  const todayRange = buildStudioDateRangeFromPreset("today")
  const todayText = todayRange?.endDate ?? new Date().toISOString().slice(0, 10)
  const today = new Date(`${todayText}T00:00:00Z`)

  if (preset === "last30Days") {
    const start = new Date(today)
    start.setUTCDate(start.getUTCDate() - 29)
    return {
      startDate: formatYmd(start),
      endDate: formatYmd(today)
    }
  }

  const weekday = today.getUTCDay()
  const start = new Date(today)
  start.setUTCDate(start.getUTCDate() - weekday)
  return {
    startDate: formatYmd(start),
    endDate: formatYmd(today)
  }
}

const resolveDashboardPreset = (selectedRange: StudioResolvedDateRange): DashboardDatePreset => {
  return (
    dashboardDatePresetOptions.find((option) => {
      const range = buildDashboardDateRange(option.value)
      return range?.startDate === selectedRange.startDate && range?.endDate === selectedRange.endDate
    })?.value ?? "thisMonth"
  )
}

export const StudioDashboardFilterBar = ({
  options,
  selectedTeacherId,
  selectedRange,
  basePath = "/studio"
}: StudioDashboardFilterBarProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const currentPreset = useMemo(() => resolveDashboardPreset(selectedRange), [selectedRange])
  const sortedOptions = useMemo(
    () => [...options].sort((left, right) => left.teacherName.localeCompare(right.teacherName)),
    [options]
  )

  const pushWithParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams?.toString())
    mutate(params)
    const query = params.toString()
    startTransition(() => {
      router.push(query ? `${basePath}?${query}` : basePath)
    })
  }

  const handlePresetChange = (preset: DashboardDatePreset) => {
    const range = buildDashboardDateRange(preset)
    if (!range) {
      return
    }

    pushWithParams((params) => {
      params.set("startDate", range.startDate)
      params.set("endDate", range.endDate)
    })
  }

  const handleTeacherChange = (nextValue: string) => {
    pushWithParams((params) => {
      if (!nextValue || nextValue === "all") {
        params.delete("teacherId")
      } else {
        params.set("teacherId", nextValue)
      }
    })
  }

  return (
    <div className={styles.dashboardFilterBar} aria-busy={isPending}>
      <label className={styles.dashboardFilterField}>
        <span className={styles.dashboardFilterLabel}>기간</span>
        <select
          value={currentPreset}
          onChange={(event) => handlePresetChange(event.target.value as DashboardDatePreset)}
          className={styles.dashboardCompactSelect}
          disabled={isPending}
        >
          {dashboardDatePresetOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.dashboardFilterField}>
        <span className={styles.dashboardFilterLabel}>선생님</span>
        <select
          value={selectedTeacherId}
          onChange={(event) => handleTeacherChange(event.target.value)}
          className={styles.dashboardCompactSelect}
          disabled={isPending}
        >
          <option value="all">전체</option>
          {sortedOptions.map((option) => (
            <option key={option.teacherId} value={option.teacherId}>
              {option.teacherName}
            </option>
          ))}
        </select>
      </label>

      {isPending ? (
        <span className={styles.dashboardFilterPending} role="status" aria-live="polite">
          불러오는 중...
        </span>
      ) : null}
    </div>
  )
}
