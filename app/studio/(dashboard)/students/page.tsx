import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { StudioQueryRetry } from "@/features/studio/ui/studio-query-retry"
import { STUDENT_TABS, type StudentTab } from "@/features/students/lib/student-grouping"
import { getRecontactPanelContext } from "@/features/students/queries/get-recontact-panel-context"
import { getStudioStudentsList } from "@/features/students/queries/get-studio-students"
import { StudentsScreen } from "@/features/students/ui/students-screen"

import styles from "./page.module.css"

type StudioStudentsPageProps = {
  searchParams?: Promise<{ tab?: string }>
}

const parseTab = (value: string | undefined): StudentTab =>
  STUDENT_TABS.some((tab) => tab.value === value) ? (value as StudentTab) : "recontact"

/**
 * 학생 · 다시 연락 (Figma 2148:5869). STUDIO_DESIGN_SYSTEM.md §5.27.
 * 학생은 신청을 묶어 만든다(student-grouping). 목록은 무료, 학원 소식 보내기는 스탠다드다.
 */
export default async function StudioStudentsPage({ searchParams }: StudioStudentsPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const params = searchParams ? await searchParams : undefined
  const [{ data, error }, panel] = await Promise.all([
    getStudioStudentsList(teacher.organizationId, new Date()),
    getRecontactPanelContext(teacher.organizationId)
  ])

  return (
    <div className={styles.page}>
      {error ? (
        <section className={styles.errorCard} role="alert">
          <p>{error}</p>
          <StudioQueryRetry />
        </section>
      ) : null}
      <StudentsScreen rows={data.rows} initialTab={parseTab(params?.tab)} panel={panel} />
    </div>
  )
}
