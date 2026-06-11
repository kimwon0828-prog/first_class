"use client"

import Link from "next/link"
import { useActionState, useEffect } from "react"

import {
  signInAction,
  type SignInActionState
} from "@/features/auth/actions/sign-in"
import styles from "@/features/auth/ui/sign-in-form.module.css"

const initialState: SignInActionState = {
  status: "idle",
  message: ""
}

type SignInFormProps = {
  returnTo?: string
}

export const SignInForm = ({ returnTo }: SignInFormProps) => {
  const [state, formAction, isPending] = useActionState(signInAction, initialState)
  const signUpHref = returnTo
    ? `/auth/sign-up?returnTo=${encodeURIComponent(returnTo)}`
    : "/auth/sign-up"

  useEffect(() => {
    if (state.status === "success" && state.redirectTo) {
      window.location.href = state.redirectTo
    }
  }, [state.redirectTo, state.status])

  return (
    <form action={formAction} className={styles.form}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <label className={styles.field}>
        <span className={styles.label}>아이디</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder=""
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>비밀번호</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={isPending}
          className={styles.input}
        />
      </label>

      {state.message ? (
        <p className={state.status === "error" ? styles.errorMessage : styles.infoMessage}>
          {state.message}
        </p>
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
