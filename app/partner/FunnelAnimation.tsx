"use client"

import { useEffect, useMemo, useState } from "react"

import styles from "./partner.module.css"

const steps = ["신청", "확정", "완료", "등록"]

export default function FunnelAnimation() {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")

    if (mediaQuery.matches) {
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % steps.length)
    }, 1400)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const fillWidth = useMemo(() => {
    if (steps.length <= 1) {
      return "0%"
    }

    return `${(activeIndex / (steps.length - 1)) * 100}%`
  }, [activeIndex])

  return (
    <div className={styles.funnelCard}>
      <div className={styles.funnelHead}>
        <strong>체험수업 상태값 흐름</strong>
        <span>실시간 예시</span>
      </div>

      <div className={styles.funnelTrack}>
        <div className={styles.funnelLine}>
          <div className={styles.funnelLineFill} style={{ width: fillWidth }} />
        </div>

        <div className={styles.funnelSteps}>
          {steps.map((step, index) => {
            const stepClassName =
              index < activeIndex
                ? `${styles.funnelStep} ${styles.done}`
                : index === activeIndex
                  ? `${styles.funnelStep} ${styles.active}`
                  : styles.funnelStep

            return (
              <div className={stepClassName} key={step}>
                <div className={styles.node}>{index + 1}</div>
                <span>{step}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.funnelNote}>
        <span className={styles.funnelNoteIcon}>💡</span>
        <span>
          신청·확정·변경·취소·노쇼·완료·등록 - 7단계 상태값으로 체험수업 운영 전체를
          데이터로 남깁니다.
        </span>
      </div>
    </div>
  )
}
