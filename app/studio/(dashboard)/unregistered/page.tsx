import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import {
  resolveUnregisteredPeriod,
  resolveUnregisteredRegistrationFilter
} from "@/features/studio/lib/unregistered-students"
import { getStudioDashboardTeacherOptions } from "@/features/studio/queries/get-studio-dashboard-teacher-options"
import { getUnregisteredApplications } from "@/features/studio/queries/get-unregistered-applications"
import { UnregisteredStudentsManager } from "@/features/studio/ui/unregistered-students-manager"

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StudioUnregisteredPageProps = {
  searchParams?: Promise<{
    q?: string
    teacherId?: string
    registrationStatus?: string
    period?: string
  }>
}

export default async function StudioUnregisteredPage({
  searchParams
}: StudioUnregisteredPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedQuery = String(resolvedSearchParams?.q ?? "").trim()
  const selectedRegistrationStatus = resolveUnregisteredRegistrationFilter(
    resolvedSearchParams?.registrationStatus
  )
  const selectedPeriod = resolveUnregisteredPeriod(resolvedSearchParams?.period)
  const { data: teacherOptions, error: teacherOptionsError } = await getStudioDashboardTeacherOptions(
    teacher.organizationId
  )

  const availableTeacherIdSet = new Set(teacherOptions.map((option) => option.teacherId))
  const teacherIdParam = String(resolvedSearchParams?.teacherId ?? "").trim()
  const validatedTeacherId =
    teacherIdParam &&
    teacherIdParam !== "all" &&
    uuidPattern.test(teacherIdParam) &&
    availableTeacherIdSet.has(teacherIdParam)
      ? teacherIdParam
      : null

  const { data, error } = await getUnregisteredApplications(teacher.organizationId, {
    teacherId: validatedTeacherId,
    completedAtFrom: selectedPeriod.completedAtFrom,
    completedAtTo: selectedPeriod.completedAtTo,
    query: selectedQuery,
    registrationStatus: selectedRegistrationStatus
  })

  return (
    <UnregisteredStudentsManager
      items={data.items}
      summary={data.summary}
      teacherOptions={teacherOptions}
      selectedQuery={selectedQuery}
      selectedTeacherId={validatedTeacherId ?? "all"}
      selectedRegistrationStatus={selectedRegistrationStatus}
      selectedPeriod={selectedPeriod}
      error={teacherOptionsError ?? error}
    />
  )
}
