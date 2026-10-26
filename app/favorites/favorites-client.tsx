"use client"

import { ParentDetailLink } from "@/features/classes/ui/parent-detail-link"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, useTransition } from "react"
import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { readFavoriteClassIds } from "@/features/favorites/lib/storage"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import { appPriceInfo } from "@/features/classes/lib/app-presentation"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { AppButton, AppButtonLink, PriceText, StatusBadge, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { FavoritesFrame, FavoritesSkeleton } from "./favorites-frame"
import styles from "./favorites.module.css"

// 앱 favorites.tsx 카드: 112 이미지 · 과목 배지 + 대상 · 제목 · 가격 · 학원 · 지역 · 관심 버튼.
function FavoriteCard({ item, onError }: { item: ClassSummary; onError: () => void }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const academy = item.organization ? [item.organization.name, item.organization.branchName].filter(Boolean).join(" ") : null
  const region = item.organization ? formatAdministrativeRegionLabel(item.organization) : null
  const subject = formatClassSubjectDisplayLabel(item)
  const price = appPriceInfo(item.programType, item.trialPrice, item.trialPriceConfirmed, item.programType === "level_test" ? "레벨테스트" : "체험수업")
  return <article className={styles.card}>
    <ParentDetailLink href={`/classes/${item.id}`} className={styles.link} aria-label={`${item.title} 상세 보기`}>
      <span className={styles.thumbnail}>{item.coverImageUrl && item.coverImageUrl !== failedUrl ? <Image src={item.coverImageUrl} alt={`${item.title} 대표 이미지`} fill sizes="112px" unoptimized style={{ objectFit: "cover" }} onError={() => setFailedUrl(item.coverImageUrl)} /> : <AppIcon name="image" size={24} />}</span>
      <span className={styles.body}>
        <span className={styles.meta}>{subject ? <StatusBadge label={subject} /> : null}<span className={ui.caption}>{formatStoredTargetGrades(item.targetAge)}</span></span>
        <span className={styles.title}>{item.title}</span>
        <PriceText price={price} />
        {academy ? <span className={ui.caption}>{academy}</span> : null}
        {region ? <span className={ui.caption}>{region}</span> : null}
      </span>
      <AppIcon name="chevron-right" size={16} />
    </ParentDetailLink>
    <BookmarkButton classId={item.id} className={styles.heart} activeClassName={ui.favoriteActive} variant="heart" iconSize={22} onError={onError} />
  </article>
}

export function FavoritesClient(props: { allClasses: ClassSummary[]; queryError: string | null; favoritesEnabled: boolean; studioHref: string }) {
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
  return <FavoritesFrame>
    {!props.favoritesEnabled ? <div className={ui.notice}><p className={ui.body}>학부모 계정에서 관심수업을 이용할 수 있어요.</p><AppButtonLink href={props.studioHref} variant="secondary">스튜디오로 이동</AppButtonLink></div>
    : props.queryError ? <div className={ui.notice} role="alert"><p className={ui.body}>관심수업을 불러오지 못했어요.</p><AppButton variant="secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "불러오는 중" : "다시 시도"}</AppButton></div>
    : !storage ? <FavoritesSkeleton />
    : storage.error ? <div className={ui.notice} role="alert"><p className={ui.body}>브라우저 저장소를 확인할 수 없어요. 브라우저 저장 설정을 확인하고 다시 시도해 주세요.</p><AppButton variant="secondary" onClick={refreshStorage}>다시 시도</AppButton></div>
    : <><h2 className={styles.count}>관심수업 <span>{items.length}개</span></h2>
      {writeError ? <p role="alert" className={ui.error}>관심수업을 해제하지 못했어요. 브라우저 저장 설정을 확인하고 다시 시도해 주세요.</p> : null}
      {items.length ? <ul className={styles.list} aria-label="관심수업 목록">{items.map(item => <li key={item.id}><FavoriteCard item={item} onError={() => setWriteError(true)} /></li>)}</ul>
      : <section className={styles.empty}><AppIcon name="heart" size={40} /><h2 className={ui.subtitle}>아직 관심수업이 없어요.</h2><p className={ui.bodyMuted}>마음에 드는 수업을 저장하고<br />언제든 다시 확인해보세요.</p><AppButtonLink href="/classes">수업 찾아보기</AppButtonLink></section>}</>}
  </FavoritesFrame>
}
