import { Suspense, type ComponentProps } from "react"
import { AcademiesFrame, AcademiesSkeleton } from "@/features/academies/ui/academies-frame"
import { redirect } from "next/navigation"

import { getAcademiesForList } from "@/features/academies/queries/get-academies-for-list"
import { getSelectableSubjectCatalog } from "@/features/subjects/queries/get-subject-master"
import { resolveSubjectQuerySelection } from "@/features/subjects/lib/subject-query"
import { formatClassSubjectDisplayLabel, type SubjectCatalogCategory } from "@/shared/lib/subject-master"
import { AcademiesExplorer } from "@/features/academies/ui/academies-explorer"
import {
  ACADEMY_DISTANCE_SORT_LABEL,
  resolveAcademySort
} from "@/features/academies/lib/academy-sort"
import {
  canonicalizeRegionSelection,
  formatRegionSelectionLabel,
  isSameRegionSelection
} from "@/features/location/lib/region-selection"
import { readParentSearchLocation } from "@/features/location/lib/search-location-cookie"
import { normalizeSearchRadiusKm } from "@/features/location/lib/search-location"
import { getAcademiesRegionCatalog } from "@/features/location/queries/get-academies-region-catalog"
import { findOrganizationIdsByAdministrativeRegion } from "@/features/location/queries/find-organizations-by-region"
import { findNearbyOrganizations } from "@/features/location/queries/find-nearby-organizations"
import {
  formatStoredTargetGrades,
  parseStoredTargetGrades
} from "@/shared/constants/grade-options"


