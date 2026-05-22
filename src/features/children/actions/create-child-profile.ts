"use server"

import { revalidatePath } from "next/cache"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { validateChildProfileForm } from "@/features/children/lib/child-form"
import { dataAdapter } from "@/shared/lib/db"

export type ChildProfileActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: ChildProfileActionState = {
  status: "idle",
  message: ""
}

export async function createChildProfileAction(
  previousState: ChildProfileActionState = defaultState,
  formData: FormData
): Promise<ChildProfileActionState> {
  void previousState

  await requireSession("/auth/sign-in")
  const profile = await getMyProfile()

  if (!profile || profile.role !== "parent") {
    return {
      status: "error",
      message: "학부모 계정만 자녀 정보를 등록할 수 있습니다."
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
    await dataAdapter.createChildProfile({
      parentId: profile.id,
      ...validated.input
    })
  } catch {
    return {
      status: "error",
      message: "자녀 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }

  revalidatePath("/my")
  revalidatePath("/my/children")

  return {
    status: "success",
    message: "자녀 정보를 등록했어요."
  }
}
