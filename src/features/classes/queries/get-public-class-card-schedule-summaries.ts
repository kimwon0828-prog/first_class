import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

type ClassCardScheduleSummary = {
  classId: string
  summaryLabel: string
}

type ClassScheduleSummaryRow = {
  class_id: string
  schedule_type: "weekly" | "one_time"
  booking_status: "open" | "closed" | "hidden" | null
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
  const timeLabel = formatTimeLabel(row.start_time)

  if (row.specific_date) {
    const date = new Date(`${row.specific_date}T00:00:00`)

    if (!Number.isNaN(date.getTime())) {
      const month = date.getMonth() + 1
      const day = date.getDate()
      const weekday = weekdayLabels[date.getDay()]

      return `${month}/${day}(${weekday}) ${timeLabel}`
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
    .select(
      "class_id, schedule_type, booking_status, day_of_week, specific_date, start_time, display_label, sort_order, created_at"
    )
    .in("class_id", uniqueClassIds)
    .neq("booking_status", "hidden")
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

      const datedSchedules = schedules
        .filter((schedule) => Boolean(schedule.specific_date))
        .sort((left, right) => {
          const leftDateTime = `${left.specific_date ?? ""}T${left.start_time}`
          const rightDateTime = `${right.specific_date ?? ""}T${right.start_time}`
          return leftDateTime.localeCompare(rightDateTime)
        })

      const preferredSchedule = datedSchedules[0] ?? schedules[0]
      const summaryLabel = formatScheduleSummaryLabel(preferredSchedule)

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
