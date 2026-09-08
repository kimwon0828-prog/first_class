import "server-only"

import { applyVerifiedBillingEvent } from "@/features/billing/actions/apply-billing-event"
import { upsertBillingCustomer } from "@/features/billing/lib/checkout/billing-customer-store"
import { checkCheckoutCallback } from "@/features/billing/lib/checkout/checkout-guards"
import {
  claimCheckoutSession,
  findCheckoutSessionByCustomerKey,
  markCheckoutSessionCompleted,
  markCheckoutSessionFailed
} from "@/features/billing/lib/checkout/checkout-store"
import { chargeSubscription } from "@/features/billing/lib/charge/charge-subscription"
import { buildInitialBillingPeriod } from "@/features/billing/lib/billing-period"
import { getPurchasableBillingPlan } from "@/features/billing/lib/plan-catalog"
import { issueTossBillingKey } from "@/features/billing/lib/toss/client"
import { buildBillingOrderName } from "@/features/billing/lib/toss/identifiers"
import { getTossRuntime } from "@/features/billing/lib/toss/server"

// 카드 인증이 끝난 뒤의 서버 처리.
//
// 순서를 지킨다. 빌링키가 나왔다고 스탠다드를 열지 않는다.
//   빌링키 발급 → 최초 49,000원 결제 → 결제 검증 → initial_payment_succeeded → active
// 첫 결제가 실패하면 entitlement 는 열리지 않는다(신규 무료체험 없음).

export type CheckoutCompletion =
  | { status: "activated" }
  /** 결제 결과를 아직 모른다. 대사가 마무리한다. */
  | { status: "pending"; message: string }
  | { status: "rejected"; message: string }

const GENERIC_FAILURE = "결제를 완료하지 못했습니다. 카드사 정보를 확인한 뒤 다시 시도해 주세요."
const PENDING_MESSAGE = "결제 결과를 확인하고 있습니다. 잠시 후 결제 상태가 반영됩니다."

export const completeStandardCheckout = async (input: {
  actorOrganizationId: string
  customerKey: string
  authKey: string
}): Promise<CheckoutCompletion> => {
  const runtime = getTossRuntime()
  if (runtime.status !== "ready") {
    return { status: "rejected", message: GENERIC_FAILURE }
  }

  const session = await findCheckoutSessionByCustomerKey(input.customerKey)
  const checked = checkCheckoutCallback(session, input)
  if (!checked.ok) {
    return { status: "rejected", message: checked.message }
  }

  // 재생 방어. 같은 callback 이 두 번 들어와도 여기를 통과하는 것은 하나뿐이다.
  const claimed = await claimCheckoutSession(checked.session.id)
  if (!claimed) {
    return { status: "rejected", message: "이미 처리된 결제 요청입니다." }
  }

  const plan = getPurchasableBillingPlan(checked.session.planCode)
  if (!plan || plan.amount !== checked.session.amount) {
    // 시작 시점과 카탈로그가 어긋났다. 결제를 만들지 않는다.
    await markCheckoutSessionFailed(checked.session.id, "plan_changed")
    return { status: "rejected", message: GENERIC_FAILURE }
  }

  const issued = await issueTossBillingKey(runtime.config, {
    authKey: input.authKey,
    customerKey: checked.session.customerKey,
    idempotencyKey: checked.session.orderId
  })

  if (issued.outcome !== "succeeded" || !issued.data?.billingKey) {
    await markCheckoutSessionFailed(
      checked.session.id,
      issued.outcome === "succeeded" ? "billing_key_missing" : issued.code
    )
    return { status: "rejected", message: GENERIC_FAILURE }
  }

  await upsertBillingCustomer({
    organizationId: checked.session.organizationId,
    customerKey: checked.session.customerKey,
    billingKey: issued.data.billingKey,
    cardCompany: issued.data.cardCompany ?? null,
    cardNumberMasked: issued.data.cardNumber ?? null
  })

  const charged = await chargeSubscription(runtime.config, {
    organizationId: checked.session.organizationId,
    billingKey: issued.data.billingKey,
    customerKey: checked.session.customerKey,
    planCode: plan.planCode,
    amount: plan.amount,
    orderId: checked.session.orderId,
    orderName: buildBillingOrderName(plan.name),
    idempotencyKey: checked.session.orderId,
    attemptKey: checked.session.paymentIdempotencyKey,
    eventType: "initial_payment_succeeded",
    applyEvent: applyVerifiedBillingEvent,
    // 첫 기간은 실제 승인 시각에서 시작한다. 그 날짜가 이후 갱신의 기준일이 된다.
    resolvePeriod: (approvedAt) => buildInitialBillingPeriod(new Date(approvedAt))
  })

  if (charged.status === "succeeded") {
    await markCheckoutSessionCompleted(
      checked.session.id,
      buildInitialBillingPeriod(new Date(charged.approvedAt)).anchorDay
    )
    return { status: "activated" }
  }

  if (charged.status === "pending") {
    // 세션은 authorized 로 남겨 둔다. 대사가 이 세션을 찾아 마무리한다.
    return { status: "pending", message: PENDING_MESSAGE }
  }

  await markCheckoutSessionFailed(checked.session.id, charged.code)
  return { status: "rejected", message: GENERIC_FAILURE }
}
