"use server"

import { randomUUID } from "node:crypto"
import { headers } from "next/headers"

import {
  CHECKOUT_SESSION_TTL_MS
} from "@/features/billing/lib/checkout/checkout-guards"
import { insertCheckoutSession } from "@/features/billing/lib/checkout/checkout-store"
import { getPurchasableBillingPlan } from "@/features/billing/lib/plan-catalog"
import { generateTossCustomerKey } from "@/features/billing/lib/toss/customer-key"
import { buildInitialBillingAttempt } from "@/features/billing/lib/toss/identifiers"
import { getTossRuntime } from "@/features/billing/lib/toss/server"
import { getOrganizationEntitlements } from "@/features/billing/queries/get-organization-entitlements"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import type { ActionResult } from "@/shared/actions"

// [스탠다드 시작] 의 서버 쪽.
//
// 여기서 하는 일은 "결제창을 띄울 준비" 까지다. 결제 자체는 카드 인증이 끝난 뒤
// callback 에서 일어난다. 그래서 이 action 은 구독을 절대 열지 않는다.
//
// client 에는 결제창을 띄우는 데 필요한 최소값만 준다.
//   clientKey    브라우저 SDK 용 공개 키
//   customerKey  서버가 발급한 난수 (client 가 고르지 않는다)
//   successUrl / failUrl
// billingKey · secretKey · 조직 id 는 내려보내지 않는다.

export type StandardCheckoutTicket = {
  clientKey: string
  customerKey: string
  successUrl: string
  failUrl: string
  amount: number
  planName: string
}

const CALLBACK_PATH = "/studio/billing/callback"
const FAIL_PATH = "/studio/billing"

const resolveOrigin = async (): Promise<string> => {
  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host")
  if (!host) {
    throw new Error("missing_request_host")
  }

  const protocol =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")

  return `${protocol}://${host}`
}

export const startStandardCheckout = async (): Promise<ActionResult<StandardCheckoutTicket>> => {
  const access = await requireTeacherStudioAccess()

  const runtime = getTossRuntime()
  if (runtime.status === "missing") {
    return { ok: false, message: "결제 준비가 아직 완료되지 않았습니다. 잠시 후 다시 시도해 주세요." }
  }
  if (runtime.status === "invalid") {
    // 키가 잘못 꽂힌 상태로 결제창을 띄우지 않는다.
    return { ok: false, message: "결제 설정을 확인하는 중입니다. 잠시 후 다시 시도해 주세요." }
  }

  const plan = getPurchasableBillingPlan("standard")
  if (!plan) {
    return { ok: false, message: "지금은 신청할 수 없는 플랜입니다." }
  }

  // 이미 유료로 열려 있으면 결제창을 띄우지 않는다(중복 결제 방지).
  try {
    const { billedPlanCode } = await getOrganizationEntitlements(access.organizationId)
    if (billedPlanCode !== "free") {
      return { ok: false, message: "이미 이용 중인 플랜이 있습니다." }
    }
  } catch {
    return { ok: false, message: "플랜 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }
  }

  const sessionId = randomUUID()
  const attempt = buildInitialBillingAttempt(sessionId)
  const customerKey = generateTossCustomerKey()

  try {
    await insertCheckoutSession({
      id: sessionId,
      organizationId: access.organizationId,
      customerKey,
      planCode: plan.planCode,
      // 금액의 주인은 서버 카탈로그다. client 가 보낸 값은 애초에 받지 않는다.
      amount: plan.amount,
      orderId: attempt.orderId,
      paymentIdempotencyKey: attempt.attemptKey,
      billingKeyIssueIdempotencyKey: `billing-key:${sessionId}`,
      requestedBy: access.id,
      expiresAt: new Date(Date.now() + CHECKOUT_SESSION_TTL_MS).toISOString()
    })
  } catch {
    return { ok: false, message: "결제를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요." }
  }

  const origin = await resolveOrigin()

  return {
    ok: true,
    data: {
      clientKey: runtime.clientKey,
      customerKey,
      successUrl: `${origin}${CALLBACK_PATH}`,
      failUrl: `${origin}${FAIL_PATH}?billing=failed`,
      amount: plan.amount,
      planName: plan.name
    }
  }
}
