import Link from "next/link"
import type { ReactNode } from "react"
import { HomeChildSelector } from "@/features/children/ui/home-child-selector"
import type { ChildSelectorOption } from "@/features/children/lib/child-selection"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import { buildClassesHref } from "@/features/classes/lib/classes-href"
import type { ParentExperience } from "@/features/record/lib/experience-view"
import { withRecordChild } from "@/features/record/lib/record-href"
import { RecordExperienceList } from "./record-experience-list"
import { RecordRetry } from "./record-retry"
import styles from "../../../../app/record/page.module.css"
import contextStyles from "@/features/schedule/ui/parent-schedule-screen.module.css"

function RecordIcon({ person = false }: { person?: boolean }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {person ? <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></> : <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>}
  </svg>
}
export function RecordFrame({ children }: { children: ReactNode }) {
  return <main data-parent-design="v1" className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><h1 className={styles.title}>기록</h1><p className={styles.subcopy}>아이의 경험과 남겨진 기록을 확인해보세요.</p></header>
    {children}
  </div><ParentBottomNav designVersion="v1" /></main>
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
  const selected = childOptions.find((child) => child.id === selectedChildId) ?? null
  const profileChild = selected ?? (childOptions.length === 1 ? childOptions[0] : null)
  return <RecordFrame>
    {error ? <section className={styles.emptyState} role="alert">
      <h2>{error === "children" ? "자녀 정보를 불러오지 못했어요." : "교육 기록을 불러오지 못했어요."}</h2>
      <p>잠시 후 다시 시도해주세요.</p><RecordRetry />
    </section> : <>
      {childOptions.length > 0 && <HomeChildSelector options={childOptions} selectedChildId={selectedChildId} manageSheetFocus
        unselectedLabel="모든 아이" allChildrenLabel="모든 아이" className={contextStyles.childSelector} labelClassName={contextStyles.childLabel}
        triggerContent={<><span className={contextStyles.avatar}><RecordIcon person /></span><span className={contextStyles.childText}>
          <span>{selected?.name ?? "모든 아이"}</span><span className={contextStyles.grade}>{selected ? selected.grade : `총 ${childOptions.length}명의 자녀`}</span>
        </span></>} />}
      {profileChild ? <Link href={withRecordChild("/record/profile", profileChild.id)} className={styles.profileCta}>
        <span className={styles.profileIcon}><RecordIcon /></span><span className={styles.profileBody}>
          <strong>교육 프로필</strong><span>아이의 교육 경험을 한눈에 살펴보세요.</span>
        </span><span aria-hidden="true">›</span>
      </Link> : null}
      <div className={styles.content}>
        <h2 className={styles.count}>교육 기록 {experiences.length}개</h2>
        {signalsFailed && <p className={styles.signalNotice}>리포트와 생각 기록 정보를 불러오지 못했어요. 경험 상세에서 다시 확인해주세요.</p>}
        {experiences.length === 0 ? <section className={styles.emptyState}>
          <span className={styles.emptyIcon}><RecordIcon /></span>
          <h3>아직 쌓인 교육 기록이 없어요.</h3>
          <p>체험수업이나 레벨테스트를 완료하면<br />아이의 경험이 이곳에 차곡차곡 쌓여요.</p>
          <Link href={buildClassesHref({ child: selectedChildId })} className={styles.primaryButton}>수업 찾아보기</Link>
        </section> : <RecordExperienceList experiences={experiences} showChildName={!selectedChildId} selectedChildId={selectedChildId}
          reportedExperienceIds={reportedExperienceIds} decidedExperienceIds={decidedExperienceIds} />}
      </div>
    </>}
  </RecordFrame>
}
export function RecordSkeleton() {
  return <RecordFrame><div className={styles.skeleton} role="status" aria-label="교육 기록 불러오는 중">
    <div className={styles.skeletonContext} />
    {[0, 1, 2].map(key => <div className={styles.skeletonCard} key={key}><span /><div><span /><span /><span /></div></div>)}
  </div></RecordFrame>
}
