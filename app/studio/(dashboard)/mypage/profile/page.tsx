import { StudioMypageProfilePage } from "@/features/studio/ui/studio-mypage-profile-page"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import {
  getStudioSettingsOrganization,
  type StudioSettingsOrganization
} from "@/features/studio/queries/get-studio-settings-organization"

export default async function StudioMypageProfileRoute() {
  const access = await requireTeacherStudioAccess()

  let organization: StudioSettingsOrganization | null = null
  let organizationError: string | null = null

  try {
    organization = await getStudioSettingsOrganization(access)
  } catch {
    organizationError = "학원 기본 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
  }

  return <StudioMypageProfilePage organization={organization} organizationError={organizationError} />
}
