"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "./studio-application-table.module.css"

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

const getStatusBadge = (application: StudioApplicationSummary) => {
  if (application.registrationStatus === "enrolled") {
    return { label: "등록 완료", tone: "successSolid" as const }
  }

  if (application.status === "new") {
    return { label: "신규 신청", tone: "successSoft" as const }
  }

  if (application.status === "reviewing") {
    return { label: "상담 대기", tone: "warningSoft" as const }
  }

  if (application.status === "confirmed") {
    return { label: "수업 확정", tone: "infoSoft" as const }
  }

  if (application.status === "completed") {
    return { label: "수업 완료", tone: "neutralSoft" as const }
  }

  return { label: "신청 취소", tone: "dangerSoft" as const }
}

const getSecondaryBadge = (application: StudioApplicationSummary) => {
  if (application.registrationStatus === "pending") {
    return { label: "등록 보류", tone: "warningSoft" as const }
  }

  if (application.registrationStatus === "not_enrolled") {
    return { label: "미등록", tone: "neutralSoft" as const }
  }

  if (application.status === "completed" && application.registrationStatus === "undecided") {
    return { label: "등록 미정", tone: "neutralSoft" as const }
  }

  return null
}

const Badge = ({
  label,
  tone
}: {
  label: string
  tone:
    | "successSoft"
    | "warningSoft"
    | "infoSoft"
    | "neutralSoft"
    | "dangerSoft"
    | "darkSolid"
    | "successSolid"
}) => {
  return <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>{label}</span>
}

type StudioApplicationTableProps = {
  items: StudioApplicationSummary[]
}

