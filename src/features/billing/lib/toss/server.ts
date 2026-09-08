import "server-only"

import type { TossClientConfig } from "@/features/billing/lib/toss/client"
import { getTossBillingEnv } from "@/shared/config/server-env"

// secret 을 읽는 유일한 자리. 이 모듈 밖으로 secret 값을 내보내지 않는다.
// client bundle 로 새지 않도록 server-only 마커를 둔다.

export type TossRuntime =
  | {
      status: "ready"
      config: TossClientConfig
      clientKey: string
      environment: "test" | "live"
      deployment: "production" | "preview" | "development"
    }
  | { status: "missing" }
  | { status: "invalid"; code: string; message: string }
  /**
   * 키는 유효하지만 이 배포에서 결제를 실행하면 안 된다.
   *
   * production + test 키가 대표적이다. 이 상태에서는 checkout 진입도,
   * 갱신 승인도, 대사의 provider mutation 도 하지 않는다(fail closed).
   */
  | { status: "blocked"; code: string }

export const getTossRuntime = (): TossRuntime => {
  const result = getTossBillingEnv()
  if (result.status !== "ready") {
    return result
  }

  return {
    status: "ready",
    config: { secretKey: result.env.secretKey },
    clientKey: result.env.clientKey,
    environment: result.env.environment,
    deployment: result.env.deployment
  }
}
