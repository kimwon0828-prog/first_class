"use client"

import { useEffect, useRef, type ReactNode } from "react"
import styles from "./studio-class-form.module.css"

export const StudioClassFormDialog = ({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean
}) => {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = "hidden"
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return (
    <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={(event) => { if (busy) event.preventDefault(); else onClose() }}
      onClick={(event) => { if (!busy && event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      } }}>
      <div className={styles.dialogHeader}><h2>{title}</h2><button type="button" disabled={busy} onClick={onClose} className={styles.secondaryButton}>닫기</button></div>
      <div className={styles.dialogBody}>{children}</div>
    </dialog>
  )
}
