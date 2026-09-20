import Image from "next/image"
import Link from "next/link"
import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { ImageFallback } from "@/shared/ui/image-fallback"
import styles from "./class-card.module.css"

export type ClassCardProps = {
  href: string
  thumbnailUrl: string | null
  thumbnailAlt: string
  title: string
  academyName: string | null
  secondaryLabel: string | null
  regionLabel?: string | null
  gradeLabel?: string | null
  priceLabel: string
  scheduleLabel?: string | null
  distanceLabel?: string | null
  classId: string
}

export function ClassCard({ href, thumbnailUrl, thumbnailAlt, title, academyName,
  secondaryLabel, regionLabel, gradeLabel, priceLabel, classId }: ClassCardProps) {
  return <article className={styles.card}>
    <Link href={href} className={styles.link}>
      <div className={styles.thumbnail}>
        {thumbnailUrl ? <Image src={thumbnailUrl} alt={thumbnailAlt} fill sizes="112px" style={{ objectFit: "cover" }} unoptimized />
          : <ImageFallback label="수업 이미지 없음" />}
      </div>
      <div className={styles.body}>
        <div className={styles.metadata}>
          {secondaryLabel ? <span className={styles.chip}>{secondaryLabel}</span> : null}
          {gradeLabel ? <span className={styles.meta}>대상 {gradeLabel}</span> : null}
        </div>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.price}>{priceLabel}</p>
        {academyName || regionLabel ? <p className={styles.academy}>{[academyName, regionLabel].filter(Boolean).join(" · ")}</p> : null}
      </div>
    </Link>
    <BookmarkButton classId={classId} className={styles.bookmarkButton} activeClassName={styles.bookmarkButtonActive} iconSize={20} variant="heart" />
  </article>
}
