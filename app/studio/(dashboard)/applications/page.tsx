import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { getStudioDashboardTeacherOptions } from "@/features/studio/queries/get-studio-dashboard-teacher-options"
import { StudioApplicationTable } from "@/features/studio/ui/studio-application-table"
import { StudioDateRangeFilter } from "@/features/studio/ui/studio-date-range-filter"
import { StudioTeacherFilter } from "@/features/studio/ui/studio-teacher-filter"

import styles from "./page.module.css"

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StudioApplicationsPageProps = {
  searchParams?: Promise<{ teacherId?: string; startDate?: string; endDate?: string }>
}

export default async function StudioApplicationsPage({ searchParams }: StudioApplicationsPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const teacherIdParam = String(resolvedSearchParams?.teacherId ?? "").trim()
  const selectedDateRange = resolveStudioDateRange({
    startDate: resolvedSearchParams?.startDate,
    endDate: resolvedSearchParams?.endDate
  })
  // 형식만 먼저 거르고, 소속 검증은 filterOptions 가 도착한 뒤에 한다.
  const candidateTeacherId =
    teacherIdParam && teacherIdParam !== "all" && uuidPattern.test(teacherIdParam)
      ? teacherIdParam
      : null
  const [{ data: filterOptions, error: filterError }, candidateApplicationsResult] =
    await Promise.all([
      getStudioDashboardTeacherOptions(teacher.organizationId),
      getStudioApplications(teacher.organizationId, {
        teacherId: candidateTeacherId,
        createdAtFrom: selectedDateRange.createdAtFrom,
        createdAtTo: selectedDateRange.createdAtTo
      })
    ])
  const availableTeacherIdSet = new Set(filterOptions.map((option) => option.teacherId))
  const validatedTeacherId =
    candidateTeacherId && availableTeacherIdSet.has(candidateTeacherId) ? candidateTeacherId : null
  const selectedTeacherId = validatedTeacherId ?? "all"
  const selectedTeacherName =
    selectedTeacherId !== "all"
      ? (filterOptions.find((option) => option.teacherId === selectedTeacherId)?.teacherName ?? null)
      : null
  // candidate 가 이 organization 의 teacher 가 아니면 기존과 동일하게 전체 결과여야 한다.
  const { data, error } =
    candidateTeacherId && !validatedTeacherId
      ? await getStudioApplications(teacher.organizationId, {
          teacherId: null,
          createdAtFrom: selectedDateRange.createdAtFrom,
          createdAtTo: selectedDateRange.createdAtTo
        })
      : candidateApplicationsResult

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>신청 관리</h1>
          <p className={styles.subtitle}>
            체험 신청을 확정하고 등록까지 흐름을 관리해요.
            {selectedTeacherName ? ` · ${selectedTeacherName} 기준` : ""}
          </p>
        </div>
        <div className={styles.headerFilters}>
          <StudioDateRangeFilter
            selectedRange={selectedDateRange}
            basePath="/studio/applications"
            title="기간"
            compact
          />
          <div className={styles.teacherFilterWrap}>
            <StudioTeacherFilter
              options={filterOptions}
              selectedTeacherId={selectedTeacherId}
              basePath="/studio/applications"
            />
          </div>
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
      ) : null}

      {!error ? (
        <section className={styles.workspace} aria-label="신청 목록과 전환 파이프라인">
          <StudioApplicationTable items={data} periodLabel={selectedDateRange.label} />
        </section>
      ) : null}
    </div>
  )
}
