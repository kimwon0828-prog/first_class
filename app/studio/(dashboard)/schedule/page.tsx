import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioClasses } from "@/features/studio/queries/get-studio-classes"
import { getStudioScheduleBlocks } from "@/features/studio/queries/get-studio-schedule-blocks"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import { StudioScheduleManager } from "@/features/studio/ui/studio-schedule-manager"

import styles from "./page.module.css"

export default async function StudioSchedulePage() {
  const teacher = await requireTeacherStudioAccess()
  const [{ data: scheduleBlocks, error }, { data: classes }] = await Promise.all([
    getStudioScheduleBlocks(teacher.teacherId),
    getStudioClasses(teacher.organizationId)
  ])
  const myClasses = classes.filter((item) => item.teacherId === teacher.teacherId)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <StudioHomeLogo />
            <p className={styles.brandKicker}>운영자 센터</p>
            <h1 className={styles.title}>일정 관리</h1>
            <p className={styles.subtitle}>체험수업/레벨테스트 예약 가능 시간과 확정된 일정을 한눈에 확인해요.</p>
          </div>
        </div>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : (
        <StudioScheduleManager items={scheduleBlocks} classes={myClasses} />
      )}
    </div>
  )
}
