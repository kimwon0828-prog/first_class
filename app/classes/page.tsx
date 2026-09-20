import type { Metadata } from "next"
import { Suspense } from "react"
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
import { ParentProfileAvatar } from "@/features/classes/ui/parent-profile-avatar"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { formatDistanceLabel, nextWiderSearchRadiusKm } from "@/features/location/lib/search-location"
import { LocationFilter } from "@/features/location/ui/location-filter"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import { clearSearchLocationAction } from "@/features/location/actions/search-location-actions"

import styles from "./page.module.css"
import homeStyles from "../page.module.css"
import ClassesLoading from "./loading"
import { HomeErrorBoundary } from "@/features/classes/ui/home-error-boundary"
import { SubjectIcon } from "@/features/classes/ui/home-subject-icon"
import { ClassesSubjectFilter } from "@/features/classes/ui/classes-subject-filter"
import { HomeChildSelector } from "@/features/children/ui/home-child-selector"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { resolveSelectedChildId, toChildSelectorOptions } from "@/features/children/lib/child-selection"
import { selectEligibleDiscoveryClasses, formatDiscoveryPrice } from "@/features/classes/lib/class-discovery-results"
import { getStudioCrossProductHrefResolver } from "@/shared/lib/cross-product-navigation-server"

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

const SCHEDULE_SUMMARY_LIMIT = 20

const getClassSubjectLabel = (item: ClassSummary) =>
  formatClassSubjectDisplayLabel(item) || "과목 정보 준비 중"

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

