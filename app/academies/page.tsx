import Link from "next/link"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"
import { getAcademiesForList } from "@/features/academies/queries/get-academies-for-list"
import { AcademiesExplorer } from "@/features/academies/ui/academies-explorer"
import { isAcademyArea } from "@/shared/config/academy-areas"

import styles from "./page.module.css"

type AcademiesPageProps = {
  searchParams?: Promise<{
    subject?: string
    region?: string
    grade?: string
    sort?: string
  }>
}

const formatAcademyAreaLabel = (value: string | null) => {
  if (!value) {
    return "전체 지역"
  }

  if (value === "은행사거리학원가") {
    return "중계 은행사거리 학원가"
  }

  return value
}

export default async function AcademiesPage({ searchParams }: AcademiesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const subject =
    typeof resolvedSearchParams?.subject === "string" && resolvedSearchParams.subject.trim().length > 0
      ? resolvedSearchParams.subject.trim()
      : null
  const rawRegion =
    typeof resolvedSearchParams?.region === "string" && resolvedSearchParams.region.trim().length > 0
      ? resolvedSearchParams.region.trim()
      : null
  const selectedRegion = rawRegion && isAcademyArea(rawRegion) ? rawRegion : null
  const selectedGrade =
    typeof resolvedSearchParams?.grade === "string" && resolvedSearchParams.grade.trim().length > 0
      ? resolvedSearchParams.grade.trim()
      : null
  const selectedSort =
    typeof resolvedSearchParams?.sort === "string" && resolvedSearchParams.sort.trim().length > 0
      ? resolvedSearchParams.sort.trim()
      : "추천순"

  const [{ academies, selectedSubjectLabel }, session] = await Promise.all([
    getAcademiesForList({
      subject,
      region: selectedRegion,
      grade: selectedGrade,
      sort: selectedSort
    }),
    getSession()
  ])
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
          selectedRegionLabel={formatAcademyAreaLabel(selectedRegion)}
          selectedSubjectLabel={selectedSubjectLabel}
          selectedGradeLabel={selectedGrade}
          selectedSortLabel={selectedSort}
        />
      </div>

      <nav className={styles.bottomNav} aria-label="하단 탭">
        <Link href="/classes" className={styles.navItem}>
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
