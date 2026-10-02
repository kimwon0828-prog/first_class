"use client"

import { useEffect, useRef, useState } from "react"

function canPrepare() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return document.visibilityState === "visible" && !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType ?? "")
}
/** Upgrade Next's existing prefetch; never issue a second manual router.prefetch. */
export function useParentLinkPrefetch(href: string, idle = false) {
  const [preparedHref, setPreparedHref] = useState<string | null>(null)
  const intentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancel = () => { clearTimeout(intentTimer.current); intentTimer.current = undefined }
  // A quick tap navigates immediately; do not race it with a second full request.
  const prepare = () => {
    cancel()
    if (canPrepare()) intentTimer.current = setTimeout(() => { if (canPrepare()) setPreparedHref(href) }, 120)
  }
  useEffect(() => () => { clearTimeout(intentTimer.current) }, [href])
  useEffect(() => {
    if (!idle) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let idleId: number | undefined
    const schedule = () => {
      timer = setTimeout(() => {
        if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(() => { if (canPrepare()) setPreparedHref(href) })
        else if (canPrepare()) setPreparedHref(href)
      }, 2000)
    }
    if (document.readyState === "complete") schedule()
    else window.addEventListener("load", schedule, { once: true })
    return () => { clearTimeout(timer); if (idleId !== undefined) window.cancelIdleCallback(idleId); window.removeEventListener("load", schedule) }
  }, [href, idle])
  return { prefetch: preparedHref === href ? true as const : undefined, prepare, cancel }
}
