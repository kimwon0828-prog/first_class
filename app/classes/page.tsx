import Link from "next/link"
import { redirect } from "next/navigation"
import Image from "next/image"

import { getSession } from "@/features/auth/lib/session"
import {
  ClassesRegionInlineSelect,
  ClassesSearchPill,
  ClassesSubjectGrid
} from "@/features/classes/ui/classes-region-select"
import { getPublicClasses } from "@/features/classes/queries/get-public-classes"
import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { normalizeAcademyArea } from "@/shared/config/academy-areas"
import styles from "./page.module.css"
import { HeroBannerSlider } from "./hero-banner-slider"

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

const escapeQueryValue = (value: string) =>
  value
    .replace(/%/g, "%25")
    .replace(/&/g, "%26")
    .replace(/=/g, "%3D")
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F")
    .replace(/ /g, "%20")

const buildClassesHref = (params: { region: string; subject?: string | null; q?: string | null }) => {
  const parts = [`region=${escapeQueryValue(params.region)}`]
  if (params.subject) parts.push(`subject=${escapeQueryValue(params.subject)}`)
  if (params.q) parts.push(`q=${escapeQueryValue(params.q)}`)
  return `/classes?${parts.join("&")}`
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
  const selectedRegion = normalizeAcademyArea(decodedRegion)
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

  if (decodedRegion !== selectedRegion) {
    redirect(
      buildClassesHref({
        region: selectedRegion,
        subject: decodedSubject || null,
        q: selectedQuery ?? null
      })
    )
  }

  const subjectCategories = [
    { label: "국어", emoji: "📕" },
    { label: "수학", emoji: "📐" },
    { label: "영어", emoji: "🔤" },
    { label: "사회", emoji: "🌍" },
    { label: "과학", emoji: "🧪" },
    { label: "코딩", emoji: "💻" },
    { label: "미술", emoji: "🎨" },
    { label: "체육", emoji: "⚽" },
    { label: "음악", emoji: "🎵" },
    { label: "기타과목", emoji: "🧩" }
  ] as const

  const selectedSubject = subjectCategories.some((item) => item.label === decodedSubject)
    ? decodedSubject
    : null

  const { data: classes, error } = await getPublicClasses(selectedRegion, {
    subject: selectedSubject ?? undefined,
    query: selectedQuery
  })
  const session = await getSession()
  const classesHref = buildClassesHref({
    region: selectedRegion,
    subject: selectedSubject,
    q: selectedQuery ?? null
  })
  const myPageHref = "/my"
  const myApplicationsHref = "/my/applications"
  const myPageEntryHref = session
    ? myPageHref
    : `/auth/sign-in?${new URLSearchParams({ returnTo: myPageHref }).toString()}`
  const myApplicationsEntryHref = session
    ? myApplicationsHref
    : `/auth/sign-in?${new URLSearchParams({ returnTo: myApplicationsHref }).toString()}`

  const heroBanners = [{ id: "default" }, { id: "secondary" }, { id: "tertiary" }] as const

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href={classesHref} className={styles.brand}>
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

        <section className={styles.categorySection} aria-label="과목 카테고리">
          <ClassesSubjectGrid
            items={subjectCategories}
            selectedSubject={selectedSubject}
            gridClassName={styles.subjectGrid}
            itemClassName={styles.subjectItem}
            itemActiveClassName={styles.subjectItemActive}
            emojiClassName={styles.subjectEmoji}
            labelClassName={styles.subjectLabel}
          />
        </section>

        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>우리 아이에게 딱! 맞는 첫수업</h2>
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

          {error ? (
            <div className={styles.stateCard}>
              <p className={styles.stateTitle}>{error}</p>
              <p className={styles.stateDesc}>잠시 후 다시 시도해 주세요.</p>
              <Link href={classesHref} className={styles.retryLink}>
                다시 불러오기
              </Link>
            </div>
          ) : null}

          {!error && classes.length === 0 && (selectedQuery || selectedSubject) ? (
            <div className={styles.stateCard}>
              <p className={styles.stateTitle}>검색 결과가 없어요.</p>
              <p className={styles.stateDesc}>다른 검색어로 다시 찾아보세요.</p>
            </div>
          ) : null}

          {!error && classes.length === 0 && !selectedQuery && !selectedSubject ? (
            <div className={styles.stateCard}>
              <p className={styles.stateTitle}>{selectedRegion}에 현재 공개된 수업이 아직 없어요.</p>
              <p className={styles.stateDesc}>조금 뒤 다시 확인해 주세요.</p>
            </div>
          ) : null}

          {!error && classes.length > 0 ? (
            <ul className={styles.grid}>
              {classes.map((item) => (
                <li key={item.id} className={styles.slideItem}>
                  <Link
                    href={`/classes/${item.id}?region=${selectedRegion}`}
                    className={`${styles.card} ${styles.sliderCard}`}
                  >
                    <BookmarkButton
                      classId={item.id}
                      className={styles.bookmarkButton}
                      activeClassName={styles.bookmarkButtonActive}
                    />
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
                        <span>{item.subject}</span>
                        <span>·</span>
                        <span>{item.targetAge}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <nav className={styles.bottomNav} aria-label="하단 탭">
        <Link href={classesHref} className={`${styles.navItem} ${styles.navItemActive}`}>
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
