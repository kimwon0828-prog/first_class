import "server-only"

import { applyVerifiedBillingEvent } from "@/features/billing/actions/apply-billing-event"
import {
  findActiveBillingCustomer,
  upsertBillingCustomer
} from "@/features/billing/lib/checkout/billing-customer-store"
import {
  CHECKOUT_SESSION_TTL_MS,
  checkCheckoutCallback
} from "@/features/billing/lib/checkout/checkout-guards"
import {
  claimCheckoutSession,
  findCheckoutSessionByCustomerKey,
  markCheckoutSessionCompleted,
  markCheckoutSessionFailed,
  releaseCheckoutSession
} from "@/features/billing/lib/checkout/checkout-store"
import { chargeSubscription } from "@/features/billing/lib/charge/charge-subscription"
import { ensureBillingPaymentAttempt } from "@/features/billing/lib/charge/payment-attempt"
import { buildInitialBillingPeriod } from "@/features/billing/lib/billing-period"
import { getPurchasableBillingPlan } from "@/features/billing/lib/plan-catalog"
import { checkTrialCardRegistration } from "@/features/billing/lib/standard-trial"
import { issueTossBillingKey } from "@/features/billing/lib/toss/client"
import { buildBillingOrderName } from "@/features/billing/lib/toss/identifiers"
import { getTossRuntimeForOrganization } from "@/features/billing/lib/toss/server"
import { pickStorableCardDisplay } from "@/features/billing/lib/toss/verify-payment"
import type { CheckoutSessionSnapshot } from "@/features/billing/lib/checkout/checkout-guards"
import type { CheckoutLease } from "@/features/billing/lib/checkout/checkout-store"
import type { TossClientConfig } from "@/features/billing/lib/toss/client"
import { dataAdapter } from "@/shared/lib/db"

// 카드 인증이 끝난 뒤의 서버 처리.
//
// 순서를 지킨다. 빌링키가 나왔다고 스탠다드를 열지 않는다.
//   빌링키 발급 → 최초 결제(plan-catalog 금액) → 결제 검증 → initial_payment_succeeded → active
// 첫 결제가 실패하면 entitlement 는 열리지 않는다. 무료 체험은 checkout 이 아니라 승인 RPC 가 연다.

export type CheckoutCompletion =
  | { status: "activated" }
  /** 자동 체험 중 카드만 등록했다. 결제는 하지 않았다. */
  | { status: "card_registered" }
  /** 결제 결과를 아직 모른다. 대사가 마무리한다. */
  | { status: "pending"; message: string }
  /** purpose 가 register_card 면 화면 문구가 "카드를 등록하지 못했어요" 다. */
  | { status: "rejected"; message: string; purpose?: "register_card" }

const GENERIC_FAILURE = "결제를 완료하지 못했습니다. 카드사 정보를 확인한 뒤 다시 시도해 주세요."
const PENDING_MESSAGE = "결제 결과를 확인하고 있습니다. 잠시 후 결제 상태가 반영됩니다."

