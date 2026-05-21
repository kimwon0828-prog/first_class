"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"

export type ToggleStudioClassActiveActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: ToggleStudioClassActiveActionState = {
  status: "idle",
  message: ""
}

export async function toggleStudioClassActiveAction(
  classId: string,
  nextIsActive: boolean,
  previousState: ToggleStudioClassActiveActionState = defaultState
): Promise<ToggleStudioClassActiveActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()

  try {
    await dataAdapter.updateStudioClassActive(classId, teacher.organizationId, nextIsActive)
    revalidatePath("/studio")
    revalidatePath("/studio/classes")
    revalidatePath("/classes")

    return {
      status: "success",
      message: nextIsActive ? "수업을 공개 상태로 전환했습니다." : "수업을 비공개 상태로 전환했습니다."
    }
  } catch {
    return {
      status: "error",
      message: "공개 상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}

export async function submitToggleStudioClassActiveAction(formData: FormData): Promise<void> {
  const classId = String(formData.get("classId") ?? "").trim()
  const nextIsActive = String(formData.get("nextIsActive") ?? "") === "true"

  if (!classId) {
    return
  }

  await toggleStudioClassActiveAction(classId, nextIsActive)
}
