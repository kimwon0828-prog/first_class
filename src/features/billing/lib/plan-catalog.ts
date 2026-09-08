// 판매 중인 플랜의 canonical 가격.
//
// ⚠️ 금액의 주인은 이 파일 하나다.
//   클라이언트가 보낸 amount 는 어떤 경우에도 신뢰하지 않는다. checkout 도 갱신도
//   여기서 읽은 값으로만 결제를 만든다. DB 에 가격을 복제하지 않는다 —
//   플랜이 하나뿐이고, 복제하면 두 값이 갈릴 때 어느 쪽이 참인지 알 수 없다.
//   (이미 결제된 건의 금액은 organization_payments 에 그대로 남는다.)

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

/** 한 결제 주기만큼 뒤. 결제 성공 시 이용 기간의 끝이 된다. */
export const addBillingInterval = (from: Date, interval: BillingInterval = "month") => {
  const next = new Date(from.getTime())
  if (interval === "month") {
    const day = next.getUTCDate()
    next.setUTCMonth(next.getUTCMonth() + 1)
    // 1/31 → 2/31 같은 넘침은 그 달의 마지막 날로 잡는다.
    if (next.getUTCDate() < day) {
      next.setUTCDate(0)
    }
  }

  return next
}

/** 갱신 실패 유예. 결제 실패 시각부터 3일이다. */
export const BILLING_GRACE_PERIOD_DAYS = 3

export const addGracePeriod = (from: Date) =>
  new Date(from.getTime() + BILLING_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
