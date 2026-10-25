import { ParentDetailLink } from "@/features/classes/ui/parent-detail-link"
import { parentEntryHref } from "@/features/classes/lib/parent-navigation"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { unstable_noStore as noStore } from "next/cache"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyEducationProfile } from "@/features/profile/queries/get-my-education-profile"
import { educationExperienceDateLabel, groupEducationExperiences } from "@/features/profile/lib/education-profile-timeline"
import { getExperienceTypeLabel } from "@/features/record/lib/experience-view"
import { withRecordChild } from "@/features/record/lib/record-href"
import { EducationProfileFrame, EducationProfileSkeleton } from "./profile-frame"
import { EducationProfileRetry } from "./profile-retry"
import { ClassThumb, EmptyState, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import styles from "./page.module.css"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function EducationProfilePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  noStore()
  const params = await searchParams
  const childId = typeof params.child === "string" ? params.child : null
  await requireParentAccess({ returnTo: childId ? parentEntryHref("/record/profile", params) : "/record" })
  if (!childId) notFound()
  return <EducationProfileFrame childId={childId}>
    <Suspense fallback={<EducationProfileSkeleton />}><EducationProfileContent childId={childId} /></Suspense>
  </EducationProfileFrame>
}

async function EducationProfileContent({ childId }: { childId: string }) {
  const result = await getMyEducationProfile(childId)
  // Missing and unowned children share the existing not-found contract.
  if (result.state === "not_found") notFound()
  if (result.state === "error") return <div className={ui.notice} role="alert">
    <p className={ui.body}>교육 프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p><EducationProfileRetry />
  </div>
  const groups = groupEducationExperiences(result.profile.experiences)
  return <>
    <section className={styles.childHeader} aria-label="자녀 정보">
      <span className={styles.avatar} aria-hidden="true">{result.profile.childName.slice(0, 1)}</span>
      <div className={ui.rowText}><h2 className={ui.title}>{result.profile.childName}</h2><p className={ui.caption}>발행된 체험 리포트의 관찰을 시간순으로 모았어요.</p></div>
    </section>
    <div className={ui.softBox}><p className={ui.subtitle}>{result.profile.publishedExperienceCount}개의 체험 리포트</p><p className={ui.caption}>선생님이 남겨주신 소중한 관찰이에요.</p></div>
    {groups.length === 0 ? <EmptyState icon="file-text" title="아직 발행된 체험 리포트가 없어요" body={"체험 리포트가 발행되면\n이곳에서 선생님의 관찰을 함께 볼 수 있어요"} />
      : <div className={`${ui.stackLoose} ${styles.groups}`}>
      {groups.map(group => <section key={group.key} className={ui.stack} aria-labelledby={`month-${group.key}`}>
        <h2 id={`month-${group.key}`} className={ui.groupLabel}>{group.label}</h2>
        <ol className={ui.stack} style={{ margin: 0, padding: 0, listStyle: "none" }}>{group.experiences.map(source => {
          const date = educationExperienceDateLabel(source.experienceDate)
          const typeLabel = source.type === "trial_class" || source.type === "level_test" ? getExperienceTypeLabel(source.type) : null
          return <li key={source.experienceId}><article className={ui.card}>
            <header className={styles.experienceHeader}>
              <ClassThumb src={source.thumbnailUrl} subjectCode="other" size={48} alt={`${source.classTitle} 수업 이미지`} />
              <div className={ui.rowText}>
                <span className={ui.caption}>{[date ?? "날짜 미기록", typeLabel].filter(Boolean).join(" · ")}</span>
                <h3 className={`${ui.subtitle} ${ui.oneLine}`}>{source.classTitle}</h3>
                <p className={`${ui.caption} ${ui.oneLine}`}>{source.academyName}</p>
              </div>
            </header>
            {source.observations.length ? <ul className={styles.observations} aria-label="선생님의 관찰">
              {source.observations.map((observation, index) => <li key={`${observation.code}-${index}`}>{observation.label}</li>)}
            </ul> : <p className={ui.caption}>이 리포트에는 남겨진 관찰이 없어요. 수업에 대한 전체 내용은 리포트에서 확인해 보세요.</p>}
            <ParentDetailLink href={withRecordChild(`/record/${source.experienceId}/report`, childId)} className={ui.cancelTrigger} aria-label={`${source.classTitle} 리포트 보기`}>리포트 보기</ParentDetailLink>
          </article></li>
        })}</ol>
      </section>)}
    </div>}
  </>
}
