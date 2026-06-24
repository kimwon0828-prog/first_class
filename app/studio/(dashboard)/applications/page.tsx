import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplicationFilterCount } from "@/features/studio/lib/application-filters"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import { StudioApplicationTable } from "@/features/studio/ui/studio-application-table"

import styles from "./page.module.css"

export default async function StudioApplicationsPage() {
  const teacher = await requireTeacherStudioAccess()
  const { data, error } = await getStudioApplications(teacher.organizationId)

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
      value: getStudioApplicationFilterCount(data, "new"),
      description: "확인이 필요한 신규 신청"
    },
    {
      key: "reviewing",
      label: "상담/확인 중",
      value: getStudioApplicationFilterCount(data, "reviewing"),
      description: "상담 진행 및 일정 조율 중"
    },
    {
      key: "confirmed",
      label: "일정 확정",
      value: getStudioApplicationFilterCount(data, "confirmed"),
      description: "체험 일정이 확정된 신청"
    },
    {
      key: "completed",
      label: "체험 완료",
      value: getStudioApplicationFilterCount(data, "completed"),
      description: "체험을 마친 신청"
    },
    {
      key: "no_show",
      label: "노쇼",
      value: getStudioApplicationFilterCount(data, "no_show"),
      description: "확정 일정 후 미방문 처리"
    },
    {
      key: "enrolled",
      label: "등록 완료",
      value: getStudioApplicationFilterCount(data, "enrolled"),
      description: "등록 전환이 완료된 신청"
    },
    {
      key: "not_enrolled",
      label: "미등록",
      value: getStudioApplicationFilterCount(data, "not_enrolled"),
      description: "체험 후 미등록 처리된 신청"
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
            <p className={styles.subtitle}>들어온 신청을 확인하고 상담부터 등록까지 관리해요.</p>
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
                  상태별로 빠르게 나눠 보고, 신청일·확정 일정·담당 선생님을 한눈에 확인해요.
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