type AcademiesPageProps = {
  searchParams?: Promise<{
    q?: string
    subjectCategory?: string
    subject?: string
    // legacy academy-area query. 필터로 쓰지 않고 canonical URL 에서 제거만 한다.
    region?: string
    grade?: string
    sort?: string
    radius?: string
    sido?: string
    sigungu?: string
    bname?: string
  }>
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

// /academies 는 streaming fallback(loading.tsx) 이 없어 redirect() 가 실제 307 을 보낸다.
// Location 헤더는 non-ASCII 를 담지 못하므로 query 값을 전부 percent-encode 한다.
const buildAcademiesHref = (params: {
  q?: string | null
  subjectCategory?: string | null
  subject?: string | null
  grade?: string | null
  sort?: string | null
  radius?: string | null
  sido?: string | null
  sigungu?: string | null
  bname?: string | null
}) => {
  const parts: string[] = []
  if (params.q) parts.push(`q=${encodeURIComponent(params.q)}`)
  if (params.subjectCategory) {
    parts.push(`subjectCategory=${encodeURIComponent(params.subjectCategory)}`)
  }
  if (params.subject) parts.push(`subject=${encodeURIComponent(params.subject)}`)
  if (params.grade) parts.push(`grade=${encodeURIComponent(params.grade)}`)
  if (params.sort) parts.push(`sort=${encodeURIComponent(params.sort)}`)
  if (params.radius) parts.push(`radius=${encodeURIComponent(params.radius)}`)
  if (params.sido) parts.push(`sido=${encodeURIComponent(params.sido)}`)
  if (params.sigungu) parts.push(`sigungu=${encodeURIComponent(params.sigungu)}`)
  if (params.bname) parts.push(`bname=${encodeURIComponent(params.bname)}`)
  return parts.length ? `/academies?${parts.join("&")}` : "/academies"
}

export default async function AcademiesPage({ searchParams }: AcademiesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  // legacy academy-area query 는 더 이상 필터가 아니다. 발견되면 canonical URL 에서 제거만 한다.
  const hasLegacyRegionQuery =
    typeof resolvedSearchParams?.region === "string" && resolvedSearchParams.region.trim().length > 0
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

  // 과목 필터의 canonical source 는 Subject Master 다. /classes 와 같은 resolver 를 공유한다.
  // 이 셋은 서로 의존하지 않으므로 함께 시작한다. canonicalization/redirect 순서는 그대로다.
  const [subjectCatalog, searchLocation, regionCatalog] = await Promise.all([
    getSelectableSubjectCatalog() as Promise<SubjectCatalogCategory[]>,
    readParentSearchLocation(),
    getAcademiesRegionCatalog()
  ])
  const {
    category: selectedSubjectCategory,
    subject: selectedSubject,
    shouldCanonicalize: shouldCanonicalizeSubjectQuery
  } = resolveSubjectQuerySelection(subjectCatalog, {
    subjectCategory: decodeQueryValue(resolvedSearchParams?.subjectCategory),
    subject: decodeQueryValue(resolvedSearchParams?.subject)
  })
  const radiusKm = normalizeSearchRadiusKm(resolvedSearchParams?.radius)
  const rawRegionSelection = {
    sido: decodeQueryValue(resolvedSearchParams?.sido),
    sigungu: decodeQueryValue(resolvedSearchParams?.sigungu),
    bname: decodeQueryValue(resolvedSearchParams?.bname)
  }
  // URL 값은 신뢰하지 않는다. catalog 로 계층을 재검증하고 검증되지 않는 하위 단계는 잘라낸다.
  const regionSelection = canonicalizeRegionSelection(regionCatalog, rawRegionSelection)
  // 명시적인 행정지역 선택이 있으면 남아 있는 location cookie 보다 우선한다.
  const locationMode: "all" | "nearby" | "region" = regionSelection
    ? "region"
    : searchLocation
      ? "nearby"
      : "all"
  const isNearbyMode = locationMode === "nearby"
  const isRegionMode = locationMode === "region"
  const radiusQueryValue = isNearbyMode ? String(radiusKm) : null
  const regionQueryValues = {
    sido: regionSelection?.sido ?? null,
    sigungu: regionSelection?.sigungu ?? null,
    bname: regionSelection?.bname ?? null
  }
  const shouldCanonicalizeRegionQuery = !isSameRegionSelection(regionSelection, rawRegionSelection)

  if (
    hasLegacyRegionQuery ||
    shouldCanonicalizeSortQuery ||
    shouldDropInvalidGradeQuery ||
    shouldCanonicalizeSubjectQuery ||
    shouldCanonicalizeRegionQuery
  ) {
    redirect(
      buildAcademiesHref({
        q: selectedQuery,
        subjectCategory: selectedSubjectCategory?.code ?? null,
        subject: selectedSubject?.code ?? null,
        grade: selectedGrade,
        sort: selectedSort === "recommended" ? null : selectedSort,
        radius: radiusQueryValue,
        ...regionQueryValues
      })
    )
  }

  let distanceByOrganizationId: Map<string, number> | null = null
  let regionOrganizationIds: string[] | null = null
  let locationLookupFailed = false
  if (isNearbyMode && searchLocation) {
    try {
      const nearbyOrganizations = await findNearbyOrganizations({
        latitude: searchLocation.lat,
        longitude: searchLocation.lng,
        radiusKm
      })
      distanceByOrganizationId = new Map(
        nearbyOrganizations.map((item) => [item.organizationId, item.distanceKm])
      )
    } catch {
      locationLookupFailed = true
    }
  } else if (isRegionMode && regionSelection) {
    try {
      regionOrganizationIds = await findOrganizationIdsByAdministrativeRegion(regionSelection)
    } catch {
      locationLookupFailed = true
    }
  }

  const organizationIdFilter = distanceByOrganizationId
    ? [...distanceByOrganizationId.keys()]
    : regionOrganizationIds

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
  const locationFilterLabel = isRegionMode
    ? regionSelection
      ? formatRegionSelectionLabel(regionSelection)
      : "지역"
    : isNearbyMode
      ? `현재 위치 · ${radiusKm}km`
      : "전체"
  const options = {
    query: selectedQuery,
    subjectCategoryId: selectedSubjectCategory?.id ?? null,
    subjectId: selectedSubject?.id ?? null,
    grade: selectedGrade,
    sort: selectedSort === "name" ? "name" : null,
    ...(organizationIdFilter ? { organizationIds: organizationIdFilter } : {}),
    ...(distanceByOrganizationId ? { distanceByOrganizationId } : {})
  }
  const view = {
    initialQuery: selectedQuery ?? "",
    locationMode, locationLabel: locationFilterLabel, radiusKm,
    regionCatalog, regionSelection, subjectCatalog,
    selectedSubjectCategory, selectedSubject, selectedSubjectLabel,
    selectedGrade, selectedGradeLabel: selectedGrade ? formatStoredTargetGrades(selectedGrade) : "전체 학년",
    selectedSort, sortDisabledReasonLabel: isNearbyMode ? ACADEMY_DISTANCE_SORT_LABEL : null
  }
  // Resolve canonical redirects before streaming, preserving the existing HTTP 307 contract.
  return <AcademiesFrame><Suspense key={JSON.stringify(resolvedSearchParams)} fallback={<AcademiesSkeleton />}>
    <AcademiesResults options={options} view={view} locationLookupFailed={locationLookupFailed} />
  </Suspense></AcademiesFrame>
}

async function AcademiesResults({ options, view, locationLookupFailed }: {
  options: Parameters<typeof getAcademiesForList>[0]
  view: Omit<ComponentProps<typeof AcademiesExplorer>, "academies" | "error">
  locationLookupFailed: boolean
}) {
  let academies: Awaited<ReturnType<typeof getAcademiesForList>> = []
  let error = locationLookupFailed
  if (!error) {
    try { academies = await getAcademiesForList({ ...options }) }
    catch { error = true }
  }
  return <AcademiesExplorer {...view} academies={academies} error={error} />
}
