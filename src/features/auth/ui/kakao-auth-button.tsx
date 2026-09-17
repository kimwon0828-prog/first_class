"use client"

import type { ReactNode } from "react"
import { useState } from "react"

import { getSupabaseBrowserClient } from "@/integrations/supabase/client"

const KAKAO_SCOPE = "account_email name birthyear phone_number profile_nickname profile_image"

type KakaoAuthButtonProps = {
  label: string
  next?: string
  className?: string
  icon?: ReactNode
}

/*
 * 로그인 후 돌아갈 자리.
 *
 * ⚠️ 외부 주소 차단 규칙은 그대로다. 기본값만 Home(/) 으로 바뀐다.
 */
const resolveSafeNext = (value?: string) => {
  const normalized = value?.trim() ?? ""
  if (!normalized) {
    return "/"
  }

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/"
  }

  return normalized
}

export const KakaoAuthButton = ({ label, next, className, icon }: KakaoAuthButtonProps) => {
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
      {isPending ? (
        "카카오 연결 중..."
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </button>
  )
}
