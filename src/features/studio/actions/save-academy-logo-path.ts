"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type SaveAcademyLogoPathResult = {
  status: "success" | "error"
  message: string
}

const LOGO_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/

const isValidLogoPath = (logoImagePath: string, organizationId: string) => {
  const parts = logoImagePath.split("/")

  if (parts.length !== 3) {
    return false
  }

  const [pathOrganizationId, folder, filename] = parts

  if (pathOrganizationId !== organizationId) {
    return false
  }

  if (folder !== "logo") {
    return false
  }

  return LOGO_FILENAME_PATTERN.test(filename)
}

const mapSaveErrorMessage = (code: string | null) => {
  if (code === "42501") {
    return "학원 대표 계정만 로고를 저장할 수 있습니다."
  }

  if (code === "23514" || code === "23503") {
    return "로고 경로를 다시 확인해 주세요."
  }

  return "로고를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
}

export async function saveAcademyLogoPath({
  logoImagePath
}: {
  logoImagePath: string
}): Promise<SaveAcademyLogoPathResult> {
  const normalizedPath = logoImagePath.trim()

  if (!normalizedPath) {
    return {
      status: "error",
      message: "로고 경로를 다시 확인해 주세요."
    }
  }

  const access = await requireTeacherStudioAccess()

  if (!isValidLogoPath(normalizedPath, access.organizationId)) {
    return {
      status: "error",
      message: "허용되지 않은 로고 경로입니다."
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
    logo_image_path: normalizedPath,
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
      message: mapSaveErrorMessage(error.code ?? null)
    }
  }

  revalidatePath("/studio/mypage/profile")

  return {
    status: "success",
    message: "학원 로고가 저장되었습니다."
  }
}
