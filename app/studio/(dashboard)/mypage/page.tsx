import { StudioMypagePage } from "@/features/studio/ui/studio-mypage-page"
import { getStudioOrganizationName } from "@/features/studio/lib/get-studio-organization-name"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"

export default async function StudioMypageRoute() {
  const access = await requireTeacherStudioAccess()
  const organizationName = await getStudioOrganizationName(access.organizationId)
  return <StudioMypagePage academyName={organizationName ?? "학원"} />
}
