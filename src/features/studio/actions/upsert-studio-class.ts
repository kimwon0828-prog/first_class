"use server"

import { revalidatePath } from "next/cache"

import {
  studioClassGradeAgeOrder,
  studioClassProgramTypeOptions,
  studioClassSubjectOptions
} from "@/features/studio/lib/studio-class-options"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"
import type { ClassProgramType, StudioClassScheduleSlotInput } from "@/shared/lib/db/adapter"

export type UpsertStudioClassActionState = {
  ok: boolean
  message: string
}

const defaultState: UpsertStudioClassActionState = {
  ok: false,
  message: ""
}

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

const normalizeImageUrl = (value: string) => {
  if (!value) {
    return null
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }

    return parsed.toString()
  } catch {
    return null
  }
}

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

const normalizeMode = (value: FormDataEntryValue | null) => {
  const rawMode = String(value ?? "").trim()
  if (rawMode === "create" || rawMode === "update") {
    return rawMode
  }

  return null
}

const buildLocalIso = (date: string, time: string) => {
  const value = new Date(`${date}T${time}`)
  if (Number.isNaN(value.getTime())) {
    return null
  }

  return value.toISOString()
}

const parseScheduleSlots = (
  formData: FormData,
  mode: "create" | "update"
):
  | { ok: true; slots: StudioClassScheduleSlotInput[] }
  | { ok: false; message: string } => {
  if (mode === "update") {
    return { ok: true, slots: [] }
  }

  const dates = formData.getAll("slotDate").map((value) => String(value ?? "").trim())
  const startTimes = formData.getAll("slotStartTime").map((value) => String(value ?? "").trim())
  const endTimes = formData.getAll("slotEndTime").map((value) => String(value ?? "").trim())
  const capacities = formData.getAll("slotCapacity").map((value) => String(value ?? "").trim())

  if (
    dates.length === 0 ||
    startTimes.length !== dates.length ||
    endTimes.length !== dates.length ||
    capacities.length !== dates.length
  ) {
    return { ok: false, message: "체험 가능 시간을 1개 이상 정확히 입력해 주세요." }
  }

  const slots: StudioClassScheduleSlotInput[] = []
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index]
    const startTime = startTimes[index]
    const endTime = endTimes[index]
    const capacityRaw = capacities[index]

    if (!date || !startTime || !endTime || !capacityRaw) {
      return { ok: false, message: `체험 가능 시간 ${index + 1}의 날짜, 시간, 정원을 모두 입력해 주세요.` }
    }

    const capacity = parsePositiveInt(capacityRaw)
    if (capacity == null || capacity < 1) {
      return { ok: false, message: `체험 가능 시간 ${index + 1}의 정원은 1명 이상이어야 합니다.` }
    }

    const startAt = buildLocalIso(date, startTime)
    const endAt = buildLocalIso(date, endTime)
    if (!startAt || !endAt) {
      return { ok: false, message: `체험 가능 시간 ${index + 1}의 날짜 또는 시간이 올바르지 않습니다.` }
    }

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return { ok: false, message: `체험 가능 시간 ${index + 1}의 종료 시간은 시작 시간보다 뒤여야 합니다.` }
    }

    if (new Date(startAt).getTime() <= Date.now()) {
      return { ok: false, message: `체험 가능 시간 ${index + 1}에 과거 시간대는 저장할 수 없습니다.` }
    }

    slots.push({
      startAt,
      endAt,
      capacity
    })
  }

  return { ok: true, slots }
}

type UpsertStudioClassDebugPayload = {
  mode: "create" | "update" | null
  classId: string | null
  organizationId: string | null | undefined
  teacherId: string | null | undefined
  programType: ClassProgramType | null
  title: string
  subject: string
  targetAge: string
  region: string
  trialPriceRaw: string
  trialPrice: number | null
}

