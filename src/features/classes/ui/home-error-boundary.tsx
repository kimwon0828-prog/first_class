"use client"

import Link from "next/link"
import { Component, type ReactNode } from "react"
import styles from "../../../../app/page.module.css"

/** Page-local Parent boundary, reused by Home and Classes without a root route boundary. */
export class HomeErrorBoundary extends Component<{ children: ReactNode; title?: string }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className={styles.page} data-parent-design="v1">
        <div className={styles.shell}>
          <h1 className={styles.sectionHeadingTitle}>{this.props.title ?? "홈을 불러오지 못했어요"}</h1>
          <p className={styles.contextDescription}>잠시 후 다시 시도해 주세요.</p>
          <button className={styles.primaryAction} onClick={() => window.location.reload()}>다시 시도</button>
          <Link className={styles.textLink} href="/classes">수업 둘러보기</Link>
        </div>
      </main>
    )
  }
}
