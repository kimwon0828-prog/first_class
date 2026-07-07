import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioClasses } from "@/features/studio/queries/get-studio-classes"
import { StudioClassesManager } from "@/features/studio/ui/studio-classes-manager"
import styles from "./page.module.css"

export default async function StudioClassesPage() {
  const teacher = await requireTeacherStudioAccess()
  const { data: classes, error } = await getStudioClasses(teacher.organizationId)

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>수업 관리</h1>
            <p className={styles.description}>학부모에게 노출되는 첫수업 정보를 등록하고 관리해요.</p>
          </div>
        </header>

        {error ? (
          <section className={styles.alertDanger}>
            <p className={styles.alertText}>{error}</p>
          </section>
        ) : (
          <StudioClassesManager items={classes} />
        )}
      </div>
    </div>
  )
}
