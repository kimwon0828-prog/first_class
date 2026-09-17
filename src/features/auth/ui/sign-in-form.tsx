"use client"

import Link from "next/link"
import { useActionState } from "react"

import { signInAction, type SignInActionState } from "@/features/auth/actions/sign-in"
import { KakaoAuthButton } from "@/features/auth/ui/kakao-auth-button"
import styles from "@/features/auth/ui/sign-in-form.module.css"

type SignInFormProps = {
  returnTo?: string
  showKakaoButton?: boolean
  compact?: boolean
}

export const SignInForm = ({ returnTo, showKakaoButton = true, compact = false }: SignInFormProps) => {
  const [state, formAction, isPending] = useActionState<SignInActionState, FormData>(signInAction, {
    status: "idle",
    message: ""
  })
  /*
   * 학부모 가입은 카카오 한 길뿐이다.
   *
   * ⚠️ 그래서 "회원가입" 이라고 적지 않는다. 눌러도 이메일 가입 화면은 없고
   *    카카오 시작 화면으로 갈 뿐이라, 그 라벨은 없는 길을 약속하는 셈이 된다.
   *    문구를 실제 동작에 맞춘다. 새 가입 흐름을 만들지 않는다.
   */
  const kakaoStartHref = returnTo
    ? `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : "/auth/sign-in"

  return (
    <form action={formAction} className={`${styles.form} ${compact ? styles.compactForm : ""}`.trim()}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <label className={styles.field}>
        <span className={styles.label}>이메일</span>
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
        <p className={state.status === "error" ? styles.errorMessage : styles.infoMessage}>{state.message}</p>
      ) : null}

      {showKakaoButton ? (
        <>
          <KakaoAuthButton
            label="카카오로 로그인"
            next={returnTo ?? "/"}
            className={styles.kakaoButton}
          />

          <div className={styles.divider} aria-hidden="true">
            <span className={styles.dividerLine} />
            <span className={styles.dividerText}>또는 이메일로 로그인</span>
            <span className={styles.dividerLine} />
          </div>
        </>
      ) : null}

      <div className={styles.links}>
        <Link href="/auth/find-email">이메일 찾기</Link>
        <span className={styles.separator}>|</span>
        <Link href="/auth/reset-password">비밀번호 찾기</Link>
        <span className={styles.separator}>|</span>
        <Link href={kakaoStartHref}>카카오로 시작하기</Link>
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
