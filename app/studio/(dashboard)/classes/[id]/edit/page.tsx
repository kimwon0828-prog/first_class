import { notFound } from "next/navigation"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import {
  getStudioClassFormOptions,
  getStudioSubjectCatalog
} from "@/features/studio/queries/get-studio-class-form-options"
import { getStudioClasses } from "@/features/studio/queries/get-studio-classes"
import { getStudioScheduleCalendar } from "@/features/studio/queries/get-studio-schedule-calendar"
import { StudioClassForm } from "@/features/studio/ui/studio-class-form"

type StudioClassEditPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams?: Promise<{
    month?: string
  }>
}

export default async function StudioClassEditPage({ params, searchParams }: StudioClassEditPageProps) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const teacher = await requireTeacherStudioAccess()
  const month =
    resolvedSearchParams?.month && /^\d{4}-\d{2}$/.test(resolvedSearchParams.month)
      ? resolvedSearchParams.month
      : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  const [
    { data: classes, error: classesError },
    { data: teacherOptions, error: teacherOptionsError },
    { data: subjectCatalog, error: subjectCatalogError }
  ] =
    await Promise.all([
      getStudioClasses(teacher.organizationId),
      getStudioClassFormOptions(teacher.organizationId),
      getStudioSubjectCatalog()
    ])

  if (classesError) {
    throw new Error(classesError)
  }

  const targetClass = classes.find((item) => item.id === id)

  if (!targetClass) {
    notFound()
  }

  const { data: scheduleCalendar, error: scheduleCalendarError } = await getStudioScheduleCalendar({
    organizationId: teacher.organizationId,
    month,
    classId: id,
    teacherId: null
  })

  return (
    <StudioClassForm
      organizationId={teacher.organizationId}
      currentTeacherId={teacher.teacherId}
      teacherOptions={teacherOptions}
      teacherOptionsError={teacherOptionsError}
      subjectCatalog={subjectCatalog}
      subjectCatalogError={subjectCatalogError}
      initialItem={targetClass}
      scheduleCalendarMonth={month}
      scheduleCalendarDays={scheduleCalendar.days}
      scheduleCalendarError={scheduleCalendarError}
      variant="standalone"
      formId="studio-class-edit-form"
      updateSuccessHref="/studio/classes?success=updated"
    />
  )
}
