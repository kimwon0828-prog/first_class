"use server"

import { revalidatePath } from "next/cache"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { requireStudioEntitlement } from "@/features/billing/lib/require-entitlement"
import { logSmsEventSafely } from "@/features/notifications/sms/log-sms-event"
import { validateRegistrationInput } from "../lib/registration-input"
import { dataAdapter } from "@/shared/lib/db"
import type { ApplicationRegistrationStatus } from "@/shared/lib/db/adapter"

export type RegistrationSaveState = { status: "idle" | "error" | "success"; message: string; token?: string }
export async function saveStudioRegistrationResultAction(applicationId: string, _previous: RegistrationSaveState, form: FormData): Promise<RegistrationSaveState> {
  const teacher = await requireTeacherStudioAccess()
  const entitlement = await requireStudioEntitlement(teacher.organizationId, "canWriteTrialResults")
  if (!entitlement.allowed) return { status: "error", message: entitlement.message }
  const status = String(form.get("registrationStatus") ?? "")
  const reasonIds = form.getAll("reasonIds").map(String)
  const note = String(form.get("registrationNote") ?? "").trim()
  if (!validateRegistrationInput(status, reasonIds, note)) return { status: "error", message: "등록 상태와 사유를 확인해 주세요." }
  let result: { changed: boolean; enrollmentTransition: boolean }
  try {
    const current = await dataAdapter.getStudioApplicationDetail(applicationId, teacher.organizationId)
    if (!current || current.status !== "completed" || current.noShowAt || current.canceledAt) return { status: "error", message: "체험 완료된 신청에서만 등록 결과를 저장할 수 있습니다." }
    result = await dataAdapter.saveStudioRegistrationResult({ applicationId, status: status as ApplicationRegistrationStatus, reasonIds, note: note || null })
  } catch {
    return { status: "error", message: "등록 결과를 저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요." }
  }
  // The DB lock/history decides first enrollment, never the stale form or action read.
  if (result.enrollmentTransition) {
    const updated = await dataAdapter.getStudioApplicationDetail(applicationId, teacher.organizationId).catch(() => null)
    if (updated) await logSmsEventSafely({ organizationId: teacher.organizationId, application: updated,
      createdBy: teacher.id, recipientType: "parent", eventType: "trial_enrolled" })
  }
  try {
    for (const path of ["/studio", "/studio/cases", "/studio/applications", `/studio/applications/${applicationId}`]) revalidatePath(path)
  } catch { /* A committed result must not be reported as a failed save. */ }
  return { status: "success", message: result.changed ? "등록 결과를 저장했습니다." : "현재 등록 결과와 같습니다.", token: crypto.randomUUID() }
}
