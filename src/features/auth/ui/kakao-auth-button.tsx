"use client"

import { useState } from "react"

import { getSupabaseBrowserClient } from "@/integrations/supabase/client"

const KAKAO_SCOPE = "account_email name birthyear phone_number"

type KakaoAuthButtonProps = {
  label: string
  next?: string
  className?: string
}

const resolveSafeNext = (value?: string) => {
  const normalized = value?.trim() ?? ""
  if (!normalized) {
    return "/classes"
  }

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/classes"
  }

  return normalized
}

export const KakaoAuthButton = ({ label, next, className }: KakaoAuthButtonProps) => {
  const [isPending, setIsPending] = useState(false)

  const handleClick = async () => {
    if (isPending) {
      return
    }

    setIsPending(true)

    const origin = window.location.origin
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(resolveSafeNext(next))}`
    const supabase = getSupabaseBrowserClient()

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo,
        scopes: KAKAO_SCOPE
      }
    })

    if (error) {
      setIsPending(false)
      window.alert("카카오 로그인 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className={className}>
      {isPending ? "카카오 연결 중..." : label}
    </button>
  )
}
