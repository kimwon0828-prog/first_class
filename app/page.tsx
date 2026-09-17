import { toParentUrl } from "@/shared/config/site-origins"

import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import { resolveCurrentAuth } from "@/features/auth/lib/current-auth"
import { buildClassesHref, decodeQueryValue } from "@/features/classes/lib/classes-href"
import { formatParentActionSubject } from "@/features/actions/lib/parent-actions"
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
}) => {
  const search = new URLSearchParams()
  if (params.radius) search.set("radius", params.radius)
  if (params.sido) search.set("sido", params.sido)
  if (params.sigungu) search.set("sigungu", params.sigungu)
  if (params.bname) search.set("bname", params.bname)
  return search.size ? `/?${search.toString()}` : "/"
}

// 화면용 글리프. 아이콘 package 를 새로 설치하지 않고, emoji 도 쓰지 않는다.
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

const ReportGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 17v-3M12 17v-5M15 17v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

const chevronIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default async function ParentHomePage({ searchParams }: HomePageProps) {
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
      discoveryFetchLimit: HOME_DISCOVERY_LIMIT
    }),
    resolveCurrentAuth("/")
  ])

  if (context.shouldCanonicalize) {
    redirect(
      buildHomeHref({
        radius: context.canonicalParams.radius,
        sido: context.canonicalParams.sido,
        sigungu: context.canonicalParams.sigungu,
        bname: context.canonicalParams.bname
      })
    )
  }

  const { authenticated, isParentUser, isStudioUser } = auth
  const myPageEntryHref = authenticated
    ? isStudioUser
      ? "/studio"
      : "/my"
    : "/auth/sign-in"
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
  const parentHome =
    authenticated && isParentUser ? await getParentHomeSummary(requestedChildId) : null
  const hasHighlightSection = Boolean(parentHome && parentHome.actions.length > 0)
  const hasUpcomingSection = Boolean(parentHome && parentHome.upcoming.length > 0)
  /**
   * 개인화해서 보여 줄 근거가 실제로 있는가.
   *
   * 이 값이 Home 의 두 화면을 가른다. 문구도 여기서 갈린다 —
   * 근거가 없으면 "우리 아이에게 맞는" 이라고 말하지 않는다.
   */
  const hasPersonalizedHome = hasHighlightSection || hasUpcomingSection

  const homeDiscoveryClasses = context.classes.slice(0, HOME_DISCOVERY_LIMIT)
  const hasHomeDiscovery = !context.error && homeDiscoveryClasses.length > 0
  /*
   * 지역 기반 섹션을 따로 두지 않는다.
   *
   * 지역을 고르면 목록 자체가 그 지역으로 좁혀져 오기 때문에, 같은 수업을
   * "둘러보기" 와 "지역" 두 번 보여 주면 그게 중복 섹션이다. 한 자리를 쓰고
   * 제목만 실제 선택을 따라간다. 결과가 없으면 이 섹션은 렌더되지 않는다.
   */
  const homeDiscoveryTitle = context.isRegionMode
    ? `${context.regionSelectionLabel ?? "선택한 지역"} 첫수업`
    : context.isNearbyMode
      ? `내 주변 ${context.radiusKm}km 첫수업`
      : "첫수업 둘러보기"

  const distanceLabelForClass = (item: ClassSummary) =>
    context.isNearbyMode && typeof item.distanceKm === "number"
      ? formatDistanceLabel(item.distanceKm)
      : null

  const subjectShortcutSection = (
    <section className={styles.categorySection} aria-label="과목별 둘러보기">
      <div className={styles.sectionHeading}>
        <div className={styles.sectionHeadingMain}>
          <h2 className={styles.sectionHeadingTitle}>과목별 둘러보기</h2>
        </div>
      </div>
      <nav className={styles.subjectChipRail} aria-label="과목 바로가기">
        {context.subjectCatalog.map((category) => (
          <Link
            key={category.id}
            href={buildClassesHref({
              subjectCategory: category.code,
              radius: context.radiusQueryValue,
              ...context.regionQueryValues
            })}
            className={styles.subjectChip}
          >
            <span className={styles.subjectChipIcon} aria-hidden="true">
              <SubjectGlyph />
            </span>
            {category.name}
          </Link>
        ))}
      </nav>
    </section>
  )

  const brandBannerSection = (
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
  )

  /*
   * 제목을 인자로 받는다 — 같은 목록이지만 개인화 근거가 있는 홈에서만
   * "우리 아이에게 맞는" 이라고 부를 수 있기 때문이다.
   */
  const renderHomeDiscoverySection = (title: string) => (
    <section className={styles.sectionBlock} aria-label={title}>
      <div className={styles.sectionHeading}>
        <div className={styles.sectionHeadingMain}>
          <h2 className={styles.sectionHeadingTitle}>{title}</h2>
        </div>
        <Link href={buildClassesHref()} className={styles.sectionHeadingLink}>
          전체 보기
          {chevronIcon}
        </Link>
      </div>
      <ul className={styles.homeCardGrid}>
        {homeDiscoveryClasses.map((item) => (
          <li key={`home-${item.id}`} className={styles.homeCardGridItem}>
            <HomeClassCard
              href={`/classes/${item.id}`}
              thumbnailUrl={item.coverImageUrl}
              thumbnailAlt={`${item.title} 대표 이미지`}
              title={item.title}
              academyName={
                item.organization
                  ? [item.organization.name, item.organization.branchName].filter(Boolean).join(" ").trim() || null
                  : null
              }
              subjectLabel={getClassSubjectLabel(item)}
              priceLabel={formatPrice(item.trialPrice)}
              isFree={item.trialPrice <= 0}
              distanceLabel={distanceLabelForClass(item)}
              classId={item.id}
            />
          </li>
        ))}
      </ul>
    </section>
  )

  const homeEmptyStateSection = (
    <section className={styles.pageEmptyState}>
      <div className={styles.pageEmptyInner}>
        <p className={styles.pageEmptyTitle}>
          {context.error
            ? context.error
            : context.isNearbyMode
              ? `선택한 위치 ${context.radiusKm}km 이내에 예약 가능한 수업이 없어요`
              : context.isRegionMode
                ? "선택한 지역에 예약 가능한 수업이 없어요"
                : "아직 공개된 수업이 없어요"}
        </p>
        <p className={styles.pageEmptyDesc}>
          {context.isNearbyMode || context.isRegionMode
            ? "다른 지역이나 조건으로 찾아보세요"
            : "조금만 기다려 주세요"}
        </p>
        <Link href={buildClassesHref()} className={styles.resetButton}>
          수업 찾아보기
        </Link>
      </div>
    </section>
  )

  /*
   * "지금 확인해야 할 것".
   *
   * 판정은 /my/actions 와 같은 selector 가 한다. Home 은 앞의 몇 개만 미리
   * 보여 주고, 더 있으면 전체 화면으로 넘긴다. 0건이면 이 section 자체가 없다.
   */
  const homeHighlightSection = hasHighlightSection && parentHome ? (
    <section className={styles.sectionBlock} aria-label="지금 확인해야 할 것">
      <div className={styles.sectionHeading}>
        <div className={styles.sectionHeadingMain}>
          <h2 className={styles.sectionHeadingTitle}>지금 확인해야 할 것</h2>
        </div>
        {parentHome.hasMoreActions ? (
          <Link href="/my/actions" className={styles.sectionHeadingLink}>
            전체 보기
            {chevronIcon}
          </Link>
        ) : null}
      </div>
      <ul className={styles.highlightList}>
        {parentHome.actions.map((action) => (
          <li key={action.id}>
            {/* 각 줄은 그 Action 의 실제 목적지로 바로 간다. */}
            <Link href={action.href} className={styles.highlightCard}>
              <span className={styles.highlightIcon} aria-hidden="true">
                <ReportGlyph />
              </span>
              <span className={styles.highlightBody}>
                <span className={styles.highlightSubject}>{formatParentActionSubject(action)}</span>
                <span className={styles.highlightTitle}>{action.title}</span>
              </span>
              <span className={styles.highlightAction}>{action.ctaLabel}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null

  const homeUpcomingSection = hasUpcomingSection && parentHome ? (
    <section className={styles.sectionBlock} aria-label="다가오는 수업">
      <div className={styles.sectionHeading}>
        <div className={styles.sectionHeadingMain}>
          <h2 className={styles.sectionHeadingTitle}>다가오는 수업</h2>
        </div>
        {/* 일정 전체는 /my/schedule 이 맡는다. 카드 하나하나는 그대로 경험 상세로 간다. */}
        <Link href="/my/schedule" className={styles.sectionHeadingLink}>
          전체 보기
          {chevronIcon}
        </Link>
      </div>
      <ul className={styles.upcomingList}>
        {parentHome.upcoming.map((item) => (
          <li key={item.experienceId}>
            <Link href={item.href} className={styles.upcomingCard}>
              <span className={styles.upcomingThumb}>
                {item.coverImageUrl ? (
                  <Image
                    src={item.coverImageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 480px) 100vw, 480px"
                    style={{ objectFit: "cover" }}
                    unoptimized
                  />
                ) : (
                  <span className={styles.upcomingThumbEmpty} aria-hidden="true" />
                )}
              </span>
              <span className={styles.upcomingBody}>
                <span className={styles.upcomingTitle}>{item.classTitle}</span>
                {item.academyName ? <span className={styles.upcomingAcademy}>{item.academyName}</span> : null}
                <span className={styles.upcomingSchedule}>{item.scheduleLabel}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null

  /*
   * Home 의 두 화면.
   *
   * 순서만 다른 것이 아니라 들어가는 section 자체가 다르다. CSS 로 재배열하지 않는다.
   *   Discovery Home — 과목 → 배너 → 첫수업 둘러보기
   *   Concierge Home — 지금 확인할 것 → 다가오는 수업 → 우리 아이에게 맞는 첫수업 → 과목 → 배너
   */
  const discoveryHomeTree = (
    <>
      {subjectShortcutSection}
      {brandBannerSection}
      {hasHomeDiscovery ? renderHomeDiscoverySection(homeDiscoveryTitle) : homeEmptyStateSection}
    </>
  )

  const conciergeHomeTree = (
    <>
      {homeHighlightSection}
      {homeUpcomingSection}
      {hasHomeDiscovery ? renderHomeDiscoverySection("우리 아이에게 맞는 첫수업") : null}
      {subjectShortcutSection}
      {brandBannerSection}
    </>
  )

  return (
    <main className={styles.page}>
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

            {authenticated ? (
              isStudioUser ? (
                <Link href="/studio" className={styles.headerAction} aria-label="스튜디오로 이동">
                  스튜디오
                </Link>
              ) : (
                /*
                 * 헤더 오른쪽 끝은 알림함 하나다.
                 *
                 * ⚠️ 마이페이지 아이콘을 여기 다시 만들지 않는다. 계정 진입은
                 *    하단 탭의 "마이페이지" 가 맡는다 — 같은 곳으로 가는 문을
                 *    두 개 두면 어느 쪽이 정식인지 알 수 없게 된다.
                 * ⚠️ 빨간 점 · 숫자 배지를 붙이지 않는다. 읽음/안읽음을 적어 두는
                 *    자리가 schema 에 없어서 "안 읽은 N개" 는 화면이 지어낸 값이 된다.
                 */
                <Link href="/notifications" className={styles.headerIconButton} aria-label="알림">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M13.7 18a2 2 0 0 1-3.4 0"
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

          <div className={styles.headerContext}>
            <LocationFilter
              mode={context.locationMode}
              label={context.locationFilterLabel}
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

            {parentHome && parentHome.childOptions.length > 0 ? (
              /*
                등록된 자녀가 있을 때만 띄운다. 0명이면 selector 자체가 없고,
                Home 에서 자녀 등록을 새로 권하지 않는다 - 그 자리는 /my/children 이다.
              */
              <HomeChildSelector
                options={parentHome.childOptions}
                selectedChildId={parentHome.selectedChildId}
                className={styles.childChip}
                labelClassName={styles.childChipLabel}
              />
            ) : null}
          </div>

          {/* Home 의 검색은 결과 화면(/classes)으로 넘긴다. Home 은 검색 화면이 아니다. */}
          <ClassesSearchPill
            initialQuery=""
            placeholder="우리 아이에게 맞는 첫수업을 찾아보세요"
            className={styles.searchForm}
            pillClassName={styles.searchPill}
            inputClassName={styles.searchInput}
            submitButtonClassName={styles.searchSubmit}
            targetPathname="/classes"
          />
        </header>

        <div className={styles.content}>
          {hasPersonalizedHome ? conciergeHomeTree : discoveryHomeTree}
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
