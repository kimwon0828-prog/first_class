"use client"

import { useEffect, useId, useRef, type ReactNode } from "react"

import { v2ButtonClassName } from "./v2-button"
import { V2XIcon } from "./v2-icons"
import styles from "./v2-dialog.module.css"

type V2DialogProps = {
  title: string
  description?: ReactNode
  /** 아래 줄 왼쪽 안내. 오른쪽에는 항상 [닫기]가 있다. */
  footerNote?: ReactNode
  /** [닫기] 오른쪽에 붙는 행동 버튼(예약 시간 관리 2178:373 의 [선택 시간 마감]). */
  footerActions?: ReactNode
  /** 작업 중에는 닫기 · Esc · 바깥 누름으로 닫히지 않는다. */
  busy?: boolean
  /** 너비(px). Figma 팝업 기본 880. */
  width?: number
  onClose: () => void
  children: ReactNode
}

/**
 * Studio v2 팝업 (Figma "특정 날짜만 변경하기" 2178:959).
 *
 * 브라우저 기본 <dialog>.showModal() 을 쓴다 — 포커스 가두기 · Esc · 배경 비활성이 따라온다.
 * 열려 있는 동안 본문 스크롤을 막고, 닫히면 열기 전 포커스로 돌아간다.
 */
export const V2Dialog = ({ title, description, footerNote, footerActions, busy = false, width = 880, onClose, children }: V2DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = "hidden"
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      style={{ width: `min(${width}px, calc(100vw - 48px))` }}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
          onClose()
        }
      }}
    >
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className={styles.description}>
              {description}
            </p>
          ) : null}
        </div>
        <button type="button" className={styles.closeIcon} aria-label="닫기" disabled={busy} onClick={onClose}>
          <V2XIcon size={20} />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      <div className={styles.foot}>
        <p className={styles.footNote}>{footerNote}</p>
        <button type="button" className={v2ButtonClassName({ variant: "outline", size: "md" })} disabled={busy} onClick={onClose}>
          닫기
        </button>
        {footerActions}
      </div>
    </dialog>
  )
}
