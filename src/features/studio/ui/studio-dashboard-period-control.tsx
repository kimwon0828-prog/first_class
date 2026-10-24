import {
  STUDIO_DATE_RANGE_PRESET_OPTIONS,
  buildStudioDateRangeFromPreset,
  type StudioDateRangePreset,
  type StudioResolvedDateRange
} from "@/features/studio/lib/studio-date-range"

import { getStudioNavigationPath } from "@/shared/config/studio-navigation"
import { getRequestHostname } from "@/shared/lib/request-host"
import { StudioDashboardPeriodPicker } from "./studio-dashboard-period-picker"

type QuickPreset = { value: Exclude<StudioDateRangePreset, "custom">; label: string }

type StudioDashboardPeriodControlProps = {
  selectedRange: StudioResolvedDateRange
  basePath?: string
  /** 빠른 칩 순서 · 이름. 없으면 기존 이번 달 · 최근 3개월 · 올해. */
  presets?: QuickPreset[]
  /** 직접 고르는 칩 이름. 기본 "직접 설정". */
  customLabel?: string
}

const QUICK_PRESETS = STUDIO_DATE_RANGE_PRESET_OPTIONS.filter(
  (option): option is QuickPreset => ["thisMonth", "last3Months", "thisYear"].includes(option.value)
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
export const StudioDashboardPeriodControl = async ({
  selectedRange,
  basePath: internalBasePath = "/studio",
  presets = QUICK_PRESETS,
  customLabel
}: StudioDashboardPeriodControlProps) => {
  /* preset 링크와 form action 이 모두 이 자리를 가리킨다. host 에 맞춰 한 번만 옮긴다. */
  const basePath = getStudioNavigationPath({ internalPath: internalBasePath, hostname: await getRequestHostname() })
  const today = buildStudioDateRangeFromPreset("today")?.endDate ?? ""

  return <StudioDashboardPeriodPicker
    basePath={basePath}
    customLabel={customLabel}
    options={presets.map(option => ({
      ...option,
      href: buildPresetHref(basePath, option.value)
    }))}
    selectedPreset={selectedRange.preset}
    startDate={selectedRange.startDate ?? today}
    endDate={selectedRange.endDate ?? today}
  />
}
