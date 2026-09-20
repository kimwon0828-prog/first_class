import "server-only"

import { decodeQueryValue } from "@/features/classes/lib/classes-href"
import { getPublicClasses } from "@/features/classes/queries/get-public-classes"
import {
  canonicalizeRegionSelection,
  formatRegionSelectionLabel,
  isSameRegionSelection,
  type RegionCatalog,
  type RegionSelection
} from "@/features/location/lib/region-selection"
import { normalizeSearchRadiusKm, type SearchRadiusKm } from "@/features/location/lib/search-location"
import { readParentSearchLocation } from "@/features/location/lib/search-location-cookie"
import { findNearbyOrganizations } from "@/features/location/queries/find-nearby-organizations"
import { findOrganizationIdsByAdministrativeRegion } from "@/features/location/queries/find-organizations-by-region"
import { getClassesRegionCatalog } from "@/features/location/queries/get-classes-region-catalog"
import { resolveSubjectQuerySelection } from "@/features/subjects/lib/subject-query"
import { getSelectableSubjectCatalog } from "@/features/subjects/queries/get-subject-master"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import type { SubjectCatalogCategory } from "@/shared/lib/subject-master"

/**
 * Home(/) 과 Search(/classes) 가 공유하는 수업 조회 맥락.
 *
 * 두 화면은 역할이 다르지만 같은 것을 읽는다 — 과목 catalog, 지역 catalog,
 * 지금 고른 지역, 그리고 그 조건으로 공개된 수업. route 를 나누면서 이 순서와
 * 규칙이 두 벌로 갈라지면 두 화면이 서로 다른 결과를 말하게 된다.
 *
 * ⚠️ 새 adapter method 를 만들지 않는다. 기존 조회를 그대로 조립만 한다.
 * ⚠️ query 이름 · canonicalization 규칙 · 지역 우선순위를 바꾸지 않는다.
 */
export type ClassDiscoverySearchParams = {
  child?: string
  region?: string
  q?: string
  subjectCategory?: string
  subject?: string
  radius?: string
  sido?: string
  sigungu?: string
  bname?: string
}

export type ClassLocationMode = "all" | "nearby" | "region"

export type ClassDiscoveryContext = {
  subjectCatalog: SubjectCatalogCategory[]
  regionCatalog: RegionCatalog
  selectedQuery: string | null
  selectedSubjectCategory: SubjectCatalogCategory | null
  selectedSubject: { id: string; code: string; name: string } | null
  locationMode: ClassLocationMode
  isNearbyMode: boolean
  isRegionMode: boolean
  radiusKm: SearchRadiusKm
  radiusQueryValue: string | null
  regionSelection: RegionSelection | null
  regionSelectionLabel: string | null
  regionQueryValues: { sido: string | null; sigungu: string | null; bname: string | null }
  locationFilterLabel: string
  /** URL 을 canonical 형태로 고쳐야 하는가. 고칠 주소는 canonicalParams 로 만든다. */
  shouldCanonicalize: boolean
  canonicalParams: {
    subjectCategory: string | null
    subject: string | null
    q: string | null
    radius: string | null
    sido: string | null
    sigungu: string | null
    bname: string | null
  }
  classes: ClassSummary[]
  error: string | null
}

type ResolveOptions = {
  /** 이 개수만 쓰는 화면이면 조회도 그만큼만 한다. 필터가 걸린 목록에는 쓰지 않는다. */
  discoveryFetchLimit?: number
}

