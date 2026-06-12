import Link from "next/link"
import { notFound } from "next/navigation"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { ApplicationOutcomeForm } from "@/features/studio/ui/application-outcome-form"
import { ApplicationLogList } from "@/features/studio/ui/application-log-list"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import { ApplicationStatusActionForm } from "@/features/studio/ui/application-status-action-form"
import { StudioApplicationDetailPanel } from "@/features/studio/ui/studio-application-detail-panel"
import type { ApplicationStatus } from "@/shared/lib/db/adapter"

import styles from "./page.module.css"

type StudioApplicationDetailPageProps = {
  params: Promise<{
    id: string
  }>
}

const NEXT_STATUS_BY_CURRENT: Partial<Record<ApplicationStatus, ApplicationStatus>> = {
  new: "reviewing",
  reviewing: "confirmed",
  confirmed: "completed"
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value))

const getStatusBadge = (status: ApplicationStatus) => {
  if (status === "new") {
    return { label: "신규 신청", tone: "successSoft" as const }
  }

  if (status === "reviewing") {
    return { label: "검토 중", tone: "warningSoft" as const }
  }

  if (status === "confirmed") {
    return { label: "수업 확정", tone: "infoSoft" as const }
  }

  if (status === "completed") {
    return { label: "수업 완료", tone: "neutralSoft" as const }
  }

  return { label: "취소", tone: "dangerSoft" as const }
}

const getRegistrationBadge = (registrationStatus: string, status: ApplicationStatus) => {
  if (registrationStatus === "enrolled") {
    return { label: "등록 완료", tone: "successSolid" as const }
  }

  if (registrationStatus === "pending") {
    return { label: "등록 보류", tone: "warningSoft" as const }
  }

  if (registrationStatus === "not_enrolled") {
    return { label: "미등록", tone: "neutralSoft" as const }
  }

  if (status === "completed" && registrationStatus === "undecided") {
    return { label: "등록 미정", tone: "neutralSoft" as const }
  }

  return { label: "등록 미기록", tone: "neutralSoft" as const }
}

const Badge = ({
  label,
  tone
}: {
  label: string
  tone:
    | "successSoft"
    | "warningSoft"
    | "infoSoft"
    | "neutralSoft"
    | "dangerSoft"
    | "darkSolid"
    | "successSolid"
}) => {
  return <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>{label}</span>
}

