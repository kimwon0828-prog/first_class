"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"

import styles from "./partner-v2.module.css"

const MONTHS = 6

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toNumber(value: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    return fallback
  }

  return clamp(parsed, min, max)
}

function formatAmount(value: number) {
  if (value >= 10000) {
    const eok = Math.floor(value / 10000)
    const rest = value % 10000

    return rest ? `${eok}억 ${rest.toLocaleString()}` : `${eok}억`
  }

  return value.toLocaleString()
}

export default function PartnerLossCalculator() {
  const [monthlyInquiries, setMonthlyInquiries] = useState("15")
  const [monthlyRegistrations, setMonthlyRegistrations] = useState("6")
  const [monthlyFee, setMonthlyFee] = useState("30")
  const [recontactRate, setRecontactRate] = useState("10")
  const [animatedAmount, setAnimatedAmount] = useState(0)

  const animationFrameRef = useRef<number | null>(null)
  const previousAmountRef = useRef(0)
  const reduceMotionRef = useRef(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updatePreference = () => {
      reduceMotionRef.current = mediaQuery.matches
    }

    updatePreference()
    mediaQuery.addEventListener("change", updatePreference)

    return () => {
      mediaQuery.removeEventListener("change", updatePreference)
    }
  }, [])

  const result = useMemo(() => {
    const inquiries = toNumber(monthlyInquiries, 15, 1, 300)
    const registrations = Math.min(toNumber(monthlyRegistrations, 6, 0, 300), inquiries)
    const fee = toNumber(monthlyFee, 30, 1, 500)
    const rate = toNumber(recontactRate, 10, 5, 25)

    const lostYearlyStudents = (inquiries - registrations) * 12
    const returningStudents = Math.round((lostYearlyStudents * rate) / 100)
    const expectedAmount = returningStudents * fee * MONTHS

    return {
      rate,
      lostYearlyStudents,
      returningStudents,
      expectedAmount
    }
  }, [monthlyFee, monthlyInquiries, monthlyRegistrations, recontactRate])

  useEffect(() => {
    const targetAmount = result.expectedAmount

    if (reduceMotionRef.current) {
      previousAmountRef.current = targetAmount
      setAnimatedAmount(targetAmount)
      return
    }

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current)
    }

    const startAmount = previousAmountRef.current
    const duration = 480
    let startTime: number | null = null

    const step = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp
      }

      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      const nextAmount = Math.round(startAmount + (targetAmount - startAmount) * eased)

      setAnimatedAmount(nextAmount)

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step)
        return
      }

      previousAmountRef.current = targetAmount
      animationFrameRef.current = null
    }

    animationFrameRef.current = window.requestAnimationFrame(step)

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [result.expectedAmount])

  const rangeFill = `${((result.rate - 5) / (25 - 5)) * 100}%`

  return (
    <div className={styles.calc}>
      <div className={styles.calcInputs}>
        <div className={styles.field}>
          <label htmlFor="partner-inquiries" className={styles.fieldLabel}>
            한 달에 받는 체험·상담 문의
          </label>
          <div className={styles.inputBox}>
            <input
              id="partner-inquiries"
              type="number"
              inputMode="numeric"
              min={1}
              max={300}
              value={monthlyInquiries}
              onChange={(event) => setMonthlyInquiries(event.target.value)}
              className={styles.tnum}
            />
            <span className={styles.inputUnit}>명</span>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="partner-registrations" className={styles.fieldLabel}>
            그중 실제로 등록하는 학생
          </label>
          <div className={styles.inputBox}>
            <input
              id="partner-registrations"
              type="number"
              inputMode="numeric"
              min={0}
              max={300}
              value={monthlyRegistrations}
              onChange={(event) => setMonthlyRegistrations(event.target.value)}
              className={styles.tnum}
            />
            <span className={styles.inputUnit}>명</span>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="partner-fee" className={styles.fieldLabel}>
            월 원비
          </label>
          <div className={styles.inputBox}>
            <input
              id="partner-fee"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              value={monthlyFee}
              onChange={(event) => setMonthlyFee(event.target.value)}
              className={styles.tnum}
            />
            <span className={styles.inputUnit}>만원</span>
          </div>
        </div>

        <div className={styles.slider}>
          <div className={styles.sliderLabel}>
            <label htmlFor="partner-rate">나중에 다시 연락했을 때 등록으로 이어지는 비율</label>
            <b className={`${styles.sliderValue} ${styles.tnum}`}>{result.rate}%</b>
          </div>
          <input
            id="partner-rate"
            type="range"
            min={5}
            max={25}
            step={1}
            value={recontactRate}
            onChange={(event) => setRecontactRate(event.target.value)}
            className={styles.range}
            style={{ "--fill": rangeFill } as CSSProperties}
          />
          <div className={styles.sliderEnds}>
            <span>5%</span>
            <span>25%</span>
          </div>
        </div>
      </div>

      <div className={styles.calcResult} aria-live="polite">
        <div className={styles.out}>
          <span className={styles.outLabel}>1년 동안 체험만 하고 등록하지 않은 학생</span>
          <b className={`${styles.outValue} ${styles.tnum}`}>{result.lostYearlyStudents.toLocaleString()}명</b>
        </div>

        <div className={styles.outDivider} />

        <div className={styles.out}>
          <span className={styles.outLabel}>이 중 {result.returningStudents}명이 다시 등록하면</span>
          <b className={`${styles.outValue} ${styles.outValueBrand} ${styles.tnum}`}>
            {formatAmount(animatedAmount)}만원
          </b>
          <p className={styles.outNote}>한 명이 6개월 다닌다고 봤을 때의 원비 합계예요</p>
        </div>

        <div className={styles.calcCta}>
          <a href="#apply" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`}>
            도입 상담 신청하기
          </a>
          <p className={styles.calcCtaNote}>체험·상담·등록 기록은 무료로 시작해요</p>
        </div>
      </div>
    </div>
  )
}
