"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { PHONE_MESSAGES, normalizeParentMobile, phoneReturnTo } from "../phone/contracts"
import styles from "./phone-verification.module.css"
export function PhoneVerification({ returnTo, unavailable = false, initialPhone = "", initialChallenge = null, retryAfter = 0 }: { returnTo: string; unavailable?: boolean; initialPhone?: string; initialChallenge?: string | null; retryAfter?: number }) {
  const router = useRouter()
  const [phone, setPhone] = useState(initialPhone)
  const [code, setCode] = useState("")
  const [challenge, setChallenge] = useState<string | null>(initialChallenge)
  const [cooldown, setCooldown] = useState(retryAfter)
  const [status, setStatus] = useState(unavailable ? "unavailable" : "")
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  useEffect(() => {
    const timer = setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [])
  async function submit(action: "send" | "verify") {
    if (busy.current) return
    busy.current = true; setPending(true)
    try {
      const result = await fetch("/api/auth/parent-phone", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, phone, code, challengeId: challenge, returnTo: phoneReturnTo(returnTo) }) })
      const data = await result.json()
      setStatus(PHONE_MESSAGES[data.status] ? data.status : "unavailable")
      if (typeof data.retryAfter === "number") setCooldown(Math.max(0, data.retryAfter))
      if (data.status === "sent") { setChallenge(data.challengeId); setCode("") }
      if (["expired", "used", "attempts_exceeded", "duplicate_phone"].includes(data.status)) setChallenge(null)
      if (data.status === "verified") { router.replace(data.next); router.refresh() }
    } catch { setStatus("unavailable") }
    finally { busy.current = false; setPending(false) }
  }
  function verify(event: FormEvent) { event.preventDefault(); void submit("verify") }
  return <div className={styles.form} aria-busy={pending}>
    <form onSubmit={event => { event.preventDefault(); void submit("send") }} className={styles.form}>
      <label htmlFor="parent-phone">휴대폰 번호</label>
      <input id="parent-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="010-1234-5678" maxLength={20}
        value={phone} disabled={pending} onChange={event => { setPhone(event.target.value); setChallenge(null); setCode(""); setStatus("") }} />
      <button type="submit" disabled={pending || cooldown > 0 || !normalizeParentMobile(phone)}>{cooldown > 0 ? `${cooldown}초 후 재전송` : challenge ? "인증번호 다시 받기" : "인증번호 받기"}</button>
    </form>
    {challenge ? <form onSubmit={verify} className={styles.form}>
      <label htmlFor="parent-otp">6자리 인증번호</label>
      <input id="parent-otp" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
        value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} disabled={pending} />
      <button type="submit" disabled={pending || !/^\d{6}$/.test(code)}>확인</button>
    </form> : null}
    {status ? <p role={status === "sent" || status === "verified" ? "status" : "alert"}>{PHONE_MESSAGES[status]}</p> : null}
    {status === "duplicate_phone" ? <>
      <form action="/auth/sign-out" method="post"><input type="hidden" name="returnTo" value={phoneReturnTo(returnTo)} /><button className={styles.secondary}>기존 카카오 계정으로 로그인</button></form>
      <button className={styles.secondary} onClick={() => { setPhone(""); setCode(""); setStatus(""); setChallenge(null) }}>다른 번호 인증</button>
    </> : null}
  </div>
}
