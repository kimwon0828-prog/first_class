"use client"

import Link from "next/link"

import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { formatDistanceLabel, type SearchRadiusKm } from "@/features/location/lib/search-location"
import type { RegionCatalog, RegionSelection } from "@/features/location/lib/region-selection"
import { LocationFilter, type LocationMode } from "@/features/location/ui/location-filter"
import type { AcademyListItem } from "../queries/get-academies-for-list"
import styles from "../../../../app/academies/page.module.css"

type AcademiesExplorerProps = {
  academies: AcademyListItem[]
  locationMode: LocationMode
  locationLabel: string
  radiusKm: SearchRadiusKm
  regionCatalog: RegionCatalog
  regionSelection: RegionSelection | null
  selectedSubjectLabel: string | null
  selectedGradeLabel: string | null
  selectedSortLabel: string
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
  locationMode,
  locationLabel,
  radiusKm,
  regionCatalog,
  regionSelection,
  selectedSubjectLabel,
  selectedGradeLabel,
  selectedSortLabel
}: AcademiesExplorerProps) {
  return (
    <section className={styles.listSection} aria-label="학원 리스트">
      <div className={styles.filterRow}>
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
        <span className={styles.filterChip}>과목 · {selectedSubjectLabel ?? "전체 과목"}</span>
        <span className={styles.filterChip}>학년 · {selectedGradeLabel ?? "전체 학년"}</span>
        <span className={styles.filterChip}>정렬 · {selectedSortLabel}</span>
      </div>

      {academies.length === 0 ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>조건에 맞는 학원을 아직 준비 중이에요.</p>
          <p className={styles.emptyDesc}>과목이나 지역을 바꿔 다시 찾아보세요.</p>
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
                      <h2 className={styles.academyName}>{academy.displayName}</h2>
                    </div>
                    <span className={styles.academyBookmarkPlaceholder} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path
                          d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
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
                    {primaryClass ? (
                      <Link href={`/classes/${primaryClass.id}`} className={styles.primaryAction}>
                        수업 보기
                      </Link>
                    ) : (
                      <span className={styles.primaryActionDisabled}>수업 준비 중</span>
                    )}
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
