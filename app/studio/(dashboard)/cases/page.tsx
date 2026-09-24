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
  getStudioRegistrationStatusLabel,
  type StudioStatusTone
} from "@/features/studio/lib/application-status-labels"
import {
  CASE_STAGE_LABELS,
  getCaseClosedAt,
  getCaseStageTone,
  isCaseClosedStage,
  type StudioCaseListItem
} from "@/features/studio/lib/case-view-model"
import {
  formatCaseRecordDate,
  getCaseContactPresentation,
  getCaseLatestRecord,
  getCaseListActionLabel,
  getCaseTrialScheduleLabel
} from "@/features/studio/lib/case-list-presentation"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioCases } from "@/features/studio/queries/get-studio-cases"
import { StudioQueryRetry } from "@/features/studio/ui/studio-query-retry"
import { StudioDetailLink } from "@/features/studio/ui/studio-detail-link"
import { getChildGradeLabel, getSubjectLabel } from "@/shared/constants/education-taxonomy"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"

import styles from "./page.module.css"

const CASE_BASE_PATH = "/studio/cases"

type StudioCasesPageProps = {
  searchParams?: Promise<{ view?: string; filter?: string; q?: string; page?: string }>
}

const VIEW_TABS: Array<{ key: CaseViewKey; label: string }> = [
  { key: "active", label: "진행 중" },
  { key: "closed", label: "완료·종료" }
]

const CONTACT_TONE_CLASS = {
  default: "",
  warning: styles.contactWarning,
  danger: styles.contactDanger
}

const STAGE_TONE_CLASS: Record<StudioStatusTone, string> = {
  amber: styles.stageBadgeAmber,
  blue: styles.stageBadgeBlue,
  green: styles.stageBadgeGreen,
  gray: styles.stageBadgeGray,
  red: styles.stageBadgeRed
}

const buildHref = (params: { view: CaseViewKey; filter?: string; q?: string; page?: number }) => {
  const search = new URLSearchParams()
  if (params.view !== "active") search.set("view", params.view)
  if (params.filter && params.filter !== "all") search.set("filter", params.filter)
  if (params.q) search.set("q", params.q)
  if (params.page && params.page > 1) search.set("page", String(params.page))
  const queryString = search.toString()
  return queryString ? `${CASE_BASE_PATH}?${queryString}` : CASE_BASE_PATH
}

const resolveClassText = (item: StudioCaseListItem) =>
  item.klass.title?.trim() || (item.klass.subject ? getSubjectLabel(item.klass.subject) : null) || "수업 정보 준비 중"

function Chevron({ previous = false }: { previous?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={previous ? "m14 6-6 6 6 6" : "m9 6 6 6-6 6"} /></svg>
}

function CalendarIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h3" /></svg>
}

