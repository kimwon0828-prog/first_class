import "server-only"
import { logHomeEnhancementFailure, settleHomeEnhancement } from "@/features/classes/lib/home-enhancement"
import { getParentNotifications, type ParentNotificationsResult } from "./get-parent-notifications"

const UNAVAILABLE: ParentNotificationsResult = {
  notifications: [], error: "알림 상태를 불러오지 못했어요.", readStateStatus: "unavailable"
}

export async function getHomeNotifications(parentId: string): Promise<ParentNotificationsResult> {
  return settleHomeEnhancement("notifications", async () => {
    const result = await getParentNotifications(parentId)
    if (!result || !Array.isArray(result.notifications) || result.notifications.some(item => !item || typeof item.id !== "string")) {
      throw new Error("Invalid notification payload")
    }
    if (result.error) logHomeEnhancementFailure("notifications", new Error(result.error))
    return result
  }, UNAVAILABLE)
}

export function hasHomeUnreadNotifications(result: ParentNotificationsResult | null): boolean {
  return result?.readStateStatus === "available" && !result.error &&
    Array.isArray(result.notifications) && result.notifications.some(item => item?.isUnread === true)
}
