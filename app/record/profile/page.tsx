import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { unstable_noStore as noStore } from "next/cache"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyEducationProfile } from "@/features/profile/queries/get-my-education-profile"
import { educationExperienceDateLabel, groupEducationExperiences } from "@/features/profile/lib/education-profile-timeline"
import { getExperienceTypeLabel } from "@/features/record/lib/experience-view"
import { withRecordChild } from "@/features/record/lib/record-href"
import { EducationProfileFrame, EducationProfileSkeleton } from "./profile-frame"
import { EducationProfileRetry } from "./profile-retry"
import { ClassThumbnail } from "./class-thumbnail"
import styles from "./page.module.css"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function EducationProfilePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  noStore()
  const params = await searchParams
  const childId = typeof params.child === "string" ? params.child : null
  await requireParentAccess({ returnTo: childId ? withRecordChild("/record/profile", childId) : "/record" })
  if (!childId) notFound()
  return <EducationProfileFrame childId={childId}>
    <Suspense fallback={<EducationProfileSkeleton />}><EducationProfileContent childId={childId} /></Suspense>
  </EducationProfileFrame>
}

function DocumentIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></svg>
}

async function EducationProfileContent({ childId }: { childId: string }) {
  const result = await getMyEducationProfile(childId)
  // Missing and unowned children share the existing not-found contract.
  if (result.state === "not_found") notFound()
  if (result.state === "error") return <section className={styles.empty} role="alert">
    <h2>교육 프로필을 불러오지 못했어요.</h2><p>잠시 후 다시 시도해주세요.</p><EducationProfileRetry />
  </section>
  const groups = groupEducationExperiences(result.profile.experiences)
  return <>
    <section className={styles.childHeader} aria-label="자녀 정보">
      <span className={styles.avatar} aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg></span>
      <div><h2 className={styles.childName}>{result.profile.childName}</h2><p className={styles.childNote}>발행된 체험 리포트의 관찰을 시간순으로 모았어요.</p></div>
    </section>
    <section className={styles.summary} aria-label="체험 리포트 요약">
      <span className={styles.summaryIcon}><DocumentIcon /></span>
      <div><p className={styles.count}>{result.profile.publishedExperienceCount}개의 체험 리포트</p><p className={styles.summaryNote}>선생님이 남겨주신 소중한 관찰이에요.</p></div>
    </section>
    {groups.length === 0 ? <section className={styles.empty}>
      <h2>아직 발행된 체험 리포트가 없어요.</h2><p>체험 리포트가 발행되면<br />이곳에서 선생님의 관찰을 함께 볼 수 있어요.</p>
    </section> : <div className={styles.groups}>
      {groups.map(group => <section key={group.key} aria-labelledby={`month-${group.key}`}>
        <h2 id={`month-${group.key}`} className={styles.month}>{group.label}</h2>
        <ol className={styles.timeline}>{group.experiences.map(source => {
          const date = educationExperienceDateLabel(source.experienceDate)
          const typeLabel = source.type === "trial_class" || source.type === "level_test" ? getExperienceTypeLabel(source.type) : null
          return <li key={source.experienceId} className={styles.entry}>
            {date ? <time className={styles.date} dateTime={source.experienceDate}>{date}</time> : <span className={styles.date}>날짜 미기록</span>}
            <article className={styles.card}>
              <header className={styles.experienceHeader}>
                <ClassThumbnail url={source.thumbnailUrl} title={source.classTitle} />
                <div className={styles.experienceInfo}>
                {typeLabel ? <p className={styles.type}>{typeLabel}</p> : null}
                <h3 className={styles.classTitle}>{source.classTitle}</h3>
                <p className={styles.academy}>{source.academyName}</p>
                </div>
              </header>
              <section className={styles.observations} aria-label="선생님의 관찰">
                <h4 className={styles.observationTitle}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11a8 8 0 0 1-8 8H9l-5 3v-6a8 8 0 0 1-1-5 8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" /></svg>선생님의 관찰</h4>
                {source.observations.length ? <ul className={styles.observationList}>
                  {source.observations.map((observation, index) => <li key={`${observation.code}-${index}`}>{observation.label}</li>)}
                </ul> : <div className={styles.noObservations}><p>이 리포트에는 남겨진 관찰이 없어요.</p><p>수업에 대한 전체 내용은 리포트에서 확인해보세요.</p></div>}
              </section>
              <Link href={withRecordChild(`/record/${source.experienceId}/report`, childId)} className={styles.reportLink} aria-label={`${source.classTitle} 리포트 보기`}>
                <DocumentIcon />리포트 보기 <svg className={styles.chevron} aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
              </Link>
            </article>
          </li>
        })}</ol>
      </section>)}
    </div>}
  </>
}
