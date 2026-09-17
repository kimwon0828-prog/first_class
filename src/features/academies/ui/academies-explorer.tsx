"use client"

import Link from "next/link"

import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
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
  return (
    <section className={styles.listSection} aria-label="학원 리스트">
      <ClassesSearchPill
        initialQuery={initialQuery}
        placeholder="학원명, 지점명으로 찾기"
        className={styles.searchForm}
        pillClassName={styles.searchPill}
        inputClassName={styles.searchInput}
        submitButtonClassName={styles.searchSubmit}
      />

      <div className={styles.filterRow}>
        <SubjectFilter
          catalog={subjectCatalog}
          selectedCategory={selectedSubjectCategory}
          selectedSubject={selectedSubject}
          label={selectedSubjectLabel}
          className={styles.subjectFilter}
          triggerClassName={styles.filterChipButton}
          labelClassName={styles.filterChipLabel}
          chevronWrapClassName={styles.filterChipChevron}
          openChevronClassName={styles.filterChipChevronOpen}
        />
        <LocationFilter
          mode={locationMode}
          label={locationLabel}
          radiusKm={radiusKm}
          regionCatalog={regionCatalog}
          regionSelection={regionSelection}
          className={styles.locationFilter}
          triggerClassName={styles.filterChipButton}
          labelClassName={styles.filterChipLabel}
          iconClassName={styles.filterChipIcon}
          chevronWrapClassName={styles.filterChipChevron}
          openChevronClassName={styles.filterChipChevronOpen}
          radiusRailClassName={styles.radiusRail}
          radiusChipClassName={styles.radiusChip}
          radiusChipActiveClassName={styles.radiusChipActive}
        />
        <GradeFilter
          selectedGrade={selectedGrade}
          label={selectedGradeLabel}
          className={styles.gradeFilter}
          triggerClassName={styles.filterChipButton}
          labelClassName={styles.filterChipLabel}
          chevronWrapClassName={styles.filterChipChevron}
          openChevronClassName={styles.filterChipChevronOpen}
        />
        <AcademySortFilter
          selectedSort={selectedSort}
          disabledReasonLabel={sortDisabledReasonLabel}
          className={styles.sortFilter}
          triggerClassName={styles.filterChipButton}
          labelClassName={styles.filterChipLabel}
          chevronWrapClassName={styles.filterChipChevron}
          openChevronClassName={styles.filterChipChevronOpen}
        />
      </div>

      {academies.length === 0 ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>조건에 맞는 학원이 아직 없어요.</p>
          <p className={styles.emptyDesc}>검색어나 지역을 바꿔 다시 찾아보세요.</p>
        </div>
      ) : (
        <ul className={styles.academyList}>
          {academies.map((academy) => {
            const primaryClass = academy.representativeClasses[0] ?? null

            return (
              <li key={academy.id} className={styles.academyItem}>
                <article className={styles.academyCard}>
                  <div className={styles.academyCardHeader}>
                    <div>
                      {(() => {
                        const locationLabelText = buildAcademyLocationLabel(academy)
                        return locationLabelText ? (
                          <p className={styles.academyLocation}>{locationLabelText}</p>
                        ) : null
                      })()}
                      <h2 className={styles.academyName}>
                        <Link href={`/academy/${academy.id}`} className={styles.academyNameLink}>
                          {academy.displayName}
                        </Link>
                      </h2>
                    </div>
                  </div>

                  <div className={styles.subjectTagRow}>
                    {academy.subjectTags.map((tag) => (
                      <span key={`${academy.id}-${tag}`} className={styles.subjectTag}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className={styles.academyMetaRow}>
                    <span>{academy.targetAgeSummary}</span>
                  </div>

                  <div className={styles.classPreviewList}>
                    {academy.representativeClasses.map((classItem) => (
                      <Link key={classItem.id} href={`/classes/${classItem.id}`} className={styles.classPreviewCard}>
                        <div>
                          <p className={styles.classPreviewSubject}>{classItem.displaySubject}</p>
                          <h3 className={styles.classPreviewTitle}>{classItem.title}</h3>
                        </div>
                        <span className={styles.classPreviewAge}>{formatStoredTargetGrades(classItem.targetAge)}</span>
                      </Link>
                    ))}
                  </div>

                  <div className={styles.academyCardFooter}>
                    <p className={styles.academyAddress}>
                      {academy.address ? academy.address : academy.addressDetail ?? "주소 정보를 준비 중이에요."}
                    </p>
                    <div className={styles.academyActionRow}>
                      {/* 학원이 어떤 곳인지 보는 길. route 는 organization id 를 canonical 하게 받는다. */}
                      <Link href={`/academy/${academy.id}`} className={styles.secondaryAction}>
                        학원 정보
                      </Link>
                      {primaryClass ? (
                        <Link href={`/classes/${primaryClass.id}`} className={styles.primaryAction}>
                          수업 보기
                        </Link>
                      ) : (
                        <span className={styles.primaryActionDisabled}>수업 준비 중</span>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
