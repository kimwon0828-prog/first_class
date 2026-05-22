"use server"

import { revalidatePath } from "next/cache"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type UpdateParentProfileActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: UpdateParentProfileActionState = {
  status: "idle",
  message: ""
}

export async function updateParentProfileAction(
  previousState: UpdateParentProfileActionState = defaultState,
  formData: FormData
): Promise<UpdateParentProfileActionState> {
  void previousState

  await requireSession("/auth/sign-in")
  const profile = await getMyProfile()

  if (!profile || profile.role !== "parent") {
    return {
      status: "error",
      message: "학부모 계정만 보호자 정보를 수정할 수 있습니다."
    }
  }

  const name = String(formData.get("name") ?? "").trim()
  const phoneRaw = String(formData.get("phone") ?? "").trim()
  const phone = phoneRaw.length > 0 ? phoneRaw : null

  if (name.length < 2) {
    return {
      status: "error",
      message: "보호자명은 2자 이상 입력해 주세요."
    }
  }

  if (phone && phone.length < 8) {
    return {
      status: "error",
      message: "보호자 연락처를 다시 확인해 주세요."
    }
  }

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from("profiles")
    .update({
      name,
      phone,
      updated_at: new Date().toISOString()
    })
    .eq("id", profile.id)

  if (error) {
    return {
      status: "error",
      message: "보호자 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }

  revalidatePath("/my")

  return {
    status: "success",
    message: "보호자 기본 정보를 저장했습니다."
  }
}
