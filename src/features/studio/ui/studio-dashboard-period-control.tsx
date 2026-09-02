import Link from "next/link"

import {
  STUDIO_DATE_RANGE_PRESET_OPTIONS,
  buildStudioDateRangeFromPreset,
  type StudioDateRangePreset,
  type StudioResolvedDateRange
} from "@/features/studio/lib/studio-date-range"

import styles from "./studio-dashboard-period-control.module.css"

type StudioDashboardPeriodControlProps = {
  selectedRange: StudioResolvedDateRange
  basePath?: string
}

const QUICK_PRESETS = STUDIO_DATE_RANGE_PRESET_OPTIONS.filter(
  (option): option is { value: Exclude<StudioDateRangePreset, "custom">; label: string } =>
    option.value !== "custom"
)

const buildPresetHref = (
  basePath: string,
  preset: Exclude<StudioDateRangePreset, "custom">
) => {
  if (preset === "all") {
    return `${basePath}?preset=all`
  }

  const range = buildStudioDateRangeFromPreset(preset)
  if (!range) {
    return basePath
  }

  const params = new URLSearchParams({
    startDate: range.startDate,
    endDate: range.endDate
  })
  return `${basePath}?${params.toString()}`
}

/**
 * 성과 분석 header 안에 들어가는 기간 선택.
 *
 * 자체 제목/설명을 두지 않는다. 어떤 영역에 적용되는지는 header 의 제목이 말해 준다.
 * href / searchParams 규칙은 그대로다.
 */
export const StudioDashboardPeriodControl = ({
  selectedRange,
  basePath = "/studio"
}: StudioDashboardPeriodControlProps) => {
  const today = buildStudioDateRangeFromPreset("today")?.endDate ?? ""

  return (
    <div className={styles.control}>
      <nav className={styles.quickList} aria-label="성과 기간 선택">
        {QUICK_PRESETS.map((option) => (
          <Link
            key={option.value}
            href={buildPresetHref(basePath, option.value)}
            className={`${styles.quickOption} ${
              selectedRange.preset === option.value ? styles.quickOptionActive : ""
            }`}
            aria-current={selectedRange.preset === option.value ? "page" : undefined}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <details className={styles.custom} open={selectedRange.preset === "custom"}>
        <summary className={styles.customSummary}>직접 설정</summary>
        <form className={styles.customForm} action={basePath} method="get">
          <label className={styles.field}>
            <span>시작일</span>
            <input
              type="date"
              name="startDate"
              defaultValue={selectedRange.startDate ?? today}
              required
            />
          </label>
          <label className={styles.field}>
            <span>종료일</span>
            <input
              type="date"
              name="endDate"
              defaultValue={selectedRange.endDate ?? today}
              required
            />
          </label>
          <button type="submit" className={styles.applyButton}>
            적용
          </button>
        </form>
      </details>
    </div>
  )
}
