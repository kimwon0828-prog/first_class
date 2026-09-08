// Toss webhook 계약.
//
// 공식 문서 확인 사실(2026-09).
//   - 결제 상태 변경 이벤트는 PAYMENT_STATUS_CHANGED 다. body 는
//     { eventType, createdAt, data: Payment } 형태다.
//   - 자동결제 관련으로 BILLING_DELETED(빌링키 삭제)가 따로 있다.
//   - 고유 식별자는 tosspayments-webhook-transmission-id 헤더다.
//   - 서명 검증(tosspayments-webhook-signature)은 지급대행 이벤트에만 제공된다.
//     즉 결제 webhook 은 서명으로 진위를 확인할 수 없다.
//
// 그래서 body 를 그대로 믿지 않는다. paymentKey/orderId 만 꺼내서
// 결제 조회 API 로 다시 읽은 값으로만 판단한다. body 는 "확인해 보라는 신호" 일 뿐이다.
//
// 10초 안에 200 을 주지 않으면 최대 7회(약 3일 19시간) 재전송된다. 따라서
// 이미 처리했거나 무시하기로 한 이벤트에도 200 을 준다 — 아니면 3일 내내 재전송된다.

export type TossWebhookEnvelope = {
  eventType: string
  createdAt: string | null
  paymentKey: string | null
  orderId: string | null
  billingKey: string | null
  /** 재전송 식별자. 없으면 내용으로 fingerprint 를 만든다. */
  eventId: string
}

export type TossWebhookParse =
  | { ok: true; envelope: TossWebhookEnvelope }
  | { ok: false; reason: string }

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

/** 우리가 처리하는 이벤트. 나머지는 200 으로 소비하고 아무것도 하지 않는다. */
export const HANDLED_WEBHOOK_EVENTS = new Set(["PAYMENT_STATUS_CHANGED", "BILLING_DELETED"])

export const parseTossWebhook = (
  body: unknown,
  transmissionId: string | null
): TossWebhookParse => {
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "invalid_body" }
  }

  const record = body as Record<string, unknown>
  const eventType = asString(record.eventType)
  if (!eventType) {
    return { ok: false, reason: "missing_event_type" }
  }

  const data = (record.data ?? {}) as Record<string, unknown>
  const paymentKey = asString(data.paymentKey)
  const orderId = asString(data.orderId)
  const billingKey = asString(record.billingKey) ?? asString(data.billingKey)
  const createdAt = asString(record.createdAt)

  // 재전송 식별자가 없으면 같은 사건이 같은 값을 내도록 내용으로 만든다.
  const fingerprint =
    transmissionId ??
    [eventType, paymentKey ?? billingKey ?? "", asString(data.status) ?? "", createdAt ?? ""].join("|")

  return {
    ok: true,
    envelope: { eventType, createdAt, paymentKey, orderId, billingKey, eventId: fingerprint }
  }
}
