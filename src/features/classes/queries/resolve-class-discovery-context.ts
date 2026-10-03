import "server-only"

import { decodeQueryValue } from "@/features/classes/lib/classes-href"
import { getPublicClasses } from "@/features/classes/queries/get-public-classes"
import type { RegionCatalog, RegionSelection } from "@/features/location/lib/region-selection"
import { normalizeSearchRadiusKm, type SearchRadiusKm } from "@/features/location/lib/search-location"
import { PARENT_LAUNCH_REGION, LEGACY_PARENT_LOCATION_KEYS } from "@/features/location/lib/parent-launch-region"
import { resolveSubjectQuerySelection } from "@/features/subjects/lib/subject-query"
import { getSelectableSubjectCatalog } from "@/features/subjects/queries/get-subject-master"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import type { SubjectCatalogCategory } from "@/shared/lib/subject-master"

/** Home and Classes share one Parent launch scope; legacy location URLs cannot widen it. */
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

  const subjectCatalog = await getSelectableSubjectCatalog() as SubjectCatalogCategory[]
  const {
    category: selectedSubjectCategory,
    subject: selectedSubject,
    shouldCanonicalize: shouldCanonicalizeSubjectQuery
  } = resolveSubjectQuerySelection(subjectCatalog, {
    subjectCategory: decodedSubjectCategory,
    subject: decodedSubject
  })

  const regionQueryValues = { sido: null, sigungu: null, bname: null }
  const canLimitDiscoveryFetch = Boolean(options.discoveryFetchLimit) && !selectedQueryText && !selectedSubjectCategory && !selectedSubject
  const { data: classes, error } = await getPublicClasses({
    subjectCategoryId: selectedSubjectCategory?.id,
    subjectId: selectedSubject?.id,
    query: selectedQueryText ?? undefined,
    launchRegion: PARENT_LAUNCH_REGION,
    ...(canLimitDiscoveryFetch ? { limit: options.discoveryFetchLimit } : {})
  })
  return {
    subjectCatalog,
    regionCatalog: [],
    selectedQuery: selectedQueryText,
    selectedSubjectCategory: selectedSubjectCategory ?? null,
    selectedSubject: selectedSubject ?? null,
    locationMode: "all",
    isNearbyMode: false,
    isRegionMode: false,
    radiusKm: normalizeSearchRadiusKm(undefined),
    radiusQueryValue: null,
    regionSelection: null,
    regionSelectionLabel: null,
    regionQueryValues,
    locationFilterLabel: PARENT_LAUNCH_REGION.label,
    shouldCanonicalize: shouldCanonicalizeSubjectQuery || LEGACY_PARENT_LOCATION_KEYS.some(key => params?.[key] !== undefined),
    canonicalParams: {
      subjectCategory: selectedSubjectCategory?.code ?? null,
      subject: selectedSubject?.code ?? null,
      q: selectedQueryText,
      radius: null,
      ...regionQueryValues
    },
    classes,
    error
  }
}
