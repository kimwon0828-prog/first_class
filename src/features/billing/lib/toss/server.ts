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
      /**
       * production 의 test-key 차단이 이 조직에만 열린 상태인가.
       * 화면 안내에만 쓴다 — 권한이나 결제 판정에 쓰지 않는다.
       */
      reviewMode: boolean
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

/**
 * 조직을 모르는 호출용. production 의 test-key 차단이 예외 없이 그대로 적용된다.
 *
 * webhook · 갱신 · 대사처럼 조직이 배치마다 달라지는 경로가 이걸 쓴다.
 * 심사 예외는 checkout 진입과 그 callback 에만 열어 둔다.
 */
export const getTossRuntime = (): TossRuntime => toRuntime(getTossBillingEnv())

/**
 * 조직 단위 runtime.
 *
 * production + test 키에서 차단을 여는 것은 TOSS_REVIEW_ORGANIZATION_ID 와
 * 정확히 일치하는 조직 하나뿐이다. 나머지 조직의 판정은 getTossRuntime 과 같다.
 *
 * ⚠️ organizationId 는 서버가 확인한 값만 넘긴다. checkout callback 처럼 브라우저가
 *    개입할 수 있는 경로에서는 DB 의 checkout session 에서 읽은 조직을 쓴다.
 */
export const getTossRuntimeForOrganization = (organizationId: string | null): TossRuntime =>
  toRuntime(getTossBillingEnv(organizationId))

const toRuntime = (result: ReturnType<typeof getTossBillingEnv>): TossRuntime => {
  if (result.status !== "ready") {
    return result
  }

  return {
    status: "ready",
    config: { secretKey: result.env.secretKey },
    clientKey: result.env.clientKey,
    environment: result.env.environment,
    deployment: result.env.deployment,
    reviewMode: result.env.reviewMode
  }
}
