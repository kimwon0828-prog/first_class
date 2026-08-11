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
  subjectLabel: string | null
  gradeLabel: string | null
  priceLabel: string
  isFree: boolean
  statusBadge?: { label: string; tone: "open" | "muted" } | null
  scheduleLabel?: string | null
  classId: string
}

const buildMetaLabel = (subjectLabel: string | null, gradeLabel: string | null) =>
  [subjectLabel?.trim() || null, gradeLabel?.trim() || null].filter(Boolean).join(" · ")

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
  statusBadge = null,
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
        />
      </div>

      <div className={styles.body}>
        {statusBadge ? (
          <span
            className={`${styles.badge} ${
              statusBadge.tone === "open" ? styles.badgeOpen : styles.badgeMuted
            }`}
          >
            {statusBadge.label}
          </span>
        ) : null}

        <h3 className={styles.title}>{title}</h3>
        {academyName ? <p className={styles.academy}>{academyName}</p> : null}
        {metaLabel ? <p className={styles.meta}>{metaLabel}</p> : null}
        <p className={`${styles.price} ${isFree ? styles.priceFree : ""}`}>{priceLabel}</p>

        {scheduleLabel ? (
          <div className={styles.scheduleRow}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.scheduleIcon}>
              <path
                d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.scheduleText}>{scheduleLabel}</span>
          </div>
        ) : null}
      </div>
    </Link>
  )
}
