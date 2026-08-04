import "server-only"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

type AcademyPublicProfileRow = {
  organization_id: string
  logo_image_path: string | null
  cover_image_path: string | null
  short_description: string | null
  description: string | null
  operating_hours: string | null
  parking_info: string | null
  directions: string | null
  updated_at: string
}

export type StudioAcademyPublicProfile = {
  organizationId: string
  logoImagePath: string | null
  coverImagePath: string | null
  shortDescription: string | null
  description: string | null
  operatingHours: string | null
  parkingInfo: string | null
  directions: string | null
  updatedAt: string
}

export async function getStudioAcademyPublicProfile(
  organizationId: string
): Promise<StudioAcademyPublicProfile | null> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("academy_public_profiles")
    .select(
      [
        "organization_id",
        "logo_image_path",
        "cover_image_path",
        "short_description",
        "description",
        "operating_hours",
        "parking_info",
        "directions",
        "updated_at"
      ].join(", ")
    )
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_fetch_studio_academy_public_profile")
  }

  if (!data) {
    return null
  }

  const row = data as unknown as AcademyPublicProfileRow

  return {
    organizationId: row.organization_id,
    logoImagePath: row.logo_image_path,
    coverImagePath: row.cover_image_path,
    shortDescription: row.short_description,
    description: row.description,
    operatingHours: row.operating_hours,
    parkingInfo: row.parking_info,
    directions: row.directions,
    updatedAt: row.updated_at
  }
}
