"use server"

import { revalidatePath } from "next/cache"

import { isAcademyArea } from "@/shared/config/academy-areas"
import {
  studioClassGradeAgeOrder,
  studioClassProgramTypeOptions,
  studioClassSubjectOptions
} from "@/features/studio/lib/studio-class-options"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"
import type { ClassProgramType } from "@/shared/lib/db/adapter"

type StudioClassScheduleInput = {
  id?: string
  scheduleType: "weekly" | "one_time"
  dayOfWeek: number | null
  specificDate: string | null
  startTime: string
  endTime: string
  capacity: number | null
  displayLabel: string | null
  sortOrder: number
}

export type UpsertStudioClassActionState = {
  ok: boolean
  message: string
  debugMessage?: string
}

const defaultState: UpsertStudioClassActionState = {
  ok: false,
  message: ""
}

const sanitizeScheduleSlotsForLog = (slots: StudioClassScheduleInput[]) =>
  slots.map((slot) => ({
    id: slot.id ?? null,
    scheduleType: slot.scheduleType,
    dayOfWeek: slot.dayOfWeek,
    specificDate: slot.specificDate,
    startTime: slot.startTime,
    endTime: slot.endTime,
    capacity: slot.capacity,
    displayLabel: slot.displayLabel,
    sortOrder: slot.sortOrder
  }))

const parsePositiveInt = (value: string) => {
  if (!/^\d+$/.test(value)) {
    return null
  }

  return Number(value)
}

const studioClassSubjectSet = new Set<string>(studioClassSubjectOptions)
const studioClassProgramTypeSet = new Set<string>(
  studioClassProgramTypeOptions.map((option) => option.value)
)

const normalizeClassId = (value: FormDataEntryValue | null) => {
  const rawClassId = String(value ?? "").trim()
  if (!rawClassId) {
    return null
  }

  if (rawClassId === "undefined" || rawClassId === "null") {
    return null
  }

  return rawClassId
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isValidUuid = (value: string | null | undefined) => {
  return Boolean(value && uuidPattern.test(value))
}

const normalizeMode = (value: FormDataEntryValue | null): "create" | "update" | null => {
  const rawMode = String(value ?? "").trim()
  if (rawMode === "create" || rawMode === "update") {
    return rawMode
  }

  return null
}

const isValidDateString = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}

const isValidTimeString = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

const weekdayLabels = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"] as const

const formatSpecificDateLabel = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const [year, month, day] = value.split("-")
  return `${year}.${month}.${day}`
}

const buildDefaultDisplayLabel = (slot: {
  scheduleType: "weekly" | "one_time"
  dayOfWeek: number | null
  specificDate: string | null
  startTime: string
  endTime: string
}) => {
  if (slot.scheduleType === "weekly") {
    const weekdayLabel =
      slot.dayOfWeek != null && weekdayLabels[slot.dayOfWeek] ? weekdayLabels[slot.dayOfWeek] : null

    if (!weekdayLabel) {
      return null
    }

    return `매주 ${weekdayLabel} ${slot.startTime}~${slot.endTime}`
  }

  if (!slot.specificDate) {
    return null
  }

  return `${formatSpecificDateLabel(slot.specificDate)} ${slot.startTime}~${slot.endTime}`
}

