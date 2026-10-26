import Link from "next/link"
import type { ReactNode } from "react"

import type { ChildSelectorOption } from "@/features/children/lib/child-selection"
import { buildClassesHref } from "@/features/classes/lib/classes-href"
import { appDateLabel, seoulDateKey } from "@/features/classes/lib/app-presentation"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentDetailLink } from "@/features/classes/ui/parent-detail-link"
import { AcademyLogo, AppButtonLink, AppLoading, EmptyState, StatusBadge, TabHeader, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import type { ParentExperience } from "@/features/record/lib/experience-view"
import { withRecordChild } from "@/features/record/lib/record-href"
import { slotAt } from "@/features/schedule/lib/app-schedule"

import { RecordRetry } from "./record-retry"
import { attachmentUrl } from "@/features/reports/lib/report-attachments"
import type { ReportCardPreview } from "@/features/record/queries/get-parent-experience-signals"
import styles from "../../../../app/record/page.module.css"

// 앱 (tabs)/record(record-screen.tsx). 리포트가 있는 체험은 리포트 카드, 아직 없는 체험(완료 처리 전 포함)은 준비 중 카드.
const when = (item: ParentExperience) => item.status === "completed" ? item.confirmedSlotAt || item.completedAt || item.requestedSlotAt : slotAt(item)
const monthTitle = (value: string) => { const key = seoulDateKey(value); return `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월` }
const meta = (item: ParentExperience) => [item.academyName, appDateLabel(when(item))].filter(Boolean).join(" · ")

export function RecordFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell data-parent-design="v1" className={ui.page}><div className={ui.column}>
    <TabHeader title="기록" />
    <div className={ui.tabContent}>{children}</div>
  </div></ParentAppShell>
}

function Head({ item }: { item: ParentExperience }) {
  // 학원 공개 프로필 로고. 없으면 앱처럼 원 안에 기본 아이콘.
  return <span className={styles.head}>
    <AcademyLogo size={36} src={item.academyLogoUrl} subjectCode="other" />
    <span className={ui.rowText}>
      <span className={`${ui.subtitle} ${ui.oneLine}`}>{item.classTitle ?? "수업 정보 준비 중"}</span>
      <span className={`${ui.caption} ${ui.oneLine}`}>{meta(item)}</span>
    </span>
  </span>
}

