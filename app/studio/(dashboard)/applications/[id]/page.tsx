import Link from "next/link"
import { notFound } from "next/navigation"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplicationAssigneeOptions } from "@/features/studio/queries/get-studio-application-assignee-options"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { ApplicationAssigneeForm } from "@/features/studio/ui/application-assignee-form"
import { ApplicationOutcomeForm } from "@/features/studio/ui/application-outcome-form"
import { ApplicationStatusActionForm } from "@/features/studio/ui/application-status-action-form"
import type { ApplicationStatus, StudioApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "./page.module.css"

type StudioApplicationDetailPageProps = {
  params: Promise<{
    id: string
  }>
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date)
}

const resolveScheduleSummary = (
  requestedSlotAt: string,
  confirmedSlotAt: string | null,
  selectedLabel?: string | null
) => {
  const confirmedAt = confirmedSlotAt ? formatDateTime(confirmedSlotAt) : null
  const requestedAt = requestedSlotAt ? formatDateTime(requestedSlotAt) : null
  const normalizedSelectedLabel = selectedLabel?.trim() ? selectedLabel.trim() : null

  if (confirmedAt) {
    return {
      primary: confirmedAt,
      secondary:
        normalizedSelectedLabel && normalizedSelectedLabel !== confirmedAt
          ? `선택 시간: ${normalizedSelectedLabel}`
          : null
    }
  }

  if (requestedAt) {
    return {
      primary: requestedAt,
      secondary:
        normalizedSelectedLabel && normalizedSelectedLabel !== requestedAt
          ? `선택 시간: ${normalizedSelectedLabel}`
          : null
    }
  }

  if (normalizedSelectedLabel) {
    return {
      primary: normalizedSelectedLabel,
      secondary: null
    }
  }

  return {
    primary: "일정 협의 필요",
    secondary: null
  }
}

const normalizeText = (value: string | null | undefined) => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 && normalized !== "-" ? normalized : null
}

