"use server"

import { revalidatePath } from "next/cache"

import { logSmsEventSafely } from "@/features/notifications/sms/log-sms-event"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"

export type UpdateApplicationAssigneeActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: UpdateApplicationAssigneeActionState = {
  status: "idle",
  message: ""
}

export async function updateApplicationAssigneeAction(
  applicationId: string,
  previousState: UpdateApplicationAssigneeActionState = defaultState,
  formData: FormData
): Promise<UpdateApplicationAssigneeActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()
  const requestedTeacherIdRaw = String(formData.get("assignedTeacherId") ?? "").trim()
  const requestedTeacherId = requestedTeacherIdRaw.length > 0 ? requestedTeacherIdRaw : null

  try {
    const current = await dataAdapter.getStudioApplicationDetail(applicationId, teacher.organizationId)

    if (!current) {
      return {
        status: "error",
        message: "조회 가능한 신청이 아니거나 접근 권한이 없습니다."
      }
    }

    if (current.assignedTeacherId === requestedTeacherId) {
      return {
        status: "error",
        message: "변경된 담당 선생님이 없습니다."
      }
    }

    if (requestedTeacherId) {
      const options = await dataAdapter.listStudioTeacherOptions(teacher.organizationId)
      const isSameOrganizationTeacher = options.some(
        (option) => option.teacherId === requestedTeacherId
      )

      if (!isSameOrganizationTeacher) {
        return {
          status: "error",
          message: "현재 학원에 속한 선생님만 담당자로 지정할 수 있습니다."
        }
      }
    }

    await dataAdapter.updateStudioApplicationAssignee({
      applicationId,
      organizationId: teacher.organizationId,
      actorId: teacher.id,
      assignedTeacherId: requestedTeacherId
    })

    if (requestedTeacherId) {
      const updated = await dataAdapter
        .getStudioApplicationDetail(applicationId, teacher.organizationId)
        .catch(() => null)

      if (updated) {
        await logSmsEventSafely({
          organizationId: teacher.organizationId,
          application: updated,
          createdBy: teacher.id,
          recipientType: "teacher",
          eventType: "teacher_trial_assigned",
          targetTeacherId: requestedTeacherId
        })
      }
    }

    revalidatePath("/studio")
    revalidatePath("/studio/applications")
    revalidatePath(`/studio/applications/${applicationId}`)
    revalidatePath("/studio/schedule")

    return {
      status: "success",
      message: requestedTeacherId
        ? "담당 선생님을 변경했습니다."
        : "담당 선생님을 미배정 상태로 변경했습니다."
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed_to_update_application_assignee"

    if (message === "application_not_found_or_forbidden") {
      return {
        status: "error",
        message: "조회 가능한 신청이 아니거나 접근 권한이 없습니다."
      }
    }

    if (message === "invalid_teacher_for_application_organization") {
      return {
        status: "error",
        message: "현재 학원에 속한 선생님만 담당자로 지정할 수 있습니다."
      }
    }

    return {
      status: "error",
      message: "담당 선생님 변경에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