async function ClassesSearchContent({ searchParams }: ClassesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined

  const [context, auth] = await Promise.all([
    resolveClassDiscoveryContext(resolvedSearchParams),
    resolveCurrentAuth("/classes")
  ])

  if (context.shouldCanonicalize) {
    redirect(buildClassesHref({ ...context.canonicalParams, child: resolvedSearchParams?.child }))
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
    classes: allClasses,
    error: classesError
  } = context

  const childrenResult = auth.isParentUser
    ? await getMyChildren() : { data: [], error: null }
  const selectedChildId = resolveSelectedChildId(resolvedSearchParams?.child, childrenResult.data)
  const selectedChild = childrenResult.data.find((child) => child.id === selectedChildId) ?? null
  const classes = selectEligibleDiscoveryClasses(allClasses, selectedChild)
  // Do not silently present unfiltered results as personalized when child loading failed.
  const error = classesError || (resolvedSearchParams?.child && childrenResult.error
    ? "자녀 정보를 불러오지 못했어요. 다시 시도해주세요." : null)

  const { authenticated, isStudioUser } = auth
  /* Studio 는 다른 origin 이다. 상대 경로로는 그 자리를 가리킬 수 없다. */
  const studioHref = await getStudioCrossProductHrefResolver()
  const profileHref = authenticated ? (isStudioUser ? studioHref("/studio") : "/my/profile") : "/auth/sign-in"
  const notificationsHref = authenticated ? (isStudioUser ? studioHref("/studio") : "/notifications") : "/auth/sign-in?returnTo=%2Fnotifications"

  /** 이 화면 안에서 필터를 바꾸는 링크. 지금 걸린 조건을 유지한 채 한 칸만 바꾼다. */
  const buildSearchHref = (
    overrides: Partial<Parameters<typeof buildClassesHref>[0]> = {}
  ) =>
    buildClassesHref({
      subjectCategory: selectedSubjectCategory?.code ?? null,
      subject: selectedSubject?.code ?? null,
      child: selectedChildId,
      q: selectedQuery,
      radius: radiusQueryValue,
      ...regionQueryValues,
      ...overrides
    })

  const detailRegionQuery = new URLSearchParams()
  if (selectedChildId) detailRegionQuery.set("child", selectedChildId)
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
      ? await getPublicClassCardScheduleSummaries(scheduleSummaryTargets.map((item) => item.id)).catch(() => new Map())
      : new Map()

  /*
   * 결과 메타.
   *
   * ⚠️ 실제 개수만 말한다. "추천" · "인기" 같은 말을 붙이지 않는다 — 그런 순위가 없다.
   */
  const resultCount = classes.length
  const resultMetaText = `수업 ${resultCount}개`

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
  const hasMultipleFilters = activeFilters.length > 1 && Boolean(selectedQuery || selectedSubjectCategory || selectedSubject)

  return (
    <main className={homeStyles.page} data-parent-design="v1" data-parent-classes>
      <div className={homeStyles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.backLink} aria-label="홈으로 이동">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <h1 className={styles.searchTitle}>수업찾기</h1>
          <div className={styles.accountActions} role="group" aria-label="학부모 계정">
            <Link href={notificationsHref} className={homeStyles.headerIconButton} aria-label="알림">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6ZM10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href={profileHref} className={homeStyles.headerIconButton} aria-label={authenticated ? "프로필" : "로그인"}>
              <ParentProfileAvatar imageUrl={null} name={auth.isParentUser ? auth.profile?.name : undefined} />
            </Link>
          </div>
        </header>
        <div className={styles.content}>
          <div className={homeStyles.headerContext} role="group" aria-label="탐색 지역과 자녀 선택">
            <LocationFilter mode={context.locationMode}
              label={context.locationMode === "all" ? "전체 지역" : context.locationFilterLabel}
              regionCatalog={context.regionCatalog} regionSelection={context.regionSelection} radiusKm={radiusKm}
              className={homeStyles.filterInlineItem} triggerClassName={homeStyles.filterInlineTrigger}
              labelClassName={homeStyles.filterInlineLabel} iconClassName={homeStyles.filterInlineIcon}
              chevronWrapClassName={homeStyles.filterInlineChevron} openChevronClassName={homeStyles.filterInlineChevronOpen}
              radiusRailClassName={homeStyles.radiusRail} radiusChipClassName={homeStyles.radiusChip}
              radiusChipActiveClassName={homeStyles.radiusChipActive} manageSheetFocus />
            <div className={homeStyles.childContext} role="group" aria-label="자녀 선택">
              {childrenResult.data.length > 0 ? <HomeChildSelector
                options={toChildSelectorOptions(childrenResult.data)} selectedChildId={selectedChildId}
                className={homeStyles.childChip} labelClassName={homeStyles.childChipLabel}
                unselectedLabel="자녀 선택" manageSheetFocus />
                : <Link className={homeStyles.childChip} href={authenticated ? (isStudioUser ? studioHref("/studio") : "/my/children") : "/auth/sign-in?returnTo=%2Fclasses"}>
                  {childrenResult.error ? "자녀 확인하기" : "자녀 선택"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </Link>}
            </div>
          </div>
          {selectedChild ? <p className={styles.contextNote}>{selectedChild.name}의 대상 학년에 해당하는 수업을 보여드려요.</p> : null}
          <ClassesSearchPill initialQuery={selectedQuery ?? ""} placeholder="수업명 또는 학원명을 검색해보세요"
            className={homeStyles.searchForm} pillClassName={homeStyles.searchPill}
            inputClassName={homeStyles.searchInput} submitButtonClassName={homeStyles.searchSubmit} />
          <section className={styles.browseFilterSection} aria-label="검색 조건">
            <nav className={`${homeStyles.subjectChipRail} ${styles.subjectRail}`} aria-label="과목 대분류">
              {subjectCatalog.map((category) => {
                const isActive = selectedSubjectCategory?.id === category.id
                return <Link key={category.id}
                  href={buildSearchHref({ subjectCategory: category.code, subject: null })}
                  className={`${homeStyles.subjectChip} ${isActive ? styles.subjectSelected : ""}`}
                  aria-current={isActive ? "page" : undefined}>
                  <span className={homeStyles.subjectCircle}><SubjectIcon code={category.code} colored /></span>
                  <span>{category.name}</span>
                </Link>
              })}
            </nav>
            <div className={styles.filterBar}>
              {selectedSubjectCategory ? <ClassesSubjectFilter key={selectedSubjectCategory.code}
                categoryCode={selectedSubjectCategory.code} categoryName={selectedSubjectCategory.name}
                subjects={selectedSubjectCategory.subjects.map((subject) => ({ code: subject.code, name: subject.name }))}
                selectedSubject={selectedSubject?.code ?? null} /> : null}
            </div>
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
              {hasMultipleFilters ? <Link href={buildSearchHref({ q: null, subjectCategory: null, subject: null })} className={styles.resetFilterButton}>
                검색 조건 초기화
              </Link> : null}
            </section>
          ) : null}

          {!error ? <h2 className={styles.resultMeta} aria-live="polite">{resultMetaText}</h2> : null}
          {error ? (
            <section className={styles.sectionBlock}>
              <div className={styles.stateCard}>
                <p className={styles.stateTitle}>수업을 불러오지 못했어요.</p>
                <p className={styles.stateDesc}>잠시 후 다시 시도해 주세요.</p>
                <Link href={buildSearchHref()} className={styles.retryLink}>
                  다시 불러오기
                </Link>
              </div>
            </section>
          ) : resultCount === 0 ? (
            <section className={styles.pageEmptyState}>
              <div className={styles.pageEmptyInner}>
                <p className={styles.pageEmptyTitle}>조건에 맞는 수업이 없어요.</p>
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

              </div>
            </section>
          ) : (
            <section className={styles.sectionBlock}>
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
                        secondaryLabel={getClassSubjectLabel(item)}
                        regionLabel={item.organization ? formatAdministrativeRegionLabel(item.organization) : null}
                        /* 수업에 실제로 적혀 있을 때만 학년을 말한다. */
                        gradeLabel={gradeLabel === "정보 준비 중" ? null : gradeLabel}
                        priceLabel={formatDiscoveryPrice(item.trialPrice)}
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

    </main>
  )
}

export default function ClassesSearchPage(props: ClassesPageProps) {
  return <HomeErrorBoundary title="수업을 불러오지 못했어요.">
    <Suspense fallback={<ClassesLoading />}><ClassesSearchContent {...props} /></Suspense>
  </HomeErrorBoundary>
}
