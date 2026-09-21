"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, useTransition } from "react"
import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { readFavoriteClassIds } from "@/features/favorites/lib/storage"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import { formatDiscoveryPrice } from "@/features/classes/lib/class-discovery-results"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { ImageFallback } from "@/shared/ui/image-fallback"
import card from "@/features/classes/ui/class-card.module.css"
import { FavoritesFrame, FavoritesSkeleton } from "./favorites-frame"
import styles from "./favorites.module.css"

function FavoriteCard({ item, onError }: { item: ClassSummary; onError: () => void }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const academy = item.organization ? [item.organization.name, item.organization.branchName].filter(Boolean).join(" ") : null
  const region = item.organization ? formatAdministrativeRegionLabel(item.organization) : null
  return <article className={card.card}>
    <Link href={`/classes/${item.id}`} className={card.link}>
      <div className={card.thumbnail}>{item.coverImageUrl && item.coverImageUrl !== failedUrl ? <Image src={item.coverImageUrl} alt={`${item.title} 대표 이미지`} fill sizes="112px" unoptimized style={{objectFit:"cover"}} onError={() => setFailedUrl(item.coverImageUrl)} /> : <ImageFallback label="수업 이미지 없음" />}</div>
      <div className={card.body}>
        <div className={card.metadata}><span className={card.chip}>{formatClassSubjectDisplayLabel(item)}</span><span className={card.meta}>{formatStoredTargetGrades(item.targetAge)}</span></div>
        <h2 className={`${card.title} ${styles.cardTitle}`}>{item.title}</h2>
        <p className={card.price}>{formatDiscoveryPrice(item.trialPrice)}</p>
        {academy ? <p className={card.academy}>{academy}</p> : null}
        {region ? <p className={card.academy}>{region}</p> : null}
      </div>
      <svg className={styles.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </Link>
    <BookmarkButton classId={item.id} className={card.bookmarkButton} activeClassName={card.bookmarkButtonActive} variant="heart" iconSize={20} onError={onError} />
  </article>
}

export function FavoritesClient(props: { allClasses: ClassSummary[]; queryError: string | null; favoritesEnabled: boolean; scheduleEntryHref: string; recordEntryHref: string; myPageEntryHref: string; studioHref: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [storage, setStorage] = useState<ReturnType<typeof readFavoriteClassIds> | null>(null)
  const [writeError, setWriteError] = useState(false)
  const refreshStorage = useCallback(() => { setStorage(readFavoriteClassIds()); setWriteError(false) }, [])
  useEffect(() => {
    if (!props.favoritesEnabled) return
    refreshStorage()
    window.addEventListener("firstclass_favorites_updated", refreshStorage)
    window.addEventListener("storage", refreshStorage)
    return () => { window.removeEventListener("firstclass_favorites_updated", refreshStorage); window.removeEventListener("storage", refreshStorage) }
  }, [props.favoritesEnabled, refreshStorage])
  const ids = new Set(storage?.ids)
  const items = props.allClasses.filter(item => ids.has(item.id))
  return <FavoritesFrame scheduleHref={props.scheduleEntryHref} recordHref={props.recordEntryHref} myPageHref={props.myPageEntryHref}>
    {!props.favoritesEnabled ? <section className={styles.state}><h2>학원 계정은 관심수업 기능을 사용할 수 없어요.</h2><Link className={styles.action} href={props.studioHref}>스튜디오로 이동</Link></section>
    : props.queryError ? <section className={styles.state} role="alert"><h2>관심수업을 불러오지 못했어요.</h2><p>잠시 후 다시 시도해주세요.</p><button className={styles.action} disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "불러오는 중" : "다시 시도하기"}</button></section>
    : !storage ? <FavoritesSkeleton />
    : storage.error ? <section className={styles.state} role="alert"><h2>브라우저 저장소를 확인할 수 없어요.</h2><p>브라우저 저장 설정을 확인하고 다시 시도해주세요.</p><button className={styles.action} onClick={refreshStorage}>다시 시도하기</button></section>
    : <><h2 className={styles.count}>관심수업 <span>{items.length}개</span></h2>
      {writeError ? <p role="alert" className={styles.notice}>관심수업을 해제하지 못했어요. 브라우저 저장 설정을 확인하고 다시 시도해주세요.</p> : null}
      {items.length ? <ul className={styles.list} aria-label="관심수업 목록">{items.map(item => <li key={item.id}><FavoriteCard item={item} onError={() => setWriteError(true)} /></li>)}</ul>
      : <section className={styles.state}><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 21S2 15 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13Z" /></svg><h2>아직 관심수업이 없어요.</h2><p>마음에 드는 수업을 저장하고<br />언제든 다시 확인해보세요.</p><Link href="/classes" className={styles.action}>수업 찾아보기</Link></section>}</>}
  </FavoritesFrame>
}
