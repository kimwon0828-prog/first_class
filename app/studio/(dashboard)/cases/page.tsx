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
  CASES_ACTION_SECTIONS,
  formatCasesDate,
  getCasesNextActions,
  getCasesResultSummary,
  getCasesRowPresentation,
  getCasesScheduleLabel,
  type CasesListItem
} from "@/features/studio/lib/cases-workflow"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { countStudioCases, getStudioCases } from "@/features/studio/queries/get-studio-cases"
import { StudioCaseRowLink } from "@/features/studio/ui/studio-case-row-link"
import { StudioQueryRetry } from "@/features/studio/ui/studio-query-retry"
import { v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { v2ChipClassName, v2ChipPartClassName } from "@/features/studio/ui/v2/v2-chip"
import { V2ChevronLeftIcon, V2ChevronRightIcon, V2DownloadIcon, V2SearchIcon } from "@/features/studio/ui/v2/v2-icons"
import { V2StatusBadge } from "@/features/studio/ui/v2/v2-status-badge"
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

function CasePagination({ page, totalPages, previousHref, nextHref, compact = false }: {
  page: number; totalPages: number; previousHref: string | null; nextHref: string | null; compact?: boolean
}) {
  if (totalPages <= 1) return null
  const button = v2ButtonClassName({ variant: "ghost", size: "sm" })
  return (
    <nav className={styles.pagination} aria-label={compact ? "상단 페이지 이동" : "페이지 이동"}>
      {previousHref ? (
        <Link className={button} href={previousHref} aria-label="이전 페이지"><V2ChevronLeftIcon size={16} />{compact ? null : "이전"}</Link>
      ) : (
        <span className={button} aria-disabled="true"><V2ChevronLeftIcon size={16} />{compact ? null : "이전"}</span>
      )}
      <span className={styles.pageStatus}><strong>{page}</strong> / {totalPages}</span>
      {nextHref ? (
        <Link className={button} href={nextHref} aria-label="다음 페이지">{compact ? null : "다음"}<V2ChevronRightIcon size={16} /></Link>
      ) : (
        <span className={button} aria-disabled="true">{compact ? null : "다음"}<V2ChevronRightIcon size={16} /></span>
      )}
    </nav>
  )
}

export default async function StudioCasesPage({ searchParams }: StudioCasesPageProps) {
  const studioPath = await getStudioNavigationPathResolver()
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const view = resolveCaseView(resolvedSearchParams?.view, resolvedSearchParams?.filter)
  const filter = resolveCaseFilter(view, resolvedSearchParams?.filter)
  const searchQuery = sanitizeCaseSearchQuery(resolvedSearchParams?.q)
  const page = resolveCasePage(resolvedSearchParams?.page)
  const { data, error } = await getStudioCases(teacher.organizationId, { view, filter, query: searchQuery, page })
  // '등록 여부 미정' 건수: 목록과 같은 조건(검색어 포함)으로 센다. 그 필터를 보고 있으면 목록 건수를 그대로 쓴다.
  const undecidedCount = view !== "closed" ? null
    : filter === "undecided" ? (error ? null : data.totalCount)
    : await countStudioCases(teacher.organizationId, { view, filter: "undecided", query: searchQuery })
  const filterOptions = getCaseFilterOptions(view)
  const rangeStart = data.items.length > 0 ? (data.page - 1) * CASE_PAGE_SIZE + 1 : 0
  const rangeEnd = data.items.length > 0 ? Math.min(data.page * CASE_PAGE_SIZE, data.totalCount) : 0
  const paginationProps = {
    page: data.page,
    totalPages: data.totalPages,
    previousHref: data.page > 1 ? studioPath(buildHref({ view, filter, q: searchQuery, page: data.page - 1 })) : null,
    nextHref: data.page < data.totalPages ? studioPath(buildHref({ view, filter, q: searchQuery, page: data.page + 1 })) : null
  }
  const sortLabel = view === "active" ? "신규 신청 우선 · 체험 예정순"
    : filter === "pending" || filter === "undecided" ? "연락일 도래 우선 · 체험 완료 오래된 순"
    : "결과 처리 최신순 · 처리일 미기록은 완료일/접수일 기준"

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBox}>
          <h1 className={styles.title}>신청</h1>
          <p className={styles.description}>행을 누르면 학생 한 명의 진행 화면이 열려요.</p>
        </div>
        <form className={styles.searchForm} action={studioPath(CASE_BASE_PATH)} method="get" role="search">
          {view !== "active" ? <input type="hidden" name="view" value={view} /> : null}
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <label className={styles.searchField}>
            <V2SearchIcon size={18} />
            <span className={styles.srOnly}>학생·보호자·연락처·수업명 검색</span>
            <input className={styles.searchInput} type="search" name="q" defaultValue={searchQuery} placeholder="학생·보호자·연락처·수업명" maxLength={60} />
          </label>
          <button className={styles.srOnly} type="submit">검색</button>
          {searchQuery ? <Link className={v2ButtonClassName({ variant: "ghost", size: "sm" })} href={studioPath(buildHref({ view, filter }))}>초기화</Link> : null}
        </form>
        <Link href={studioPath("/studio/cases/import")} className={v2ButtonClassName({ variant: "outline", size: "sm" })}>
          <V2DownloadIcon size={16} />기존 예약 가져오기
        </Link>
      </header>

      <nav className={styles.tabs} aria-label="신청 보기">
        {VIEW_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={studioPath(buildHref({ view: tab.key, q: searchQuery }))}
            className={view === tab.key ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            aria-current={view === tab.key ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className={styles.filters} role="group" aria-label="상태 필터">
        {filterOptions.map((option) => (
          <Link
            key={option.key}
            href={studioPath(buildHref({ view, filter: option.key, q: searchQuery }))}
            className={v2ChipClassName({ selected: filter === option.key })}
            title={option.description}
            aria-current={filter === option.key ? "true" : undefined}
          >
            <span className={v2ChipPartClassName.label}>{option.label}</span>
            {option.key === "undecided" && undecidedCount !== null ? (
              <span className={v2ChipPartClassName.count}>{undecidedCount}<span className={styles.srOnly}>건</span></span>
            ) : null}
          </Link>
        ))}
      </div>

      {error ? (
        <section className={styles.errorCard} role="alert"><p>{error}</p><StudioQueryRetry /></section>
      ) : (
        <section className={styles.workspace} aria-label="신청 목록">
          <div className={styles.resultHeader}>
            <p className={styles.resultMeta}>검색 결과 <strong>{data.totalCount}건</strong><span aria-hidden="true">·</span><span>{sortLabel}</span></p>
            <CasePagination {...paginationProps} compact />
          </div>
          <div className={styles.table} role="region" aria-label="신청 목록 표" tabIndex={0}>
            <div className={styles.thead} aria-hidden="true">
              <span>학생</span><span>진행 상태</span><span>체험수업 · 일정</span><span>등록 상태</span><span>담당</span><span className={styles.alignEnd}>지금 할 일</span>
            </div>
            {data.items.length === 0 ? (
              <div className={styles.empty}>
                <p>{data.totalCount > 0 ? "이 페이지에 표시할 신청이 없어요." : "조건에 맞는 신청이 없어요."}</p>
                {data.totalCount > 0 ? <Link href={studioPath(buildHref({ view, filter, q: searchQuery }))}>첫 페이지로 이동</Link> : <span>검색어나 상태 필터를 바꿔 보세요.</span>}
              </div>
            ) : (
              <ul className={styles.list}>
                {data.items.map((item) => {
                  const schedule = getCasesScheduleLabel(item)
                  const record = view === "closed" ? item.resultRecord : item.latestRecord
                  const summary = view === "closed" ? getCasesResultSummary(item) : null
                  const actions = getCasesNextActions(item)
                  const row = getCasesRowPresentation(item)
                  const teacherName = item.assignee.teacherName
                  return (
                    <li key={item.id} className={styles.row} data-case-id={item.id}>
                      <StudioCaseRowLink className={styles.rowLink} internalPath={`/studio/applications/${item.id}`} section={CASES_ACTION_SECTIONS[actions[0]]} aria-label={`${item.student.name} 신청 상세`}>
                        <span className={styles.cellStudent}>
                          <span className={styles.studentLine}>
                            <span className={styles.studentName}>{item.student.name}</span>
                            <span className={styles.studentGrade}>{getChildGradeLabel(item.student.grade) ?? "학년 미기록"}</span>
                          </span>
                          {item.guardian.phone ? <span className={styles.sub}><span className={styles.srOnly}>보호자 연락처 </span>보호자 {item.guardian.phone}</span> : null}
                        </span>
                        <span className={styles.cellStack}>
                          <V2StatusBadge tone={row.progressTone}>{item.workflow.progress}</V2StatusBadge>
                          <span className={styles.sub}>
                            {record?.at ? <><time dateTime={record.at}>{formatCasesDate(record.at)}</time> · {record.label}</> : view === "closed" ? "처리일 미기록" : null}
                          </span>
                        </span>
                        <span className={styles.cellClass}>
                          <span className={styles.classTitle} title={resolveClassText(item)}>{resolveClassText(item)}</span>
                          {schedule ? <span className={styles.sub}>{schedule}</span> : null}
                        </span>
                        <span className={styles.cellStack}>
                          <V2StatusBadge tone={row.registrationTone}>{item.workflow.registration}</V2StatusBadge>
                          {summary ? (
                            <span className={styles.sub}>
                              <span className={styles.srOnly}>결과 요약: </span>
                              {summary.reasons.length
                                ? `${summary.reasons.map((reason) => reason.label).join(" · ")}${summary.remaining > 0 ? ` 외 ${summary.remaining}` : ""}`
                                : summary.label}
                            </span>
                          ) : null}
                        </span>
                        <span className={styles.cellTeacher}>
                          <span className={teacherName ? styles.teacherAvatar : `${styles.teacherAvatar} ${styles.teacherAvatarEmpty}`} aria-hidden="true">
                            {teacherName ? teacherName.slice(0, 1) : "?"}
                          </span>
                          <span className={teacherName ? styles.teacherName : `${styles.teacherName} ${styles.teacherEmpty}`}>
                            <span className={styles.srOnly}>담당자 </span>{teacherName ?? "미배정"}
                          </span>
                        </span>
                        <span className={styles.cellAction}>
                          {row.now.muted ? (
                            <span className={styles.actionMuted}>{row.now.label}</span>
                          ) : (
                            <span className={v2ButtonClassName({ variant: "tonal", size: "sm" })}>{row.now.label}</span>
                          )}
                        </span>
                      </StudioCaseRowLink>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className={styles.listFooter}>
            <span className={styles.resultMeta}>{data.totalCount > 0 ? `${data.totalCount}건 중 ${rangeStart}–${rangeEnd}건` : "검색 결과 0건"}</span>
            <CasePagination {...paginationProps} />
          </div>
        </section>
      )}
    </div>
  )
}
