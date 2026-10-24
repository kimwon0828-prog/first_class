"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import {
  STUDIO_STUDENT_RESULT_LABELS,
  STUDIO_STUDENT_RESULT_TONES,
  type StudioStudentResult
} from "@/features/studio/lib/application-status-labels"
import { useStudioNavigationPathFactory } from "@/features/studio/ui/studio-navigation-provider"
import { V2Chip, v2ChipClassName, v2ChipPartClassName } from "@/features/studio/ui/v2/v2-chip"
import { V2CheckIcon, V2PlusIcon, V2SearchIcon, V2SmallXIcon } from "@/features/studio/ui/v2/v2-icons"
import { V2StatusBadge } from "@/features/studio/ui/v2/v2-status-badge"
import { V2SubjectIcon3D } from "@/features/studio/ui/v2/v2-subject-icon-3d"
import { isStudentInTab, STUDENT_TABS, type StudentListRow, type StudentTab } from "@/features/students/lib/student-grouping"
import { RECONTACT_PER_BATCH } from "@/features/students/lib/recontact-message"
import { LEARNER_GRADES } from "@/shared/constants/education-taxonomy"
import { getSubjectCategoryLabel } from "@/shared/lib/subject-master"

import styles from "./students-board.module.css"

const RESULT_FILTERS: StudioStudentResult[] = ["not_enrolled", "considering", "undecided", "in_progress", "enrolled", "canceled"]

type Conditions = {
  subject: string | null
  gradeFrom: number | null
  gradeTo: number | null
  results: StudioStudentResult[]
}

const EMPTY_CONDITIONS: Conditions = { subject: null, gradeFrom: null, gradeTo: null, results: [] }

const gradeName = (order: number | null) => (order === null ? "" : LEARNER_GRADES[order]?.label ?? "")

/** Studio/Checkbox (Figma 2012:491 · 492). 브라우저 checkbox 를 그대로 쓰고 모양만 덮는다(§5.13과 같은 모양). */
export function StudentCheckbox(props: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <span className={styles.checkbox}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} aria-label={props.label} onChange={props.onChange} />
      <V2CheckIcon size={14} className={styles.checkMark} />
    </span>
  )
}

type StudentsBoardProps = {
  rows: StudentListRow[]
  initialTab: StudentTab
  /** 보내기 패널(§5.27). 고른 학생 · 선택 해제를 받는다. */
  renderPanel?: (selected: StudentListRow[], clearSelection: () => void) => ReactNode
}

/**
 * 학생 · 다시 연락 (Figma 2148:5869). STUDIO_DESIGN_SYSTEM.md §5.27.
 * 탭 · 검색 · 조건은 화면 상태다(학원 학생 전체를 한 번에 받는다). 탭만 주소에 남겨 상세에서 돌아와도 같은 탭이다.
 */
