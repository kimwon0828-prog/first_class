import { ImageFallback } from "@/shared/ui/image-fallback"
import Image from "next/image"
import Link from "next/link"

import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import styles from "./home-class-card.module.css"

/**
 * Parent Home 의 큐레이션 카드.
 *
 * Browse 의 검색 결과 카드(ClassCard)와 일부러 다르다. Home 은 카탈로그가
 * 아니라 "이런 것이 있어요" 를 몇 개만 보여 주는 자리라서, 한 장에 담는
 * 사실을 제목 · 학원 · 과목 · 체험비로 줄였다.
 *
 * ⚠️ 여기에 별점 · 일치율 · 순위 같은 칸을 만들지 않는다. 그런 값이 없다.
 */
export type HomeClassCardProps = {
  href: string
  thumbnailUrl: string | null
  thumbnailAlt: string
  title: string
  academyName: string | null
  subjectLabel: string | null
  priceLabel: string
  locationLabel?: string | null
  distanceLabel?: string | null
  classId: string
}

export function HomeClassCard({
  href,
  thumbnailUrl,
  thumbnailAlt,
  title,
  academyName,
  subjectLabel,
  priceLabel,
  locationLabel,
  distanceLabel,
  classId
}: HomeClassCardProps) {
  return (
    <article className={styles.card}>
      <Link href={href} className={styles.cardLink}>
      <span className={styles.thumbnail}>
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={thumbnailAlt}
            fill
            sizes="272px"
            style={{ objectFit: "cover" }}
            unoptimized
          />
        ) : (
          <ImageFallback label="수업 이미지 없음" />
        )}
      </span>

      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        <span className={styles.price}>{priceLabel}</span>
        <span className={styles.academy}>{[academyName, locationLabel].filter(Boolean).join(" · ")}</span>
        <span className={styles.metaRow}>
          {subjectLabel ? <span className={styles.subject}>{subjectLabel}</span> : null}
          {distanceLabel ? <span className={styles.distance}>{distanceLabel}</span> : null}
        </span>
      </span>
      </Link>
        <BookmarkButton
          classId={classId}
          className={styles.bookmark}
          activeClassName={styles.bookmarkActive}
          iconSize={20}
          variant="heart"
        />
    </article>
  )
}
