"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"

import { AdminApprovalNav } from "../_components/admin-approval-nav"
import styles from "./sales-map.module.css"
import {
  resolveSubjectGauge,
  SALES_BIDDING_BRAND_TARGET,
  SALES_MEMO_MAX_LENGTH,
  SALES_STATES,
  type SalesProspectStatus,
  type SalesProspectView,
  type SalesState,
  type SalesStatusUpdateInput,
  type SalesStatusUpdateResult,
  type SalesSubjectView
} from "@/features/admin/sales-map/lib/sales-status"
import type { ActionResult } from "@/shared/actions"

type GradeFilter = "all" | SalesProspectView["grade"]

type SaveState = { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string }

type SalesMapClientProps = {
  subjects: SalesSubjectView[]
  prospects: SalesProspectView[]
  listError: string | null
  updateAction: (input: SalesStatusUpdateInput) => Promise<ActionResult<SalesStatusUpdateResult>>
}

const GRADE_FILTERS: Array<{ value: GradeFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "A", label: "A 1순위" },
  { value: "B", label: "B 2순위" },
  { value: "보완", label: "지도 보완" }
]

const GRADE_ORDER: Record<SalesProspectView["grade"], number> = { A: 0, B: 1, 보완: 2 }

const SUMMARY_CARDS: Array<{ key: string; label: string; states: SalesState[] }> = [
  { key: "contacted", label: "연락함", states: ["연락함"] },
  { key: "meeting", label: "미팅", states: ["미팅"] },
  { key: "confirmed", label: "확정", states: ["확정"] },
  { key: "rejected", label: "거절", states: ["거절"] },
  { key: "remaining", label: "남은 곳", states: ["미접촉"] }
]

const STATE_CLASS: Record<SalesState, string> = {
  미접촉: styles.state_untouched,
  연락함: styles.state_contacted,
  미팅: styles.state_meeting,
  확정: styles.state_confirmed,
  거절: styles.state_rejected
}

const GAUGE_LABEL = {
  ready: { label: "비딩 오픈 가능", className: styles.status_approved },
  short: { label: "후보 부족", className: styles.status_rejected },
  progress: { label: "진행 중", className: styles.status_pending }
} as const

const normalizeSearch = (value: string) => value.replace(/\s+/g, "").toLowerCase()

const compareProspects = (a: SalesProspectView, b: SalesProspectView) =>
  GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] ||
  (b.elementaryShare ?? -1) - (a.elementaryShare ?? -1) ||
  a.name.localeCompare(b.name, "ko")

const formatVisitedOn = (value: string) => {
  const [, month, day] = value.split("-")
  return `${Number(month)}월 ${Number(day)}일`
}

const toStatusMap = (prospects: SalesProspectView[]) =>
  Object.fromEntries(prospects.map((prospect) => [prospect.id, prospect.status])) as Record<string, SalesProspectStatus>

