"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  CONVERSION_INFOGRAPHIC_HEIGHT,
  CONVERSION_INFOGRAPHIC_WIDTH,
  type ConversionInfographicModel
} from "@/features/reports/lib/conversion-infographic-model"
import { ConversionInfographic } from "@/features/reports/ui/conversion-infographic"

import styles from "./conversion-infographic-launcher.module.css"

// 성과 분석에서 리포트를 여는 진입점.
//
// 서버는 집계된 표시 모델만 넘긴다. 학생·상담 원본 데이터는 오지 않는다.
// 미리보기는 원본 리포트를 축소해서 보여줄 뿐이고, 저장은 원본 크기로 한다.

type ConversionInfographicLauncherProps = {
  model: ConversionInfographicModel
}

export const ConversionInfographicLauncher = ({
  model
}: ConversionInfographicLauncherProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [scale, setScale] = useState(1)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const reportRef = useRef<HTMLDivElement | null>(null)

  // 화면 폭·높이에 맞춰 축소 비율을 정한다. 확대는 하지 않는다.
  const updateScale = useCallback(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }

    const availableWidth = stage.clientWidth - 48
    const availableHeight = stage.clientHeight - 48
    const next = Math.min(
      1,
      availableWidth / CONVERSION_INFOGRAPHIC_WIDTH,
      availableHeight / CONVERSION_INFOGRAPHIC_HEIGHT
    )
    setScale(next > 0 ? next : 1)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    updateScale()
    window.addEventListener("resize", updateScale)
    return () => window.removeEventListener("resize", updateScale)
  }, [isOpen, updateScale])

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setIsOpen(true)}>
        인포그래픽
      </button>

      {isOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="등록전환 리포트">
          <div className={styles.bar}>
            <h2 className={styles.barTitle}>등록전환 리포트</h2>
            <div className={styles.barActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setIsOpen(false)}
              >
                닫기
              </button>
            </div>
          </div>

          <div className={styles.stage} ref={stageRef}>
            <div
              className={styles.scaler}
              style={{
                transform: `scale(${scale})`,
                width: CONVERSION_INFOGRAPHIC_WIDTH,
                height: CONVERSION_INFOGRAPHIC_HEIGHT * scale
              }}
            >
              <ConversionInfographic model={model} captureRef={reportRef} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
