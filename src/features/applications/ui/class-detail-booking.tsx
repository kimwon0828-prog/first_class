"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import { isBookablePublicSlot, isHiddenPublicSlot, isPastPublicSlot } from "@/features/applications/lib/public-class-slots"
import { appDateLabel, appTimeLabel, appWeekday, seoulDateKey } from "@/features/classes/lib/app-presentation"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { AppNotice, AppSection } from "@/features/classes/ui/parent-app-ui"
import ui from "@/features/classes/ui/parent-app-ui.module.css"
import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"

import styles from "./class-detail-booking.module.css"

// 수업 상세의 "체험 가능한 시간"에서 고른 시간을 하단 신청 버튼과 신청 시트 1단계가 함께 쓴다(앱 classes/[id] 와 같다).
type Booking = { picked: string; setPicked: (optionId: string) => void; slots: AvailableScheduleSlot[]; now: number }
const BookingContext = createContext<Booking | null>(null)

/** 숨김·지난 일정은 빼고 날짜별로 묶는다. 마감 일정은 마감 칩으로 남긴다. */
export function groupSlotDays(slots: readonly AvailableScheduleSlot[], now: number) {
  const byDate = new Map<string, AvailableScheduleSlot[]>()
  const visible = slots.filter(slot => !isHiddenPublicSlot(slot) && !isPastPublicSlot(slot, now)).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
  for (const slot of visible) {
    const day = seoulDateKey(slot.startAt)
    byDate.set(day, [...(byDate.get(day) ?? []), slot])
  }
  return { byDate, dates: [...byDate.keys()], visible }
}

export function ClassDetailBookingProvider({ slots, now, initial, children }: { slots: AvailableScheduleSlot[]; now: number; initial?: string; children: ReactNode }) {
  const [picked, setPicked] = useState(initial ?? "")
  const value = useMemo(() => ({ picked, setPicked, slots, now }), [picked, slots, now])
  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
}

/** 고른 시간(없으면 가장 빠른 예약 가능 시간). */
export function useDetailChosenSlot() {
  const booking = useContext(BookingContext)
  if (!booking) return { chosen: undefined, available: [] as AvailableScheduleSlot[], setPicked: () => {} }
  const available = booking.slots.filter(slot => isBookablePublicSlot(slot, booking.now)).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
  const chosen = available.find(slot => slot.optionId === booking.picked) ?? available[0]
  return { chosen, available, setPicked: booking.setPicked }
}

/** 날짜 칩 줄 + 시간 칩 3열(앱 SlotPicker). 날짜를 바꾸면 그날 가장 빠른 예약 가능 시간을 고른다. */
export function SlotPicker({ slots, now, selectedId, onSelect }: { slots: AvailableScheduleSlot[]; now: number; selectedId?: string; onSelect: (optionId: string) => void }) {
  const [day, setDay] = useState<string | null>(null)
  const { byDate, dates } = useMemo(() => groupSlotDays(slots, now), [slots, now])
  const openDates = new Set(dates.filter(date => byDate.get(date)!.some(slot => isBookablePublicSlot(slot, now))))
  const selectedDay = selectedId ? dates.find(date => byDate.get(date)!.some(slot => slot.optionId === selectedId)) : undefined
  const chosenDay = day ?? selectedDay ?? dates.find(date => openDates.has(date)) ?? dates[0]
  const times = byDate.get(chosenDay) ?? []
  const pick = (date: string) => { setDay(date); const first = byDate.get(date)?.find(slot => isBookablePublicSlot(slot, now)); if (first) onSelect(first.optionId) }
  return <div className={styles.picker}>
    {openDates.size ? <div className={styles.dates} data-scroll={dates.length > 5 || undefined} role="group" aria-label="날짜">
      {dates.map(date => {
        const sample = byDate.get(date)![0], open = openDates.has(date), on = date === chosenDay && open
        return <button key={date} type="button" className={styles.date} aria-pressed={on} disabled={!open} onClick={() => pick(date)}
          aria-label={`${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 ${appWeekday(sample.startAt)}${open ? "" : " 마감"}`}>
          <span className={styles.weekday}>{appWeekday(sample.startAt)}</span><span className={styles.day}>{Number(date.slice(8))}</span>
        </button>
      })}
    </div> : null}
    <div className={styles.times} role="group" aria-label="시간">
      {times.map(slot => {
        const full = !isBookablePublicSlot(slot, now), label = appTimeLabel(slot.startAt)
        return <button key={slot.optionId} type="button" className={ui.timeChip} disabled={full} aria-pressed={slot.optionId === selectedId}
          aria-label={full ? `${label} 마감` : label} onClick={() => onSelect(slot.optionId)}>{label}</button>
      })}
    </div>
  </div>
}

export const slotMonthLabel = (slot: AvailableScheduleSlot) => `${Number(seoulDateKey(slot.startAt).slice(5, 7))}월`

/** 수업 상세 "체험 가능한 시간" 구역. */
export function DetailSlotSection({ slotsError, retryHref }: { slotsError: string | null; retryHref: string }) {
  const booking = useContext(BookingContext)
  const { chosen, setPicked } = useDetailChosenSlot()
  const visible = booking ? groupSlotDays(booking.slots, booking.now).visible : []
  const month = chosen ?? visible[0]
  return <AppSection title="체험 가능한 시간" right={!slotsError && month ? <span className={ui.bodyMuted}>{slotMonthLabel(month)}</span> : null}>
    {slotsError ? <AppNotice message="예약 가능 시간대를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." retryHref={retryHref} />
      : !visible.length ? <p className={ui.bodyMuted}>현재 예약 가능한 일정이 없어요.</p>
      : <>
        <SlotPicker slots={booking!.slots} now={booking!.now} selectedId={chosen?.optionId} onSelect={setPicked} />
        {chosen ? <p className={styles.chosen}><AppIcon name="clock" size={14} /><span>{appDateLabel(chosen.startAt)} {appTimeLabel(chosen.startAt)} 선택됨 · 신청하면 학원이 확정해요</span></p>
          : <div className={ui.softBox}><p className={ui.subtitle}>이번 주 체험이 모두 찼어요</p></div>}
      </>}
  </AppSection>
}
