import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import {
  getStudioClassFormOptions,
  getStudioSubjectCatalog
} from "@/features/studio/queries/get-studio-class-form-options"
import { StudioClassForm } from "@/features/studio/ui/studio-class-form"

export default async function StudioClassNewPage() {
  const teacher = await requireTeacherStudioAccess()
  const [
    { data: teacherOptions, error: teacherOptionsError },
    { data: subjectCatalog, error: subjectCatalogError }
  ] = await Promise.all([
    getStudioClassFormOptions(teacher.organizationId),
    getStudioSubjectCatalog()
  ])

  return (
    <>
      <StudioClassForm
        variant="standalone"
        organizationId={teacher.organizationId}
        teacherOptions={teacherOptions}
        teacherOptionsError={teacherOptionsError}
        subjectCatalog={subjectCatalog}
        subjectCatalogError={subjectCatalogError}
        createSuccessHref="/studio/classes?success=created"
      />
    </>
  )
}
