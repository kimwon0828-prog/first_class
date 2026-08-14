"use client"

import { useEffect, useRef, useState } from "react"

import styles from "./partner.module.css"

type PartnerCopyButtonProps = {
  value: string
}

export default function PartnerCopyButton({ value }: PartnerCopyButtonProps) {
  const [label, setLabel] = useState("복사")
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard API가 없어도 시안과 동일한 완료 상태는 유지합니다.
    }

    setLabel("복사됨")

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      setLabel("복사")
      timeoutRef.current = null
    }, 1400)
  }

  return (
    <button type="button" className={styles.urlCopyButton} onClick={handleClick}>
      {label}
    </button>
  )
}
