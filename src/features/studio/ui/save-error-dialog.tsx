"use client"

import { useEffect, useRef } from "react"

import styles from "./application-trial-result-workflow.module.css"

// 저장 실패를 확실히 보이게 하는 dialog.
//
// 기존에는 form 맨 위 inline 문구 하나뿐이었다. 상담 form 은 스크롤되는 modal
// 안에 있고 저장 버튼은 맨 아래라, 실패해도 화면에 아무 변화가 없는 것처럼 보였다.
//
// 이 dialog 는 작성 중인 form 위에 겹쳐 뜬다. form 을 unmount 하지 않으므로
// 입력값이 그대로 남고, [확인] 을 누르면 이 dialog 만 닫힌다.

type SaveErrorDialogProps = {
  title: string
  /** server action 이 준 사용자용 문구. 비어 있을 때만 fallback 을 쓴다. */
  message: string | null
  onConfirm: () => void
}

const FALLBACK_MESSAGE = "잠시 후 다시 시도해 주세요."

export const SaveErrorDialog = ({ title, message, onConfirm }: SaveErrorDialogProps) => {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    confirmButtonRef.current?.focus()
  }, [])

  return (
    <div className={styles.dialogOverlay} role="presentation">
      <div
        className={styles.dialogCard}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="save-error-dialog-title"
        aria-describedby="save-error-dialog-description"
      >
        <div className={styles.dialogBody}>
          <h3 id="save-error-dialog-title" className={styles.dialogTitle}>
            {title}
          </h3>
          <p id="save-error-dialog-description" className={styles.dialogDescription}>
            {message?.trim() ? message : FALLBACK_MESSAGE}
          </p>
        </div>
        <div className={styles.dialogActions}>
          <button
            ref={confirmButtonRef}
            type="button"
            className={styles.primaryButton}
            onClick={onConfirm}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
