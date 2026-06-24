import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getPendingAcademyUpdateRequest } from "@/features/studio/queries/get-pending-academy-update-request"
import { getStudioSettingsOrganization } from "@/features/studio/queries/get-studio-settings-organization"
import { StudioSettingsPage } from "@/features/studio/ui/studio-settings-page"

export default async function StudioSettingsRoute() {
  const access = await requireTeacherStudioAccess()

  let organization = null
  let organizationError: string | null = null
  let pendingRequest = null
  let pendingError: string | null = null

  try {
    organization = await getStudioSettingsOrganization(access)
  } catch (error) {
    organizationError = error instanceof Error ? error.message : "failed_to_fetch_studio_settings_organization"
  }

  try {
    pendingRequest = await getPendingAcademyUpdateRequest(access.organizationId)
  } catch (error) {
    pendingError =
      error instanceof Error ? error.message : "failed_to_fetch_pending_academy_update_request"
  }

  return (
    <StudioSettingsPage
      organization={organization}
      organizationError={organizationError}
      pendingRequest={pendingRequest}
      pendingError={pendingError}
    />
  )
}
