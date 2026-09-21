import { withRecordChild } from "@/features/record/lib/record-href"
import { getRecordChildContext } from "@/features/record/queries/get-record-child-context"
import Link from "next/link"
import { notFound } from "next/navigation"
import { unstable_noStore as noStore } from "next/cache"

import { getMyCurrentParentDecision } from "@/features/decisions/queries/get-my-current-parent-decision"
import { ParentDecisionForm } from "@/features/decisions/ui/parent-decision-form"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import {
  getExperienceStageLabel,
  getExperienceTypeLabel,
  resolveExperienceStage,
  resolveParentExperienceDate
} from "@/features/record/lib/experience-view"
import { getMyExperienceDetail } from "@/features/record/queries/get-my-experience-detail"
import { getMyExperienceReport } from "@/features/record/queries/get-my-experience-report"
import { ExperienceCancelButton } from "@/features/record/ui/experience-cancel-button"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

import styles from "./page.module.css"

/*
 * 한 번의 교육 경험 상세.
 *
 * Experience id 는 trial_application.id 를 그대로 쓴다. 별도 Experience table 은 없다.
 * getMyExperienceDetail 이 학부모 본인의 목록에서만 찾으므로 남의 id 는 notFound 다.
 *
 * /record 목록은 completed 만 보여 주지만 Phase 6.2 의 /my/applications 카드도 이
 * route 를 쓴다. 그래서 완료 경험과 진행 중 신청의 돌아갈 곳과 정보 언어를 분리한다.
 * 도메인 status 를 새로 만들거나 서로 변환하지 않는다.
 */

export const dynamic = "force-dynamic"
export const revalidate = 0

const SEOUL_WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"]

const formatFullDate = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  return `${parts.year}년 ${parts.month}월 ${parts.day}일 (${SEOUL_WEEKDAY_SHORT[parts.weekday]})`
}

const formatTime = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  const minutes = `${parts.minute}`.padStart(2, "0")
  return `${parts.hour < 12 ? "오전" : "오후"} ${parts.hour % 12 || 12}:${minutes}`
}

