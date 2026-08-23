"use client"

import Link from "next/link"
import { useState } from "react"

import { PARTNER_INQUIRY_HONEYPOT_FIELD } from "@/features/partner/lib/partner-inquiry"

import styles from "./partner.module.css"

type SubmitStatus = "idle" | "success" | "error"

const INITIAL_FORM = {
  academyName: "",
  phone: "",
  privacyAgreed: false,
  honeypot: ""
}

export default function PartnerInquiryForm() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<SubmitStatus>("idle")
  const [message, setMessage] = useState("")

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSubmitting || !form.privacyAgreed) {
      return
    }

    setIsSubmitting(true)
    setStatus("idle")
    setMessage("")

    try {
      const response = await fetch("/api/partner-inquiry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          academyName: form.academyName,
          phone: form.phone,
          privacyAgreed: form.privacyAgreed,
          [PARTNER_INQUIRY_HONEYPOT_FIELD]: form.honeypot
        })
      })

      const data = (await response.json().catch(() => null)) as
        | { status?: "success" | "error"; message?: string }
        | null

      if (!response.ok || data?.status !== "success") {
        setStatus("error")
        setMessage(data?.message ?? "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
        return
      }

      setForm(INITIAL_FORM)
      setStatus("success")
      setMessage("문의가 접수되었습니다. 확인 후 빠르게 연락드리겠습니다.")
    } catch {
      setStatus("error")
      setMessage("문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className={styles.partnerInquiryForm} onSubmit={handleSubmit}>
      <div className={styles.ff}>
        <label htmlFor="partner-academy-name">학원명</label>
        <input
          id="partner-academy-name"
          type="text"
          name="academyName"
          value={form.academyName}
          onChange={(event) => setForm((current) => ({ ...current, academyName: event.target.value }))}
          placeholder="예) 은행사거리 ○○수학"
          disabled={isSubmitting}
          autoComplete="organization"
          maxLength={100}
        />
      </div>

      <div className={styles.ff}>
        <label htmlFor="partner-phone">연락처</label>
        <input
          id="partner-phone"
          type="tel"
          name="phone"
          value={form.phone}
          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          placeholder="예) 010-1234-5678"
          disabled={isSubmitting}
          autoComplete="tel"
          inputMode="tel"
          maxLength={30}
        />
      </div>

      <div className={styles.partnerHoneypot} aria-hidden="true">
        <label htmlFor="partner-website">웹사이트</label>
        <input
          id="partner-website"
          type="text"
          name={PARTNER_INQUIRY_HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          value={form.honeypot}
          onChange={(event) => setForm((current) => ({ ...current, honeypot: event.target.value }))}
        />
      </div>

      <label className={styles.consentRow} htmlFor="partner-consent">
        <input
          id="partner-consent"
          type="checkbox"
          checked={form.privacyAgreed}
          onChange={(event) => setForm((current) => ({ ...current, privacyAgreed: event.target.checked }))}
          disabled={isSubmitting}
        />
        <span>
          <Link href="/terms" target="_blank" rel="noreferrer">
            이용약관
          </Link>
          {" / "}
          <Link href="/privacy" target="_blank" rel="noreferrer">
            개인정보처리방침
          </Link>
          {" 동의 (필수)"}
        </span>
      </label>

      <button
        type="submit"
        className={`${styles.btn} ${styles.btnBlk} ${
          form.privacyAgreed ? styles.partnerInquirySubmitEnabled : ""
        }`}
        disabled={isSubmitting || !form.privacyAgreed}
      >
        {isSubmitting ? "문의 접수 중..." : "문의하기"}
      </button>

      {message ? (
        <p
          className={`${styles.partnerInquiryStatus} ${
            status === "success" ? styles.partnerInquiryStatusSuccess : styles.partnerInquiryStatusError
          }`}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}

      <p className={styles.fnote}>개인정보는 파일럿 상담 목적으로만 사용하고, 종료 후 폐기합니다.</p>
    </form>
  )
}
