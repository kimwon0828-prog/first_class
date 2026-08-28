import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import { resolveCurrentAuth } from "@/features/auth/lib/current-auth"
import { getPublicClassCardScheduleSummaries } from "@/features/classes/queries/get-public-class-card-schedule-summaries"
import { getSelectableSubjectCatalog } from "@/features/subjects/queries/get-subject-master"
import { resolveSubjectQuerySelection } from "@/features/subjects/lib/subject-query"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import {
  formatClassSubjectDisplayLabel,
  type SubjectCatalogCategory
} from "@/shared/lib/subject-master"
import { ClassesSearchPill } from "@/features/classes/ui/classes-region-select"
import { LocationFilter } from "@/features/location/ui/location-filter"
import {
  canonicalizeRegionSelection,
  formatAdministrativeRegionLabel,
  formatRegionSelectionLabel,
  isSameRegionSelection
} from "@/features/location/lib/region-selection"
import { getClassesRegionCatalog } from "@/features/location/queries/get-classes-region-catalog"
import { findOrganizationIdsByAdministrativeRegion } from "@/features/location/queries/find-organizations-by-region"
import { readParentSearchLocation } from "@/features/location/lib/search-location-cookie"
import {
  formatDistanceLabel,
  nextWiderSearchRadiusKm,
  normalizeSearchRadiusKm
} from "@/features/location/lib/search-location"
import { findNearbyOrganizations } from "@/features/location/queries/find-nearby-organizations"
import { ClassCard } from "@/features/classes/ui/class-card"
import { ParentFooter } from "@/features/classes/ui/parent-footer"
import { getPublicClasses } from "@/features/classes/queries/get-public-classes"
import { ClassesBottomNav } from "./classes-bottom-nav"
import styles from "./page.module.css"

export const metadata: Metadata = {
  alternates: {
    canonical: "/"
  }
}

type ClassesPageProps = {
  searchParams?: Promise<{
    region?: string
    q?: string
    subjectCategory?: string
    subject?: string
    radius?: string
    sido?: string
    sigungu?: string
    bname?: string
  }>
}

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

type AvailableClassCard = {
  classItem: ClassSummary
  academyName: string
  scheduleSummary: string
}

const normalizeText = (value: string | null | undefined) => (value ?? "").trim().toLowerCase()

const getClassSubjectLabel = (item: ClassSummary) =>
  formatClassSubjectDisplayLabel(item) || "과목 정보 준비 중"

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

const matchesKeyword = (item: ClassSummary, keywords: readonly string[]) => {
  const haystack = normalizeText(
    [item.title, item.subject, getClassSubjectLabel(item), item.description, item.targetAge, item.classFormat]
      .filter(Boolean)
      .join(" ")
  )
  return keywords.some((keyword) => haystack.includes(normalizeText(keyword)))
}

// 기본(필터 없음) 화면이 실제로 소비하는 최대 개수.
// selectedStageClasses = slice(0, 8), topAvailableClasses = slice(0, 10) 이므로 10 이면 충분하고,
// 이 값을 줄이면 화면 결과가 달라진다. 필터가 걸린 화면에는 적용하지 않는다.
const DISCOVERY_CLASS_FETCH_LIMIT = 10

const isAdvancedCurationClass = (item: ClassSummary) =>
  matchesKeyword(item, ["영재", "사고력", "과학", "코딩", "로봇", "탐구", "심화", "실험", "초3", "초4", "초5", "초6"])

const buildCurationList = (
  classes: ClassSummary[],
  predicate: (item: ClassSummary) => boolean,
  limit: number,
  excludeIds: Set<string> = new Set()
) => {
  const matched = classes.filter((item) => !excludeIds.has(item.id) && predicate(item))
  const fallback = classes.filter((item) => !excludeIds.has(item.id) && !matched.some((picked) => picked.id === item.id))
  return [...matched, ...fallback].slice(0, limit)
}

