"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState, type KeyboardEvent } from "react"

import {
  STUDIO_APPLICATION_FILTERS,
  getStudioApplicationFilterCount,
  isCanceledApplication,
  isNoShowApplication,
  matchesStudioApplicationFilter,
  type StudioApplicationFilterKey
} from "@/features/studio/lib/application-filters"
import {
  getStudioRegistrationStatusLabel,
  getStudioRegistrationStatusTone,
  getStudioStatusLabel,
  getStudioStatusTone
} from "@/features/studio/lib/application-status-labels"
import { StudioStatusBadge } from "@/features/studio/ui/studio-status-badge"
import { getSubjectLabel } from "@/shared/constants/education-taxonomy"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"
import { SEOUL_TIME_ZONE } from "@/shared/lib/seoul-datetime"

import styles from "./studio-application-table.module.css"

const PIPELINE_STAGES: Array<{
  key: StudioApplicationFilterKey
  label: string
  emphasis?: boolean
}> = [
  { key: "new", label: "신규 신청" },
  { key: "reviewing", label: "상담/확인 중" },
  { key: "confirmed", label: "일정 확정" },
  { key: "completed", label: "체험 완료" },
  { key: "enrolled", label: "등록 완료", emphasis: true }
]

const DROP_FILTERS: Array<{ key: StudioApplicationFilterKey; label: string }> = [
  { key: "canceled", label: "취소" },
  { key: "no_show", label: "노쇼" },
  { key: "not_enrolled", label: "미등록" }
]

const formatScheduleAt = (value: string | null) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: SEOUL_TIME_ZONE
  }).format(date)
}

const formatApplicationDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    timeZone: SEOUL_TIME_ZONE
  }).format(date)
}

const resolveScheduleDisplay = (application: StudioApplicationSummary) => {
  const confirmedAt = formatScheduleAt(application.confirmedSlotAt)
  const requestedAt = formatScheduleAt(application.requestedSlotAt)
  const selectedLabel = application.selectedScheduleLabel?.trim() || null

  if (confirmedAt) {
    return { label: "확정", primary: confirmedAt }
  }

  if (requestedAt) {
    return { label: "희망", primary: requestedAt }
  }

  return { label: "희망", primary: selectedLabel ?? "일정 협의 필요" }
}

// 등록 상태 배지는 결론이 있거나(등록/보류/미등록) 체험이 끝나 기록이 필요할 때만 덧붙인다.
const shouldShowRegistrationBadge = (application: StudioApplicationSummary) =>
  application.registrationStatus === "enrolled" ||
  application.registrationStatus === "pending" ||
  application.registrationStatus === "not_enrolled" ||
  application.status === "completed"

const isTodoApplication = (application: StudioApplicationSummary) =>
  application.status === "new" ||
  application.status === "reviewing" ||
  (application.status === "confirmed" && !application.assignedTeacherId) ||
  (application.status === "completed" && application.registrationStatus === "undecided")

const isGoneApplication = (application: StudioApplicationSummary) =>
  isCanceledApplication(application) ||
  isNoShowApplication(application) ||
  application.registrationStatus === "not_enrolled"

type StudioApplicationTableProps = {
  items: StudioApplicationSummary[]
  periodLabel: string
}

