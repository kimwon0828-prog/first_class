import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioDashboardTeacherOptions } from "@/features/studio/queries/get-studio-dashboard-teacher-options"
import { getStudioDashboardSummary } from "@/features/studio/queries/get-studio-dashboard-summary"
import { StudioDashboardSummaryView } from "@/features/studio/ui/studio-dashboard-summary"
import { StudioTeacherFilter } from "@/features/studio/ui/studio-teacher-filter"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { dataAdapter } from "@/shared/lib/db"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "@/features/studio/ui/studio-dashboard.module.css"

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StudioIndexPageProps = {
  searchParams?: Promise<{ teacherId?: string }>
}

const formatToday = () =>
  new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date())

export default async function StudioIndexPage({ searchParams }: StudioIndexPageProps) {
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
  const selectedTeacherName =
    selectedTeacherId !== "all"
      ? (filterOptions.find((option) => option.teacherId === selectedTeacherId)?.teacherName ?? null)
      : null
  let organizationName = "학원"

  if (!selectedTeacherName) {
    const supabase = await getSupabaseServerClient()
    const { data: organizationRow } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", teacher.organizationId)
      .maybeSingle()

    organizationName = organizationRow?.name?.trim() || "학원"
  }

  const greetingTitle = selectedTeacherName
    ? `안녕하세요, ${selectedTeacherName} 선생님`
    : `안녕하세요, ${organizationName} 관리자님`

  const { data, error } = await getStudioDashboardSummary(teacher.organizationId, {
    teacherId: validatedTeacherId
  })

  let applications: StudioApplicationSummary[] = []
  let applicationsError: string | null = null
  try {
    applications = await dataAdapter.listStudioApplications(teacher.organizationId, {
      teacherId: validatedTeacherId
    })
  } catch {
    applicationsError = "신청 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.welcomeCard}>
          <div className={styles.welcomeLeft}>
            <h1 className={styles.pageTitle}>{greetingTitle}</h1>
            <p className={styles.pageDescription}>오늘의 첫수업 신청 현황을 확인해보세요.</p>
            <div className={styles.metaRow}>
              <span className={styles.metaPill}>{formatToday()}</span>
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

        {error ? (
          <section className={styles.alertDanger}>
            <p className={styles.alertText}>{error}</p>
          </section>
        ) : (
          <StudioDashboardSummaryView
            summary={data}
            applications={applications}
            applicationsError={applicationsError}
          />
        )}
      </div>
    </div>
  )
}
