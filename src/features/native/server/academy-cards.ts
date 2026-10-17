import type { SupabaseClient } from "@supabase/supabase-js"
import { isMissingTrialPriceConfirmationColumn, trialPriceConfirmedFromRow } from "@/shared/lib/db/trial-price-confirmation"

// 앱 학원 상세의 수업 카드에 필요한 값만 만든다. 수업 상세(/classes/:id)의 전체 일정 응답은 바꾸지 않는다.
export type CardSlot = { optionId: string; startAt: string; endAt: string; isClosed: boolean; remainingCount: number }
export type AcademyCardDetail = { programType: string | null; trialPrice: number | null; trialPriceConfirmed: boolean | null; coverImageUrl: string | null; classFormat: string | null; targetAge: string | null }

const DAY = 24 * 60 * 60 * 1000
// 앱 bookable(slot) 및 서버 isTrialBookingBookable 과 같은 판정: 마감 아님, 남은 자리 있음, 시작이 24시간 뒤보다 늦음.
export const isCardBookable = (slot: CardSlot, now: number) =>
  !slot.isClosed && slot.remainingCount > 0 && Date.parse(slot.startAt) > now + DAY

// 카드가 쓰는 것은 이번 주 시간 칩(+N 포함)과, 이번 주에 없을 때의 다음 예약 가능 일정 하나다.
// 앱은 7일로 자르므로 시계 차이를 감안해 8일까지 보낸다. 예약 불가 일정은 카드에 쓰이지 않아 보내지 않는다.
export function cardSlots(slots: CardSlot[], now: number, windowDays = 8): CardSlot[] {
  const open = slots.filter(slot => isCardBookable(slot, now)).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
  const inWindow = open.filter(slot => Date.parse(slot.startAt) < now + windowDays * DAY)
  return inWindow.length ? inWindow : open.slice(0, 1)
}

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  Boolean(error) && (error!.code === "42703" || (typeof error!.message === "string" && error!.message.includes("does not exist")))

// 수업 상세와 같은 공개 조건(is_active, archived_at null)으로 카드 값과 가격 확인 여부를 한 번에 읽는다(수업마다 상세 조회를 하지 않는다).
// 다시 읽는 경우는 둘뿐이다: 확인 컬럼 자체가 없으면(migration 미적용) 그 컬럼만 빼고(trialPriceConfirmed null),
// class_format 이 없는 legacy DB 면 확인 컬럼은 유지한 채 class_format 만 뺀다. 그 밖의 오류는 실패로 돌려준다.
export async function loadAcademyCardDetails(client: SupabaseClient, classIds: readonly string[]): Promise<Map<string, AcademyCardDetail>> {
  const ids = [...new Set(classIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const query = (fields: string) => client.from("classes").select(fields).in("id", ids).eq("is_active", true).is("archived_at", null)
  const base = "id, program_type, trial_price, cover_image_url, target_age"
  const withFormat = await query(`${base}, class_format, trial_price_confirmed_at`)
  const confirmationMissing = isMissingTrialPriceConfirmationColumn(withFormat.error)
  const second = confirmationMissing ? await query(`${base}, class_format`)
    : isMissingColumn(withFormat.error) ? await query(`${base}, trial_price_confirmed_at`) : withFormat
  const { data, error } = confirmationMissing
    ? (isMissingColumn(second.error) ? await query(base) : second)
    : (isMissingTrialPriceConfirmationColumn(second.error) ? await query(base) : second)
  if (error) throw new Error("failed_to_fetch_academy_card_details")
  type Row = { id: string; program_type: string | null; trial_price: number | null; cover_image_url: string | null; target_age: string | null; class_format?: string | null; trial_price_confirmed_at?: string | null }
  return new Map(((data ?? []) as unknown as Row[]).map(row => [row.id, {
    programType: row.program_type ?? null,
    trialPrice: typeof row.trial_price === "number" ? row.trial_price : null,
    trialPriceConfirmed: trialPriceConfirmedFromRow(row),
    coverImageUrl: row.cover_image_url ?? null,
    classFormat: row.class_format ?? null,
    targetAge: row.target_age ?? null
  }]))
}
