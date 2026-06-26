import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioDashboardTeacherOptions } from "@/features/studio/queries/get-studio-dashboard-teacher-options"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { StudioScheduleManager } from "@/features/studio/ui/studio-schedule-manager"
import { StudioTeacherFilter } from "@/features/studio/ui/studio-teacher-filter"

import styles from "./page.module.css"

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StudioSchedulePageProps = {
  searchParams?: Promise<{ teacherId?: string }>
}

export default async function StudioSchedulePage({ searchParams }: StudioSchedulePageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const teacherIdParam = String(resolvedSearchParams?.teacherId ?? "").trim()
  const { data: filterOptions, error: filterError } = await getStudioDashboardTeacherOptions(
    teacher.organizationId
  )
  const availableTeacherIdSet = new Set(filterOptions.map((option) => option.teacherId))
  const validatedTeacherId =
    teacherIdParam &&
    teacherIdParam !== "all" &&
    uuidPattern.test(teacherIdParam) &&
    availableTeacherIdSet.has(teacherIdParam)
      ? teacherIdParam
      : null
  const selectedTeacherId = validatedTeacherId ?? "all"

  const { data: applications, error } = await getStudioApplications(teacher.organizationId, {
    teacherId: validatedTeacherId
  })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>일정 관리</h1>
            <p className={styles.subtitle}>
              조직 전체의 확정된 체험수업과 검토 중인 신청 일정을 한눈에 확인해요.
            </p>
          </div>
          <StudioTeacherFilter
            options={filterOptions}
            selectedTeacherId={selectedTeacherId}
            basePath="/studio/schedule"
          />
        </div>
      </header>

      {filterError ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{filterError}</p>
        </section>
      ) : null}

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
