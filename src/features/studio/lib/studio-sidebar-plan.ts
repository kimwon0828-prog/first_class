import { resolveBilledPlanCode } from "@/features/billing/lib/entitlements"
import type { OrganizationBillingSnapshot } from "@/shared/lib/db/adapter"

/*
 * 사이드바 하단 "현재 플랜" 카드의 표현 모델.
 *
 * 무엇이 유료인지는 여기서 다시 판정하지 않는다. 결제 사실(billed plan)은
 * entitlements.ts 의 resolveBilledPlanCode 를 그대로 쓴다 — 기간이 지난 구독은 거기서
 * 이미 무료로 떨어진다. 내부 전체 권한(override)은 결제가 아니므로 플랜 이름에 섞지 않는다
 * (subscription-presentation.ts 와 같은 원칙).
 *
 * 남은 일수는 "체험 중"일 때만 보여준다.
 */

const DAY_MS = 24 * 60 * 60 * 1000

const PLAN_LABEL = {
  free: "무료 플랜",
  standard: "스탠다드",
  pro: "프로"
} as const

export type StudioSidebarPlanTrial = {
  /** 남은 일수. 1일 미만이 남아도 1일로 센다. */
  daysLeft: number
  /** 체험 기간 중 지난 비율(0~1). 시작일을 모르면 null — 막대를 그리지 않는다. */
  elapsedRatio: number | null
}

export type StudioSidebarPlan = {
  label: string
  trial: StudioSidebarPlanTrial | null
}

const toTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

export const buildStudioSidebarPlan = (
  snapshot: OrganizationBillingSnapshot,
  now: Date = new Date()
): StudioSidebarPlan => {
  const billedPlanCode = resolveBilledPlanCode(snapshot, now)
  const subscription = snapshot.subscription

  if (billedPlanCode === "free" || !subscription || subscription.status !== "trialing") {
    return { label: PLAN_LABEL[billedPlanCode], trial: null }
  }

  // resolveBilledPlanCode 가 유료로 판정했다면 trialing 구독의 종료 시각은 있고 미래다.
  const endMs = toTimestamp(subscription.currentPeriodEnd)
  if (endMs == null) {
    return { label: PLAN_LABEL[billedPlanCode], trial: null }
  }

  const nowMs = now.getTime()
  const startMs = toTimestamp(subscription.currentPeriodStart)
  const elapsedRatio =
    startMs != null && endMs > startMs ? Math.min(1, Math.max(0, (nowMs - startMs) / (endMs - startMs))) : null

  return {
    label: `${PLAN_LABEL[billedPlanCode]} 무료 체험`,
    trial: {
      daysLeft: Math.max(1, Math.ceil((endMs - nowMs) / DAY_MS)),
      elapsedRatio
    }
  }
}
