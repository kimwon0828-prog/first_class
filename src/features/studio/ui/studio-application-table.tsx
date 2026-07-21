"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import {
  STUDIO_APPLICATION_FILTERS,
  getStudioApplicationFilterCount,
  isNoShowApplication,
  matchesStudioApplicationFilter,
  type StudioApplicationFilterKey
} from "@/features/studio/lib/application-filters"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "./studio-application-table.module.css"

const formatDateTime = (value: string | null) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date)
}

const resolveScheduleDisplay = (application: StudioApplicationSummary) => {
  const confirmedAt = formatDateTime(application.confirmedSlotAt)
  const requestedAt = formatDateTime(application.requestedSlotAt)
  const selectedLabel = application.selectedScheduleLabel?.trim()
    ? application.selectedScheduleLabel.trim()
    : null

  if (confirmedAt) {
    return {
      label: "확정 일정",
      primary: confirmedAt,
      secondary:
        selectedLabel && selectedLabel !== confirmedAt ? `신청 선택: ${selectedLabel}` : null
    }
  }

  if (requestedAt) {
    return {
      label: "희망 일정",
      primary: requestedAt,
      secondary:
        selectedLabel && selectedLabel !== requestedAt ? `선택 시간: ${selectedLabel}` : null
    }
  }

  if (selectedLabel) {
    return {
      label: "희망 일정",
      primary: selectedLabel,
      secondary: null
    }
  }

  return {
    label: "일정",
    primary: "일정 협의 필요",
    secondary: null
  }
}

const getStatusBadge = (application: StudioApplicationSummary) => {
  if (application.status === "new") {
    return { label: "신규 신청", tone: "successSoft" as const }
  }

  if (application.status === "reviewing") {
    return { label: "상담/확인 중", tone: "warningSoft" as const }
  }

  if (application.status === "confirmed") {
    return { label: "일정 확정", tone: "infoSoft" as const }
  }

  if (application.status === "completed") {
    return { label: "체험 완료", tone: "neutralSoft" as const }
  }

  if (isNoShowApplication(application)) {
    return { label: "노쇼", tone: "dangerSoft" as const }
  }

  return { label: "취소", tone: "dangerSoft" as const }
}