// 앱 ReportCard: 머리 · 선생님 이야기 인용 · 사진 3칸(+N) · "내 의견 보냄" / "아직 의견을 남기지 않았어요 · 한마디 남기기".
function ReportCard({ item, preview, feedback, childId }: { item: ParentExperience; preview?: ReportCardPreview; feedback: "sent" | "open" | null; childId: string | null }) {
  const report = withRecordChild(`/record/${item.id}/report`, childId)
  const photos = preview?.photoIds ?? [], more = (preview?.photoCount ?? 0) > 3 ? (preview?.photoCount ?? 0) - 2 : 0
  return <article className={ui.card}>
    <ParentDetailLink href={report} className={styles.cardBody} aria-label={`${item.classTitle ?? "수업"} 리포트 보기`}>
      <span className={styles.cardLink}><Head item={item} /><AppIcon name="chevron-right" size={18} /></span>
      {preview?.summary ? <span className={styles.quote}>“{preview.summary}”</span> : null}
      {photos.length ? <span className={styles.photos}>{photos.map((id, index) => <span key={id} className={styles.photo}>
        {/* 리포트 사진은 기존 학부모 전용 경로(/api/report-attachments)로만 읽는다. 공개 이미지 캐시를 거치지 않는다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachmentUrl(id)} alt="" loading="lazy" />
        {more && index === 2 ? <span className={styles.more}>+{more}</span> : null}
      </span>)}</span> : null}
    </ParentDetailLink>
    {feedback === "sent" ? <p className={styles.sent}><AppIcon name="message-square" size={14} />내 의견 보냄</p>
      : feedback === "open" ? <div className={styles.feedbackRow}>
        <span className={styles.notYet}>아직 의견을 남기지 않았어요</span>
        <Link href={`${report}#experience-feedback`} className={styles.feedbackLink} aria-label={`${item.classTitle ?? "수업"} 한마디 남기기`}>한마디 남기기<AppIcon name="chevron-right" size={16} /></Link>
      </div> : null}
  </article>
}

function PreparingCard({ item, childId }: { item: ParentExperience; childId: string | null }) {
  return <ParentDetailLink href={withRecordChild(`/record/${item.id}`, childId)} className={styles.preparing} aria-label={`${item.classTitle ?? "수업"} 상세`}>
    <Head item={item} /><StatusBadge label="리포트 준비 중" />
  </ParentDetailLink>
}

type RecordHomeProps = {
  experiences: ParentExperience[]
  childOptions: ChildSelectorOption[]
  selectedChildId: string | null
  error: "children" | "records" | null
  reportedExperienceIds?: ReadonlySet<string>
  reportPreviews?: ReadonlyMap<string, ReportCardPreview>
  /** 의견을 남길 수 있는 경험 / 의견과 등록 의향을 모두 남긴 경험. 읽지 못했으면 없음(줄을 그리지 않는다). */
  feedbackEligibleIds?: ReadonlySet<string>
  feedbackSentIds?: ReadonlySet<string>
  signalsFailed?: boolean
}
export function RecordHome({ experiences, childOptions, selectedChildId, error, reportedExperienceIds, reportPreviews, feedbackEligibleIds, feedbackSentIds, signalsFailed }: RecordHomeProps) {
  const profileChild = childOptions.find(child => child.id === selectedChildId) ?? (childOptions.length === 1 ? childOptions[0] : null)
  const sorted = [...experiences].sort((a, b) => Date.parse(when(b)) - Date.parse(when(a)) || a.id.localeCompare(b.id))
  const months = new Map<string, ParentExperience[]>()
  for (const item of sorted) { const key = monthTitle(when(item)); months.set(key, [...(months.get(key) ?? []), item]) }
  return <RecordFrame>
    {error ? <div className={ui.notice} role="alert">
      <p className={ui.body}>{error === "children" ? "자녀 정보를 불러오지 못했어요." : "기록을 불러오지 못했어요."} 잠시 후 다시 시도해 주세요.</p><RecordRetry />
    </div> : <>
      {childOptions.length > 1 ? <nav className={styles.chips} aria-label="아이 선택">
        <Link href="/record" className={ui.filterChip} aria-pressed={!selectedChildId} replace>모든 아이</Link>
        {childOptions.map(child => <Link key={child.id} href={withRecordChild("/record", child.id)} className={ui.filterChip} aria-pressed={selectedChildId === child.id} replace>{child.name}</Link>)}
      </nav> : null}
      {profileChild ? <ParentDetailLink href={withRecordChild("/record/profile", profileChild.id)} className={`${ui.rowLink} ${styles.profile}`}>
        <span className={ui.rowText}><span className={ui.label}>교육 프로필</span><span className={ui.caption}>아이의 교육 경험을 한눈에 살펴보세요.</span></span>
        <AppIcon name="chevron-right" size={18} />
      </ParentDetailLink> : null}
      {signalsFailed ? <p className={ui.caption} role="status">리포트 정보를 불러오지 못했어요. 체험 기록에서 다시 확인해 주세요.</p> : null}
      {sorted.length ? <div className={`${ui.stackLoose} ${styles.months}`}>{[...months].map(([month, list]) => <section key={month} className={ui.stack} aria-label={month}>
        <h2 className={ui.groupLabel}>{month}</h2>
        {list.map(item => item.status === "completed" && reportedExperienceIds?.has(item.id)
          ? <ReportCard key={item.id} item={item} childId={selectedChildId} preview={reportPreviews?.get(item.id)}
            feedback={feedbackSentIds?.has(item.id) ? "sent" : feedbackEligibleIds?.has(item.id) ? "open" : null} />
          : <PreparingCard key={item.id} item={item} childId={selectedChildId} />)}
      </section>)}</div>
        : <EmptyState icon="file-text" title="아직 받은 리포트가 없어요" body="체험을 마치면 선생님이 남긴 기록이 여기 쌓여요"
          action={<AppButtonLink href={buildClassesHref({ child: selectedChildId })} size="medium">체험수업 둘러보기</AppButtonLink>} />}
    </>}
  </RecordFrame>
}
export function RecordSkeleton() {
  return <RecordFrame><AppLoading label="기록 불러오는 중" /></RecordFrame>
}
