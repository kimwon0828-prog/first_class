"use server"

import { revalidatePath } from "next/cache"
import { requireStudioEntitlement } from "@/features/billing/lib/require-entitlement"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"
import type { StudioAcademyMemo } from "@/shared/lib/db/adapter"

export type AcademyMemoSaveState = {
  status: "idle" | "success" | "error"
  message: string
  saved?: StudioAcademyMemo
}

export async function saveAcademyMemoAction(applicationId: string, _previous: AcademyMemoSaveState, form: FormData): Promise<AcademyMemoSaveState> {
  const teacher = await requireTeacherStudioAccess()
  const entitlement = await requireStudioEntitlement(teacher.organizationId, "canWriteTrialResults")
  if (!entitlement.allowed) return { status: "error", message: entitlement.message }
  const note = form.get("note")
  const expectedRevision = form.get("expectedRevision")
  if (typeof note !== "string" || note.length > 10000 || typeof expectedRevision !== "string" || !expectedRevision) {
    return { status: "error", message: "메모는 10,000자 이내로 입력해 주세요. 저장 정보를 확인한 뒤 다시 시도해 주세요." }
  }
  try {
    // Authenticated RPC independently checks own-org membership and the existing completion guard.
    // Only this scalar note is forwarded; report/source/registration fields are never forwarded.
    const saved = await dataAdapter.saveStudioAcademyMemo({ applicationId, organizationId: teacher.organizationId,
      actorId: teacher.id, note: note.trim() || null, expectedRevision })
    try { revalidatePath(`/studio/applications/${applicationId}`) } catch { /* The memo was committed; preserve the successful result. */ }
    return { status: "success", message: "메모를 저장했어요.", saved }
  } catch (error) {
    const reason = error instanceof Error ? error.message : ""
    const message = reason.includes("academy_memo_changed")
      ? "다른 곳에서 메모가 변경되었어요. 입력 내용을 복사한 뒤 새로고침해 주세요."
      : reason.includes("application_not_completed") ? "체험 완료 처리 후 메모를 저장할 수 있어요."
      : reason.includes("application_not_found_or_forbidden") ? "메모를 저장할 권한이 없거나 조회할 수 없는 신청이에요."
      : "메모를 저장하지 못했어요. 입력 내용은 유지돼요. 잠시 후 다시 시도해 주세요."
    return { status: "error", message }
  }
}
