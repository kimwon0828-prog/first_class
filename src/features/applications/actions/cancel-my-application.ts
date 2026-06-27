"use server"

import { revalidatePath } from "next/cache"

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
  parent_id: string
  status: string
  registration_status: string | null
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
    .select("id, parent_id, status, registration_status")
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

  return {
    status: "success",
    message: "체험수업 신청이 취소되었습니다."
  }
}
