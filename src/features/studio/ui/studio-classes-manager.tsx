"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import { submitToggleStudioClassActiveAction } from "@/features/studio/actions/toggle-studio-class-active"
import type { StudioClassListItem } from "@/shared/lib/db/adapter"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import styles from "@/features/studio/ui/studio-classes-manager.module.css"

type StudioClassesManagerProps = {
  items: StudioClassListItem[]
}

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

const PROGRAM_TYPE_LABELS: Record<StudioClassListItem["programType"], string> = {
  trial_class: "체험수업",
  level_test: "레벨테스트"
}

export const StudioClassesManager = ({ items }: StudioClassesManagerProps) => {
  const searchParams = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [query, setQuery] = useState("")
  const [toastState, setToastState] = useState<null | "created" | "updated">(null)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  // 한 번에 하나의 행 메뉴만 열린다.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const totalCount = items.length
  const activeCount = items.filter((item) => item.isActive).length
  const inactiveCount = totalCount - activeCount
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
    if (!openMenuId) {
      return
    }

    const close = () => setOpenMenuId(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close()
      }
    }

    window.addEventListener("click", close)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [openMenuId])

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

      <section className={styles.workspace} aria-label="수업 목록">
        <p className={styles.resultMeta}>
          전체 {totalCount}개 · 공개 {activeCount}개 · 비공개 {inactiveCount}개
          {filteredItems.length !== totalCount ? ` · 조건에 맞는 수업 ${filteredItems.length}개` : ""}
        </p>

        {items.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>아직 등록된 수업이 없어요.</p>
            <p className={styles.emptyDescription}>
              첫 수업을 등록하면 학부모가 수업을 확인하고 신청할 수 있어요.
            </p>
            <Link
              href="/studio/classes/new"
              className={styles.primaryButton}
              aria-busy={pendingHref === "/studio/classes/new"}
              onClick={() => setPendingHref("/studio/classes/new")}
            >
              {pendingHref === "/studio/classes/new" ? "이동 중..." : "수업 등록"}
            </Link>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>검색 결과가 없어요.</p>
            <p className={styles.emptyDescription}>다른 키워드로 다시 검색해 보세요.</p>
          </div>
        ) : (
          <>
            <div className={styles.listHead} aria-hidden="true">
              <span>수업</span>
              <span>대상 · 유형</span>
              <span>담당</span>
              <span>예약 시간</span>
              <span>공개</span>
              <span />
            </div>

            <ul className={styles.list}>
              {filteredItems.map((item) => (
                <li key={item.id} className={styles.row}>
                  <div className={styles.cellClass}>
                    <Link
                      href={`/studio/classes/${item.id}/edit`}
                      className={styles.classTitle}
                      aria-busy={pendingHref === `/studio/classes/${item.id}/edit`}
                      onClick={() => setPendingHref(`/studio/classes/${item.id}/edit`)}
                    >
                      {item.title}
                    </Link>
                    <span className={styles.classMeta}>
                      {[formatClassSubjectDisplayLabel(item) || null, formatPrice(item.trialPrice)]
                        .filter((value): value is string => Boolean(value))
                        .join(" · ")}
                    </span>
                  </div>

                  <div className={styles.cellText}>
                    {formatStoredTargetGrades(item.targetAge)}
                    <span className={styles.cellSub}>{PROGRAM_TYPE_LABELS[item.programType]}</span>
                  </div>

                  <div className={styles.cellText}>
                    {item.teacherDisplayName ?? item.teacherName ?? (
                      <span className={styles.cellMuted}>미지정</span>
                    )}
                  </div>

                  <div className={styles.cellText}>
                    {item.scheduleCount > 0 ? (
                      `${item.scheduleCount}개`
                    ) : (
                      <span className={styles.cellMuted}>미설정</span>
                    )}
                  </div>

                  <div className={styles.cellStatus}>
                    <span
                      className={`${styles.badge} ${item.isActive ? styles.badgeActive : styles.badgeInactive}`}
                    >
                      {item.isActive ? "공개 중" : "비공개"}
                    </span>
                  </div>

                  <div className={styles.cellActions}>
                    <Link
                      href={`/studio/classes/${item.id}/edit`}
                      className={styles.rowActionStrong}
                      aria-busy={pendingHref === `/studio/classes/${item.id}/edit`}
                      onClick={() => setPendingHref(`/studio/classes/${item.id}/edit`)}
                    >
                      {pendingHref === `/studio/classes/${item.id}/edit` ? "이동 중..." : "수정"}
                    </Link>

                    <div
                      className={styles.rowMenu}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={`${styles.rowMenuButton} ${
                          openMenuId === item.id ? styles.rowMenuButtonOpen : ""
                        }`}
                        aria-label={`${item.title} 관리 메뉴`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === item.id}
                        onClick={() => setOpenMenuId((current) => (current === item.id ? null : item.id))}
                      >
                        ⋯
                      </button>

                      {openMenuId === item.id ? (
                        <div className={styles.rowMenuList} role="menu">
                          <Link href={`/classes/${item.id}`} className={styles.rowMenuItem} role="menuitem">
                            미리보기
                          </Link>
                          <ToggleClassActiveButton classId={item.id} isActive={item.isActive} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

const ToggleClassActiveButton = ({ classId, isActive }: { classId: string; isActive: boolean }) => {
  return (
    <form action={submitToggleStudioClassActiveAction} className={styles.rowMenuForm}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="nextIsActive" value={String(!isActive)} />
      {/* 상태 배지("공개 중"/"비공개")와 헷갈리지 않도록 행동형으로 적는다. */}
      <button type="submit" className={styles.rowMenuItem} role="menuitem">
        {isActive ? "비공개하기" : "공개하기"}
      </button>
    </form>
  )
}
