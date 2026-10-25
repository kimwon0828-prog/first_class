"use client"

import { useState } from "react"
import { setAcademyNewsConsentAction } from "@/features/marketing-consent/actions/set-academy-news-consent"
import { MARKETING_CONSENT_LABEL, MARKETING_CONSENT_TEXT_VERSION, type MarketingConsentState } from "@/features/marketing-consent/lib/marketing-consent"
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import styles from "./academy-news-settings.module.css"

// 앱 my/academy-news.tsx: 스위치 하나 + 동의·철회 날짜. 저장은 기존 action(source parent_web 은 action 이 붙인다).
const dateLabel = (value: string | null) => {
  const parts = value ? getSeoulDateTimeParts(value) : null
  return parts ? `${parts.year}년 ${parts.month}월 ${parts.day}일` : ""
}

export function AcademyNewsSettings({ initial }: { initial: MarketingConsentState }) {
  const [consent, setConsent] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function toggle(next: boolean) {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const result = await setAcademyNewsConsentAction({ consented: next, textVersion: MARKETING_CONSENT_TEXT_VERSION })
      if (result.ok) setConsent(result.data)
      else setError(result.message)
    } catch {
      setError("잠시 후 다시 시도해 주세요.")
    } finally {
      setBusy(false)
    }
  }
  const sub = consent.consented ? `${dateLabel(consent.consentedAt)} 동의`.trim()
    : consent.withdrawnAt ? `${dateLabel(consent.withdrawnAt)} 수신 거부`.trim() : "받지 않음"
  return <>
    <div className={styles.row}>
      <div className={styles.text}>
        <p className={ui.subtitle} id="academy-news-label">{MARKETING_CONSENT_LABEL}</p>
        {sub ? <p className={ui.caption}>{sub}</p> : null}
      </div>
      <button type="button" role="switch" className={styles.switch} aria-checked={consent.consented} aria-labelledby="academy-news-label" aria-busy={busy}
        disabled={busy} onClick={() => void toggle(!consent.consented)}><span className={styles.knob} /></button>
    </div>
    {error ? <p className={`${ui.error} ${styles.error}`} role="alert">{error}</p> : null}
  </>
}
