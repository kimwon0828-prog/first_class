"use client"

import Image from "next/image"
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
      <Image src="/images/auth/apple-continue-ko.png" alt="" width={350} height={52} unoptimized priority
        style={{ display: "block", maxWidth: "100%", width: 350, height: "auto" }} />
    </button>
    {isPending ? <p role="status">Apple 연결 중...</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>
}
