"use client"

import { ParentDetailLink } from "@/features/classes/ui/parent-detail-link"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { formatDistanceLabel } from "@/features/location/lib/search-location"
import { ParentLaunchLocation } from "@/features/location/ui/parent-launch-location"
import { PARENT_LAUNCH_REGION } from "@/features/location/lib/parent-launch-region"
import { appSubjectCodeFromTags } from "@/features/classes/lib/app-presentation"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { AcademyLogo, AppButton, AppButtonLink, appUi as ui } from "@/features/classes/ui/parent-app-ui"
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
  const filtered = conditions.length > 0
  return <section className={styles.explorer} aria-label="학원 리스트" aria-busy={pending}>
    <div className={styles.locationRow}>
      <ParentLaunchLocation className={styles.launchLocation} />
    </div>
    <p className={ui.caption}>{PARENT_LAUNCH_REGION.notice}</p>
    <ClassesSearchPill initialQuery={initialQuery} placeholder="학원명, 지점명으로 찾기" className={styles.searchForm} pillClassName={styles.searchPill} inputClassName={styles.searchInput} submitButtonClassName={styles.searchSubmit} />
    <div className={styles.filterRow}>
      <SubjectFilter catalog={subjectCatalog} selectedCategory={selectedSubjectCategory} selectedSubject={selectedSubject} label={selectedSubjectLabel}
        triggerClassName={ui.filterChip} labelClassName={styles.filterLabel} chevronWrapClassName={styles.chevron} openChevronClassName={styles.chevronOpen} />
      <GradeFilter selectedGrade={selectedGrade} label={selectedGradeLabel}
        triggerClassName={ui.filterChip} labelClassName={styles.filterLabel} chevronWrapClassName={styles.chevron} openChevronClassName={styles.chevronOpen} />
      <AcademySortFilter selectedSort={selectedSort} disabledReasonLabel={sortDisabledReasonLabel}
        triggerClassName={ui.filterChip} labelClassName={styles.filterLabel} chevronWrapClassName={styles.chevron} openChevronClassName={styles.chevronOpen} />
    </div>
    {conditions.length > 0 ? <div className={ui.chipRow} aria-label="선택된 검색 조건">
      {conditions.map(condition => <Link key={condition.keys[0]} className={ui.filterChip} data-selected href={without(condition.keys)} replace aria-label={`${condition.label} 조건 해제`}>{condition.label}<AppIcon name="x" size={14} /></Link>)}
      {conditions.length > 1 ? <Link href={resetHref} replace className={styles.clearLink}>전체 해제</Link> : null}
    </div> : null}
    {error ? <div className={ui.notice} role="alert">
      <p className={ui.body}>학원 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
      <AppButton variant="secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "불러오는 중…" : "다시 시도"}</AppButton>
    </div> : <>
      {filtered ? <p className={ui.caption}>학원 {academies.length}개</p> : null}
      {academies.length === 0 ? <div className={ui.notice}>
        <p className={ui.bodyMuted}>{filtered ? "조건에 맞는 학원을 찾지 못했어요. 검색어나 과목, 학년을 바꿔 다시 찾아보세요." : "학원을 준비하고 있어요."}</p>
        {conditions.length > 0 ? <AppButtonLink href={resetHref} replace variant="secondary">검색 조건 초기화</AppButtonLink> : null}
      </div> : <ul className={styles.academyList}>{academies.map(academy => <li key={academy.id}>
        <ParentDetailLink href={`/academy/${academy.id}`} className={styles.academyRow} aria-label={`${academy.displayName} 학원 소개`}>
          <AcademyLogo src={academy.logoImageUrl ?? null} subjectCode={appSubjectCodeFromTags(academy.subjectTags)} size={52} />
          <span className={ui.rowText}>
            <span className={`${ui.subtitle} ${ui.oneLine}`}>{academy.displayName}</span>
            <span className={`${ui.caption} ${ui.oneLine}`}>{[...academy.subjectTags, buildAcademyLocationLabel(academy)].filter(Boolean).join(" · ")}</span>
          </span>
        </ParentDetailLink>
      </li>)}</ul>}
    </>}
  </section>
}
