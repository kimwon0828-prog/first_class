import { canOptimizeParentImage } from "@/features/classes/lib/parent-image"
import { ParentDetailLink } from "@/features/classes/ui/parent-detail-link"
import { ImageFallback } from "@/shared/ui/image-fallback"
import Image from "next/image"

import type { CardSlot } from "@/features/native/server/academy-cards"
import { isCardBookable } from "@/features/native/server/academy-cards"

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
  priority?: boolean
  slots?: CardSlot[]
  now?: number
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
  classId,
  slots = [],
  now = Date.now(),
  priority = false
}: HomeClassCardProps) {
  const soon = slots.filter(slot => isCardBookable(slot, now) && Date.parse(slot.startAt) < now + 7 * 86400000)
  const formatSlot = (at: string) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)).map(part => [part.type, part.value]))
    return `${parts.weekday} ${parts.hour}:${parts.minute}`
  }
  return (
    <article className={styles.card}>
      <ParentDetailLink href={href} className={styles.cardLink}>
      <span className={styles.thumbnail}>
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={thumbnailAlt}
            fill
            sizes="240px"
            style={{ objectFit: "cover" }}
            priority={priority}
            unoptimized={!canOptimizeParentImage(thumbnailUrl)}
          />
        ) : (
          <ImageFallback label="수업 이미지 없음" />
        )}
      </span>

      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        <span className={styles.academy}>{[academyName, soon[0] ? formatSlot(soon[0].startAt) : locationLabel].filter(Boolean).join(" · ")}</span>
        <span className={styles.price} data-free={priceLabel === "무료 체험" || undefined} data-unknown={priceLabel.includes("확인") || priceLabel.includes("문의") || undefined}>{priceLabel}</span>
        <span className={styles.metaRow}>
          {subjectLabel ? <span className={styles.subject}>{subjectLabel}</span> : null}
          {distanceLabel ? <span className={styles.distance}>{distanceLabel}</span> : null}
        </span>
      </span>
      </ParentDetailLink>
      {soon.length ? <div className={styles.timeChips} aria-label="이번 주 체험 시간">
        {soon.slice(0, 2).map(slot => <ParentDetailLink key={slot.optionId} href={href} className={styles.timeChip} aria-label={`${formatSlot(slot.startAt)} 일정 확인`}>{formatSlot(slot.startAt)}</ParentDetailLink>)}
        {soon.length > 2 ? <ParentDetailLink href={href} className={styles.timeChip} aria-label={`일정 ${soon.length - 2}개 더 보기`}>+{soon.length - 2}</ParentDetailLink> : null}
      </div> : null}
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
