import { parentEntryHref } from "@/features/classes/lib/parent-navigation"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { withRecordChild } from "@/features/record/lib/record-href"
import { getRecordChildContext } from "@/features/record/queries/get-record-child-context"
import { notFound } from "next/navigation"
import { unstable_noStore as noStore } from "next/cache"

import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyExperienceDetailResult } from "@/features/record/queries/get-my-experience-detail"
import { getMyExperienceReport } from "@/features/record/queries/get-my-experience-report"
import { ExperienceCancelButton } from "@/features/record/ui/experience-cancel-button"
import { getExperienceReportSummary } from "@/features/reports/lib/experience-report-snapshot"
import { RecordDetailRetry } from "@/features/record/ui/record-detail-retry"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { getPublicAcademyPageByHandle } from "@/features/academies/queries/get-public-academy-page"
import { appDateLabel, appTimeLabel, appTimeRangeLabel } from "@/features/classes/lib/app-presentation"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { AppButtonLink, Band, IconRow, StatusBadge, Timeline, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { AcademyInquiryButton } from "@/features/classes/ui/parent-app-ui-client"
import { applicationAddress, applicationBadge, isPendingApplication, slotAt } from "@/features/schedule/lib/app-schedule"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

import styles from "./page.module.css"

/*
 * 한 번의 신청 · 교육 경험 상세(앱 applications/[id]).
 *
 * Experience id 는 trial_application.id 를 그대로 쓴다. 별도 Experience table 은 없다.
 * getMyExperienceDetail 이 학부모 본인의 목록에서만 찾으므로 남의 id 는 notFound 다.
 * 도메인 status 를 새로 만들거나 서로 변환하지 않는다.
 */

export const dynamic = "force-dynamic"
export const revalidate = 0

const shortTime = (value?: string | null) => {
  const parts = value ? getSeoulDateTimeParts(value) : null
  return parts ? `${parts.month}월 ${parts.day}일 ${appTimeLabel(value!)}` : null
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
  const navigationParams = await searchParams
  await requireParentAccess({ returnTo: parentEntryHref(`/record/${experienceId}`, navigationParams) })

  const detailResult = await getMyExperienceDetailResult(experienceId)
  if (detailResult.error) throw new Error("경험 정보를 불러오지 못했어요.")
  const experience = detailResult.data
  if (!experience) {
    notFound()
  }

  const completed = experience.status === "completed"
  const canceled = experience.status === "canceled" || Boolean(experience.canceledAt)
  // Ownership above remains the gate; these reads are independent afterwards.
  // 학원 문의·학원 보기는 신청 요약에 학원 정보가 없어 공개 수업 상세 → 공개 학원 페이지(기존 조회)로 찾는다.
  const [selectedChildId, reportResult, publicClass] = await Promise.all([
    getRecordChildContext(navigationParams?.child),
    completed ? getMyExperienceReport(experienceId) : Promise.resolve(null),
    experience.classId ? getPublicClassDetail(experience.classId) : Promise.resolve(null)
  ])
  const organizationId = publicClass?.data?.organization?.id ?? null
  const academy = organizationId ? await getPublicAcademyPageByHandle(organizationId).catch(() => null) : null
  const academyHref = organizationId ? `/academy/${academy?.slug ?? organizationId}` : experience.academyHandle ? `/academy/${experience.academyHandle}` : null
  const backHref = withRecordChild(completed ? "/record" : "/my/schedule", selectedChildId)

  const hasPublishedReport = reportResult?.status === "ok"
  const reportLoadFailed = reportResult?.status === "error"
  const snapshot = reportResult?.status === "ok" ? reportResult.report.content : null
  const summary = snapshot ? getExperienceReportSummary(snapshot) : null

  const at = slotAt(experience)
  const badge = applicationBadge(experience)
  const address = applicationAddress(experience)
  const pending = isPendingApplication(experience)
  const showMap = experience.status === "confirmed" && Boolean(address)
  const childLabel = [experience.childName, experience.childGrade].filter(Boolean).join(" · ")
  const title = completed ? "체험 기록" : "예약 상세"

  return (
    <ParentAppShell navigation={false} className={ui.page}>
      <div className={ui.column}>
        <ParentHeader title={title} backHref={backHref} sticky />
        <div className={ui.content}>
          <section className={styles.summary} aria-label={title}>
            {badge ? <StatusBadge label={badge.label} tone={badge.tone} /> : null}
            <h2 className={ui.display}>{experience.classTitle ?? "수업 정보 준비 중"}</h2>
            <IconRow icon="calendar"><time dateTime={at}>{at ? `${appDateLabel(at)} ${appTimeRangeLabel(at, experience.slotEndAt)}` : "일정 확인 중"}</time></IconRow>
            {childLabel ? <IconRow icon="user">{childLabel}</IconRow> : null}
            {[experience.academyName, address].some(Boolean) ? <IconRow icon="map-pin">{[experience.academyName, address].filter(Boolean).join(" · ")}</IconRow> : null}
            {pending ? <p className={`${ui.pendingNote} ${styles.gap}`}><AppIcon name="clock" size={14} /><span>학원이 확인하면 확정 알림을 보내드려요</span></p> : null}
            {academyHref || showMap ? <div className={`${ui.buttonRow} ${styles.gap}`}>
              {academyHref ? <AcademyInquiryButton phone={academy?.phone ?? null} academyHref={academyHref} /> : null}
              {showMap ? <a href={`https://map.naver.com/p/search/${encodeURIComponent(address!)}`} target="_blank" rel="noreferrer" className={ui.button} data-variant="primary" aria-label="길찾기 (새 창)">길찾기</a> : null}
            </div> : null}
          </section>

          <Band />
          {canceled ? <p className={`${ui.body} ${styles.block}`} style={{ color: "var(--ink-700)" }}>취소된 신청이에요.</p>
            : <section className={styles.block} aria-label="진행 상황"><h2 className={ui.subtitle}>진행 상황</h2>
              <Timeline steps={[
                ["신청 완료", shortTime(experience.createdAt), true],
                ["학원 확정", null, experience.status === "confirmed" || completed],
                ["일정 확인", "체험 전 확정 일정을 확인해 주세요", completed],
                ["체험 당일", shortTime(at), completed]
              ]} />
            </section>}

          {completed ? <><Band /><section className={styles.block} aria-labelledby="report-title">
            <h2 id="report-title" className={ui.subtitle}>선생님이 남긴 관찰</h2>
            {hasPublishedReport ? <>
              {snapshot?.observations.slice(0, 2).map((observation, index) => <p className={ui.body} key={`${observation.code}-${index}`}>{observation.label}</p>)}
              {summary ? <p className={ui.body} style={{ color: "var(--ink-700)" }}>{summary}</p> : null}
              <AppButtonLink href={withRecordChild(`/record/${experience.id}/report`, selectedChildId)} variant="tonal">리포트 전체 보기</AppButtonLink>
            </> : reportLoadFailed ? <div className={ui.notice} role="status"><p className={ui.body}>리포트 정보를 불러오지 못했어요.</p><RecordDetailRetry /></div>
              : <p className={ui.bodyMuted}>아직 등록된 리포트가 없어요.</p>}
          </section></> : null}

          {experience.canCancel ? <><Band /><ExperienceCancelButton experienceId={experience.id} label="예약 취소" className={ui.dangerRow}
            trailing={<AppIcon name="chevron-right" size={18} />} confirmDescription={`${experience.classTitle ?? "이 수업"} 신청을 취소할까요?`} /></> : null}
        </div>
      </div>
    </ParentAppShell>
  )
}
