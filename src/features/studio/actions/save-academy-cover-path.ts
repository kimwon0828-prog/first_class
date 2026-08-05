"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type SaveAcademyCoverPathResult = {
  status: "success" | "error"
  message: string
}

const COVER_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/

const isValidCoverPath = (coverImagePath: string, organizationId: string) => {
  const parts = coverImagePath.split("/")

  if (parts.length !== 3) {
    return false
  }

  const [pathOrganizationId, folder, filename] = parts

  if (pathOrganizationId !== organizationId) {
    return false
  }

  if (folder !== "cover") {
    return false
  }

  return COVER_FILENAME_PATTERN.test(filename)
}

const mapSaveErrorMessage = (code: string | null) => {
  if (code === "42501") {
    return "학원 대표 계정만 대표 이미지를 저장할 수 있습니다."
  }

  if (code === "23514" || code === "23503") {
    return "대표 이미지 경로를 다시 확인해 주세요."
  }

  return "대표 이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
}

export async function saveAcademyCoverPath({
  coverImagePath
}: {
  coverImagePath: string
}): Promise<SaveAcademyCoverPathResult> {
  const normalizedPath = coverImagePath.trim()

  if (!normalizedPath) {
    return {
      status: "error",
      message: "대표 이미지 경로를 다시 확인해 주세요."
    }
  }

  const access = await requireTeacherStudioAccess()

  if (!isValidCoverPath(normalizedPath, access.organizationId)) {
    return {
      status: "error",
      message: "허용되지 않은 대표 이미지 경로입니다."
    }
  }

  const supabase = await getSupabaseServerClient()

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", access.id)
    .maybeSingle()

  if (profileError || !profileData) {
    return {
      status: "error",
      message: "저장 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  if (profileData.role !== "academy") {
    return {
      status: "error",
      message: "학원 대표 계정만 프로필을 수정할 수 있습니다."
    }
  }

  const payload = {
    organization_id: access.organizationId,
    cover_image_path: normalizedPath,
    updated_by: access.id
  }

  const { error } = await supabase
    .from("academy_public_profiles")
    .upsert(payload, { onConflict: "organization_id" })
    .select("organization_id")
    .maybeSingle()

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[academy-cover-save]", {
        code: error.code ?? null,
        message: error.message ?? null,
        details: error.details ?? null,
        hint: error.hint ?? null
      })
    }

    return {
      status: "error",
      message: mapSaveErrorMessage(error.code ?? null)
    }
  }

  revalidatePath("/studio/mypage/profile")

  return {
    status: "success",
    message: "학원 대표 이미지가 저장되었습니다."
  }
}
