import type { SupabaseClient } from "@supabase/supabase-js"

// 학부모 신청의 실제 종료 시각. DB의 app.booking_application_end 와 같은 규칙이다:
// 수업 일정(class_schedules)이 있으면 그 일정 길이를 예약 시작에 더하고(종료가 시작보다 이르거나 같으면 다음 날),
// 없으면 확정·요청 일정 블록(schedule_blocks)의 종료 시각을 쓴다. 근거가 없으면 null — 임의 길이를 넣지 않는다.
export type BookingTimeSource = {
  id: string
  class_id: string | null
  class_schedule_id: string | null
  requested_schedule_block_id: string | null
  confirmed_schedule_block_id: string | null
  requested_slot_at: string | null
  confirmed_slot_at: string | null
}
export type BookingSchedule = { id: string; class_id: string; start_time: string; end_time: string }
export type BookingBlock = { id: string; start_at: string; end_at: string }
export type BookingTime = { slot_end_at: string | null; duration_minutes: number | null }

const DAY_MINUTES = 24 * 60
const NONE: BookingTime = { slot_end_at: null, duration_minutes: null }
const clockMinutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1]), minute = Number(match[2])
  return hour < 24 && minute < 60 ? hour * 60 + minute : null
}

export function resolveBookingTime(app: BookingTimeSource, schedule?: BookingSchedule | null, block?: BookingBlock | null): BookingTime {
  const start = app.confirmed_slot_at ?? app.requested_slot_at
  const startMs = start ? Date.parse(start) : NaN
  if (!Number.isFinite(startMs)) return NONE
  let endMs = NaN
  if (schedule && schedule.class_id === app.class_id) {
    const from = clockMinutes(schedule.start_time), to = clockMinutes(schedule.end_time)
    if (from !== null && to !== null) endMs = startMs + (to - from + (to <= from ? DAY_MINUTES : 0)) * 60000
  } else if (block && Date.parse(block.start_at) === startMs) {
    // 블록은 예약 시작과 같은 블록일 때만 쓴다. 다른 시각으로 옮겨진 예약에 블록 길이를 늘려 붙이지 않는다.
    endMs = Date.parse(block.end_at)
  }
  const minutes = Math.round((endMs - startMs) / 60000)
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes >= DAY_MINUTES) return NONE
  return { slot_end_at: new Date(endMs).toISOString(), duration_minutes: minutes }
}

const unique = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))]

// 호출부가 이미 본인 신청으로 확인한 id 만 넘긴다. 읽기 전용.
export async function loadBookingTimes(client: SupabaseClient, ids: string[]): Promise<Record<string, BookingTime>> {
  if (!ids.length) return {}
  const apps = await client.from("trial_applications")
    .select("id, class_id, class_schedule_id, requested_schedule_block_id, confirmed_schedule_block_id, requested_slot_at, confirmed_slot_at")
    .in("id", ids)
  if (apps.error) throw new Error("booking_time_unavailable")
  const rows = (apps.data ?? []) as BookingTimeSource[]
  const scheduleIds = unique(rows.map(row => row.class_schedule_id))
  const blockIds = unique(rows.map(row => row.confirmed_schedule_block_id ?? row.requested_schedule_block_id))
  const [schedules, blocks] = await Promise.all([
    scheduleIds.length ? client.from("class_schedules").select("id, class_id, start_time, end_time").in("id", scheduleIds) : Promise.resolve({ data: [], error: null }),
    blockIds.length ? client.from("schedule_blocks").select("id, start_at, end_at").in("id", blockIds) : Promise.resolve({ data: [], error: null })
  ])
  if (schedules.error || blocks.error) throw new Error("booking_time_unavailable")
  const scheduleById = new Map(((schedules.data ?? []) as BookingSchedule[]).map(row => [row.id, row]))
  const blockById = new Map(((blocks.data ?? []) as BookingBlock[]).map(row => [row.id, row]))
  return Object.fromEntries(rows.map(row => [row.id, resolveBookingTime(
    row,
    row.class_schedule_id ? scheduleById.get(row.class_schedule_id) : null,
    blockById.get(row.confirmed_schedule_block_id ?? row.requested_schedule_block_id ?? "")
  )]))
}
