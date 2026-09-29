"use client"

import { useEffect } from "react"
import { markReportViewed } from "../actions/mark-report-viewed"

export function ReportViewTracker({ reportId }: { reportId: string }) {
  useEffect(() => {
    let sent = false
    const record = () => {
      // Prefetched RSC never mounts this effect. Background tabs wait until visible.
      if (sent || document.visibilityState !== "visible") return
      sent = true
      void markReportViewed(reportId).catch(() => false)
    }
    record()
    // App Router's sticky-header scroll handling can leave hash navigation at top.
    // Resolve only this fixed, local anchor once the actual report DOM has mounted.
    const focusFeedback = () => {
      if (window.location.hash !== "#experience-feedback") return
      const section = document.getElementById("experience-feedback")
      section?.scrollIntoView({ block: "start" })
      section?.focus({ preventScroll: true })
    }
    const frame = requestAnimationFrame(focusFeedback)
    window.addEventListener("hashchange", focusFeedback)
    document.addEventListener("visibilitychange", record)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("hashchange", focusFeedback)
      document.removeEventListener("visibilitychange", record)
    }
  }, [reportId])
  return null
}
