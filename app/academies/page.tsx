import { Suspense, type ComponentProps } from "react"
import { AcademiesFrame, AcademiesSkeleton } from "@/features/academies/ui/academies-frame"
import { redirect } from "next/navigation"

import { getAcademiesForList } from "@/features/academies/queries/get-academies-for-list"
import { getSelectableSubjectCatalog } from "@/features/subjects/queries/get-subject-master"
import { resolveSubjectQuerySelection } from "@/features/subjects/lib/subject-query"
import { formatClassSubjectDisplayLabel, type SubjectCatalogCategory } from "@/shared/lib/subject-master"
import { AcademiesExplorer } from "@/features/academies/ui/academies-explorer"
import { resolveAcademySort } from "@/features/academies/lib/academy-sort"
import { PARENT_LAUNCH_REGION, LEGACY_PARENT_LOCATION_KEYS } from "@/features/location/lib/parent-launch-region"
import {
  formatStoredTargetGrades,
  parseStoredTargetGrades
} from "@/shared/constants/grade-options"


type AcademiesPageProps = {
  searchParams?: Promise<Record<string, string | undefined>>
}

const decodeQueryValue = (value: string | null | undefined) => {
  if (!value) {
    return ""
  }

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// Preserve non-location query contracts (including child/returnTo) during canonical redirects.
const buildAcademiesHref = (params: Record<string, string | null | undefined>) => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value && !LEGACY_PARENT_LOCATION_KEYS.some(locationKey => locationKey === key)) query.set(key, value)
  }
  return query.size ? `/academies?${query.toString()}` : "/academies"
}

export default async function AcademiesPage({ searchParams }: AcademiesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const hasLegacyRegionQuery = LEGACY_PARENT_LOCATION_KEYS.some(key => resolvedSearchParams?.[key] !== undefined)
  const selectedQuery =
    typeof resolvedSearchParams?.q === "string" && resolvedSearchParams.q.trim().length > 0
      ? resolvedSearchParams.q.trim()
      : null
  const rawGrade =
    typeof resolvedSearchParams?.grade === "string" && resolvedSearchParams.grade.trim().length > 0
      ? resolvedSearchParams.grade.trim()
      : null
  // 해석되지 않는 grade 는 필터로 쓰이지 않으므로 canonical URL 에서도 제거한다.
  // 해석은 되지만 밴드가 아닌 값(예: 초5)은 의미가 바뀌므로 그대로 둔다.
  const selectedGrade = rawGrade && parseStoredTargetGrades(rawGrade).length > 0 ? rawGrade : null
  const shouldDropInvalidGradeQuery = Boolean(rawGrade) && !selectedGrade
  const { sort: selectedSort, shouldCanonicalize: shouldCanonicalizeSortQuery } =
    resolveAcademySort(resolvedSearchParams?.sort)

  const subjectCatalog = await getSelectableSubjectCatalog() as SubjectCatalogCategory[]
  const {
    category: selectedSubjectCategory,
    subject: selectedSubject,
    shouldCanonicalize: shouldCanonicalizeSubjectQuery
  } = resolveSubjectQuerySelection(subjectCatalog, {
    subjectCategory: decodeQueryValue(resolvedSearchParams?.subjectCategory),
    subject: decodeQueryValue(resolvedSearchParams?.subject)
  })

  if (
    hasLegacyRegionQuery ||
    shouldCanonicalizeSortQuery ||
    shouldDropInvalidGradeQuery ||
    shouldCanonicalizeSubjectQuery
  ) {
    redirect(
      buildAcademiesHref({
        ...resolvedSearchParams,
        q: selectedQuery,
        subjectCategory: selectedSubjectCategory?.code ?? null,
        subject: selectedSubject?.code ?? null,
        grade: selectedGrade,
        sort: selectedSort === "recommended" ? null : selectedSort
      })
    )
  }

  // chip label 도 Subject Master 기준으로 만든다. "과목 · " 접두는 SubjectFilter 가 붙인다.
  const selectedSubjectLabel = selectedSubjectCategory
    ? formatClassSubjectDisplayLabel({
        subject: null,
        subjectCategoryId: selectedSubjectCategory.id,
        subjectId: selectedSubject?.id ?? null,
        subjectCategoryCode: selectedSubjectCategory.code,
        subjectCategoryName: selectedSubjectCategory.name,
        subjectCode: selectedSubject?.code ?? null,
        subjectName: selectedSubject?.name ?? null
      }) || "전체 과목"
    : "전체 과목"
  const options = {
    query: selectedQuery,
    subjectCategoryId: selectedSubjectCategory?.id ?? null,
    subjectId: selectedSubject?.id ?? null,
    grade: selectedGrade,
    sort: selectedSort === "name" ? "name" : null,
    launchRegion: PARENT_LAUNCH_REGION,
    includeLogos: true
  }
  const view = {
    initialQuery: selectedQuery ?? "",
    subjectCatalog,
    selectedSubjectCategory, selectedSubject, selectedSubjectLabel,
    selectedGrade, selectedGradeLabel: selectedGrade ? formatStoredTargetGrades(selectedGrade) : "전체 학년",
    selectedSort, sortDisabledReasonLabel: null
  }
  // Resolve canonical redirects before streaming, preserving the existing HTTP 307 contract.
  return <AcademiesFrame><Suspense key={JSON.stringify(resolvedSearchParams)} fallback={<AcademiesSkeleton />}>
    <AcademiesResults options={options} view={view} />
  </Suspense></AcademiesFrame>
}

async function AcademiesResults({ options, view }: {
  options: Parameters<typeof getAcademiesForList>[0]
  view: Omit<ComponentProps<typeof AcademiesExplorer>, "academies" | "error">
}) {
  let academies: Awaited<ReturnType<typeof getAcademiesForList>> = []
  let error = false
  if (!error) {
    try { academies = await getAcademiesForList({ ...options }) }
    catch { error = true }
  }
  return <AcademiesExplorer {...view} academies={academies} error={error} />
}
