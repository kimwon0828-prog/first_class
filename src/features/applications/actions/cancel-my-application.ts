"use server"

import { revalidatePath } from "next/cache"

import { logSmsEventSafely } from "@/features/notifications/sms/log-sms-event"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type CancelMyApplicationActionResult = {
  status: "success" | "error"
  message: string
}

const CANCELLABLE_STATUSES = new Set(["new", "reviewing", "confirmed"])

type TrialApplicationOwnerRow = {
  id: string
  class_id: string
  parent_id: string
  parent_name: string | null
  parent_phone: string | null
  child_name: string
  status: string
  registration_status: string | null
  requested_slot_at: string | null
  confirmed_slot_at: string | null
  selected_schedule_label: string | null
  assigned_teacher_id: string | null
  classes:
    | {
        title: string | null
        organization_id: string
      }
    | {
        title: string | null
        organization_id: string
      }[]
    | null
}

const getEmbeddedClass = (row: TrialApplicationOwnerRow) => {
  if (!row.classes) {
    return null
  }

  if (Array.isArray(row.classes)) {
    return row.classes[0] ?? null
  }

  return row.classes
}

export async function cancelMyApplicationAction(
  applicationId: string
): Promise<CancelMyApplicationActionResult> {
  const parent = await requireParentAccess({ returnTo: "/my/applications" })

  if (!applicationId) {
    return {
      status: "error",
      message: "신청 정보를 확인할 수 없습니다."
    }
  }

  const supabase = await getSupabaseServerClient()
  const { data: ownedApplication, error: ownedApplicationError } = await supabase
    .from("trial_applications")
    .select(
      "id, class_id, parent_id, parent_name, parent_phone, child_name, status, registration_status, requested_slot_at, confirmed_slot_at, selected_schedule_label, assigned_teacher_id, classes!inner(title, organization_id)"
    )
    .eq("id", applicationId)
    .eq("parent_id", parent.id)
    .maybeSingle()

  if (ownedApplicationError) {
    return {
      status: "error",
      message: "신청 취소에 실패했습니다. 잠시 후 다시 시도해주세요."
    }
  }

  if (!ownedApplication) {
    return {
      status: "error",
      message: "신청 정보를 확인할 수 없습니다."
    }
  }

  const currentApplication = ownedApplication as TrialApplicationOwnerRow
  const embeddedClass = getEmbeddedClass(currentApplication)
  if (
    currentApplication.registration_status === "enrolled" ||
    !CANCELLABLE_STATUSES.has(currentApplication.status)
  ) {
    return {
      status: "error",
      message: "이미 진행이 완료되었거나 취소할 수 없는 신청입니다."
    }
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const nowIso = new Date().toISOString()
  const { data: updatedApplication, error: updateError } = await serviceRoleClient
    .from("trial_applications")
    .update({
      status: "canceled",
      canceled_at: nowIso,
      no_show_at: null,
      confirmed_slot_at: null,
      confirmed_schedule_block_id: null,
      updated_at: nowIso
    })
    .eq("id", applicationId)
    .eq("parent_id", parent.id)
    .eq("status", currentApplication.status)
    .neq("registration_status", "enrolled")
    .select("id")
    .maybeSingle()

  if (updateError) {
    return {
      status: "error",
      message: "신청 취소에 실패했습니다. 잠시 후 다시 시도해주세요."
    }
  }

  if (!updatedApplication) {
    return {
      status: "error",
      message: "이미 진행이 완료되었거나 취소할 수 없는 신청입니다."
    }
  }

  revalidatePath("/my")
  revalidatePath("/my/applications")

  if (embeddedClass?.organization_id) {
    await logSmsEventSafely({
      organizationId: embeddedClass.organization_id,
      application: {
        id: currentApplication.id,
        classId: currentApplication.class_id,
        parentId: currentApplication.parent_id,
        childName: currentApplication.child_name,
        parentName: currentApplication.parent_name,
        parentPhone: currentApplication.parent_phone,
        classTitle: embeddedClass.title ?? null,
        requestedSlotAt: currentApplication.requested_slot_at ?? "",
        confirmedSlotAt: currentApplication.confirmed_slot_at,
        selectedScheduleLabel: currentApplication.selected_schedule_label,
        assignedTeacherId: currentApplication.assigned_teacher_id,
        assignedTeacherName: null
      },
      createdBy: parent.id,
      recipientType: "teacher",
      eventType: "teacher_trial_canceled"
    })
  }

  return {
    status: "success",
    message: "체험수업 신청이 취소되었습니다."
  }
}
