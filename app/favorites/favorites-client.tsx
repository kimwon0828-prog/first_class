"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { BookmarkButton } from "@/features/favorites/ui/bookmark-button"
import { getFavoriteClassIds } from "@/features/favorites/lib/storage"
import type { ClassSummary } from "@/shared/lib/db/adapter"

import styles from "../classes/page.module.css"

export function FavoritesClient(props: {
  allClasses: ClassSummary[]
  favoritesEnabled: boolean
  myApplicationsEntryHref: string
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
      <div className={styles.shell} style={{ paddingBottom: 120 }}>
        <section style={{ padding: "18px 24px 0" }}>
          <h1 style={{ margin: 0, fontSize: 24, color: "#111111" }}>관심수업</h1>
        </section>

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
            <p className={styles.stateDesc}>
              마음에 드는 수업을 저장해두고 나중에 다시 확인해보세요.
            </p>
            <Link href="/classes" className={styles.retryLink}>
              수업 둘러보기
            </Link>
          </section>
        ) : (
          <section aria-label="관심수업 목록" style={{ marginTop: 10 }}>
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
                        <span className={styles.star}>★</span>
                        <span>{item.subject}</span>
                        <span>·</span>
                        <span>{item.targetAge}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <nav className={styles.bottomNav} aria-label="하단 탭">
        <Link href="/classes" className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>홈</span>
        </Link>
        <Link href="/favorites" className={`${styles.navItem} ${styles.navItemActive}`}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>관심수업</span>
        </Link>
        <Link href={props.myApplicationsEntryHref} className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>내 신청</span>
        </Link>
      </nav>
    </main>
  )
}
