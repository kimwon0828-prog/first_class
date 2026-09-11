import Link from "next/link"
import { notFound } from "next/navigation"
import { unstable_noStore as noStore } from "next/cache"

import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import {
  getExperienceTypeLabel,
  resolveExperienceStage,
  resolveParentExperienceDate,
  getExperienceStageLabel
} from "@/features/record/lib/experience-view"
import { getMyExperienceDetail } from "@/features/record/queries/get-my-experience-detail"
import { ExperienceCancelButton } from "@/features/record/ui/experience-cancel-button"
import { ExperienceTimeline } from "@/features/record/ui/experience-timeline"
import styles from "./page.module.css"

// 한 번의 교육 경험에서 실제로 무슨 일이 있었는지 보는 화면.
//
// Experience id 는 trial_application.id 를 그대로 쓴다. 별도 Experience table 은 없다.
//
// ⚠️ 남의 경험은 보이지 않는다. getMyExperienceDetail 이 학부모 본인의 목록에서만
//    찾으므로, 다른 학부모의 id 를 URL 에 넣으면 notFound() 가 된다.

export const dynamic = "force-dynamic"
export const revalidate = 0

const formatFullDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]})`
}

const formatTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const hours = date.getHours()
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  return `${hours < 12 ? "오전" : "오후"} ${hours % 12 || 12}:${minutes}`
}

export default async function ExperienceDetailPage({
  params
}: {
  params: Promise<{ experienceId: string }>
}) {
  noStore()
  const { experienceId } = await params
  await requireParentAccess({ returnTo: `/record/${experienceId}` })

  const experience = await getMyExperienceDetail(experienceId)
  if (!experience) {
    notFound()
  }

  const stage = resolveExperienceStage(experience)
  const typeLabel = getExperienceTypeLabel(experience.classProgramType)
  const primaryDate = resolveParentExperienceDate(experience)
  const scheduleAt = experience.confirmedSlotAt ?? experience.requestedSlotAt
  const scheduleDay = scheduleAt ? formatFullDate(scheduleAt) : null
  const scheduleTime = scheduleAt ? formatTime(scheduleAt) : null
  const isConfirmed = Boolean(experience.confirmedSlotAt)

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/record" className={styles.back}>
            ← 기록
          </Link>
        </header>

        <section className={styles.hero}>
          <p className={styles.typeLabel}>{typeLabel}</p>
          <h1 className={styles.title}>{experience.classTitle ?? "수업 정보 없음"}</h1>
          <p className={styles.academy}>{experience.academyName?.trim() || "정보 준비 중"}</p>
          <p className={styles.heroDate}>{formatFullDate(primaryDate)}</p>
          <p className={styles.stage}>{getExperienceStageLabel(stage, experience.classProgramType)}</p>
        </section>

        <section className={styles.block} aria-labelledby="who-title">
          <h2 id="who-title" className={styles.blockTitle}>
            누가
          </h2>
          <p className={styles.blockValue}>
            {experience.childName} · {experience.childGrade}
          </p>
        </section>

        <section className={styles.block} aria-labelledby="when-title">
          <h2 id="when-title" className={styles.blockTitle}>
            {isConfirmed ? "확정 일정" : "희망 일정"}
          </h2>
          <p className={styles.blockValue}>
            {scheduleDay ?? experience.selectedScheduleLabel ?? "일정 협의 필요"}
          </p>
          {scheduleTime ? <p className={styles.blockSub}>{scheduleTime}</p> : null}
        </section>

        <section className={styles.block} aria-labelledby="flow-title">
          <h2 id="flow-title" className={styles.blockTitle}>
            진행 흐름
          </h2>
          <ExperienceTimeline experience={experience} />
        </section>

        <div className={styles.actions}>
          <Link href={`/classes/${experience.classId}`} className={styles.secondaryLink}>
            수업 정보 보기
          </Link>
          {experience.canCancel ? (
            <ExperienceCancelButton
              experienceId={experience.id}
              confirmDescription={`${experience.classTitle ?? "이 수업"} 신청을 취소할까요?`}
            />
          ) : null}
        </div>
      </div>
    </main>
  )
}
