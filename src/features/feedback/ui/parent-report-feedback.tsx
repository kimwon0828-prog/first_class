"use client"

import { useEffect, useRef, useState } from "react"
import type { MyParentDecisionResult } from "@/features/decisions/queries/get-my-current-parent-decision"
import type { ParentFeedbackResult } from "../lib/experience-feedback"
import { ParentFeedbackForm } from "./parent-feedback-form"
import styles from "./parent-report-feedback.module.css"

export function ParentReportFeedback({ applicationId, result, decisionResult, showDecision }: {
  applicationId: string
  result: ParentFeedbackResult
  decisionResult: MyParentDecisionResult
  showDecision: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const complete = result.status === "ok" && Boolean(result.context.feedback) &&
    decisionResult.status === "ok" && Boolean(decisionResult.decision)
  const titleId = `report-feedback-title-${applicationId}`

  useEffect(() => {
    // Existing reminder links keep their fixed anchor and now open the same input window.
    const openFromHash = () => {
      if (window.location.hash === "#experience-feedback") setOpen(true)
    }
    openFromHash()
    window.addEventListener("hashchange", openFromHash)
    return () => window.removeEventListener("hashchange", openFromHash)
  }, [])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const trigger = triggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialog?.showModal()
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
      trigger?.focus({ preventScroll: true })
    }
  }, [open])

  return <>
    <div className={styles.clearance} aria-hidden="true" />
    <div id="experience-feedback" tabIndex={-1} className={styles.launch} aria-label="학부모 체험 피드백">
      <button ref={triggerRef} type="button" className={styles.primary} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {complete ? "보낸 의견 보기" : "체험 의견 남기기"}
      </button>
    </div>
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} onCancel={event => {
      event.preventDefault()
      if (!pending) setOpen(false)
    }}>
      <header className={styles.header}>
        <h2 id={titleId}>{complete ? "보낸 체험 의견" : "체험 의견 남기기"}</h2>
        <button type="button" className={styles.close} aria-label="의견 창 닫기" disabled={pending} onClick={() => setOpen(false)}>×</button>
      </header>
      <ParentFeedbackForm applicationId={applicationId} result={result} decisionResult={decisionResult}
        showDecision={showDecision} showTitle={false} presentation="dialog" onPendingChange={setPending} />
    </dialog>
  </>
}