export const StudioApplicationTable = ({ items }: StudioApplicationTableProps) => {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<
    "all" | StudioApplicationSummary["status"] | "enrolled"
  >("all")

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const queryTokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : []

    const matchesQuery = (item: StudioApplicationSummary) => {
      if (queryTokens.length === 0) {
        return true
      }

      const haystack = [
        item.childName,
        item.childGrade,
        item.parentName ?? "",
        item.parentPhone ?? "",
        item.classTitle ?? "",
        item.goalType ?? "",
        item.classRegion ?? "",
        item.classSubject ?? ""
      ]
        .join(" ")
        .toLowerCase()

      return queryTokens.every((token) => haystack.includes(token))
    }

    const matchesFilter = (item: StudioApplicationSummary) => {
      if (statusFilter === "all") {
        return true
      }

      if (statusFilter === "enrolled") {
        return item.registrationStatus === "enrolled"
      }

      return item.status === statusFilter
    }

    return items.filter((item) => matchesFilter(item) && matchesQuery(item))
  }, [items, query, statusFilter])

  return (
    <div className={styles.wrap}>
      <section className={styles.toolbar} aria-label="검색 및 필터">
        <div className={styles.searchWrap}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="학생명 / 보호자 / 수업명 / 연락처 검색"
            className={styles.search}
            aria-label="신청 검색"
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
            onClick={() => setStatusFilter("new")}
            className={`${styles.pill} ${statusFilter === "new" ? styles.pillActive : ""}`}
          >
            신규
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("reviewing")}
            className={`${styles.pill} ${statusFilter === "reviewing" ? styles.pillActive : ""}`}
          >
            상담 대기
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("confirmed")}
            className={`${styles.pill} ${statusFilter === "confirmed" ? styles.pillActive : ""}`}
          >
            수업 확정
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("completed")}
            className={`${styles.pill} ${statusFilter === "completed" ? styles.pillActive : ""}`}
          >
            수업 완료
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("enrolled")}
            className={`${styles.pill} ${statusFilter === "enrolled" ? styles.pillActive : ""}`}
          >
            등록 완료
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("canceled")}
            className={`${styles.pill} ${statusFilter === "canceled" ? styles.pillActive : ""}`}
          >
            취소
          </button>
        </div>
        <p className={styles.filteredCount}>표시 {filteredItems.length}건</p>
      </section>

      <div className={styles.desktopTable}>
        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>상태</th>
                  <th className={styles.th}>학생</th>
                  <th className={styles.th}>수업</th>
                  <th className={styles.th}>희망 일정</th>
                  <th className={styles.th}>보호자</th>
                  <th className={styles.th}>연락처</th>
                  <th className={styles.thRight}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const primaryBadge = getStatusBadge(item)
                  const secondaryBadge = getSecondaryBadge(item)
                  return (
                    <tr key={item.id} className={styles.tr}>
                      <td className={styles.td}>
                        <div className={styles.badgeRow}>
                          <Badge label={primaryBadge.label} tone={primaryBadge.tone} />
                          {secondaryBadge ? (
                            <Badge label={secondaryBadge.label} tone={secondaryBadge.tone} />
                          ) : null}
                        </div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.primaryCell}>
                          <strong className={styles.primaryText}>{item.childName}</strong>
                          <span className={styles.subText}>· {item.childGrade}</span>
                        </div>
                        <div className={styles.subLine}>{formatDateTime(item.createdAt)}</div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.primaryText}>{item.classTitle ?? "-"}</div>
                        <div className={styles.subLine}>
                          {[item.classSubject, item.classRegion].filter(Boolean).join(" · ") || "-"}
                        </div>
                      </td>
                      <td className={styles.td}>{formatDateTime(item.requestedSlotAt)}</td>
                      <td className={styles.td}>{item.parentName ?? "-"}</td>
                      <td className={styles.td}>{item.parentPhone ?? "-"}</td>
                      <td className={styles.tdRight}>
                        <Link
                          href={`/studio/applications/${item.id}`}
                          prefetch={false}
                          className={styles.manageButton}
                        >
                          관리
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={styles.mobileCards}>
        <div className={styles.cardList}>
          {filteredItems.map((item) => {
            const primaryBadge = getStatusBadge(item)
            const secondaryBadge = getSecondaryBadge(item)
            return (
              <article key={item.id} className={styles.applicationCard}>
                <div className={styles.cardTop}>
                  <div className={styles.cardTitleRow}>
                    <strong className={styles.cardTitle}>
                      {item.childName} <span className={styles.cardTitleSub}>· {item.childGrade}</span>
                    </strong>
                    <div className={styles.badgeRow}>
                      <Badge label={primaryBadge.label} tone={primaryBadge.tone} />
                      {secondaryBadge ? <Badge label={secondaryBadge.label} tone={secondaryBadge.tone} /> : null}
                    </div>
                  </div>
                  <p className={styles.cardClassTitle}>{item.classTitle ?? "-"}</p>
                </div>

                <dl className={styles.metaGrid}>
                  <div className={styles.metaRow}>
                    <dt className={styles.metaLabel}>희망 일정</dt>
                    <dd className={styles.metaValue}>{formatDateTime(item.requestedSlotAt)}</dd>
                  </div>
                  <div className={styles.metaRow}>
                    <dt className={styles.metaLabel}>지역</dt>
                    <dd className={styles.metaValue}>{item.classRegion ?? "-"}</dd>
                  </div>
                  <div className={styles.metaRow}>
                    <dt className={styles.metaLabel}>보호자</dt>
                    <dd className={styles.metaValue}>{item.parentName ?? "-"}</dd>
                  </div>
                  <div className={styles.metaRow}>
                    <dt className={styles.metaLabel}>연락처</dt>
                    <dd className={styles.metaValue}>{item.parentPhone ?? "-"}</dd>
                  </div>
                </dl>

                <div className={styles.cardFooter}>
                  <div className={styles.footerHint}>{formatDateTime(item.createdAt)} 접수</div>
                  <Link
                    href={`/studio/applications/${item.id}`}
                    prefetch={false}
                    className={styles.primaryButton}
                  >
                    신청 관리하기
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
