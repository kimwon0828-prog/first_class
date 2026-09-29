import { withRecordChild } from "@/features/record/lib/record-href"
import { getRecordChildContext } from "@/features/record/queries/get-record-child-context"
import Link from "next/link"
import { notFound } from "next/navigation"
import { unstable_noStore as noStore } from "next/cache"

import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import {
  getExperienceStageLabel,
  getExperienceTypeLabel,
  resolveExperienceStage,
  resolveParentExperienceDate
} from "@/features/record/lib/experience-view"
import { getMyExperienceDetailResult } from "@/features/record/queries/get-my-experience-detail"
import { getMyExperienceReport } from "@/features/record/queries/get-my-experience-report"
import { ExperienceCancelButton } from "@/features/record/ui/experience-cancel-button"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

import { getMyChildren } from "@/features/children/queries/get-my-children"
import { getExperienceReportSummary } from "@/features/reports/lib/experience-report-snapshot"

import { RecordDetailRetry } from "@/features/record/ui/record-detail-retry"

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

  const detailResult = await getMyExperienceDetailResult(experienceId)
  if (detailResult.error) throw new Error("경험 정보를 불러오지 못했어요.")
  const experience = detailResult.data
  if (!experience) {
    notFound()
  }

  const isCompletedExperience = experience.status === "completed"
  const selectedChildId = await getRecordChildContext((await searchParams)?.child)
  const backHref = withRecordChild(isCompletedExperience ? "/record" : "/my/applications", selectedChildId)
  const backLabel = isCompletedExperience ? "기록" : "신청 현황"

  // 완료 경험의 관찰 미리보기는 발행 snapshot만 읽는다. 입력은 리포트 상세에 둔다.
  const reportResult = isCompletedExperience ? await getMyExperienceReport(experienceId) : null
  const hasPublishedReport = reportResult?.status === "ok"
  const reportLoadFailed = reportResult?.status === "error"
  const childrenResult = isCompletedExperience && experience.childId ? await getMyChildren() : null
  const profileChildId = !childrenResult?.error && childrenResult?.data.some(child => child.id === experience.childId)
    ? experience.childId : null
  const snapshot = reportResult?.status === "ok" ? reportResult.report.content : null
  const summary = snapshot ? getExperienceReportSummary(snapshot) : null

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
    <main className={styles.page} data-parent-design="v1">
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href={backHref} className={styles.back} aria-label={`${backLabel}으로 돌아가기`}>
            <span aria-hidden="true">←</span>
          </Link>
          <h1 className={styles.headerTitle}>{isCompletedExperience ? "체험 기록" : "신청 정보"}</h1>
        </header>
        <div className={styles.content}>
          <section className={styles.section} aria-label={isCompletedExperience ? "경험 정보" : "신청 정보"}>
            <p className={styles.child}>{childLabel}</p>
            <div className={styles.badges}>
              <span className={styles.typeBadge}>{typeLabel}</span>
              {stageLabel ? <span className={styles.statusBadge}>{stageLabel}</span> : null}
            </div>
            <h2 className={styles.title}>{experience.classTitle ?? "수업 정보 준비 중"}</h2>
            {experience.academyName ? <p className={styles.academy}>{experience.academyName}</p> : null}
            <dl className={styles.factList}>
              {dateLabel ? <div className={styles.factRow}>
                <dt>{isCompletedExperience ? "다녀온 날" : "일정"}</dt>
                <dd><time dateTime={primaryDate}>{dateLabel}{timeLabel ? ` ${timeLabel}` : ""}</time></dd>
              </div> : null}
              {address ? <div className={styles.factRow}><dt>장소</dt><dd>{address}</dd></div> : null}
            </dl>
          </section>

          {isCompletedExperience ? <>
            <section className={styles.section} aria-labelledby="report-title">
              <h2 id="report-title" className={styles.sectionTitle}>선생님이 남긴 관찰</h2>
              {hasPublishedReport ? (
                <>
                  {snapshot?.observations.slice(0, 2).map((observation, index) => <p className={styles.body} key={`${observation.code}-${index}`}>{observation.label}</p>)}
                  {summary ? <p className={styles.body}>{summary}</p> : null}
                  <Link href={withRecordChild(`/record/${experience.id}/report`, selectedChildId)} className={styles.reportLink}>
                    리포트 전체 보기 <span aria-hidden="true">→</span>
                  </Link>
                </>
              ) : reportLoadFailed ? <p className={styles.muted} role="status">리포트 정보를 불러오지 못했어요. <RecordDetailRetry /></p>
                : <p className={styles.muted}>아직 등록된 리포트가 없어요.</p>}
            </section>

            {profileChildId ? <Link href={withRecordChild("/record/profile", profileChildId)} className={styles.profile}>
              <div><h2 className={styles.sectionTitle}>교육 프로필</h2><p className={styles.muted}>아이의 다른 교육 경험도 함께 살펴보세요.</p></div>
              <span aria-hidden="true">›</span>
            </Link> : null}
          </> : <aside className={styles.notice}>
            <p>{experience.status === "canceled" ? "취소된 신청이에요." : "아직 완료된 교육 경험이 아니에요."}</p>
            <p className={styles.muted}>완료된 경험은 교육 기록으로 남으며, 발행된 리포트가 있으면 함께 확인할 수 있어요.</p>
          </aside>}

          <section className={styles.related} aria-label="관련 정보">
            {experience.classId ? <Link href={withRecordChild(`/classes/${experience.classId}`, selectedChildId)} className={styles.primaryLink}>
              수업 다시 보기 <span aria-hidden="true">→</span>
            </Link> : null}
            {experience.canCancel ? <ExperienceCancelButton experienceId={experience.id} confirmDescription={`${experience.classTitle ?? "이 수업"} 신청을 취소할까요?`} /> : null}
          </section>
        </div>
      </div>
    </main>
  )
}
