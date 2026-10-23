import "server-only"

import { cache } from "react"

import { buildStudioSidebarPlan, type StudioSidebarPlan } from "@/features/studio/lib/studio-sidebar-plan"
import { dataAdapter } from "@/shared/lib/db"

/**
 * 사이드바 플랜 카드용 조회. 기존 billing snapshot 을 읽기만 한다.
 *
 * 표시 전용이라 실패해도 던지지 않는다 — null 이면 카드를 그리지 않는다.
 * 플랜을 모르는 채로 "무료 플랜"이라고 적으면 유료 학원에게 틀린 말을 하게 된다.
 */
export const getStudioSidebarPlan = cache(async (organizationId: string): Promise<StudioSidebarPlan | null> => {
  try {
    const snapshot = await dataAdapter.getOrganizationBillingSnapshot(organizationId)
    return buildStudioSidebarPlan(snapshot)
  } catch {
    return null
  }
})
