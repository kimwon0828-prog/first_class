import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import { getStudioOrganizationName } from "@/features/studio/lib/get-studio-organization-name"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { getStudioDashboardTeacherOptions } from "@/features/studio/queries/get-studio-dashboard-teacher-options"
import { buildStudioDashboardSummary } from "@/features/studio/queries/get-studio-dashboard-summary"
import { StudioDashboardFilterBar } from "@/features/studio/ui/studio-dashboard-filter-bar"
import { StudioDashboardSummaryView } from "@/features/studio/ui/studio-dashboard-summary"

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
  const [{ data: filterOptions, error: filterError }, organizationName] = await Promise.all([
    getStudioDashboardTeacherOptions(teacher.organizationId),
    getStudioOrganizationName(teacher.organizationId)
  ])
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
  const safeOrganizationName = selectedTeacherName ? "학원" : (organizationName ?? "학원")

  const greetingTitle = selectedTeacherName
    ? `안녕하세요, ${selectedTeacherName} 선생님`
    : `안녕하세요, ${safeOrganizationName} 관리자님`
  const { data: applications, error } = await getStudioApplications(teacher.organizationId, {
    teacherId: validatedTeacherId,
    createdAtFrom: selectedDateRange.createdAtFrom,
    createdAtTo: selectedDateRange.createdAtTo
  })
  const summary = buildStudioDashboardSummary(applications)
  const actionableCount = summary.actionableCount
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
            <p className={styles.pageDescription}>
              {actionableCount > 0 ? (
                <>
                  {formatToday()} · 지금 확인이 필요한 신청이{" "}
                  <strong className={styles.pageDescriptionAccent}>{actionableCount}건</strong> 있어요.
                </>
              ) : (
                `${formatToday()} · 오늘은 새로 확인할 신청이 없어요.`
              )}
            </p>
          </div>

          <div className={styles.welcomeRight}>
            <StudioDashboardFilterBar
              options={filterOptions}
              selectedTeacherId={selectedTeacherId}
              selectedRange={selectedDateRange}
            />
            {filterError ? (
              <div className={styles.inlineAlert}>
                <p className={styles.inlineAlertText}>{filterError}</p>
              </div>
            ) : null}
          </div>
        </header>

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
            selectedTeacherName={selectedTeacherName}
          />
        )}
      </div>
    </div>
  )
}
