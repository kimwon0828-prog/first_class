import Image from "next/image"
import Link from "next/link"

import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { formatCompactedGradeLabel } from "@/features/classes/lib/format-compacted-grade-label"
import styles from "./class-card.module.css"

export type ClassCardProps = {
  href: string
  thumbnailUrl: string | null
  thumbnailAlt: string
  title: string
  academyName: string | null
  subjectLabel: string | null
  gradeLabel: string | null
  priceLabel: string
  isFree: boolean
  statusBadge?: { label: string; tone: "open" | "muted" } | null
  scheduleLabel?: string | null
  classId: string
}

const buildMetaLabel = (subjectLabel: string | null, gradeLabel: string | null) =>
  [subjectLabel?.trim() || null, formatCompactedGradeLabel(gradeLabel) || null].filter(Boolean).join(" · ")

export function ClassCard({
  href,
  thumbnailUrl,
  thumbnailAlt,
  title,
  academyName,
  subjectLabel,
  gradeLabel,
  priceLabel,
  isFree,
  scheduleLabel = null,
  classId
}: ClassCardProps) {
  const metaLabel = buildMetaLabel(subjectLabel, gradeLabel)

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
        <BookmarkButton
          classId={classId}
          className={styles.bookmarkButton}
          activeClassName={styles.bookmarkButtonActive}
          iconSize={17}
          variant="heart"
        />
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        {academyName ? <p className={styles.academy}>{academyName}</p> : null}
        {metaLabel ? <p className={styles.meta}>{metaLabel}</p> : null}
        {scheduleLabel ? (
          <p className={styles.scheduleText}>일시 {scheduleLabel}</p>
        ) : null}
        <p className={`${styles.price} ${isFree ? styles.priceFree : ""}`}>{priceLabel}</p>
      </div>
    </Link>
  )
}
