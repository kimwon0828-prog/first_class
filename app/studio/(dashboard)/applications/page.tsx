import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplicationFilterCount } from "@/features/studio/lib/application-filters"
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
  const { data, error } = await getStudioApplications(teacher.organizationId, {
    teacherId: validatedTeacherId,
    createdAtFrom: selectedDateRange.createdAtFrom,
    createdAtTo: selectedDateRange.createdAtTo
  })

  const metrics = [
    {
      key: "total",
      label: "전체 신청",
      value: data.length,
      description: "선택한 기간 기준 전체 신청",
      hasAlert: false
    },
    {
      key: "new",
      label: "신규 신청",
      value: getStudioApplicationFilterCount(data, "new"),
      description: "확인이 필요한 신규 신청",
      hasAlert: getStudioApplicationFilterCount(data, "new") > 0
    },
    {
      key: "reviewing",
      label: "상담/확인 중",
      value: getStudioApplicationFilterCount(data, "reviewing"),
      description: "상담 진행 및 일정 조율 중",
      hasAlert: getStudioApplicationFilterCount(data, "reviewing") > 0
    },
    {
      key: "confirmed",
      label: "일정 확정",
      value: getStudioApplicationFilterCount(data, "confirmed"),
      description: "체험 일정이 확정된 신청",
      hasAlert: getStudioApplicationFilterCount(data, "confirmed") > 0
    },
    {
      key: "completed",
      label: "체험 완료",
      value: getStudioApplicationFilterCount(data, "completed"),
      description: "체험을 마친 신청",
      hasAlert: getStudioApplicationFilterCount(data, "completed") > 0
    },
    {
      key: "no_show",
      label: "노쇼",
      value: getStudioApplicationFilterCount(data, "no_show"),
      description: "확정 일정 후 미방문 처리",
      hasAlert: getStudioApplicationFilterCount(data, "no_show") > 0
    },
    {
      key: "enrolled",
      label: "등록 완료",
      value: getStudioApplicationFilterCount(data, "enrolled"),
      description: "등록 전환이 완료된 신청",
      hasAlert: getStudioApplicationFilterCount(data, "enrolled") > 0
    },
    {
      key: "not_enrolled",
      label: "미등록",
      value: getStudioApplicationFilterCount(data, "not_enrolled"),
      description: "체험 후 미등록 처리된 신청",
      hasAlert: getStudioApplicationFilterCount(data, "not_enrolled") > 0
    }
  ] as const

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>신청/상담 관리</h1>
            <p className={styles.subtitle}>
              신청일 {selectedDateRange.label}
              {selectedTeacherName ? ` · ${selectedTeacherName} 기준` : ""}으로 신청을 확인하고 상담부터 등록까지 관리해요.
            </p>
          </div>
          <div className={styles.headerActions}>
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

      <section className={styles.filtersSection}>
        <StudioDateRangeFilter
          selectedRange={selectedDateRange}
          basePath="/studio/applications"
          title="신청 기간 필터"
          description="신청일 기준으로 상태, 선생님 필터와 함께 조회합니다."
        />
      </section>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : null}

      {!error && data.length === 0 ? (
        <section className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>{selectedDateRange.label}에는 신청이 없어요.</h2>
          <p className={styles.emptyDescription}>
            기간을 바꾸거나 선생님 필터를 조정하면 다른 신청 내역을 확인할 수 있어요.
          </p>
        </section>
      ) : null}

      {!error && data.length > 0 ? (
        <>
          <section className={styles.metrics} aria-label="요약 지표">
            <div className={styles.metricsGrid}>
              {metrics.map((metric) => (
                <article key={metric.key} className={styles.metricCard}>
                  <div className={styles.metricTop}>
                    <span className={styles.metricLabel}>{metric.label}</span>
                    {metric.hasAlert ? <span className={styles.metricDot} aria-hidden="true" /> : null}
                  </div>
                  <div className={styles.metricValue}>{metric.value}</div>
                  <p className={styles.metricDescription}>{metric.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.listSection} aria-label="신청 목록">
            <div className={styles.listHeader}>
              <div>
                <h2 className={styles.sectionTitle}>신청 목록</h2>
                <p className={styles.sectionDescription}>
                  상태별로 빠르게 나눠 보고, 신청일·확정 일정·담당 선생님을 한눈에 확인해요.
                </p>
              </div>
              <p className={styles.countText}>
                {selectedDateRange.label} 총 {data.length}건
              </p>
            </div>
            <StudioApplicationTable items={data} />
          </section>
        </>
      ) : null}
    </div>
  )
}
