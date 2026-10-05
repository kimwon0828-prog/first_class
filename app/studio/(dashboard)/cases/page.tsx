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
import type { StudioStatusTone } from "@/features/studio/lib/application-status-labels"
import { CASES_ACTIONS, formatCasesDate, getCasesResultSummary, getCasesScheduleLabel, type CasesListItem } from "@/features/studio/lib/cases-workflow"
import { ApplicationDetailIcon } from "@/features/studio/ui/application-detail-icon"
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

const resolveClassText = (item: CasesListItem) =>
  item.klass.title?.trim() || (item.klass.subject ? getSubjectLabel(item.klass.subject) : null) || "수업 정보 준비 중"

function Chevron({ previous = false }: { previous?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={previous ? "m14 6-6 6 6 6" : "m9 6 6 6-6 6"} /></svg>
}

function CalendarIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h3" /></svg>
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
            <h1 className={styles.title}>신청 관리</h1>
            <p className={styles.subtitle}>신청부터 등록까지, 모든 진행 상황을 한눈에 관리하세요.</p>
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
            <p className={styles.resultMeta}>검색 결과 <strong>{data.totalCount}건</strong><span aria-hidden="true">·</span><span>{view === "active" ? "확정 대기 우선 · 체험 예정순" : filter === "pending" ? "연락일 도래 우선 · 체험 완료 오래된 순" : "결과 처리 최신순 · 처리일 미기록은 완료일/접수일 기준"}</span></p>
            <CasePagination {...paginationProps} compact />
          </div>
          <div className={styles.tableSurface}>
            <div className={styles.listHead} aria-hidden="true">
              <span>학생</span><span>진행 상태</span><span>체험수업 / 일정</span>
              <span>{view === "closed" ? "결과 요약" : "다음 행동"}</span><span>등록 상태</span>
              <span>담당자</span><span>{view === "closed" ? "결과 처리" : "최근 기록"}</span><span />
            </div>
            {data.items.length === 0 ? (
              <div className={styles.empty}>
                <p>{data.totalCount > 0 ? "이 페이지에 표시할 신청이 없어요." : "조건에 맞는 신청이 없어요."}</p>
                {data.totalCount > 0 ? <Link href={studioPath(buildHref({ view, filter, q: searchQuery }))}>첫 페이지로 이동</Link> : <span>검색어나 단계 필터를 변경해 보세요.</span>}
              </div>
            ) : (
              <ul className={styles.list}>
                {data.items.map((item) => {
                  const schedule = getCasesScheduleLabel(item)
                  const record = view === "closed" ? item.resultRecord : item.latestRecord
                  const summary = view === "closed" ? getCasesResultSummary(item) : null
                  const action = item.workflow.action ? CASES_ACTIONS[item.workflow.action] : null
                  const progressTone: StudioStatusTone = item.workflow.progress === "신청 접수" ? "amber" : ["일정 확정", "체험 예정"].includes(item.workflow.progress) ? "green" : "gray"
                  const registrationTone: StudioStatusTone = ["취소", "노쇼"].includes(item.workflow.registration) ? "gray" : item.registrationStatus === "enrolled" ? "green" : item.registrationStatus === "pending" ? "amber" : item.registrationStatus === "not_enrolled" ? "red" : "gray"
                  return (
                    <li key={item.id} className={styles.row}>
                      <StudioDetailLink className={styles.rowLink} internalPath={`/studio/applications/${item.id}`}>
                        <span className={styles.cellStudent}>
                          <span className={styles.studentHeading}><strong className={styles.studentName}>{item.student.name}</strong><span className={styles.studentMeta}>{getChildGradeLabel(item.student.grade) ?? "학년 미기록"}</span></span>
                          {item.guardian.phone ? <span className={styles.studentPhone}><span className={styles.srOnly}>보호자 연락처 </span>{item.guardian.phone}</span> : null}
                        </span>
                        <span className={styles.cellStage}>
                          <span className={`${styles.stageBadge} ${STAGE_TONE_CLASS[progressTone]}`}>{item.workflow.progress}</span>
                        </span>
                        <span className={styles.cellClass}>
                          <span className={styles.classTitle} title={resolveClassText(item)}>{resolveClassText(item)}</span>
                          {schedule ? <span className={styles.classMeta}>{schedule}</span> : null}
                        </span>
                        <span className={styles.cellNextAction}>
                          {summary ? (
                            <span className={styles.resultSummary}>
                              <span className={styles.srOnly}>결과 요약: </span>
                              {summary.reasons.length ? summary.reasons.map((reason, index) => (
                                <span className={styles.reasonLine} key={reason.id}>
                                  <span className={styles.reasonChip} title={reason.label}>{reason.label}</span>
                                  {index === 1 && summary.remaining > 0 ? <span className={styles.reasonMore} aria-label={`추가 사유 ${summary.remaining}개`}>+{summary.remaining}</span> : null}
                                </span>
                              )) : summary.label}
                              {action ? <span className={styles.remainingAction}><ApplicationDetailIcon name={action.icon} /><span><span className={styles.srOnly}>남은 업무: </span>{action.title}</span></span> : null}
                            </span>
                          ) : <>
                            <span className={styles.actionHeading}>{action ? <ApplicationDetailIcon name={action.icon} /> : null}<span>{action?.title ?? "—"}</span></span>
                            {action ? <span className={styles.actionDescription}>{action.description}</span> : null}
                          </>}
                        </span>
                        <span className={styles.cellRegistration}><span className={`${styles.stageBadge} ${STAGE_TONE_CLASS[registrationTone]}`}>{item.workflow.registration}</span></span>
                        <span className={styles.cellAssignee}><span className={styles.assigneeBadge}><span className={styles.srOnly}>담당자 </span>{item.assignee.teacherName ?? "미배정"}</span></span>
                        <span className={styles.cellRecord}>
                          {record?.at ? <><time dateTime={record.at}>{formatCasesDate(record.at)}</time><span>{record.label}</span></> : view === "closed" ? "처리일 미기록" : "—"}
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
