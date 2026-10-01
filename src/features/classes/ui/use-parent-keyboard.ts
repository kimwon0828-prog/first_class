"use client"

import { useEffect, useState } from "react"

const emptyViewport = { keyboard: false, height: 0, bottom: 0 }

export function isKeyboardEditable(element: Element | null) {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable) return true
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled
  return element instanceof HTMLInputElement && !element.readOnly && !element.disabled &&
    !["button", "submit", "reset", "checkbox", "radio", "file", "range", "color", "hidden"].includes(element.type)
}

/** Focus + substantial viewport shrink; address-bar motion and pinch zoom are not keyboards. */
export function useParentKeyboard(enabled = true) {
  const [viewport, setViewport] = useState(emptyViewport)
  useEffect(() => {
    if (!enabled) { setViewport(emptyViewport); return }
    const visual = window.visualViewport
    let baseline = window.innerHeight
    let width = window.innerWidth
    let frame = 0
    const measure = () => {
      if (width !== window.innerWidth) { width = window.innerWidth; baseline = window.innerHeight }
      const editable = isKeyboardEditable(document.activeElement)
      baseline = Math.max(baseline, window.innerHeight)
      const height = visual?.height ?? window.innerHeight
      const keyboard = editable && (window.innerWidth <= 768 || window.matchMedia("(pointer: coarse)").matches) &&
        baseline - height * (visual?.scale ?? 1) > 120
      const next = { keyboard, height, bottom: keyboard ? Math.max(0, window.innerHeight - height - (visual?.offsetTop ?? 0)) : 0 }
      setViewport(previous => previous.keyboard === next.keyboard && previous.height === next.height && previous.bottom === next.bottom ? previous : next)
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    measure()
    visual?.addEventListener("resize", schedule)
    visual?.addEventListener("scroll", schedule)
    window.addEventListener("resize", schedule)
    document.addEventListener("focusin", schedule)
    document.addEventListener("focusout", schedule)
    return () => {
      cancelAnimationFrame(frame)
      visual?.removeEventListener("resize", schedule)
      visual?.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      document.removeEventListener("focusin", schedule)
      document.removeEventListener("focusout", schedule)
    }
  }, [enabled])
  return viewport
}
