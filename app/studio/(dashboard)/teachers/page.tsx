import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioTeachers } from "@/features/studio/queries/get-studio-teachers"
import { StudioTeachersManager } from "@/features/studio/ui/studio-teachers-manager"
import styles from "./page.module.css"

export default async function StudioTeachersPage() {
  const teacher = await requireTeacherStudioAccess()
  const { data, error } = await getStudioTeachers(teacher.organizationId)

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>선생님 관리</h1>
            <p className={styles.description}>학부모에게 보여질 선생님 정보를 등록하고 관리해요.</p>
          </div>
        </header>

        {error ? (
          <section className={styles.errorCard}>
            <p className={styles.errorText}>{error}</p>
          </section>
        ) : (
          <StudioTeachersManager items={data.teachers} seatSummary={data.seatSummary} />
        )}
      </div>
    </div>
  )
}
