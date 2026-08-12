import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import { formatStoredTargetGrades, GRADE_OPTIONS, parseStoredTargetGrades } from "@/shared/constants/grade-options"
import {
  getChildGradeLabel,
  getSubjectLabel,
  normalizeSubjectCategory,
  SUBJECT_CATEGORIES,
  type SubjectCategoryValue
} from "@/shared/constants/education-taxonomy"
import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"
import { getPublicClassCardScheduleSummaries } from "@/features/classes/queries/get-public-class-card-schedule-summaries"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import { ClassesRegionInlineSelect, ClassesSearchPill } from "@/features/classes/ui/classes-region-select"
import { ClassesStageSelect } from "@/features/classes/ui/classes-stage-select"
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
    stage?: string
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
  emoji: string
}

type AvailableClassCard = {
  classItem: ClassSummary
  academyName: string
  scheduleSummary: string
}

type HomeStageChip = {
  label: string
  keywords: readonly string[]
}

const homeStageChips = [
  {
    label: "초1~2 탐색",
    keywords: ["초1", "초2", "탐색", "입문", "기초", "창의", "체험"]
  },
  {
    label: "초3~4 심화",
    keywords: ["초3", "초4", "심화", "사고력", "탐구", "실험", "프로젝트"]
  },
  {
    label: "초5~6 확장",
    keywords: ["초5", "초6", "확장", "프로젝트", "심화", "영재", "실전"]
  },
  {
    label: "중등",
    keywords: ["중등", "중1", "중2", "중3", "내신", "특목", "심화", "실전"]
  }
] as const satisfies readonly HomeStageChip[]

void homeStageChips

const subjectEmojiByValue: Record<SubjectCategoryValue, string> = {
  thinking_math: "🧠",
  coding_robot_science: "🤖",
  reading_writing: "📚",
  english: "🗣️",
  arts: "🖌️",
  sports_dance: "💃"
}

const homeSubjectCategories: readonly HomeSubjectCategory[] = SUBJECT_CATEGORIES.map((item) => ({
  label: item.label,
  value: item.value,
  emoji: subjectEmojiByValue[item.value]
}))

const chunkItems = <T,>(items: readonly T[], size: number) => {
  const pages: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size) as T[])
  }
  return pages
}

const subjectPages = chunkItems(homeSubjectCategories, 6)

const normalizeText = (value: string | null | undefined) => (value ?? "").trim().toLowerCase()

const resolveStageChip = (value: string) => {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  if (!GRADE_OPTIONS.includes(normalized as (typeof GRADE_OPTIONS)[number])) {
    return null
  }

  return {
    label: normalized,
    keywords: [normalized]
  } as const
}

const resolveSubjectCategory = (value: string) => {
  const normalized = normalizeSubjectCategory(value)
  if (!normalized) {
    return null
  }

  return homeSubjectCategories.find((item) => item.value === normalized) ?? null
}

const matchesKeyword = (item: ClassSummary, keywords: readonly string[]) => {
  const isStageCodeFilter =
    keywords.length > 0 &&
    keywords.every((keyword) => GRADE_OPTIONS.includes(keyword as (typeof GRADE_OPTIONS)[number]))

  if (isStageCodeFilter) {
    const targetGrades = parseStoredTargetGrades(item.targetAge)
    if (targetGrades.length === 0) {
      return false
    }

    return keywords.some((keyword) => targetGrades.includes(keyword as (typeof targetGrades)[number]))
  }

  const haystack = normalizeText(
    [item.title, item.subject, getSubjectLabel(item.subject), item.description, item.targetAge, item.classFormat]
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
  stage?: string | null
}) => {
  const parts: string[] = []
  if (params.region) parts.push(`region=${escapeQueryValue(params.region)}`)
  if (params.subject) parts.push(`subject=${escapeQueryValue(params.subject)}`)
  if (params.q) parts.push(`q=${escapeQueryValue(params.q)}`)
  if (params.stage) parts.push(`stage=${escapeQueryValue(params.stage)}`)
  return parts.length ? `/classes?${parts.join("&")}` : "/classes"
}

