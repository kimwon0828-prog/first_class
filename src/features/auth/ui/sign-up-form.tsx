"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"

import {
  signUpParentAction,
  type SignUpActionState
} from "@/features/auth/actions/sign-up"
import styles from "./sign-up-form.module.css"

const initialState: SignUpActionState = {
  status: "idle",
  message: ""
}

type SignUpFormProps = {
  returnTo?: string
}

export const SignUpForm = ({ returnTo }: SignUpFormProps) => {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(signUpParentAction, initialState)
  const signInHref = returnTo
    ? `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : "/auth/sign-in"

  useEffect(() => {
    if (state.status === "success" && state.redirectTo) {
      router.replace(state.redirectTo)
    }
  }, [router, state.redirectTo, state.status])

  return (
    <form action={formAction} className={styles.form}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <section className={styles.card} aria-label="회원가입 정보 입력">
        <div className={styles.fieldStack}>
          <label className={styles.field}>
            <span className={styles.label}>이름</span>
            <input
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={30}
              disabled={isPending}
              className={styles.input}
              placeholder="보호자 이름"
              autoComplete="name"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>이메일</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
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
              minLength={8}
              autoComplete="new-password"
              disabled={isPending}
              className={styles.input}
              placeholder="8자 이상"
            />
          </label>
        </div>

        {state.message ? (
          <p
            className={`${styles.message} ${
              state.status === "error" ? styles.errorMessage : styles.infoMessage
            }`}
          >
            {state.message}
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