export default async function StudioApplicationDetailPage({
  params
}: StudioApplicationDetailPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedParams = await params
  const { data, error } = await getStudioApplicationDetail(
    resolvedParams.id,
    teacher.organizationId
  )

  if (!error && !data) {
    notFound()
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTopRow}>
          <Link href="/studio/applications" prefetch={false} className={styles.backLink}>
            신청/상담 관리로 돌아가기
          </Link>

          <div className={styles.headerActions}>
            {data?.classId ? (
              <Link href={`/classes/${data.classId}`} prefetch={false} className={styles.secondaryButton}>
                수업 미리보기
              </Link>
            ) : null}
            <Link href="/studio/schedule" prefetch={false} className={styles.secondaryButton}>
              일정 관리
            </Link>
          </div>
        </div>

        <div className={styles.headerTitleRow}>
          <div>
            <StudioHomeLogo />
            <p className={styles.kicker}>운영자 센터</p>
            <h1 className={styles.title}>체험신청 상세</h1>
            <p className={styles.subtitle}>신청 정보를 확인하고 상담 상태를 관리해요.</p>
            {data ? (
              <p className={styles.contextTitle}>
                {data.childName} 학생의{" "}
                {data.classTitle ??
                  (data.classProgramType === "trial_class"
                    ? "체험수업"
                    : data.classProgramType === "level_test"
                      ? "레벨테스트"
                      : "신청")}{" "}
                신청
              </p>
            ) : null}
          </div>

          {data ? (
            <div className={styles.headerMeta}>
              <div className={styles.badgeRow}>
                <Badge
                  label={getStatusBadge(data.status).label}
                  tone={getStatusBadge(data.status).tone}
                />
                <Badge
                  label={getRegistrationBadge(data.registrationStatus, data.status).label}
                  tone={getRegistrationBadge(data.registrationStatus, data.status).tone}
                />
              </div>
              <div className={styles.metaLine}>
                신청일 {formatDateTime(data.createdAt)}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : null}

      {data ? (
        <>
          <section className={styles.summaryCard} aria-label="신청 요약">
            <div className={styles.summaryTop}>
              <div>
                <h2 className={styles.summaryTitle}>
                  {data.childName} 학생의{" "}
                  {data.classProgramType === "trial_class"
                    ? "체험신청"
                    : data.classProgramType === "level_test"
                      ? "레벨테스트"
                      : "신청"}
                </h2>
                <p className={styles.summarySubtitle}>{data.classTitle ?? "수업 정보 미연결"}</p>
              </div>
            </div>

            <dl className={styles.summaryGrid}>
              <div className={styles.summaryRow}>
                <dt className={styles.summaryLabel}>희망 일정</dt>
                <dd className={styles.summaryValue}>{formatDateTime(data.requestedSlotAt)}</dd>
              </div>
              <div className={styles.summaryRow}>
                <dt className={styles.summaryLabel}>신청 유형</dt>
                <dd className={styles.summaryValue}>
                  {data.classProgramType === "trial_class"
                    ? "체험수업"
                    : data.classProgramType === "level_test"
                      ? "레벨테스트"
                      : "미확인"}
                </dd>
              </div>
              <div className={styles.summaryRow}>
                <dt className={styles.summaryLabel}>보호자 연락처</dt>
                <dd className={styles.summaryValueStrong}>{data.parentPhone ?? "연락처 미기록"}</dd>
              </div>
              <div className={styles.summaryRow}>
                <dt className={styles.summaryLabel}>현재 상태</dt>
                <dd className={styles.summaryValue}>{getStatusBadge(data.status).label}</dd>
              </div>
            </dl>
          </section>

          <div className={styles.body}>
            <section className={styles.side} aria-label="상태 및 빠른 액션">
              <div className={styles.sticky}>
                <ApplicationStatusActionForm
                  applicationId={data.id}
                  nextStatus={NEXT_STATUS_BY_CURRENT[data.status] ?? null}
                  currentStatus={data.status}
                  registrationStatus={data.registrationStatus}
                />

                <section className={styles.card}>
                  <h2 className={styles.cardTitle}>등록 전환</h2>
                  <p className={styles.cardDescription}>
                    체험수업 이후 정규 등록으로 이어졌다면 등록 상태를 업데이트해 주세요.
                  </p>
                  <div className={styles.badgeRow}>
                    <Badge
                      label={getRegistrationBadge(data.registrationStatus, data.status).label}
                      tone={getRegistrationBadge(data.registrationStatus, data.status).tone}
                    />
                  </div>
                </section>
              </div>
            </section>

            <section className={styles.main} aria-label="상세 정보">
              <StudioApplicationDetailPanel item={data} />

              {data.status === "completed" ? (
                <ApplicationOutcomeForm item={data} />
              ) : (
                <section className={styles.card}>
                  <h2 className={styles.cardTitle}>상담 메모</h2>
                  <p className={styles.cardDescription}>
                    상담 내용, 학부모 요청사항, 수업 후 피드백을 기록해 주세요.
                  </p>
                  <div className={styles.memoArea}>
                    <textarea
                      className={styles.textarea}
                      defaultValue={data.consultationNote ?? ""}
                      placeholder="예: 파이썬 경험은 없지만 수학적 사고력이 좋음. 체험 후 정규반 상담 예정."
                      disabled
                    />
                    <div className={styles.memoFooter}>
                      <p className={styles.memoHelp}>완료 처리된 신청만 메모를 저장할 수 있어요.</p>
                      <button type="button" className={`${styles.secondaryButton} ${styles.disabledButton}`} disabled>
                        메모 저장
                      </button>
                    </div>
                  </div>
                </section>
              )}

              <ApplicationLogList items={data.logs} />

              <details className={styles.systemInfo}>
                <summary className={styles.systemInfoSummary}>시스템 정보</summary>
                <dl className={styles.systemInfoGrid}>
                  <div className={styles.systemInfoRow}>
                    <dt className={styles.systemInfoLabel}>신청 ID</dt>
                    <dd className={styles.systemInfoValue}>{data.id}</dd>
                  </div>
                  {data.requestedScheduleBlockId ? (
                    <div className={styles.systemInfoRow}>
                      <dt className={styles.systemInfoLabel}>요청 슬롯 ID</dt>
                      <dd className={styles.systemInfoValue}>{data.requestedScheduleBlockId}</dd>
                    </div>
                  ) : null}
                  {data.confirmedScheduleBlockId ? (
                    <div className={styles.systemInfoRow}>
                      <dt className={styles.systemInfoLabel}>확정 슬롯 ID</dt>
                      <dd className={styles.systemInfoValue}>{data.confirmedScheduleBlockId}</dd>
                    </div>
                  ) : null}
                  <div className={styles.systemInfoRow}>
                    <dt className={styles.systemInfoLabel}>생성일</dt>
                    <dd className={styles.systemInfoValue}>{formatDateTime(data.createdAt)}</dd>
                  </div>
                  <div className={styles.systemInfoRow}>
                    <dt className={styles.systemInfoLabel}>수정일</dt>
                    <dd className={styles.systemInfoValue}>{formatDateTime(data.updatedAt)}</dd>
                  </div>
                </dl>
              </details>
            </section>
          </div>
        </>
      ) : null}
    </main>
  )
}
