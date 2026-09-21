import { NotificationsFrame } from "@/features/notifications/ui/notifications-frame"
import styles from "./page.module.css"
export default function Loading() {
 return <NotificationsFrame><div className={styles.skeletons} role="status" aria-busy="true" aria-label="알림 불러오는 중"><div className={styles.skeletonHeading} />{[0,1,2].map(i => <div key={i} className={styles.skeletonRow} aria-hidden="true"><span /><div /></div>)}</div></NotificationsFrame>
}