export function StudentsBoard({ rows, initialTab, renderPanel }: StudentsBoardProps) {
  const studioPath = useStudioNavigationPathFactory()
  const [tab, setTab] = useState<StudentTab>(initialTab)
  const [query, setQuery] = useState("")
  const [conditions, setConditions] = useState<Conditions>(EMPTY_CONDITIONS)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!adding) return
    const close = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) setAdding(false)
    }
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setAdding(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", escape)
    }
  }, [adding])

  const changeTab = (next: StudentTab) => {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === "recontact") url.searchParams.delete("tab")
    else url.searchParams.set("tab", next)
    window.history.replaceState(null, "", url)
  }

  const tabCounts = useMemo(
    () => Object.fromEntries(STUDENT_TABS.map(({ value }) => [value, rows.filter((row) => isStudentInTab(row.result, value)).length])) as Record<StudentTab, number>,
    [rows]
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (!isStudentInTab(row.result, tab)) return false
      if (needle && ![row.name, row.parentName ?? ""].some((value) => value.toLowerCase().includes(needle))) return false
      if (conditions.subject && row.subjectCategory !== conditions.subject) return false
      if (conditions.gradeFrom !== null && (row.gradeOrder === null || row.gradeOrder < conditions.gradeFrom)) return false
      if (conditions.gradeTo !== null && (row.gradeOrder === null || row.gradeOrder > conditions.gradeTo)) return false
      if (conditions.results.length > 0 && !conditions.results.includes(row.result)) return false
      return true
    })
  }, [rows, tab, query, conditions])

  const rowById = useMemo(() => new Map(rows.map((row) => [row.applicationId, row])), [rows])
  const selectedRows = selectedIds.map((id) => rowById.get(id)).filter((row): row is StudentListRow => Boolean(row && !row.lock))
  const selectableVisible = visible.filter((row) => !row.lock)

  const toggle = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  const clearSelection = () => setSelectedIds([])
  const selectVisible = () => setSelectedIds(selectableVisible.slice(0, RECONTACT_PER_BATCH).map((row) => row.applicationId))

  const subjectOptions = Array.from(new Set(rows.map((row) => row.subjectCategory).filter((code): code is string => Boolean(code))))
  const gradeOptions = Array.from(new Set(rows.map((row) => row.gradeOrder).filter((order): order is number => order !== null))).sort((a, b) => a - b)

  const pills: Array<{ key: string; label: string; clear: () => void }> = [
    ...(conditions.subject
      ? [{ key: "subject", label: `관심 과목: ${getSubjectCategoryLabel(conditions.subject) ?? "기타"}`, clear: () => setConditions((current) => ({ ...current, subject: null })) }]
      : []),
    ...(conditions.gradeFrom !== null || conditions.gradeTo !== null
      ? [{
          key: "grade",
          label: `학년: ${conditions.gradeFrom === conditions.gradeTo ? gradeName(conditions.gradeFrom) : `${gradeName(conditions.gradeFrom) || "처음"}–${gradeName(conditions.gradeTo) || "끝"}`}`,
          clear: () => setConditions((current) => ({ ...current, gradeFrom: null, gradeTo: null }))
        }]
      : []),
    ...(conditions.results.length > 0
      ? [{ key: "result", label: `결과: ${conditions.results.map((result) => STUDIO_STUDENT_RESULT_LABELS[result]).join("·")}`, clear: () => setConditions((current) => ({ ...current, results: [] })) }]
      : [])
  ]

  const panel = renderPanel?.(selectedRows, clearSelection) ?? null

  return (
    <div className={styles.board}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>학생</h1>
          <p className={styles.description}>체험 온 학생은 등록하지 않아도 여기 남아요. 특강·새 반이 생기면 맞는 학생을 골라 안내해요.</p>
        </div>
        <label className={styles.search}>
          <V2SearchIcon size={18} />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="학생·보호자 이름" aria-label="학생·보호자 이름으로 찾기" />
        </label>
      </header>

      <div className={styles.tabs} role="group" aria-label="학생 보기">
        {STUDENT_TABS.map(({ value, label }) => (
          <V2Chip key={value} label={label} count={tabCounts[value]} selected={tab === value} onClick={() => changeTab(value)} />
        ))}
      </div>

      <div className={panel ? styles.content : styles.contentSolo}>
        <section className={styles.list} aria-label="학생 목록">
          <div className={styles.filters}>
            {pills.map((pill) => (
              <span key={pill.key} className={styles.pill}>
                {pill.label}
                <button type="button" onClick={pill.clear} aria-label={`${pill.label} 조건 지우기`}><V2SmallXIcon size={14} /></button>
              </span>
            ))}
            <div className={styles.addWrap} ref={popoverRef}>
              <button type="button" className={styles.addButton} aria-expanded={adding} onClick={() => setAdding((open) => !open)}>
                <V2PlusIcon size={16} />조건 추가
              </button>
              {adding ? (
                <div className={styles.popover} role="dialog" aria-label="조건 추가">
                  <p className={styles.popoverTitle}>관심 과목</p>
                  <div className={styles.popoverChips}>
                    {subjectOptions.length === 0 ? <span className={styles.popoverEmpty}>과목 정보가 없어요</span> : null}
                    {subjectOptions.map((code) => (
                      <button
                        key={code}
                        type="button"
                        className={v2ChipClassName({ selected: conditions.subject === code })}
                        aria-pressed={conditions.subject === code}
                        onClick={() => setConditions((current) => ({ ...current, subject: current.subject === code ? null : code }))}
                      >
                        <span className={v2ChipPartClassName.label}>{getSubjectCategoryLabel(code) ?? "기타"}</span>
                      </button>
                    ))}
                  </div>
                  <p className={styles.popoverTitle}>학년</p>
                  <div className={styles.gradeRange}>
                    <select
                      aria-label="학년 시작"
                      value={conditions.gradeFrom ?? ""}
                      onChange={(event) => setConditions((current) => ({ ...current, gradeFrom: event.target.value === "" ? null : Number(event.target.value) }))}
                    >
                      <option value="">처음</option>
                      {gradeOptions.map((order) => <option key={order} value={order}>{gradeName(order)}</option>)}
                    </select>
                    <span aria-hidden="true">–</span>
                    <select
                      aria-label="학년 끝"
                      value={conditions.gradeTo ?? ""}
                      onChange={(event) => setConditions((current) => ({ ...current, gradeTo: event.target.value === "" ? null : Number(event.target.value) }))}
                    >
                      <option value="">끝</option>
                      {gradeOptions.map((order) => <option key={order} value={order}>{gradeName(order)}</option>)}
                    </select>
                  </div>
                  <p className={styles.popoverTitle}>결과</p>
                  <div className={styles.popoverChips}>
                    {RESULT_FILTERS.map((result) => {
                      const on = conditions.results.includes(result)
                      return (
                        <button
                          key={result}
                          type="button"
                          className={v2ChipClassName({ selected: on })}
                          aria-pressed={on}
                          onClick={() => setConditions((current) => ({
                            ...current,
                            results: on ? current.results.filter((item) => item !== result) : [...current.results, result]
                          }))}
                        >
                          <span className={v2ChipPartClassName.label}>{STUDIO_STUDENT_RESULT_LABELS[result]}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <span className={styles.spacer} />
            <span className={styles.count}>{visible.length}명</span>
          </div>

          <div className={styles.selection}>
            {selectedRows.length > 0 ? (
              <>
                <StudentCheckbox checked label="선택 해제" onChange={clearSelection} />
                <strong className={styles.selectionCount}>{selectedRows.length}명 선택</strong>
                <span className={styles.spacer} />
                <button type="button" className={styles.selectionClear} onClick={clearSelection}>선택 해제</button>
              </>
            ) : (
              <>
                <StudentCheckbox checked={false} disabled={selectableVisible.length === 0} label="고를 수 있는 학생 모두 고르기" onChange={selectVisible} />
                <button type="button" className={styles.selectionAll} disabled={selectableVisible.length === 0} onClick={selectVisible}>
                  {selectableVisible.length === 0
                    ? "고를 수 있는 학생이 없어요"
                    : `고를 수 있는 학생 ${Math.min(selectableVisible.length, RECONTACT_PER_BATCH)}명 모두 고르기`}
                </button>
              </>
            )}
          </div>

          <div className={styles.tableScroll}>
            <div className={styles.table}>
              <div className={styles.headRow} aria-hidden="true">
                <span className={styles.headLead} />
                <span className={styles.colStudent}>학생</span>
                <span className={styles.colClass}>체험한 수업</span>
                <span className={styles.colResult}>결과 · 이유</span>
                <span className={styles.colLast}>마지막 연락</span>
              </div>
              {visible.length === 0 ? (
                <p className={styles.empty}>
                  {rows.length === 0
                    ? "아직 체험 온 학생이 없어요. 체험 신청이 들어오면 여기에 학생으로 모여요."
                    : "조건에 맞는 학생이 없어요."}
                </p>
              ) : (
                <ul className={styles.rows}>
                  {visible.map((row) => {
                    const checked = selectedIds.includes(row.applicationId) && !row.lock
                    return (
                      <li key={row.key} className={row.lock ? `${styles.row} ${styles.rowLocked}` : styles.row}>
                        <StudentCheckbox
                          checked={checked}
                          disabled={Boolean(row.lock)}
                          label={row.lock ? `${row.name} — 수신 동의가 없어 고를 수 없어요` : `${row.name} 고르기`}
                          onChange={() => toggle(row.applicationId)}
                        />
                        <span className={styles.subject}><V2SubjectIcon3D categoryCode={row.subjectCategory} size={36} /></span>
                        <span className={styles.colStudent}>
                          <Link href={studioPath(`/studio/students/${row.applicationId}`)} className={styles.rowLink}>
                            <strong className={styles.name}>{row.name}</strong>
                          </Link>
                          <span className={styles.grade}>{row.gradeLabel}</span>
                        </span>
                        <span className={`${styles.colClass} ${styles.classCell}`}>
                          <span className={styles.classTitle}>{row.classTitle}</span>
                          <span className={styles.classSub}>{row.classSub}</span>
                        </span>
                        <span className={`${styles.colResult} ${styles.resultCell}`}>
                          <V2StatusBadge tone={STUDIO_STUDENT_RESULT_TONES[row.result]}>{STUDIO_STUDENT_RESULT_LABELS[row.result]}</V2StatusBadge>
                          {row.reason ? <span className={styles.reason}>{row.reason}</span> : null}
                        </span>
                        <span className={`${styles.colLast} ${styles.lastCell}`}>
                          <span className={styles.lastDate}>{row.lastContact ? formatMonthDay(row.lastContact.at) : "—"}</span>
                          <span className={styles.lastKind}>{row.lock ? "수신 동의 안 함" : row.lastContact?.kind ?? ""}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
          <p className={styles.footnote}>광고성 정보 수신에 동의하지 않은 보호자는 고를 수 없어요.</p>
        </section>
        {panel}
      </div>
    </div>
  )
}

/** "9월 28일" (KST). 서버 · 브라우저 시간대와 상관없이 같은 값. */
const formatMonthDay = (value: string) => {
  const date = new Date(new Date(value).getTime() + 9 * 3600_000)
  return Number.isNaN(date.getTime()) ? "" : `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`
}
