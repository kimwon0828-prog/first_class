// Toss 브라우저 SDK 로더. [스탠다드 시작]과 체험 중 [카드 등록]이 같이 쓴다.
//
// 카드 정보는 결제창이 받고, 우리 화면은 건드리지 않는다. 금액 · 주문번호는 넘기지 않는다
// (자동결제 등록 = 카드 인증만 한다).

import { TOSS_BILLING_SDK_URL } from "@/features/billing/lib/toss/contract"

type TossPaymentsSdk = {
  payment: (options: { customerKey: string }) => {
    requestBillingAuth: (options: {
      method: "CARD"
      successUrl: string
      failUrl: string
    }) => Promise<void>
  }
}

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPaymentsSdk
  }
}

export const loadTossSdk = async (): Promise<(clientKey: string) => TossPaymentsSdk> => {
  if (window.TossPayments) {
    return window.TossPayments
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TOSS_BILLING_SDK_URL}"]`
    )
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("sdk_load_failed")), { once: true })
      return
    }

    const script = document.createElement("script")
    script.src = TOSS_BILLING_SDK_URL
    script.async = true
    script.addEventListener("load", () => resolve(), { once: true })
    script.addEventListener("error", () => reject(new Error("sdk_load_failed")), { once: true })
    document.head.appendChild(script)
  })

  if (!window.TossPayments) {
    throw new Error("sdk_load_failed")
  }

  return window.TossPayments
}

