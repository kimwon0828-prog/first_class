"use client"

import { useEffect, useRef, useState } from "react"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import { getPublicEnv } from "@/shared/config/env"
import { safeAuthReturnTo } from "../lib/apple-auth"

export function AppleAuthButton({ next, className }: { next?: string; className?: string }) {
  const pending = useRef(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    const restore = () => { pending.current = false; setIsPending(false) }
    window.addEventListener("pageshow", restore)
    return () => window.removeEventListener("pageshow", restore)
  }, [])
  const handleClick = async () => {
    if (pending.current) return
    pending.current = true
    setIsPending(true)
    setError("")
    let navigating = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    try {
      const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
      // signInWithOAuth constructs an authorize URL without checking whether the provider is enabled.
      // Read the public Auth settings first so a disabled provider doesn't strand users on a JSON error page.
      const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: supabasePublishableKey }, signal: controller.signal, cache: "no-store"
      })
      if (!response.ok) throw new Error("settings_unavailable")
      const settings = await response.json()
      if (settings.external?.apple !== true) {
        setError("현재 Apple 로그인을 사용할 수 없습니다. 잠시 후 다시 시도하거나 카카오로 시작해 주세요.")
        return
      }
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeAuthReturnTo(next))}`
      const { error: oauthError } = await getSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "apple", options: { redirectTo }
      })
      if (oauthError) throw oauthError
      navigating = true
      // Keep pending until the existing same-window OAuth redirect navigates away.
      return
    } catch {
      setError("Apple 로그인 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      window.clearTimeout(timeout)
      if (!navigating) { pending.current = false; setIsPending(false) }
    }
  }
  return <div>
    <button type="button" className={className} onClick={handleClick} disabled={isPending}
      aria-label="Apple로 계속하기" aria-busy={isPending}>
      {/* Apple HIG 사용자 지정 버튼: Apple 로고 + 승인된 제목. 글자는 카카오 버튼과 같은 16px · 600(앱 로그인과 같다). */}
      <svg width="16" height="19" viewBox="0 0 17 20" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M14.04 10.62c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.34-3.54ZM11.85 4.16c.61-.74 1.02-1.76.91-2.79-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.7-.93 2.7.98.08 1.98-.5 2.59-1.23Z" />
      </svg>
      <span>Apple로 계속하기</span>
    </button>
    {isPending ? <p role="status">Apple 연결 중...</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>
}
