"use client"

import { useEffect, useRef } from "react"

import styles from "./cancel-confirm-dialog.module.css"

type CancelConfirmDialogProps = {
  description: string
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export const CancelConfirmDialog = ({
  description,
  open,
  onClose,
  onConfirm
}: CancelConfirmDialogProps) => {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    confirmButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose, open])

  if (!open) {
    return null
  }

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="cancel-confirm-title">
        <h2 id="cancel-confirm-title" className={styles.title}>
          체험을 취소할까요?
        </h2>
        <p className={styles.description}>{description}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            닫기
          </button>
          <button type="button" className={styles.dangerButton} onClick={onConfirm} ref={confirmButtonRef}>
            취소하기
          </button>
        </div>
      </div>
    </div>
  )
}
