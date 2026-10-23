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
import { getAcademyUpdateRequestHistory } from "@/features/studio/queries/get-academy-update-request-history"
import { getPendingAcademyUpdateRequest } from "@/features/studio/queries/get-pending-academy-update-request"
import { getStudioAcademySubjectCategories } from "@/features/studio/queries/get-studio-academy-subject-categories"
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

  const [organizationResult, publicProfileResult, profileRoleResult, publicPageLinkResult, pendingResult, historyResult, subjectsResult] = await Promise.allSettled([
    getStudioSettingsOrganization(access),
    getStudioAcademyPublicProfile(access.organizationId),
    supabase.from("profiles").select("role").eq("id", access.id).maybeSingle(),
    supabase.from("academy_public_profiles").select("slug").eq("organization_id", access.organizationId).maybeSingle(),
    // 공식 정보 잠금 표시용(읽기 전용): 검토 중 요청 · 요청 이력 · 등록한 수업의 과목.
    getPendingAcademyUpdateRequest(access.organizationId),
    getAcademyUpdateRequestHistory(access.organizationId),
    getStudioAcademySubjectCategories(access.organizationId)
  ])

  if (organizationResult.status === "fulfilled") {
    organization = organizationResult.value
  } else {
    organizationError = "학원 기본 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
  }

  if (publicProfileResult.status === "fulfilled") {
    publicProfile = publicProfileResult.value
  } else {
    publicProfileError = "학원 소개 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
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
      pendingUpdateRequestedAt={pendingResult.status === "fulfilled" ? pendingResult.value?.createdAt ?? null : null}
      updateRequestStatusError={pendingResult.status === "rejected" || historyResult.status === "rejected"}
      updateRequestHistory={historyResult.status === "fulfilled" ? historyResult.value : []}
      subjectCategories={subjectsResult.status === "fulfilled" ? subjectsResult.value : null}
    />
  )
}
