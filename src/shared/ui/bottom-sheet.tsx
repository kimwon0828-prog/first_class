"use client"

import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

type BottomSheetProps = {
  manageFocus?: boolean
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function BottomSheet({ open, onClose, title, children, manageFocus = false }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !open) {
      setEntered(false)
      return
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const frameId = window.requestAnimationFrame(() => {
      setEntered(true)
      const focusTarget =
        sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? closeButtonRef.current
      focusTarget?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current()
      }
      if (manageFocus && event.key === "Tab") {
        const elements = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
          .filter((element) => element.getClientRects().length > 0)
        const first = elements[0]
        const last = elements[elements.length - 1]
        if (!first) { event.preventDefault(); sheetRef.current?.focus(); return }
        if (event.shiftKey && (document.activeElement === first || !sheetRef.current?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !sheetRef.current?.contains(document.activeElement))) {
          event.preventDefault(); first.focus()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = originalOverflow
      if (manageFocus && previousFocus?.isConnected) previousFocus.focus()
    }
  }, [mounted, open, manageFocus])

  if (!mounted || !open) {
    return null
  }

  return createPortal(
    <>
      <div
        className="firstclass-bottom-sheet__overlay"
        data-managed-focus={manageFocus || undefined}
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose()
          }
        }}
      >
        <div
          ref={sheetRef}
          tabIndex={-1}
          className={`firstclass-bottom-sheet__sheet${entered ? " is-open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="firstclass-bottom-sheet__header">
            <h2 className="firstclass-bottom-sheet__title">{title}</h2>
            <button
              ref={closeButtonRef}
              type="button"
              className="firstclass-bottom-sheet__close"
              aria-label="닫기"
              onClick={onClose}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="firstclass-bottom-sheet__content">{children}</div>
        </div>
      </div>

      <style jsx global>{`
        .firstclass-bottom-sheet__overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          background: rgba(0, 0, 0, 0.4);
        }

        .firstclass-bottom-sheet__sheet {
          position: fixed;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%) translateY(100%);
          width: 100%;
          max-width: var(--col);
          max-height: 70vh;
          background: var(--surface);
          border-radius: var(--r-lg) var(--r-lg) 0 0;
          padding-bottom: env(safe-area-inset-bottom);
          box-shadow: 0 -12px 32px rgba(17, 17, 17, 0.18);
          transition: transform 200ms ease-out;
          overflow: hidden;
        }

        .firstclass-bottom-sheet__sheet.is-open {
          transform: translateX(-50%) translateY(0);
        }

        .firstclass-bottom-sheet__header {
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 0 var(--gutter);
          border-bottom: 1px solid var(--border);
        }

        .firstclass-bottom-sheet__title {
          margin: 0;
          font-size: 16px;
          line-height: 1.4;
          font-weight: 700;
          color: var(--text-1);
        }

        .firstclass-bottom-sheet__close {
          width: 44px;
          height: 44px;
          margin-right: -14px;
          border: 0;
          background: transparent;
          color: var(--text-2);
          font-size: 20px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .firstclass-bottom-sheet__content {
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 8px;
        }

        .firstclass-bottom-sheet__overlay[data-managed-focus="true"] {
          z-index: 70;
          background: color-mix(in srgb, var(--neutral-950) 48%, transparent);
        }
        [data-managed-focus="true"] .firstclass-bottom-sheet__sheet {
          display: flex;
          flex-direction: column;
        }
        [data-managed-focus="true"] .firstclass-bottom-sheet__header { flex-shrink: 0; }
        [data-managed-focus="true"] .firstclass-bottom-sheet__content { min-height: 0; }
        [data-managed-focus="true"] .firstclass-bottom-sheet__title { font-size: var(--font-h3); line-height: 1.5; }
        @media (prefers-reduced-motion: reduce) {
          .firstclass-bottom-sheet__sheet {
            transition: none;
          }
        }
      `}</style>
    </>,
    document.body
  )
}
