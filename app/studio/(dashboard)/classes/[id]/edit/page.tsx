import Link from "next/link"
import { StudioClassesManager } from "@/features/studio/ui/studio-classes-manager"
import { getStudioClassListItems } from "@/features/studio/queries/get-studio-classes"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"
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
    section?: string
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

  if (targetClass.archivedAt) {
    const studioPath = await getStudioNavigationPathResolver()
    const { data: items, error } = await getStudioClassListItems(teacher.organizationId)
    if (error) throw new Error(error)
    return <section><Link href={studioPath("/studio/classes")}>수업 목록</Link><h1>{targetClass.title}</h1>
      <p>종료된 수업입니다. 기존 일정과 운영 기록은 보관됩니다. 복구 후 비공개 상태에서 정보를 수정할 수 있습니다.</p>
      <p>{targetClass.description}</p><StudioClassesManager items={items.filter(item => item.id === id)} initialStatus="archived" /></section>
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
      initialSection={resolvedSearchParams?.section === "operations" ? "operations" : undefined}
    />
  )
}
