import type { ParentHomeAction } from "@/features/actions/lib/parent-home-actions"
import { NotificationLink } from "@/features/notifications/ui/notification-link"
import styles from "./home-report-cta.module.css"

export function HomeReportCta({ report }: { report: ParentHomeAction }) {
  return <aside className={styles.surface} aria-label={report.kind === "report_review" ? "체험 리포트" : "체험 후 생각"}>
    <span className={styles.icon} aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h5" /></svg></span>
    <div className={styles.copy}>
      <h2>{report.title}</h2>
      <p>{report.description}</p>
      <p className={styles.context}>{[report.childName, report.classTitle].filter(Boolean).join(" · ")}</p>
    </div>
    <NotificationLink notificationKey={report.notificationKey ?? ""} isUnread={report.kind === "report_review"} href={report.href} className={styles.action}>
      {report.ctaLabel}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </NotificationLink>
  </aside>
}
