"use client"
import { NotificationsFrame } from "@/features/notifications/ui/notifications-frame"
import { NotificationsRetry } from "@/features/notifications/ui/notifications-retry"
export default function Error({ reset }: { reset: () => void }) { return <NotificationsFrame><NotificationsRetry reset={reset} /></NotificationsFrame> }
