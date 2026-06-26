import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { StudioScheduleManager } from "@/features/studio/ui/studio-schedule-manager"

import styles from "./page.module.css"

export default async function StudioSchedulePage() {
  const teacher = await requireTeacherStudioAccess()
  const { data: applications, error } = await getStudioApplications(teacher.organizationId, {
    teacherId: teacher.teacherId
  })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>일정 관리</h1>
            <p className={styles.subtitle}>
              월간 캘린더에서 확정된 체험수업과 검토 중인 신청 일정을 한눈에 확인해요.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : (
        <StudioScheduleManager items={applications} />
      )}
    </div>
  )
}
