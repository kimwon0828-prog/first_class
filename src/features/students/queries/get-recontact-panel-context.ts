import "server-only"

import { getStudioEntitlementsForDisplay } from "@/features/billing/queries/get-organization-entitlements"
import type { RecontactPanelContext } from "@/features/students/lib/recontact-gate"
import { getLocalMutationGuard, getRecontactOptOutNumber } from "@/shared/config/server-env"
import { toParentUrl } from "@/shared/config/site-origins"
import { dataAdapter } from "@/shared/lib/db"

/** 보내기 패널 값. 읽기 실패는 막힌 쪽(보낼 수 없음)으로 접는다 — 서버 액션이 다시 확인한다. */
export const getRecontactPanelContext = async (organizationId: string): Promise<RecontactPanelContext> => {
  const [{ entitlements }, sender, usage, classes] = await Promise.all([
    getStudioEntitlementsForDisplay(organizationId),
    dataAdapter.getStudioRecontactSender(organizationId).catch(() => null),
    dataAdapter.getStudioRecontactUsage(organizationId).catch(() => null),
    dataAdapter.listStudioClasses(organizationId).catch(() => [])
  ])

  return {
    entitled: entitlements.canSendRecontactMessages,
    localGuardAllowed: getLocalMutationGuard().allowed,
    academyName: sender?.academyName || "학원",
    optOutNumber: getRecontactOptOutNumber(),
    usage,
    classes: classes
      .filter((item) => item.isActive && !item.archivedAt)
      .map((item) => ({ id: item.id, title: item.title })),
    classLinkBase: toParentUrl("/classes/"),
    checkedAt: new Date().toISOString()
  }
}
