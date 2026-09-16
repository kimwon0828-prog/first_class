import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import { resolveCurrentAuth } from "@/features/auth/lib/current-auth"
import { buildClassesHref } from "@/features/classes/lib/classes-href"
import { getPublicClassCardScheduleSummaries } from "@/features/classes/queries/get-public-class-card-schedule-summaries"
import {
  resolveClassDiscoveryContext,
  type ClassDiscoverySearchParams
} from "@/features/classes/queries/resolve-class-discovery-context"
import { ClassCard } from "@/features/classes/ui/class-card"
import { ClassesSearchPill } from "@/features/classes/ui/classes-region-select"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { formatDistanceLabel, nextWiderSearchRadiusKm } from "@/features/location/lib/search-location"
import { LocationFilter } from "@/features/location/ui/location-filter"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import { clearSearchLocationAction } from "@/features/location/actions/search-location-actions"

import styles from "./page.module.css"

/*
 * 수업찾기(Search / Browse).
 *
 * ⚠️ 이 화면은 Home 이 아니다. Home 은 / 다.
 *    브랜드 배너 · 지금 확인할 것 · 다가오는 수업 · 홈 큐레이션은 여기 오지 않는다.
 *
 * query 계약은 그대로다: q · subjectCategory · subject · radius · sido · sigungu · bname
 */
export const metadata: Metadata = {
  title: "수업찾기 | 첫수업",
  description:
    "지역과 과목으로 학원 체험수업과 레벨테스트를 찾아보세요. 첫수업에서 원하는 조건의 첫 수업을 비교하고 예약할 수 있습니다.",
  alternates: {
    canonical: "/classes"
  }
}

type ClassesPageProps = {
  searchParams?: Promise<ClassDiscoverySearchParams>
}

// 필터가 하나도 없는 기본 목록이 소비하는 최대 개수.
const DISCOVERY_CLASS_FETCH_LIMIT = 10

// 결과 카드에 예약 가능 일정을 붙일 최대 개수.
const SCHEDULE_SUMMARY_LIMIT = 20

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

const getClassSubjectLabel = (item: ClassSummary) =>
  formatClassSubjectDisplayLabel(item) || "과목 정보 준비 중"

// 카드 부제는 organization 의 행정지역 metadata 로만 만든다.
// metadata 가 없으면 지역 표시를 생략하고 과목만 남긴다. legacy region fallback 없음.
const buildCardSecondaryLabel = (item: ClassSummary) => {
  const subjectLabel = getClassSubjectLabel(item)
  const regionLabel = item.organization ? formatAdministrativeRegionLabel(item.organization) : null

  return regionLabel ? `${regionLabel} · ${subjectLabel}` : subjectLabel
}

const SubjectGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
)

/*
 * 저장된 현재 위치를 지운다.
 *
 * 반경 필터는 URL 이 아니라 cookie 에서 오므로 링크로는 해제할 수 없다.
 * 해제 수단이 없으면 학부모가 지울 수 없는 필터가 걸린 채로 남는다.
 */
const RemoveGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)

async function clearNearbyLocationAction() {
  "use server"
  await clearSearchLocationAction()
}

