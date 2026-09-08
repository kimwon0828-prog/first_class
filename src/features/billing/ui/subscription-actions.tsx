"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  cancelStandardSubscription,
  resumeStandardSubscription
} from "@/features/billing/actions/manage-standard-subscription"
import styles from "./subscription-actions.module.css"

// 해지 / 해지 취소.
//
// 해지는 파괴적 액션이라 Modal confirm 을 거친다(§6.8). 확인 문구에는 실제 종료일과
// "무엇이 남는가" 를 함께 적는다 — 원장이 데이터가 지워질까 걱정하지 않아야 한다.
//
// 서버가 상태를 다시 판정하므로 이 컴포넌트는 UI 만 책임진다. 처리 중 재클릭은 막는다.

type SubscriptionActionsProps = {
  canCancel: boolean
  canResume: boolean
  /** 실제 이용 종료 예정일. 없으면 문구에서 날짜를 뺀다. */
  endDate: string | null
}

export const SubscriptionActions = ({ canCancel, canResume, endDate }: SubscriptionActionsProps) => {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (open && !dialog.open) {
      dialog.showModal()
    }
    if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const run = async (action: () => Promise<{ ok: boolean; message?: string }>) => {
    if (pending) {
      return
    }

    setPending(true)
    setMessage(null)
    try {
      const result = await action()
      if (!result.ok) {
        setMessage(result.message ?? "요청을 처리하지 못했어요.")
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setMessage("요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.")
    } finally {
      setPending(false)
    }
  }

  if (!canCancel && !canResume) {
    return null
  }

  return (
    <div className={styles.wrapper}>
      {canResume ? (
        <button
          type="button"
          className={styles.ghost}
          disabled={pending}
          onClick={() => run(resumeStandardSubscription)}
        >
          {pending ? "처리 중" : "해지 취소"}
        </button>
      ) : null}

      {canCancel ? (
        <button type="button" className={styles.text} onClick={() => setOpen(true)}>
          구독 해지
        </button>
      ) : null}

      {message ? (
        <p className={styles.message} role="alert">
          {message}
        </p>
      ) : null}

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="cancel-dialog-title"
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      >
        <h2 className={styles.dialogTitle} id="cancel-dialog-title">
          스탠다드 구독을 해지할까요?
        </h2>
        <p className={styles.dialogBody}>
          {endDate
            ? `${endDate}까지 스탠다드 기능을 그대로 이용할 수 있고, 이후 무료 플랜으로 전환돼요.`
            : "이용 기간이 끝날 때까지 스탠다드 기능을 그대로 이용할 수 있고, 이후 무료 플랜으로 전환돼요."}
        </p>
        <p className={styles.dialogBody}>
          수업·신청·체험 결과·상담 기록은 삭제되지 않고, 무료 플랜에서도 계속 볼 수 있어요.
        </p>

        {message ? (
          <p className={styles.message} role="alert">
            {message}
          </p>
        ) : null}

        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.ghost}
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            돌아가기
          </button>
          <button
            type="button"
            className={styles.danger}
            disabled={pending}
            onClick={() => run(cancelStandardSubscription)}
          >
            {pending ? "처리 중" : "구독 해지하기"}
          </button>
        </div>
      </dialog>
    </div>
  )
}
