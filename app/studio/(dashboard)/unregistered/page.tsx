import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getConsultationPipelineApplications } from "@/features/studio/queries/get-consultation-pipeline-applications"
import { UnregisteredStudentsManager } from "@/features/studio/ui/unregistered-students-manager"

const matchesSearch = (
  item: {
    childName: string
    parentName: string | null
    parentPhone: string | null
    classTitle: string | null
  },
  query: string
) => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  return [item.childName, item.parentName, item.parentPhone, item.classTitle]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalized))
}

type StudioUnregisteredPageProps = {
  searchParams?: Promise<{
    q?: string
    counselorId?: string
  }>
}

export default async function StudioUnregisteredPage({
  searchParams
}: StudioUnregisteredPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedQuery = String(resolvedSearchParams?.q ?? "").trim()
  const { data, error } = await getConsultationPipelineApplications(
    teacher.organizationId
  )
  const counselorOptions = Array.from(
    new Map(
      data.items
        .filter(
          (item) =>
            Boolean(item.latestConsultationCreatedBy) && Boolean(item.latestConsultationCreatedByName)
        )
        .map((item) => [
          item.latestConsultationCreatedBy as string,
          {
            id: item.latestConsultationCreatedBy as string,
            name: item.latestConsultationCreatedByName as string
          }
        ])
    ).values()
  ).sort((left, right) => left.name.localeCompare(right.name, "ko"))

  const counselorIdParam = String(resolvedSearchParams?.counselorId ?? "").trim()
  const availableCounselorIdSet = new Set(counselorOptions.map((option) => option.id))
  const selectedCounselorId =
    counselorIdParam && counselorIdParam !== "all" && availableCounselorIdSet.has(counselorIdParam)
      ? counselorIdParam
      : "all"

  const filteredItems = data.items.filter((item) => {
    if (!matchesSearch(item, selectedQuery)) {
      return false
    }

    if (selectedCounselorId === "all") {
      return true
    }

    if (!item.latestConsultationCreatedBy) {
      return true
    }

    return item.latestConsultationCreatedBy === selectedCounselorId
  })

  return (
    <UnregisteredStudentsManager
      items={filteredItems}
      counselorOptions={counselorOptions}
      selectedQuery={selectedQuery}
      selectedCounselorId={selectedCounselorId}
      error={error}
    />
  )
}
