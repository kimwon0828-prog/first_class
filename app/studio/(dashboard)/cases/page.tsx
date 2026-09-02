import Link from "next/link"

import {
  CASE_PAGE_SIZE,
  getCaseFilterOptions,
  resolveCaseFilter,
  resolveCasePage,
  resolveCaseView,
  sanitizeCaseSearchQuery,
  type CaseViewKey
} from "@/features/studio/lib/case-filters"
import {
  CASE_STAGE_LABELS,
  getCaseClosedAt,
  isCaseClosedStage,
  type CaseNextActionTone,
  type StudioCaseListItem
} from "@/features/studio/lib/case-view-model"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioCases } from "@/features/studio/queries/get-studio-cases"
import { getSubjectLabel } from "@/shared/constants/education-taxonomy"
import { SEOUL_TIME_ZONE } from "@/shared/lib/seoul-datetime"

import styles from "./page.module.css"

const CASE_BASE_PATH = "/studio/cases"

type StudioCasesPageProps = {
  searchParams?: Promise<{
    view?: string
    filter?: string
    q?: string
    page?: string
  }>
}

/** 시간 약속이 있는 다음 행동만 색을 쓴다. 나머지는 본문 색 그대로다. */
const NEXT_ACTION_TONE_CLASS: Record<CaseNextActionTone, string> = {
  default: "",
  warning: styles.nextActionWarning,
  danger: styles.nextActionDanger
}

const VIEW_TABS: Array<{ key: CaseViewKey; label: string }> = [
  { key: "active", label: "진행 중" },
  { key: "closed", label: "완료·종료" }
]

const formatDate = (value: string) => {
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

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: SEOUL_TIME_ZONE
  }).format(date)
}

const buildHref = (params: {
  view: CaseViewKey
  filter?: string
  q?: string
  page?: number
}) => {
  const search = new URLSearchParams()
  if (params.view !== "active") {
    search.set("view", params.view)
  }
  if (params.filter && params.filter !== "all") {
    search.set("filter", params.filter)
  }
  if (params.q) {
    search.set("q", params.q)
  }
  if (params.page && params.page > 1) {
    search.set("page", String(params.page))
  }

  const queryString = search.toString()
  return queryString ? `${CASE_BASE_PATH}?${queryString}` : CASE_BASE_PATH
}

/** 체험 일정. 확정이 있으면 확정을, 없으면 희망 일정을 보여준다(캘린더와 같은 규칙). */
const resolveTrialScheduleText = (item: StudioCaseListItem) => {
  if (item.confirmedSlotAt) {
    const formatted = formatDateTime(item.confirmedSlotAt)
    return formatted ? `${formatted} 확정` : null
  }

  const formatted = formatDateTime(item.requestedSlotAt)
  return formatted ? `${formatted} 희망` : null
}

/** 가장 최근에 일어난 일 하나만 고른다. 목록에서 "언제 마지막으로 움직였나"를 알려준다. */
const resolveLastActivityText = (item: StudioCaseListItem) => {
  const candidates: Array<{ at: string | null; label: string }> = [
    { at: getCaseClosedAt(item), label: CASE_STAGE_LABELS[item.stage] },
    { at: item.latestConsultation?.occurredAt ?? null, label: "상담" },
    { at: item.completedAt, label: "체험 완료" },
    { at: item.createdAt, label: "신청" }
  ]

  const resolved = candidates
    .filter((candidate): candidate is { at: string; label: string } => Boolean(candidate.at))
    .map((candidate) => ({ ...candidate, time: new Date(candidate.at).getTime() }))
    .filter((candidate) => !Number.isNaN(candidate.time))
    .sort((left, right) => right.time - left.time)[0]

  if (!resolved) {
    return null
  }

  const formatted = formatDate(resolved.at)
  return formatted ? `${formatted} ${resolved.label}` : null
}

const resolveClassText = (item: StudioCaseListItem) => {
  const subjectLabel = item.klass.subject ? getSubjectLabel(item.klass.subject) : null
  return item.klass.title?.trim() || subjectLabel || "수업 정보 준비 중"
}

// 진행 중 Case 의 단계별 badge tone. 표현만 담당하며 stage 판정/라벨은 case-view-model 이 정한다.
const CASE_STAGE_TONE_CLASS: Record<string, string> = {
  new: styles.stageBadgeAmber,
  reviewing: styles.stageBadgeBlue,
  confirmed: styles.stageBadgeGreen,
  completed: styles.stageBadgeAmber
}

