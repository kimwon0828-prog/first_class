"use client"

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react"
import styles from "./parent-account-sheet.module.css"

// Native modal semantics make the background inert and keep keyboard focus inside.
export function ParentAccountSheet({ open, title, onClose, children, restoreFocusRef }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  restoreFocusRef?: RefObject<HTMLElement | null>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTarget = restoreFocusRef?.current ?? previousFocus
    const previousOverflow = document.body.style.overflow
    const viewport = window.visualViewport
    const resize = () => {
      dialog.style.setProperty("--account-viewport-height", `${viewport?.height ?? window.innerHeight}px`)
      dialog.style.setProperty("--account-keyboard-offset", `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`)
    }
    resize()
    dialog.showModal()
    document.body.style.overflow = "hidden"
    viewport?.addEventListener("resize", resize)
    viewport?.addEventListener("scroll", resize)
    window.addEventListener("resize", resize)
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      viewport?.removeEventListener("resize", resize)
      viewport?.removeEventListener("scroll", resize)
      window.removeEventListener("resize", resize)
      if (focusTarget?.isConnected) focusTarget.focus()
    }
  }, [open, restoreFocusRef])

  return <dialog ref={dialogRef} className={styles.sheet} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]'
      )).filter((element) => element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}>
    <header className={styles.header}>
      <h2 id={titleId}>{title}</h2>
      <button type="button" onClick={onClose} aria-label="닫기">✕</button>
    </header>
    <div className={styles.content}>{children}</div>
  </dialog>
}
