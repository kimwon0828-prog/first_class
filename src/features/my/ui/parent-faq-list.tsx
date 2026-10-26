"use client"

import { useState } from "react"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { PARENT_FAQ } from "../lib/parent-faq"
import styles from "./parent-faq.module.css"

/** 앱 my/faq: 질문을 누르면 펼친다. 한 번에 하나만 펼친다. */
export function ParentFaqList() {
  const [open, setOpen] = useState<string | null>(null)
  return <div>{PARENT_FAQ.map((item, index) => {
    const expanded = open === item.q
    return <div key={item.q} className={styles.item}>
      <button type="button" className={styles.question} aria-expanded={expanded} aria-controls={`faq-${index}`} onClick={() => setOpen(value => value === item.q ? null : item.q)}>
        <span className={ui.subtitle}>{item.q}</span><AppIcon name={expanded ? "chevron-up" : "chevron-down"} size={18} />
      </button>
      {expanded ? <p id={`faq-${index}`} className={styles.answer}>{item.a}</p> : null}
    </div>
  })}</div>
}
