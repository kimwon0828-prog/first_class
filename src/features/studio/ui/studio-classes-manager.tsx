"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { submitToggleStudioClassActiveAction } from "@/features/studio/actions/toggle-studio-class-active"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import styles from "@/features/studio/ui/studio-classes-manager.module.css"

type StudioClassesManagerProps = {
  items: ClassSummary[]
}

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

const PROGRAM_TYPE_LABELS: Record<ClassSummary["programType"], string> = {
  trial_class: "체험수업",
  level_test: "레벨테스트"
}

export const StudioClassesManager = ({ items }: StudioClassesManagerProps) => {
  const searchParams = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [query, setQuery] = useState("")
  const [toastState, setToastState] = useState<null | "created" | "updated">(null)
  const totalCount = items.length
  const activeCount = items.filter((item) => item.isActive).length
  const inactiveCount = totalCount - activeCount
  const teacherCount = useMemo(() => {
    const unique = new Set<string>()
    items.forEach((item) => {
      if (item.teacherId) {
        unique.add(item.teacherId)
        return
      }

      const fallback = (item.teacherDisplayName ?? item.teacherName ?? "").trim()
      if (fallback) {
        unique.add(fallback)
      }
    })
    return unique.size
  }, [items])

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return items.filter((item) => {
      if (statusFilter === "active" && !item.isActive) {
        return false
      }

      if (statusFilter === "inactive" && item.isActive) {
        return false
      }

      if (!needle) {
        return true
      }

      const haystacks = [
        item.title,
        item.teacherDisplayName,
        item.teacherName,
        PROGRAM_TYPE_LABELS[item.programType],
        item.subject,
        item.region,
        item.targetAge
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .map((value) => value.toLowerCase())

      return haystacks.some((value) => value.includes(needle))
    })
  }, [items, query, statusFilter])

  useEffect(() => {
    const success = searchParams.get("success")
    const normalized =
      success === "updated" ? "updated" : success === "created" || searchParams.get("created") === "1" ? "created" : null

    if (!normalized) {
      return
    }

    setToastState(normalized)

    const url = new URL(window.location.href)
    url.searchParams.delete("success")
    url.searchParams.delete("created")
    window.history.replaceState({}, "", url.toString())
  }, [searchParams])

  useEffect(() => {
    if (!toastState) {
      return
    }

    const timeoutId = window.setTimeout(() => setToastState(null), 4500)
    return () => window.clearTimeout(timeoutId)
  }, [toastState])

  return (
    <div className={styles.root}>
      {toastState ? (
        <div className={styles.toastWrap} role="status" aria-live="polite">
          <div className={styles.toast}>
            <div className={styles.toastIcon} aria-hidden="true" />
            <div className={styles.toastBody}>
              <p className={styles.toastTitle}>
                {toastState === "updated" ? "수업 정보가 수정되었습니다." : "새 프로그램이 등록되었습니다."}
              </p>
              <p className={styles.toastDescription}>
                {toastState === "updated"
                  ? "수업 목록에서 최신 공개 상태와 예약 시간을 다시 확인해 주세요."
                  : "수업 목록에서 공개 상태와 노출 정보를 확인해 주세요."}
              </p>
            </div>
            <button type="button" className={styles.toastClose} onClick={() => setToastState(null)}>
              닫기
            </button>
          </div>
        </div>
      ) : null}

      <section className={styles.metrics} aria-label="수업 요약 지표">
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <p className={styles.metricLabel}>전체 수업</p>
            <span className={styles.metricAccent} aria-hidden="true" />
          </div>
          <p className={styles.metricValue}>{totalCount}</p>
          <p className={styles.metricDescription}>등록된 수업 전체</p>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <p className={styles.metricLabel}>공개 중</p>
            <span className={styles.metricAccent} aria-hidden="true" />
          </div>
          <p className={styles.metricValue}>{activeCount}</p>
          <p className={styles.metricDescription}>학부모에게 노출 중인 수업</p>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <p className={styles.metricLabel}>비공개</p>
            <span className={styles.metricAccentMuted} aria-hidden="true" />
          </div>
          <p className={styles.metricValue}>{inactiveCount}</p>
          <p className={styles.metricDescription}>노출되지 않는 수업</p>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <p className={styles.metricLabel}>담당 선생님</p>
            <span className={styles.metricAccent} aria-hidden="true" />
          </div>
          <p className={styles.metricValue}>{teacherCount}</p>
          <p className={styles.metricDescription}>배정된 담당 수</p>
        </div>
      </section>

      <section className={styles.toolbar} aria-label="필터 및 검색">
        <div className={styles.searchWrap}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="수업명 / 선생님명 / 과목 / 지역 검색"
            className={styles.search}
            aria-label="수업 검색"
          />
        </div>
        <div className={styles.pills} role="tablist" aria-label="상태 필터">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`${styles.pill} ${statusFilter === "all" ? styles.pillActive : ""}`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`${styles.pill} ${statusFilter === "active" ? styles.pillActive : ""}`}
          >
            공개
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("inactive")}
            className={`${styles.pill} ${statusFilter === "inactive" ? styles.pillActive : ""}`}
          >
            비공개
          </button>
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.listCard} aria-label="수업 목록">
          <header className={styles.listHeader}>
            <div>
              <h2 className={styles.listTitle}>수업 목록</h2>
              <p className={styles.listDescription}>같은 organization에 속한 수업만 조회하고 관리합니다.</p>
            </div>
          </header>

          {items.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon} aria-hidden="true" />
              <p className={styles.emptyTitle}>아직 등록된 수업이 없어요.</p>
              <p className={styles.emptyDescription}>
                첫 수업을 등록하면 학부모가 수업을 확인하고 신청할 수 있어요.
              </p>
              <Link href="/studio/classes/new" className={styles.primaryButton} prefetch={false}>
                수업 등록하기
              </Link>
            </div>
          ) : (
            <>
              <div className={styles.ctaCard}>
                <div className={styles.ctaLeft}>
                  <div className={styles.ctaIcon} aria-hidden="true">
                    +
                  </div>
                  <div className={styles.ctaText}>
                    <p className={styles.ctaTitle}>새 프로그램을 등록해보세요</p>
                    <p className={styles.ctaDescription}>
                      체험수업, 레벨테스트, 정규 수업 정보를 등록하면 학부모가 바로 신청할 수 있어요.
                    </p>
                  </div>
                </div>
                <Link href="/studio/classes/new" className={styles.ctaButton} prefetch={false}>
                  새 프로그램 등록
                </Link>
              </div>

              {filteredItems.length === 0 ? (
                <div className={styles.emptySoft}>
                  <p className={styles.emptyTitle}>검색 결과가 없어요.</p>
                  <p className={styles.emptyDescription}>다른 키워드로 다시 검색해보세요.</p>
                </div>
              ) : (
                <div className={styles.cards}>
                  {filteredItems.map((item) => (
                    <article key={item.id} className={styles.classCard}>
                      <div className={styles.cardTop}>
                        <div
                          className={styles.cover}
                          style={
                            item.coverImageUrl
                              ? undefined
                              : {
                                  background: "#f3fbf4",
                                  border: "1px solid #eaf8ec"
                                }
                          }
                        >
                          {item.coverImageUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.coverImageUrl}
                                alt={`${item.title} 대표 이미지`}
                                className={styles.coverImage}
                              />
                            </>
                          ) : (
                            <div className={styles.coverPlaceholder}>
                              <span className={styles.coverMark}>첫수업</span>
                            </div>
                          )}
                        </div>

                        <div className={styles.cardBody}>
                          <div className={styles.badgeRow}>
                            <span
                              className={`${styles.badge} ${item.isActive ? styles.badgeActive : styles.badgeInactive}`}
                            >
                              {item.isActive ? "공개 중" : "비공개"}
                            </span>
                            <span className={styles.programPill}>{PROGRAM_TYPE_LABELS[item.programType]}</span>
                          </div>

                          <p className={styles.classTitle}>{item.title}</p>

                          <p className={styles.subtitle}>
                            {item.targetAge} · {item.subject} · {item.region}
                          </p>

                          <dl className={styles.metaGrid}>
                            <div className={styles.metaItem}>
                              <dt className={styles.metaLabel}>담당</dt>
                              <dd className={styles.metaValue}>
                                {item.teacherDisplayName ?? item.teacherName ?? "미지정"}
                              </dd>
                            </div>
                            <div className={styles.metaItem}>
                              <dt className={styles.metaLabel}>대상</dt>
                              <dd className={styles.metaValue}>{item.targetAge}</dd>
                            </div>
                            <div className={styles.metaItem}>
                              <dt className={styles.metaLabel}>유형</dt>
                              <dd className={styles.metaValue}>{PROGRAM_TYPE_LABELS[item.programType]}</dd>
                            </div>
                            <div className={styles.metaItem}>
                              <dt className={styles.metaLabel}>지역</dt>
                              <dd className={styles.metaValue}>{item.region}</dd>
                            </div>
                            <div className={styles.metaItem}>
                              <dt className={styles.metaLabel}>과목</dt>
                              <dd className={styles.metaValue}>{item.subject}</dd>
                            </div>
                            <div className={styles.metaItem}>
                              <dt className={styles.metaLabel}>체험비</dt>
                              <dd className={styles.metaValue}>{formatPrice(item.trialPrice)}</dd>
                            </div>
                            <div className={styles.metaItem}>
                              <dt className={styles.metaLabel}>예약 시간</dt>
                              <dd className={styles.metaValue}>
                                {item.schedules?.length ? `${item.schedules.length}개 설정됨` : "미설정"}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </div>

                      <div className={styles.cardFooter}>
                        <div className={styles.footerLeft}>
                          {item.isActive ? (
                            <Link href={`/classes/${item.id}`} className={styles.secondaryButtonSm}>
                              미리보기
                            </Link>
                          ) : (
                            <span className={styles.footerHint}>비공개 수업은 미리보기를 숨깁니다.</span>
                          )}
                        </div>
                        <div className={styles.footerRight}>
                          <ToggleClassActiveButton classId={item.id} isActive={item.isActive} />
                          <Link
                            href={`/studio/classes/${item.id}/edit`}
                            className={styles.primaryButtonSm}
                            prefetch={false}
                          >
                            수정하기
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

const ToggleClassActiveButton = ({ classId, isActive }: { classId: string; isActive: boolean }) => {
  return (
    <form action={submitToggleStudioClassActiveAction}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="nextIsActive" value={String(!isActive)} />
      <button type="submit" className={styles.secondaryButtonSm}>
        {isActive ? "비공개 전환" : "공개 전환"}
      </button>
    </form>
  )
}