const escapeQueryValue = (value: string) =>
  value
    .replace(/%/g, "%25")
    .replace(/&/g, "%26")
    .replace(/=/g, "%3D")
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F")
    .replace(/ /g, "%20")

const buildClassesHref = (params: {
  subjectCategory?: string | null
  subject?: string | null
  q?: string | null
  radius?: string | null
  sido?: string | null
  sigungu?: string | null
  bname?: string | null
}) => {
  const parts: string[] = []
  if (params.subjectCategory) {
    parts.push(`subjectCategory=${escapeQueryValue(params.subjectCategory)}`)
  }
  if (params.subject) parts.push(`subject=${escapeQueryValue(params.subject)}`)
  if (params.q) parts.push(`q=${escapeQueryValue(params.q)}`)
  if (params.radius) parts.push(`radius=${escapeQueryValue(params.radius)}`)
  if (params.sido) parts.push(`sido=${escapeQueryValue(params.sido)}`)
  if (params.sigungu) parts.push(`sigungu=${escapeQueryValue(params.sigungu)}`)
  if (params.bname) parts.push(`bname=${escapeQueryValue(params.bname)}`)
  return parts.length ? `/classes?${parts.join("&")}` : "/classes"
}

// 카드 부제는 organization 의 행정지역 metadata 로만 만든다.
// metadata 가 없으면 지역 표시를 생략하고 과목만 남긴다. legacy region fallback 없음.
const buildCardSecondaryLabel = (item: ClassSummary) => {
  const subjectLabel = getClassSubjectLabel(item)
  const regionLabel = item.organization
    ? formatAdministrativeRegionLabel(item.organization)
    : null

  return regionLabel ? `${regionLabel} · ${subjectLabel}` : subjectLabel
}

