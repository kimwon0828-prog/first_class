// 로컬 개발 서버가 운영 DB 를 보고 있을 때 결제 · 문자 실행을 막는 규칙.
//
// 사고 시나리오: .env.local 이 호스팅 Supabase 를 가리키는 채로 로컬에서 test 키 결제창을
// 통과하면, 돈은 오가지 않는데 운영 DB 의 구독이 active 로 바뀐다. 로컬에서 갱신 · 알림
// 크론을 부르면 운영 학원의 결제 상태를 바꾸거나 알림 기록을 남긴다.
//
// 그래서 development(VERCEL_ENV 없음)에서 DB 주소가 로컬이 아니면 fail closed 로 막는다.
// BILLING_LOCAL_ALLOW=1 을 명시했을 때만 연다. production · preview 판정은 바꾸지 않는다.
//
// 이 모듈은 process.env 를 읽지 않는다. 순수 판정만 담아 verifier 가 그대로 쓴다.

import type { TossDeploymentEnvironment } from "@/features/billing/lib/toss/keys"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "host.docker.internal"])

/** DB 주소가 이 기기 안을 가리키는가. 모르면(빈 값 · 잘못된 주소) 로컬이 아니라고 본다. */
export const isLocalDatabaseUrl = (value: string | null | undefined): boolean => {
  const raw = value?.trim()
  if (!raw) {
    return false
  }

  try {
    return LOCAL_HOSTS.has(new URL(raw).hostname.toLowerCase())
  } catch {
    return false
  }
}

export type LocalMutationGuard =
  | { allowed: true }
  | { allowed: false; code: "hosted_database_in_development" }

export const resolveLocalMutationGuard = (input: {
  deployment: TossDeploymentEnvironment
  databaseUrl: string | null | undefined
  /** BILLING_LOCAL_ALLOW=1 */
  localAllow: boolean
}): LocalMutationGuard => {
  if (input.deployment !== "development") {
    return { allowed: true }
  }

  if (isLocalDatabaseUrl(input.databaseUrl) || input.localAllow) {
    return { allowed: true }
  }

  return { allowed: false, code: "hosted_database_in_development" }
}
