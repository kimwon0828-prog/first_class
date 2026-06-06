"use client"

import Link from "next/link"
import { useState } from "react"

import { getSupabaseBrowserClient } from "@/integrations/supabase/client"

type UserType = "parent" | "academy"

type ResetPasswordClientProps = {
  userType: UserType
}

const isValidEmail = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length > 3 && trimmed.includes("@")
}

export const ResetPasswordClient = ({ userType }: ResetPasswordClientProps) => {
  const loginHref = userType === "academy" ? "/studio/sign-in" : "/auth/sign-in"

  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()

    if (!isValidEmail(trimmedEmail)) {
      setStatus("error")
      setMessage("올바른 이메일을 입력해 주세요.")
      return
    }

    setStatus("loading")
    setMessage("")
    try {
      const supabase = getSupabaseBrowserClient()
      const redirectTo = `${window.location.origin}/auth/update-password`
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, { redirectTo })

      if (error) {
        setStatus("error")
        setMessage("재설정 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.")
        return
      }

      setStatus("success")
      setMessage("비밀번호 재설정 링크를 이메일로 보내드렸어요. 메일함을 확인해주세요.")
    } catch {
      setStatus("error")
      setMessage("재설정 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.")
    }
  }

  return (
    <main
      style={{
        background: "#ffffff",
        width: "100%",
        minHeight: "100dvh",
        overflowX: "hidden"
      }}
    >
      <div
        style={{
          margin: "0 auto",
          width: "100%",
          maxWidth: 430,
          minHeight: "100dvh",
          boxSizing: "border-box",
          padding: "calc(14px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom))"
        }}
      >
        <header style={{ display: "flex", alignItems: "center", minHeight: 40 }}>
          <Link
            href={loginHref}
            aria-label="뒤로가기"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              color: "#8e8e93",
              fontSize: 24,
              textDecoration: "none"
            }}
          >
            〈
          </Link>
        </header>

        <h1 style={{ margin: "12px 0 0", fontSize: 24, lineHeight: "29px", fontWeight: 600, color: "#000" }}>
          비밀번호 찾기
        </h1>

        <section style={{ marginTop: 18 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#111827" }}>
            가입하신 이메일 주소로 비밀번호 재설정 링크를 보내드릴게요.
          </p>
        </section>

        <form onSubmit={handleSubmit} style={{ marginTop: 28, display: "grid", gap: 18 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, lineHeight: "16px", color: "#111827", fontWeight: 600 }}>
              이메일
            </span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              autoComplete="email"
              disabled={status === "loading" || status === "success"}
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 15,
                lineHeight: "20px"
              }}
            />
          </label>

          {message ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: "18px",
                color: status === "error" ? "#b42318" : "#111827"
              }}
            >
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={status === "loading" || status === "success"}
            style={{
              marginTop: 6,
              width: "100%",
              border: 0,
              borderRadius: 10,
              background: "#2aad38",
              color: "#ffffff",
              fontSize: 16,
              lineHeight: "22px",
              fontWeight: 600,
              padding: "14px 0",
              cursor: status === "loading" || status === "success" ? "default" : "pointer",
              opacity: status === "loading" || status === "success" ? 0.8 : 1
            }}
          >
            {status === "loading" ? "전송 중..." : "재설정 메일 받기"}
          </button>

          <div style={{ marginTop: 6, textAlign: "center", fontSize: 13, color: "#6b7280" }}>
            <Link href={loginHref} style={{ color: "#111827", textDecoration: "none", fontWeight: 600 }}>
              로그인으로 돌아가기
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}

