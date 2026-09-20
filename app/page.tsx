import { ImageFallback } from "@/shared/ui/image-fallback"
import { toParentUrl } from "@/shared/config/site-origins"

import { Suspense } from "react"
import { HomeErrorBoundary } from "@/features/classes/ui/home-error-boundary"
import { HomeLoading } from "@/features/classes/ui/home-loading"

import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import { resolveCurrentAuth } from "@/features/auth/lib/current-auth"
import { buildClassesHref, decodeQueryValue } from "@/features/classes/lib/classes-href"
import { selectHomeDiscoveryClasses } from "@/features/classes/lib/parent-home"
import { ParentProfileAvatar } from "@/features/classes/ui/parent-profile-avatar"
import { getHomeAcademies } from "@/features/classes/queries/get-home-academies"
import { SubjectIcon } from "@/features/classes/ui/home-subject-icon"
import { CHILD_QUERY_KEY } from "@/features/children/lib/child-selection"
import { HomeChildSelector } from "@/features/children/ui/home-child-selector"
import { getParentHomeSummary } from "@/features/classes/queries/get-parent-home-summary"
import {
  resolveClassDiscoveryContext,
  type ClassDiscoverySearchParams
} from "@/features/classes/queries/resolve-class-discovery-context"
import { ClassesSearchPill } from "@/features/classes/ui/classes-region-select"
import { HomeClassCard } from "@/features/classes/ui/home-class-card"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import { LocationFilter } from "@/features/location/ui/location-filter"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import { formatDistanceLabel } from "@/features/location/lib/search-location"

import styles from "./page.module.css"
import { getStudioCrossProductHrefResolver } from "@/shared/lib/cross-product-navigation-server"

/*
 * Parent Home.
 *
 * ⚠️ 수업 카탈로그가 아니다. 카탈로그는 /classes 다.
 *    여기서는 지금 확인할 것 · 다가오는 수업 · 몇 개의 추천만 보여 주고,
 *    "더 보기" 는 전부 /classes 로 넘긴다.
 *
 * 검색어 · 과목이 붙은 요청은 이미 "찾는" 요청이라 /classes 로 넘긴다.
 * 지역은 filter 가 아니라 Home 의 맥락이므로 여기 남는다.
 */
export const metadata: Metadata = {
  title: "첫수업 | 학원 체험수업 비교·예약",
  description:
    "우리 아이에게 맞는 학원 체험수업과 레벨테스트를 한곳에서 비교하고 예약하세요. 첫수업은 학부모와 학원을 연결하는 체험수업 플랫폼입니다.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: toParentUrl("/"),
    siteName: "첫수업",
    title: "첫수업 | 학원 체험수업 비교·예약",
    description:
      "우리 아이에게 맞는 학원 체험수업과 레벨테스트를 한곳에서 비교하고 예약하세요. 첫수업은 학부모와 학원을 연결하는 체험수업 플랫폼입니다."
  }
}

type HomePageProps = {
  searchParams?: Promise<ClassDiscoverySearchParams>
}

// Home 이 실제로 보여 주는 큐레이션 개수. Home 은 카탈로그가 아니다.
const HOME_DISCOVERY_LIMIT = 6

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

const getClassSubjectLabel = (item: ClassSummary) =>
  formatClassSubjectDisplayLabel(item) || "과목 정보 준비 중"

/** Home 주소. 지역만 canonical 하게 유지한다. */
const buildHomeHref = (params: {
  radius?: string | null
  sido?: string | null
  sigungu?: string | null
  bname?: string | null
  child?: string | null
}) => {
  const search = new URLSearchParams()
  if (params.child) search.set(CHILD_QUERY_KEY, params.child)
  if (params.radius) search.set("radius", params.radius)
  if (params.sido) search.set("sido", params.sido)
  if (params.sigungu) search.set("sigungu", params.sigungu)
  if (params.bname) search.set("bname", params.bname)
  return search.size ? `/?${search.toString()}` : "/"
}

const chevronIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

