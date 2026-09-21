"use client"
import { MyFrame } from "./my-frame"
import styles from "./page.module.css"
export default function MyError() {
  return <MyFrame><section className={styles.state} role="alert">
    <h2 className={styles.stateTitle}>마이페이지를 불러오지 못했어요.</h2>
    <p className={styles.stateText}>잠시 후 다시 시도해 주세요.</p>
    <button style={{ minHeight: 44, color: "var(--brand-700)", background: "transparent", border: 0, cursor: "pointer" }} onClick={() => window.location.reload()}>다시 시도</button>
  </section></MyFrame>
}
