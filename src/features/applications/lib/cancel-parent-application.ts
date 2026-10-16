import type { SupabaseClient } from "@supabase/supabase-js"
import type { sendStudioNotificationSafely } from "@/features/notifications/sms/send-studio-notification"
export type CancelMyApplicationActionResult = { status: "success" | "error"; message: string }

const CANCELLABLE_STATUSES = new Set(["new", "reviewing", "confirmed"])

/**
 * 학부모 표면(my_trial_applications)이 돌려주는 row.
 *
 * registration_status 가 없다. 취소 가능 여부는 view 가 can_cancel 로 접어서
 * 주고, 최종 판정은 아래 service role UPDATE 의 조건이 다시 한다.
 * assigned_teacher_id 도 없다 — 알림에 필요한 그 값은 UPDATE 가 돌려받는다.
 */
type MyApplicationRow = {
  id: string
  class_id: string
  parent_id: string | null
  parent_name: string | null
  parent_phone: string | null
  child_name: string
  status: string
  can_cancel: boolean
  requested_slot_at: string | null
  confirmed_slot_at: string | null
  selected_schedule_label: string | null
  class_title: string | null
  class_organization_id: string | null
}


export async function cancelParentApplication(applicationId: string, parentId: string, supabase: SupabaseClient, dependencies: {
  admin: () => SupabaseClient
  notify: typeof sendStudioNotificationSafely
  revalidate: (path: string) => void
}): Promise<CancelMyApplicationActionResult> {
  if (!applicationId) {
    return {
      status: "error",
      message: "신청 정보를 확인할 수 없습니다."
    }
  }

  // 학부모 표면에서 읽는다. base table 은 학부모 credential 로 열 수 없다.
  const { data: ownedApplication, error: ownedApplicationError } = await supabase
    .from("my_trial_applications")
    .select(
      "id, class_id, parent_id, parent_name, parent_phone, child_name, status, can_cancel, requested_slot_at, confirmed_slot_at, selected_schedule_label, class_title, class_organization_id"
    )
    .eq("id", applicationId)
    .eq("parent_id", parentId)
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

  const currentApplication = ownedApplication as MyApplicationRow
  // can_cancel 은 view 가 registration_status 와 status 를 함께 보고 낸 값이다.
  // status 는 화면 신호용으로 한 번 더 확인한다 — 최종 판정은 아래 UPDATE 다.
  if (!currentApplication.can_cancel || !CANCELLABLE_STATUSES.has(currentApplication.status)) {
    return {
      status: "error",
      message: "이미 진행이 완료되었거나 취소할 수 없는 신청입니다."
    }
  }

  const serviceRoleClient = dependencies.admin()
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
    .eq("parent_id", parentId)
    .eq("status", currentApplication.status)
    .neq("registration_status", "enrolled")
    // 담당 선생님은 학원 알림에만 쓴다. 학부모 표면에 두지 않고 여기서 받는다.
    .select("id, assigned_teacher_id")
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

  /*
   * 취소가 실제로 바꾸는 화면만 비운다.
   *   신청 현황 — 취소됨 으로 옮겨간다
   *   일정      — 확정이었다면 사라진다
   *   홈        — 다가오는 수업 미리보기가 줄어든다
   * /record 는 완료 경험만 담아 취소와 무관하고, /my/actions 는 발행본 기준이라
   * 취소로 바뀌지 않는다.
   */
  dependencies.revalidate("/my/applications")
  dependencies.revalidate("/my/schedule")
  dependencies.revalidate("/")

  if (currentApplication.class_organization_id) {
    await dependencies.notify({
      organizationId: currentApplication.class_organization_id,
      application: {
        id: currentApplication.id,
        classId: currentApplication.class_id,
        parentId: currentApplication.parent_id,
        childName: currentApplication.child_name,
        parentName: currentApplication.parent_name,
        parentPhone: currentApplication.parent_phone,
        classTitle: currentApplication.class_title ?? null,
        requestedSlotAt: currentApplication.requested_slot_at ?? "",
        confirmedSlotAt: currentApplication.confirmed_slot_at,
        selectedScheduleLabel: currentApplication.selected_schedule_label,
        assignedTeacherId: updatedApplication.assigned_teacher_id ?? null,
        assignedTeacherName: null
      },
      createdBy: parentId,
      teacherEventType: "teacher_trial_canceled",
      adminEventType: "admin_trial_canceled"
    })
  }

  return {
    status: "success",
    message: "체험수업 신청이 취소되었습니다."
  }
}
