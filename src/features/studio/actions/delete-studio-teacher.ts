"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"

export type DeleteStudioTeacherActionResult = {
  ok: boolean
  message: string
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function deleteStudioTeacherAction(
  teacherId: string
): Promise<DeleteStudioTeacherActionResult> {
  try {
    const actor = await requireTeacherStudioAccess()
    const normalizedTeacherId = teacherId.trim()

    if (!uuidPattern.test(normalizedTeacherId)) {
      return { ok: false, message: "삭제할 선생님 정보를 확인할 수 없습니다." }
    }

    // organization 검증 / 참조 검사 / 실제 삭제는 adapter 가 한 곳에서 수행한다.
    await dataAdapter.deleteStudioTeacher({
      teacherId: normalizedTeacherId,
      organizationId: actor.organizationId,
      actorProfileId: actor.id
    })

    revalidatePath("/studio")
    revalidatePath("/studio/classes")
    revalidatePath("/studio/teachers")

    return {
      ok: true,
      message: "선생님을 삭제했습니다."
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"

    if (message.includes("teacher_has_references")) {
      // 참조 건수는 message 에 남겨 두되(디버깅용) 사용자에게는 숫자를 보여주지 않는다.
      return {
        ok: false,
        message:
          "이미 운영 기록에 사용된 선생님이라 삭제할 수 없습니다. 과거 기록 보존을 위해 비활성화해 주세요."
      }
    }

    if (message.includes("cannot_delete_linked_teacher")) {
      return {
        ok: false,
        message: "로그인 계정과 연결된 선생님은 이 화면에서 삭제할 수 없습니다."
      }
    }

    if (message.includes("teacher_not_found_or_forbidden")) {
      return { ok: false, message: "같은 학원에 등록된 선생님만 삭제할 수 있습니다." }
    }

    return { ok: false, message: "선생님 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요." }
  }
}
