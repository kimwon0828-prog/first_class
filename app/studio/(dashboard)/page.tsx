import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import { getStudioOrganizationName } from "@/features/studio/lib/get-studio-organization-name"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { getStudioDashboardTeacherOptions } from "@/features/studio/queries/get-studio-dashboard-teacher-options"
import { buildStudioDashboardSummary } from "@/features/studio/queries/get-studio-dashboard-summary"
import { StudioDateRangeFilter } from "@/features/studio/ui/studio-date-range-filter"
import { StudioDashboardSummaryView } from "@/features/studio/ui/studio-dashboard-summary"
import { StudioTeacherFilter } from "@/features/studio/ui/studio-teacher-filter"

import styles from "@/features/studio/ui/studio-dashboard.module.css"

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StudioIndexPageProps = {
  searchParams?: Promise<{ teacherId?: string; startDate?: string; endDate?: string }>
}

const formatToday = () =>
  new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date())

export default async function StudioIndexPage({ searchParams }: StudioIndexPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const teacherIdParam = String(resolvedSearchParams?.teacherId ?? "").trim()
  const selectedDateRange = resolveStudioDateRange({
    startDate: resolvedSearchParams?.startDate,
    endDate: resolvedSearchParams?.endDate
  })
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
  const selectedTeacherName =
    selectedTeacherId !== "all"
      ? (filterOptions.find((option) => option.teacherId === selectedTeacherId)?.teacherName ?? null)
      : null
  const organizationName = selectedTeacherName
    ? "학원"
    : ((await getStudioOrganizationName(teacher.organizationId)) ?? "학원")

  const greetingTitle = selectedTeacherName
    ? `안녕하세요, ${selectedTeacherName} 선생님`
    : `안녕하세요, ${organizationName} 관리자님`

  const { data: applications, error } = await getStudioApplications(teacher.organizationId, {
    teacherId: validatedTeacherId,
    createdAtFrom: selectedDateRange.createdAtFrom,
    createdAtTo: selectedDateRange.createdAtTo
  })
  const summary = buildStudioDashboardSummary(applications)
  const applicationsParams = new URLSearchParams()

  if (validatedTeacherId) {
    applicationsParams.set("teacherId", validatedTeacherId)
  }

  if (selectedDateRange.startDate && selectedDateRange.endDate) {
    applicationsParams.set("startDate", selectedDateRange.startDate)
    applicationsParams.set("endDate", selectedDateRange.endDate)
  }

  const applicationsHref = applicationsParams.size
    ? `/studio/applications?${applicationsParams.toString()}`
    : "/studio/applications"

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.welcomeCard}>
          <div className={styles.welcomeLeft}>
            <h1 className={styles.pageTitle}>{greetingTitle}</h1>
            <p className={styles.pageDescription}>오늘의 첫수업 신청 현황을 확인해보세요.</p>
            <div className={styles.metaRow}>
              <span className={styles.metaPill}>{formatToday()}</span>
              <span className={styles.metaPill}>신청일 {selectedDateRange.label}</span>
              {selectedTeacherName ? <span className={styles.metaPill}>{selectedTeacherName} 기준</span> : null}
            </div>
          </div>

          <div className={styles.welcomeRight}>
            <div className={styles.welcomeTools}>
              <StudioTeacherFilter options={filterOptions} selectedTeacherId={selectedTeacherId} />
              {filterError ? (
                <div className={styles.alertDanger}>
                  <p className={styles.alertText}>{filterError}</p>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <StudioDateRangeFilter
          selectedRange={selectedDateRange}
          basePath="/studio"
          title="대시보드 기간 필터"
          description="신청일 기준으로 카드 수치와 최근 신청 목록을 조회합니다."
        />

        {error ? (
          <section className={styles.alertDanger}>
            <p className={styles.alertText}>{error}</p>
          </section>
        ) : (
          <StudioDashboardSummaryView
            summary={summary}
            applications={applications}
            applicationsHref={applicationsHref}
            selectedRangeLabel={selectedDateRange.label}
          />
        )}
      </div>
    </div>
  )
}
