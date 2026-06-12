import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioClasses } from "@/features/studio/queries/get-studio-classes"
import { getStudioScheduleBlocks } from "@/features/studio/queries/get-studio-schedule-blocks"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import { StudioScheduleManager } from "@/features/studio/ui/studio-schedule-manager"
import Link from "next/link"

import styles from "./page.module.css"

export default async function StudioSchedulePage() {
  const teacher = await requireTeacherStudioAccess()
  const [{ data: scheduleBlocks, error }, { data: classes }] = await Promise.all([
    getStudioScheduleBlocks(teacher.teacherId),
    getStudioClasses(teacher.organizationId)
  ])
  const myClasses = classes.filter((item) => item.teacherId === teacher.teacherId)

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <StudioHomeLogo />
            <p className={styles.brandKicker}>운영자 센터</p>
            <h1 className={styles.title}>일정 관리</h1>
            <p className={styles.subtitle}>체험수업/레벨테스트 예약 가능 시간과 확정된 일정을 한눈에 확인해요.</p>
          </div>
          <div className={styles.headerActions}>
            <Link className={styles.secondaryButton} href="/studio/applications" prefetch={false}>
              신청 관리
            </Link>
            <Link className={styles.secondaryButton} href="/studio/classes" prefetch={false}>
              수업 관리
            </Link>
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
    </main>
  )
}
