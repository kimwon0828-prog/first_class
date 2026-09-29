/** Strict canonical strings only. Unknown legacy text is never guessed or rewritten. */
export const OPERATING_DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const
export type OperatingDay = typeof OPERATING_DAYS[number]
export type HoursDraft = { days: string[]; start: string; end: string }
export type ParkingDraft = { available: boolean | null; detail: string }
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/
export const PARKING_PREFIX = "주차 가능 · "
export function hoursError({ days, start, end }: HoursDraft): string | null {
  if (!days.length && !start && !end) return null
  if (!days.length || days.some(day => !(OPERATING_DAYS as readonly string[]).includes(day)) || new Set(days).size !== days.length) return "운영 요일을 선택해 주세요."
  if (!TIME.test(start) || !TIME.test(end)) return "시작 시간과 종료 시간을 선택해 주세요."
  if (end <= start) return "종료 시간은 시작 시간보다 뒤여야 해요."
  return null
}
export function formatHours(draft: HoursDraft): string | null {
  if (hoursError(draft)) return null
  const days = OPERATING_DAYS.filter(day => draft.days.includes(day))
  if (!days.length) return null
  const contiguous = days.every((day, i) => !i || OPERATING_DAYS.indexOf(day) === OPERATING_DAYS.indexOf(days[i - 1]) + 1)
  const label = contiguous && days.length >= 3 ? `${days[0]}–${days.at(-1)}` : days.join("·")
  return `${label} ${draft.start}–${draft.end}`
}
export function parseHours(value: string | null): HoursDraft | null {
  if (!value) return { days: [], start: "", end: "" }
  const match = /^([월화수목금토일·–]+) (\d{2}:\d{2})–(\d{2}:\d{2})$/.exec(value)
  if (!match) return null
  const label = match[1], range = label.split("–")
  let days: string[]
  if (range.length === 2) {
    const first = OPERATING_DAYS.indexOf(range[0] as OperatingDay), last = OPERATING_DAYS.indexOf(range[1] as OperatingDay)
    if (first < 0 || last < first) return null
    days = OPERATING_DAYS.slice(first, last + 1)
  } else days = label.split("·")
  const draft = { days, start: match[2], end: match[3] }
  return !hoursError(draft) && formatHours(draft) === value ? draft : null
}
export function formatParking({ available, detail }: ParkingDraft): string | null {
  if (available === null) return null
  if (!available) return "주차 불가"
  return detail.trim() ? `${PARKING_PREFIX}${detail.trim()}` : "주차 가능"
}
export function parseParking(value: string | null): ParkingDraft | null {
  if (!value) return { available: null, detail: "" }
  if (value === "주차 불가") return { available: false, detail: "" }
  if (value === "주차 가능") return { available: true, detail: "" }
  if (value.startsWith(PARKING_PREFIX)) {
    const draft = { available: true, detail: value.slice(PARKING_PREFIX.length) }
    if (draft.detail.trim() && formatParking(draft) === value) return draft
  }
  return null
}
