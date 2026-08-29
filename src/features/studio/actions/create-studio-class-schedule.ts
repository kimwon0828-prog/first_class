"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"

export type CreateStudioClassScheduleActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: CreateStudioClassScheduleActionState = {
  status: "idle",
  message: ""
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function createStudioClassScheduleAction(
  previousState: CreateStudioClassScheduleActionState = defaultState,
  formData: FormData
): Promise<CreateStudioClassScheduleActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()
  const classId = String(formData.get("classId") ?? "").trim()
  const specificDate = String(formData.get("specificDate") ?? "").trim()
  const startTime = String(formData.get("startTime") ?? "").trim()
  const endTime = String(formData.get("endTime") ?? "").trim()
  const capacity = Number(String(formData.get("capacity") ?? "").trim())

  if (!uuidPattern.test(classId)) {
    return { status: "error", message: "수업을 선택해 주세요." }
  }

  if (!specificDate || !startTime || !endTime || !Number.isInteger(capacity)) {
    return { status: "error", message: "날짜, 시간, 정원을 모두 입력해 주세요." }
  }

  try {
    await dataAdapter.createStudioClassSchedule({
      organizationId: teacher.organizationId,
      classId,
      // 담당 선생님은 로그인 actor 가 아니라 classes.teacher_id 가 canonical source 다.
      // null 을 넘기면 adapter 가 해당 수업의 teacher_id 로 폴백한다.
      teacherId: null,
      specificDate,
      startTime,
      endTime,
      capacity
    })

    revalidatePath("/studio")
    revalidatePath("/studio/schedule")
    revalidatePath("/classes")
    revalidatePath(`/classes/${classId}`)
    revalidatePath(`/classes/${classId}/apply`)

    return { status: "success", message: "일정을 추가했습니다." }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "일정 추가에 실패했습니다."
    }
  }
}
