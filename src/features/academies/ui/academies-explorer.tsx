"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { formatDistanceLabel, type SearchRadiusKm } from "@/features/location/lib/search-location"
import type { RegionCatalog, RegionSelection } from "@/features/location/lib/region-selection"
import { LocationFilter, type LocationMode } from "@/features/location/ui/location-filter"
import { SubjectFilter } from "@/features/subjects/ui/subject-filter"
import { GradeFilter } from "@/features/grades/ui/grade-filter"
import { ClassesSearchPill } from "@/features/classes/ui/classes-region-select"
import { AcademySortFilter } from "./academy-sort-filter"
import type { AcademySort } from "../lib/academy-sort"
import type { Subject, SubjectCatalogCategory } from "@/shared/lib/subject-master"
import type { AcademyListItem } from "../queries/get-academies-for-list"
import styles from "../../../../app/academies/page.module.css"

type AcademiesExplorerProps = {
  academies: AcademyListItem[]
  error?: boolean
  /** URL 의 q. 입력값의 출처는 언제나 URL 이다. */
  initialQuery: string
  locationMode: LocationMode
  locationLabel: string
  radiusKm: SearchRadiusKm
  regionCatalog: RegionCatalog
  regionSelection: RegionSelection | null
  subjectCatalog: SubjectCatalogCategory[]
  selectedSubjectCategory: SubjectCatalogCategory | null
  selectedSubject: Subject | null
  selectedSubjectLabel: string
  selectedGrade: string | null
  selectedGradeLabel: string
  selectedSort: AcademySort
  sortDisabledReasonLabel: string | null
}

// 카드 eyebrow: 내 주변이면 거리, 그 외에는 행정지역.
// academy_area / 주소 heuristic 으로 fallback 하지 않으며, 둘 다 없으면 표시 자체를 생략한다.
const buildAcademyLocationLabel = (academy: AcademyListItem) => {
  if (typeof academy.distanceKm === "number") {
    const distanceLabel = formatDistanceLabel(academy.distanceKm)
    if (distanceLabel) {
      return distanceLabel
    }
  }

  return formatAdministrativeRegionLabel(academy)
}

