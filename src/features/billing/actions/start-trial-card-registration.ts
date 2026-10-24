"use server"

import { randomUUID } from "node:crypto"

import { CHECKOUT_SESSION_TTL_MS } from "@/features/billing/lib/checkout/checkout-guards"
import { insertCheckoutSession } from "@/features/billing/lib/checkout/checkout-store"
import { buildCheckoutReturnUrls } from "@/features/billing/lib/checkout/checkout-urls"
import { getPurchasableBillingPlan } from "@/features/billing/lib/plan-catalog"
import { checkTrialCardRegistration } from "@/features/billing/lib/standard-trial"
import { generateTossCustomerKey } from "@/features/billing/lib/toss/customer-key"
import { buildInitialBillingAttempt } from "@/features/billing/lib/toss/identifiers"
import { getTossRuntimeForOrganization } from "@/features/billing/lib/toss/server"
import { readTrialCardFacts } from "@/features/billing/queries/get-standard-trial-view"
import type { StandardCheckoutTicket } from "@/features/billing/actions/start-standard-checkout"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import type { ActionResult } from "@/shared/actions"
import { dataAdapter } from "@/shared/lib/db"

// 자동 체험 중 [카드 등록]의 서버 쪽(STUDIO_DESIGN_SYSTEM.md §5.26).
//
// 결제창은 카드 인증(빌링키 발급)만 한다. 이 세션(purpose = register_card)의 callback 은
// 결제를 만들지 않는다 — 첫 결제는 마지막 체험일의 갱신 크론이 한다.
//
// 지키는 것
//   1. 동의 체크가 없으면 결제창을 열지 않는다(agreed 를 서버에서 다시 본다).
//   2. 카드 등록 창(종료 30일 전 ~ 종료)을 서버에서 강제한다. 화면이 버튼을 숨겨도 마찬가지다.
//   3. 조직은 세션에서 구한다. client 가 보낸 조직 · 금액은 받지 않는다.
//   4. 동의 시각은 따로 저장하지 않는다. 이 세션의 completed_at 이 동의 시각이다.

const BILLING_UNAVAILABLE_MESSAGE = "결제 기능을 준비 중이에요. 잠시 후 다시 시도해 주세요."

export const startTrialCardRegistration = async (input: {
  agreed: boolean
}): Promise<ActionResult<StandardCheckoutTicket>> => {
  const access = await requireTeacherStudioAccess()

  if (input?.agreed !== true) {
    return { ok: false, message: "결제일과 금액을 확인하고 동의해 주세요." }
  }

  const runtime = getTossRuntimeForOrganization(access.organizationId)
  if (runtime.status !== "ready") {
    return { ok: false, message: BILLING_UNAVAILABLE_MESSAGE }
  }

  const plan = getPurchasableBillingPlan("standard")
  if (!plan) {
    return { ok: false, message: "지금은 신청할 수 없는 플랜이에요." }
  }

  try {
    const [snapshot, facts] = await Promise.all([
      dataAdapter.getOrganizationBillingSnapshot(access.organizationId),
      readTrialCardFacts(access.organizationId)
    ])
    const checked = checkTrialCardRegistration(snapshot.subscription, {
      now: new Date(),
      ...facts,
      checkAlreadyRegistered: true
    })
    if (!checked.ok) {
      return { ok: false, message: checked.message }
    }
  } catch {
    return { ok: false, message: "플랜 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." }
  }

  const sessionId = randomUUID()
  // 이 주문번호로는 결제를 만들지 않는다. 세션 테이블의 NOT NULL · unique 계약을 지키려고 채운다.
  const attempt = buildInitialBillingAttempt(sessionId)
  const customerKey = generateTossCustomerKey()

  try {
    await insertCheckoutSession({
      id: sessionId,
      organizationId: access.organizationId,
      customerKey,
      planCode: plan.planCode,
      amount: plan.amount,
      orderId: attempt.orderId,
      paymentIdempotencyKey: attempt.attemptKey,
      billingKeyIssueIdempotencyKey: `billing-key:${sessionId}`,
      requestedBy: access.id,
      expiresAt: new Date(Date.now() + CHECKOUT_SESSION_TTL_MS).toISOString(),
      purpose: "register_card"
    })
  } catch {
    return { ok: false, message: "카드 등록을 시작하지 못했어요. 잠시 후 다시 시도해 주세요." }
  }

  const { successUrl, failUrl } = await buildCheckoutReturnUrls("register_card")

  return {
    ok: true,
    data: {
      clientKey: runtime.clientKey,
      customerKey,
      successUrl,
      failUrl,
      amount: plan.amount,
      planName: plan.name
    }
  }
}
