export type RegularPriceType = "monthly" | "per_session" | "consultation"
export const REGULAR_PRICE_NOTE_MAX_LENGTH = 120
export const REGULAR_PRICE_MAX_AMOUNT = 2_147_483_647

export type RegularPrice = { type: RegularPriceType | null; amount: number | null; note: string | null }

// Shared by the form and server action. Never infer free from an empty amount.
export function parseRegularPrice(input: { type: unknown; amount: unknown; note: unknown }):
  { ok: true; value: RegularPrice } | { ok: false; message: string } {
  const type = String(input.type ?? "").trim()
  if (!type) return { ok: true, value: { type: null, amount: null, note: null } }
  if (type !== "monthly" && type !== "per_session" && type !== "consultation")
    return { ok: false, message: "정규 수강료 유형을 다시 선택해 주세요." }
  const note = String(input.note ?? "").trim() || null
  if (note && note.length > REGULAR_PRICE_NOTE_MAX_LENGTH)
    return { ok: false, message: `정규 수강료 추가 안내는 ${REGULAR_PRICE_NOTE_MAX_LENGTH}자 이하로 입력해 주세요.` }
  if (type === "consultation") return { ok: true, value: { type, amount: null, note } }
  const raw = String(input.amount ?? "").trim()
  const amount = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(amount) || amount > REGULAR_PRICE_MAX_AMOUNT)
    return { ok: false, message: "정규 수강료는 0원 이상 2,147,483,647원 이하의 정수로 입력해 주세요." }
  return { ok: true, value: { type, amount, note } }
}

export function formatRegularPrice(input: { type?: RegularPriceType | null; amount?: number | null }): string | null {
  if (input.type === "consultation") return "상담 후 안내"
  if ((input.type !== "monthly" && input.type !== "per_session") || input.amount == null ||
    !Number.isInteger(input.amount) || input.amount < 0 || input.amount > REGULAR_PRICE_MAX_AMOUNT) return null
  return `${input.type === "monthly" ? "월" : "회당"} ${input.amount.toLocaleString("ko-KR")}원`
}

export function formatRegularPriceInput(value: string): string {
  return /^\d+$/.test(value) ? Number(value).toLocaleString("ko-KR") : value
}
