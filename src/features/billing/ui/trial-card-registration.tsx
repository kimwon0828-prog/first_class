"use client"

import Link from "next/link"
import { useState } from "react"

import { startTrialCardRegistration } from "@/features/billing/actions/start-trial-card-registration"
import { loadTossSdk } from "@/features/billing/ui/toss-billing-sdk"
import { V2Button, v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { V2Dialog } from "@/features/studio/ui/v2/v2-dialog"
import { V2CheckIcon } from "@/features/studio/ui/v2/v2-icons"
import styles from "./trial-card-registration.module.css"

// 자동 체험 중 [카드 등록] → 동의 팝업 → 결제창(카드 인증만) (STUDIO_DESIGN_SYSTEM.md §5.26).
//
// 결제창은 동의 체크 뒤에만 열린다. 서버도 agreed 와 카드 등록 창(종료 30일 전 ~ 종료)을
// 다시 본다. 카드를 등록해도 지금은 결제되지 않는다 — 첫 결제는 마지막 체험일이다.

type TrialCardRegistrationProps = {
  /** 스탠다드 카드 자리(primary lg 전체 폭) · 결제 수단 상자 자리(outline sm) */
  placement: "plan" | "payment"
  label: string
  /** 마지막 체험일 = 첫 결제일 "1월 20일(수)" */
  lastDayLabel: string
  /** "39,000원" */
  amountLabel: string
}

export const TrialCardRegistration = ({ placement, label, lastDayLabel, amountLabel }: TrialCardRegistrationProps) => {
  const [open, setOpen] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const close = () => {
    if (pending) return
    setOpen(false)
    setAgreed(false)
    setMessage(null)
  }

  const submit = async () => {
    if (!agreed || pending) return
    setPending(true)
    setMessage(null)
    try {
      const result = await startTrialCardRegistration({ agreed: true })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      const factory = await loadTossSdk()
      const payment = factory(result.data.clientKey).payment({ customerKey: result.data.customerKey })
      // 자동결제 등록(카드 인증)만 한다. 금액 · 주문번호는 넘기지 않는다.
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: result.data.successUrl,
        failUrl: result.data.failUrl
      })
    } catch {
      setMessage("결제창을 열지 못했어요. 잠시 후 다시 시도해 주세요.")
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={
          placement === "plan"
            ? v2ButtonClassName({ variant: "primary", size: "lg", className: styles.full })
            : v2ButtonClassName({ variant: "outline", size: "sm" })
        }
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open ? (
        <V2Dialog
          title="카드 등록"
          description="카드를 등록해도 지금은 결제되지 않아요."
          width={520}
          busy={pending}
          onClose={close}
          footerNote={
            <Link href="/refund-policy" target="_blank" rel="noreferrer" className={styles.policyLink}>
              환불 및 해지 정책
            </Link>
          }
          footerActions={
            <V2Button type="button" variant="primary" disabled={!agreed || pending} onClick={submit}>
              {pending ? "결제창을 여는 중" : "카드 등록하기"}
            </V2Button>
          }
        >
          <div className={styles.body}>
            <dl className={styles.summary}>
              <div>
                <dt>첫 결제일</dt>
                <dd>{lastDayLabel}</dd>
              </div>
              <div>
                <dt>금액</dt>
                <dd>{amountLabel} · 매월 자동 결제</dd>
              </div>
              <div>
                <dt>해지</dt>
                <dd>{lastDayLabel} 전에 해지하면 결제되지 않아요</dd>
              </div>
            </dl>
            <p className={styles.text}>
              {lastDayLabel}에 {amountLabel}이 결제되고 매월 자동 결제돼요. 그 전에 해지하면 결제되지 않아요.
            </p>
            <label className={styles.agree}>
              <span className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={agreed}
                  disabled={pending}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                <V2CheckIcon size={14} className={styles.checkMark} />
              </span>
              <span>(필수) 위 내용을 확인했고 자동 결제에 동의해요</span>
            </label>
            {message ? (
              <p className={styles.message} role="alert">
                {message}
              </p>
            ) : null}
          </div>
        </V2Dialog>
      ) : null}
    </>
  )
}
