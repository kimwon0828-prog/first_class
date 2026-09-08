"use client"

import { useState } from "react"

import { startStandardCheckout } from "@/features/billing/actions/start-standard-checkout"
import { TOSS_BILLING_SDK_URL } from "@/features/billing/lib/toss/contract"
import styles from "./start-standard-button.module.css"

// 결제창 진입 버튼.
//
// client 는 금액을 만들지 않는다. 서버가 발급한 customerKey 와 클라이언트 키만 받아
// Toss 결제창을 띄운다. 카드 정보는 결제창이 받고, 우리 화면은 건드리지 않는다.

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

const loadTossSdk = async (): Promise<(clientKey: string) => TossPaymentsSdk> => {
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

export const StartStandardButton = () => {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleClick = async () => {
    if (pending) {
      return
    }

    setPending(true)
    setMessage(null)

    try {
      const result = await startStandardCheckout()
      if (!result.ok) {
        setMessage(result.message)
        return
      }

      const factory = await loadTossSdk()
      const payment = factory(result.data.clientKey).payment({
        customerKey: result.data.customerKey
      })

      // 자동결제 등록에는 금액·주문번호가 없다. 금액은 서버가 승인 단계에서만 쓴다.
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: result.data.successUrl,
        failUrl: result.data.failUrl
      })
    } catch {
      setMessage("결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <button type="button" className={styles.primary} onClick={handleClick} disabled={pending}>
        {pending ? "결제창을 여는 중" : "스탠다드 시작하기"}
      </button>
      {message ? <p className={styles.message}>{message}</p> : null}
    </div>
  )
}
