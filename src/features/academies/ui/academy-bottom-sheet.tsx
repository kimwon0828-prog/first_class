"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"

import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"

import type { AcademyMapOrganization } from "../queries/get-academies-for-map"
import styles from "../../../../app/academies/page.module.css"

type AcademyBottomSheetProps = {
  academies: AcademyMapOrganization[]
  activeOrganizationId: string | null
  onActiveOrganizationChange: (organizationId: string) => void
  selectedRegionLabel: string
  selectedSubjectLabel: string | null
  selectedGradeLabel: string | null
  selectedSortLabel: string
  favoritesEnabled: boolean
}

export function AcademyBottomSheet({
  academies,
  activeOrganizationId,
  onActiveOrganizationChange,
  selectedRegionLabel,
  selectedSubjectLabel,
  selectedGradeLabel,
  selectedSortLabel,
  favoritesEnabled
}: AcademyBottomSheetProps) {
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({})

  useEffect(() => {
    if (!activeOrganizationId) {
      return
    }

    cardRefs.current[activeOrganizationId]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest"
    })
  }, [activeOrganizationId])

  return (
    <section className={styles.sheet} aria-label="학원 카드 목록">
      <div className={styles.sheetHandle} aria-hidden="true" />

      <div className={styles.filterRow}>
        <span className={styles.filterChip}>지역 · {selectedRegionLabel}</span>
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
            const isActive = academy.id === activeOrganizationId
            const primaryClass = academy.representativeClasses[0] ?? null

            return (
              <li
                key={academy.id}
                ref={(node) => {
                  cardRefs.current[academy.id] = node
                }}
                className={`${styles.academyItem}${isActive ? ` ${styles.academyItemActive}` : ""}`}
              >
                <article
                  className={styles.academyCard}
                  onClick={() => onActiveOrganizationChange(academy.id)}
                  onMouseEnter={() => onActiveOrganizationChange(academy.id)}
                >
                  <div className={styles.academyCardHeader}>
                    <div>
                      <p className={styles.academyLocation}>{academy.locationSummary}</p>
                      <h2 className={styles.academyName}>{academy.displayName}</h2>
                    </div>
                    {favoritesEnabled && primaryClass ? (
                      <BookmarkButton
                        classId={primaryClass.id}
                        className={styles.academyBookmark}
                        activeClassName={styles.academyBookmarkActive}
                      />
                    ) : (
                      <span className={styles.academyBookmarkPlaceholder} aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <path
                            d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
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
                    {!academy.hasCoordinates ? <span>위치 정보 준비 중</span> : null}
                  </div>

                  <div className={styles.classPreviewList}>
                    {academy.representativeClasses.map((classItem) => (
                      <Link
                        key={classItem.id}
                        href={`/classes/${classItem.id}`}
                        className={styles.classPreviewCard}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div>
                          <p className={styles.classPreviewSubject}>{classItem.displaySubject}</p>
                          <h3 className={styles.classPreviewTitle}>{classItem.title}</h3>
                        </div>
                        <span className={styles.classPreviewAge}>{classItem.targetAge}</span>
                      </Link>
                    ))}
                  </div>

                  <div className={styles.academyCardFooter}>
                    <p className={styles.academyAddress}>
                      {academy.address ? academy.address : "주소 정보를 준비 중이에요."}
                    </p>
                    {primaryClass ? (
                      <Link
                        href={`/classes/${primaryClass.id}`}
                        className={styles.primaryAction}
                        onClick={(event) => event.stopPropagation()}
                      >
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
