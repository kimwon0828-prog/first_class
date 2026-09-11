import { createServerClient } from "@supabase/ssr"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { cookies, headers } from "next/headers"

import { getPublicEnv } from "@/shared/config/env"

const extractProjectRefFromSupabaseUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    const match = host.match(/^([a-z0-9]+)\./i)
    return match?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

const extractProjectRefFromAuthCookieName = (cookieName: string): string | null => {
  const match = cookieName.match(/^sb-([a-z0-9]+)-auth-token/i)
  return match?.[1]?.toLowerCase() ?? null
}

const safeDecodeCookieValue = (rawValue: string): string => {
  const trimmed = rawValue.trim()
  const unquoted =
    trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")
      ? trimmed.slice(1, -1)
      : trimmed

  try {
    return decodeURIComponent(unquoted)
  } catch {
    return unquoted
  }
}

const parseCookieHeader = (rawCookieHeader: string): Array<{ name: string; value: string }> => {
  if (!rawCookieHeader) {
    return []
  }

  return rawCookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=")
      if (index <= 0) {
        return { name: part, value: "" }
      }

      return {
        name: part.slice(0, index),
        value: safeDecodeCookieValue(part.slice(index + 1))
      }
    })
}

const decodeBase64UrlToString = (raw: string): string => {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8")
}

const extractSupabaseAuthCookieValue = (rawCookieHeader: string, projectRef: string): string | null => {
  const cookiesFromHeader = parseCookieHeader(rawCookieHeader)
  const baseName = `sb-${projectRef}-auth-token`
  const chunks = cookiesFromHeader
    .map((cookie) => {
      if (cookie.name === baseName) {
        return { index: -1, value: cookie.value }
      }

      const match = cookie.name.match(new RegExp(`^${baseName}\\.([0-9]+)$`, "i"))
      if (!match) {
        return null
      }

      const chunkIndex = Number(match[1])
      if (!Number.isFinite(chunkIndex)) {
        return null
      }

      return { index: chunkIndex, value: cookie.value }
    })
    .filter((value): value is { index: number; value: string } => Boolean(value))

  const numberedChunks = chunks.filter((chunk) => chunk.index >= 0).sort((a, b) => a.index - b.index)
  if (numberedChunks.length > 0) {
    return numberedChunks.map((chunk) => chunk.value).join("")
  }

  const baseChunk = chunks.find((chunk) => chunk.index === -1)
  return baseChunk?.value ?? null
}

/**
 * 요청 cookie 에 들어 있는 access token 원문.
 *
 * auth client 를 거치지 않는다 — getSession() 을 타면 만료된 토큰에서 refresh 가
 * 발생하기 때문이다. 갱신 없이 "지금 브라우저가 들고 있는 토큰" 만 그대로 돌려준다.
 * 검증은 호출자(features/auth/lib/verified-claims)가 getClaims(token) 으로 한다.
 */
export const getRequestAccessToken = async (): Promise<string | null> => {
  const { supabaseUrl } = getPublicEnv()
  const requestHeaders = await headers()
  const projectRef = extractProjectRefFromSupabaseUrl(supabaseUrl)
  if (!projectRef) {
    return null
  }

  // middleware 가 이번 요청에서 토큰을 갱신했으면 그 값이 request cookie 에 실려 온다.
  // cookieStore 를 먼저 보고, 없을 때만 raw header 로 내려간다.
  const cookieStore = await cookies()
  const rawCookieValue =
    extractSupabaseAuthCookieValue(
      cookieStore
        .getAll()
        .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
        .join("; "),
      projectRef
    ) ?? extractSupabaseAuthCookieValue(requestHeaders.get("cookie") ?? "", projectRef)

  if (!rawCookieValue) {
    return null
  }

  const combined = rawCookieValue.startsWith("base64-")
    ? rawCookieValue.slice("base64-".length)
    : rawCookieValue

  try {
    const payload = JSON.parse(decodeBase64UrlToString(combined)) as { access_token?: unknown }
    return typeof payload.access_token === "string" ? payload.access_token : null
  } catch {
    return null
  }
}

export const getUserFromSupabaseAuthCookieFallback = async (): Promise<{
  user: { id: string; email?: string } | null
  hasAuthCookie: boolean
  hasAccessToken: boolean
}> => {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
  const requestHeaders = await headers()
  const rawCookieHeader = requestHeaders.get("cookie") ?? ""
  const projectRef = extractProjectRefFromSupabaseUrl(supabaseUrl)

  if (!projectRef) {
    return { user: null, hasAuthCookie: false, hasAccessToken: false }
  }

  const rawCookieValue = extractSupabaseAuthCookieValue(rawCookieHeader, projectRef)
  if (!rawCookieValue) {
    return { user: null, hasAuthCookie: false, hasAccessToken: false }
  }

  const combined = rawCookieValue.startsWith("base64-") ? rawCookieValue.slice("base64-".length) : rawCookieValue
  let jsonText: string
  try {
    jsonText = decodeBase64UrlToString(combined)
  } catch {
    return { user: null, hasAuthCookie: true, hasAccessToken: false }
  }

  let payload: unknown
  try {
    payload = JSON.parse(jsonText)
  } catch {
    return { user: null, hasAuthCookie: true, hasAccessToken: false }
  }

  const accessToken =
    typeof (payload as { access_token?: unknown }).access_token === "string"
      ? ((payload as { access_token: string }).access_token as string)
      : null

  if (!accessToken) {
    return { user: null, hasAuthCookie: true, hasAccessToken: false }
  }

  const tokenClient = createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })

  const { data, error } = await tokenClient.auth.getUser()
  if (error || !data.user) {
    return { user: null, hasAuthCookie: true, hasAccessToken: true }
  }

  return {
    user: { id: data.user.id, email: data.user.email ?? undefined },
    hasAuthCookie: true,
    hasAccessToken: true
  }
}

export const getSupabaseServerClient = async (): Promise<SupabaseClient> => {
  const cookieStore = await cookies()
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
  const requestHeaders = await headers()
  const rawCookieHeader = requestHeaders.get("cookie") ?? ""
  const cookiesFromHeader = parseCookieHeader(rawCookieHeader)
  const cookiesFromStore = cookieStore.getAll().map((cookie) => ({ name: cookie.name, value: cookie.value }))

  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    const refFromUrl = extractProjectRefFromSupabaseUrl(supabaseUrl)
    const cookieRefsFromStore = Array.from(
      new Set(
        cookiesFromStore
          .map((cookie) => extractProjectRefFromAuthCookieName(cookie.name))
          .filter((value): value is string => Boolean(value))
      )
    )
    const cookieRefsFromHeader = Array.from(
      new Set(
        cookiesFromHeader
          .map((cookie) => extractProjectRefFromAuthCookieName(cookie.name))
          .filter((value): value is string => Boolean(value))
      )
    )

    console.log("[server supabase env]", {
      refFromUrl,
      cookieRefsFromStore,
      cookieRefsFromHeader,
      hasSbCookieInHeader: rawCookieHeader.includes("sb-"),
      cookieHeaderLength: rawCookieHeader.length,
      cookieCountFromStore: cookiesFromStore.length,
      cookieCountFromHeader: cookiesFromHeader.length
    })
  }

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(
        cookiesToSet: Array<{
          name: string
          value: string
          options?: Parameters<typeof cookieStore.set>[2]
        }>
      ) {
        // Server Components may not allow mutating cookies in every render path.
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options)
          }
        } catch {
          // Cookie sync is handled by middleware/action paths when mutation is allowed.
        }
      }
    }
  })
}
