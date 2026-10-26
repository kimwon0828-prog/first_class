import { NotificationsFrame } from "@/features/notifications/ui/notifications-frame"
import { AppLoading } from "@/features/classes/ui/parent-app-ui"
export default function Loading() {
 return <NotificationsFrame><AppLoading label="알림 불러오는 중" /></NotificationsFrame>
}
