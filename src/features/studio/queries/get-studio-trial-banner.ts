import "server-only"

import { cache } from "react"

import { getPurchasableBillingPlan } from "@/features/billing/lib/plan-catalog"
import {
  TRIAL_BANNER_DAYS,
  buildTrialBannerMessage,
  daysLeftInTrial,
  isAutoTrialSubscription
} from "@/features/billing/lib/standard-trial"
import { getStandardTrialView, getStudioBillingSnapshot } from "@/features/billing/queries/get-standard-trial-view"

export type StudioTrialBanner = { message: string }

/**
 * Studio 상단 안내(STUDIO_DESIGN_SYSTEM.md §5.25). 자동 체험이 끝나기 14일 전부터만 있다.
 *
 * 표시 전용이라 실패해도 던지지 않는다. 14일 전이 아니면 카드 · 동의를 읽지 않는다 —
 * 대부분의 화면 요청에서 조회가 늘지 않는다(구독 snapshot 은 사이드바와 같은 요청 cache).
 */
export const getStudioTrialBanner = cache(async (organizationId: string): Promise<StudioTrialBanner | null> => {
  try {
    const snapshot = await getStudioBillingSnapshot(organizationId)
    const subscription = snapshot.subscription
    if (!isAutoTrialSubscription(subscription)) return null

    const now = new Date()
    const daysLeft = daysLeftInTrial(new Date(subscription.trialEndsAt), now)
    if (daysLeft < 1 || daysLeft > TRIAL_BANNER_DAYS) return null

    const view = await getStandardTrialView(organizationId, snapshot, now)
    const message = buildTrialBannerMessage(view, getPurchasableBillingPlan("standard")?.amount ?? 0)
    return message ? { message } : null
  } catch {
    return null
  }
})