export default async function ClassesPage({ searchParams }: ClassesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  // legacy academy-area query 는 더 이상 필터가 아니다. 발견되면 canonical URL 에서 제거만 한다.
  const hasLegacyRegionQuery = Boolean(decodeQueryValue(resolvedSearchParams?.region))
  const selectedQuery =
    typeof resolvedSearchParams?.q === "string" && resolvedSearchParams.q.trim().length > 0
      ? resolvedSearchParams.q.trim()
      : undefined
  const decodedSubjectCategory = decodeQueryValue(resolvedSearchParams?.subjectCategory)
  const decodedSubject = decodeQueryValue(resolvedSearchParams?.subject)
  // 이 셋은 서로 의존하지 않으므로 함께 시작한다.
  // 아래의 canonicalization/redirect 순서와 위치 조회 시점은 그대로 유지한다.
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

  if (hasLegacyRegionQuery || shouldCanonicalizeSubjectQuery || shouldCanonicalizeRegionQuery) {
    redirect(
      buildClassesHref({
        subjectCategory: selectedSubjectCategory?.code ?? null,
        subject: selectedSubject?.code ?? null,
        q: selectedQuery ?? null,
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

  const shouldSkipClassFetch =
    distanceByOrganizationId?.size === 0 || regionOrganizationIds?.length === 0

  const organizationIdFilter = distanceByOrganizationId
    ? [...distanceByOrganizationId.keys()]
    : regionOrganizationIds

  // 필터가 하나도 없는 기본 discovery/home 화면은 앞의 DISCOVERY_CLASS_FETCH_LIMIT 개만 사용한다.
  // 필터가 하나라도 걸리면(검색어/과목/지역/현재위치) 결과 개수를 임의로 제한하지 않는다.
  const canLimitDiscoveryFetch =
    !selectedQuery &&
    !selectedSubjectCategory &&
    !selectedSubject &&
    locationMode === "all" &&
    !organizationIdFilter

  const [{ data: classes, error: classesError }, auth] = await Promise.all([
    shouldSkipClassFetch || locationLookupFailed
      ? Promise.resolve({ data: [] as ClassSummary[], error: null })
      : getPublicClasses({
          subjectCategoryId: selectedSubjectCategory?.id,
          subjectId: selectedSubject?.id,
          query: selectedQuery,
          ...(organizationIdFilter ? { organizationIds: organizationIdFilter } : {}),
          // 지역 검색은 거리 검색이 아니므로 distanceKm 을 붙이지 않는다.
          ...(distanceByOrganizationId ? { distanceByOrganizationId } : {}),
          ...(canLimitDiscoveryFetch ? { limit: DISCOVERY_CLASS_FETCH_LIMIT } : {})
        }),
    resolveCurrentAuth("/classes")
  ])

  const error =
    classesError ??
    (locationLookupFailed
      ? isRegionMode
        ? "지역 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
        : "주변 학원을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
      : null)

  const filteredClasses =
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
  const { authenticated, isParentUser, isStudioUser } = auth
  const classesHref = buildClassesHref({
    subjectCategory: selectedSubjectCategory?.code ?? null,
    subject: selectedSubject?.code ?? null,
    q: selectedQuery ?? null,
    radius: radiusQueryValue,
    ...regionQueryValues
  })
  const classesHomeHref = buildClassesHref({
    subjectCategory: selectedSubjectCategory?.code ?? null,
    subject: selectedSubject?.code ?? null,
    q: selectedQuery ?? null,
    radius: radiusQueryValue,
    ...regionQueryValues
  })
  const myPageHref = "/my"
  const myApplicationsHref = "/my/applications"
  const myPageEntryHref = authenticated
    ? isParentUser
      ? myPageHref
      : isStudioUser
        ? "/studio"
        : myPageHref
    : "/auth/sign-in"
  const myApplicationsEntryHref = authenticated
    ? isParentUser
      ? myApplicationsHref
      : isStudioUser
        ? "/studio"
        : myApplicationsHref
    : `/auth/sign-in?${new URLSearchParams({ returnTo: myApplicationsHref }).toString()}`
  const isFilteredView = Boolean(selectedQuery || selectedSubjectCategory || locationMode !== "all")
  const visibleClasses = filteredClasses
  const selectedStageClasses = visibleClasses.slice(0, 8)
  const recommendedAdvancedClasses = buildCurationList(visibleClasses, isAdvancedCurationClass, 6)
  // 상세로 넘길 때도 legacy region 은 넘기지 않고, 실제 행정지역 선택만 canonical 하게 전달한다.
  const detailRegionQuery = new URLSearchParams()
  if (regionSelection?.sido) detailRegionQuery.set("sido", regionSelection.sido)
  if (regionSelection?.sigungu) detailRegionQuery.set("sigungu", regionSelection.sigungu)
  if (regionSelection?.bname) detailRegionQuery.set("bname", regionSelection.bname)
  const detailHrefForClass = (classId: string) =>
    detailRegionQuery.size
      ? `/classes/${classId}?${detailRegionQuery.toString()}`
      : `/classes/${classId}`
  const distanceLabelForClass = (item: ClassSummary) =>
    isNearbyMode && typeof item.distanceKm === "number" ? formatDistanceLabel(item.distanceKm) : null
  const regionSelectionLabel = regionSelection ? formatRegionSelectionLabel(regionSelection) : null
  const locationFilterLabel = isRegionMode
    ? regionSelectionLabel ?? "지역"
    : isNearbyMode
      ? `현재 위치 · ${radiusKm}km`
      : "전체"
  const clearRegionHref = buildClassesHref({
    subjectCategory: selectedSubjectCategory?.code ?? null,
    subject: selectedSubject?.code ?? null,
    q: selectedQuery ?? null
  })
  const widerRadiusKm = nextWiderSearchRadiusKm(radiusKm)
  const widerRadiusHref = widerRadiusKm && isNearbyMode
    ? buildClassesHref({
            subjectCategory: selectedSubjectCategory?.code ?? null,
        subject: selectedSubject?.code ?? null,
        q: selectedQuery ?? null,
        radius: String(widerRadiusKm)
      })
    : null
  const applyHrefForClass = (classId: string) => {
    const returnTo = `/classes/${classId}/apply`
    return authenticated
      ? returnTo
      : `/auth/sign-in?${new URLSearchParams({ returnTo }).toString()}`
  }
  void applyHrefForClass
  const topAvailableClasses = visibleClasses.slice(0, 10)
  const scheduleSummaryByClassId =
    !error && !isFilteredView && topAvailableClasses.length > 0
      ? await getPublicClassCardScheduleSummaries(topAvailableClasses.map((item) => item.id))
      : new Map()
  const availableClassCards: AvailableClassCard[] =
    !error && !isFilteredView
      ? topAvailableClasses.map((item) => {
          const academyName = item.organization
            ? [item.organization.name, item.organization.branchName].filter(Boolean).join(" ").trim()
            : ""
          const scheduleSummary =
            scheduleSummaryByClassId.get(item.id)?.summaryLabel ?? "예약 가능 일정 확인"

          return {
            classItem: item,
            academyName: academyName || "학원 정보 준비 중",
            scheduleSummary
          }
        })
      : []
  void recommendedAdvancedClasses
  const hasFilteredResultsSection = !error && visibleClasses.length > 0 && isFilteredView
  const hasAvailableSection = !error && visibleClasses.length > 0 && !isFilteredView && availableClassCards.length > 0
  const hasRecommendedSection = !error && visibleClasses.length > 0 && !isFilteredView && selectedStageClasses.length > 0
  const hasAnyCardSection = hasFilteredResultsSection || hasAvailableSection || hasRecommendedSection
  const shouldShowPageEmptyState = !error && !hasAnyCardSection
  const visibleAvailableClassCards = availableClassCards.slice(0, 4)
  const visibleRecommendedClasses = selectedStageClasses.slice(0, 4)

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href={classesHomeHref} className={styles.brand}>
            <Image
              src="/images/first-class-logo.png"
              alt="첫수업"
              width={70}
              height={23}
              priority
            />
          </Link>

          <ClassesSearchPill
            initialQuery={selectedQuery ?? ""}
            placeholder="우리 아이에게 맞는 첫수업 찾기"
            className={styles.searchForm}
            pillClassName={styles.searchPill}
            inputClassName={styles.searchInput}
          />

          {authenticated ? (
            isParentUser ? (
              <Link href={myPageEntryHref} className={styles.userButton} aria-label="마이페이지">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M20 21a8 8 0 1 0-16 0"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            ) : isStudioUser ? (
              <Link href="/studio" className={styles.loginButton} aria-label="스튜디오로 이동">
                스튜디오
              </Link>
            ) : (
              <Link href={myPageEntryHref} className={styles.loginButton} aria-label="계정 확인">
                계정 확인
              </Link>
            )
          ) : (
            <Link href={myPageEntryHref} className={styles.loginButton} aria-label="로그인">
              로그인
            </Link>
          )}
        </header>

        <div className={styles.content}>
          <section className={styles.filterSection} aria-label="위치 설정">
            <div className={styles.filterPanel}>
              <LocationFilter
                mode={locationMode}
                label={locationFilterLabel}
                regionCatalog={regionCatalog}
                regionSelection={regionSelection}
                radiusKm={radiusKm}
                className={styles.filterInlineItem}
                triggerClassName={styles.filterInlineTrigger}
                labelClassName={styles.filterInlineLabel}
                iconClassName={styles.filterInlineIcon}
                chevronWrapClassName={styles.filterInlineChevron}
                openChevronClassName={styles.filterInlineChevronOpen}
                radiusRailClassName={styles.radiusRail}
                radiusChipClassName={styles.radiusChip}
                radiusChipActiveClassName={styles.radiusChipActive}
              />
            </div>
          </section>

          <section className={styles.heroSection} aria-label="첫수업 소개 배너">
            <article className={styles.heroCard}>
              <Image
                src="/images/hero-banner-bg.png"
                alt="첫수업 소개 배너"
                fill
                sizes="(max-width: 480px) 100vw, 480px"
                style={{ objectFit: "cover" }}
                priority
              />
              <div className={styles.heroOverlay} />
              <div className={styles.heroContent}>
                <div className={styles.heroBrand} aria-label="첫수업 로고">
                  <Image src="/images/first-class-logo.png" alt="첫수업" width={110} height={36} priority />
                </div>
                <p className={styles.heroCopy}>
                  학원 선택의 시작은 상담이 아니라
                  <br />
                  <strong>첫 수업</strong>이어야 합니다.
                </p>
              </div>
            </article>
          </section>

          <section className={styles.categorySection} aria-label="과목 카테고리">
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingMain}>
                <h2 className={styles.sectionHeadingTitle}>과목별 찾기</h2>
              </div>
            </div>
            <div className={styles.subjectFilters}>
              <nav className={styles.subjectChipRail} aria-label="과목 대분류">
                <Link
                  href={buildClassesHref({
                                subjectCategory: null,
                    subject: null,
                    q: selectedQuery ?? null,
                    radius: radiusQueryValue,
                    ...regionQueryValues
                  })}
                  className={`${styles.subjectChip} ${!selectedSubjectCategory ? styles.subjectChipActive : ""}`}
                  aria-current={!selectedSubjectCategory ? "page" : undefined}
                >
                  전체
                </Link>
                {subjectCatalog.map((category) => {
                  const isActive = selectedSubjectCategory?.id === category.id
                  return (
                    <Link
                      key={category.id}
                      href={buildClassesHref({
                                        subjectCategory: category.code,
                        subject: null,
                        q: selectedQuery ?? null,
                        radius: radiusQueryValue,
                        ...regionQueryValues
                      })}
                      className={`${styles.subjectChip} ${isActive ? styles.subjectChipActive : ""}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {category.name}
                    </Link>
                  )
                })}
              </nav>

              {selectedSubjectCategory ? (
                <nav className={styles.subjectDetailChipRail} aria-label={`${selectedSubjectCategory.name} 세부 과목`}>
                  <Link
                    href={buildClassesHref({
                                    subjectCategory: selectedSubjectCategory.code,
                      subject: null,
                      q: selectedQuery ?? null,
                      radius: radiusQueryValue,
                      ...regionQueryValues
                    })}
                    className={`${styles.subjectDetailChip} ${!selectedSubject ? styles.subjectDetailChipActive : ""}`}
                    aria-current={!selectedSubject ? "page" : undefined}
                  >
                    전체
                  </Link>
                  {selectedSubjectCategory.subjects.map((subject) => {
                    const isActive = selectedSubject?.id === subject.id
                    return (
                      <Link
                        key={subject.id}
                        href={buildClassesHref({
                                            subjectCategory: selectedSubjectCategory.code,
                          subject: subject.code,
                          q: selectedQuery ?? null,
                          radius: radiusQueryValue,
                          ...regionQueryValues
                        })}
                        className={`${styles.subjectDetailChip} ${isActive ? styles.subjectDetailChipActive : ""}`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {subject.name}
                      </Link>
                    )
                  })}
                </nav>
              ) : null}
            </div>
          </section>

          {error ? (
            <section className={styles.sectionBlock}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  첫수업 <span className={styles.sectionTitleAccent}>불러오기</span>
                </h2>
              </div>
              <div className={styles.stateCard}>
                <p className={styles.stateTitle}>{error}</p>
                <p className={styles.stateDesc}>잠시 후 다시 시도해 주세요.</p>
                <Link href={classesHref} className={styles.retryLink}>
                  다시 불러오기
                </Link>
              </div>
            </section>
          ) : null}

          {shouldShowPageEmptyState ? (
            <section className={styles.pageEmptyState}>
              <div className={styles.pageEmptyInner}>
                <p className={styles.pageEmptyTitle}>
                  {isNearbyMode
                    ? `선택한 위치 ${radiusKm}km 이내에 예약 가능한 수업이 없어요`
                    : isRegionMode
                      ? "선택한 지역에 예약 가능한 수업이 없어요"
                      : "선택하신 조건에 맞는 수업이 아직 없어요"}
                </p>
                <p className={styles.pageEmptyDesc}>
                  {isNearbyMode
                    ? "검색 반경을 넓히거나 다른 조건으로 찾아보세요"
                    : isRegionMode
                      ? "다른 지역이나 조건으로 찾아보세요"
                      : "다른 학년이나 조건으로 찾아보세요"}
                </p>
                {isNearbyMode && widerRadiusKm && widerRadiusHref ? (
                  <Link href={widerRadiusHref} className={styles.resetButton}>
                    {`${widerRadiusKm}km로 넓히기`}
                  </Link>
                ) : isRegionMode ? (
                  <Link href={clearRegionHref} className={styles.resetButton}>
                    전체 수업 보기
                  </Link>
                ) : null}
                <Link href="/classes" className={styles.resetButton}>
                  조건 초기화
                </Link>
              </div>
            </section>
          ) : null}

          {hasFilteredResultsSection ? (
            <section className={styles.sectionBlock}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  {selectedSubjectCategory && selectedQuery
                    ? `${selectedSubjectCategory.name}${selectedSubject ? ` · ${selectedSubject.name}` : ""} · "${selectedQuery}" 결과`
                    : selectedSubjectCategory
                      ? `${selectedSubjectCategory.name}${selectedSubject ? ` · ${selectedSubject.name}` : ""} 수업`
                      : selectedQuery
                        ? `"${selectedQuery}" 검색 결과`
                        : isRegionMode
                          ? `${regionSelectionLabel} 수업`
                          : `${radiusKm}km 이내 수업`}
                </h2>
{selectedSubjectCategory || selectedQuery ? (
                  <Link
                    href={buildClassesHref({
                                    subjectCategory: null,
                      subject: null,
                      q: null,
                      radius: radiusQueryValue,
                      ...regionQueryValues
                    })}
                    className={styles.sectionLink}
                  >
                    필터 해제
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path
                        d="M9 18l6-6-6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                ) : null}
              </div>
              <ul className={styles.resultGrid}>
                {visibleClasses.map((item) => {
                  const academyName = item.organization
                    ? [item.organization.name, item.organization.branchName].filter(Boolean).join(" ").trim()
                    : null

                  return (
                    <li key={item.id} className={styles.resultGridItem}>
                      <ClassCard
                        href={detailHrefForClass(item.id)}
                        thumbnailUrl={item.coverImageUrl}
                        thumbnailAlt={`${item.title} 대표 이미지`}
                        title={item.title}
                        academyName={academyName}
                        subjectLabel={getClassSubjectLabel(item)}
                        secondaryLabel={buildCardSecondaryLabel(item)}
                        priceLabel={formatPrice(item.trialPrice)}
                        isFree={item.trialPrice <= 0}
                        distanceLabel={distanceLabelForClass(item)}
                        classId={item.id}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {!isFilteredView && hasAnyCardSection ? (
            <>
              {hasAvailableSection ? (
                <section className={styles.sectionBlock}>
                  <div className={styles.sectionHeading}>
                    <div className={styles.sectionHeadingMain}>
                      <h2 className={styles.sectionHeadingTitle}>새로 열린 수업</h2>
                    </div>
                    <Link href={classesHref} className={styles.sectionHeadingLink}>
                      전체보기
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M9 18l6-6-6-6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Link>
                  </div>
                  <ul
                    className={`${styles.cardRail} ${visibleAvailableClassCards.length < 3 ? styles.cardRailStatic : styles.cardRailScrollable}`}
                  >
                    {visibleAvailableClassCards.map(({ classItem, academyName, scheduleSummary }) => (
                      <li key={classItem.id} className={styles.cardRailItem}>
                        <ClassCard
                          href={detailHrefForClass(classItem.id)}
                          thumbnailUrl={classItem.coverImageUrl}
                          thumbnailAlt={`${classItem.title} 대표 이미지`}
                          title={classItem.title}
                          academyName={academyName}
                          subjectLabel={getClassSubjectLabel(classItem)}
                          secondaryLabel={buildCardSecondaryLabel(classItem)}
                          priceLabel={formatPrice(classItem.trialPrice)}
                          isFree={classItem.trialPrice <= 0}
                          statusBadge={{ label: "예약 가능", tone: "open" }}
                          scheduleLabel={scheduleSummary}
                          distanceLabel={distanceLabelForClass(classItem)}
                          classId={classItem.id}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {hasRecommendedSection ? (
                <section className={styles.sectionBlock}>
                  <div className={styles.sectionHeading}>
                    <div className={styles.sectionHeadingMain}>
                      <h2 className={styles.sectionHeadingTitle}>추천 수업</h2>
                    </div>
                    <Link href={classesHref} className={styles.sectionHeadingLink}>
                      전체보기
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M9 18l6-6-6-6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Link>
                  </div>
                  <ul
                    className={`${styles.cardRail} ${visibleRecommendedClasses.length < 3 ? styles.cardRailStatic : styles.cardRailScrollable}`}
                  >
                    {visibleRecommendedClasses.map((item) => {
                      const academyName = item.organization
                        ? [item.organization.name, item.organization.branchName].filter(Boolean).join(" ").trim()
                        : null

                      return (
                        <li key={`recommended-${item.id}`} className={styles.cardRailItem}>
                          <ClassCard
                            href={detailHrefForClass(item.id)}
                            thumbnailUrl={item.coverImageUrl}
                            thumbnailAlt={`${item.title} 대표 이미지`}
                            title={item.title}
                            academyName={academyName}
                            subjectLabel={getClassSubjectLabel(item)}
                            secondaryLabel={buildCardSecondaryLabel(item)}
                            priceLabel={formatPrice(item.trialPrice)}
                            isFree={item.trialPrice <= 0}
                            statusBadge={{ label: "추천", tone: "muted" }}
                            distanceLabel={distanceLabelForClass(item)}
                            classId={item.id}
                          />
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ) : null}

              {/*
              <section className={styles.sectionBlock}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>
                    영재원 <span className={styles.sectionTitleAccent}>준비</span>, 체험으로 시작하기
                  </h2>
                  <Link href={classesHref} className={styles.sectionLink}>
                    전체보기
                  </Link>
                </div>
                <ul className={styles.grid}>
                  {recommendedAdvancedClasses.slice(0, 4).map((item) => (
                    <li key={item.id} className={styles.slideItem}>
                      <ClassCard
                        href={detailHrefForClass(item.id)}
                        thumbnailUrl={item.coverImageUrl}
                        thumbnailAlt={`${item.title} 대표 이미지`}
                        title={item.title}
                        academyName={
                          item.organization
                            ? [item.organization.name, item.organization.branchName].filter(Boolean).join(" ").trim()
                            : null
                        }
                        subjectLabel={getClassSubjectLabel(item)}
                        gradeLabel={formatStoredTargetGrades(item.targetAge)}
                        priceLabel={formatPrice(item.trialPrice)}
                        isFree={item.trialPrice <= 0}
                        statusBadge={{ label: "탐구형 추천", tone: "muted" }}
                        classId={item.id}
                      />
                    </li>
                  ))}
                </ul>
              </section>
              */}
            </>
          ) : null}

          <section className={styles.partnerSection}>
            <div className={styles.partnerCard}>
              <span className={styles.partnerEyebrow}>첫수업 파트너</span>
              <strong className={styles.partnerTitle}>우리 학원도 첫수업에서 학부모를 만나보세요</strong>
              <span className={styles.partnerCopy}>학원 소개와 공개 수업 등록으로 체험 신청을 받을 수 있어요.</span>
              <Link href="/partner" className={styles.partnerButton}>
                파트너 신청하기
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </div>
          </section>

          <ParentFooter />
        </div>
      </div>

      <ClassesBottomNav
        classesHomeHref={classesHomeHref}
        myApplicationsEntryHref={myApplicationsEntryHref}
      />
    </main>
  )
}
