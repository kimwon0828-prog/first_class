import "server-only"

import {
  toBillingEventArgs,
  type BillingEventResult,
  type VerifiedBillingEvent
} from "@/features/billing/lib/billing-events"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

// 구독 상태를 바꾸는 유일한 진입점.
//
// checkout 검증 · 갱신 결과 · 검증된 webhook · 대사(reconciliation)가 모두 이 함수를 쓴다.
// 경로별로 다른 상태 전이 코드를 만들면 어느 하나가 반드시 어긋난다.
//
// service role 로 부른다 — 학원 계정이 자기 구독을 바꿀 수 없어야 한다.

export const applyVerifiedBillingEvent = async (
  event: VerifiedBillingEvent
): Promise<BillingEventResult> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient.rpc(
    "apply_billing_event",
    toBillingEventArgs(event)
  )

  if (error) {
    throw new Error(
      [
        "billing_idempotency_key_conflict",
        "billing_idempotency_key_required",
        "billing_period_required",
        "billing_subscription_not_found",
        "billing_period_already_ended",
        "billing_event_type_not_supported"
      ].find((code) => error.message.includes(code)) ?? "failed_to_apply_billing_event"
    )
  }

  return data as BillingEventResult
}
