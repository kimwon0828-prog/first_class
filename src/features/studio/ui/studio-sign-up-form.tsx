"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"

import { academyAreaOptions } from "@/shared/config/academy-areas"
import {
  studioSignUpAction,
  type StudioSignUpActionState
} from "@/features/studio/actions/studio-sign-up"
import styles from "@/features/studio/ui/studio-sign-up-form.module.css"

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
      {state.status === "needs_email_confirm" ? (
        <div className={styles.successCard} role="status" aria-live="polite">
          <div className={styles.successIcon} aria-hidden="true" />
          <div className={styles.successBody}>
            <p className={styles.successTitle}>학원 계정 신청이 접수되었습니다.</p>
            <p className={styles.successDescription}>
              이메일 인증 후{" "}
              <Link href="/studio/sign-in" className={styles.inlineLink}>
                운영보드 로그인
              </Link>
              으로 들어와 주세요.
            </p>
          </div>
        </div>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>학원명</span>
        <input
          name="organizationName"
          type="text"
          required
          minLength={2}
          maxLength={50}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 첫수업 강남학원"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>학원가</span>
        <select name="academyArea" required disabled={isPending} className={styles.input} defaultValue="">
          <option value="" disabled>
            학원가를 선택해 주세요
          </option>
          {academyAreaOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
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
        <span className={styles.label}>학원 주소</span>
        <input
          name="address"
          type="text"
          required
          maxLength={120}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 경기도 고양시 일산서구 ..."
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>상세주소 (선택)</span>
        <input
          name="addressDetail"
          type="text"
          maxLength={120}
          disabled={isPending}
          className={styles.input}
          placeholder="예: 5층 501호"
        />
      </label>

      <p className={styles.bottomHint}>
        입력한 주소는 학부모가 수업 상세 페이지에서 학원 위치를 확인할 때 사용됩니다.
      </p>

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

      {state.message && state.status !== "needs_email_confirm" ? (
        <p className={state.status === "error" ? styles.errorMessage : styles.infoMessage} role="status">
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "신청 중..." : "운영보드 계정 신청"}
      </button>
    </form>
  )
}