export function AcademiesExplorer({
  academies,
  error = false,
  initialQuery,
  locationMode,
  locationLabel,
  radiusKm,
  regionCatalog,
  regionSelection,
  subjectCatalog,
  selectedSubjectCategory,
  selectedSubject,
  selectedSubjectLabel,
  selectedGrade,
  selectedGradeLabel,
  selectedSort,
  sortDisabledReasonLabel
}: AcademiesExplorerProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const without = (keys: string[]) => {
    const params = new URLSearchParams(searchParams.toString())
    keys.forEach(key => params.delete(key))
    return params.size ? `/academies?${params.toString()}` : "/academies"
  }
  const conditions = [
    ...(initialQuery ? [{ label: initialQuery, keys: ["q"] }] : []),
    ...(selectedSubjectCategory ? [{ label: selectedSubjectLabel, keys: ["subjectCategory", "subject"] }] : []),
    ...(selectedGrade ? [{ label: selectedGradeLabel, keys: ["grade"] }] : [])
  ]
  const resetHref = without(["q", "subjectCategory", "subject", "grade"])
  const filtered = conditions.length > 0 || locationMode !== "all"
  return <section className={styles.explorer} aria-label="학원 리스트" aria-busy={pending}>
    <div className={styles.locationRow}>
      <LocationFilter mode={locationMode} label={locationLabel} radiusKm={radiusKm} regionCatalog={regionCatalog} regionSelection={regionSelection}
        className={styles.locationFilter} triggerClassName={styles.locationButton} labelClassName={styles.locationLabel}
        iconClassName={styles.locationIcon} chevronWrapClassName={styles.chevron} openChevronClassName={styles.chevronOpen}
        radiusRailClassName={styles.radiusRail} radiusChipClassName={styles.radiusChip} radiusChipActiveClassName={styles.radiusChipActive} />
    </div>
    <ClassesSearchPill initialQuery={initialQuery} placeholder="학원명, 지점명으로 찾기" className={styles.searchForm} pillClassName={styles.searchPill} inputClassName={styles.searchInput} submitButtonClassName={styles.searchSubmit} />
    <div className={styles.filterRow}>
      <SubjectFilter catalog={subjectCatalog} selectedCategory={selectedSubjectCategory} selectedSubject={selectedSubject} label={selectedSubjectCategory ? selectedSubjectLabel : "전체"}
        triggerClassName={`${styles.filterButton} ${selectedSubjectCategory ? styles.filterActive : ""}`} labelClassName={styles.filterLabel} chevronWrapClassName={styles.chevron} openChevronClassName={styles.chevronOpen} />
      <GradeFilter selectedGrade={selectedGrade} label={selectedGrade ? selectedGradeLabel : "전체"}
        triggerClassName={`${styles.filterButton} ${selectedGrade ? styles.filterActive : ""}`} labelClassName={styles.filterLabel} chevronWrapClassName={styles.chevron} openChevronClassName={styles.chevronOpen} />
      <AcademySortFilter selectedSort={selectedSort} disabledReasonLabel={sortDisabledReasonLabel}
        triggerClassName={styles.filterButton} labelClassName={styles.filterLabel} chevronWrapClassName={styles.chevron} openChevronClassName={styles.chevronOpen} />
    </div>
    {conditions.length > 0 ? <div className={styles.conditions} aria-label="선택된 검색 조건">
      {conditions.map(condition => <Link key={condition.keys[0]} className={styles.condition} href={without(condition.keys)} replace aria-label={`${condition.label} 조건 해제`}>{condition.label}<span aria-hidden="true">×</span></Link>)}
      {conditions.length > 1 ? <Link href={resetHref} replace className={styles.clearLink}>전체 해제</Link> : null}
    </div> : null}
    {error ? <div className={styles.state} role="alert">
      <span className={styles.stateIcon} aria-hidden="true">!</span><h2>학원 정보를 불러오지 못했어요.</h2><p>잠시 후 다시 시도해 주세요.</p>
      <button type="button" className={styles.primaryButton} disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "불러오는 중…" : "다시 시도하기"}</button>
      <Link href="/" className={styles.secondaryButton}>홈으로 돌아가기</Link>
    </div> : <>
      <h2 className={styles.resultCount}>학원 {academies.length}개</h2>
      {academies.length === 0 ? <div className={styles.state}>
        <span className={styles.stateIcon}><AcademyIcon /></span>
        <h3>{filtered ? "검색 결과가 없어요." : "아직 공개된 학원이 없어요."}</h3>
        <p>{filtered ? "검색어나 지역, 과목, 학년을 바꿔 다시 찾아보세요." : "지역, 과목, 학년으로 학원을 찾아보세요."}</p>
        {conditions.length > 0 ? <Link href={resetHref} replace className={styles.secondaryButton}>검색 조건 초기화</Link> : null}
      </div> : <ul className={styles.academyList}>{academies.map(academy => <li key={academy.id}>
        <Link href={`/academy/${academy.id}`} className={styles.academyCard}>
          <span className={styles.academyIcon}><AcademyIcon /></span>
          <div className={styles.academyBody}>
            <h3 className={styles.academyName}>{academy.displayName}</h3>
            {buildAcademyLocationLabel(academy) ? <p className={styles.locationMeta}>{buildAcademyLocationLabel(academy)}</p> : null}
            <div className={styles.subjectTags}>{academy.subjectTags.map(tag => <span key={tag} className={styles.subjectTag}>{tag}</span>)}</div>
            <p className={styles.targetAge}>{academy.targetAgeSummary}</p>
            {academy.address || academy.addressDetail ? <p className={styles.address}>{academy.address || academy.addressDetail}</p> : null}
          </div>
          <svg className={styles.cardChevron} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
      </li>)}</ul>}
    </>}
  </section>
}

function AcademyIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 21V7l8-4 8 4v14H4ZM10 21v-6h4v6M8 9v2M12 8v3M16 9v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