export const resolveClassDiscoveryContext = async (
  params: ClassDiscoverySearchParams | undefined,
  options: ResolveOptions = {}
): Promise<ClassDiscoveryContext> => {
  const selectedQueryText =
    typeof params?.q === "string" && params.q.trim().length > 0 ? params.q.trim() : null
  const decodedSubjectCategory = decodeQueryValue(params?.subjectCategory)
  const decodedSubject = decodeQueryValue(params?.subject)

  // 서로 의존하지 않는 셋이라 함께 시작한다.
  const [subjectCatalog, searchLocation, regionCatalog] = await Promise.all([
    getSelectableSubjectCatalog() as Promise<SubjectCatalogCategory[]>,
    readParentSearchLocation(),
    getClassesRegionCatalog()
  ])

  const {
    category: selectedSubjectCategory,
    subject: selectedSubject,
    shouldCanonicalize: shouldCanonicalizeSubjectQuery
  } = resolveSubjectQuerySelection(subjectCatalog, {
    subjectCategory: decodedSubjectCategory,
    subject: decodedSubject
  })

  const radiusKm = normalizeSearchRadiusKm(params?.radius)
  const rawRegionSelection = {
    sido: decodeQueryValue(params?.sido),
    sigungu: decodeQueryValue(params?.sigungu),
    bname: decodeQueryValue(params?.bname)
  }
  // URL 값은 신뢰하지 않는다. catalog 로 계층을 재검증하고 검증되지 않는 하위 단계는 잘라낸다.
  const regionSelection = canonicalizeRegionSelection(regionCatalog, rawRegionSelection)
  // 명시적인 행정지역 선택이 있으면 남아 있는 location cookie 보다 우선한다.
  const locationMode: ClassLocationMode = regionSelection
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
  // legacy academy-area query 는 더 이상 필터가 아니다. 발견되면 canonical URL 에서 제거만 한다.
  const hasLegacyRegionQuery = Boolean(decodeQueryValue(params?.region))
  const shouldCanonicalizeRegionQuery = !isSameRegionSelection(regionSelection, rawRegionSelection)

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

  const shouldSkipClassFetch =
    distanceByOrganizationId?.size === 0 || regionOrganizationIds?.length === 0
  const organizationIdFilter = distanceByOrganizationId
    ? [...distanceByOrganizationId.keys()]
    : regionOrganizationIds

  // 필터가 하나도 없는 화면만 조회 개수를 줄인다. 필터가 걸린 결과는 임의로 자르지 않는다.
  const canLimitDiscoveryFetch =
    Boolean(options.discoveryFetchLimit) &&
    !selectedQueryText &&
    !selectedSubjectCategory &&
    !selectedSubject &&
    locationMode === "all" &&
    !organizationIdFilter

  const { data: classes, error: classesError } =
    shouldSkipClassFetch || locationLookupFailed
      ? { data: [] as ClassSummary[], error: null }
      : await getPublicClasses({
          subjectCategoryId: selectedSubjectCategory?.id,
          subjectId: selectedSubject?.id,
          query: selectedQueryText ?? undefined,
          ...(organizationIdFilter ? { organizationIds: organizationIdFilter } : {}),
          // 지역 검색은 거리 검색이 아니므로 distanceKm 을 붙이지 않는다.
          ...(distanceByOrganizationId ? { distanceByOrganizationId } : {}),
          ...(canLimitDiscoveryFetch ? { limit: options.discoveryFetchLimit } : {})
        })

  const sortedClasses =
    isNearbyMode && distanceByOrganizationId
      ? classes
          .filter(
            (item): item is ClassSummary & { distanceKm: number } =>
              typeof item.distanceKm === "number"
          )
          .sort(
            (left, right) => left.distanceKm - right.distanceKm || left.id.localeCompare(right.id)
          )
      : classes

  const regionSelectionLabel = regionSelection ? formatRegionSelectionLabel(regionSelection) : null

  return {
    subjectCatalog,
    regionCatalog,
    selectedQuery: selectedQueryText,
    selectedSubjectCategory: selectedSubjectCategory ?? null,
    selectedSubject: selectedSubject ?? null,
    locationMode,
    isNearbyMode,
    isRegionMode,
    radiusKm,
    radiusQueryValue,
    regionSelection,
    regionSelectionLabel,
    regionQueryValues,
    locationFilterLabel: isRegionMode
      ? regionSelectionLabel ?? "지역"
      : isNearbyMode
        ? `현재 위치 · ${radiusKm}km`
        : "전체",
    shouldCanonicalize:
      hasLegacyRegionQuery || shouldCanonicalizeSubjectQuery || shouldCanonicalizeRegionQuery,
    canonicalParams: {
      subjectCategory: selectedSubjectCategory?.code ?? null,
      subject: selectedSubject?.code ?? null,
      q: selectedQueryText,
      radius: radiusQueryValue,
      ...regionQueryValues
    },
    classes: sortedClasses,
    error:
      classesError ??
      (locationLookupFailed
        ? isRegionMode
          ? "지역 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
          : "주변 학원을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
        : null)
  }
}
