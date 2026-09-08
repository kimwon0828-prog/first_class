// Toss 결제 객체 검증.
//
// 200 을 받았다는 사실만으로 구독을 열지 않는다. 우리가 기대한 주문·금액·상태와
// 실제 Payment 객체가 일치할 때만 "검증된 결제" 로 인정한다.
//
// 금액은 서버 카탈로그 값과 비교한다. client 가 보낸 금액은 애초에 여기까지 오지 않는다.

import {
  TOSS_TERMINAL_FAILURE_STATUSES,
  type TossPayment
} from "@/features/billing/lib/toss/contract"

export type PaymentExpectation = {
  orderId: string
  /** 서버 canonical 금액. */
  amount: number
  currency?: string
}

export type PaymentVerification =
  /** 결제가 확정 승인됐다. 이 결과에서만 구독을 연다. */
  | { verdict: "verified"; payment: TossPayment; approvedAt: string }
  /** 아직 진행 중이다. 실패로 확정하지 않는다. */
  | { verdict: "pending"; status: TossPayment["status"] }
  /** Toss 가 실패로 확정했다. */
  | { verdict: "failed"; status: TossPayment["status"]; code: string }
  /** 우리 기대와 다르다. 절대 반영하지 않는다. */
  | { verdict: "mismatch"; code: string; message: string }

export const verifyTossPayment = (
  payment: TossPayment | null | undefined,
  expectation: PaymentExpectation
): PaymentVerification => {
  if (!payment || typeof payment !== "object") {
    return { verdict: "mismatch", code: "payment_missing", message: "결제 객체가 없다" }
  }

  // 주문번호가 다르면 남의 결제다. 금액이 맞아도 반영하지 않는다.
  if (payment.orderId !== expectation.orderId) {
    return {
      verdict: "mismatch",
      code: "order_id_mismatch",
      message: "결제 주문번호가 기대와 다르다"
    }
  }

  if (typeof payment.paymentKey !== "string" || payment.paymentKey.length === 0) {
    return { verdict: "mismatch", code: "payment_key_missing", message: "paymentKey 가 없다" }
  }

  // 금액 위조 방어. 서버 카탈로그 금액과 1원이라도 다르면 거부한다.
  if (payment.totalAmount !== expectation.amount) {
    return {
      verdict: "mismatch",
      code: "amount_mismatch",
      message: "결제 금액이 서버 금액과 다르다"
    }
  }

  const currency = expectation.currency ?? "KRW"
  if (payment.currency && payment.currency !== currency) {
    return { verdict: "mismatch", code: "currency_mismatch", message: "통화가 다르다" }
  }

  if (TOSS_TERMINAL_FAILURE_STATUSES.includes(payment.status)) {
    return { verdict: "failed", status: payment.status, code: `payment_${payment.status.toLowerCase()}` }
  }

  if (payment.status !== "DONE") {
    return { verdict: "pending", status: payment.status }
  }

  if (!payment.approvedAt) {
    // DONE 인데 승인 시각이 없다. 정상 응답이 아니므로 확정하지 않는다.
    return { verdict: "pending", status: payment.status }
  }

  return { verdict: "verified", payment, approvedAt: payment.approvedAt }
}

/** 저장해도 되는 카드 표시 정보만 골라낸다. 원번호·CVC·유효기간은 애초에 오지 않는다. */
export const pickStorableCardDisplay = (payment: TossPayment) => ({
  cardCompany: payment.card?.issuerCode ?? null,
  cardNumberMasked: payment.card?.number ?? null
})
