"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { getStudioBookingDayAction, manageBookingTimesAction } from "../actions/manage-booking-times"
import {
  bookingClassOptions,
  bookingClosureScopeLabel,
  bookingReleaseTargets,
  bookingTimeOccurrences,
  emptyBookingDay,
  groupBookingOccurrences,
  previewBookingClosure,
  type BookingClosure,
  type BookingDay,
  type BookingOccurrence
} from "../lib/booking-closures"
import type { StudioStatusTone } from "../lib/application-status-labels"
import { V2Button } from "./v2/v2-button"
import { V2Chip } from "./v2/v2-chip"
import { V2Dialog } from "./v2/v2-dialog"
import { V2CheckIcon, V2ChevronDownIcon, V2DateIcon, V2InfoIcon } from "./v2/v2-icons"
import { V2StatusBadge } from "./v2/v2-status-badge"
import styles from "./booking-time-dialog.module.css"

const clock = (at: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(at)
  )
export const bookingTimeLabel = (row: { startAt: string; endAt: string }) => `${clock(row.startAt)}~${clock(row.endAt)}`
const bookingRangeLabel = (row: { startAt: string; endAt: string }) => `${clock(row.startAt)} – ${clock(row.endAt)}`

type BookingTimeDialogProps = {
  dateKey: string
  initialClassId: string | null
  todayKey: string
  onClose: () => void
  onChange: (dateKey: string, closures: BookingClosure[]) => void
  /** 날짜별 예약 시간 조회. 기본은 서버 액션이다. */
  loadDay?: (dateKey: string) => Promise<{ data: BookingDay; error: string | null }>
}

/* 시간 한 줄의 예약 상태. 판정 순서 · 문구는 리뉴얼 전 팝업과 같다. tone 은 STUDIO_DESIGN_SYSTEM.md §5.13. */
const presentGroupStatus = (group: BookingOccurrence[]): { label: string; tone: StudioStatusTone } => {
  const closed = group.filter((o) => o.closureIds.length > 0).length
  if (closed === group.length) return { label: "예약 마감", tone: "amber" }
  if (closed) return { label: "일부 수업 마감", tone: "amber" }
  if (group.some((o) => o.bookingStatus !== "open")) return { label: "기본 마감·비공개", tone: "gray" }
  if (group.some((o) => o.reservationIds.length >= o.capacity)) return { label: "만석", tone: "gray" }
  if (Date.parse(group[0].startAt) < Date.now() + 86400000) return { label: "24시간 예약 제한", tone: "gray" }
  return { label: "예약 가능", tone: "green" }
}

/* Studio/Checkbox (Figma 2012:491 · 492 · 495). 브라우저 checkbox 를 그대로 쓰고 모양만 덮는다. */
const Checkbox = (props: { checked: boolean; disabled: boolean; label: string; onChange: () => void }) => (
  <span className={styles.checkbox}>
    <input type="checkbox" checked={props.checked} disabled={props.disabled} aria-label={props.label} onChange={props.onChange} />
    <V2CheckIcon size={14} className={styles.checkMark} />
  </span>
)

