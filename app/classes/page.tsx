import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import {
  normalizeSubjectCategory,
  SUBJECT_CATEGORIES,
  type SubjectCategoryValue
} from "@/shared/constants/education-taxonomy"
import { resolveCurrentAuth } from "@/features/auth/lib/current-auth"
import { getPublicClassCardScheduleSummaries } from "@/features/classes/queries/get-public-class-card-schedule-summaries"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import { ClassesRegionInlineSelect, ClassesSearchPill } from "@/features/classes/ui/classes-region-select"
import { ClassCard } from "@/features/classes/ui/class-card"
import { ParentFooter } from "@/features/classes/ui/parent-footer"
import { getPublicClasses } from "@/features/classes/queries/get-public-classes"
import { isAcademyArea } from "@/shared/config/academy-areas"
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
    subject?: string
  }>
}

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

type HomeSubjectCategory = {
  label: string
  value: SubjectCategoryValue
}

type AvailableClassCard = {
  classItem: ClassSummary
  academyName: string
  scheduleSummary: string
}

const homeSubjectCategories: readonly HomeSubjectCategory[] = SUBJECT_CATEGORIES.map((item) => ({
  label: item.label,
  value: item.value
}))

const SubjectOutlineIcon = ({ subject }: { subject: SubjectCategoryValue }) => {
  switch (subject) {
    case "thinking_math":
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM8 8h8M8 12h2m4 0h2M8 16h2m4 0h2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case "coding_robot_science":
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M9 8 5 12l4 4M15 8l4 4-4 4M10.5 19h3M9 5h6M8 5h.01M16 5h.01"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case "reading_writing":
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M4 6.5A2.5 2.5 0 0 1 6.5 4H11v16H6.5A2.5 2.5 0 0 0 4 22V6.5ZM20 6.5A2.5 2.5 0 0 0 17.5 4H13v16h4.5A2.5 2.5 0 0 1 20 22V6.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case "english":
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M7 18H5.8A1.8 1.8 0 0 1 4 16.2V7.8A1.8 1.8 0 0 1 5.8 6h12.4A1.8 1.8 0 0 1 20 7.8v8.4A1.8 1.8 0 0 1 18.2 18H11l-4 3v-3Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 10h6M9 14h4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )
    case "arts":
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M18.5 5.5c-1.2-1.2-3.4-1-4.8.4L6 13.6V18h4.4l7.7-7.7c1.4-1.4 1.6-3.6.4-4.8Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12.5 7.5 16.5 11.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )
    case "sports_dance":
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M14 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM12 8l2.5 2 2.5.5M12 8l-2 3.5L7 13M10.5 11.5l2 2.5-1 5M14.5 10l-1 4 3 4M9 14l-3 4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
  }
}

const normalizeText = (value: string | null | undefined) => (value ?? "").trim().toLowerCase()

const getClassSubjectLabel = (item: ClassSummary) =>
  formatClassSubjectDisplayLabel(item) || "과목 정보 준비 중"

const resolveSubjectCategory = (value: string) => {
  const normalized = normalizeSubjectCategory(value)
  if (!normalized) {
    return null
  }

  return homeSubjectCategories.find((item) => item.value === normalized) ?? null
}

const matchesKeyword = (item: ClassSummary, keywords: readonly string[]) => {
  const haystack = normalizeText(
    [item.title, item.subject, getClassSubjectLabel(item), item.description, item.targetAge, item.classFormat]
      .filter(Boolean)
      .join(" ")
  )
  return keywords.some((keyword) => haystack.includes(normalizeText(keyword)))
}

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
  region?: string | null
  subject?: string | null
  q?: string | null
}) => {
  const parts: string[] = []
  if (params.region) parts.push(`region=${escapeQueryValue(params.region)}`)
  if (params.subject) parts.push(`subject=${escapeQueryValue(params.subject)}`)
  if (params.q) parts.push(`q=${escapeQueryValue(params.q)}`)
  return parts.length ? `/classes?${parts.join("&")}` : "/classes"
}

const buildAcademiesHref = (subjectValue: SubjectCategoryValue) =>
  `/academies?subject=${escapeQueryValue(subjectValue)}`

const formatCardRegionLabel = (region: ClassSummary["region"]) => {
  if (region === "은행사거리학원가") {
    return "중계"
  }

  return region.replace(/학원가$/, "")
}

