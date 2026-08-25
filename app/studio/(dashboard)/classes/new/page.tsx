import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioSettingsOrganization } from "@/features/studio/queries/get-studio-settings-organization"
import {
  getStudioClassFormOptions,
  getStudioSubjectCatalog
} from "@/features/studio/queries/get-studio-class-form-options"
import { StudioClassCreateWizard } from "@/features/studio/ui/studio-class-create-wizard"

export default async function StudioClassNewPage() {
  const teacher = await requireTeacherStudioAccess()
  const [
    { data: teacherOptions, error: teacherOptionsError },
    { data: subjectCatalog, error: subjectCatalogError },
    organization
  ] = await Promise.all([
    getStudioClassFormOptions(teacher.organizationId),
    getStudioSubjectCatalog(),
    getStudioSettingsOrganization(teacher)
  ])

  return (
    <>
      <StudioClassCreateWizard
        organizationId={teacher.organizationId}
        organizationAcademyArea={organization.academyArea}
        currentTeacherId={teacher.teacherId}
        teacherOptions={teacherOptions}
        teacherOptionsError={teacherOptionsError}
        subjectCatalog={subjectCatalog}
        subjectCatalogError={subjectCatalogError}
        createSuccessHref="/studio/classes?success=created"
      />
    </>
  )
}