const parseScheduleSlots = (
  formData: FormData
):
  | { ok: true; slots: StudioClassScheduleInput[] }
  | { ok: false; message: string } => {
  const ids = formData.getAll("slotId").map((value) => String(value ?? "").trim())
  const scheduleTypes = formData
    .getAll("slotScheduleType")
    .map((value) => String(value ?? "").trim())
  const dayOfWeeks = formData.getAll("slotDayOfWeek").map((value) => String(value ?? "").trim())
  const specificDates = formData
    .getAll("slotSpecificDate")
    .map((value) => String(value ?? "").trim())
  const startTimes = formData.getAll("slotStartTime").map((value) => String(value ?? "").trim())
  const endTimes = formData.getAll("slotEndTime").map((value) => String(value ?? "").trim())
  const capacities = formData.getAll("slotCapacity").map((value) => String(value ?? "").trim())
  const displayLabels = formData
    .getAll("slotDisplayLabel")
    .map((value) => String(value ?? "").trim())

  if (
    ids.length === 0 &&
    scheduleTypes.length === 0 &&
    dayOfWeeks.length === 0 &&
    specificDates.length === 0 &&
    startTimes.length === 0 &&
    endTimes.length === 0 &&
    capacities.length === 0 &&
    displayLabels.length === 0
  ) {
    return { ok: true, slots: [] }
  }

  if (
    ids.length !== scheduleTypes.length ||
    dayOfWeeks.length !== scheduleTypes.length ||
    specificDates.length !== scheduleTypes.length ||
    startTimes.length !== scheduleTypes.length ||
    endTimes.length !== scheduleTypes.length ||
    capacities.length !== scheduleTypes.length ||
    displayLabels.length !== scheduleTypes.length
  ) {
    return { ok: false, message: "예약 가능 시간 입력값을 다시 확인해 주세요." }
  }

  const slots: StudioClassScheduleInput[] = []
  for (let index = 0; index < scheduleTypes.length; index += 1) {
    const id = ids[index]
    const scheduleType = scheduleTypes[index]
    const dayOfWeekRaw = dayOfWeeks[index]
    const specificDateRaw = specificDates[index]
    const startTime = startTimes[index]
    const endTime = endTimes[index]
    const capacityRaw = capacities[index]
    const displayLabelRaw = displayLabels[index]

    if (scheduleType !== "weekly" && scheduleType !== "one_time") {
      return { ok: false, message: `예약 가능 시간 ${index + 1}의 유형을 선택해 주세요.` }
    }

    if (!startTime || !endTime || !isValidTimeString(startTime) || !isValidTimeString(endTime)) {
      return { ok: false, message: `예약 가능 시간 ${index + 1}의 시작/종료 시간을 정확히 입력해 주세요.` }
    }

    if (endTime <= startTime) {
      return { ok: false, message: `예약 가능 시간 ${index + 1}의 종료 시간은 시작 시간보다 뒤여야 합니다.` }
    }

    let capacity: number | null = null
    if (capacityRaw) {
      capacity = parsePositiveInt(capacityRaw)
      if (capacity == null || capacity < 1) {
        return { ok: false, message: `예약 가능 시간 ${index + 1}의 정원은 1명 이상이어야 합니다.` }
      }
    }

    if (scheduleType === "weekly") {
      if (!/^\d+$/.test(dayOfWeekRaw)) {
        return { ok: false, message: `예약 가능 시간 ${index + 1}의 요일을 선택해 주세요.` }
      }

      const dayOfWeek = Number(dayOfWeekRaw)
      if (dayOfWeek < 0 || dayOfWeek > 6) {
        return { ok: false, message: `예약 가능 시간 ${index + 1}의 요일을 다시 선택해 주세요.` }
      }

      slots.push({
        id: isValidUuid(id) ? id : undefined,
        scheduleType,
        dayOfWeek,
        specificDate: null,
        startTime,
        endTime,
        capacity,
        displayLabel:
          displayLabelRaw ||
          buildDefaultDisplayLabel({
            scheduleType,
            dayOfWeek,
            specificDate: null,
            startTime,
            endTime
          }),
        sortOrder: index
      })

      continue
    }

    if (!specificDateRaw || !isValidDateString(specificDateRaw)) {
      return { ok: false, message: `예약 가능 시간 ${index + 1}의 날짜를 정확히 입력해 주세요.` }
    }

    slots.push({
      id: isValidUuid(id) ? id : undefined,
      scheduleType,
      dayOfWeek: null,
      specificDate: specificDateRaw,
      startTime,
      endTime,
      capacity,
      displayLabel:
        displayLabelRaw ||
        buildDefaultDisplayLabel({
          scheduleType,
          dayOfWeek: null,
          specificDate: specificDateRaw,
          startTime,
          endTime
        }),
      sortOrder: index
    })
  }

  return { ok: true, slots }
}