const getSecondaryBadge = (application: StudioApplicationSummary) => {
  if (application.registrationStatus === "enrolled") {
    return { label: "등록 완료", tone: "successSolid" as const }
  }

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
  const [statusFilter, setStatusFilter] = useState<StudioApplicationFilterKey>("all")
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null)

  const filterCounts = useMemo(() => {
    return Object.fromEntries(
      STUDIO_APPLICATION_FILTERS.map((filter) => [
        filter.key,
        getStudioApplicationFilterCount(items, filter.key)
      ])
    ) as Record<StudioApplicationFilterKey, number>
  }, [items])

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
        item.classSubject ?? "",
        item.assignedTeacherName ?? ""
      ]
        .join(" ")
        .toLowerCase()

      return queryTokens.every((token) => haystack.includes(token))
    }

    const matchesFilter = (item: StudioApplicationSummary) => {
      return matchesStudioApplicationFilter(item, statusFilter)
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
            placeholder="학생명 / 보호자 / 수업명 / 담당 선생님 / 연락처 검색"
            className={styles.search}
            aria-label="신청 검색"
          />
        </div>
        <div className={styles.pills} role="tablist" aria-label="상태 필터">
          {STUDIO_APPLICATION_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`${styles.pill} ${statusFilter === filter.key ? styles.pillActive : ""}`}
            >
              <span>{filter.label}</span>
              <span className={styles.pillCount}>{filterCounts[filter.key]}</span>
            </button>
          ))}
        </div>
        <p className={styles.filteredCount}>표시 {filteredItems.length}건</p>
      </section>

      {filteredItems.length === 0 ? (
        <section className={styles.emptyState} aria-label="필터 결과 없음">
          <h3 className={styles.emptyTitle}>조건에 맞는 신청이 없어요.</h3>
          <p className={styles.emptyDescription}>검색어나 상태 필터를 바꿔서 다시 확인해 주세요.</p>
        </section>
      ) : null}

      {filteredItems.length > 0 ? (
        <div className={styles.desktopTable}>
          <div className={styles.tableCard}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>상태</th>
                    <th className={styles.th}>학생 / 신청일</th>
                    <th className={styles.th}>수업</th>
                    <th className={styles.th}>일정</th>
                    <th className={styles.th}>담당 선생님</th>
                    <th className={styles.th}>보호자</th>
                    <th className={styles.th}>연락처</th>
                    <th className={styles.thRight}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const primaryBadge = getStatusBadge(item)
                    const secondaryBadge = getSecondaryBadge(item)
                    const schedule = resolveScheduleDisplay(item)
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
                          <div className={styles.subLine}>
                            신청일 {formatDateTime(item.createdAt) ?? "확인 필요"}
                          </div>
                        </td>
                        <td className={styles.td}>
                          <div className={styles.primaryText}>{item.classTitle ?? "-"}</div>
                          <div className={styles.subLine}>
                            {[item.classSubject, item.classRegion].filter(Boolean).join(" · ") || "-"}
                          </div>
                        </td>
                        <td className={styles.td}>
                          <div className={styles.metaKicker}>{schedule.label}</div>
                          <div className={styles.primaryText}>{schedule.primary}</div>
                          {schedule.secondary ? (
                            <div className={styles.subLine}>{schedule.secondary}</div>
                          ) : null}
                        </td>
                        <td className={styles.td}>
                          <div className={styles.primaryText}>{item.assignedTeacherName ?? "미배정"}</div>
                          <div className={styles.subLine}>
                            {item.assignedTeacherName ? "담당 선생님 배정 완료" : "담당 선생님 배정 필요"}
                          </div>
                        </td>
                        <td className={styles.td}>{item.parentName ?? "-"}</td>
                        <td className={styles.td}>{item.parentPhone ?? "-"}</td>
                        <td className={styles.tdRight}>
                          <Link
                            href={`/studio/applications/${item.id}`}
                            className={styles.manageButton}
                            aria-busy={pendingApplicationId === item.id}
                            onClick={() => setPendingApplicationId(item.id)}
                          >
                            {pendingApplicationId === item.id ? "이동 중..." : "관리"}
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
      ) : null}

      {filteredItems.length > 0 ? (
        <div className={styles.mobileCards}>
          <div className={styles.cardList}>
            {filteredItems.map((item) => {
              const primaryBadge = getStatusBadge(item)
              const secondaryBadge = getSecondaryBadge(item)
              const schedule = resolveScheduleDisplay(item)
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
                      <dt className={styles.metaLabel}>{schedule.label}</dt>
                      <dd className={styles.metaValue}>
                        {schedule.primary}
                        {schedule.secondary ? (
                          <span className={styles.subLine}>{schedule.secondary}</span>
                        ) : null}
                      </dd>
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
                      <dt className={styles.metaLabel}>담당 선생님</dt>
                      <dd className={styles.metaValue}>{item.assignedTeacherName ?? "미배정"}</dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt className={styles.metaLabel}>신청일</dt>
                      <dd className={styles.metaValue}>{formatDateTime(item.createdAt) ?? "-"}</dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt className={styles.metaLabel}>연락처</dt>
                      <dd className={styles.metaValue}>{item.parentPhone ?? "-"}</dd>
                    </div>
                  </dl>

                  <div className={styles.cardFooter}>
                    <div className={styles.footerHint}>{formatDateTime(item.createdAt) ?? "-"} 접수</div>
                    <Link
                      href={`/studio/applications/${item.id}`}
                      className={styles.primaryButton}
                      aria-busy={pendingApplicationId === item.id}
                      onClick={() => setPendingApplicationId(item.id)}
                    >
                      {pendingApplicationId === item.id ? "이동 중..." : "신청 관리하기"}
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
