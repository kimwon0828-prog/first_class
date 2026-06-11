"use client"

import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"

import { ensureParentProfileAfterAuthAction } from "@/features/auth/actions/sign-in"
import { createSupabaseBrowserClient } from "@/integrations/supabase/client"
import styles from "@/features/auth/ui/sign-in-form.module.css"

type SignInFormProps = {
  returnTo?: string
}

export const SignInForm = ({ returnTo }: SignInFormProps) => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle")
  const isPending = status === "pending"
  const signUpHref = returnTo
    ? `/auth/sign-up?returnTo=${encodeURIComponent(returnTo)}`
    : "/auth/sign-up"

  useEffect(() => {
    setMessage("")
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) {
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setStatus("error")
      setMessage("올바른 이메일을 입력해 주세요.")
      return
    }

    if (!password) {
      setStatus("error")
      setMessage("비밀번호를 입력해 주세요.")
      return
    }

    setStatus("pending")
    setMessage("")

    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      })

      if (error || !data.user) {
        setStatus("error")
        setMessage("이메일 또는 비밀번호를 확인해 주세요.")
        return
      }

      console.log("[after login cookie]", {
        hasSbCookie: document.cookie.includes("sb-"),
        cookieLength: document.cookie.length
      })
      const { data: sessionData } = await supabase.auth.getSession()
      console.log("[after login session]", {
        hasSession: Boolean(sessionData.session),
        userId: sessionData.session?.user?.id ?? null
      })

      const ensured = await ensureParentProfileAfterAuthAction()
      const target =
        returnTo && ensured.role === "parent"
          ? returnTo
          : ensured.role === "parent"
            ? "/classes"
            : "/studio"

      window.location.href = target
    } catch (caught) {
      setStatus("error")
      setMessage(caught instanceof Error ? caught.message : "로그인 처리 중 오류가 발생했습니다.")
    } finally {
      setStatus((current) => (current === "pending" ? "idle" : current))
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>아이디</span>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder=""
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
          autoComplete="current-password"
          disabled={isPending}
          className={styles.input}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {message ? (
        <p className={status === "error" ? styles.errorMessage : styles.infoMessage}>{message}</p>
      ) : null}

      <div className={styles.links}>
        <Link href="/auth/find-email">이메일 찾기</Link>
        <span className={styles.separator}>|</span>
        <Link href="/auth/reset-password">비밀번호 찾기</Link>
        <span className={styles.separator}>|</span>
        <Link href={signUpHref}>회원가입</Link>
      </div>

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "로그인 중..." : "로그인"}
      </button>

      <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "#6b7280" }}>
        선생님/학원 관리자이신가요?{" "}
        <Link href="/studio/sign-in" style={{ color: "#2563eb", textDecoration: "none" }}>
          선생님 로그인
        </Link>
      </div>
    </form>
  )
}