export async function upsertStudioClassAction(
  previousState: UpsertStudioClassActionState = defaultState,
  formData: FormData
): Promise<UpsertStudioClassActionState> {
  void previousState
  const safeError = (message: string, debugMessage?: string): UpsertStudioClassActionState => ({
    ok: false,
    message,
    debugMessage
  })

  const parseSupabaseErrorSummary = (raw: string) => {
    const readValue = (key: string) => {
      const match = raw.match(new RegExp(`${key}=([^|]*)`))
      return match?.[1]?.trim() ?? null
    }

    const code = readValue("code")
    const details = readValue("details")
    const hint = readValue("hint")

    return { code, details, hint }
  }

  try {
    const teacher = await requireTeacherStudioAccess()
    const mode = normalizeMode(formData.get("mode"))
    const requestedClassId = normalizeClassId(formData.get("classId"))
    const classId = mode === "update" ? requestedClassId : null
    const programTypeRaw = String(formData.get("programType") ?? "").trim()
    const programType = studioClassProgramTypeSet.has(programTypeRaw)
      ? (programTypeRaw as ClassProgramType)
      : null
    const title = String(formData.get("title") ?? "").trim()
    const subject = String(formData.get("subject") ?? "").trim()
    const targetAgeStart = String(formData.get("targetAgeStart") ?? "").trim()
    const targetAgeEnd = String(formData.get("targetAgeEnd") ?? "").trim()
    const regionRaw = String(formData.get("region") ?? "").trim()
    const description = String(formData.get("description") ?? "").trim()
    const classFormatRaw = String(formData.get("classFormat") ?? "").trim()
    const recommendedForRaw = String(formData.get("recommendedFor") ?? "").trim()
    const experiencePointsRaw = String(formData.get("experiencePoints") ?? "").trim()
    const curriculumRaw = String(formData.get("curriculum") ?? "").trim()
    const teacherIntroRaw = String(formData.get("teacherIntro") ?? "").trim()
    const selectedTeacherId = String(formData.get("teacherId") ?? "").trim()
    const trialPriceRaw = String(formData.get("trialPrice") ?? "").trim()
    const coverImageUrlRaw = String(formData.get("coverImageUrl") ?? "").trim()
    const isActive = String(formData.get("isActive") ?? "") === "on"
    const organizationId = teacher.organizationId

    const startOrder = studioClassGradeAgeOrder.get(targetAgeStart)
    const endOrder = studioClassGradeAgeOrder.get(targetAgeEnd)
    const trialPrice = parsePositiveInt(trialPriceRaw)
    const targetAge =
      startOrder != null && endOrder != null && targetAgeStart === targetAgeEnd
        ? targetAgeStart
        : `${targetAgeStart}~${targetAgeEnd}`
    const classFormat = classFormatRaw ? classFormatRaw : null
    const recommendedFor = recommendedForRaw ? recommendedForRaw : null
    const experiencePoints = experiencePointsRaw ? experiencePointsRaw : null
    const curriculum = curriculumRaw ? curriculumRaw : null
    const teacherIntro = teacherIntroRaw ? teacherIntroRaw : null

    if (!mode) {
      return safeError("저장 모드를 확인할 수 없습니다. 다시 시도해 주세요.")
    }

    if (mode === "update" && !isValidUuid(classId)) {
      return safeError("수정할 프로그램 정보를 확인할 수 없습니다.")
    }

    if (!programType) {
      return safeError("프로그램 유형을 선택해 주세요.")
    }

    if (title.length < 2) {
      return safeError("프로그램명은 2자 이상 입력해 주세요.")
    }

    if (!subject) {
      return safeError("과목을 선택해 주세요.")
    }

    if (!studioClassSubjectSet.has(subject)) {
      return safeError("과목 칩에서 과목을 다시 선택해 주세요.")
    }

    if (startOrder == null || endOrder == null) {
      return safeError("대상 학년/연령 범위를 선택해 주세요.")
    }

    if (endOrder < startOrder) {
      return safeError("끝 학년/연령은 시작 값보다 앞설 수 없습니다.")
    }

    if (!isAcademyArea(regionRaw)) {
      return safeError("학원가를 다시 선택해 주세요.")
    }

    if (description.length < 10) {
      return safeError("프로그램 소개는 10자 이상 입력해 주세요.")
    }

    if (trialPrice == null || trialPrice < 0) {
      return safeError("신청비는 0원 이상의 숫자로 입력해 주세요.")
    }

    if (!organizationId) {
      return safeError("소속 기관 정보를 확인할 수 없습니다.")
    }

    if (!selectedTeacherId || !isValidUuid(selectedTeacherId)) {
      return safeError("담당 선생님을 선택해주세요.")
    }

    const studioClasses = await (async () => {
      if (!(mode === "update" && classId)) {
        return []
      }
      try {
        return await dataAdapter.listStudioClasses(organizationId)
      } catch (error) {
        console.error("[upsertStudioClass] failed to load studio classes", {
          organizationId,
          message: error instanceof Error ? error.message : "unknown_error"
        })
        return []
      }
    })()
    const existingClass =
      mode === "update" && classId ? studioClasses.find((item) => item.id === classId) : null

    if (mode === "update" && classId && !existingClass) {
      return { ok: false, message: "프로그램 정보를 찾을 수 없거나 수정 권한이 없습니다." }
    }

    const teacherOptions = await (async () => {
      try {
        return await dataAdapter.listStudioTeacherOptions(organizationId)
      } catch (error) {
        console.error("[upsertStudioClass] failed to load teacher options", {
          organizationId,
          message: error instanceof Error ? error.message : "unknown_error"
        })
        return []
      }
    })()
    let selectedTeacher = teacherOptions.find((option) => option.teacherId === selectedTeacherId)

    if (!selectedTeacher && existingClass && existingClass.teacherId === selectedTeacherId) {
      selectedTeacher = {
        teacherId: selectedTeacherId,
        teacherName: existingClass.teacherDisplayName ?? existingClass.teacherName ?? "이름 미정"
      }
    }

    if (!selectedTeacher) {
      return safeError(
        "등록 가능한 선생님 프로필이 없어요. 먼저 선생님 프로필을 추가해주세요."
      )
    }

    let coverImageUrl = existingClass?.coverImageUrl ?? null
    if (mode === "create") {
      coverImageUrl = coverImageUrlRaw ? coverImageUrlRaw : null
    } else if (coverImageUrlRaw) {
      coverImageUrl = coverImageUrlRaw
    }

    const parsedSlots = parseScheduleSlots(formData)
    if (!parsedSlots.ok) {
      console.error("[upsertStudioClass validation failed]", {
        stage: "class_schedule_validation_failed",
        mode,
        classId,
        organizationId,
        teacherId: selectedTeacherId,
        message: parsedSlots.message
      })
      return safeError(parsedSlots.message, "class_schedule_validation_failed")
    }

    const scheduleSlots = parsedSlots.slots
    const payloadLog = {
      mode,
      classId: classId ?? null,
      organizationId,
      teacherId: selectedTeacher.teacherId,
      isActive,
      programType,
      title,
      subject,
      targetAge,
      region: regionRaw,
      trialPrice,
      scheduleSlots: sanitizeScheduleSlotsForLog(scheduleSlots)
    }

    console.info("[upsertStudioClass payload]", payloadLog)

    const payload = {
      mode,
      classId: classId ?? undefined,
      organizationId,
      programType,
      title,
      subject,
      targetAge,
      region: regionRaw,
      description,
      classFormat,
      recommendedFor,
      experiencePoints,
      curriculum,
      teacherIntro,
      trialPrice,
      teacherId: selectedTeacher.teacherId,
      teacherDisplayName: selectedTeacher.teacherName,
      coverImageUrl,
      isActive,
      scheduleSlots
    }

    let savedClass: Awaited<ReturnType<typeof dataAdapter.upsertStudioClass>>
    try {
      savedClass = await dataAdapter.upsertStudioClass(
        payload as unknown as Parameters<typeof dataAdapter.upsertStudioClass>[0]
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error"
      const summary = parseSupabaseErrorSummary(message)
      console.error("[upsertStudioClass failed]", {
        message,
        code: summary.code,
        details: summary.details,
        hint: summary.hint,
        payload: payloadLog
      })
      return safeError("수업을 저장하지 못했어요. 잠시 후 다시 시도해주세요.", message)
    }

    revalidatePath("/studio")
    revalidatePath("/studio/classes")
    revalidatePath("/classes")
    revalidatePath(`/classes/${savedClass.id}`)
    revalidatePath(`/classes/${savedClass.id}/apply`)

    return {
      ok: true,
      message:
        classId ? "프로그램 정보를 수정했습니다." : "새 프로그램과 예약 가능 시간을 등록했습니다."
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"
    if (message.includes("invalid_teacher_for_organization")) {
      console.error("[upsertStudioClass failed]", { message })
      return safeError("프로그램 저장 권한을 확인할 수 없습니다.", message)
    }

    if (message.includes("studio_class_not_found_or_forbidden")) {
      console.error("[upsertStudioClass failed]", { message })
      return safeError("프로그램 정보를 찾을 수 없거나 수정 권한이 없습니다.", message)
    }

    console.error("[upsertStudioClass failed]", { message })
    return safeError("프로그램 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.", message)
  }
}
