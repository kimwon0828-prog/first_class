"use client"

import { useEffect, useState } from "react"
import { useParentKeyboard } from "./use-parent-keyboard"

export function useParentNavVisibility(pathname: string) {
  const { keyboard, height } = useParentKeyboard()
  const [scrollHidden, setScrollHidden] = useState(false)
  useEffect(() => {
    if (!keyboard) return
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      // Sheets own their internal scrolling. Inline forms use the visible viewport.
      if (!(active instanceof HTMLElement) || active.closest('[role="dialog"], dialog')) return
      const bounds = active.getBoundingClientRect()
      const top = window.visualViewport?.offsetTop ?? 0
      if (bounds.bottom > top + height - 16) window.scrollBy(0, bounds.bottom - top - height + 16)
      else if (bounds.top < top + 16) window.scrollBy(0, bounds.top - top - 16)
    })
    return () => cancelAnimationFrame(frame)
  }, [keyboard, height])

  useEffect(() => {
    setScrollHidden(false)
    if (!/^\/classes\/[^/]+\/?$/.test(pathname)) return
    let lastY = Math.max(0, window.scrollY)
    let travel = 0
    const onScroll = () => {
      const y = Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight))
      const delta = y - lastY
      lastY = y
      if (y <= 16) { travel = 0; setScrollHidden(false); return }
      if (!delta) return
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta
      if (Math.abs(travel) < 12) return
      setScrollHidden(travel > 0)
      travel = 0
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [pathname])
  return { hidden: keyboard || scrollHidden, keyboard }
}
