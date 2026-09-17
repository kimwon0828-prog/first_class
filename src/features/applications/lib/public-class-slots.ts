import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

/**
 * 학부모에게 "지금 신청할 수 있는 일정" 의 단 하나의 기준.
 *
 * ⚠️ 상세 화면과 신청 sheet 가 같은 함수를 쓴다. 두 곳이 다른 답을 내면
 *    화면에는 일정이 있는데 눌러 보면 없는 상태가 생긴다.
 *
 * ⚠️ 없는 일정을 있는 것처럼 암시하지 않는다 — "예약 가능 일정 확인" 같은
 *    문구를 만들지 않고, 0건이면 0건이라고 말한다.
 */
export const HIDDEN_BOOKING_STATUS = "hidden"

const SEOUL_WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"]

export const isHiddenPublicSlot = (slot: AvailableScheduleSlot) =>
  slot.bookingStatus === HIDDEN_BOOKING_STATUS

export const isPastPublicSlot = (slot: AvailableScheduleSlot, now: number) => {
  const time = new Date(slot.startAt).getTime()
  return Number.isNaN(time) || time <= now
}

/** 지금 실제로 고를 수 있는 슬롯인가. 숨김 · 마감 · 잔여 0 · 지난 것은 아니다. */
export const isBookablePublicSlot = (slot: AvailableScheduleSlot, now: number) =>
  !isHiddenPublicSlot(slot) && !slot.isClosed && slot.remainingCount > 0 && !isPastPublicSlot(slot, now)

/** 빠른 순으로. limit 을 주면 앞에서 그만큼만. */
export const selectBookablePublicSlots = (
  slots: readonly AvailableScheduleSlot[],
  now: number,
  limit?: number
): AvailableScheduleSlot[] => {
  const bookable = slots
    .filter((slot) => isBookablePublicSlot(slot, now))
    .sort((left, right) => left.startAt.localeCompare(right.startAt))

  return typeof limit === "number" ? bookable.slice(0, limit) : bookable
}

/** "오후 3:00" */
const formatTime = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  const meridiem = parts.hour < 12 ? "오전" : "오후"
  const rawHour = parts.hour % 12
  const hour = rawHour === 0 ? 12 : rawHour
  return `${meridiem} ${hour}:${String(parts.minute).padStart(2, "0")}`
}

/**
 * 한 줄 표기.
 *
 *   weekly   매주 화요일 오후 3:00
 *   one_time 9월 18일 (금) 오후 3:00
 *
 * ⚠️ 시각은 한국 시간으로 읽는다. UTC 문자열을 자르지 않는다.
 */
export const formatPublicSlotLabel = (slot: AvailableScheduleSlot): string | null => {
  const parts = getSeoulDateTimeParts(slot.startAt)
  const time = formatTime(slot.startAt)
  if (!parts || !time) {
    return null
  }

  if (slot.scheduleType === "weekly") {
    return `매주 ${SEOUL_WEEKDAY_SHORT[parts.weekday]}요일 ${time}`
  }

  return `${parts.month}월 ${parts.day}일 (${SEOUL_WEEKDAY_SHORT[parts.weekday]}) ${time}`
}

/**
 * 상세 화면이 읽는 "체험 가능 일정" 한 줄들.
 *
 * ⚠️ 주간 일정은 회차마다 슬롯이 하나씩 생기므로 그대로 그리면
 *    "매주 화요일 오후 1:00" 이 네 번 반복된다. 같은 말을 여러 번 하지 않는다.
 *    다른 날짜의 일회성 일정은 서로 다른 문장이라 그대로 남는다.
 */
export const buildPublicSlotLines = (
  slots: readonly AvailableScheduleSlot[],
  now: number,
  limit?: number
): Array<{ id: string; label: string }> => {
  const seen = new Set<string>()
  const lines: Array<{ id: string; label: string }> = []

  for (const slot of selectBookablePublicSlots(slots, now)) {
    const label = formatPublicSlotLabel(slot)
    if (!label || seen.has(label)) {
      continue
    }

    seen.add(label)
    lines.push({ id: slot.id, label })

    if (typeof limit === "number" && lines.length >= limit) {
      break
    }
  }

  return lines
}
