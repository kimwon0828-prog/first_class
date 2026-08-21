import { StudioMypageProfilePage } from "@/features/studio/ui/studio-mypage-profile-page"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import {
  getStudioSettingsOrganization,
  type StudioSettingsOrganization
} from "@/features/studio/queries/get-studio-settings-organization"
import {
  getStudioAcademyPublicProfile,
  type StudioAcademyPublicProfile
} from "@/features/studio/queries/get-studio-academy-public-profile"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export default async function StudioMypageProfileRoute() {
  const access = await requireTeacherStudioAccess()
  const supabase = await getSupabaseServerClient()

  let organization: StudioSettingsOrganization | null = null
  let organizationError: string | null = null
  let publicProfile: StudioAcademyPublicProfile | null = null
  let publicProfileError: string | null = null
  let canEditPublicProfile = false
  let publicPageSlug: string | null = null

  const [organizationResult, publicProfileResult, profileRoleResult, publicPageLinkResult] = await Promise.allSettled([
    getStudioSettingsOrganization(access),
    getStudioAcademyPublicProfile(access.organizationId),
    supabase.from("profiles").select("role").eq("id", access.id).maybeSingle(),
    supabase.from("academy_public_profiles").select("slug").eq("organization_id", access.organizationId).maybeSingle()
  ])

  if (organizationResult.status === "fulfilled") {
    organization = organizationResult.value
  } else {
    organizationError = "학원 기본 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
  }

  if (publicProfileResult.status === "fulfilled") {
    publicProfile = publicProfileResult.value
  } else {
    publicProfileError = "학원 공개 프로필 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
  }

  if (profileRoleResult.status === "fulfilled") {
    const { data, error } = profileRoleResult.value
    canEditPublicProfile = !error && data?.role === "academy"
  }

  if (publicPageLinkResult.status === "fulfilled") {
    const { data, error } = publicPageLinkResult.value
    publicPageSlug = !error && typeof data?.slug === "string" && data.slug.trim().length > 0 ? data.slug.trim() : null
  }

  return (
    <StudioMypageProfilePage
      organizationId={access.organizationId}
      academyName={organization?.name?.trim() || "학원"}
      initialLogoImagePath={publicProfile?.logoImagePath ?? null}
      initialCoverImagePath={publicProfile?.coverImagePath ?? null}
      organization={organization}
      organizationError={organizationError}
      publicProfile={publicProfile}
      initialSlug={publicPageSlug}
      publicProfileError={publicProfileError}
      canEditPublicProfile={canEditPublicProfile}
    />
  )
}
