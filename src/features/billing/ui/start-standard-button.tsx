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

/** 결제창을 여는 세 단계. 실패 문구는 단계별로 다르다. */
type CheckoutStage = "prepare" | "sdk" | "billing_auth"

const STAGE_MESSAGES: Record<CheckoutStage, string> = {
  // 서버가 결제 준비(권한 확인 · 세션 생성)를 끝내지 못했다.
  prepare: "결제 준비 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  // Toss SDK script 를 받지 못했다. 네트워크나 차단 확장 프로그램이 흔한 원인이다.
  sdk: "결제 모듈을 불러오지 못했습니다. 다시 시도해 주세요.",
  // 결제창은 떴는데 카드 인증이 끝나지 않았다.
  billing_auth: "결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요."
}

/**
 * 사용자가 결제창을 닫은 것인가.
 *
 * Toss SDK 는 취소도 reject 로 알린다. code 를 보고 실패와 구분하지 않으면
 * 정상적으로 창을 닫은 사용자에게 오류 문구가 남는다.
 */
const isUserCanceled = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false
  }

  const code = (error as { code?: unknown }).code
  return code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED"
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

    // 실패 단계를 구분한다. 단계마다 사용자가 할 수 있는 일이 다르기 때문이다.
    // 단계 이름 외에 원문 error · stack · key · auth 정보는 화면에도 콘솔에도 내보내지 않는다.
    let stage: CheckoutStage = "prepare"

    try {
      const result = await startStandardCheckout()
      if (!result.ok) {
        setMessage(result.message)
        return
      }

      stage = "sdk"
      const factory = await loadTossSdk()
      const payment = factory(result.data.clientKey).payment({
        customerKey: result.data.customerKey
      })

      stage = "billing_auth"
      // 자동결제 등록에는 금액·주문번호가 없다. 금액은 서버가 승인 단계에서만 쓴다.
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: result.data.successUrl,
        failUrl: result.data.failUrl
      })
    } catch (error) {
      // 결제창에서 사용자가 닫으면 Toss SDK 도 reject 한다. 이건 오류가 아니다.
      if (stage === "billing_auth" && isUserCanceled(error)) {
        return
      }

      console.warn("[billing] checkout_failed", { stage })
      setMessage(STAGE_MESSAGES[stage])
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
