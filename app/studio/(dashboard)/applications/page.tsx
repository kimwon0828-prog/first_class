import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import { StudioApplicationTable } from "@/features/studio/ui/studio-application-table"

import styles from "./page.module.css"

export default async function StudioApplicationsPage() {
  const teacher = await requireTeacherStudioAccess()
  const { data, error } = await getStudioApplications(teacher.organizationId)

  const eligibleApplications = data.filter((item) => item.status !== "canceled")
  const enrolledCount = eligibleApplications.filter((item) => item.registrationStatus === "enrolled").length
  const conversionRate =
    eligibleApplications.length > 0 ? Math.round((enrolledCount / eligibleApplications.length) * 100) : 0

  const metrics = [
    {
      key: "total",
      label: "전체 신청",
      value: data.length,
      description: "내 organization 전체 신청"
    },
    {
      key: "new",
      label: "신규 신청",
      value: data.filter((item) => item.status === "new").length,
      description: "확인이 필요한 신규 신청"
    },
    {
      key: "pending",
      label: "상담 대기",
      value: data.filter((item) => item.status === "reviewing" || item.status === "new").length,
      description: "상담/확정 전 상태"
    },
    {
      key: "confirmed",
      label: "수업 확정",
      value: data.filter((item) => item.status === "confirmed").length,
      description: "일정 확정 후 진행 예정"
    },
    {
      key: "enrolled",
      label: "등록 완료",
      value: enrolledCount,
      description: "등록 처리 완료 건수"
    },
    {
      key: "conversion",
      label: "등록전환율",
      value: `${conversionRate}%`,
      description: "등록 완료 / (취소 제외 신청)"
    }
  ] as const

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <StudioHomeLogo />
            <p className={styles.brandKicker}>첫수업 운영보드</p>
            <h1 className={styles.title}>신청/상담 관리</h1>
            <p className={styles.subtitle}>
              들어온 신청을 확인하고 상담부터 등록까지 관리해요. · {teacher.name} 선생님이 처리할 수 있는 같은
              organization 신청만 표시합니다.
            </p>
          </div>
          <div className={styles.headerActions}>
            <a className={styles.secondaryButton} href="/studio/classes">
              수업 관리
            </a>
            <a className={styles.secondaryButton} href="/studio/schedule">
              일정 관리
            </a>
          </div>
        </div>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : null}

      {!error && data.length === 0 ? (
        <section className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>아직 들어온 신청이 없어요.</h2>
          <p className={styles.emptyDescription}>
            새로운 체험 신청이 들어오면 이 화면에서 신규 상태로 바로 확인할 수 있어요.
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
                    <span className={styles.metricDot} aria-hidden="true" />
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
                  상태/키워드로 빠르게 필터링하고, 상담이 필요한 신청을 놓치지 않도록 관리해요.
                </p>
              </div>
              <p className={styles.countText}>총 {data.length}건</p>
            </div>
            <StudioApplicationTable items={data} />
          </section>
        </>
      ) : null}
    </div>
  )
}