const getStatusBadge = (application: Pick<StudioApplicationSummary, "status" | "noShowAt">) => {
  if (application.status === "new") {
    return { label: "신규 신청", tone: "successSoft" as const }
  }

  if (application.status === "reviewing") {
    return { label: "확인 중", tone: "warningSoft" as const }
  }

  if (application.status === "confirmed") {
    return { label: "수업 확정", tone: "infoSoft" as const }
  }

  if (application.status === "completed") {
    return { label: "수업 완료", tone: "neutralSoft" as const }
  }

  if (application.noShowAt) {
    return { label: "노쇼", tone: "dangerSoft" as const }
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

export default async function StudioApplicationDetailPage({ params }: StudioApplicationDetailPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedParams = await params
  const { data, error } = await getStudioApplicationDetail(resolvedParams.id, teacher.organizationId)
  const assigneeOptionsResult = data
    ? await getStudioApplicationAssigneeOptions(teacher.organizationId)
    : { data: [], error: null }

  if (!error && !data) {
    notFound()
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTopRow}>
          <Link href="/studio/applications" className={styles.backLink}>
            신청/상담 관리로 돌아가기
          </Link>
        </div>

        <div className={styles.headerTitleRow}>
          <div>
            <h1 className={styles.title}>체험신청 상세</h1>
            <p className={styles.subtitle}>신청 정보를 확인하고 상담 상태를 관리해요.</p>
          </div>
        </div>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : null}

      {data ? (
        <>
          {(() => {
            const scheduleSummary = resolveScheduleSummary(
              data.requestedSlotAt,
              data.confirmedSlotAt,
              data.selectedScheduleLabel
            )
            const applicationDate = formatDateTime(data.createdAt) ?? "신청일 미기록"
            const statusBadge = getStatusBadge(data)
            const registrationBadge = getRegistrationBadge(data.registrationStatus, data.status)
            const programTypeLabel =
              data.classProgramType === "trial_class"
                ? "체험수업"
                : data.classProgramType === "level_test"
                  ? "레벨테스트"
                  : "미확인"
            const parentName = normalizeText(data.parentName)
            const parentPhone = normalizeText(data.parentPhone)
            const childGrade = normalizeText(data.childGrade)
            const childSchool = normalizeText(data.childSchool)
            const currentLevel = normalizeText(data.currentLevel)
            const childNotes = normalizeText(data.childNotes)
            const parentMemo = normalizeText(data.memo)
            const classSubject = normalizeText(data.classSubject)
            const classRegion = normalizeText(data.classRegion)
            const assignedTeacherName = normalizeText(data.assignedTeacherName)
            const classTitle =
              normalizeText(data.classTitle) ??
              (data.classProgramType === "trial_class"
                ? "체험수업"
                : data.classProgramType === "level_test"
                  ? "레벨테스트"
                  : "수업 정보 미연결")

            return (
              <section className={styles.summaryCard} aria-label="신청 요약">
                <div className={styles.summaryTop}>
                  <div>
                    <h2 className={styles.summaryTitle}>
                      {data.childName} 학생의{" "}
                      {data.classProgramType === "level_test" ? "레벨테스트" : "체험신청"}
                    </h2>
                    <p className={styles.summarySubtitle}>{classTitle}</p>
                    <div className={styles.badgeRow}>
                      <Badge label={statusBadge.label} tone={statusBadge.tone} />
                      <Badge label={registrationBadge.label} tone={registrationBadge.tone} />
                    </div>
                  </div>

                  <div className={styles.summaryActions}>
                    {parentPhone ? (
                      <>
                        <a href={`tel:${parentPhone}`} className={styles.secondaryButton}>
                          전화
                        </a>
                        <a href={`sms:${parentPhone}`} className={styles.secondaryButton}>
                          문자
                        </a>
                      </>
                    ) : null}
                    {data.classId ? (
                      <Link href={`/classes/${data.classId}`} className={styles.secondaryButton}>
                        수업 미리보기
                      </Link>
                    ) : null}
                    <Link href="/studio/schedule" className={styles.secondaryButton}>
                      일정 관리
                    </Link>
                  </div>
                </div>

                <dl className={styles.summaryGrid}>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>현재 상태</dt>
                    <dd className={styles.summaryValue}>{statusBadge.label}</dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>신청일</dt>
                    <dd className={styles.summaryValue}>{applicationDate}</dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>{data.confirmedSlotAt ? "확정 일정" : "희망 일정"}</dt>
                    <dd className={styles.summaryValue}>
                      {scheduleSummary.primary}
                      {scheduleSummary.secondary ? (
                        <>
                          <br />
                          {scheduleSummary.secondary}
                        </>
                      ) : null}
                    </dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>신청 유형</dt>
                    <dd className={styles.summaryValue}>{programTypeLabel}</dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>담당 선생님</dt>
                    <dd className={styles.summaryValue}>{assignedTeacherName ?? "미배정"}</dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>보호자명</dt>
                    <dd className={styles.summaryValue}>{parentName ?? "미기록"}</dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>보호자 연락처</dt>
                    <dd className={styles.summaryValueStrong}>{parentPhone ?? "연락처 미기록"}</dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>학생 학년</dt>
                    <dd className={styles.summaryValue}>{childGrade ?? "미기록"}</dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>학교</dt>
                    <dd className={styles.summaryValue}>{childSchool ?? "미기록"}</dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>현재 수준</dt>
                    <dd className={styles.summaryValue}>{currentLevel ?? "미기록"}</dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>과목</dt>
                    <dd className={styles.summaryValue}>{classSubject ?? "미기록"}</dd>
                  </div>
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryLabel}>지역</dt>
                    <dd className={styles.summaryValue}>{classRegion ?? "미기록"}</dd>
                  </div>
                  <div className={`${styles.summaryRow} ${styles.summaryRowWide}`}>
                    <dt className={styles.summaryLabel}>학생 메모</dt>
                    <dd className={styles.summaryValueMultiline}>
                      {childNotes ?? "저장된 학생 메모가 없습니다."}
                    </dd>
                  </div>
                  <div className={`${styles.summaryRow} ${styles.summaryRowWide}`}>
                    <dt className={styles.summaryLabel}>학부모 메모</dt>
                    <dd className={styles.summaryValueMultiline}>
                      {parentMemo ?? "저장된 학부모 메모가 없습니다."}
                    </dd>
                  </div>
                </dl>
              </section>
            )
          })()}

          <div
            className={`${styles.body} ${
              data.status === "completed" || data.status === "canceled" ? styles.bodySingleColumn : ""
            }`}
          >
            {data.status !== "completed" && data.status !== "canceled" ? (
              <section className={styles.side} aria-label="상태 및 빠른 액션">
                <div className={styles.sticky}>
                  <ApplicationAssigneeForm
                    applicationId={data.id}
                    currentAssignedTeacherId={data.assignedTeacherId}
                    currentAssignedTeacherName={data.assignedTeacherName}
                    options={assigneeOptionsResult.data}
                    optionsError={assigneeOptionsResult.error}
                  />

                  <ApplicationStatusActionForm
                    applicationId={data.id}
                    currentStatus={data.status}
                  />
                </div>
              </section>
            ) : null}

            <section className={styles.main} aria-label="처리 영역">
              {data.status === "canceled" ? (
                <section className={styles.noticeCard} aria-label="취소 안내">
                  <div className={styles.badgeRow}>
                    <Badge label="취소된 신청" tone="dangerSoft" />
                  </div>
                  <h2 className={styles.cardTitle}>이 신청은 취소 상태예요.</h2>
                  <p className={styles.cardDescription}>
                    학생, 보호자, 수업 정보는 확인할 수 있지만 추가 처리 액션은 노출하지 않습니다.
                  </p>
                </section>
              ) : null}

              {data.status === "completed" ? (
                <ApplicationOutcomeForm item={data} />
              ) : (
                <section className={styles.card}>
                  <h2 className={styles.cardTitle}>상담 메모</h2>
                  <p className={styles.cardDescription}>
                    {data.status === "canceled"
                      ? "취소된 신청은 저장 액션 없이 기존 메모만 확인할 수 있어요."
                      : "완료 처리된 신청에서만 메모와 등록 전환을 저장할 수 있어요."}
                  </p>
                  <div className={styles.memoReadCard}>
                    <p className={styles.memoReadText}>
                      {data.consultationNote?.trim()
                        ? data.consultationNote
                        : data.status === "canceled"
                          ? "남겨진 내부 메모가 없어요."
                          : "아직 저장된 내부 메모가 없어요."}
                    </p>
                  </div>
                </section>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}
