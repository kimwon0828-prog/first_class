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

          <label className={styles.field}>
            <span className={styles.label}>비밀번호 확인</span>
            <input
              name="passwordConfirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              disabled={isPending}
              className={styles.input}
              placeholder="비밀번호를 한 번 더 입력해 주세요"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>보호자명</span>
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
            <span className={styles.label}>보호자 연락처</span>
            <input
              name="phone"
              type="tel"
              required
              minLength={8}
              maxLength={20}
              autoComplete="tel"
              placeholder="010-0000-0000"
              disabled={isPending}
              className={styles.input}
            />
          </label>
        </div>

        <div className={styles.agreementStack}>
          <label className={styles.checkRow}>
            <input
              name="agreeToTerms"
              type="checkbox"
              value="yes"
              required
              disabled={isPending}
              className={styles.checkbox}
            />
            <span className={styles.checkText}>서비스 이용약관에 동의합니다. (필수)</span>
          </label>

          <label className={styles.checkRow}>
            <input
              name="agreeToPrivacy"
              type="checkbox"
              value="yes"
              required
              disabled={isPending}
              className={styles.checkbox}
            />
            <span className={styles.checkText}>개인정보 수집 및 이용에 동의합니다. (필수)</span>
          </label>

          <label className={styles.checkRow}>
            <input
              name="agreeToMarketing"
              type="checkbox"
              value="yes"
              disabled={isPending}
              className={styles.checkbox}
            />
            <span className={styles.checkText}>마케팅 정보 수신에 동의합니다. (선택)</span>
          </label>
        </div>

        <p className={styles.helperText}>
          자녀 정보는 가입 후 마이페이지의 자녀 관리에서 등록하거나, 첫수업 신청 과정에서 직접 입력할 수 있어요.
        </p>

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
