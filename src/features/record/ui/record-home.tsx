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
  // 신청 요약에 학원 로고가 없어 원형 자리에 기본 아이콘을 둔다(앱의 로고 없을 때 모양).
  return <span className={styles.head}>
    <AcademyLogo size={36} subjectCode="other" />
    <span className={ui.rowText}>
      <span className={`${ui.subtitle} ${ui.oneLine}`}>{item.classTitle ?? "수업 정보 준비 중"}</span>
      <span className={`${ui.caption} ${ui.oneLine}`}>{meta(item)}</span>
    </span>
  </span>
}

function ReportCard({ item, decided, childId }: { item: ParentExperience; decided: boolean | null; childId: string | null }) {
  const report = withRecordChild(`/record/${item.id}/report`, childId)
  return <article className={ui.card}>
    <ParentDetailLink href={report} className={styles.cardLink} aria-label={`${item.classTitle ?? "수업"} 리포트 보기`}>
      <Head item={item} /><AppIcon name="chevron-right" size={18} />
    </ParentDetailLink>
    {decided === true ? <p className={styles.sent}><AppIcon name="message-square" size={14} />내 의견 보냄</p>
      : decided === false ? <div className={styles.feedbackRow}>
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
  decidedExperienceIds?: ReadonlySet<string>
  signalsFailed?: boolean
}
export function RecordHome({ experiences, childOptions, selectedChildId, error, reportedExperienceIds, decidedExperienceIds, signalsFailed }: RecordHomeProps) {
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
          ? <ReportCard key={item.id} item={item} childId={selectedChildId} decided={decidedExperienceIds ? decidedExperienceIds.has(item.id) : null} />
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
