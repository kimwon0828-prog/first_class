import "server-only"

import type { TossClientConfig } from "@/features/billing/lib/toss/client"
import { getTossBillingEnv } from "@/shared/config/server-env"

// secret 을 읽는 유일한 자리. 이 모듈 밖으로 secret 값을 내보내지 않는다.
// client bundle 로 새지 않도록 server-only 마커를 둔다.

export type TossRuntime =
  | { status: "ready"; config: TossClientConfig; clientKey: string; environment: "test" | "live" }
  | { status: "missing" }
  | { status: "invalid"; code: string; message: string }

export const getTossRuntime = (): TossRuntime => {
  const result = getTossBillingEnv()
  if (result.status !== "ready") {
    return result
  }

  return {
    status: "ready",
    config: { secretKey: result.env.secretKey },
    clientKey: result.env.clientKey,
    environment: result.env.environment
  }
}
