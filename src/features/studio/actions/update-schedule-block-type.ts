"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"
import type { StudioScheduleBlockType } from "@/shared/lib/db/adapter"

export type UpdateScheduleBlockTypeActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: UpdateScheduleBlockTypeActionState = {
  status: "idle",
  message: ""
}

export async function updateScheduleBlockTypeAction(
  scheduleBlockId: string,
  nextType: Extract<StudioScheduleBlockType, "available" | "blocked">,
  previousState: UpdateScheduleBlockTypeActionState = defaultState
): Promise<UpdateScheduleBlockTypeActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()

  try {
    await dataAdapter.updateStudioScheduleBlockType({
      scheduleBlockId,
      teacherId: teacher.teacherId,
      nextType
    })

    revalidatePath("/studio")
    revalidatePath("/studio/schedule")
    revalidatePath("/classes")

    return {
      status: "success",
      message:
        nextType === "blocked"
          ? "시간대를 blocked 상태로 전환했습니다."
          : "시간대를 available 상태로 복원했습니다."
    }
  } catch {
    return {
      status: "error",
      message: "시간대 상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}

export async function submitUpdateScheduleBlockTypeAction(formData: FormData): Promise<void> {
  const scheduleBlockId = String(formData.get("scheduleBlockId") ?? "").trim()
  const nextTypeRaw = String(formData.get("nextType") ?? "").trim()

  if (!scheduleBlockId || (nextTypeRaw !== "available" && nextTypeRaw !== "blocked")) {
    return
  }

  await updateScheduleBlockTypeAction(scheduleBlockId, nextTypeRaw)
}
