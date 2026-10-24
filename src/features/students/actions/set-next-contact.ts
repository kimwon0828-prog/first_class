"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSeoulTodayKey } from "@/features/studio/lib/studio-schedule-month"
import { NEXT_CONTACT_NOTE_MAX } from "@/features/students/lib/student-grouping"
import { resolveStudioStudentGroup } from "@/features/students/queries/get-studio-students"
import { dataAdapter } from "@/shared/lib/db"

export type SetNextContactState = { status: "idle" | "success" | "error"; message: string }

/**
 * 학생 상세 "다음 연락"(메모 + 날짜) 저장 · 지우기. 무료 기능이다(AGENTS.md "학생 · 안내 문자").
 *
 * 학생의 대표 신청 한 곳에만 둔다(RPC set_studio_next_contact → next_contact_at 그날 09:00 KST + follow_up_note).
 * 같은 학생의 다른 신청에 남은 다음 연락은 지운다 — 홈 "오늘 할 일"에 한 학생이 두 번 뜨지 않게.
 * 학원에 문자를 보내지 않는다. 그 날짜부터 홈 "오늘 할 일"에 뜬다.
 */
export async function setStudentNextContactAction(
  applicationId: string,
  _previous: SetNextContactState,
  formData: FormData
): Promise<SetNextContactState> {
  const teacher = await requireTeacherStudioAccess()
  const clearing = formData.get("intent") === "clear"
  const date = clearing ? null : String(formData.get("date") ?? "").trim()
  const note = clearing ? null : String(formData.get("note") ?? "").trim()

  if (!clearing) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { status: "error", message: "연락할 날짜를 골라 주세요." }
    }
    if (date < getSeoulTodayKey()) {
      return { status: "error", message: "오늘이나 그 뒤 날짜를 골라 주세요." }
    }
    if (!note) {
      return { status: "error", message: "무엇을 연락할지 짧게 적어 주세요." }
    }
    if (note.length > NEXT_CONTACT_NOTE_MAX) {
      return { status: "error", message: `메모는 ${NEXT_CONTACT_NOTE_MAX}자까지 쓸 수 있어요.` }
    }
  }

  try {
    const group = await resolveStudioStudentGroup(teacher.organizationId, applicationId)
    if (!group) {
      return { status: "error", message: "학생 정보를 찾지 못했어요. 목록에서 다시 열어 주세요." }
    }

    for (const item of group.applications) {
      if (item.id !== group.representative.id && item.nextContactAt) {
        await dataAdapter.setStudioNextContact(teacher.organizationId, item.id, { date: null, note: null })
      }
    }
    await dataAdapter.setStudioNextContact(teacher.organizationId, group.representative.id, { date, note })
  } catch {
    return { status: "error", message: "다음 연락을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }
  }

  revalidatePath("/studio")
  revalidatePath("/studio/students")
  revalidatePath(`/studio/students/${applicationId}`)
  return { status: "success", message: clearing ? "다음 연락을 지웠어요." : "다음 연락을 저장했어요. 그날 홈 오늘 할 일에 떠요." }
}
