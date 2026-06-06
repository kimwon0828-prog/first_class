"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { getSupabaseBrowserClient } from "@/integrations/supabase/client"

const isValidPassword = (value: string) => value.length >= 8

export default function UpdatePasswordPage() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const validationError = useMemo(() => {
    if (!password && !confirmPassword) {
      return null
    }

    if (!isValidPassword(password)) {
      return "비밀번호는 최소 8자 이상이어야 합니다."
    }

    if (password !== confirmPassword) {
      return "새 비밀번호와 확인 비밀번호가 일치하지 않습니다."
    }

    return null
  }, [confirmPassword, password])

  useEffect(() => {
    const check = async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        await supabase.auth.getSession()
      } finally {
        setReady(true)
      }
    }
    void check()
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!ready) {
      return
    }

    if (validationError) {
      setStatus("error")
      setMessage(validationError)
      return
    }

    setStatus("loading")
    setMessage("")
    try {
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setStatus("error")
        setMessage("비밀번호 변경에 실패했어요. 링크가 만료되었거나 다시 시도해 주세요.")
        return
      }

      await supabase.auth.signOut()
      setStatus("success")
      setMessage("비밀번호가 변경되었어요. 다시 로그인해주세요.")
    } catch {
      setStatus("error")
      setMessage("비밀번호 변경에 실패했어요. 잠시 후 다시 시도해 주세요.")
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
            href="/auth/sign-in"
            aria-label="학부모 로그인으로"
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
          비밀번호 재설정
        </h1>

        <section style={{ marginTop: 18 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#111827" }}>
            새 비밀번호를 입력해 주세요.
          </p>
        </section>

        <form onSubmit={handleSubmit} style={{ marginTop: 28, display: "grid", gap: 18 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, lineHeight: "16px", color: "#111827", fontWeight: 600 }}>
              새 비밀번호
            </span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              autoComplete="new-password"
              disabled={!ready || status === "loading" || status === "success"}
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

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, lineHeight: "16px", color: "#111827", fontWeight: 600 }}>
              새 비밀번호 확인
            </span>
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              autoComplete="new-password"
              disabled={!ready || status === "loading" || status === "success"}
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

          {message || validationError ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: "18px",
                color: status === "success" ? "#111827" : "#b42318"
              }}
            >
              {message || validationError}
            </p>
          ) : null}

          {status !== "success" ? (
            <button
              type="submit"
              disabled={!ready || status === "loading"}
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
                cursor: !ready || status === "loading" ? "default" : "pointer",
                opacity: !ready || status === "loading" ? 0.8 : 1
              }}
            >
              {status === "loading" ? "변경 중..." : "비밀번호 변경하기"}
            </button>
          ) : (
            <div style={{ marginTop: 6, display: "grid", gap: 10 }}>
              <Link
                href="/auth/sign-in"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  borderRadius: 10,
                  background: "#2aad38",
                  color: "#ffffff",
                  textDecoration: "none",
                  fontSize: 16,
                  lineHeight: "22px",
                  fontWeight: 600,
                  padding: "14px 0"
                }}
              >
                학부모 로그인
              </Link>
              <Link
                href="/studio/sign-in"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#111827",
                  textDecoration: "none",
                  fontSize: 16,
                  lineHeight: "22px",
                  fontWeight: 600,
                  padding: "14px 0"
                }}
              >
                선생님 로그인
              </Link>
            </div>
          )}
        </form>
      </div>
    </main>
  )
}

