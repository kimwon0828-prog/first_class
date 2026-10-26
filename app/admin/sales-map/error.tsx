"use client"

import styles from "./sales-map.module.css"

export default function AdminSalesMapError({ reset }: { reset: () => void }) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={styles.alert} role="alert">
          <p className={styles.alertTitle}>영업 지도를 불러오지 못했습니다.</p>
          <p className={styles.alertDescription}>잠시 후 다시 시도해 주세요.</p>
        </section>
        <button type="button" className={styles.buttonSecondary} onClick={reset}>
          다시 시도
        </button>
      </div>
    </div>
  )
}