export const completeStandardCheckout = async (input: {
  actorOrganizationId: string
  customerKey: string
  authKey: string
}): Promise<CheckoutCompletion> => {
  const session = await findCheckoutSessionByCustomerKey(input.customerKey)
  const checked = checkCheckoutCallback(session, input)
  if (!checked.ok) {
    return { status: "rejected", message: checked.message }
  }

  // ⚠️ runtime 판정은 session 검증 뒤에 한다. 조직은 DB 의 checkout session 에서 읽은
  //    값만 쓴다 — callback 은 브라우저가 돌아오는 경로라 넘어온 값을 신뢰하지 않는다.
  //    (checkCheckoutCallback 이 actorOrganizationId 와의 일치도 이미 확인했다.)
  const runtime = getTossRuntimeForOrganization(checked.session.organizationId)
  if (runtime.status !== "ready") {
    return { status: "rejected", message: GENERIC_FAILURE }
  }

  if (checked.session.status === "completed") {
    return checked.session.purpose === "register_card" ? { status: "card_registered" } : { status: "activated" }
  }

  // 활성 lease는 하나뿐이고, worker crash 뒤에는 같은 세션을 재개할 수 있다.
  const claimed = await claimCheckoutSession(checked.session.id)
  if (!claimed) {
    return { status: "pending", message: PENDING_MESSAGE }
  }

  // 자동 체험 중 카드 등록: 빌링키만 발급하고 끝낸다. 이 경로는 결제를 만들지 않는다.
  if (checked.session.purpose === "register_card") {
    return completeTrialCardRegistration(runtime.config, checked.session, input.authKey, claimed)
  }

  const plan = getPurchasableBillingPlan(checked.session.planCode)
  if (!plan || plan.amount !== checked.session.amount) {
    // 시작 시점과 카탈로그가 어긋났다. 결제를 만들지 않는다.
    await markCheckoutSessionFailed(checked.session.id, "plan_changed", claimed)
    return { status: "rejected", message: GENERIC_FAILURE }
  }

  let customer = await findActiveBillingCustomer(checked.session.organizationId)
  if (!customer || customer.customerKey !== checked.session.customerKey) {
    const issued = await issueTossBillingKey(runtime.config, {
      authKey: input.authKey,
      customerKey: checked.session.customerKey,
      idempotencyKey: checked.session.billingKeyIssueIdempotencyKey
    })

    if (issued.outcome === "unknown") {
      await releaseCheckoutSession(checked.session.id, claimed)
      return { status: "pending", message: PENDING_MESSAGE }
    }

    if (issued.outcome !== "succeeded" || !issued.data?.billingKey) {
      await markCheckoutSessionFailed(
        checked.session.id,
        issued.outcome === "succeeded" ? "billing_key_missing" : issued.code,
        claimed
      )
      return { status: "rejected", message: GENERIC_FAILURE }
    }

    await upsertBillingCustomer({
      organizationId: checked.session.organizationId,
      customerKey: checked.session.customerKey,
      billingKey: issued.data.billingKey,
      ...pickStorableCardDisplay(issued.data)
    })
    customer = {
      organizationId: checked.session.organizationId,
      customerKey: checked.session.customerKey,
      billingKey: issued.data.billingKey,
      status: "active"
    }
  }

  const provisionalPeriod = buildInitialBillingPeriod(
    new Date(new Date(checked.session.expiresAt).getTime() - CHECKOUT_SESSION_TTL_MS)
  )

  const charged = await chargeSubscription(runtime.config, {
    organizationId: checked.session.organizationId,
    billingKey: customer.billingKey,
    customerKey: checked.session.customerKey,
    planCode: plan.planCode,
    amount: plan.amount,
    orderId: checked.session.orderId,
    orderName: buildBillingOrderName(plan.name),
    idempotencyKey: checked.session.orderId,
    attemptKey: checked.session.paymentIdempotencyKey,
    attemptKind: "initial",
    attemptNumber: 0,
    checkoutSessionId: checked.session.id,
    attemptPeriod: provisionalPeriod,
    eventType: "initial_payment_succeeded",
    applyEvent: applyVerifiedBillingEvent,
    ensureAttempt: ensureBillingPaymentAttempt,
    // 첫 기간은 실제 승인 시각에서 시작한다. 그 날짜가 이후 갱신의 기준일이 된다.
    resolvePeriod: (approvedAt) => buildInitialBillingPeriod(new Date(approvedAt))
  })

  if (charged.status === "succeeded") {
    await markCheckoutSessionCompleted(
      checked.session.id,
      buildInitialBillingPeriod(new Date(charged.approvedAt)).anchorDay,
      claimed
    )
    return { status: "activated" }
  }

  if (charged.status === "pending") {
    await releaseCheckoutSession(checked.session.id, claimed)
    return { status: "pending", message: PENDING_MESSAGE }
  }

  if (charged.status === "mismatch") {
    await releaseCheckoutSession(checked.session.id, claimed)
    return { status: "pending", message: PENDING_MESSAGE }
  }

  await markCheckoutSessionFailed(checked.session.id, charged.code, claimed)
  return { status: "rejected", message: GENERIC_FAILURE }
}

const CARD_REGISTRATION_FAILURE = "카드를 등록하지 못했어요. 카드 정보를 확인한 뒤 다시 시도해 주세요."

/**
 * 자동 체험 중 카드 등록 완료(STUDIO_DESIGN_SYSTEM.md §5.26).
 *
 *   체험 · 창 다시 확인 → 빌링키 발급 → 결제수단 저장 → 세션 완료(completed_at = 동의 시각)
 *
 * 결제창에 머무는 사이 체험이 끝났거나 해지가 예약됐으면 빌링키를 발급하지 않는다.
 * 첫 결제는 마지막 체험일의 갱신 크론이 이 세션의 completed_at 을 동의로 보고 한다.
 */
const completeTrialCardRegistration = async (
  config: TossClientConfig,
  session: CheckoutSessionSnapshot,
  authKey: string,
  claimed: CheckoutLease
): Promise<CheckoutCompletion> => {
  let subscription
  try {
    subscription = (await dataAdapter.getOrganizationBillingSnapshot(session.organizationId)).subscription
  } catch {
    await releaseCheckoutSession(session.id, claimed)
    return { status: "rejected", message: CARD_REGISTRATION_FAILURE, purpose: "register_card" }
  }

  const trialCheck = checkTrialCardRegistration(subscription, {
    now: new Date(),
    hasActiveBillingMethod: false,
    consentedAt: null,
    checkAlreadyRegistered: false
  })
  if (!trialCheck.ok) {
    await markCheckoutSessionFailed(session.id, `trial_${trialCheck.code}`, claimed)
    return { status: "rejected", message: trialCheck.message, purpose: "register_card" }
  }

  const existing = await findActiveBillingCustomer(session.organizationId)
  if (!existing || existing.customerKey !== session.customerKey) {
    const issued = await issueTossBillingKey(config, {
      authKey,
      customerKey: session.customerKey,
      idempotencyKey: session.billingKeyIssueIdempotencyKey
    })

    if (issued.outcome === "unknown") {
      await releaseCheckoutSession(session.id, claimed)
      return { status: "pending", message: "카드 등록 결과를 확인하고 있어요. 잠시 후 다시 확인해 주세요." }
    }

    if (issued.outcome !== "succeeded" || !issued.data?.billingKey) {
      await markCheckoutSessionFailed(
        session.id,
        issued.outcome === "succeeded" ? "billing_key_missing" : issued.code,
        claimed
      )
      return { status: "rejected", message: CARD_REGISTRATION_FAILURE, purpose: "register_card" }
    }

    await upsertBillingCustomer({
      organizationId: session.organizationId,
      customerKey: session.customerKey,
      billingKey: issued.data.billingKey,
      ...pickStorableCardDisplay(issued.data)
    })
  }

  // register_card 세션은 구독 주기를 시작하지 않는다(anchor_day = null).
  await markCheckoutSessionCompleted(session.id, null, claimed)
  return { status: "card_registered" }
}
