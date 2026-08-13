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
  secondaryLabel: string | null
  priceLabel: string
  isFree: boolean
  statusBadge?: { label: string; tone: "open" | "muted" } | null
  scheduleLabel?: string | null
  classId: string
}

export function ClassCard({
  href,
  thumbnailUrl,
  thumbnailAlt,
  title,
  academyName,
  secondaryLabel,
  priceLabel,
  isFree,
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
      </div>
    </Link>
  )
}
