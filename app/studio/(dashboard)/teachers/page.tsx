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
