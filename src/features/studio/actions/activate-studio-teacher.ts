"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"

export type ActivateStudioTeacherActionResult = {
  ok: boolean
  message: string
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function activateStudioTeacherAction(
  teacherId: string
): Promise<ActivateStudioTeacherActionResult> {
  try {
    const actor = await requireTeacherStudioAccess()
    const normalizedTeacherId = teacherId.trim()

    if (!uuidPattern.test(normalizedTeacherId)) {
      return { ok: false, message: "활성화할 선생님 정보를 확인할 수 없습니다." }
    }

    await dataAdapter.activateStudioTeacher({
      teacherId: normalizedTeacherId,
      organizationId: actor.organizationId,
      actorProfileId: actor.id
    })

    revalidatePath("/studio")
    revalidatePath("/studio/classes")
    revalidatePath("/studio/teachers")
    revalidatePath("/classes")

    return {
      ok: true,
      message: "선생님을 활성화했습니다."
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"

    if (message.includes("cannot_activate_linked_teacher")) {
      return {
        ok: false,
        message: "학원 로그인 계정에 연결된 선생님 row는 활성화 대상이 아닙니다."
      }
    }

    if (message.includes("teacher_not_found_or_forbidden")) {
      return { ok: false, message: "같은 학원에 등록된 선생님만 활성화할 수 있습니다." }
    }

    return { ok: false, message: "선생님 활성화에 실패했습니다. 잠시 후 다시 시도해 주세요." }
  }
}
