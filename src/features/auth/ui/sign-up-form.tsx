"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"

import {
  signUpParentAction,
  type SignUpActionState
} from "@/features/auth/actions/sign-up"

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
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <label style={{ display: "grid", gap: 6 }}>
        <span>이름</span>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={30}
          disabled={isPending}
          style={{ padding: 10 }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>이메일</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          disabled={isPending}
          style={{ padding: 10 }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>비밀번호</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          disabled={isPending}
          style={{ padding: 10 }}
        />
      </label>

      {state.message ? (
        <p
          style={{
            margin: 0,
            color: state.status === "error" ? "#b42318" : "#1f2937",
            fontSize: 14
          }}
        >
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} style={{ padding: 12 }}>
        {isPending ? "가입 처리 중..." : "학부모로 가입하기"}
      </button>

      <Link href={signInHref} style={{ fontSize: 14 }}>
        이미 계정이 있나요? 로그인
      </Link>
    </form>
  )
}