export function SalesMapClient({ subjects, prospects, listError, updateAction }: SalesMapClientProps) {
  const router = useRouter()
  const [statusById, setStatusById] = useState(() => toStatusMap(prospects))
  const [saveStateById, setSaveStateById] = useState<Record<string, SaveState>>({})
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all")
  const [personalOnly, setPersonalOnly] = useState(false)
  const [query, setQuery] = useState("")
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(() => new Set())

  /* 새로 받은 서버 상태(다른 기기에서 바꾼 값)를 화면에 반영한다. */
  useEffect(() => {
    setStatusById(toStatusMap(prospects))
  }, [prospects])

  /* 휴대폰 ↔ PC 를 오갈 때 화면으로 돌아오면 최신 상태를 다시 읽는다. */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [router])

  const rows = useMemo(
    () => prospects.map((prospect) => ({ ...prospect, status: statusById[prospect.id] ?? prospect.status })),
    [prospects, statusById]
  )

  const stateCounts = useMemo(() => {
    const counts = Object.fromEntries(SALES_STATES.map((state) => [state, 0])) as Record<SalesState, number>
    rows.forEach((row) => {
      counts[row.status.state] += 1
    })
    return counts
  }, [rows])

  const gauges = useMemo(
    () =>
      subjects.map((subject) => ({
        subject,
        gauge: resolveSubjectGauge(
          rows
            .filter((row) => row.subject === subject.key)
            .map((row) => ({ brandKey: row.brandKey, state: row.status.state }))
        )
      })),
    [subjects, rows]
  )

  const normalizedQuery = normalizeSearch(query)
  const isSearching = normalizedQuery.length > 0

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (gradeFilter !== "all" && row.grade !== gradeFilter) return false
        if (personalOnly && row.ownership !== "개인") return false
        if (!normalizedQuery) return true
        return normalizeSearch(row.name).includes(normalizedQuery) || normalizeSearch(row.address).includes(normalizedQuery)
      }),
    [rows, gradeFilter, personalOnly, normalizedQuery]
  )

  const groups = useMemo(
    () =>
      subjects
        .map((subject) => ({
          subject,
          rows: filteredRows.filter((row) => row.subject === subject.key).sort(compareProspects)
        }))
        .filter((group) => group.rows.length > 0),
    [subjects, filteredRows]
  )

  const gradeCounts = useMemo(() => {
    const base = personalOnly ? rows.filter((row) => row.ownership === "개인") : rows
    return {
      all: base.length,
      A: base.filter((row) => row.grade === "A").length,
      B: base.filter((row) => row.grade === "B").length,
      보완: base.filter((row) => row.grade === "보완").length
    } satisfies Record<GradeFilter, number>
  }, [rows, personalOnly])

  const toggleSubject = (key: string) => {
    setOpenSubjects((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const save = async (prospectId: string, patch: { state?: SalesState; memo?: string }) => {
    const previous = statusById[prospectId]
    if (patch.state) {
      const nextState = patch.state
      setStatusById((current) => ({ ...current, [prospectId]: { ...current[prospectId], state: nextState } }))
    }
    setSaveStateById((current) => ({ ...current, [prospectId]: { kind: "saving" } }))

    let result: ActionResult<SalesStatusUpdateResult>
    try {
      result = await updateAction({ prospectId, ...patch })
    } catch {
      result = { ok: false, message: "연결이 불안정해요. 다시 시도해 주세요." }
    }

    if (result.ok) {
      setStatusById((current) => ({ ...current, [prospectId]: result.data.status }))
      setSaveStateById((current) => ({ ...current, [prospectId]: { kind: "saved" } }))
      return
    }

    if (patch.state && previous) {
      setStatusById((current) => ({ ...current, [prospectId]: { ...current[prospectId], state: previous.state } }))
    }
    setSaveStateById((current) => ({ ...current, [prospectId]: { kind: "error", message: result.message } }))
  }

  const hasData = prospects.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.adminBadge}>Admin</span>
            <h1 className={styles.pageTitle}>영업 지도</h1>
            <p className={styles.pageDescription}>
              은행사거리 학원 {prospects.length}곳의 영업 진행 상태예요. 휴대폰이나 PC 어디서 바꿔도 같은 상태로
              저장됩니다.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link href="/admin/sales-map" prefetch={false} className={styles.buttonSecondary}>
              새로고침
            </Link>
          </div>
        </header>

        <AdminApprovalNav currentPath="/admin/sales-map" />

        {listError ? (
          <section className={styles.alert} role="alert">
            <p className={styles.alertTitle}>영업 상태를 불러오지 못했습니다.</p>
            <p className={styles.alertDescription}>잠시 후 새로고침해 주세요.</p>
          </section>
        ) : null}

        {hasData ? (
          <>
            <section className={styles.metricGrid} aria-label="영업 합계">
              {SUMMARY_CARDS.map((card) => (
                <article key={card.key} className={styles.metricCard}>
                  <p className={styles.metricLabel}>{card.label}</p>
                  <p className={styles.metricValue}>
                    {card.states.reduce((sum, state) => sum + stateCounts[state], 0)}
                  </p>
                </article>
              ))}
            </section>

            <section className={styles.toolbar} aria-labelledby="sales-gauge-title">
              <div className={styles.toolbarTop}>
                <div>
                  <h2 id="sales-gauge-title" className={styles.toolbarTitle}>
                    과목별 비딩 게이지
                  </h2>
                  <p className={styles.toolbarDescription}>
                    서로 다른 브랜드 {SALES_BIDDING_BRAND_TARGET}곳 확정. 같은 브랜드 여러 지점은 1곳으로 셉니다.
                  </p>
                </div>
              </div>
              <ul className={styles.gaugeList}>
                {gauges.map(({ subject, gauge }) => {
                  const verdict = GAUGE_LABEL[gauge.verdict]
                  const ratio = Math.min(gauge.confirmedBrands / SALES_BIDDING_BRAND_TARGET, 1)

                  return (
                    <li key={subject.key} className={styles.gaugeItem}>
                      <div className={styles.gaugeTop}>
                        <span className={styles.gaugeName}>{subject.key}</span>
                        <span className={`${styles.statusBadge} ${verdict.className}`}>{verdict.label}</span>
                      </div>
                      <div
                        className={styles.gaugeTrack}
                        role="meter"
                        aria-label={`${subject.key} 확정 브랜드`}
                        aria-valuemin={0}
                        aria-valuemax={SALES_BIDDING_BRAND_TARGET}
                        aria-valuenow={Math.min(gauge.confirmedBrands, SALES_BIDDING_BRAND_TARGET)}
                      >
                        <span className={styles.gaugeFill} style={{ width: `${ratio * 100}%` }} />
                      </div>
                      <p className={styles.gaugeMeta}>
                        확정 {gauge.confirmedBrands}/{SALES_BIDDING_BRAND_TARGET} · 거절 뺀 브랜드 {gauge.openBrands}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className={styles.toolbar} aria-label="학원 필터">
              <div className={styles.filterRow} role="group" aria-label="등급 필터">
                {GRADE_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={gradeFilter === filter.value}
                    className={`${styles.filterPill} ${gradeFilter === filter.value ? styles.filterPillActive : ""}`}
                    onClick={() => setGradeFilter(filter.value)}
                  >
                    {filter.label}
                    <span className={styles.filterCount}>{gradeCounts[filter.value]}</span>
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={personalOnly}
                  className={`${styles.filterPill} ${personalOnly ? styles.filterPillActive : ""}`}
                  onClick={() => setPersonalOnly((current) => !current)}
                >
                  개인 운영만
                </button>
              </div>
              <div className={styles.searchRow}>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="학원 이름 · 주소 검색"
                  aria-label="학원 이름 · 주소 검색"
                  className={styles.searchInput}
                />
                <span className={styles.resultMeta}>현재 {filteredRows.length}곳 표시</span>
              </div>
            </section>

            {groups.length === 0 ? (
              <section className={styles.emptyState}>
                <span className={styles.emptyIcon} aria-hidden="true" />
                <p className={styles.emptyTitle}>조건에 맞는 학원이 없어요</p>
                <p className={styles.emptyDescription}>필터를 바꾸거나 검색어를 지워 보세요.</p>
              </section>
            ) : (
              <div className={styles.subjectList}>
                {groups.map((group) => {
                  const isOpen = isSearching || openSubjects.has(group.subject.key)
                  const panelId = `sales-subject-${group.subject.key}`
                  const confirmedCount = group.rows.filter((row) => row.status.state === "확정").length

                  return (
                    <section key={group.subject.key} className={styles.subjectCard}>
                      <button
                        type="button"
                        className={styles.subjectHeader}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => toggleSubject(group.subject.key)}
                        disabled={isSearching}
                      >
                        <span className={styles.subjectName}>{group.subject.key}</span>
                        <span className={styles.subjectMeta}>
                          {group.rows.length}곳 · 확정 {confirmedCount}
                        </span>
                        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} aria-hidden="true" />
                      </button>
                      {isOpen ? (
                        <ul id={panelId} className={styles.prospectList}>
                          {group.rows.map((row) => (
                            <ProspectRow
                              key={row.id}
                              prospect={row}
                              saveState={saveStateById[row.id]}
                              onSave={(patch) => save(row.id, patch)}
                            />
                          ))}
                        </ul>
                      ) : null}
                    </section>
                  )
                })}
              </div>
            )}
          </>
        ) : listError ? null : (
          <section className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden="true" />
            <p className={styles.emptyTitle}>영업 대상 학원이 없어요</p>
            <p className={styles.emptyDescription}>학원 목록 파일을 확인해 주세요.</p>
          </section>
        )}
      </div>
    </div>
  )
}

type ProspectRowProps = {
  prospect: SalesProspectView
  saveState: SaveState | undefined
  onSave: (patch: { state?: SalesState; memo?: string }) => Promise<void>
}

function ProspectRow({ prospect, saveState, onSave }: ProspectRowProps) {
  const { status } = prospect
  const [memoDraft, setMemoDraft] = useState(status.memo)
  const isEditingMemo = useRef(false)

  /* 입력 중이 아닐 때만 저장된 메모(다른 기기 포함)로 맞춘다. */
  useEffect(() => {
    if (!isEditingMemo.current) {
      setMemoDraft(status.memo)
    }
  }, [status.memo])

  const commitMemo = () => {
    isEditingMemo.current = false
    if (memoDraft.trim() !== status.memo) {
      void onSave({ memo: memoDraft })
    }
  }

  const handleMemoKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  const isPhoneHidden = prospect.phone.startsWith("(")
  const elementaryLabel = prospect.elementaryShare === null ? null : `초등 ${prospect.elementaryShare}%`

  return (
    <li className={styles.prospect}>
      <div className={styles.prospectTop}>
        <div className={styles.prospectHeading}>
          <p className={styles.prospectName}>{prospect.name}</p>
          <p className={styles.prospectMeta}>
            {[prospect.type, prospect.ownership, elementaryLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={styles.gradeBadge}>{prospect.grade}</span>
      </div>

      <dl className={styles.prospectInfo}>
        <div className={styles.infoRow}>
          <dt className={styles.infoLabel}>전화</dt>
          <dd className={`${styles.infoValue} ${styles.selectable} ${isPhoneHidden ? styles.mutedText : ""}`}>
            {prospect.phone}
          </dd>
        </div>
        <div className={styles.infoRow}>
          <dt className={styles.infoLabel}>주소</dt>
          <dd className={`${styles.infoValue} ${styles.selectable}`}>{prospect.address}</dd>
        </div>
        {prospect.note ? (
          <div className={styles.infoRow}>
            <dt className={styles.infoLabel}>참고</dt>
            <dd className={styles.infoValue}>{prospect.note}</dd>
          </div>
        ) : null}
        {status.visitedOn ? (
          <div className={styles.infoRow}>
            <dt className={styles.infoLabel}>방문일</dt>
            <dd className={styles.infoValue}>{formatVisitedOn(status.visitedOn)}</dd>
          </div>
        ) : null}
      </dl>

      <div className={styles.prospectControls}>
        <select
          value={status.state}
          onChange={(event) => void onSave({ state: event.target.value as SalesState })}
          aria-label={`${prospect.name} 상태`}
          className={`${styles.stateSelect} ${STATE_CLASS[status.state]}`}
        >
          {SALES_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={memoDraft}
          maxLength={SALES_MEMO_MAX_LENGTH}
          onFocus={() => {
            isEditingMemo.current = true
          }}
          onChange={(event) => setMemoDraft(event.target.value)}
          onBlur={commitMemo}
          onKeyDown={handleMemoKeyDown}
          enterKeyHint="done"
          placeholder="메모"
          aria-label={`${prospect.name} 메모`}
          className={styles.memoInput}
        />
      </div>
      <p className={styles.saveStatus} aria-live="polite">
        {saveState?.kind === "saving" ? "저장 중…" : null}
        {saveState?.kind === "saved" ? "저장됨" : null}
        {saveState?.kind === "error" ? (
          <span className={styles.saveError}>저장 실패 · {saveState.message}</span>
        ) : null}
      </p>
    </li>
  )
}
