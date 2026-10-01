import type { ReactNode } from "react"
import { ParentBackLink } from "./parent-back-link"
import styles from "./parent-header.module.css"

type Props = {
  title?: string
  brand?: ReactNode
  actions?: ReactNode
  backHref?: string
  backLabel?: string
  inset?: boolean
  sticky?: boolean
}
/** Shared web chrome only: page titles, search and child context remain in the body. */
export function ParentHeader({ title, brand, actions, backHref, backLabel = "뒤로가기", inset, sticky }: Props) {
  return <header data-parent-header={brand ? "home" : backHref ? "detail" : "root"}
    className={`${styles.header} ${inset ? styles.inset : ""} ${sticky ? styles.sticky : ""}`}>
    {backHref ? <ParentBackLink href={backHref} label={backLabel} className={styles.back}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
    </ParentBackLink> : null}
    {brand ? <div className={styles.brand}>{brand}</div> : <h1 className={styles.title} title={title}>{title}</h1>}
    {actions ? <div className={styles.actions}>{actions}</div> : null}
  </header>
}
