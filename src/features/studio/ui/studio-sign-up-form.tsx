"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"

import {
  studioSignUpAction,
  type StudioSignUpActionState
} from "@/features/studio/actions/studio-sign-up"
import styles from "@/features/studio/ui/studio-sign-in-form.module.css"

const initialState: StudioSignUpActionState = {
  status: "idle",
  message: ""
}

export const StudioSignUpForm = () => {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(studioSignUpAction, initialState)

  useEffect(() => {
    if (state.status === "success") {
      router.replace("/studio/pending")
    }
  }, [router, state.status])

  return (
    <form action={formAction} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>선생님 이름</span>
        <input
          name="teacherName"
          type="text"
          required
          minLength={2}
          maxLength={30}
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>학원/조직 이름</span>
        <input
          name="organizationName"
          type="text"
          required
          maxLength={50}
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>지점명 (선택)</span>
        <input
          name="branchName"
          type="text"
          maxLength={30}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 강남점"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>이메일 (아이디)</span>
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
        />
      </label>

      {state.message ? (
        <p className={state.status === "error" ? styles.errorMessage : styles.infoMessage}>
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "가입 신청 중..." : "가입 신청하기"}
      </button>

      {state.status === "needs_email_confirm" ? (
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 13, color: "#6b7280" }}>
          이메일 인증 후{" "}
          <Link href="/studio/sign-in" style={{ color: "#2563eb", textDecoration: "none" }}>
            선생님 로그인
          </Link>
          으로 들어와 주세요.
        </div>
      ) : null}

      <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "#6b7280" }}>
        이미 계정이 있으신가요?{" "}
        <Link href="/studio/sign-in" style={{ color: "#2563eb", textDecoration: "none" }}>
          선생님 로그인
        </Link>
      </div>
    </form>
  )
}
