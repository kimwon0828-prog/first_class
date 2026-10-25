import { ReportPhotoStrip } from "@/features/reports/ui/report-photos"
import { getReportAttachments } from "@/features/reports/lib/experience-report-snapshot"
import { parentEntryHref } from "@/features/classes/lib/parent-navigation"
import { getParentExperienceFeedback } from "@/features/feedback/queries/get-experience-feedback"
import { ParentFeedbackForm } from "@/features/feedback/ui/parent-feedback-form"
import { getMyCurrentParentDecision } from "@/features/decisions/queries/get-my-current-parent-decision"
import { ReportViewTracker } from "@/features/reports/ui/report-view-tracker"
import { withRecordChild } from "@/features/record/lib/record-href"
import { getRecordChildContext } from "@/features/record/queries/get-record-child-context"
import { notFound } from "next/navigation"
import { unstable_noStore as noStore } from "next/cache"

import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyExperienceReport } from "@/features/record/queries/get-my-experience-report"
import { getExperienceReportSummary } from "@/features/reports/lib/experience-report-snapshot"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { getPublicAcademyPageByHandle } from "@/features/academies/queries/get-public-academy-page"
import { appDateLabel } from "@/features/classes/lib/app-presentation"
import { AppIcon, type AppIconName } from "@/features/classes/ui/app-icon"
import { AcademyLogo, AppButtonLink, AppNotice, Band, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { RecordDetailRetry } from "@/features/record/ui/record-detail-retry"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import { ReportFrame } from "./report-frame"

import styles from "./page.module.css"

// 학원이 발행한 체험 리포트를 학부모가 보는 화면(앱 applications/[id]/report).
//
// ⚠️ 리포트 본문은 experience_reports.content 만 본다.
//    trial_results 를 다시 읽어 조립하지 않는다 — 그러면 학원이 평가를 고치는 순간
//    학부모가 이미 본 리포트가 같이 바뀐다. 발행본은 발행 시점에 얼어붙은 것이다.

export const dynamic = "force-dynamic"
export const revalidate = 0

// 관찰 그룹 이름으로 아이콘을 고른다(앱과 같다). 맞는 것이 없으면 기본 아이콘.
const groupIcons: [RegExp, AppIconName][] = [[/참여|관심|흥미/, "heart"], [/이해|개념|내용/, "book-open"], [/반응|태도|소통|질문/, "message-square"], [/집중/, "clock"], [/표현|창의|생각/, "edit"], [/문제|해결|사고/, "navigation"]]
const groupIcon = (label?: string | null) => groupIcons.find(([pattern]) => label && pattern.test(label))?.[1] ?? "check"
const dateOnly = (value: string) => { const parts = getSeoulDateTimeParts(value); return parts ? `${parts.month}월 ${parts.day}일` : "" }

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return <section className={styles.section} aria-label={title}>
    <div className={ui.sectionHead}><h2 className={ui.subtitle}>{title}</h2>{right ? <span className={ui.caption}>{right}</span> : null}</div>
    {children}
  </section>
}

