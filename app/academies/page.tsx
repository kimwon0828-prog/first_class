import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"
import { getAcademiesForList } from "@/features/academies/queries/get-academies-for-list"
import { AcademiesExplorer } from "@/features/academies/ui/academies-explorer"
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
import { formatStoredTargetGrades } from "@/shared/constants/grade-options"

import styles from "./page.module.css"
import { POC_DISCOVERY_HREF } from "@/shared/config/discovery"

type AcademiesPageProps = {
  searchParams?: Promise<{
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
  subject?: string | null
  grade?: string | null
  sort?: string | null
  radius?: string | null
  sido?: string | null
  sigungu?: string | null
  bname?: string | null
}) => {
  const parts: string[] = []
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
  const subject =
    typeof resolvedSearchParams?.subject === "string" && resolvedSearchParams.subject.trim().length > 0
      ? resolvedSearchParams.subject.trim()
      : null
  // legacy academy-area query 는 더 이상 필터가 아니다. 발견되면 canonical URL 에서 제거만 한다.
  const hasLegacyRegionQuery =
    typeof resolvedSearchParams?.region === "string" && resolvedSearchParams.region.trim().length > 0
  const selectedGrade =
    typeof resolvedSearchParams?.grade === "string" && resolvedSearchParams.grade.trim().length > 0
      ? resolvedSearchParams.grade.trim()
      : null
  const selectedSort =
    typeof resolvedSearchParams?.sort === "string" && resolvedSearchParams.sort.trim().length > 0
      ? resolvedSearchParams.sort.trim()
      : "추천순"

  const [searchLocation, regionCatalog] = await Promise.all([
    readParentSearchLocation(),
    getAcademiesRegionCatalog()
  ])
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

  if (hasLegacyRegionQuery || shouldCanonicalizeRegionQuery) {
    redirect(
      buildAcademiesHref({
        subject,
        grade: selectedGrade,
        sort: resolvedSearchParams?.sort ?? null,
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

  const [{ academies, selectedSubjectLabel }, session] = await Promise.all([
    locationLookupFailed
      ? Promise.resolve({ academies: [], selectedSubjectLabel: null })
      : getAcademiesForList({
          subject,
          grade: selectedGrade,
          sort: selectedSort,
          ...(organizationIdFilter ? { organizationIds: organizationIdFilter } : {}),
          ...(distanceByOrganizationId ? { distanceByOrganizationId } : {})
        }),
    getSession()
  ])
  const locationFilterLabel = isRegionMode
    ? regionSelection
      ? formatRegionSelectionLabel(regionSelection)
      : "지역"
    : isNearbyMode
      ? `현재 위치 · ${radiusKm}km`
      : "전체"
  const profile = session ? await getMyProfile() : null
  const isParentUser = profile?.role === "parent"
  const isStudioUser =
    profile?.dbRole === "teacher" || profile?.dbRole === "academy" || profile?.dbRole === "admin"
  const myApplicationsHref = "/my/applications"
  const myApplicationsEntryHref = session
    ? isParentUser
      ? myApplicationsHref
      : isStudioUser
        ? "/studio"
        : myApplicationsHref
    : `/auth/sign-in?${new URLSearchParams({ returnTo: myApplicationsHref }).toString()}`

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>과목별 학원 리스트</p>
            <h1 className={styles.title}>학원 찾기</h1>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.iconButton} aria-label="검색 기능 준비 중">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16ZM21 21l-4.35-4.35"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <Link href="/favorites" className={styles.iconButton} aria-label="관심수업">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        </header>

        <div className={styles.summaryBar}>
          <p className={styles.summaryText}>
            {selectedSubjectLabel
              ? `${selectedSubjectLabel} 수업을 운영하는 학원을 한눈에 둘러보세요.`
              : "과목별로 운영 중인 학원과 대표 수업을 한 번에 둘러보세요."}
          </p>
          <p className={styles.summaryMeta}>
            {academies.length > 0
              ? `${academies.length}개 학원`
              : "조건에 맞는 학원을 준비 중"}
          </p>
        </div>

        <AcademiesExplorer
          academies={academies}
          locationMode={locationMode}
          locationLabel={locationFilterLabel}
          radiusKm={radiusKm}
          regionCatalog={regionCatalog}
          regionSelection={regionSelection}
          selectedSubjectLabel={selectedSubjectLabel}
          selectedGradeLabel={selectedGrade ? formatStoredTargetGrades(selectedGrade) : null}
          selectedSortLabel={selectedSort}
        />
      </div>

      <nav className={styles.bottomNav} aria-label="하단 탭">
        <Link href={POC_DISCOVERY_HREF} className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>홈</span>
        </Link>
        <Link href="/academies" className={`${styles.navItem} ${styles.navItemActive}`}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M12 21s-6-5.47-6-10a6 6 0 1 1 12 0c0 4.53-6 10-6 10Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span>학원찾기</span>
        </Link>
        <Link href="/favorites" className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>관심수업</span>
        </Link>
        <Link href={myApplicationsEntryHref} className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>내 신청</span>
        </Link>
      </nav>
    </main>
  )
}
