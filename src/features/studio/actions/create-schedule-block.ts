"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"

export type CreateScheduleBlockActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: CreateScheduleBlockActionState = {
  status: "idle",
  message: ""
}

const buildLocalIso = (date: string, time: string) => {
  const value = new Date(`${date}T${time}`)
  if (Number.isNaN(value.getTime())) {
    return null
  }

  return value.toISOString()
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function createScheduleBlockAction(
  previousState: CreateScheduleBlockActionState = defaultState,
  formData: FormData
): Promise<CreateScheduleBlockActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()
  const classIdRaw = String(formData.get("classId") ?? "").trim()
  const date = String(formData.get("date") ?? "").trim()
  const startTime = String(formData.get("startTime") ?? "").trim()
  const endTime = String(formData.get("endTime") ?? "").trim()
  const capacityRaw = String(formData.get("capacity") ?? "").trim()

  if (!classIdRaw || !uuidPattern.test(classIdRaw)) {
    return { status: "error", message: "연결할 프로그램을 선택해 주세요." }
  }

  if (!date || !startTime || !endTime) {
    return { status: "error", message: "날짜와 시작/종료 시간을 모두 입력해 주세요." }
  }

  if (!/^\d+$/.test(capacityRaw)) {
    return { status: "error", message: "정원은 숫자로 입력해 주세요." }
  }

  const capacity = Number(capacityRaw)
  if (capacity < 1) {
    return { status: "error", message: "정원은 1명 이상이어야 합니다." }
  }

  const startAt = buildLocalIso(date, startTime)
  const endAt = buildLocalIso(date, endTime)
  if (!startAt || !endAt) {
    return { status: "error", message: "입력한 날짜 또는 시간이 올바르지 않습니다." }
  }

  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    return { status: "error", message: "종료 시간은 시작 시간보다 뒤여야 합니다." }
  }

  if (new Date(startAt).getTime() <= Date.now()) {
    return { status: "error", message: "지난 시간대는 생성할 수 없습니다." }
  }

  try {
    const studioClasses = await dataAdapter.listStudioClasses(teacher.organizationId)
    const selectedClass = studioClasses.find((item) => item.id === classIdRaw) ?? null
    if (!selectedClass || selectedClass.teacherId !== teacher.teacherId) {
      return { status: "error", message: "연결할 프로그램 권한을 확인할 수 없습니다." }
    }

    await dataAdapter.createStudioScheduleBlock({
      teacherId: teacher.teacherId,
      classId: classIdRaw,
      startAt,
      endAt,
      capacity
    })

    revalidatePath("/studio")
    revalidatePath("/studio/schedule")
    revalidatePath("/classes")
    revalidatePath(`/classes/${classIdRaw}`)
    revalidatePath(`/classes/${classIdRaw}/apply`)

    return {
      status: "success",
      message: "예약 가능 시간대를 생성했습니다."
    }
  } catch {
    return {
      status: "error",
      message: "시간대 생성에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