export default async function ClassesPage({ searchParams }: ClassesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const rawRegionParam =
    typeof resolvedSearchParams?.region === "string" ? resolvedSearchParams.region : null
  const decodedRegion = (() => {
    if (!rawRegionParam) return null
    try {
      return decodeURIComponent(rawRegionParam)
    } catch {
      return rawRegionParam
    }
  })()
  const selectedRegion = decodedRegion && isAcademyArea(decodedRegion) ? decodedRegion : null
  const selectedQuery =
    typeof resolvedSearchParams?.q === "string" && resolvedSearchParams.q.trim().length > 0
      ? resolvedSearchParams.q.trim()
      : undefined
  const rawSubjectParam =
    typeof resolvedSearchParams?.subject === "string" ? resolvedSearchParams.subject : ""
  const decodedSubject = (() => {
    if (!rawSubjectParam) return ""
    try {
      return decodeURIComponent(rawSubjectParam)
    } catch {
      return rawSubjectParam
    }
  })()
  const resolvedSubjectCategory = resolveSubjectCategory(decodedSubject)

  if (decodedRegion && !selectedRegion) {
    redirect(
      buildClassesHref({
        region: null,
        subject: decodedSubject || null,
        q: selectedQuery ?? null
      })
    )
  }

  const selectedSubject = resolvedSubjectCategory?.value ?? null

  const { data: classes, error } = await getPublicClasses(selectedRegion, {
    subject: selectedSubject ?? undefined,
    query: selectedQuery
  })
  const filteredClasses = classes
  const auth = await resolveCurrentAuth("/classes")
  const { authenticated, isParentUser, isStudioUser } = auth
  const classesHref = buildClassesHref({
    region: selectedRegion,
    subject: selectedSubject,
    q: selectedQuery ?? null
  })
  const classesHomeHref = buildClassesHref({
    region: selectedRegion,
    subject: selectedSubject,
    q: selectedQuery ?? null
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
  const isFilteredView = Boolean(selectedQuery || selectedSubject)
  const visibleClasses = filteredClasses
  const selectedStageClasses = visibleClasses.slice(0, 8)
  const recommendedAdvancedClasses = buildCurationList(visibleClasses, isAdvancedCurationClass, 6)
  const detailHrefForClass = (classId: string) =>
    selectedRegion ? `/classes/${classId}?region=${encodeURIComponent(selectedRegion)}` : `/classes/${classId}`
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
          <section className={styles.filterSection} aria-label="학원가 선택">
            <div className={styles.filterPanel}>
              <ClassesRegionInlineSelect
                selectedRegion={selectedRegion}
                className={styles.filterInlineItem}
                rowClassName={styles.filterInlineTrigger}
                nameClassName={styles.filterInlineLabel}
                iconClassName={styles.filterInlineIcon}
                chevronWrapClassName={styles.filterInlineChevron}
                openChevronClassName={styles.filterInlineChevronOpen}
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
            <div className={styles.subjectList} aria-label="과목 빠른 탐색">
              {homeSubjectCategories.map((item) => (
                <Link key={item.value} href={buildAcademiesHref(item.value)} className={styles.subjectListItem}>
                  <span className={styles.subjectListLeading}>
                    <span className={styles.subjectListIcon} aria-hidden="true">
                      <SubjectOutlineIcon subject={item.value} />
                    </span>
                    <span className={styles.subjectListLabel}>{item.label}</span>
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                    className={styles.subjectListChevron}
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
              ))}
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
                <p className={styles.pageEmptyTitle}>선택하신 조건에 맞는 수업이 아직 없어요</p>
                <p className={styles.pageEmptyDesc}>다른 학년이나 지역으로 찾아보세요</p>
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
                  {selectedSubject && selectedQuery
                    ? `${resolvedSubjectCategory?.label ?? selectedSubject} · "${selectedQuery}" 결과`
                    : selectedSubject
                      ? `${resolvedSubjectCategory?.label ?? selectedSubject} 수업`
                      : `"${selectedQuery}" 검색 결과`}
                </h2>
                <Link
                  href={buildClassesHref({
                    region: selectedRegion,
                    subject: null,
                    q: null
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
                        secondaryLabel={`${formatCardRegionLabel(item.region)} · ${getClassSubjectLabel(item)}`}
                        priceLabel={formatPrice(item.trialPrice)}
                        isFree={item.trialPrice <= 0}
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
                          secondaryLabel={`${formatCardRegionLabel(classItem.region)} · ${getClassSubjectLabel(classItem)}`}
                          priceLabel={formatPrice(classItem.trialPrice)}
                          isFree={classItem.trialPrice <= 0}
                          statusBadge={{ label: "예약 가능", tone: "open" }}
                          scheduleLabel={scheduleSummary}
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
                            secondaryLabel={`${formatCardRegionLabel(item.region)} · ${getClassSubjectLabel(item)}`}
                            priceLabel={formatPrice(item.trialPrice)}
                            isFree={item.trialPrice <= 0}
                            statusBadge={{ label: "추천", tone: "muted" }}
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
