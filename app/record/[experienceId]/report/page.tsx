import { withRecordChild } from "@/features/record/lib/record-href"
import { getRecordChildContext } from "@/features/record/queries/get-record-child-context"
import Link from "next/link"
import { notFound } from "next/navigation"
import { unstable_noStore as noStore } from "next/cache"

import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyExperienceReport } from "@/features/record/queries/get-my-experience-report"
import { getExperienceReportSummary } from "@/features/reports/lib/experience-report-snapshot"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

import { getExperienceTypeLabel } from "@/features/record/lib/experience-view"
import { RecordDetailRetry } from "@/features/record/ui/record-detail-retry"
import { ReportFrame } from "./report-frame"

import styles from "./page.module.css"

// 학원이 발행한 체험 리포트를 학부모가 보는 화면.
//
// ⚠️ 이 화면은 experience_reports.content 만 본다.
//    trial_results 를 다시 읽어 조립하지 않는다 — 그러면 학원이 평가를 고치는 순간
//    학부모가 이미 본 리포트가 같이 바뀐다. 발행본은 발행 시점에 얼어붙은 것이다.
//
// Experience Detail 과 역할이 다르다.
//   Detail  — 무슨 일이 있었는가
//   Report  — 그 경험을 어떻게 이해할 수 있는가

export const dynamic = "force-dynamic"
export const revalidate = 0

/*
 * 날짜는 서버가 어디서 도는지와 무관하게 한국 시간으로 읽는다.
 *
 * getFullYear() 류는 실행 환경의 timezone 을 따른다. Vercel 은 UTC 라서,
 * 한국 시간 자정 직후에 있었던 체험이 학부모 화면에서 하루 전으로 보인다.
 * "9월 15일 오전에 다녀온 체험" 이 "9월 14일" 로 적히면 그건 다른 기록이다.
 *
 * 기존 helper 를 그대로 쓴다. timezone 계산을 또 만들지 않는다.
 */
const SEOUL_WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"]

const formatReportDate = (value: string | null) => {
  if (!value) {
    return null
  }

  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  return `${parts.year}년 ${parts.month}월 ${parts.day}일 (${SEOUL_WEEKDAY_SHORT[parts.weekday]})`
}

const formatPublishedDate = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  const month = `${parts.month}`.padStart(2, "0")
  const day = `${parts.day}`.padStart(2, "0")
  return `${parts.year}.${month}.${day}`
}

export default async function ExperienceReportPage({ params, searchParams }: {
  params: Promise<{ experienceId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  noStore()
  const { experienceId } = await params
  const childQuery = (await searchParams)?.child
  // Return navigation carries context only; ownership is validated after authentication.
  const returnTo = withRecordChild(`/record/${experienceId}/report`, typeof childQuery === "string" ? childQuery : null)
  await requireParentAccess({ returnTo })
  const result = await getMyExperienceReport(experienceId)
  if (result.status === "not_found") notFound()

  const selectedChildId = await getRecordChildContext(childQuery)
  const backHref = withRecordChild(`/record/${experienceId}`, selectedChildId)
  if (result.status !== "ok") {
    const isError = result.status === "error"
    return <ReportFrame backHref={backHref}>
      <section className={styles.emptyState} aria-live="polite">
        <h2 className={styles.blockTitle}>{isError ? "리포트를 불러오지 못했어요." : "현재 확인할 수 있는 리포트가 없어요."}</h2>
        {isError ? <><p className={styles.muted}>잠시 후 다시 시도해 주세요.</p><RecordDetailRetry /></> : null}
        <Link href={backHref} className={styles.primaryAction}>체험 기록으로 돌아가기</Link>
      </section>
    </ReportFrame>
  }

  const { report } = result
  const snapshot = report.content
  const summary = getExperienceReportSummary(snapshot)
  const experienceDate = formatReportDate(snapshot.experience.date)
  const publishedDate = formatPublishedDate(report.publishedAt)
  const type = snapshot.experience.type
  const typeLabel = type === "trial_class" || type === "level_test" ? getExperienceTypeLabel(type) : null
  const recommendations = [
    { label: "과정", value: snapshot.recommendation.course },
    { label: "레벨", value: snapshot.recommendation.level }
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))

  return <ReportFrame backHref={backHref}>
    <section className={styles.summary} aria-label="경험 요약">
      {snapshot.experience.child.displayName ? <p className={styles.childName}>
        {snapshot.experience.child.displayName}
        {snapshot.experience.child.grade ? <span className={styles.grade}> · {snapshot.experience.child.grade}</span> : null}
      </p> : null}
      {typeLabel ? <span className={styles.typeBadge}>{typeLabel}</span> : null}
      {snapshot.experience.class.title ? <h2 className={styles.classTitle}>{snapshot.experience.class.title}</h2> : null}
      {snapshot.experience.academy.name ? <p className={styles.muted}>{snapshot.experience.academy.name}</p> : null}
      {experienceDate ? <p className={styles.experienceDate}><time dateTime={snapshot.experience.date}>{experienceDate}</time></p> : null}
    </section>

    {snapshot.observations.length > 0 ? <section className={styles.block} aria-labelledby="observations-title">
      <h2 id="observations-title" className={styles.blockTitle}>선생님이 남긴 관찰</h2>
      <ul className={styles.observationList}>
        {snapshot.observations.map((item, index) => <li key={`${item.code}-${index}`} className={styles.prose}>{item.label}</li>)}
      </ul>
    </section> : null}

    {summary ? <section className={styles.block} aria-labelledby="report-summary-title">
      <h2 id="report-summary-title" className={styles.blockTitle}>선생님 총평</h2>
      <p className={styles.prose}>{summary}</p>
    </section> : null}

    {recommendations.length > 0 ? <section className={styles.block} aria-labelledby="recommendation-title">
      <h2 id="recommendation-title" className={styles.blockTitle}>선생님이 제안한 과정 · 레벨</h2>
      <dl className={styles.recommendationList}>
        {recommendations.map(item => <div key={item.label} className={styles.recommendationRow}>
          <dt>{item.label}</dt><dd className={styles.prose}>{item.value}</dd>
        </div>)}
      </dl>
    </section> : null}

    {snapshot.recommendation.schedule ? <section className={styles.block} aria-labelledby="schedule-title">
      <h2 id="schedule-title" className={styles.blockTitle}>선생님이 제안한 일정</h2>
      <p className={styles.prose}>{snapshot.recommendation.schedule}</p>
    </section> : null}

    <footer className={styles.footer}>
      {publishedDate ? <p className={styles.caption}><time dateTime={report.publishedAt}>{publishedDate}</time> 발행</p> : null}
      <p className={styles.caption}>이 리포트는 체험 당시 학원에서 기록하고 발행한 내용을 바탕으로 보여드려요.</p>
      <Link href={backHref} className={styles.primaryAction}>체험 기록으로 돌아가기</Link>
    </footer>
  </ReportFrame>
}
