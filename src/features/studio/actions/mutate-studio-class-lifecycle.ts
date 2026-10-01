"use server"

import { revalidatePath } from "next/cache"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"

export async function mutateStudioClassLifecycleAction(classId: string, action: "archive" | "restore" | "delete") {
  const teacher = await requireTeacherStudioAccess()
  if (!classId || !["archive", "restore", "delete"].includes(action)) return { status: "error" as const, message: "요청을 확인해 주세요." }
  try {
    await dataAdapter.mutateStudioClassLifecycle(classId, teacher.organizationId, action)
    revalidatePath("/", "layout")
    return { status: "success" as const, message: action === "archive" ? "수업을 종료했습니다." : action === "restore" ? "비공개 상태로 복구했습니다. 확인 후 공개해 주세요." : "수업을 영구 삭제했습니다." }
  } catch (error) {
    return { status: "error" as const, message: error instanceof Error && error.message.includes("class_has_operating_history")
      ? "이 수업에는 신청 또는 운영 기록이 있어 삭제할 수 없습니다. 수업 종료를 이용해 주세요."
      : "요청을 처리하지 못했습니다. 수업 상태를 확인한 후 다시 시도해 주세요." }
  }
}
