import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"
import { isHiddenPublicSlot } from "@/features/applications/lib/public-class-slots"
import { getPublicClassesAvailableSlots } from "@/features/applications/queries/get-public-class-available-slots"
import { cardSlots, isCardBookable, type CardSlot } from "@/features/native/server/academy-cards"

// 앱 홈·수업 목록·학원 상세 카드의 일정(slots). 모양은 수업 상세와 같다: {optionId,startAt,endAt,isClosed,remainingCount}.
const DAY = 24 * 60 * 60 * 1000
export const WEEK_DAYS = 7
export type CardSlotsResult = { slots: CardSlot[]; slotsError: string | null }

// 수업 상세가 돌려주는 공개 일정 투영(숨김 회차 제외).
export const publicSlotProjection = (slots: QueryResult<AvailableScheduleSlot[]>): CardSlot[] =>
  slots.data.filter(slot => !isHiddenPublicSlot(slot)).map(({ optionId, startAt, endAt, isClosed, remainingCount }) => ({ optionId, startAt, endAt, isClosed, remainingCount }))

// 여러 수업의 카드 일정을 한 번에 읽는다: 신청 가능(마감 아님·남은 자리·24시간 이후)한 것 중 이번 주 것, 없으면 다음 하나(cardSlots).
export async function loadCardSlots(classIds: readonly string[], now = Date.now()): Promise<Map<string, CardSlotsResult>> {
  const slots = await getPublicClassesAvailableSlots(classIds)
  return new Map(classIds.map(id => {
    const result = slots.get(id) ?? { data: [], error: null }
    return [id, { slots: cardSlots(publicSlotProjection(result), now), slotsError: result.error }]
  }))
}

// 지금부터 7일 안에 신청 가능한 일정이 있는가.
export const hasSlotWithin = (slots: readonly CardSlot[], now: number, days = WEEK_DAYS) =>
  slots.some(slot => isCardBookable(slot, now) && Date.parse(slot.startAt) < now + days * DAY)

// 가장 빠른 신청 가능 일정(없으면 뒤로).
const earliest = (slots: readonly CardSlot[], now: number) =>
  Math.min(...slots.filter(slot => isCardBookable(slot, now)).map(slot => Date.parse(slot.startAt)), Number.POSITIVE_INFINITY)
export function byEarliestSlot<T extends { id: string }>(items: readonly T[], slotsById: Map<string, CardSlotsResult>, now: number): T[] {
  const at = new Map(items.map(item => [item.id, earliest(slotsById.get(item.id)?.slots ?? [], now)]))
  return [...items].sort((a, b) => at.get(a.id)! - at.get(b.id)!)
}
// 이번 주 신청 가능한 수업만, 가장 빠른 일정 순.
export const withinWeek = <T extends { id: string }>(items: readonly T[], slotsById: Map<string, CardSlotsResult>, now: number) =>
  byEarliestSlot(items.filter(item => hasSlotWithin(slotsById.get(item.id)?.slots ?? [], now)), slotsById, now)

// 홈 "이번 주 체험할 수 있는 수업": 이번 주 수업이 있으면 this_week, 없으면 전체를 일정 빠른 순(일정 없는 수업은 뒤로) upcoming.
export function homeSection<T extends { id: string }>(items: readonly T[], slotsById: Map<string, CardSlotsResult>, now: number) {
  const week = withinWeek(items, slotsById, now)
  return week.length ? { section: "this_week" as const, items: week } : { section: "upcoming" as const, items: byEarliestSlot(items, slotsById, now) }
}

// 소요 시간(분): 카드 첫 일정의 길이. 일정이 없으면 null(지어내지 않는다).
export const slotDurationMinutes = (slots: readonly CardSlot[]) => {
  const first = slots[0]
  const minutes = first ? Math.round((Date.parse(first.endAt) - Date.parse(first.startAt)) / 60000) : NaN
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null
}