export default async function ExperienceDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ experienceId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  noStore()
  const { experienceId } = await params
  await requireParentAccess({ returnTo: `/record/${experienceId}` })

  const experience = await getMyExperienceDetail(experienceId)
  if (!experience) {
    notFound()
  }

  const isCompletedExperience = experience.status === "completed"
  const selectedChildId = await getRecordChildContext((await searchParams)?.child)
  const backHref = withRecordChild(isCompletedExperience ? "/record" : "/my/applications", selectedChildId)
  const backLabel = isCompletedExperience ? "기록" : "신청 현황"

  /*
   * 리포트와 부모의 생각은 완료 경험에서만 읽는다.
   *
   * Report 는 published snapshot 만, ParentDecision 은 부모가 직접 남긴 현재 생각만
   * 읽는다. RegistrationResult 원문은 이 화면에 가져오지 않는다. 결과 존재 여부는
   * 기존 canCollectParentDecision boolean 에 이미 접혀 있다.
   */
  const reportResult = isCompletedExperience ? await getMyExperienceReport(experienceId) : null
  const hasPublishedReport = reportResult?.status === "ok"
  const reportLoadFailed = reportResult?.status === "error"
  const showDecision = isCompletedExperience && experience.canCollectParentDecision
  const decisionResult = showDecision ? await getMyCurrentParentDecision(experienceId) : null

  const typeLabel = getExperienceTypeLabel(experience.classProgramType)
  const primaryDate = resolveParentExperienceDate(experience)
  const dateLabel = formatFullDate(primaryDate)
  const timeLabel = formatTime(primaryDate)
  const address = [experience.organizationAddress, experience.organizationAddressDetail]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
  const childLabel = experience.childGrade
    ? `${experience.childName} · ${experience.childGrade}`
    : experience.childName
  const stageLabel = !isCompletedExperience
    ? getExperienceStageLabel(resolveExperienceStage(experience), experience.classProgramType)
    : null

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href={backHref} className={styles.back}>
            <span aria-hidden="true">←</span>
            {backLabel}
          </Link>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroBadges}>
            <span className={styles.typeBadge}>{typeLabel}</span>
            {stageLabel ? <span className={styles.statusBadge}>{stageLabel}</span> : null}
          </div>
          {isCompletedExperience && dateLabel ? (
            <p className={styles.heroDate}>{dateLabel}</p>
          ) : null}
          <h1 className={styles.title}>{experience.classTitle ?? "수업 정보 준비 중"}</h1>
          {experience.academyName ? (
            <p className={styles.academy}>{experience.academyName}</p>
          ) : null}
        </section>

        <div className={styles.content}>
          <section className={styles.section} aria-labelledby="experience-information-title">
            <h2 id="experience-information-title" className={styles.sectionTitle}>
              {isCompletedExperience ? "경험 정보" : "신청 정보"}
            </h2>
            <dl className={styles.factList}>
              <div className={styles.factRow}>
                <dt>자녀</dt>
                <dd>{childLabel}</dd>
              </div>
              {dateLabel ? (
                <div className={styles.factRow}>
                  <dt>{isCompletedExperience ? "다녀온 날" : "일정"}</dt>
                  <dd>
                    <span>{dateLabel}</span>
                    {timeLabel ? <span className={styles.factSub}>{timeLabel}</span> : null}
                  </dd>
                </div>
              ) : null}
              {address ? (
                <div className={styles.factRow}>
                  <dt>장소</dt>
                  <dd>{address}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {hasPublishedReport ? (
            <section className={styles.reportCard} aria-labelledby="report-title">
              <div>
                <p className={styles.eyebrow}>선생님이 남긴 기록</p>
                <h2 id="report-title" className={styles.reportTitle}>
                  {typeLabel} 리포트가 도착했어요
                </h2>
                <p className={styles.reportDescription}>
                  수업에서 관찰한 모습과 선생님의 제안을 확인해 보세요.
                </p>
              </div>
              <Link href={withRecordChild(`/record/${experience.id}/report`, selectedChildId)} className={styles.reportLink}>
                리포트 보기 <span aria-hidden="true">›</span>
              </Link>
            </section>
          ) : reportLoadFailed ? (
            <section className={styles.notice} aria-live="polite">
              <p className={styles.noticeTitle}>리포트 정보를 불러오지 못했어요.</p>
              <p className={styles.noticeBody}>잠시 후 다시 확인해 주세요.</p>
            </section>
          ) : null}

          {showDecision && decisionResult && decisionResult.status !== "not_found" ? (
            <section className={styles.section} aria-labelledby="decision-title">
              <div className={styles.sectionHeading}>
                <p className={styles.eyebrow}>부모님의 기록</p>
                <h2 id="decision-title" className={styles.sectionTitle}>
                  이번 경험 후의 생각
                </h2>
              </div>
              <ParentDecisionForm
                experienceId={experience.id}
                currentDeclineReason={
                  decisionResult.status === "ok" ? (decisionResult.decision?.declineReason ?? null) : null
                }
                currentPreferredDays={
                  decisionResult.status === "ok" ? (decisionResult.decision?.preferredDays ?? null) : null
                }
                currentPreferredStartTime={
                  decisionResult.status === "ok"
                    ? (decisionResult.decision?.preferredStartTime ?? null)
                    : null
                }
                currentPreferredEndTime={
                  decisionResult.status === "ok"
                    ? (decisionResult.decision?.preferredEndTime ?? null)
                    : null
                }
                currentPreferredTimeMode={
                  decisionResult.status === "ok"
                    ? (decisionResult.decision?.preferredTimeMode ?? null)
                    : null
                }
                currentDecision={
                  decisionResult.status === "ok" ? (decisionResult.decision?.decision ?? null) : null
                }
                loadError={decisionResult.status === "error" ? decisionResult.message : null}
              />
            </section>
          ) : null}

          <section className={styles.related} aria-label="관련 정보">
            <Link href={withRecordChild(`/classes/${experience.classId}`, selectedChildId)} className={styles.secondaryLink}>
              수업 정보 보기 <span aria-hidden="true">›</span>
            </Link>
            {experience.canCancel ? (
              <ExperienceCancelButton
                experienceId={experience.id}
                confirmDescription={`${experience.classTitle ?? "이 수업"} 신청을 취소할까요?`}
              />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  )
}