export const StudioApplicationTable = ({ items, periodLabel }: StudioApplicationTableProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialStatusFilter = useMemo<StudioApplicationFilterKey>(() => {
    const candidate = searchParams?.get("status")
    return STUDIO_APPLICATION_FILTERS.some((filter) => filter.key === candidate)
      ? (candidate as StudioApplicationFilterKey)
      : "all"
  }, [searchParams])
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StudioApplicationFilterKey>(initialStatusFilter)
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null)

  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        STUDIO_APPLICATION_FILTERS.map((filter) => [
          filter.key,
          getStudioApplicationFilterCount(items, filter.key)
        ])
      ) as Record<StudioApplicationFilterKey, number>,
    [items]
  )

  const filteredItems = useMemo(() => {
    const queryTokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

    return items.filter((item) => {
      if (!matchesStudioApplicationFilter(item, statusFilter)) {
        return false
      }

      if (queryTokens.length === 0) {
        return true
      }

      const haystack = [
        item.childName,
        item.childGrade,
        item.parentName ?? "",
        item.parentPhone ?? "",
        item.classTitle ?? "",
        getSubjectLabel(item.classSubject) ?? "",
        item.classRegion ?? "",
        item.assignedTeacherName ?? ""
      ]
        .join(" ")
        .toLowerCase()

      return queryTokens.every((token) => haystack.includes(token))
    })
  }, [items, query, statusFilter])

  const newUnassignedCount = items.filter(
    (item) => item.status === "new" && !item.assignedTeacherId
  ).length
  const completedPendingCount = items.filter(
    (item) => item.status === "completed" && item.registrationStatus === "undecided"
  ).length
  const enrolledCount = filterCounts.enrolled
  const reachedTrialCount = filterCounts.completed
  const dropOffCount = filterCounts.canceled + filterCounts.no_show + filterCounts.not_enrolled
  const conversionRate = items.length > 0 ? (enrolledCount / items.length) * 100 : 0

  const getStageDescription = (key: StudioApplicationFilterKey) => {
    if (key === "new") {
      return newUnassignedCount > 0 ? `${newUnassignedCount}건 선생님 배정 필요` : "확인이 필요한 신청"
    }
    if (key === "reviewing") {
      return "상담 및 일정 조율 중"
    }
    if (key === "confirmed") {
      return "체험 일정 확정 완료"
    }
    if (key === "completed") {
      return completedPendingCount > 0 ? `${completedPendingCount}건 등록 결과 입력 대기` : "체험 진행 완료"
    }
    return "선택 기간 등록 전환"
  }

  const toggleFilter = (key: StudioApplicationFilterKey) => {
    setStatusFilter((current) => (current === key ? "all" : key))
  }

  const openApplication = (applicationId: string) => {
    if (pendingApplicationId) {
      return
    }
    setPendingApplicationId(applicationId)
    router.push(`/studio/applications/${applicationId}`)
  }

  const handleRowKeyDown = (event: KeyboardEvent, applicationId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      openApplication(applicationId)
    }
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.pipeline} aria-label="전환 파이프라인">
        <div className={styles.pipelineTop}>
          <div className={styles.pipelineStages}>
            {PIPELINE_STAGES.map((stage, index) => (
              <div key={stage.key} className={styles.stageGroup}>
                <button
                  type="button"
                  className={`${styles.stage} ${stage.emphasis ? styles.stageWin : ""} ${
                    statusFilter === stage.key ? styles.stageActive : ""
                  }`}
                  aria-pressed={statusFilter === stage.key}
                  onClick={() => toggleFilter(stage.key)}
                >
                  <span className={styles.stageLabel}>{stage.label}</span>
                  <strong className={styles.stageValue}>{filterCounts[stage.key]}</strong>
                  <span className={styles.stageDescription}>{getStageDescription(stage.key)}</span>
                </button>
                {index < PIPELINE_STAGES.length - 1 ? (
                  <span className={styles.stageArrow} aria-hidden="true">›</span>
                ) : null}
              </div>
            ))}
          </div>

          <div className={styles.dropGroup} aria-label="이탈 상태">
            {DROP_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`${styles.drop} ${statusFilter === filter.key ? styles.dropActive : ""}`}
                aria-pressed={statusFilter === filter.key}
                onClick={() => toggleFilter(filter.key)}
              >
                <span>{filter.label}</span>
                <strong>{filterCounts[filter.key]}</strong>
              </button>
            ))}
          </div>
        </div>

        <footer className={styles.pipelineFooter}>
          <span className={styles.rate}>
            등록 전환율 <strong>{conversionRate.toFixed(1)}%</strong>
          </span>
          <span className={styles.rateBar} aria-hidden="true">
            <i style={{ width: `${Math.min(100, conversionRate)}%` }} />
          </span>
          <span>{items.length}건 중 {enrolledCount}건 등록</span>
          <span className={styles.footerSeparator}>·</span>
          <span>체험까지 도달 <strong>{reachedTrialCount}건</strong> · 이탈 <strong>{dropOffCount}건</strong></span>
          <button type="button" className={styles.resetButton} onClick={() => setStatusFilter("all")}>
            전체 보기
          </button>
        </footer>
      </section>

      <section className={styles.list} aria-label="신청 목록">
        <header className={styles.listHeader}>
          <div className={styles.listHeading}>
            <strong>신청 목록</strong>
            <span>{filteredItems.length}건 · {periodLabel} · 신청일 최신순</span>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={styles.search}
            placeholder="학생 · 보호자 · 연락처 검색"
            aria-label="신청 검색"
          />
        </header>

        {filteredItems.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>조건에 맞는 신청이 없어요.</strong>
            <span>검색어나 파이프라인 필터를 바꿔 다시 확인해 주세요.</span>
          </div>
        ) : null}

        {filteredItems.length > 0 ? (
          <div className={styles.desktopTable}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>상태</th>
                    <th>학생</th>
                    <th>수업</th>
                    <th>체험 일정</th>
                    <th>담당</th>
                    <th>보호자</th>
                    <th>신청일</th>
                    <th aria-label="상세 이동" />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const schedule = resolveScheduleDisplay(item)
                    const todo = isTodoApplication(item)
                    const gone = isGoneApplication(item)
                    const pending = pendingApplicationId === item.id

                    return (
                      <tr
                        key={item.id}
                        className={`${styles.row} ${todo ? styles.todoRow : ""} ${gone ? styles.goneRow : ""} ${
                          pending ? styles.pendingRow : ""
                        }`}
                        role="link"
                        tabIndex={0}
                        aria-label={`${item.childName} 신청 상세 보기`}
                        onClick={() => openApplication(item.id)}
                        onKeyDown={(event) => handleRowKeyDown(event, item.id)}
                      >
                        <td>
                          <div className={styles.badgeStack}>
                            <StudioStatusBadge tone={getStudioStatusTone(item)}>
                              {getStudioStatusLabel(item)}
                            </StudioStatusBadge>
                            {shouldShowRegistrationBadge(item) ? (
                              <StudioStatusBadge tone={getStudioRegistrationStatusTone(item.registrationStatus)}>
                                {getStudioRegistrationStatusLabel(item.registrationStatus)}
                              </StudioStatusBadge>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <strong className={styles.studentName}>{item.childName}</strong>
                          <span className={styles.grade}>{item.childGrade}</span>
                        </td>
                        <td>
                          <strong className={styles.className}>{item.classTitle ?? "수업 정보 없음"}</strong>
                          <span className={styles.subText}>
                            {[getSubjectLabel(item.classSubject), item.classRegion].filter(Boolean).join(" · ") || "-"}
                          </span>
                        </td>
                        <td>
                          {!item.confirmedSlotAt ? <span className={styles.scheduleTag}>{schedule.label}</span> : null}
                          <strong className={`${styles.scheduleTime} ${!item.confirmedSlotAt ? styles.scheduleWanted : ""}`}>
                            {schedule.primary}
                          </strong>
                        </td>
                        <td>
                          <span className={!item.assignedTeacherName ? styles.unassigned : undefined}>
                            {item.assignedTeacherName ?? "미배정"}
                          </span>
                        </td>
                        <td>
                          <span>{item.parentName ?? "-"}</span>
                          <span className={styles.subText}>{item.parentPhone ?? "연락처 미기록"}</span>
                        </td>
                        <td className={styles.numeric}>{formatApplicationDate(item.createdAt) ?? "-"}</td>
                        <td className={styles.chevron} aria-hidden="true">›</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {filteredItems.length > 0 ? (
          <div className={styles.mobileCards}>
            {filteredItems.map((item) => {
              const schedule = resolveScheduleDisplay(item)
              const todo = isTodoApplication(item)

              return (
                <article
                  key={item.id}
                  className={`${styles.mobileCard} ${todo ? styles.mobileCardTodo : ""}`}
                  role="link"
                  tabIndex={0}
                  onClick={() => openApplication(item.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, item.id)}
                >
                  <div className={styles.mobileCardTop}>
                    <div>
                      <strong className={styles.studentName}>{item.childName}</strong>
                      <span className={styles.grade}>{item.childGrade}</span>
                    </div>
                    <div className={styles.badgeStack}>
                      <StudioStatusBadge tone={getStudioStatusTone(item)}>
                        {getStudioStatusLabel(item)}
                      </StudioStatusBadge>
                      {shouldShowRegistrationBadge(item) ? (
                        <StudioStatusBadge tone={getStudioRegistrationStatusTone(item.registrationStatus)}>
                          {getStudioRegistrationStatusLabel(item.registrationStatus)}
                        </StudioStatusBadge>
                      ) : null}
                    </div>
                  </div>
                  <strong className={styles.className}>{item.classTitle ?? "수업 정보 없음"}</strong>
                  <div className={styles.mobileMeta}>
                    <span>{schedule.label} 일정</span>
                    <strong>{schedule.primary}</strong>
                    <span>담당</span>
                    <strong className={!item.assignedTeacherName ? styles.unassigned : undefined}>
                      {item.assignedTeacherName ?? "미배정"}
                    </strong>
                    <span>보호자</span>
                    <strong>{item.parentName ?? "-"} · {item.parentPhone ?? "연락처 미기록"}</strong>
                  </div>
                  <span className={styles.mobileChevron} aria-hidden="true">상세 보기 ›</span>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    </div>
  )
}