export default async function ExperienceReportPage({ params, searchParams }: {
  params: Promise<{ experienceId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  noStore()
  const { experienceId } = await params
  const navigationParams = await searchParams
  const childQuery = navigationParams?.child
  // Return navigation carries context only; ownership is validated after authentication.
  const returnTo = parentEntryHref(`/record/${experienceId}/report`, navigationParams)
  const parent = await requireParentAccess({ returnTo })
  const [result, selectedChildId] = await Promise.all([
    getMyExperienceReport(experienceId),
    getRecordChildContext(childQuery)
  ])
  if (result.status === "not_found") notFound()

  const backHref = withRecordChild(`/record/${experienceId}`, selectedChildId)
  if (result.status !== "ok") {
    const isError = result.status === "error"
    return <ReportFrame backHref={backHref}>
      <AppNotice message={isError ? "리포트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." : "현재 확인할 수 있는 리포트가 없어요."}>
        {isError ? <RecordDetailRetry /> : null}
        <AppButtonLink href={backHref} variant="secondary">체험 기록으로 돌아가기</AppButtonLink>
      </AppNotice>
    </ReportFrame>
  }

  const { report, experience } = result
  // 학원 로고 · "학원 보기"는 신청 요약에 학원 정보가 없어 공개 수업 상세 → 공개 학원 페이지(기존 조회)로 찾는다.
  const [feedbackResult, decisionResult, publicClass] = await Promise.all([
    getParentExperienceFeedback(experienceId, parent.id),
    getMyCurrentParentDecision(experienceId),
    experience.classId ? getPublicClassDetail(experience.classId) : Promise.resolve(null)
  ])
  const organizationId = publicClass?.data?.organization?.id ?? null
  const academy = organizationId ? await getPublicAcademyPageByHandle(organizationId).catch(() => null) : null
  const academyHref = organizationId ? `/academy/${academy?.slug ?? organizationId}` : null
  const snapshot = report.content
  const summary = getExperienceReportSummary(snapshot)
  const attachments = getReportAttachments(snapshot)
  const academyName = snapshot.experience.academy.name
  const recommendations = [["과정", snapshot.recommendation.course], ["레벨", snapshot.recommendation.level], ["일정", snapshot.recommendation.schedule]]
    .filter((item): item is [string, string] => Boolean(item[1]))

  return <ReportFrame backHref={backHref} footer={academyHref ? <AppButtonLink href={academyHref} variant="secondary">학원 보기</AppButtonLink> : null}>
    <ReportViewTracker reportId={report.id} />
    <div className={styles.academy}>
      <AcademyLogo size={44} src={academy?.logoImageUrl} subjectCode="other" />
      <p className={`${ui.label} ${ui.oneLine}`}>{academyName}</p>
    </div>
    <div className={styles.title}>
      <h1 className={ui.display}>{snapshot.experience.child.displayName}의 체험 리포트</h1>
      <p className={ui.bodyMuted}>{[snapshot.experience.class.title, snapshot.experience.date ? appDateLabel(snapshot.experience.date) : null].filter(Boolean).join(" · ")}</p>
    </div>

    {summary ? <Section title="선생님 이야기"><p className={`${ui.body} ${styles.story}`}>{summary}</p></Section> : null}

    {attachments.length ? <Section title="수업 사진" right={`${attachments.length}장`}>
      <ReportPhotoStrip attachments={attachments} className={styles.photos} itemClassName={styles.photo} />
    </Section> : null}

    {snapshot.observations.length ? <Section title="수업에서 보인 모습">
      <ul className={styles.observations}>{snapshot.observations.map((observation, index) => <li key={`${observation.code}-${index}`}>
        <span className={styles.observationIcon} aria-hidden="true"><AppIcon name={groupIcon(observation.group?.label)} size={16} /></span>
        <span className={ui.rowText}>{observation.group?.label ? <span className={ui.caption}>{observation.group.label}</span> : null}<span className={ui.subtitle}>{observation.label}</span></span>
      </li>)}</ul>
    </Section> : null}

    {recommendations.length ? <Section title="추천 정보">
      <dl className={styles.recommendations}>{recommendations.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </Section> : null}

    <div className={styles.spacer} />
    <Band />
    <section id="experience-feedback" tabIndex={-1} className={styles.feedback} aria-labelledby="experience-feedback-title">
      <div className={styles.feedbackHead}>
        <h2 id="experience-feedback-title" className={ui.subtitle}>선생님께 한마디<span className={styles.optional}>선택</span></h2>
        <p className={ui.caption}>남긴 의견은 학원에만 전달돼요</p>
      </div>
      <ParentFeedbackForm applicationId={experienceId} result={feedbackResult} decisionResult={decisionResult}
        showDecision={experience.status === "completed" && experience.canCollectParentDecision} showTitle={false} />
    </section>
    <p className={styles.published}>{dateOnly(report.publishedAt)} 발행 · 체험 당시 학원이 기록한 내용이에요</p>
  </ReportFrame>
}
