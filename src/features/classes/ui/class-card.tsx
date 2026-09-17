import Image from "next/image"
import Link from "next/link"

import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import styles from "./class-card.module.css"

export type ClassCardProps = {
  href: string
  thumbnailUrl: string | null
  thumbnailAlt: string
  title: string
  academyName: string | null
  secondaryLabel: string | null
  /** 대상 학년. 수업에 실제로 적혀 있을 때만 넘긴다. */
  gradeLabel?: string | null
  priceLabel: string
  isFree: boolean
  scheduleLabel?: string | null
  distanceLabel?: string | null
  classId: string
}

export function ClassCard({
  href,
  thumbnailUrl,
  thumbnailAlt,
  title,
  academyName,
  secondaryLabel,
  gradeLabel,
  priceLabel,
  isFree,
  scheduleLabel,
  distanceLabel,
  classId
}: ClassCardProps) {
  return (
    <Link href={href} className={styles.card}>
      <div className={styles.thumbnail}>
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={thumbnailAlt}
            fill
            sizes="(max-width: 480px) 44vw, 220px"
            style={{ objectFit: "cover" }}
            unoptimized
          />
        ) : (
          <div className={styles.placeholder} role="img" aria-label="첫수업 준비 중인 수업 이미지입니다.">
            첫수업 준비 중인 수업 이미지입니다.
          </div>
        )}
        <span className={`${styles.priceBadge} ${isFree ? styles.priceBadgeFree : styles.priceBadgePaid}`}>
          {priceLabel}
        </span>
        <BookmarkButton
          classId={classId}
          className={styles.bookmarkButton}
          activeClassName={styles.bookmarkButtonActive}
          iconSize={20}
          variant="heart"
        />
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        {secondaryLabel ? <p className={styles.meta}>{secondaryLabel}</p> : null}
        {academyName ? <p className={styles.academy}>{academyName}</p> : null}
        {gradeLabel ? <p className={styles.meta}>{gradeLabel}</p> : null}
        {/* 예약 가능 일정은 실제 class_schedules 가 있을 때만 내려온다. 없으면 이 줄이 없다. */}
        {scheduleLabel ? <p className={styles.schedule}>{scheduleLabel}</p> : null}
        {distanceLabel ? <p className={styles.distance}>{distanceLabel}</p> : null}
      </div>
    </Link>
  )
}
