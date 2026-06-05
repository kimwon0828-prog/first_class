import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioDashboardTeacherOptions } from "@/features/studio/queries/get-studio-dashboard-teacher-options"
import { getStudioDashboardSummary } from "@/features/studio/queries/get-studio-dashboard-summary"
import { StudioDashboardSummaryView } from "@/features/studio/ui/studio-dashboard-summary"
import { StudioTeacherFilter } from "@/features/studio/ui/studio-teacher-filter"
import { dataAdapter } from "@/shared/lib/db"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"
import Image from "next/image"
import Link from "next/link"

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
    teacherIdParam && teacherIdParam !== "all" && uuidPattern.test(teacherIdParam) && availableTeacherIdSet.has(teacherIdParam)
      ? teacherIdParam
      : null
  const selectedTeacherId = validatedTeacherId ?? "all"
  const selectedTeacherName =
    selectedTeacherId !== "all"
      ? (filterOptions.find((option) => option.teacherId === selectedTeacherId)?.teacherName ?? null)
      : null

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
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.welcomeCard}>
          <div className={styles.welcomeLeft}>
            <div className={styles.brandKicker}>
              <Image
                src="/images/first-class-logo.png"
                alt="첫수업"
                width={120}
                height={40}
                className={styles.brandLogo}
                priority
              />
            </div>
            <h1 className={styles.pageTitle}>안녕하세요, {teacher.name} 선생님</h1>
            <p className={styles.pageDescription}>오늘의 첫수업 신청 현황을 확인해보세요.</p>
            <div className={styles.metaRow}>
              <span className={styles.metaPill}>{formatToday()}</span>
              {selectedTeacherName ? (
                <span className={styles.metaPill}>{selectedTeacherName} 기준</span>
              ) : null}
            </div>
          </div>

          <div className={styles.welcomeRight}>
            <div className={styles.welcomeActions}>
              <Link href="/studio/applications" prefetch={false} className={styles.buttonPrimary}>
                신청 관리
              </Link>
              <Link href="/studio/classes" prefetch={false} className={styles.buttonSecondary}>
                수업 관리
              </Link>
              <Link href="/studio/schedule" prefetch={false} className={styles.buttonSecondary}>
                일정 관리
              </Link>
              <Link href="/studio/sign-out" prefetch={false} className={styles.buttonGhost}>
                로그아웃
              </Link>
            </div>

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
    </main>
  )
}
