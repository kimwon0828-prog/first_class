"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  cancelMyApplicationAction,
  type CancelMyApplicationActionResult
} from "@/features/applications/actions/cancel-my-application"
import { CancelConfirmDialog } from "@/features/applications/ui/cancel-confirm-dialog"
import styles from "./experience-cancel-button.module.css"

// 경험 상세의 취소. 목록과 같은 server action 을 쓴다.
//
// 여기 버튼이 보이는지는 서버가 준 canCancel 로만 정한다. 최종 판정은
// cancel-my-application 이 다시 한다(UI capability + server guard 이중).

type ExperienceCancelButtonProps = {
  experienceId: string
  /** 무엇을 취소하는지 사용자가 확인할 수 있게 만든 문장. */
  confirmDescription: string
}

export const ExperienceCancelButton = ({
  experienceId,
  confirmDescription
}: ExperienceCancelButtonProps) => {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleConfirm = () => {
    setIsOpen(false)
    startTransition(async () => {
      const result: CancelMyApplicationActionResult = await cancelMyApplicationAction(experienceId)
      window.alert(result.message)

      if (result.status === "success") {
        router.refresh()
      }
    })
  }

  return (
    <>
      <button
        type="button"
        className={styles.cancelButton}
        disabled={isPending}
        onClick={() => setIsOpen(true)}
      >
        {isPending ? "취소 처리 중..." : "신청 취소"}
      </button>

      <CancelConfirmDialog
        open={isOpen}
        description={confirmDescription}
        onConfirm={handleConfirm}
        onClose={() => setIsOpen(false)}
      />
    </>
  )
}
