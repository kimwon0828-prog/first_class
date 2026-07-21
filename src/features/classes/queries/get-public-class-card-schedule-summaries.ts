import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

type ClassCardScheduleSummary = {
  classId: string
  summaryLabel: string
}

type ClassScheduleSummaryRow = {
  class_id: string
  schedule_type: "weekly" | "one_time"
  day_of_week: number | null
  specific_date: string | null
  start_time: string
  display_label: string | null
  sort_order: number | null
  created_at: string | null
}

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const

const formatTimeLabel = (value: string) => {
  const [rawHour = "", rawMinute = ""] = value.split(":")
  const hour = Number(rawHour)
  const minute = Number(rawMinute)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value.slice(0, 5)
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

const formatScheduleSummaryLabel = (row: ClassScheduleSummaryRow) => {
  const customLabel = row.display_label?.trim()
  if (customLabel) {
    return customLabel
  }

  const timeLabel = formatTimeLabel(row.start_time)

  if (row.schedule_type === "weekly") {
    const weekday =
      row.day_of_week != null && row.day_of_week >= 0 && row.day_of_week <= 6
        ? weekdayLabels[row.day_of_week]
        : null

    return weekday ? `매주 ${weekday} ${timeLabel}` : `정기 일정 ${timeLabel}`
  }

  if (row.specific_date) {
    const date = new Date(`${row.specific_date}T00:00:00`)

    if (!Number.isNaN(date.getTime())) {
      const dateLabel = new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric"
      }).format(date)

      return `${dateLabel} ${timeLabel}`
    }
  }

  return `일정 확인 가능 ${timeLabel}`
}

export const getPublicClassCardScheduleSummaries = async (
  classIds: string[]
): Promise<Map<string, ClassCardScheduleSummary>> => {
  const uniqueClassIds = Array.from(new Set(classIds.filter(Boolean)))
  if (uniqueClassIds.length === 0) {
    return new Map()
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("class_schedules")
    .select("class_id, schedule_type, day_of_week, specific_date, start_time, display_label, sort_order, created_at")
    .in("class_id", uniqueClassIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error("failed_to_fetch_public_class_card_schedule_summaries")
  }

  const rows = (data ?? []) as ClassScheduleSummaryRow[]
  const rowsByClassId = new Map<string, ClassScheduleSummaryRow[]>()

  for (const row of rows) {
    const current = rowsByClassId.get(row.class_id) ?? []
    current.push(row)
    rowsByClassId.set(row.class_id, current)
  }

  return new Map(
    uniqueClassIds.map((classId) => {
      const schedules = rowsByClassId.get(classId) ?? []

      if (schedules.length === 0) {
        return [
          classId,
          {
            classId,
            summaryLabel: "예약 가능 일정 확인"
          }
        ]
      }

      const [firstSchedule] = schedules
      const firstLabel = formatScheduleSummaryLabel(firstSchedule)
      const summaryLabel =
        schedules.length > 1 ? `${firstLabel} 외 ${schedules.length - 1}개 일정` : firstLabel

      return [
        classId,
        {
          classId,
          summaryLabel
        }
      ]
    })
  )
}
