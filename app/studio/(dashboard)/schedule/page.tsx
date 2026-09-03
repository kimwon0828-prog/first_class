import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import {
  parseStudioScheduleUrlState,
  type StudioScheduleSearchParams
} from "@/features/studio/lib/studio-schedule-url-state"
import { StudioScheduleManager } from "@/features/studio/ui/studio-schedule-manager"

import styles from "./page.module.css"

type StudioSchedulePageProps = {
  searchParams?: Promise<StudioScheduleSearchParams>
}

export default async function StudioSchedulePage({ searchParams }: StudioSchedulePageProps) {
  const teacher = await requireTeacherStudioAccess()
  const { data: applications, error } = await getStudioApplications(teacher.organizationId)
  // view/date/filter 를 서버에서 먼저 읽어 첫 렌더부터 URL 상태를 반영한다.
  const initialUrlState = parseStudioScheduleUrlState((await searchParams) ?? {})

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <StudioScheduleManager
          items={applications}
          error={error}
          initialUrlState={initialUrlState}
          nowIso={new Date().toISOString()}
        />
      </div>
    </div>
  )
}
