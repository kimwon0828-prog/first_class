"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"

import {
  studioSignInAction,
  type StudioSignInActionState
} from "@/features/studio/actions/studio-sign-in"
import styles from "@/features/studio/ui/studio-sign-in-form.module.css"

const initialState: StudioSignInActionState = {
  status: "idle",
  message: ""
}

type StudioSignInFormProps = {
  returnTo?: string
}

export const StudioSignInForm = ({ returnTo }: StudioSignInFormProps) => {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(studioSignInAction, initialState)

  useEffect(() => {
    if (state.status === "success" && state.redirectTo) {
      router.replace(state.redirectTo)
    }
  }, [router, state.redirectTo, state.status])

  return (
    <form action={formAction} className={styles.form}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <label className={styles.field}>
        <span className={styles.label}>이메일</span>
        <input
          className={styles.input}
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>비밀번호</span>
        <input
          className={styles.input}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
      </label>

      {state.message ? (
        <p className={`${styles.message} ${state.status === "error" ? styles.error : styles.info}`}>
          {state.message}
        </p>
      ) : null}

      <div className={styles.links}>
        <span>아이디 찾기</span>
        <span className={styles.separator}>|</span>
        <span>비밀번호 찾기</span>
      </div>

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "로그인 중..." : "선생님 로그인"}
      </button>

      <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "#6b7280" }}>
        아직 계정이 없으신가요?{" "}
        <Link href="/studio/sign-up" style={{ color: "#2563eb", textDecoration: "none" }}>
          학원 계정 신청
        </Link>
      </div>
    </form>
  )
}
