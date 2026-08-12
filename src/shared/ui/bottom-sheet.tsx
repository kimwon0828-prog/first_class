"use client"

import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !open) {
      setEntered(false)
      return
    }

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
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [mounted, onClose, open])

  if (!mounted || !open) {
    return null
  }

  return createPortal(
    <>
      <div
        className="firstclass-bottom-sheet__overlay"
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose()
          }
        }}
      >
        <div
          ref={sheetRef}
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
        }

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