function ActionIcon({ actionKey }: { actionKey: StudioCaseListItem["nextAction"]["key"] }) {
  const path = actionKey === "UNASSIGNED"
    ? <><circle cx="10" cy="7" r="3" /><path d="M3 21v-2a7 7 0 0 1 14 0v2M20 8v6m-3-3h6" /></>
    : ["OVERDUE_CONTACT", "TODAY_CONTACT", "UPCOMING_CONTACT", "NO_NEXT_CONTACT"].includes(actionKey)
      ? <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5Z" />
      : <><path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h6" /></>
  return <svg className={styles.actionIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
}

function CasePagination({ page, totalPages, previousHref, nextHref, compact = false }: {
  page: number; totalPages: number; previousHref: string | null; nextHref: string | null; compact?: boolean
}) {
  if (totalPages <= 1) return null
  return (
    <nav className={`${styles.pagination} ${compact ? styles.paginationCompact : ""}`} aria-label={compact ? "상단 페이지 이동" : "페이지 이동"}>
      {previousHref ? <Link className={styles.pageLink} href={previousHref} aria-label="이전 페이지"><Chevron previous />{compact ? null : "이전"}</Link> : <span className={styles.pageLinkDisabled} aria-disabled="true"><Chevron previous />{compact ? null : "이전"}</span>}
      <span className={styles.pageStatus}><strong>{page}</strong> / {totalPages}</span>
      {nextHref ? <Link className={styles.pageLink} href={nextHref} aria-label="다음 페이지">{compact ? null : "다음"}<Chevron /></Link> : <span className={styles.pageLinkDisabled} aria-disabled="true">{compact ? null : "다음"}<Chevron /></span>}
    </nav>
  )
}

export default async function StudioCasesPage({ searchParams }: StudioCasesPageProps) {
  const studioPath = await getStudioNavigationPathResolver()
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const view = resolveCaseView(resolvedSearchParams?.view)
  const filter = resolveCaseFilter(view, resolvedSearchParams?.filter)
  const searchQuery = sanitizeCaseSearchQuery(resolvedSearchParams?.q)
  const page = resolveCasePage(resolvedSearchParams?.page)
  const { data, error } = await getStudioCases(teacher.organizationId, { view, filter, query: searchQuery, page })
  const filterOptions = getCaseFilterOptions(view)
  const now = new Date()
  const rangeStart = data.items.length > 0 ? (data.page - 1) * CASE_PAGE_SIZE + 1 : 0
  const rangeEnd = data.items.length > 0 ? Math.min(data.page * CASE_PAGE_SIZE, data.totalCount) : 0
  const paginationProps = {
    page: data.page,
    totalPages: data.totalPages,
    previousHref: data.page > 1 ? studioPath(buildHref({ view, filter, q: searchQuery, page: data.page - 1 })) : null,
    nextHref: data.page < data.totalPages ? studioPath(buildHref({ view, filter, q: searchQuery, page: data.page + 1 })) : null
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>상담·등록</h1>
            <p className={styles.subtitle}>신청부터 등록까지, 모든 상담 진행 상황을 한눈에 관리하세요.</p>
          </div>
          <Link href={studioPath("/studio/cases/import")} className={styles.headerAction}><CalendarIcon />기존 예약 가져오기</Link>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Case 보기">
        {VIEW_TABS.map((tab) => (
          <Link key={tab.key} href={studioPath(buildHref({ view: tab.key, q: searchQuery }))} className={`${styles.tab} ${view === tab.key ? styles.tabActive : ""}`} aria-current={view === tab.key ? "page" : undefined}>{tab.label}</Link>
        ))}
      </nav>

      <section className={styles.toolbar} aria-label="목록 검색과 단계 필터">
        <div className={styles.filters} role="group" aria-label="상태 필터">
          {filterOptions.map((option) => (
            <Link key={option.key} href={studioPath(buildHref({ view, filter: option.key, q: searchQuery }))} className={`${styles.filterChip} ${filter === option.key ? styles.filterChipActive : ""}`} title={option.description} aria-current={filter === option.key ? "true" : undefined}>{option.label}</Link>
          ))}
        </div>
        <form className={styles.searchForm} action={studioPath(CASE_BASE_PATH)} method="get">
          {view !== "active" ? <input type="hidden" name="view" value={view} /> : null}
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <label className={styles.srOnly} htmlFor="case-search">학생·보호자·연락처·수업명 검색</label>
          <div className={styles.searchField}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <input id="case-search" className={styles.searchInput} type="search" name="q" defaultValue={searchQuery} placeholder="학생·보호자·연락처·수업명 검색" maxLength={60} />
          </div>
          <button className={styles.searchButton} type="submit">검색</button>
          {searchQuery ? <Link className={styles.searchReset} href={studioPath(buildHref({ view, filter }))}>초기화</Link> : null}
        </form>
      </section>

      {error ? (
        <section className={styles.errorCard} role="alert"><p className={styles.errorText}>{error}</p><StudioQueryRetry /></section>
      ) : (
        <section className={styles.workspace} aria-label="Case 목록">
          <div className={styles.resultHeader}>
            <p className={styles.resultMeta}>검색 결과 <strong>{data.totalCount}건</strong>{view === "active" ? <><span aria-hidden="true">·</span><span>신청 최신순</span></> : null}</p>
            <CasePagination {...paginationProps} compact />
          </div>
          <div className={styles.tableSurface}>
            <div className={`${styles.listHead} ${view === "closed" ? styles.listHeadClosed : ""}`} aria-hidden="true">
              <span>학생</span><span>{view === "closed" ? "결과" : "현재 단계"}</span><span>체험수업 / 일정</span>
              {view === "active" ? <span>다음 행동</span> : null}
              <span>담당자</span><span>{view === "closed" ? "종료일" : "최근 기록"}</span><span />
            </div>
            {data.items.length === 0 ? (
              <div className={styles.empty}>
                <p>{data.totalCount > 0 ? "이 페이지에 표시할 신청이 없어요." : "조건에 맞는 신청이 없어요."}</p>
                {data.totalCount > 0 ? <Link href={studioPath(buildHref({ view, filter, q: searchQuery }))}>첫 페이지로 이동</Link> : <span>검색어나 단계 필터를 변경해 보세요.</span>}
              </div>
            ) : (
              <ul className={styles.list}>
                {data.items.map((item) => {
                  const closed = isCaseClosedStage(item.stage)
                  const schedule = getCaseTrialScheduleLabel(item)
                  const closedAt = closed ? getCaseClosedAt(item) : null
                  const record = getCaseLatestRecord(item)
                  const actionLabel = getCaseListActionLabel(item)
                  const contact = getCaseContactPresentation(item, now)
                  const registrationLabel = !closed && item.status === "completed"
                    ? getStudioRegistrationStatusLabel(item.registrationStatus) : null
                  return (
                    <li key={item.id} className={styles.row}>
                      <StudioDetailLink className={`${styles.rowLink} ${closed ? styles.rowLinkClosed : ""}`} internalPath={`/studio/applications/${item.id}`}>
                        <span className={styles.cellStudent}>
                          <span className={styles.studentHeading}><strong className={styles.studentName}>{item.student.name}</strong><span className={styles.studentMeta}>{getChildGradeLabel(item.student.grade) ?? "학년 미기록"}</span></span>
                          {item.guardian.phone ? <span className={styles.studentPhone}><span className={styles.srOnly}>보호자 연락처 </span>{item.guardian.phone}</span> : null}
                        </span>
                        <span className={styles.cellStage}>
                          <span className={`${styles.stageBadge} ${STAGE_TONE_CLASS[getCaseStageTone(item.stage)]}`}>{CASE_STAGE_LABELS[item.stage]}</span>
                          {registrationLabel ? <span className={styles.registrationLabel}>{registrationLabel}</span> : null}
                        </span>
                        <span className={styles.cellClass}>
                          <span className={styles.classTitle} title={resolveClassText(item)}>{resolveClassText(item)}</span>
                          {schedule ? <span className={styles.classMeta}>{schedule}</span> : null}
                        </span>
                        {!closed ? (
                          <span className={styles.cellNextAction}>
                            <span className={styles.actionHeading}>{actionLabel ? <ActionIcon actionKey={item.nextAction.key} /> : null}<span>{actionLabel || "—"}</span></span>
                            {contact ? <span className={`${styles.nextContactMeta} ${CONTACT_TONE_CLASS[contact.tone]}`}>{contact.label}</span> : null}
                          </span>
                        ) : null}
                        <span className={styles.cellAssignee}><span className={styles.assigneeBadge}><span className={styles.srOnly}>담당자 </span>{item.assignee.teacherName ?? "미배정"}</span></span>
                        <span className={styles.cellRecord}>
                          {closed ? (closedAt ? <time dateTime={closedAt}>{formatCaseRecordDate(closedAt) ?? "—"}</time> : "—") : record ? <><time dateTime={record.at}>{record.dateLabel}</time><span>{record.label}</span></> : "—"}
                        </span>
                        <span className={styles.chevron}><Chevron /><span className={styles.srOnly}>신청 상세 보기</span></span>
                      </StudioDetailLink>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className={styles.listFooter}>
            <span className={styles.rangeMeta}>{data.totalCount > 0 ? `${data.totalCount}건 중 ${rangeStart}–${rangeEnd}건` : "검색 결과 0건"}</span>
            <CasePagination {...paginationProps} />
          </div>
        </section>
      )}
    </div>
  )
}
