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
import { getMyCurrentParentDecision } from "@/features/decisions/queries/get-my-current-parent-decision"
import { getMyExperienceReport } from "@/features/record/queries/get-my-experience-report"
import { ParentDecisionForm } from "@/features/decisions/ui/parent-decision-form"
import { ExperienceCancelButton } from "@/features/record/ui/experience-cancel-button"
import { ExperienceTimeline } from "@/features/record/ui/experience-timeline"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import styles from "./page.module.css"

// 한 번의 교육 경험에서 실제로 무슨 일이 있었는지 보는 화면.
//
// Experience id 는 trial_application.id 를 그대로 쓴다. 별도 Experience table 은 없다.
//
// ⚠️ 남의 경험은 보이지 않는다. getMyExperienceDetail 이 학부모 본인의 목록에서만
//    찾으므로, 다른 학부모의 id 를 URL 에 넣으면 notFound() 가 된다.

export const dynamic = "force-dynamic"
export const revalidate = 0

/*
 * 날짜·시각은 한국 시간으로 읽는다.
 *
 * getFullYear() / getHours() 는 실행 환경의 timezone 을 따른다. Vercel 은 UTC 라서
 * 한국 시간 자정 전후의 일정이 하루 전으로 적힌다. 리포트 화면은 이미 KST 인데
 * 여기만 서버 시간이면 같은 체험이 두 화면에서 다른 날짜로 보인다.
 *
 * 기존 helper 를 쓴다. timezone 계산을 또 만들지 않는다.
 */
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

  // 발행된 리포트가 있을 때만 안내한다.
  //
  // 모든 체험에 리포트가 있는 것은 아니다. "아직 리포트가 없습니다" 카드를 만들어 두면
  // 학원이 발행할 의무가 있는 것처럼 읽히고, 없는 약속을 화면이 대신 하게 된다.
  // 철회된 리포트도 여기서 자동으로 사라진다(현재 published 만 조회한다).
  const reportResult = await getMyExperienceReport(experienceId)
  const hasPublishedReport = reportResult.status === "ok"
  // ⚠️ 조회 실패를 "리포트 없음" 으로 접지 않는다. CTA 는 숨기되 왜인지 한 줄 말한다.
  const reportLoadFailed = reportResult.status === "error"

  /*
   * 체험을 마친 뒤에만, 그리고 등록 여부가 아직 확정되지 않았을 때만 묻는다.
   *
   * canCollectParentDecision 은 서버에서 접은 boolean 이다 —
   * 학원이 등록 여부를 무엇으로 적어 뒀는지는 학부모 화면으로 넘어오지 않는다.
   *
   * 리포트 유무와는 무관하다. 리포트가 없어도 부모는 자기 생각을 남길 수 있다.
   */
  const showDecision = experience.status === "completed" && experience.canCollectParentDecision
  const decisionResult = showDecision ? await getMyCurrentParentDecision(experienceId) : null

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

        {showDecision && decisionResult && decisionResult.status !== "not_found" ? (
          <section className={styles.block} aria-labelledby="decision-title">
            <h2 id="decision-title" className={styles.blockTitle}>
              현재 생각
            </h2>
            <ParentDecisionForm
              experienceId={experience.id}
              currentDeclineReason={
                decisionResult.status === "ok" ? (decisionResult.decision?.declineReason ?? null) : null
              }
              currentPreferredDays={
                decisionResult.status === "ok" ? (decisionResult.decision?.preferredDays ?? null) : null
              }
              currentPreferredStartTime={
                decisionResult.status === "ok"
                  ? (decisionResult.decision?.preferredStartTime ?? null)
                  : null
              }
              currentPreferredEndTime={
                decisionResult.status === "ok"
                  ? (decisionResult.decision?.preferredEndTime ?? null)
                  : null
              }
              currentPreferredTimeMode={
                decisionResult.status === "ok"
                  ? (decisionResult.decision?.preferredTimeMode ?? null)
                  : null
              }
              currentDecision={
                decisionResult.status === "ok" ? (decisionResult.decision?.decision ?? null) : null
              }
              loadError={decisionResult.status === "error" ? decisionResult.message : null}
            />
          </section>
        ) : null}

        {hasPublishedReport || reportLoadFailed ? (
          <section className={styles.block} aria-labelledby="report-title">
            <h2 id="report-title" className={styles.blockTitle}>
              체험 리포트
            </h2>
            {hasPublishedReport ? (
              <>
                <p className={styles.blockValue}>학원에서 전달한 체험 내용을 확인해 보세요.</p>
                <Link href={`/record/${experience.id}/report`} className={styles.reportLink}>
                  체험 리포트 보기
                </Link>
              </>
            ) : (
              <p className={styles.blockSub}>리포트 정보를 불러오지 못했습니다.</p>
            )}
          </section>
        ) : null}

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
