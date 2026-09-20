"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import styles from "./class-detail-disclosure.module.css"

export function DetailDisclosure({ title, closeTitle, children }: {
  title: string; closeTitle?: string; children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <div className={styles.disclosure}>
    <h3 className={styles.heading}>
      <button type="button" id={`${id}-trigger`} className={styles.trigger}
        aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        {open && closeTitle ? closeTitle : title}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={open ? styles.openIcon : undefined}>
          <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </h3>
    <div id={id} hidden={!open} aria-labelledby={`${id}-trigger`} className={styles.panel}>{children}</div>
  </div>
}

export function DetailIntroduction({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)
  const id = useId()
  useEffect(() => {
    const element = textRef.current
    if (!element || expanded) return
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, expanded])
  return <div>
    <p id={id} ref={textRef} className={`${styles.introduction} ${expanded ? "" : styles.clamped}`}>{text}</p>
    {overflows ? <button type="button" className={styles.expandButton} aria-expanded={expanded}
      aria-controls={id} onClick={() => setExpanded((value) => !value)}>{expanded ? "접기" : "더보기"}</button> : null}
  </div>
}
