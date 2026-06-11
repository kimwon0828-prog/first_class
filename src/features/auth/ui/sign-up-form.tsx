"use client"

import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"

import { ensureParentProfileAfterAuthAction } from "@/features/auth/actions/sign-in"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import styles from "./sign-up-form.module.css"

type SignUpFormProps = {
  returnTo?: string
}

export const SignUpForm = ({ returnTo }: SignUpFormProps) => {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  const [agreeToPrivacy, setAgreeToPrivacy] = useState(false)
  const [agreeToMarketing, setAgreeToMarketing] = useState(false)
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<"idle" | "pending" | "error" | "needs_email_confirm">("idle")
  const isPending = status === "pending"
  const signInHref = returnTo
    ? `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : "/auth/sign-in"

  useEffect(() => {
    setMessage("")
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) {
      return
    }

    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    const normalizedEmail = email.trim().toLowerCase()

    if (trimmedName.length < 2) {
      setStatus("error")
      setMessage("보호자명은 2자 이상 입력해 주세요.")
      return
    }

    if (trimmedPhone.length < 8) {
      setStatus("error")
      setMessage("보호자 연락처를 올바르게 입력해 주세요.")
      return
    }

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setStatus("error")
      setMessage("올바른 이메일을 입력해 주세요.")
      return
    }

    if (password.length < 8) {
      setStatus("error")
      setMessage("비밀번호는 8자 이상이어야 합니다.")
      return
    }

    if (password !== passwordConfirm) {
      setStatus("error")
      setMessage("비밀번호 확인이 일치하지 않습니다.")
      return
    }

    if (!agreeToTerms) {
      setStatus("error")
      setMessage("서비스 이용약관 동의가 필요합니다.")
      return
    }

    if (!agreeToPrivacy) {
      setStatus("error")
      setMessage("개인정보 수집 및 이용 동의가 필요합니다.")
      return
    }

    setStatus("pending")
    setMessage("")

    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name: trimmedName,
            phone: trimmedPhone,
            agreed_to_terms: agreeToTerms,
            agreed_to_privacy: agreeToPrivacy,
            agreed_to_marketing: agreeToMarketing,
            signup_intent: "parent_public",
            role: "parent"
          }
        }
      })

      if (error) {
        setStatus("error")
        setMessage("회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.")
        return
      }

      if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
        console.log("[auth cookies after login]", document.cookie)
      }

      if (!data.session) {
        setStatus("needs_email_confirm")
        setMessage("이메일 인증 후 로그인해 주세요. 첫 로그인 시 프로필이 자동으로 생성됩니다.")
        return
      }

      const ensured = await ensureParentProfileAfterAuthAction(trimmedName, trimmedPhone)
      const target =
        returnTo && ensured.role === "parent"
          ? returnTo
          : ensured.role === "parent"
            ? "/classes"
            : "/studio"
      window.location.href = target
    } catch (caught) {
      setStatus("error")
      setMessage(caught instanceof Error ? caught.message : "회원가입 처리 중 오류가 발생했습니다.")
    } finally {
      setStatus((current) => (current === "pending" ? "idle" : current))
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <section className={styles.card} aria-label="회원가입 정보 입력">
        <div className={styles.fieldStack}>
          <label className={styles.field}>
            <span className={styles.label}>이메일</span>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              disabled={isPending}
              className={styles.input}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>비밀번호</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              disabled={isPending}
              className={styles.input}
              placeholder="8자 이상"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>비밀번호 확인</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              disabled={isPending}
              className={styles.input}
              placeholder="비밀번호를 한 번 더 입력해 주세요"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>보호자명</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={30}
              disabled={isPending}
              className={styles.input}
              placeholder="보호자 이름"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>보호자 연락처</span>
            <input
              type="tel"
              required
              minLength={8}
              maxLength={20}
              autoComplete="tel"
              placeholder="010-0000-0000"
              disabled={isPending}
              className={styles.input}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
        </div>

        <div className={styles.agreementStack}>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              value="yes"
              required
              disabled={isPending}
              className={styles.checkbox}
              checked={agreeToTerms}
              onChange={(event) => setAgreeToTerms(event.target.checked)}
            />
            <span className={styles.checkText}>서비스 이용약관에 동의합니다. (필수)</span>
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              value="yes"
              required
              disabled={isPending}
              className={styles.checkbox}
              checked={agreeToPrivacy}
              onChange={(event) => setAgreeToPrivacy(event.target.checked)}
            />
            <span className={styles.checkText}>개인정보 수집 및 이용에 동의합니다. (필수)</span>
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              value="yes"
              disabled={isPending}
              className={styles.checkbox}
              checked={agreeToMarketing}
              onChange={(event) => setAgreeToMarketing(event.target.checked)}
            />
            <span className={styles.checkText}>마케팅 정보 수신에 동의합니다. (선택)</span>
          </label>
        </div>

        <p className={styles.helperText}>
          자녀 정보는 가입 후 마이페이지의 자녀 관리에서 등록하거나, 첫수업 신청 과정에서 직접 입력할 수 있어요.
        </p>

        {message ? (
          <p
            className={`${styles.message} ${status === "error" ? styles.errorMessage : styles.infoMessage}`}
          >
            {message}
          </p>
        ) : null}

        <div className={styles.loginRow}>
          이미 계정이 있으신가요?{" "}
          <Link href={signInHref} className={styles.loginLink}>
            로그인
          </Link>
        </div>
      </section>

      <div className={styles.fixedBar}>
        <div className={styles.fixedBarInner}>
          <button type="submit" disabled={isPending} className={styles.submitButton}>
            {isPending ? "가입 처리 중..." : "회원가입"}
          </button>
        </div>
      </div>
    </form>
  )
}
