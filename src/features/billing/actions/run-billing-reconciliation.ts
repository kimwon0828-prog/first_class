import "server-only"

import { findPendingBillingPaymentAttempts } from "@/features/billing/lib/charge/payment-attempt"
import { settleOrder } from "@/features/billing/lib/settle/settle-payment"
import { getTossRuntime } from "@/features/billing/lib/toss/server"

// 결제 대사(reconciliation).
//
// webhook 만 믿지 않는다. 응답을 못 받은 결제(timeout)나 도착하지 않은 webhook 때문에
// "실제로는 결제됐는데 우리 쪽은 안 열린" 상태가 생길 수 있다. 하루 한 번 훑어서
// Toss 조회 결과로 맞춘다.
//
// 대상은 결과가 확정되지 않은 것들이다.
//   1. 카드 인증까지 끝났는데 완료도 실패도 아닌 checkout 세션
//   2. 이용기간이 끝났는데 아직 갱신되지 않은 구독의 시도들
//
// 반영은 settleOrder → applyVerifiedBillingEvent 로만 한다. 구독을 직접 고치지 않는다.
// 이미 반영된 결제는 같은 멱등 키라 duplicate 로 끝난다.

const STUCK_SESSION_AGE_MS = 10 * 60 * 1000
const SESSION_LIMIT = 200

export type ReconciliationSummary = {
  sessionsChecked: number
  renewalsChecked: number
  applied: number
  failedRecorded: number
  stillPending: number
  ignored: number
}

export const runBillingReconciliation = async (
  now: Date = new Date()
): Promise<ReconciliationSummary> => {
  const runtime = getTossRuntime()
  if (runtime.status !== "ready") {
    throw new Error("toss_billing_not_configured")
  }

  const summary: ReconciliationSummary = {
    sessionsChecked: 0,
    renewalsChecked: 0,
    applied: 0,
    failedRecorded: 0,
    stillPending: 0,
    ignored: 0
  }

  const count = (status: string) => {
    if (status === "applied") {
      summary.applied += 1
    } else if (status === "failed_recorded") {
      summary.failedRecorded += 1
    } else if (status === "pending") {
      summary.stillPending += 1
    } else {
      summary.ignored += 1
    }
  }

  // DB에 실제로 저장된 pending attempt만 확인한다. orderId를 다시 만들지 않는다.
  const attempts = await findPendingBillingPaymentAttempts(
    new Date(now.getTime() - STUCK_SESSION_AGE_MS),
    SESSION_LIMIT
  )
  for (const attempt of attempts) {
    if (attempt.attemptKind === "initial") summary.sessionsChecked += 1
    else summary.renewalsChecked += 1
    count((await settleOrder(runtime.config, attempt.orderId)).status)
  }

  return summary
}
