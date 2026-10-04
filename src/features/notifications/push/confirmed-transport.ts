export type ConfirmedAttempt = {
  deviceId: string; platform: "ios" | "android"; token: string;
  sendStatus: "reserved" | "accepted" | "rejected" | "unknown";
  httpStatus?: number; ticketId?: string; error?: string;
  receiptStatus?: "ok" | "error" | "unknown";
}
const headers = () => ({ "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) })
const category = (value: unknown) => typeof value === "string" && ["DeviceNotRegistered", "InvalidCredentials", "MessageTooBig", "MessageRateExceeded", "MismatchSenderId"].includes(value) ? value : "provider_error"

/** Exactly one HTTP attempt per selected token; no phone/name/operational details in payload. */
export async function sendConfirmedPush(notificationId: string, attempts: ConfirmedAttempt[], request: typeof fetch = fetch): Promise<ConfirmedAttempt[]> {
  if (!/^status:[0-9a-f-]{36}$/i.test(notificationId)) throw new Error("invalid_confirmation_key")
  if (attempts.length > 100) return attempts.map(a => ({ ...a, sendStatus: "unknown", error: "device_limit_review" }))
  if (!attempts.length) return []
  const valid = attempts.filter(a => /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(a.token))
  const invalid = attempts.filter(a => !valid.includes(a)).map(a => ({ ...a, sendStatus: "rejected" as const, error: "DeviceNotRegistered" }))
  if (!valid.length) return invalid
  try {
    const response = await request("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: headers(), signal: AbortSignal.timeout(8000),
      body: JSON.stringify(valid.map(a => ({ to: a.token, title: "체험 일정이 확정됐어요.",
        body: "앱 알림에서 확정된 일정을 확인해 주세요.", sound: "default", channelId: "parent-updates", priority: "high", ttl: 3600,
        data: { type: "schedule_confirmed", path: "/notifications", notificationId } })))
    })
    if (!response.ok) return [...invalid, ...valid.map(a => ({ ...a, httpStatus: response.status,
      sendStatus: response.status >= 500 ? "unknown" as const : "rejected" as const, error: "http_error" }))]
    const body = await response.json()
    if (!Array.isArray(body.data) || body.data.length !== valid.length) throw new Error("invalid_tickets")
    return [...invalid, ...valid.map((a, index) => {
      const t = body.data[index]
      if (t?.status === "ok" && typeof t.id === "string" && t.id.length <= 100) return { ...a, httpStatus: response.status, sendStatus: "accepted" as const, ticketId: t.id }
      if (t?.status === "error") return { ...a, httpStatus: response.status, sendStatus: "rejected" as const, error: category(t.details?.error) }
      return { ...a, httpStatus: response.status, sendStatus: "unknown" as const }
    })]
  } catch { return [...invalid, ...valid.map(a => ({ ...a, sendStatus: "unknown" as const }))] }
}

/** Repeating receipt reads is safe; this function never sends a notification. */
export async function readConfirmedReceipts(attempts: ConfirmedAttempt[], expired: boolean, request: typeof fetch = fetch): Promise<ConfirmedAttempt[]> {
  const pending = attempts.filter(a => a.sendStatus === "accepted" && !a.receiptStatus && a.ticketId)
  if (!pending.length) return attempts
  try {
    const response = await request("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST", headers: headers(), signal: AbortSignal.timeout(8000), body: JSON.stringify({ ids: pending.map(a => a.ticketId) })
    })
    if (!response.ok) throw new Error("receipt_http_error")
    const body = await response.json()
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new Error("invalid_receipts")
    return attempts.map(a => {
      if (!pending.includes(a)) return a
      const r = body.data[a.ticketId!]
      if (r?.status === "ok") return { ...a, receiptStatus: "ok" }
      if (r?.status === "error") return { ...a, receiptStatus: "error", error: category(r.details?.error) }
      return expired ? { ...a, receiptStatus: "unknown" } : a
    })
  } catch { return expired ? attempts.map(a => pending.includes(a) ? { ...a, receiptStatus: "unknown" } : a) : attempts }
}

/** Fallback is per Parent, never per failing device. Accepted is not delivery/read. */
export function confirmedOutcome(attempts: ConfirmedAttempt[]): "receipts" | "delivered" | "unknown" | "fallback_ready" {
  if (attempts.some(a => a.sendStatus === "accepted" && !a.receiptStatus)) return "receipts"
  if (attempts.some(a => a.receiptStatus === "ok")) return "delivered"
  if (attempts.some(a => a.sendStatus === "unknown" || a.sendStatus === "reserved" || a.receiptStatus === "unknown")) return "unknown"
  return "fallback_ready"
}
