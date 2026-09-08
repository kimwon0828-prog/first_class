// 판매 중인 플랜의 canonical 가격.
//
// ⚠️ 금액의 주인은 이 파일 하나다.
//   클라이언트가 보낸 amount 는 어떤 경우에도 신뢰하지 않는다. checkout 도 갱신도
//   여기서 읽은 값으로만 결제를 만든다. DB 에 가격을 복제하지 않는다 —
//   플랜이 하나뿐이고, 복제하면 두 값이 갈릴 때 어느 쪽이 참인지 알 수 없다.
//   (이미 결제된 건의 금액은 organization_payments 에 그대로 남는다.)

import {
  addBillingMonths,
  resolveBillingAnchorDay
} from "@/features/billing/lib/billing-period"
import type { OrganizationPaidPlanCode } from "@/shared/lib/db/adapter"

export type BillingInterval = "month"

export type BillingPlan = {
  planCode: OrganizationPaidPlanCode
  name: string
  /** 원 단위 정수. KRW 는 소수를 쓰지 않는다. */
  amount: number
  currency: "KRW"
  interval: BillingInterval
  /** 지금 판매하는가. pro 는 도메인만 열어 두고 결제를 만들지 않는다. */
  purchasable: boolean
}

export const BILLING_PLANS: Record<OrganizationPaidPlanCode, BillingPlan> = {
  standard: {
    planCode: "standard",
    name: "스탠다드",
    amount: 49000,
    currency: "KRW",
    interval: "month",
    purchasable: true
  },
  pro: {
    planCode: "pro",
    name: "프로",
    amount: 0,
    currency: "KRW",
    interval: "month",
    purchasable: false
  }
}

/** 결제를 만들 수 있는 플랜만 돌려준다. 아니면 null 이다. */
export const getPurchasableBillingPlan = (planCode: string): BillingPlan | null => {
  const plan = BILLING_PLANS[planCode as OrganizationPaidPlanCode]
  return plan && plan.purchasable ? plan : null
}

/**
 * 한 결제 주기만큼 뒤. 결제 성공 시 이용 기간의 끝이 된다.
 *
 * 달력 계산의 주인은 billing-period.ts 하나다. 여기서 다시 구현하지 않는다 —
 * 두 벌이 되면 월말 기준일 처리가 갈린다.
 */
export const addBillingInterval = (from: Date, interval: BillingInterval = "month") => {
  if (interval !== "month") {
    return new Date(from.getTime())
  }

  return addBillingMonths(from, resolveBillingAnchorDay(from))
}

/** 갱신 실패 유예. 이미 결제된 기간이 끝난 뒤부터 3일이다. */
export const BILLING_GRACE_PERIOD_DAYS = 3

/**
 * 갱신 실패 시 유예 종료 시각.
 *
 * 유예는 실패 episode 당 한 번만 만든다. 이미 유예 중이면(existingGracePeriodEnd 존재)
 * 그 값을 그대로 돌려준다 — 갱신 결제는 여러 번 재시도되므로, 실패마다 다시 계산하면
 * 유예가 밀리고(sliding grace) 끝난 유예가 늦은 실패 이벤트로 다시 열린다.
 * 새 유예는 갱신이 성공해 새 주기가 시작된 뒤의 첫 실패에서만 생긴다.
 *
 * 3일은 결제된 기간 "이후" 의 추가 유예다. 실패가 기간 종료 전에 일어나도
 * 이미 결제된 기간을 잘라먹지 않도록 늦은 쪽을 기준으로 삼는다.
 *
 *   grace = existing ?? max(current_period_end, failedAt) + 3일
 *
 * 기간을 모르면 유예를 주지 않는다(null). 그 구독은 이미 기간 판정으로 닫혀 있고,
 * 실패 이벤트가 오히려 접근을 열어 주면 안 된다.
 *
 * ⚠️ 실제 저장은 DB(apply_billing_event)가 잠근 구독 행을 보고 계산한다.
 *    이 함수는 같은 규칙을 화면·검증에서 재현하기 위한 것이며,
 *    scripts/verify-billing-events.ts 가 둘의 일치를 고정한다.
 */
export const resolveGracePeriodEnd = (
  currentPeriodEnd: string | Date | null,
  failedAt: Date,
  existingGracePeriodEnd: string | Date | null = null
): Date | null => {
  if (existingGracePeriodEnd) {
    const existing =
      existingGracePeriodEnd instanceof Date
        ? existingGracePeriodEnd
        : new Date(existingGracePeriodEnd)
    if (!Number.isNaN(existing.getTime())) {
      return existing
    }
  }

  if (!currentPeriodEnd) {
    return null
  }

  const periodEnd =
    currentPeriodEnd instanceof Date ? currentPeriodEnd : new Date(currentPeriodEnd)
  if (Number.isNaN(periodEnd.getTime())) {
    return null
  }

  const anchor = periodEnd.getTime() > failedAt.getTime() ? periodEnd : failedAt
  return new Date(anchor.getTime() + BILLING_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
}
