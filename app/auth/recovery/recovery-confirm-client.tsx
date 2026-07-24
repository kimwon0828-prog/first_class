"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { getSupabaseBrowserClient } from "@/integrations/supabase/client"

type UserType = "parent" | "academy"
type RecoveryStatus = "idle" | "loading" | "success" | "error"

type RecoveryConfirmClientProps = {
  userType: UserType
}

const INVALID_LINK_MESSAGE = "유효하지 않은 링크입니다. 비밀번호 재설정 메일을 다시 요청해 주세요."
const EXPIRED_LINK_MESSAGE = "링크가 만료되었거나 이미 사용되었습니다. 비밀번호 재설정 메일을 다시 요청해 주세요."

const getLoginHref = (userType: UserType) =>
  userType === "academy" ? "/studio/sign-in" : "/auth/sign-in"

const getRetryHref = (userType: UserType) => `/auth/reset-password?type=${userType}`

const getContinueHref = (userType: UserType) =>
  userType === "academy" ? "/auth/update-password?type=academy" : "/auth/update-password?type=parent"

const logSupabaseError = (label: string, error: unknown) => {
  if (process.env.NODE_ENV !== "development") {
    return
  }

  console.error(label, error)
}

const resolveLinkErrorMessage = (error: unknown) => {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : ""
  const message =
    typeof (error as { message?: unknown })?.message === "string"
      ? (error as { message: string }).message.toLowerCase()
      : ""

  if (code === "otp_expired" || message.includes("otp_expired") || message.includes("expired")) {
    return EXPIRED_LINK_MESSAGE
  }

  return INVALID_LINK_MESSAGE
}

export const RecoveryConfirmClient = ({ userType }: RecoveryConfirmClientProps) => {
  const router = useRouter()
  const loginHref = getLoginHref(userType)
  const retryHref = getRetryHref(userType)
  const continueHref = getContinueHref(userType)
  const [tokenHash, setTokenHash] = useState<string | null>(null)
  const [hasValidOtpType, setHasValidOtpType] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [status, setStatus] = useState<RecoveryStatus>("idle")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : ""
    const hashParams = new URLSearchParams(hash)
    const nextTokenHash = hashParams.get("token_hash")
    const otpType = hashParams.get("otp_type")

    setTokenHash(nextTokenHash)
    setHasValidOtpType(otpType === "recovery")
    setIsReady(true)

    const sanitizedUrl = `${window.location.pathname}${window.location.search}`
    window.history.replaceState(null, "", sanitizedUrl)

    if (!nextTokenHash || otpType !== "recovery") {
      setStatus("error")
      setMessage(INVALID_LINK_MESSAGE)
    }
  }, [])

  const canContinue = useMemo(
    () => isReady && Boolean(tokenHash) && hasValidOtpType && status !== "loading" && status !== "success",
    [hasValidOtpType, isReady, status, tokenHash]
  )

  const handleContinue = async () => {
    if (!tokenHash || !hasValidOtpType || status === "loading") {
      setStatus("error")
      setMessage(INVALID_LINK_MESSAGE)
      return
    }

    setStatus("loading")
    setMessage("")

    try {
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery"
      })

      if (error) {
        logSupabaseError("[recovery] verifyOtp failed", error)
        setStatus("error")
        setMessage(resolveLinkErrorMessage(error))
        return
      }

      setStatus("success")
      router.replace(continueHref)
    } catch (error) {
      logSupabaseError("[recovery] verifyOtp threw", error)
      setStatus("error")
      setMessage(resolveLinkErrorMessage(error))
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
            aria-label="로그인으로"
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
          비밀번호 재설정 확인
        </h1>

        <section style={{ marginTop: 18, display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#111827" }}>
            메일에서 이동한 뒤 아래 버튼을 눌러 비밀번호 재설정을 계속해 주세요.
          </p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: "18px", color: "#6b7280" }}>
            이 단계에서는 버튼을 누르기 전까지 복구 토큰을 검증하지 않습니다.
          </p>
        </section>

        <div style={{ marginTop: 28, display: "grid", gap: 18 }}>
          {message ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: "18px",
                color: status === "success" ? "#111827" : "#b42318"
              }}
            >
              {message}
            </p>
          ) : null}

          {status !== "success" ? (
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={!canContinue}
              style={{
                width: "100%",
                border: 0,
                borderRadius: 10,
                background: "#2aad38",
                color: "#ffffff",
                fontSize: 16,
                lineHeight: "22px",
                fontWeight: 600,
                padding: "14px 0",
                cursor: canContinue ? "pointer" : "default",
                opacity: canContinue ? 1 : 0.8
              }}
            >
              {status === "loading" ? "확인 중..." : "비밀번호 재설정 계속하기"}
            </button>
          ) : null}

          <Link
            href={retryHref}
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
            다시 요청하기
          </Link>
        </div>
      </div>
    </main>
  )
}
