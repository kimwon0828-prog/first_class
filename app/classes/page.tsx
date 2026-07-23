import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import {
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
import { ParentFooter } from "@/features/classes/ui/parent-footer"
import { getPublicClasses } from "@/features/classes/queries/get-public-classes"
import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { isAcademyArea } from "@/shared/config/academy-areas"
import { ClassesBottomNav } from "./classes-bottom-nav"
import { HeroBannerSlider } from "./hero-banner-slider"
import styles from "./page.module.css"

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
    label: "6~7세 첫 학원",
    keywords: ["6세", "7세", "예비초", "입문", "기초", "첫", "창의", "체험"]
  },
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
  }
] as const satisfies readonly HomeStageChip[]

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

  return homeStageChips.find((item) => item.label === normalized) ?? null
}

const resolveSubjectCategory = (value: string) => {
  const normalized = normalizeSubjectCategory(value)
  if (!normalized) {
    return null
  }

  return homeSubjectCategories.find((item) => item.value === normalized) ?? null
}

const matchesKeyword = (item: ClassSummary, keywords: readonly string[]) => {
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
  const favoritesEnabled = !session || profile?.role === "parent"
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
  const visibleClasses = filteredClasses
  const heroBanners = [{ id: "default" }, { id: "secondary" }, { id: "tertiary" }] as const
  const selectedStageClasses = selectedStageChip
    ? visibleClasses.filter((item) => matchesKeyword(item, selectedStageChip.keywords)).slice(0, 8)
    : visibleClasses.slice(0, 8)
  const recommendedAdvancedClasses = buildCurationList(visibleClasses, isAdvancedCurationClass, 6)
  const detailHrefForClass = (classId: string) =>
    selectedRegion ? `/classes/${classId}?region=${encodeURIComponent(selectedRegion)}` : `/classes/${classId}`
  const applyHrefForClass = (classId: string) => {
    const returnTo = `/classes/${classId}/apply`
    return session
      ? returnTo
      : `/auth/sign-in?${new URLSearchParams({ returnTo }).toString()}`
  }
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

  return (
    <main
      className={styles.page}
      style={{ background: "#ffffff", minHeight: "100dvh", width: "100%", overflowX: "hidden" }}
    >
      <div
        className={styles.shell}
        style={{
          boxSizing: "border-box",
          width: "100%",
          maxWidth: 430,
          margin: "0 auto",
          minHeight: "100dvh",
          background: "#ffffff",
          paddingBottom: "calc(96px + env(safe-area-inset-bottom))"
        }}
      >
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

        <section className={styles.regionSection}>
          <ClassesRegionInlineSelect
            selectedRegion={selectedRegion}
            rowClassName={styles.regionRow}
            nameClassName={styles.regionName}
            chevronWrapClassName={styles.regionChevronWrap}
          />
        </section>

        <HeroBannerSlider banners={[...heroBanners]} />

        <section className={styles.stageSection} aria-label="연령 및 단계 탐색">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>연령과 단계로 둘러보기</h2>
          </div>
          <div className={styles.stageScroller}>
            {homeStageChips.map((chip) => (
              <Link
                key={chip.label}
                href={buildClassesHref({
                  region: selectedRegion,
                  subject: selectedSubject,
                  q: selectedQuery ?? null,
                  stage: selectedStageChip?.label === chip.label ? null : chip.label
                })}
                className={`${styles.stageChip}${selectedStageChip?.label === chip.label ? ` ${styles.stageChipActive}` : ""}`}
              >
                {chip.label}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {selectedStageChip ? `${selectedStageChip.label} 추천 수업` : "추천 수업"}
            </h2>
          </div>
          {selectedStageClasses.length > 0 ? (
            <ul className={styles.grid}>
              {selectedStageClasses.map((item) => (
                <li
                  key={`stage-${selectedStageChip?.label ?? "all"}-${item.id}`}
                  className={styles.slideItem}
                >
                  <Link href={detailHrefForClass(item.id)} className={`${styles.card} ${styles.sliderCard}`}>
                    {favoritesEnabled ? (
                      <BookmarkButton
                        classId={item.id}
                        className={styles.bookmarkButton}
                        activeClassName={styles.bookmarkButtonActive}
                      />
                    ) : null}
                    <div className={styles.cardImage}>
                      {item.coverImageUrl ? (
                        <Image
                          src={item.coverImageUrl}
                          alt={`${item.title} 대표 이미지`}
                          fill
                          sizes="(max-width: 430px) 70vw, 280px"
                          style={{ objectFit: "cover" }}
                          unoptimized
                        />
                      ) : (
                        <div
                          className={styles.imagePlaceholder}
                          role="img"
                          aria-label="첫수업 준비 중인 수업 이미지입니다."
                        >
                          첫수업 준비 중인 수업 이미지입니다.
                        </div>
                      )}
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.curatedEyebrow}>
                        {selectedStageChip?.label ?? "추천"}
                      </p>
                      <h3 className={styles.cardTitle}>{item.title}</h3>
                      <p className={styles.cardPrice}>{formatPrice(item.trialPrice)}</p>
                      <div className={styles.cardMeta}>
                        <span>{getSubjectLabel(item.subject)}</span>
                        <span>·</span>
                        <span>{formatStoredTargetGrades(item.targetAge)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.stateCard}>
              <p className={styles.stateTitle}>
                {selectedStageChip
                  ? `${selectedStageChip.label}에 맞는 수업을 준비 중이에요.`
                  : "추천할 전체 학원 수업을 준비 중이에요."}
              </p>
              <p className={styles.stateDesc}>다른 연령/단계를 선택하거나 조금 뒤 다시 확인해 주세요.</p>
            </div>
          )}
        </section>

        <section className={styles.categorySection} aria-label="과목 카테고리">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>찾고 싶은 과목부터</h2>
          </div>
          <div className={styles.subjectPager} aria-label="과목 빠른 탐색">
            {subjectPages.map((page, pageIndex) => (
              <div key={`subject-page-${pageIndex}`} className={styles.subjectPage}>
                <div className={styles.subjectGrid}>
                  {page.map((item) => {
                    return (
                      <Link
                        key={item.label}
                        href={buildAcademiesHref(item.value)}
                        className={styles.subjectItem}
                      >
                        <span className={styles.subjectEmoji}>{item.emoji}</span>
                        <span className={styles.subjectLabel}>{item.label}</span>
                      </Link>
                    )
                  })}
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

        {error ? (
          <section>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>첫수업을 불러오는 중 문제가 생겼어요</h2>
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

        {!error && visibleClasses.length === 0 && (selectedQuery || selectedSubject) ? (
          <section>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>찾아본 조건에 맞는 수업</h2>
            </div>
            <div className={styles.stateCard}>
              <p className={styles.stateTitle}>검색 결과가 없어요.</p>
              <p className={styles.stateDesc}>다른 검색어로 다시 찾아보세요.</p>
            </div>
          </section>
        ) : null}

        {!error && visibleClasses.length === 0 && !selectedQuery && !selectedSubject ? (
          <section>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>공개된 첫수업</h2>
            </div>
            <div className={styles.stateCard}>
              <p className={styles.stateTitle}>
                {selectedRegion ? `${selectedRegion}에 현재 공개된 수업이 아직 없어요.` : "현재 공개된 수업이 아직 없어요."}
              </p>
              <p className={styles.stateDesc}>조금 뒤 다시 확인해 주세요.</p>
            </div>
          </section>
        ) : null}

        {!error && visibleClasses.length > 0 && isFilteredView ? (
          <section>
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
              {visibleClasses.map((item) => (
                <li key={item.id} className={styles.resultGridItem}>
                  <Link href={detailHrefForClass(item.id)} className={styles.card}>
                    {favoritesEnabled ? (
                      <BookmarkButton
                        classId={item.id}
                        className={styles.bookmarkButton}
                        activeClassName={styles.bookmarkButtonActive}
                      />
                    ) : null}
                    <div className={styles.cardImage}>
                      {item.coverImageUrl ? (
                        <Image
                          src={item.coverImageUrl}
                          alt={`${item.title} 대표 이미지`}
                          fill
                          sizes="(max-width: 430px) 50vw, 215px"
                          style={{ objectFit: "cover" }}
                          unoptimized
                        />
                      ) : (
                        <div
                          className={styles.imagePlaceholder}
                          role="img"
                          aria-label="첫수업 준비 중인 수업 이미지입니다."
                        >
                          첫수업 준비 중인 수업 이미지입니다.
                        </div>
                      )}
                    </div>
                    <div className={styles.cardBody}>
                      <h3 className={styles.cardTitle}>{item.title}</h3>
                      <p className={styles.cardPrice}>{formatPrice(item.trialPrice)}</p>
                      <div className={styles.cardMeta}>
                        <span>{getSubjectLabel(item.subject)}</span>
                        <span>·</span>
                        <span>{formatStoredTargetGrades(item.targetAge)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!error && visibleClasses.length > 0 && !isFilteredView ? (
          <>
            <section>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>영재원 준비, 체험으로 시작하기</h2>
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
                {recommendedAdvancedClasses.map((item) => (
                  <li key={item.id} className={styles.slideItem}>
                    <Link href={detailHrefForClass(item.id)} className={`${styles.card} ${styles.sliderCard}`}>
                      {favoritesEnabled ? (
                        <BookmarkButton
                          classId={item.id}
                          className={styles.bookmarkButton}
                          activeClassName={styles.bookmarkButtonActive}
                        />
                      ) : null}
                      <div className={styles.cardImage}>
                        {item.coverImageUrl ? (
                          <Image
                            src={item.coverImageUrl}
                            alt={`${item.title} 대표 이미지`}
                            fill
                            sizes="(max-width: 430px) 70vw, 280px"
                            style={{ objectFit: "cover" }}
                            unoptimized
                          />
                        ) : (
                          <div
                            className={styles.imagePlaceholder}
                            role="img"
                            aria-label="첫수업 준비 중인 수업 이미지입니다."
                          >
                            첫수업 준비 중인 수업 이미지입니다.
                          </div>
                        )}
                      </div>
                      <div className={styles.cardBody}>
                        <p className={styles.curatedEyebrow}>탐구형 추천</p>
                        <h3 className={styles.cardTitle}>{item.title}</h3>
                        <p className={styles.cardPrice}>{formatPrice(item.trialPrice)}</p>
                        <div className={styles.cardMeta}>
                          <span>{getSubjectLabel(item.subject)}</span>
                          <span>·</span>
                          <span>{formatStoredTargetGrades(item.targetAge)}</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>이번 주 예약 가능한 수업</h2>
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
              {availableClassCards.length > 0 ? (
                <ul className={styles.availableList}>
                  {availableClassCards.map(({ classItem, academyName, scheduleSummary }) => (
                    <li key={classItem.id} className={styles.availableItem}>
                      <article className={styles.availableCard}>
                        <div className={styles.availableBody}>
                          <div className={styles.availableHeader}>
                            <div>
                              <p className={styles.availableAcademy}>{academyName}</p>
                              <h3 className={styles.availableTitle}>{classItem.title}</h3>
                            </div>
                            <span className={styles.seatBadge}>예약 가능</span>
                          </div>
                          <div className={styles.availableMeta}>
                            <span>{scheduleSummary}</span>
                            <span>·</span>
                            <span>{formatStoredTargetGrades(classItem.targetAge)}</span>
                          </div>
                        </div>
                        <div className={styles.availableFooter}>
                          <span className={styles.availableSlotLabel}>자세한 시간은 상세에서 확인</span>
                          <Link href={applyHrefForClass(classItem.id)} className={styles.reserveButton}>
                            예약하기
                          </Link>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.stateCard}>
                  <p className={styles.stateTitle}>이번 주에 바로 예약 가능한 수업을 준비 중이에요.</p>
                  <p className={styles.stateDesc}>조금 뒤 다시 확인해 주세요.</p>
                </div>
              )}
            </section>
          </>
        ) : null}

        <ParentFooter />
      </div>

      <ClassesBottomNav
        classesHomeHref={classesHomeHref}
        myApplicationsEntryHref={myApplicationsEntryHref}
      />
    </main>
  )
}
