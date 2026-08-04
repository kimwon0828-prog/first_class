"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type SaveAcademyPublicProfileActionState = {
  status: "idle" | "error" | "success"
  message: string
  completedAt: string | null
}

const defaultState: SaveAcademyPublicProfileActionState = {
  status: "idle",
  message: "",
  completedAt: null
}

const toNullableText = (value: FormDataEntryValue | null, maxLength: number) => {
  const normalized = String(value ?? "").trim()

  if (normalized.length === 0) {
    return { ok: true as const, value: null }
  }

  if (normalized.length > maxLength) {
    return { ok: false as const }
  }

  return { ok: true as const, value: normalized }
}

const mapSaveErrorMessage = (code: string | null) => {
  if (code === "42501") {
    return "학원 대표 계정만 프로필을 저장할 수 있습니다."
  }

  if (code === "23514" || code === "23503") {
    return "입력한 프로필 정보를 다시 확인해 주세요."
  }

  return "프로필을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
}

export async function saveAcademyPublicProfileAction(
  previousState: SaveAcademyPublicProfileActionState = defaultState,
  formData: FormData
): Promise<SaveAcademyPublicProfileActionState> {
  void previousState

  const shortDescription = toNullableText(formData.get("shortDescription"), 80)
  if (!shortDescription.ok) {
    return {
      status: "error",
      message: "한 줄 소개는 80자 이하로 입력해 주세요.",
      completedAt: null
    }
  }

  const description = toNullableText(formData.get("description"), 1000)
  if (!description.ok) {
    return {
      status: "error",
      message: "상세 소개는 1,000자 이하로 입력해 주세요.",
      completedAt: null
    }
  }

  const operatingHours = toNullableText(formData.get("operatingHours"), 500)
  if (!operatingHours.ok) {
    return {
      status: "error",
      message: "운영시간은 500자 이하로 입력해 주세요.",
      completedAt: null
    }
  }

  const parkingInfo = toNullableText(formData.get("parkingInfo"), 500)
  if (!parkingInfo.ok) {
    return {
      status: "error",
      message: "주차 안내는 500자 이하로 입력해 주세요.",
      completedAt: null
    }
  }

  const directions = toNullableText(formData.get("directions"), 500)
  if (!directions.ok) {
    return {
      status: "error",
      message: "찾아오는 방법은 500자 이하로 입력해 주세요.",
      completedAt: null
    }
  }

  const access = await requireTeacherStudioAccess()
  const supabase = await getSupabaseServerClient()

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", access.id)
    .maybeSingle()

  if (profileError || !profileData) {
    return {
      status: "error",
      message: "저장 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      completedAt: null
    }
  }

  if (profileData.role !== "academy") {
    return {
      status: "error",
      message: "학원 대표 계정만 프로필을 수정할 수 있습니다.",
      completedAt: null
    }
  }

  const payload = {
    organization_id: access.organizationId,
    short_description: shortDescription.value,
    description: description.value,
    operating_hours: operatingHours.value,
    parking_info: parkingInfo.value,
    directions: directions.value,
    updated_by: access.id
  }

  const { error } = await supabase
    .from("academy_public_profiles")
    .upsert(payload, { onConflict: "organization_id" })
    .select("organization_id")
    .maybeSingle()

  if (error) {
    return {
      status: "error",
      message: mapSaveErrorMessage(error.code ?? null),
      completedAt: null
    }
  }

  revalidatePath("/studio/mypage/profile")

  return {
    status: "success",
    message: "프로필이 저장되었습니다.",
    completedAt: new Date().toISOString()
  }
}
