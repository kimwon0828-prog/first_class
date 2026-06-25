"use client"

import Link from "next/link"
import { useActionState } from "react"

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
  const [state, formAction, isPending] = useActionState(studioSignInAction, initialState)

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
        <p
          data-role="form-message"
          data-tone={state.status}
          className={`${styles.message} ${state.status === "error" ? styles.error : styles.info}`}
        >
          {state.message}
        </p>
      ) : null}

      <div className={styles.links}>
        <Link href="/auth/find-email?type=academy">이메일 찾기</Link>
        <span className={styles.separator}>|</span>
        <Link href="/auth/reset-password?type=academy">비밀번호 찾기</Link>
      </div>

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "로그인 중..." : "운영보드 로그인"}
      </button>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          아직 계정이 없으신가요?{" "}
          <Link href="/studio/sign-up" className={styles.footerLink}>
            학원 계정 신청
          </Link>
        </p>
        <p className={styles.footerText}>
          학부모이신가요?{" "}
          <Link href="/auth/sign-in" className={styles.footerLink}>
            학부모 로그인
          </Link>
        </p>
      </div>

    </form>
  )
}
