"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { getFavoriteClassIds } from "@/features/favorites/lib/storage"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"

import styles from "../classes/page.module.css"
import headerStyles from "./favorites.module.css"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"

export function FavoritesClient(props: {
  allClasses: ClassSummary[]
  favoritesEnabled: boolean
  scheduleEntryHref: string
  recordEntryHref: string
  myPageEntryHref: string
}) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])

  const formatPrice = (price: number) => {
    if (price <= 0) {
      return "무료"
    }
    return `${price.toLocaleString("ko-KR")}원`
  }

  useEffect(() => {
    if (!props.favoritesEnabled) {
      setFavoriteIds([])
      return
    }

    const update = () => setFavoriteIds(getFavoriteClassIds())
    update()
    window.addEventListener("firstclass_favorites_updated", update)
    window.addEventListener("storage", update)
    return () => {
      window.removeEventListener("firstclass_favorites_updated", update)
      window.removeEventListener("storage", update)
    }
  }, [props.favoritesEnabled])

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds])
  const favoriteClasses = useMemo(
    () => props.allClasses.filter((item) => favoriteIdSet.has(item.id)),
    [favoriteIdSet, props.allClasses]
  )

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={headerStyles.header}>
          <Link href="/my" className={headerStyles.backButton} aria-label="뒤로가기">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <h1 className={headerStyles.title}>관심수업</h1>
          <span aria-hidden="true" />
        </header>

        {!props.favoritesEnabled ? (
          <section className={styles.stateCard}>
            <p className={styles.stateTitle}>학원 계정은 관심수업 기능을 사용할 수 없어요.</p>
            <p className={styles.stateDesc}>수업 관리는 스튜디오에서 진행해주세요.</p>
            <Link href="/studio" className={styles.retryLink}>
              스튜디오로 이동
            </Link>
          </section>
        ) : favoriteIds.length === 0 || favoriteClasses.length === 0 ? (
          <section className={styles.stateCard}>
            <p className={styles.stateTitle}>아직 관심수업이 없어요.</p>
            <p className={styles.stateDesc}>마음에 드는 수업을 저장해 두고 다시 확인해 보세요.</p>
            <Link href="/" className={styles.retryLink}>
              수업 찾아보기
            </Link>
          </section>
        ) : (
          <section aria-label="관심수업 목록" className={headerStyles.list}>
            <ul className={styles.grid}>
              {favoriteClasses.map((item) => (
                <li key={item.id}>
                  <Link href={`/classes/${item.id}`} className={styles.card}>
                    {props.favoritesEnabled ? (
                      <BookmarkButton
                        classId={item.id}
                        className={styles.bookmarkButton}
                        activeClassName={styles.bookmarkButtonActive}
                        onChange={(nextIsFavorite) => {
                          if (!nextIsFavorite) {
                            setFavoriteIds((prev) => prev.filter((id) => id !== item.id))
                          }
                        }}
                      />
                    ) : null}
                    <div className={styles.cardImage}>
                      {item.coverImageUrl ? (
                        <Image
                          src={item.coverImageUrl}
                          alt={`${item.title} 대표 이미지`}
                          fill
                          sizes="(max-width: 430px) 50vw, 215px"
                          style={{ objectFit: "cover" }}
                          unoptimized
                        />
                      ) : (
                        <div
                          className={styles.imagePlaceholder}
                          role="img"
                          aria-label="첫수업 준비 중인 수업 이미지입니다."
                        >
                          첫수업 준비 중인 수업 이미지입니다.
                        </div>
                      )}
                    </div>

                    <div className={styles.cardBody}>
                      <h3 className={styles.cardTitle}>{item.title}</h3>
                      <p className={styles.cardPrice}>{formatPrice(item.trialPrice)}</p>
                      <div className={styles.cardMeta}>
                        <span>{formatClassSubjectDisplayLabel(item) || "과목 정보 준비 중"}</span>
                        <span>·</span>
                        <span>{formatStoredTargetGrades(item.targetAge)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* 관심수업은 탭이 아니라 마이페이지 하위 화면이다. 그래서 마이페이지 탭이 켜진다. */}
      <ParentBottomNav
        scheduleHref={props.scheduleEntryHref}
        recordHref={props.recordEntryHref}
        myPageHref={props.myPageEntryHref}
      />
    </main>
  )
}
