"use server"

import { revalidatePath } from "next/cache"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import {
  validateChildProfileForm,
  normalizeOptionalText
} from "@/features/children/lib/child-form"
import { dataAdapter } from "@/shared/lib/db"

import type { ChildProfileActionState } from "./create-child-profile"

const defaultState: ChildProfileActionState = {
  status: "idle",
  message: ""
}

export async function updateChildProfileAction(
  previousState: ChildProfileActionState = defaultState,
  formData: FormData
): Promise<ChildProfileActionState> {
  void previousState

  await requireSession("/auth/sign-in")
  const profile = await getMyProfile()

  if (!profile || profile.role !== "parent") {
    return {
      status: "error",
      message: "학부모 계정만 자녀 정보를 수정할 수 있습니다."
    }
  }

  const childId = normalizeOptionalText(formData.get("childId"), 80)
  if (!childId) {
    return {
      status: "error",
      message: "수정할 자녀 정보를 찾지 못했어요. 다시 선택해 주세요."
    }
  }

  const validated = validateChildProfileForm(formData)
  if (!validated.ok) {
    return {
      status: "error",
      message: validated.message
    }
  }

  try {
    await dataAdapter.updateChildProfile({
      childId,
      parentId: profile.id,
      ...validated.input
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed_to_update_child_profile"

    if (message === "child_profile_not_found_or_forbidden") {
      return {
        status: "error",
        message: "수정할 자녀 정보를 찾지 못했어요. 잠시 후 새로고침 후 다시 시도해 주세요."
      }
    }

    return {
      status: "error",
      message: "자녀 정보를 수정하지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }

  revalidatePath("/my")
  revalidatePath("/my/children")

  return {
    status: "success",
    message: "자녀 정보를 수정했어요."
  }
}
