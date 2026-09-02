import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { StudioScheduleManager } from "@/features/studio/ui/studio-schedule-manager"

import styles from "./page.module.css"

export default async function StudioSchedulePage() {
  const teacher = await requireTeacherStudioAccess()
  const { data: applications, error } = await getStudioApplications(teacher.organizationId)

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <StudioScheduleManager items={applications} error={error} />
      </div>
    </div>
  )
}