export async function upsertStudioClassAction(
  previousState: UpsertStudioClassActionState = defaultState,
  formData: FormData
): Promise<UpsertStudioClassActionState> {
  void previousState
  let debugPayload: UpsertStudioClassDebugPayload | null = null

  try {
    const teacher = await requireTeacherStudioAccess()
    const rawClassId = String(formData.get("classId") ?? "").trim()
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
    const region = String(formData.get("region") ?? "").trim()
    const description = String(formData.get("description") ?? "").trim()
    const teacherDisplayName = String(formData.get("teacherDisplayName") ?? "").trim()
    const trialPriceRaw = String(formData.get("trialPrice") ?? "").trim()
    const coverImageUrlRaw = String(formData.get("coverImageUrl") ?? "").trim()
    const isActive = String(formData.get("isActive") ?? "") === "on"
    const organizationId = teacher.organizationId
    const teacherId = teacher.teacherId

    const startOrder = studioClassGradeAgeOrder.get(targetAgeStart)
    const endOrder = studioClassGradeAgeOrder.get(targetAgeEnd)
    const trialPrice = parsePositiveInt(trialPriceRaw)
    const targetAge =
      startOrder != null && endOrder != null && targetAgeStart === targetAgeEnd
        ? targetAgeStart
        : `${targetAgeStart}~${targetAgeEnd}`
    debugPayload = {
      mode,
      classId,
      organizationId,
      teacherId,
      programType,
      title,
      subject,
      targetAge,
      region,
      trialPriceRaw,
      trialPrice
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("[studio-class:mode]", {
        mode,
        rawClassId,
        normalizedClassId: classId
      })
      if (mode === "create") {
        console.info("[studio-class:path:create]")
      } else if (mode === "update") {
        console.info("[studio-class:path:update]")
      }
      console.info("[studio-class:upsert:input]", debugPayload)
    }

    if (!mode) {
      return { ok: false, message: "저장 모드를 확인할 수 없습니다. 다시 시도해 주세요." }
    }

    if (mode === "update" && !isValidUuid(classId)) {
      return { ok: false, message: "수정할 수업 정보를 확인할 수 없습니다." }
    }

    if (!programType) {
      return { ok: false, message: "프로그램 유형을 선택해 주세요." }
    }

    if (title.length < 2) {
      return { ok: false, message: "수업명은 2자 이상 입력해 주세요." }
    }

    if (!subject) {
      return { ok: false, message: "과목을 선택해 주세요." }
    }

    if (!studioClassSubjectSet.has(subject)) {
      return { ok: false, message: "과목 칩에서 과목을 다시 선택해 주세요." }
    }

    if (startOrder == null || endOrder == null) {
      return { ok: false, message: "대상 학년/연령 범위를 선택해 주세요." }
    }

    if (endOrder < startOrder) {
      return { ok: false, message: "끝 학년/연령은 시작 값보다 앞설 수 없습니다." }
    }

    if (!region) {
      return { ok: false, message: "지역을 입력해 주세요." }
    }

    if (description.length < 10) {
      return { ok: false, message: "수업 소개는 10자 이상 입력해 주세요." }
    }

    if (trialPrice == null || trialPrice < 0) {
      return { ok: false, message: "체험비는 0원 이상의 숫자로 입력해 주세요." }
    }

    if (!organizationId) {
      return { ok: false, message: "소속 기관 정보를 확인할 수 없습니다." }
    }

    if (!teacherId) {
      return { ok: false, message: "담당 선생님을 확인할 수 없습니다." }
    }

    if (teacherDisplayName.length < 2) {
      return { ok: false, message: "담당 선생님명은 2자 이상 입력해 주세요." }
    }

    const coverImageUrl = normalizeImageUrl(coverImageUrlRaw)
    if (coverImageUrlRaw && !coverImageUrl) {
      return {
        ok: false,
        message: "대표 이미지는 http 또는 https로 시작하는 이미지 URL만 입력할 수 있습니다."
      }
    }

    const parsedSlots = parseScheduleSlots(formData, mode)
    if (!parsedSlots.ok) {
      return { ok: false, message: parsedSlots.message }
    }

    const savedClass = await dataAdapter.upsertStudioClass({
      mode,
      classId: classId ?? undefined,
      organizationId,
      programType,
      title,
      subject,
      targetAge,
      region,
      description,
      trialPrice,
      teacherId,
      teacherDisplayName,
      coverImageUrl,
      isActive,
      scheduleSlots: parsedSlots.slots
    })

    revalidatePath("/studio")
    revalidatePath("/studio/classes")
    revalidatePath("/classes")
    revalidatePath(`/classes/${savedClass.id}`)
    revalidatePath(`/classes/${savedClass.id}/apply`)

    return {
      ok: true,
      message:
        classId ? "프로그램 정보를 수정했습니다." : "새 프로그램과 가능 시간을 등록했습니다."
    }
  } catch (error) {
    const detailedMessage =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."

    if (process.env.NODE_ENV !== "production") {
      console.error("[studio-class:upsert:error]", {
        message: detailedMessage,
        payload: debugPayload
      })
    }

    return {
      ok: false,
      message:
        process.env.NODE_ENV !== "production"
          ? `수업 저장에 실패했습니다. ${detailedMessage}`
          : "수업 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