async function ParentHomeContent({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined

  /*
   * Home 은 검색 화면이 아니다.
   *
   * 검색어나 과목이 붙어 들어오면 그 요청의 주인은 /classes 다. 값은 그대로
   * 넘긴다 — query 계약은 두 route 가 같은 것을 쓴다.
   */
  const homeQuery = typeof resolvedSearchParams?.q === "string" ? resolvedSearchParams.q.trim() : ""
  const homeSubjectCategory = decodeQueryValue(resolvedSearchParams?.subjectCategory)
  const homeSubject = decodeQueryValue(resolvedSearchParams?.subject)
  if (homeQuery || homeSubjectCategory || homeSubject) {
    redirect(
      buildClassesHref({
        q: homeQuery || null,
        subjectCategory: homeSubjectCategory || null,
        subject: homeSubject || null,
        radius: decodeQueryValue(resolvedSearchParams?.radius) || null,
        sido: decodeQueryValue(resolvedSearchParams?.sido) || null,
        sigungu: decodeQueryValue(resolvedSearchParams?.sigungu) || null,
        bname: decodeQueryValue(resolvedSearchParams?.bname) || null
      })
    )
  }

  const [context, auth] = await Promise.all([
    resolveClassDiscoveryContext(resolvedSearchParams, {
      // A child-specific preview must be filtered before the six-card limit.
      discoveryFetchLimit: (resolvedSearchParams as Record<string, unknown> | undefined)?.[CHILD_QUERY_KEY]
        ? undefined
        : HOME_DISCOVERY_LIMIT
    }),
    resolveCurrentAuth("/")
  ])

  if (context.shouldCanonicalize) {
    redirect(
      buildHomeHref({
        radius: context.canonicalParams.radius,
        sido: context.canonicalParams.sido,
        sigungu: context.canonicalParams.sigungu,
        bname: context.canonicalParams.bname,
        child: (resolvedSearchParams as Record<string, string> | undefined)?.child
      })
    )
  }

  const { authenticated, isParentUser, isStudioUser } = auth
  /* Studio 는 다른 origin 이다. 상대 경로로는 그 자리를 가리킬 수 없다. */
  const studioHref = await getStudioCrossProductHrefResolver()
  const myPageEntryHref = authenticated
    ? isStudioUser
      ? studioHref("/studio")
      : "/my"
    : "/auth/sign-in"
  const scheduleEntryHref = authenticated
    ? isStudioUser
      ? studioHref("/studio")
      : "/my/schedule"
    : `/auth/sign-in?${new URLSearchParams({ returnTo: "/my/schedule" }).toString()}`
  const recordEntryHref = authenticated
    ? isStudioUser
      ? studioHref("/studio")
      : "/record"
    : `/auth/sign-in?${new URLSearchParams({ returnTo: "/record" }).toString()}`

  /*
   * 개인화 영역은 학부모로 로그인했을 때만 읽는다.
   * 비로그인 방문자와 Studio 계정에는 추가 조회가 한 건도 나가지 않는다.
   */
  /*
   * 지금 보고 있는 아이.
   *
   * ⚠️ /record 가 이미 쓰는 ?child= 를 그대로 쓴다. 저장 방식을 새로 만들지 않는다.
   *    주소에 적힌 id 가 내 아이가 아니면 조회 쪽에서 전체로 떨어뜨린다.
   */
  const requestedChildId =
    typeof (resolvedSearchParams as Record<string, unknown> | undefined)?.[CHILD_QUERY_KEY] ===
    "string"
      ? ((resolvedSearchParams as Record<string, string>)[CHILD_QUERY_KEY] ?? null)
      : null
  const [parentHome, academyResult] = await Promise.all([
    authenticated && isParentUser ? getParentHomeSummary(requestedChildId) : Promise.resolve(null),
    getHomeAcademies(context)
  ])
  const discoveryHref = buildClassesHref({ radius: context.radiusQueryValue, ...context.regionQueryValues })
  const academyHref = discoveryHref.replace("/classes", "/academies")
  const selectedChild = parentHome?.childOptions.find((child) => child.id === parentHome.selectedChildId)
  const report = parentHome?.actions[0]
  const upcoming = selectedChild ? parentHome?.upcoming[0] : undefined
  const homeDiscoveryClasses = selectHomeDiscoveryClasses(context.classes, selectedChild, HOME_DISCOVERY_LIMIT)

  return (
    <main className={styles.page} data-parent-design="v1">
      <h1 className={styles.srOnly}>첫수업 — 학원과 수업 탐색</h1>
      <div className={styles.shell}>
        <header className={styles.header}>
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

            <div className={styles.headerAccountActions} role="group" aria-label="학부모 계정">
            {authenticated && isStudioUser ? (
              <Link href={studioHref("/studio")} className={styles.headerAction}>스튜디오</Link>
            ) : null}
            <Link
              href={authenticated ? (isStudioUser ? studioHref("/studio") : "/notifications") : "/auth/sign-in?returnTo=%2Fnotifications"}
              className={styles.headerIconButton}
              aria-label="알림"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6ZM10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            {!isStudioUser ? (
              <Link href={isParentUser ? "/my/profile" : myPageEntryHref} className={styles.headerIconButton}
                aria-label={isParentUser ? `${auth.profile?.name || "학부모"}님 프로필` : "로그인"}>
                <ParentProfileAvatar imageUrl={null} name={isParentUser ? auth.profile?.name : undefined} />
              </Link>
            ) : null}
            </div>
          </div>

          <div className={styles.headerContext} role="group" aria-label="탐색 지역과 자녀 선택">
            <LocationFilter
              mode={context.locationMode}
              label={context.locationMode === "all" ? "전체 지역" : context.locationFilterLabel}
              regionCatalog={context.regionCatalog}
              regionSelection={context.regionSelection}
              radiusKm={context.radiusKm}
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

            <div className={styles.childContext} role="group" aria-label="자녀 선택">
            {parentHome && parentHome.childOptions.length > 0 ? (
              /*
                등록된 자녀가 있을 때만 띄운다. 0명이면 selector 자체가 없고,
                Home 에서 자녀 등록을 새로 권하지 않는다 - 그 자리는 /my/children 이다.
              */
              <>
              <span className={styles.childContextLabel}>자녀</span>
              <HomeChildSelector
                options={parentHome.childOptions}
                selectedChildId={parentHome.selectedChildId}
                className={styles.childChip}
                labelClassName={styles.childChipLabel}
              />
              </>
            ) : (
              <Link href={authenticated ? (isStudioUser ? studioHref("/studio") : "/my/children") : "/auth/sign-in?returnTo=%2Fmy%2Fchildren"} className={styles.childChip}>
                {parentHome?.childrenError ? "자녀 확인하기" : "자녀 선택"}
                <span aria-hidden="true">⌄</span>
              </Link>
            )}
            </div>
          </div>

          {/* Home 의 검색은 결과 화면(/classes)으로 넘긴다. Home 은 검색 화면이 아니다. */}
          <ClassesSearchPill
            initialQuery=""
            placeholder="지역, 학원명, 수업명으로 검색"
            className={styles.searchForm}
            pillClassName={styles.searchPill}
            inputClassName={styles.searchInput}
            submitButtonClassName={styles.searchSubmit}
            targetPathname="/classes"
          />
        </header>

        <div className={styles.content}>
          <nav className={styles.subjectChipRail} aria-label="과목별 둘러보기">
            {context.subjectCatalog.map((category) => (
              <Link key={category.id} href={buildClassesHref({ subjectCategory: category.code, radius: context.radiusQueryValue, ...context.regionQueryValues })} className={styles.subjectChip}>
                <span className={styles.subjectCircle}><SubjectIcon code={category.code} colored /></span>
                <span>{category.name}</span>
              </Link>
            ))}
          </nav>

          {selectedChild && upcoming ? (
            <section className={styles.sectionBlock} aria-labelledby="home-upcoming-title">
              <div className={styles.sectionHeading}>
                <h2 id="home-upcoming-title" className={styles.sectionHeadingTitle}>다가오는 수업 일정</h2>
                <Link href={`/my/schedule?${new URLSearchParams({ child: selectedChild.id }).toString()}`} className={styles.sectionHeadingLink}>전체보기 {chevronIcon}</Link>
              </div>
              <Link href={upcoming.href} className={styles.scheduleCard}>
                <span className={styles.scheduleImage}>
                  {upcoming.coverImageUrl ? (
                    <Image src={upcoming.coverImageUrl} alt={`${upcoming.classTitle} 수업 이미지`} fill sizes="(max-width: 480px) calc(100vw - 40px), 440px" unoptimized style={{ objectFit: "cover" }} />
                  ) : <ImageFallback label="수업 이미지 없음" />}
                </span>
                <h3 className={styles.scheduleTitle}>{upcoming.classTitle}</h3>
                {upcoming.academyName ? <p className={styles.contextDescription}>{upcoming.academyName}</p> : null}
                <p className={styles.scheduleTime}>{upcoming.scheduleLabel}</p>
              </Link>
            </section>
          ) : null}

          {parentHome?.error ? (
            <section className={styles.emptyState} aria-label="아이 소식 안내">
              <p>아이의 소식을 불러오지 못했어요.</p>
              <Link href="/record" className={styles.textLink}>기록에서 확인하기 {chevronIcon}</Link>
            </section>
          ) : null}
          {report ? (
            <aside aria-label="체험 리포트">
              <Link href={report.href} className={styles.reportLink}>
                <span><span className={styles.academyName}>{report.title}</span><span className={styles.muted}>{[report.childName, report.classTitle].filter(Boolean).join(" · ")}</span></span>
                <span className={styles.reportAction}>리포트 확인하기 {chevronIcon}</span>
              </Link>
            </aside>
          ) : null}

          <section className={styles.sectionBlock} aria-labelledby="home-classes-title">
            <div className={styles.sectionHeading}>
              <h2 id="home-classes-title" className={styles.sectionHeadingTitle}>이런 수업은 어때요?</h2>
              <Link href={discoveryHref} className={styles.sectionHeadingLink}>전체보기 {chevronIcon}</Link>
            </div>
            {context.error || homeDiscoveryClasses.length === 0 ? (
              <div className={styles.emptyState}>
                <p>{context.error ? "수업을 불러오지 못했어요." : selectedChild ? `${selectedChild.name}의 학년에 신청 가능한 수업이 이 지역에 없어요.` : "아직 이 지역에 공개된 수업이 없어요."}</p>
                <Link href={discoveryHref} className={styles.textLink}>다른 수업 둘러보기 {chevronIcon}</Link>
              </div>
            ) : (
              <ul className={styles.homeCardRail} tabIndex={0} aria-label="수업 목록, 좌우로 스크롤하여 더 보기">
                {homeDiscoveryClasses.map((item) => (
                  <li key={item.id} className={styles.homeCardItem}>
                    <HomeClassCard href={`/classes/${item.id}`} thumbnailUrl={item.coverImageUrl} thumbnailAlt={`${item.title} 대표 이미지`} title={item.title}
                      academyName={item.organization ? [item.organization.name, item.organization.branchName].filter(Boolean).join(" ") : null}
                      subjectLabel={getClassSubjectLabel(item)} priceLabel={formatPrice(item.trialPrice)}
                      locationLabel={item.organization?.bname || item.organization?.sigungu || item.organization?.sido || null}
                      distanceLabel={context.isNearbyMode && typeof item.distanceKm === "number" ? formatDistanceLabel(item.distanceKm) : null} classId={item.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.sectionBlock} aria-labelledby="home-academies-title">
            <div className={styles.sectionHeading}>
              <h2 id="home-academies-title" className={styles.sectionHeadingTitle}>{context.locationMode === "all" ? "학원 둘러보기" : "우리 동네 학원"}</h2>
              <Link href={academyHref} className={styles.sectionHeadingLink}>전체보기 {chevronIcon}</Link>
            </div>
            {academyResult.error || academyResult.data.length === 0 ? (
              <div className={styles.emptyState}>
                <p>{academyResult.error ? "학원을 불러오지 못했어요." : "아직 이 지역에 공개된 학원이 없어요."}</p>
                <Link href={academyHref} className={styles.textLink}>학원 둘러보기 {chevronIcon}</Link>
              </div>
            ) : (
              <ul className={styles.academyList}>
                {academyResult.data.map((academy) => (
                  <li key={academy.id}>
                    <Link href={`/academy/${academy.id}`} className={styles.academyCard}>
                      <span className={styles.academyImage}>
                        {academy.representativeClasses[0]?.coverImageUrl ? <Image src={academy.representativeClasses[0].coverImageUrl} alt={`${academy.displayName} 수업 이미지`} fill sizes="64px" unoptimized style={{ objectFit: "cover" }} /> : <ImageFallback label="학원 이미지 없음" />}
                      </span>
                      <span className={styles.academyBody}>
                        <span className={styles.academyName}>{academy.displayName}</span>
                        <span className={styles.muted}>{academy.subjectTags.join(" · ")}</span>
                        <span className={styles.muted}>{[academy.sigungu, academy.bname].filter(Boolean).join(" ")}{typeof academy.distanceKm === "number" ? ` · ${formatDistanceLabel(academy.distanceKm)}` : ""}</span>
                      </span>
                      {chevronIcon}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ParentBottomNav
        designVersion="v1"
        scheduleHref={scheduleEntryHref}
        recordHref={recordEntryHref}
        myPageHref={myPageEntryHref}
      />
    </main>
  )
}

export default function ParentHomePage(props: HomePageProps) {
  return <HomeErrorBoundary><Suspense fallback={<HomeLoading />}><ParentHomeContent {...props} /></Suspense></HomeErrorBoundary>
}