export default async function StudioCasesPage({ searchParams }: StudioCasesPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined

  const view = resolveCaseView(resolvedSearchParams?.view)
  const filter = resolveCaseFilter(view, resolvedSearchParams?.filter)
  const searchQuery = sanitizeCaseSearchQuery(resolvedSearchParams?.q)
  const page = resolveCasePage(resolvedSearchParams?.page)

  const { data, error } = await getStudioCases(teacher.organizationId, {
    view,
    filter,
    query: searchQuery,
    page
  })

  const filterOptions = getCaseFilterOptions(view)
  const rangeStart = data.totalCount > 0 ? (data.page - 1) * CASE_PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(data.page * CASE_PAGE_SIZE, data.totalCount)
  const hasPrevPage = data.page > 1
  const hasNextPage = data.totalPages > 0 && data.page < data.totalPages

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>상담·등록</h1>
        <p className={styles.subtitle}>신청부터 등록 결정까지 한 곳에서 관리하세요.</p>
      </header>

      <nav className={styles.tabs} aria-label="Case 보기">
        {VIEW_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={buildHref({ view: tab.key, q: searchQuery })}
            className={`${styles.tab} ${view === tab.key ? styles.tabActive : ""}`}
            aria-current={view === tab.key ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <section className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="상태 필터">
          {filterOptions.map((option) => (
            <Link
              key={option.key}
              href={buildHref({ view, filter: option.key, q: searchQuery })}
              className={`${styles.filterChip} ${filter === option.key ? styles.filterChipActive : ""}`}
              title={option.description}
              aria-current={filter === option.key ? "true" : undefined}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <form className={styles.searchForm} action={CASE_BASE_PATH} method="get">
          {view !== "active" ? <input type="hidden" name="view" value={view} /> : null}
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <label className={styles.searchLabel} htmlFor="case-search">
            검색
          </label>
          <input
            id="case-search"
            className={styles.searchInput}
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder="학생·보호자·연락처·수업명"
            maxLength={60}
          />
          <button className={styles.searchButton} type="submit">
            검색
          </button>
          {searchQuery ? (
            <Link className={styles.searchReset} href={buildHref({ view, filter })}>
              초기화
            </Link>
          ) : null}
        </form>
      </section>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : (
        <section className={styles.workspace} aria-label="Case 목록">
          <div className={styles.resultMeta}>
            {data.totalCount > 0 ? (
              <span>
                전체 {data.totalCount}건 중 {rangeStart}–{rangeEnd}
              </span>
            ) : (
              <span>전체 0건</span>
            )}
          </div>

          <div
            className={`${styles.listHead} ${view === "closed" ? styles.listHeadClosed : ""}`}
            aria-hidden="true"
          >
            {view === "closed" ? (
              <>
                <span>학생</span>
                <span>결과</span>
                <span>체험수업</span>
                <span>담당자</span>
                <span>종료일</span>
              </>
            ) : (
              <>
                <span>학생</span>
                <span>현재 단계</span>
                <span>체험수업</span>
                <span>다음 행동</span>
                <span>담당자</span>
                <span>최근 활동</span>
              </>
            )}
          </div>

          {data.items.length === 0 ? (
            <p className={styles.empty}>조건에 맞는 상담이 없습니다.</p>
          ) : (
            <ul className={styles.list}>
              {data.items.map((item) => {
                const closed = isCaseClosedStage(item.stage)
                const trialScheduleText = resolveTrialScheduleText(item)
                const closedAt = closed ? getCaseClosedAt(item) : null

                const assigneeCell = (
                  <span className={styles.cellAssignee}>
                    {item.assignee.teacherName ?? (
                      <span className={styles.assigneeEmpty}>미배정</span>
                    )}
                  </span>
                )

                return (
                  <li key={item.id} className={styles.row}>
                    <Link
                      className={`${styles.rowLink} ${closed ? styles.rowLinkClosed : ""}`}
                      href={`/studio/applications/${item.id}`}
                    >
                      <span className={styles.cellStudent}>
                        <strong className={styles.studentName}>{item.student.name}</strong>
                        <span className={styles.studentMeta}>· {item.student.grade}</span>
                      </span>

                      <span className={styles.cellStage}>
                        <span
                          className={`${styles.stageBadge} ${
                            closed
                              ? styles.stageBadgeClosed
                              : CASE_STAGE_TONE_CLASS[item.stage] ?? styles.stageBadgeBlue
                          }`}
                        >
                          {CASE_STAGE_LABELS[item.stage]}
                        </span>
                      </span>

                      <span className={styles.cellClass}>
                        <span className={styles.classTitle}>{resolveClassText(item)}</span>
                        {trialScheduleText ? (
                          <span className={styles.classMeta}>{trialScheduleText}</span>
                        ) : null}
                      </span>

                      {closed ? (
                        <>
                          {assigneeCell}
                          <span className={styles.cellActivity}>
                            {closedAt ? formatDate(closedAt) ?? "—" : "—"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            className={`${styles.cellNextAction} ${
                              NEXT_ACTION_TONE_CLASS[item.nextAction.tone] ?? ""
                            }`}
                          >
                            {item.nextAction.label || "—"}
                            {item.nextContactAt ? (
                              <span className={styles.nextContactMeta}>
                                {formatDateTime(item.nextContactAt)}
                              </span>
                            ) : null}
                          </span>
                          {assigneeCell}
                          <span className={styles.cellActivity}>
                            {resolveLastActivityText(item) ?? "—"}
                          </span>
                        </>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          {data.totalPages > 1 ? (
            <nav className={styles.pagination} aria-label="페이지 이동">
              {hasPrevPage ? (
                <Link
                  className={styles.pageLink}
                  href={buildHref({ view, filter, q: searchQuery, page: data.page - 1 })}
                >
                  이전
                </Link>
              ) : (
                <span className={styles.pageLinkDisabled}>이전</span>
              )}
              <span className={styles.pageStatus}>
                {data.page} / {data.totalPages}
              </span>
              {hasNextPage ? (
                <Link
                  className={styles.pageLink}
                  href={buildHref({ view, filter, q: searchQuery, page: data.page + 1 })}
                >
                  다음
                </Link>
              ) : (
                <span className={styles.pageLinkDisabled}>다음</span>
              )}
            </nav>
          ) : null}
        </section>
      )}
    </div>
  )
}
