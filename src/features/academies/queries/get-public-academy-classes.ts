import "server-only"

import {
  loadSubjectMasterMapsByIdsWithClient
} from "@/features/subjects/queries/get-subject-master"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import {
  buildClassSubjectReadModel,
  formatClassSubjectDisplayLabel,
  type Subject,
  type SubjectCategory
} from "@/shared/lib/subject-master"

type PublicAcademyClassRow = {
  id: string
  title: string
  subject_category_id: string | null
  subject_id: string | null
  subject: string
  target_age: string
  program_type: "trial_class" | "level_test"
  subject_category_master?: SubjectCategory | null
  subject_master?: Subject | null
}

type ClassScheduleRow = {
  class_id: string
  schedule_type: "weekly" | "one_time"
  booking_status: "open" | "closed" | "hidden" | null
  day_of_week: number | null
  specific_date: string | null
  start_time: string
  end_time: string
  sort_order: number | null
  created_at: string | null
}

export type PublicAcademyClassCardItem = {
  id: string
  title: string
  subjectLabel: string
  targetAgeLabel: string
  programTypeLabel: string
  periodLabel: string
  periodTone: "ongoing" | "limited" | "undetermined"
  scheduleLabel: string
}

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const
const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })

const toTimeLabel = (value: string) => value.slice(0, 5)

const toDateLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${date.getMonth() + 1}/${date.getDate()}(${weekdayLabels[date.getDay()]})`
}

const toPeriodDateLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
}

const compareScheduleRows = (left: ClassScheduleRow, right: ClassScheduleRow) => {
  const leftSort = left.sort_order ?? Number.MAX_SAFE_INTEGER
  const rightSort = right.sort_order ?? Number.MAX_SAFE_INTEGER
  if (leftSort !== rightSort) {
    return leftSort - rightSort
  }

  const leftDate = `${left.specific_date ?? "9999-12-31"} ${left.start_time}`
  const rightDate = `${right.specific_date ?? "9999-12-31"} ${right.start_time}`
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate)
  }

  return (left.created_at ?? "").localeCompare(right.created_at ?? "")
}

const buildWeeklyScheduleLabel = (schedules: ClassScheduleRow[]) => {
  const labels = schedules
    .filter((schedule) => schedule.day_of_week != null)
    .sort((left, right) => {
      const leftDay = left.day_of_week ?? 99
      const rightDay = right.day_of_week ?? 99
      if (leftDay !== rightDay) {
        return leftDay - rightDay
      }

      return left.start_time.localeCompare(right.start_time)
    })
    .map((schedule) => {
      const day = schedule.day_of_week ?? 0
      return `${weekdayLabels[day]} ${toTimeLabel(schedule.start_time)}-${toTimeLabel(schedule.end_time)}`
    })

  return Array.from(new Set(labels)).join(" · ") || "요일·시간 확인 필요"
}

const buildOneTimeScheduleLabel = (schedules: ClassScheduleRow[]) => {
  const sortedSchedules = [...schedules]
    .filter((schedule) => Boolean(schedule.specific_date))
    .sort(compareScheduleRows)

  if (sortedSchedules.length === 0) {
    return "요일·시간 확인 필요"
  }

  const previewLabels = sortedSchedules.slice(0, 3).map((schedule) => {
    return `${toDateLabel(schedule.specific_date ?? "")} ${toTimeLabel(schedule.start_time)}-${toTimeLabel(schedule.end_time)}`
  })

  if (sortedSchedules.length <= 3) {
    return previewLabels.join(" · ")
  }

  return `${previewLabels.join(" · ")} 외 ${sortedSchedules.length - 3}회`
}

const resolveProgramTypeLabel = (value: PublicAcademyClassRow["program_type"]) =>
  value === "level_test" ? "레벨테스트" : "체험수업"

const buildPeriodSummary = (schedules: ClassScheduleRow[]) => {
  const weeklySchedules = schedules.filter((schedule) => schedule.schedule_type === "weekly")
  if (weeklySchedules.length > 0) {
    return {
      periodLabel: "상시 운영",
      periodTone: "ongoing" as const,
      scheduleLabel: buildWeeklyScheduleLabel(weeklySchedules),
      isEnded: false
    }
  }

  const datedSchedules = schedules.filter((schedule) => schedule.schedule_type === "one_time" && schedule.specific_date)
  if (datedSchedules.length === 0) {
    return {
      periodLabel: "기간 정보 준비 중",
      periodTone: "undetermined" as const,
      scheduleLabel: "요일·시간 확인 필요",
      isEnded: false
    }
  }

  const specificDates = datedSchedules
    .map((schedule) => schedule.specific_date ?? "")
    .filter((value): value is string => Boolean(value))
    .sort()

  const firstDate = specificDates[0]
  const lastDate = specificDates[specificDates.length - 1]
  const periodLabel =
    firstDate === lastDate
      ? `${toPeriodDateLabel(firstDate)} 하루 일정`
      : `${toPeriodDateLabel(firstDate)} - ${toPeriodDateLabel(lastDate)}`

  return {
    periodLabel,
    periodTone: "limited" as const,
    scheduleLabel: buildOneTimeScheduleLabel(datedSchedules),
    isEnded: lastDate < todayKey
  }
}

export const getPublicAcademyClasses = async (organizationId: string): Promise<PublicAcademyClassCardItem[]> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data: classesData, error: classesError } = await serviceRoleClient
    .from("classes")
    .select("id, title, subject_category_id, subject_id, subject, target_age, program_type")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (classesError) {
    throw new Error("failed_to_fetch_public_academy_classes")
  }

  const rawClassRows = ((classesData ?? []) as PublicAcademyClassRow[]) ?? []
  const { categoryById, subjectById } = await loadSubjectMasterMapsByIdsWithClient(
    serviceRoleClient,
    rawClassRows
      .map((row) => row.subject_category_id)
      .filter((categoryId): categoryId is string => Boolean(categoryId)),
    rawClassRows
      .map((row) => row.subject_id)
      .filter((subjectId): subjectId is string => Boolean(subjectId))
  )
  const classRows = rawClassRows.map((row) => ({
    ...row,
    subject_category_master: row.subject_category_id
      ? categoryById.get(row.subject_category_id) ?? null
      : null,
    subject_master: row.subject_id ? subjectById.get(row.subject_id) ?? null : null
  }))
  if (classRows.length === 0) {
    return []
  }

  const classIds = classRows.map((row) => row.id)
  const { data: schedulesData, error: schedulesError } = await serviceRoleClient
    .from("class_schedules")
    .select("class_id, schedule_type, booking_status, day_of_week, specific_date, start_time, end_time, sort_order, created_at")
    .in("class_id", classIds)
    .neq("booking_status", "hidden")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (schedulesError) {
    throw new Error("failed_to_fetch_public_academy_class_schedules")
  }

  const schedulesByClassId = new Map<string, ClassScheduleRow[]>()
  for (const row of (schedulesData ?? []) as ClassScheduleRow[]) {
    const current = schedulesByClassId.get(row.class_id) ?? []
    current.push(row)
    schedulesByClassId.set(row.class_id, current)
  }

  return classRows
    .map((row) => {
      const summary = buildPeriodSummary(schedulesByClassId.get(row.id) ?? [])
      return {
        id: row.id,
        title: row.title,
        subjectLabel: formatClassSubjectDisplayLabel({
          subject: row.subject,
          ...buildClassSubjectReadModel({
            subjectCategoryId: row.subject_category_id,
            masterCategory: row.subject_category_master,
            subjectId: row.subject_id,
            masterSubject: row.subject_master
          })
        }),
        targetAgeLabel: formatStoredTargetGrades(row.target_age),
        programTypeLabel: resolveProgramTypeLabel(row.program_type),
        periodLabel: summary.periodLabel,
        periodTone: summary.periodTone,
        scheduleLabel: summary.scheduleLabel,
        isEnded: summary.isEnded
      }
    })
    .filter((row) => !row.isEnded)
    .map((row) => ({
      id: row.id,
      title: row.title,
      subjectLabel: row.subjectLabel,
      targetAgeLabel: row.targetAgeLabel,
      programTypeLabel: row.programTypeLabel,
      periodLabel: row.periodLabel,
      periodTone: row.periodTone,
      scheduleLabel: row.scheduleLabel
    }))
}
