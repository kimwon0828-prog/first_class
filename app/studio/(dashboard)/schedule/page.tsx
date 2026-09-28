import { getStudioScheduleRange } from "@/features/studio/lib/studio-schedule-range"
import { getSeoulTodayKey } from "@/features/studio/lib/studio-schedule-month"
import { dataAdapter } from "@/shared/lib/db"
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
  // view/date/filter 를 서버에서 먼저 읽어 첫 렌더부터 URL 상태를 반영한다.
  const initialUrlState = parseStudioScheduleUrlState((await searchParams) ?? {})
  const now = new Date()
  initialUrlState.dateKey ??= getSeoulTodayKey(now)
  const range = getStudioScheduleRange(initialUrlState.view, initialUrlState.dateKey)
  const [result, optionsResult] = await Promise.all([
    getStudioApplications(teacher.organizationId, { scheduleRange: range }),
    dataAdapter.getStudioScheduleFilterOptions(teacher.organizationId)
      .then(data => ({ data, error: null as string | null }))
      .catch(() => ({ data: { teachers: [], classes: [] }, error: "일정 필터를 불러오지 못했습니다." }))
  ])


  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <StudioScheduleManager
          key={JSON.stringify(initialUrlState)}
          items={result.data}
          error={result.error ?? optionsResult.error}
          filterOptions={optionsResult.data}
          initialUrlState={initialUrlState}
          nowIso={now.toISOString()}
        />
      </div>
    </div>
  )
}