export function BookingTimeDialog({
  dateKey: initialDate,
  initialClassId,
  todayKey,
  onClose,
  onChange,
  loadDay = getStudioBookingDayAction
}: BookingTimeDialogProps) {
  const request = useRef(0)
  const alive = useRef(true)
  const inFlight = useRef(false)
  const [dateKey, setDateKey] = useState(initialDate)
  const [classId, setClassId] = useState<string | null>(initialClassId)
  const [pickMode, setPickMode] = useState(initialClassId !== null)
  const [day, setDay] = useState<BookingDay>(emptyBookingDay())
  const [selected, setSelected] = useState<string[]>([])
  const [selectedClosureIds, setSelectedClosureIds] = useState<string[]>([])
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  const loadRef = useRef(loadDay)
  loadRef.current = loadDay

  const load = useCallback(async () => {
    const id = ++request.current
    setLoading(true)
    setError(null)
    try {
      const r = await loadRef.current(dateKey)
      if (!alive.current || id !== request.current) return
      if (r.error) {
        setError(r.error)
        setDay(emptyBookingDay())
      } else {
        setDay(r.data)
        changeRef.current(dateKey, r.data.closures)
      }
    } catch {
      if (alive.current && id === request.current) setError("예약 시간을 불러오지 못했습니다.")
    } finally {
      if (alive.current && id === request.current) setLoading(false)
    }
  }, [dateKey])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const classes = useMemo(() => bookingClassOptions(day), [day])
  const groups = useMemo(() => groupBookingOccurrences(bookingTimeOccurrences(day, classId)), [day, classId])
  const closePreview = previewBookingClosure(day, selected, classId, "close")
  const releaseBase = previewBookingClosure(day, selected, classId, "release")
  const releaseIds = [...new Set([...releaseBase.closureIds, ...selectedClosureIds])]
  const releaseWindows = day.closures.filter((c) => releaseIds.includes(c.id) && (!classId || c.classId === classId))
  const releaseTargets = bookingReleaseTargets(day, releaseWindows)
  const releasePreview = {
    ...releaseBase,
    targets: releaseTargets,
    closureIds: releaseWindows.map((c) => c.id),
    reservationCount: new Set(releaseTargets.flatMap((o) => o.reservationIds)).size,
    canApply: releaseWindows.length > 0
  }
  const visibleClosures = day.closures.filter((c) => !classId || c.classId === classId)
  // 수업을 골랐을 때 목록에서 빠지는 학원 전체 마감의 내부 사유는 따로 보여준다(리뉴얼 전과 같은 범위).
  const hiddenClosureReasons = classId ? day.closures.filter((c) => c.reason && !c.classId) : []
  const past = dateKey < todayKey
  const closeTimeCount = new Set(closePreview.selected.map((o) => `${o.startAt}/${o.endAt}`)).size
  const resetSelection = () => {
    setSelected([])
    setSelectedClosureIds([])
    setNotice("")
  }
  const chooseClass = (next: string | null) => {
    setClassId(next)
    resetSelection()
  }

  const apply = async (mode: "close" | "release") => {
    const preview = mode === "close" ? closePreview : releasePreview
    if (inFlight.current || !preview.canApply || past) return
    inFlight.current = true
    setApplying(true)
    setError(null)
    setNotice("")
    try {
      const r = await manageBookingTimesAction({
        dateKey,
        classId,
        mode,
        slotKeys: mode === "release" ? [] : closePreview.selected.map((o) => o.key),
        expectedTargets: preview.targets.map((o) => o.key),
        closureIds: preview.closureIds,
        reason: reason.trim() || null
      })
      if (r.error) {
        setError(r.error)
        return
      }
      setSelected([])
      setSelectedClosureIds([])
      setNotice(mode === "close" ? `예약 마감 ${r.changed}건을 적용했어요.` : `예약 마감 ${r.changed}건을 해제했어요.`)
      await load()
    } catch {
      setError("변경을 적용하지 못했습니다. 다시 시도해 주세요.")
    } finally {
      inFlight.current = false
      setApplying(false)
    }
  }

  const hasSelection = selected.length > 0 || selectedClosureIds.length > 0
  const keptReservations = new Set([...closePreview.targets, ...releasePreview.targets].flatMap((o) => o.reservationIds)).size

  return (
    <V2Dialog
      title="예약 시간 관리"
      description="신규 예약을 마감할 시간을 골라요. 이미 들어온 예약은 그대로 남아요."
      width={720}
      busy={applying}
      onClose={onClose}
      footerNote="이 날짜에만 적용되고, 기본 운영시간은 그대로예요."
      footerActions={
        <>
          {releasePreview.closureIds.length > 0 ? (
            <V2Button variant="outline" disabled={loading || applying || past || !releasePreview.canApply} onClick={() => void apply("release")}>
              선택 마감 해제 ({releasePreview.closureIds.length}건)
            </V2Button>
          ) : null}
          <V2Button variant="primary" disabled={loading || applying || past || !closePreview.canApply} onClick={() => void apply("close")}>
            {applying ? "적용 중…" : `선택 시간 마감 (${closeTimeCount}개)`}
          </V2Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>선택 날짜</span>
            <span className={styles.dateInput}>
              <V2DateIcon size={16} />
              <input
                type="date"
                value={dateKey}
                disabled={applying}
                onChange={(e) => {
                  if (e.target.value) {
                    resetSelection()
                    setDateKey(e.target.value)
                  }
                }}
              />
            </span>
          </label>
          <div className={styles.field} role="group" aria-labelledby="booking-class-scope">
            <span id="booking-class-scope" className={styles.fieldLabel}>
              적용 수업
            </span>
            <div className={styles.chips}>
              <V2Chip label="전체 공개 수업" selected={!pickMode} disabled={loading || applying} onClick={() => {
                setPickMode(false)
                chooseClass(null)
              }} />
              <V2Chip label="수업 골라서" selected={pickMode} disabled={loading || applying} onClick={() => {
                setPickMode(true)
                if (!classId) chooseClass(classes[0]?.value ?? null)
              }} />
            </div>
          </div>
        </div>
        {pickMode ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>수업</span>
            <span className={styles.selectWrap}>
              <select
                aria-label="적용 수업"
                value={classId ?? ""}
                disabled={loading || applying || (classes.length === 0 && !classId)}
                onChange={(e) => chooseClass(e.target.value || null)}
              >
                {!classId ? <option value="">이 날짜에 고를 수업이 없어요</option> : null}
                {classId && !classes.some((o) => o.value === classId) ? <option value={classId}>선택 수업 · 현재 회차 없음</option> : null}
                {classes.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <V2ChevronDownIcon size={14} className={styles.selectIcon} />
            </span>
          </label>
        ) : null}
        <p className={styles.note}>
          전체 공개 수업은 지금 공개 중인 수업에만 적용돼요. 나중에 공개하는 수업에는 적용되지 않아요. 비공개 수업의 기존 예약·마감은
          확인하고 해제할 수 있어요.
        </p>
        {past ? <p className={styles.pastNote}>지난 날짜는 조회만 할 수 있어요.</p> : null}

        {loading ? (
          <p className={styles.state} role="status">
            예약 시간을 불러오는 중이에요.
          </p>
        ) : groups.length === 0 ? (
          <p className={styles.state}>이 날짜에 열려 있는 예약 시간이 없어요.</p>
        ) : (
          <div className={styles.table}>
            <div className={`${styles.row} ${styles.headRow}`} aria-hidden="true">
              <span>선택</span>
              <span>시간 / 수업</span>
              <span>예약 상태</span>
            </div>
            {groups.map((group) => {
              const first = group[0]
              const checked = group.every((o) => selected.includes(o.key))
              const reservations = new Set(group.flatMap((o) => o.reservationIds)).size
              const status = presentGroupStatus(group)
              const titles = [...new Set(group.map((o) => o.classTitle))].join(" · ")
              return (
                <label key={`${first.startAt}/${first.endAt}`} className={`${styles.row} ${checked ? styles.rowSelected : ""}`}>
                  <span className={styles.cellCheck}>
                    <Checkbox
                      checked={checked}
                      disabled={applying || past}
                      label={`${bookingTimeLabel(first)} ${group.map((o) => o.classTitle).join(", ")}`}
                      onChange={() =>
                        setSelected((current) =>
                          checked ? current.filter((k) => !group.some((o) => o.key === k)) : [...new Set([...current, ...group.map((o) => o.key)])]
                        )
                      }
                    />
                  </span>
                  <span className={styles.cellTime}>
                    <strong>{bookingRangeLabel(first)}</strong>
                    <small>{titles}</small>
                  </span>
                  <span className={styles.cellStatus}>
                    <V2StatusBadge tone={status.tone}>{status.label}</V2StatusBadge>
                    {reservations > 0 ? <small>기존 예약 {reservations}건</small> : null}
                  </span>
                </label>
              )
            })}
          </div>
        )}

        {visibleClosures.length > 0 ? (
          <section className={styles.closures} aria-label="저장된 예약 마감">
            <h3>이미 마감된 시간</h3>
            {visibleClosures.map((c) => (
              <label className={styles.closureRow} key={c.id}>
                <Checkbox
                  checked={selectedClosureIds.includes(c.id)}
                  disabled={applying || past}
                  label={`${bookingTimeLabel(c)} 저장된 마감 해제 선택`}
                  onChange={() =>
                    setSelectedClosureIds((ids) => (ids.includes(c.id) ? ids.filter((id) => id !== c.id) : [...ids, c.id]))
                  }
                />
                <span className={styles.closureText}>
                  <strong>
                    {bookingRangeLabel(c)}
                    {c.classId ? ` · ${day.classes.find((k) => k.id === c.classId)?.title ?? "수업 정보 없음"}` : ""}
                  </strong>
                  <small>
                    {bookingClosureScopeLabel(c)}
                    {c.reason ? ` · 내부 사유: ${c.reason}` : ""}
                  </small>
                </span>
                <span className={styles.closureHint}>체크하면 마감 해제</span>
              </label>
            ))}
          </section>
        ) : null}
        {hiddenClosureReasons.map((c) => (
          <p className={styles.note} key={c.id}>
            {bookingTimeLabel(c)} · {bookingClosureScopeLabel(c)} · 내부 사유: {c.reason}
          </p>
        ))}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>사유 (선택)</span>
          <input
            className={styles.textInput}
            value={reason}
            maxLength={500}
            disabled={applying}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 학원 행사"
          />
          <span className={styles.note}>학원 내부에만 보여요. 학부모에게는 마감으로만 보여요.</span>
        </label>

        {hasSelection ? (
          <div className={styles.preview} aria-label="적용 대상 미리보기">
            <V2InfoIcon size={16} className={styles.previewIcon} />
            <div className={styles.previewText}>
              <p>
                {closePreview.targets.length}회차를 마감해요. 기존 예약 {keptReservations}건은 그대로 유지돼요. 일정 변경이 필요하면 학부모에게
                따로 연락해 주세요.
              </p>
              {closePreview.targets.length > 0 ? (
                <ul>
                  {closePreview.targets.map((o) => (
                    <li key={o.key}>
                      {o.classTitle} · {bookingTimeLabel(o)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {releasePreview.closureIds.length > 0 ? (
                <p>
                  해제할 마감 {releasePreview.closureIds.length}건 · 영향 {releasePreview.targets.length}회차
                  {releaseWindows.map((c) => ` · ${bookingTimeLabel(c)}`).join("")}
                </p>
              ) : (
                <p>고른 수업 범위에서 해제할 마감이 없어요. 기존 학원 전체 마감은 &lsquo;전체 공개 수업&rsquo;에서 확인하고 해제해 주세요.</p>
              )}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            <V2Button variant="outline" size="sm" disabled={applying} onClick={() => void load()}>
              다시 불러오기
            </V2Button>
          </div>
        ) : null}
        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
        <p className={styles.note}>마감 해제는 이 제한만 없애요. 만석·휴무·기본 마감·24시간 예약 제한은 그대로 유지돼요.</p>
      </div>
    </V2Dialog>
  )
}
