"use client"
import type { ReactNode } from "react"
/** Open native disclosures before moving focus to an existing in-page action. */
export function StudioSectionLink({ target, className, children }: { target: string; className?: string; children: ReactNode }) {
  return <a href={`#${target}`} className={className} onClick={event => {
    const section = document.getElementById(target)
    if (!section) return
    event.preventDefault()
    if (section instanceof HTMLDetailsElement) section.open = true
    section.scrollIntoView({ block: "nearest", behavior: "auto" })
    section.querySelector<HTMLElement>("summary, button, select, input")?.focus()
  }}>{children}</a>
}