export default async function ClassesSearchPage({ searchParams }: ClassesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined

  const [context, auth] = await Promise.all([
    resolveClassDiscoveryContext(resolvedSearchParams, {
      discoveryFetchLimit: DISCOVERY_CLASS_FETCH_LIMIT
    }),
    resolveCurrentAuth("/classes")
  ])

  if (context.shouldCanonicalize) {
    redirect(buildClassesHref(context.canonicalParams))
  }

  const {
    subjectCatalog,
    selectedQuery,
    selectedSubjectCategory,
    selectedSubject,
    isNearbyMode,
    isRegionMode,
    radiusKm,
    radiusQueryValue,
    regionQueryValues,
    regionSelectionLabel,
    classes,
    error
  } = context

  const { authenticated, isStudioUser } = auth
  const myPageEntryHref = authenticated ? (isStudioUser ? "/studio" : "/my") : "/auth/sign-in"
  const scheduleEntryHref = authenticated
    ? isStudioUser
      ? "/studio"
      : "/my/schedule"
    : `/auth/sign-in?${new URLSearchParams({ returnTo: "/my/schedule" }).toString()}`
  const recordEntryHref = authenticated
    ? isStudioUser
      ? "/studio"
      : "/record"
    : `/auth/sign-in?${new URLSearchParams({ returnTo: "/record" }).toString()}`

  /** 이 화면 안에서 필터를 바꾸는 링크. 지금 걸린 조건을 유지한 채 한 칸만 바꾼다. */
  const buildSearchHref = (
    overrides: Partial<Parameters<typeof buildClassesHref>[0]> = {}
  ) =>
    buildClassesHref({
      subjectCategory: selectedSubjectCategory?.code ?? null,
      subject: selectedSubject?.code ?? null,
      q: selectedQuery,
      radius: radiusQueryValue,
      ...regionQueryValues,
      ...overrides
    })

  const detailRegionQuery = new URLSearchParams()
  if (regionQueryValues.sido) detailRegionQuery.set("sido", regionQueryValues.sido)
  if (regionQueryValues.sigungu) detailRegionQuery.set("sigungu", regionQueryValues.sigungu)
  if (regionQueryValues.bname) detailRegionQuery.set("bname", regionQueryValues.bname)
  const detailHrefForClass = (classId: string) =>
    detailRegionQuery.size ? `/classes/${classId}?${detailRegionQuery.toString()}` : `/classes/${classId}`

  const distanceLabelForClass = (item: ClassSummary) =>
    isNearbyMode && typeof item.distanceKm === "number" ? formatDistanceLabel(item.distanceKm) : null

  const widerRadiusKm = nextWiderSearchRadiusKm(radiusKm)
  const widerRadiusHref =
    widerRadiusKm && isNearbyMode ? buildSearchHref({ radius: String(widerRadiusKm) }) : null
  const clearRegionHref = buildSearchHref({ radius: null, sido: null, sigungu: null, bname: null })

  const scheduleSummaryTargets = classes.slice(0, SCHEDULE_SUMMARY_LIMIT)
  const scheduleSummaryByClassId =
    !error && scheduleSummaryTargets.length > 0
      ? await getPublicClassCardScheduleSummaries(scheduleSummaryTargets.map((item) => item.id))
      : new Map()

  /*
   * 결과 메타.
   *
   * ⚠️ 실제 개수만 말한다. "추천" · "인기" 같은 말을 붙이지 않는다 — 그런 순위가 없다.
   */
  const resultCount = classes.length
  const resultMetaText = selectedQuery
    ? `"${selectedQuery}" 검색 결과 ${resultCount}개`
    : selectedSubject
      ? `${selectedSubject.name} 수업 ${resultCount}개`
      : selectedSubjectCategory
        ? `${selectedSubjectCategory.name} 수업 ${resultCount}개`
        : `수업 ${resultCount}개`

  /*
   * 지금 걸려 있는 조건.
   *
   * ⚠️ 현재 위치(내 주변)는 URL 이 아니라 cookie 에서 온다. 여기에 같이 보여 주지
   *    않으면 학부모는 자기도 모르게 반경 필터가 걸린 목록을 전체 목록으로 읽는다.
   */
  type ActiveFilter = { key: string; label: string; removeHref: string | null }
  const activeFilters: ActiveFilter[] = [
    selectedQuery
      ? { key: "q", label: `"${selectedQuery}"`, removeHref: buildSearchHref({ q: null }) }
      : null,
    selectedSubjectCategory
      ? {
          key: "subjectCategory",
          label: selectedSubjectCategory.name,
          removeHref: buildSearchHref({ subjectCategory: null, subject: null })
        }
      : null,
    selectedSubject
      ? { key: "subject", label: selectedSubject.name, removeHref: buildSearchHref({ subject: null }) }
      : null,
    isRegionMode
      ? {
          key: "region",
          label: regionSelectionLabel ?? "선택한 지역",
          removeHref: buildSearchHref({ sido: null, sigungu: null, bname: null })
        }
      : null,
    // 반경은 cookie 라서 링크로 지울 수 없다. 아래 form 이 지운다.
    isNearbyMode ? { key: "nearby", label: `내 주변 ${radiusKm}km`, removeHref: null } : null
  ].filter((item): item is ActiveFilter => item !== null)
  const hasActiveFilters = activeFilters.length > 0

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={`${styles.header} ${styles.headerCompact}`}>
          <div className={styles.headerTop}>
            <Link href="/" className={styles.brand} aria-label="첫수업 홈">
              <Image
                src="/images/first-class-logo.png"
                alt="첫수업"
                width={84}
                height={28}
                className={styles.brandLogo}
                priority
              />
            </Link>

            {authenticated ? (
              isStudioUser ? (
                <Link href="/studio" className={styles.headerAction} aria-label="스튜디오로 이동">
                  스튜디오
                </Link>
              ) : (
                <Link href={myPageEntryHref} className={styles.headerIconButton} aria-label="마이페이지">
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
              )
            ) : (
              <Link href={myPageEntryHref} className={styles.headerAction} aria-label="로그인">
                로그인
              </Link>
            )}
          </div>

          <h1 className={styles.searchTitle}>수업찾기</h1>

          <ClassesSearchPill
            initialQuery={selectedQuery ?? ""}
            placeholder="수업명, 학원명, 과목을 검색해보세요"
            className={styles.searchForm}
            pillClassName={styles.searchPill}
            inputClassName={styles.searchInput}
            submitButtonClassName={styles.searchSubmit}
          />
        </header>

        <div className={styles.content}>
          <section className={styles.browseFilterSection} aria-label="검색 조건">
            <div className={styles.browseFilterRow}>
              <LocationFilter
                mode={context.locationMode}
                label={context.locationFilterLabel}
                regionCatalog={context.regionCatalog}
                regionSelection={context.regionSelection}
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

            <nav className={styles.subjectChipRail} aria-label="과목 대분류">
              <Link
                href={buildSearchHref({ subjectCategory: null, subject: null })}
                className={`${styles.subjectChip} ${!selectedSubjectCategory ? styles.subjectChipActive : ""}`}
                aria-current={!selectedSubjectCategory ? "page" : undefined}
              >
                <span className={styles.subjectChipIcon} aria-hidden="true">
                  <SubjectGlyph />
                </span>
                전체
              </Link>
              {subjectCatalog.map((category) => {
                const isActive = selectedSubjectCategory?.id === category.id
                return (
                  <Link
                    key={category.id}
                    /* 상위 과목이 바뀌면 이전 세부 과목은 더 이상 유효하지 않다. 그때만 지운다. */
                    href={buildSearchHref({ subjectCategory: category.code, subject: null })}
                    className={`${styles.subjectChip} ${isActive ? styles.subjectChipActive : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span className={styles.subjectChipIcon} aria-hidden="true">
                      <SubjectGlyph />
                    </span>
                    {category.name}
                  </Link>
                )
              })}
            </nav>

            {selectedSubjectCategory ? (
              <nav
                className={styles.subjectDetailChipRail}
                aria-label={`${selectedSubjectCategory.name} 세부 과목`}
              >
                <Link
                  href={buildSearchHref({ subjectCategory: selectedSubjectCategory.code, subject: null })}
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
                      href={buildSearchHref({
                        subjectCategory: selectedSubjectCategory.code,
                        subject: subject.code
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
          </section>

          {hasActiveFilters ? (
            <section className={styles.activeFilterSection} aria-label="적용된 검색 조건">
              <ul className={styles.activeFilterList}>
                {activeFilters.map((filter) =>
                  filter.removeHref ? (
                    <li key={filter.key}>
                      <Link href={filter.removeHref} className={styles.activeFilterChip}>
                        {filter.label}
                        <RemoveGlyph />
                        <span className={styles.visuallyHidden}>조건 해제</span>
                      </Link>
                    </li>
                  ) : (
                    <li key={filter.key}>
                      {/*
                        반경은 저장된 위치에서 온다. 링크로는 못 지우므로 action 으로 지운다.
                        여기 없으면 "전체 목록" 인 줄 알고 보는 숨은 필터가 된다.
                      */}
                      <form action={clearNearbyLocationAction}>
                        <button type="submit" className={styles.activeFilterChip}>
                          {filter.label}
                          <RemoveGlyph />
                          <span className={styles.visuallyHidden}>현재 위치 해제</span>
                        </button>
                      </form>
                    </li>
                  )
                )}
              </ul>
              <Link href="/classes" className={styles.resetFilterButton}>
                초기화
              </Link>
            </section>
          ) : null}

          {error ? (
            <section className={styles.sectionBlock}>
              <div className={styles.stateCard}>
                <p className={styles.stateTitle}>{error}</p>
                <p className={styles.stateDesc}>잠시 후 다시 시도해 주세요.</p>
                <Link href={buildSearchHref()} className={styles.retryLink}>
                  다시 불러오기
                </Link>
              </div>
            </section>
          ) : resultCount === 0 ? (
            <section className={styles.pageEmptyState}>
              <div className={styles.pageEmptyInner}>
                <p className={styles.pageEmptyTitle}>조건에 맞는 첫수업이 아직 없어요.</p>
                <p className={styles.pageEmptyDesc}>검색어나 필터를 바꿔 다시 찾아보세요.</p>
                {isNearbyMode && widerRadiusKm && widerRadiusHref ? (
                  <Link href={widerRadiusHref} className={styles.resetButton}>
                    {`${widerRadiusKm}km로 넓히기`}
                  </Link>
                ) : isRegionMode ? (
                  <Link href={clearRegionHref} className={styles.resetButton}>
                    전체 지역으로 보기
                  </Link>
                ) : null}
                {hasActiveFilters ? (
                  <Link href="/classes" className={styles.resetButton}>
                    조건 초기화
                  </Link>
                ) : null}
              </div>
            </section>
          ) : (
            <section className={styles.sectionBlock}>
              <p className={styles.resultMeta}>{resultMetaText}</p>
              <ul className={styles.resultGrid}>
                {classes.map((item) => {
                  const academyName = item.organization
                    ? [item.organization.name, item.organization.branchName].filter(Boolean).join(" ").trim()
                    : null
                  const gradeLabel = formatStoredTargetGrades(item.targetAge)

                  return (
                    <li key={item.id} className={styles.resultGridItem}>
                      <ClassCard
                        href={detailHrefForClass(item.id)}
                        thumbnailUrl={item.coverImageUrl}
                        thumbnailAlt={`${item.title} 대표 이미지`}
                        title={item.title}
                        academyName={academyName}
                        secondaryLabel={buildCardSecondaryLabel(item)}
                        /* 수업에 실제로 적혀 있을 때만 학년을 말한다. */
                        gradeLabel={gradeLabel === "정보 준비 중" ? null : gradeLabel}
                        priceLabel={formatPrice(item.trialPrice)}
                        isFree={item.trialPrice <= 0}
                        scheduleLabel={scheduleSummaryByClassId.get(item.id)?.summaryLabel ?? null}
                        distanceLabel={distanceLabelForClass(item)}
                        classId={item.id}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      </div>

      <ParentBottomNav
        scheduleHref={scheduleEntryHref}
        recordHref={recordEntryHref}
        myPageHref={myPageEntryHref}
      />
    </main>
  )
}