const buildAcademiesHref = (subjectValue: SubjectCategoryValue) =>
  `/academies?subject=${escapeQueryValue(subjectValue)}`

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
  const rawStageParam = typeof resolvedSearchParams?.stage === "string" ? resolvedSearchParams.stage : ""
  const decodedStage = (() => {
    if (!rawStageParam) return ""
    try {
      return decodeURIComponent(rawStageParam)
    } catch {
      return rawStageParam
    }
  })()
  const resolvedSubjectCategory = resolveSubjectCategory(decodedSubject)
  const selectedStageChip = resolveStageChip(decodedStage)
  const selectedStageLabel = selectedStageChip ? getChildGradeLabel(selectedStageChip.label) ?? selectedStageChip.label : null

  if (decodedRegion && !selectedRegion) {
    redirect(
      buildClassesHref({
        region: null,
        subject: decodedSubject || null,
        q: selectedQuery ?? null,
        stage: selectedStageChip?.label ?? null
      })
    )
  }

  const selectedSubject = resolvedSubjectCategory?.value ?? null

  const { data: classes, error } = await getPublicClasses(selectedRegion, {
    subject: selectedSubject ?? undefined,
    query: selectedQuery
  })
  const filteredClasses = classes
  const session = await getSession()
  const profile = session ? await getMyProfile() : null
  const isParentUser = profile?.role === "parent"
  const isStudioUser =
    profile?.dbRole === "teacher" ||
    profile?.dbRole === "academy" ||
    profile?.dbRole === "operator" ||
    profile?.dbRole === "admin"
  const classesHref = buildClassesHref({
    region: selectedRegion,
    subject: selectedSubject,
    q: selectedQuery ?? null,
    stage: selectedStageChip?.label ?? null
  })
  const classesHomeHref = buildClassesHref({
    region: selectedRegion,
    subject: selectedSubject,
    q: selectedQuery ?? null,
    stage: null
  })
  const myPageHref = "/my"
  const myApplicationsHref = "/my/applications"
  const myPageEntryHref = session
    ? isParentUser
      ? myPageHref
      : isStudioUser
        ? "/studio"
        : myPageHref
    : "/auth/sign-in"
  const myApplicationsEntryHref = session
    ? isParentUser
      ? myApplicationsHref
      : isStudioUser
        ? "/studio"
        : myApplicationsHref
    : `/auth/sign-in?${new URLSearchParams({ returnTo: myApplicationsHref }).toString()}`
  const isFilteredView = Boolean(selectedQuery || selectedSubject)
  const visibleClasses = selectedStageChip
    ? filteredClasses.filter((item) => matchesKeyword(item, selectedStageChip.keywords))
    : filteredClasses
  const selectedStageClasses = visibleClasses.slice(0, 8)
  const recommendedAdvancedClasses = buildCurationList(visibleClasses, isAdvancedCurationClass, 6)
  const detailHrefForClass = (classId: string) =>
    selectedRegion ? `/classes/${classId}?region=${encodeURIComponent(selectedRegion)}` : `/classes/${classId}`
  const applyHrefForClass = (classId: string) => {
    const returnTo = `/classes/${classId}/apply`
    return session
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
  const shouldShowResultSummary = Boolean(selectedStageChip || selectedRegion)
  const resultSummaryLabel = shouldShowResultSummary
    ? `${selectedStageLabel ?? "전체 학년"} · ${selectedRegion ?? "전체 학원가"} · ${visibleClasses.length}개 수업`
    : null
  const hasFilteredResultsSection = !error && visibleClasses.length > 0 && isFilteredView
  const hasAvailableSection = !error && visibleClasses.length > 0 && !isFilteredView && availableClassCards.length > 0
  const hasRecommendedSection = !error && visibleClasses.length > 0 && !isFilteredView && selectedStageClasses.length > 0
  const hasAnyCardSection = hasFilteredResultsSection || hasAvailableSection || hasRecommendedSection
  const shouldShowPageEmptyState = !error && !hasAnyCardSection

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

          {session ? (
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
          <section className={styles.filterSection}>
            <div className={styles.filterPanel}>
              <div className={styles.filterRow}>
                <ClassesRegionInlineSelect
                  selectedRegion={selectedRegion}
                  rowClassName={styles.regionRow}
                  nameClassName={styles.regionName}
                  chevronWrapClassName={styles.regionChevronWrap}
                />
              </div>
              <div className={styles.filterRow}>
                <ClassesStageSelect
                  rowClassName={styles.regionRow}
                  nameClassName={styles.regionName}
                  chevronWrapClassName={styles.regionChevronWrap}
                />
              </div>
            </div>
          </section>

          <section className={styles.categorySection} aria-label="과목 카테고리">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                찾고 싶은 <span className={styles.sectionTitleAccent}>과목</span>부터
              </h2>
              <Link href="/academies" className={styles.sectionLink}>
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
            <div className={styles.subjectPager} aria-label="과목 빠른 탐색">
              {subjectPages.map((page, pageIndex) => (
                <div key={`subject-page-${pageIndex}`} className={styles.subjectPage}>
                  <div className={styles.subjectGrid}>
                    {page.map((item) => (
                      <Link key={item.label} href={buildAcademiesHref(item.value)} className={styles.subjectItem}>
                        <span className={styles.subjectEmoji}>{item.emoji}</span>
                        <span className={styles.subjectLabel}>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {subjectPages.length > 1 ? (
              <div className={styles.subjectDots} aria-hidden="true">
                {subjectPages.map((_, index) => (
                  <span key={`subject-dot-${index}`} className={styles.subjectDot} />
                ))}
              </div>
            ) : null}
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

          {resultSummaryLabel ? <p className={styles.resultSummary}>{resultSummaryLabel}</p> : null}

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
                    q: null,
                    stage: selectedStageChip?.label ?? null
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
                        subjectLabel={getSubjectLabel(item.subject)}
                        gradeLabel={formatStoredTargetGrades(item.targetAge)}
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
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                      이번 주 <span className={styles.sectionTitleAccent}>예약 가능</span> 수업
                    </h2>
                    <Link href={classesHref} className={styles.sectionLink}>
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
                  <ul className={styles.availableList}>
                    {availableClassCards.slice(0, 4).map(({ classItem, academyName, scheduleSummary }) => (
                      <li key={classItem.id} className={styles.availableItem}>
                        <ClassCard
                          href={detailHrefForClass(classItem.id)}
                          thumbnailUrl={classItem.coverImageUrl}
                          thumbnailAlt={`${classItem.title} 대표 이미지`}
                          title={classItem.title}
                          academyName={academyName}
                          subjectLabel={getSubjectLabel(classItem.subject)}
                          gradeLabel={formatStoredTargetGrades(classItem.targetAge)}
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
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                      <span className={styles.sectionTitleAccent}>추천</span> 수업
                    </h2>
                    <Link href={classesHref} className={styles.sectionLink}>
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
                  <ul className={styles.grid}>
                    {selectedStageClasses.slice(0, 4).map((item) => {
                      const academyName = item.organization
                        ? [item.organization.name, item.organization.branchName].filter(Boolean).join(" ").trim()
                        : null

                      return (
                        <li key={`stage-${selectedStageChip?.label ?? "all"}-${item.id}`} className={styles.slideItem}>
                          <ClassCard
                            href={detailHrefForClass(item.id)}
                            thumbnailUrl={item.coverImageUrl}
                            thumbnailAlt={`${item.title} 대표 이미지`}
                            title={item.title}
                            academyName={academyName}
                            subjectLabel={getSubjectLabel(item.subject)}
                            gradeLabel={formatStoredTargetGrades(item.targetAge)}
                            priceLabel={formatPrice(item.trialPrice)}
                            isFree={item.trialPrice <= 0}
                            statusBadge={{ label: selectedStageLabel ?? "추천", tone: "muted" }}
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
                        subjectLabel={getSubjectLabel(item.subject)}
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
            <Link href="/partner" className={styles.partnerBanner}>
              <span className={styles.partnerEyebrow}>첫수업 파트너</span>
              <strong className={styles.partnerTitle}>우리 학원도 첫수업에서 학부모를 만나보세요</strong>
              <span className={styles.partnerCopy}>학원 소개와 공개 수업 등록으로 체험 신청을 받을 수 있어요.</span>
            </Link>
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
