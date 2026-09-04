import { getStudioEntitlementsForDisplay } from "@/features/billing/queries/get-organization-entitlements"
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
  // 상담 파이프라인 화면이라 상담 권한을 따른다. nav 에 없는 legacy route 이므로
  // 별도 화면을 만들지 않고 안내 한 줄만 보여 준다(디자인 시스템 §10.2).
  const { entitlements } = await getStudioEntitlementsForDisplay(teacher.organizationId)
  if (!entitlements.canUseConversionAnalytics) {
    return (
      <p>
        미등록 관리는 스탠다드 플랜에서 사용할 수 있습니다. 이미 저장된 상담 기록은 상담·등록
        화면에서 계속 확인할 수 있습니다.
      </p>
    )
  }

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
