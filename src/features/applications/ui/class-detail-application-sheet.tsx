"use client"

import { useParentKeyboard } from "@/features/classes/ui/use-parent-keyboard"
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { clearTrialApplicationDraft, getTrialApplicationDraft } from "@/features/applications/lib/trial-application-draft"
import { isBookablePublicSlot } from "@/features/applications/lib/public-class-slots"
import { appDateLabel, appTimeLabel } from "@/features/classes/lib/app-presentation"
import { AppButton, AppButtonLink } from "@/features/classes/ui/parent-app-ui"
import ui from "@/features/classes/ui/parent-app-ui.module.css"

import { useDetailChosenSlot } from "./class-detail-booking"
import { TrialApplicationSteps, type Step, type TrialApplicationStepsProps } from "./trial-application-steps"
import styles from "./trial-application-steps.module.css"

type ClassDetailApplicationSheetProps = Omit<TrialApplicationStepsProps, "mode" | "initialStep" | "initialOptionId" | "onClose" | "summary"> & {
  secondaryAction?: ReactNode
  retryHref: string
}

/** 수업 상세 하단 신청 바 + 신청 시트(앱 classes/[id] 의 floatingAction + ApplicationSheet). */
export function ClassDetailApplicationSheet({ secondaryAction, retryHref, ...steps }: ClassDetailApplicationSheetProps) {
  const dialogId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<{ step: Step; optionId?: string } | null>(null)
  const viewport = useParentKeyboard(Boolean(open))
  const { chosen, available } = useDetailChosenSlot()
  const { classId, availableSlots, hasSession, isParentUser, slotsError, submitLabel, now } = steps

  useEffect(() => {
    if (!open || !viewport.keyboard) return
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      if (active instanceof HTMLElement && dialogRef.current?.contains(active)) active.scrollIntoView({ block: "nearest" })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, viewport.keyboard, viewport.height, viewport.bottom])

  // 로그인하고 돌아오면 고른 일정으로 2단계부터 이어 간다(기존 초안 보관 그대로).
  useEffect(() => {
    const draft = getTrialApplicationDraft(classId)
    if (!draft || !hasSession || !isParentUser) return
    const restored = availableSlots.find(slot => slot.optionId === draft.selectedScheduleOptionId && isBookablePublicSlot(slot, Date.now()))
    if (!restored) { clearTrialApplicationDraft(); return }
    setOpen({ step: 2, optionId: restored.optionId })
  }, [availableSlots, classId, hasSession, isParentUser])

  const isOpen = Boolean(open)
  useEffect(() => {
    if (!isOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : ctaRef.current
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus())
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])
          .filter(element => element.getClientRects().length > 0)
        const first = controls[0], last = controls[controls.length - 1]
        if (!first) { event.preventDefault(); dialogRef.current?.focus(); return }
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
      }
      if (event.key === "Escape") setOpen(null)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = overflow
      if (previousFocus?.isConnected) previousFocus.focus()
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  return <>
    <div className={ui.footer} data-parent-action-dock role="group" aria-label="수업 신청 및 관심수업">
      <div className={ui.footerRow}>
        {secondaryAction}
        {slotsError ? <AppButtonLink href={retryHref}>일정 다시 불러오기</AppButtonLink>
          : <AppButton ref={ctaRef} onClick={() => setOpen({ step: 1, optionId: chosen?.optionId })} disabled={!available.length}
            aria-haspopup="dialog" aria-expanded={isOpen} aria-controls={dialogId}
            caption={chosen ? `${appDateLabel(chosen.startAt)} ${appTimeLabel(chosen.startAt)}` : null}>
            {available.length ? submitLabel : "예약 가능한 일정이 없어요"}
          </AppButton>}
      </div>
    </div>

    {open ? <>
      <div className={styles.scrim} onClick={() => setOpen(null)} aria-hidden="true" />
      <div className={styles.sheet} ref={dialogRef} id={dialogId} tabIndex={-1} role="dialog" aria-modal="true" aria-label="체험수업 신청"
        data-keyboard={viewport.keyboard || undefined}
        style={viewport.keyboard ? { "--application-visible-height": `${viewport.height}px`, "--application-keyboard-offset": `${viewport.bottom}px` } as CSSProperties : undefined}>
        <TrialApplicationSteps {...steps} mode="sheet" now={now} initialStep={open.step} initialOptionId={open.optionId} onClose={() => setOpen(null)} />
      </div>
    </> : null}
  </>
}
