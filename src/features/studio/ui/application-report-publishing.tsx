"use client"
import { ReportPhotos } from "@/features/reports/ui/report-photos"
import { getReportAttachments } from "@/features/reports/lib/experience-report-snapshot"
import { ReportObservations } from "@/features/reports/ui/report-observations"

import { useActionState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  publishExperienceReportAction,
  type PublishExperienceReportActionState
} from "@/features/studio/actions/publish-experience-report"
import { formatSeoulDateTime } from "@/features/studio/lib/seoul-datetime"
import { useStudioNavigationPathFactory } from "@/features/studio/ui/studio-navigation-provider"
import { getExperienceReportSummary, type ExperienceReportSnapshotV1 } from "@/features/reports/lib/experience-report-snapshot"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import { getChildGradeLabel } from "@/shared/constants/education-taxonomy"

import { StudioQueryRetry } from "./studio-query-retry"
import { V2Button } from "./v2/v2-button"
import { V2CheckIcon, V2InfoIcon, V2PencilIcon, V2SendIcon } from "./v2/v2-icons"
import { V2StatusBadge } from "./v2/v2-status-badge"
import styles from "./application-report-publishing.module.css"

/**
 * 발행을 막는 이유.
 *
 * 버튼을 누른 뒤 실패를 보여 주는 대신 미리 막는다. DB 도 같은 것을 거절하지만,
 * 원장이 알아야 하는 것은 "지금 무엇을 해야 발행할 수 있는가" 다.
 */
export type ReportPublishBlocker =
  | { kind: "parent_not_linked" }
  | { kind: "legacy_observations"; values: string[] }
  | { kind: "experience_date_missing" }
  | { kind: "no_assessment" }
  | { kind: "report_content_missing" }

export type ApplicationReportPublishingProps = {
  applicationId: string
  /** 지금 저장된 평가로 만든 미리보기. 막힌 상태면 null 이다. */
  preview: ExperienceReportSnapshotV1 | null
  /** 지금 부모에게 공개돼 있는 발행본의 snapshot. 미리보기와 섞지 않는다. */
  publishedSnapshot: ExperienceReportSnapshotV1 | null
  everSent?: boolean
  publishedVersion: number | null
  publishedAt: string | null
  /**
   * 지금 공개된 발행본을 읽지 못했을 때의 사유.
   *
   * ⚠️ null 과 구분해야 한다. "발행본이 없다" 와 "발행본을 모른다" 는 다른 상태다.
   *    모르는 상태를 없음으로 표시하면, 이미 발행된 리포트가 있는데도 원장이
   *    새로 발행하게 되고 기존 발행본이 조용히 superseded 된다.
   */
  publishedReportLoadError: string | null
  /** 원장이 지금 보고 있는 평가의 revision. 발행할 때 그대로 넘긴다. */
  assessmentUpdatedAt: string | null
  /** 마지막 발행 이후 평가가 수정됐는가. */
  assessmentChangedSincePublish: boolean
  blockers: ReportPublishBlocker[]
  /**
   * 학부모에게 발행할 수 있는가(스탠다드).
   *
   * ⚠️ 체험 결과 작성 권한과 다른 값이다. 작성은 학원 안에 남는 기록이고
   *    발행은 학부모에게 나가는 문서다. 미리보기는 이 값과 무관하게 보여 준다 —
   *    발행하지 못해도 무엇이 나갈지는 볼 수 있어야 한다.
   */
  canPublishReport: boolean
}

type Props = ApplicationReportPublishingProps & {
  /**
   * send: "지금 할 일" 카드 — 확인 목록 · 보내기 · 오른쪽 학부모 화면 (Figma 2148:5465).
   * summary: 옆 칸 카드 — 보낸 상태 · 요금제 잠금 · 막힌 이유 · 리포트 보기.
   */
  variant: "send" | "summary"
  onEditRecord?: () => void
  canEditRecord?: boolean
}

const initialPublishState: PublishExperienceReportActionState = {
  status: "idle",
  message: "",
  successToken: null
}

const formatReportDate = (value: string | null) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  // "10월 22일(목)" — 날짜 표기 규칙(요일을 꼭 함께)
  const parts = getSeoulDateTimeParts(date)
  return parts ? `${parts.month}월 ${parts.day}일(${["일", "월", "화", "수", "목", "금", "토"][parts.weekday]})` : null
}

/**
 * 부모에게 실제로 보이는 내용.
 *
 * 미리보기와 발행본이 같은 함수를 쓴다. 둘을 다르게 그리면 "확인한 것" 과
 * "보낸 것" 이 달라 보이고, 원장이 무엇을 확인했는지 알 수 없게 된다.
 */
export const ReportBody = ({ snapshot }: { snapshot: ExperienceReportSnapshotV1 }) => {
  const dateText = formatReportDate(snapshot.experience.date)
  const summary = getExperienceReportSummary(snapshot)
  const { course, level, schedule } = snapshot.recommendation
  // 값이 없는 항목에 "-" 를 채워 넣지 않는다. 없는 것은 그냥 보이지 않는다.
  const recommendations = [course, level, schedule].filter((value): value is string => Boolean(value))

  return (
    <div className={styles.report}>
      <div className={styles.reportHead}>
        <p className={styles.reportAcademy}>{snapshot.experience.academy.name}</p>
        <h3 className={styles.reportTitle}>
          {snapshot.experience.child.displayName} 학생의 체험 리포트
          {snapshot.experience.child.grade ? <span className={styles.reportGrade}> · {getChildGradeLabel(snapshot.experience.child.grade) ?? snapshot.experience.child.grade}</span> : null}
        </h3>
        <p className={styles.reportMeta}>{[snapshot.experience.class.title, dateText].filter(Boolean).join(" · ")}</p>
      </div>

      {summary ? (
        <section className={styles.reportSection} aria-label="선생님 이야기">
          <h4>선생님 이야기</h4>
          <p className={styles.reportSummary}>{summary}</p>
        </section>
      ) : null}
      <ReportPhotos attachments={getReportAttachments(snapshot)} />
      {snapshot.observations.length > 0 ? (
        <section className={styles.reportSection} aria-label="수업에서 보인 모습">
          <h4>수업에서 보인 모습</h4>
          <ReportObservations observations={snapshot.observations} listClassName={styles.reportList} itemClassName={styles.reportListItem} />
        </section>
      ) : null}
      {recommendations.length > 0 ? (
        <p className={styles.reportRecommend}>
          <strong>추천</strong>
          <span>{recommendations.join(" · ")}</span>
        </p>
      ) : null}
    </div>
  )
}

const BLOCKER_TEXT: Record<ReportPublishBlocker["kind"], { title: string; body: string }> = {
  parent_not_linked: {
    title: "학부모 앱 계정이 없어 리포트를 보낼 수 없어요.",
    body: "엑셀로 가져온 신청처럼 학부모 계정이 연결되지 않은 신청이에요. 등록 결과는 계속 기록할 수 있어요."
  },
  legacy_observations: {
    title: "기존 기준으로 작성된 관찰 기록이에요.",
    body: "현재 기준의 관찰 항목을 다시 확인한 뒤 리포트를 보내 주세요."
  },
  experience_date_missing: {
    title: "체험 날짜를 확인할 수 없어 리포트를 보낼 수 없어요.",
    body: "확정 일정 또는 체험 완료 처리를 먼저 확인해 주세요."
  },
  no_assessment: {
    title: "체험 결과가 아직 기록되지 않았어요.",
    body: "체험 결과를 먼저 기록하면 학부모에게 보일 내용을 확인할 수 있어요."
  },
  report_content_missing: {
    title: "학부모에게 전달할 리포트 내용이 아직 없어요.",
    body: "관찰 내용이나 추천 정보를 확인한 뒤 보내 주세요."
  }
}

export const ApplicationReportPublishing = ({
  applicationId,
  variant,
  onEditRecord,
  canEditRecord = false,
  preview,
  publishedSnapshot,
  everSent = false,
  publishedVersion,
  publishedAt,
  publishedReportLoadError,
  assessmentUpdatedAt,
  blockers,
  canPublishReport
}: Props) => {
  const router = useRouter()
  const studioPath = useStudioNavigationPathFactory()
  const publishAction = publishExperienceReportAction.bind(null, applicationId)
  const [publishState, submitPublish, isPublishing] = useActionState(publishAction, initialPublishState)
  const handledPublishTokenRef = useRef<string | null>(null)

  // 발행에 성공하면 화면을 다시 읽는다. 발행본 version 과 공개 내용이
  // 서버가 가진 값으로 바뀌어야 한다 — 화면이 스스로 지어내지 않는다.
  useEffect(() => {
    if (publishState.status !== "success" || !publishState.successToken) {
      return
    }
    if (handledPublishTokenRef.current === publishState.successToken) {
      return
    }
    handledPublishTokenRef.current = publishState.successToken
    router.refresh()
  }, [publishState.status, publishState.successToken, router])

  // 평가가 바뀐 뒤의 발행 실패는 사용자가 고칠 수 있는 상황이다.
  // 최신 내용을 다시 확인하도록 화면을 새로 읽는다 — 자동으로 다시 발행하지 않는다.
  const isStaleFailure = publishState.status === "error" && publishState.message.includes("체험평가 내용이 변경")
  useEffect(() => {
    if (isStaleFailure) router.refresh()
  }, [isStaleFailure, router])

  const activeBlocker = blockers[0] ?? null
  const sent = Boolean(everSent || publishedVersion)
  // 현재 발행 상태를 모르면 어떤 발행 동작도 하지 않는다.
  const canPublish =
    canPublishReport && !sent && !publishedReportLoadError && !activeBlocker && Boolean(preview) && Boolean(assessmentUpdatedAt)
  const publishedDateText = publishedAt ? formatSeoulDateTime(publishedAt) : null
  const needsRecord = blockers.some((blocker) => blocker.kind === "no_assessment")
  const publishHelp = publishedReportLoadError
    ? "리포트 이력을 확인하지 못했어요. 새로고침 후 다시 확인해 주세요."
    : !preview || !assessmentUpdatedAt ? "리포트 내용을 확인하지 못했어요. 기록을 저장한 뒤 새로고침해 주세요."
    : null

  const blockerNotice = activeBlocker ? (
    <div className={styles.warn} role="status">
      <V2InfoIcon size={18} />
      <div>
        <p className={styles.noticeTitle}>{BLOCKER_TEXT[activeBlocker.kind].title}</p>
        <p>{BLOCKER_TEXT[activeBlocker.kind].body}</p>
        {activeBlocker.kind === "legacy_observations" ? <ul>{activeBlocker.values.map((value) => <li key={value}>{value}</li>)}</ul> : null}
      </div>
    </div>
  ) : null

  /*
    발행이 요금제로 잠긴 상태. 버튼만 조용히 지우지 않는다 — 잠긴 것은 발행 하나이고,
    작성 · 미리보기는 그대로 돌아간다(요금 정책은 이번 단계에서 바꾸지 않는다).
  */
  const lockedNotice = !canPublishReport && !sent ? (
    <div className={styles.locked} role="status">
      <p className={styles.noticeTitle}>리포트 보내기는 스탠다드 플랜에서 사용할 수 있어요.</p>
      <p>체험 결과 작성과 미리보기는 계속 사용할 수 있고, 이미 보낸 리포트는 학부모가 그대로 볼 수 있어요.</p>
      <Link href={studioPath("/studio/billing")} prefetch={false}>플랜 확인하기</Link>
    </div>
  ) : null

  const loadErrorNotice = publishedReportLoadError ? (
    <div className={styles.error} role="alert">
      <p className={styles.noticeTitle}>보낸 리포트 정보를 불러오지 못했어요.</p>
      <p>다시 시도한 뒤 확인해 주세요. 공개 상태를 확인하기 전까지는 보낼 수 없어요.</p>
      <StudioQueryRetry />
    </div>
  ) : null

  const messages = publishState.message ? (
    <p className={publishState.status === "error" ? styles.messageError : styles.message} role={publishState.status === "error" ? "alert" : "status"}>
      {publishState.message}
    </p>
  ) : null

  if (variant === "summary") {
    const shown = publishedSnapshot ?? (!sent ? preview : null)
    return (
      <section className={styles.summaryCard} aria-labelledby="report-summary-title">
        <div className={styles.summaryHead}>
          <h3 id="report-summary-title">{sent ? "보낸 리포트" : "학부모 리포트"}</h3>
          {publishedReportLoadError ? (
            <V2StatusBadge tone="gray">확인 필요</V2StatusBadge>
          ) : sent ? (
            <V2StatusBadge tone="green">{publishedVersion ? "보냄" : "보냄 · 공개 종료"}</V2StatusBadge>
          ) : (
            <V2StatusBadge tone="gray">아직 보내지 않음</V2StatusBadge>
          )}
        </div>
        {sent && publishedDateText ? <p className={styles.sentAt}>{publishedDateText} 보냄</p> : null}
        {sent ? <p className={styles.hint}>보낸 리포트는 수정할 수 없어요.</p> : needsRecord ? <p className={styles.hint}>기록 저장 후 리포트를 보낼 수 있어요.</p> : null}
        {loadErrorNotice}
        {!sent ? lockedNotice ?? blockerNotice : null}
        {shown ? (
          <details className={styles.details}>
            <summary>리포트 보기</summary>
            <ReportBody snapshot={shown} />
          </details>
        ) : null}
        {messages}
      </section>
    )
  }

  // send — "지금 할 일" 카드 + 오른쪽 학부모 화면
  const checklist = preview
    ? [
        { label: "선생님 이야기", ok: Boolean(getExperienceReportSummary(preview)) },
        { label: getReportAttachments(preview).length ? `수업 사진 ${getReportAttachments(preview).length}장` : "수업 사진", ok: getReportAttachments(preview).length > 0 },
        { label: preview.observations.length ? `수업에서 보인 모습 ${preview.observations.length}가지` : "수업에서 보인 모습", ok: preview.observations.length > 0 },
        { label: "추천 반·레벨·일정", ok: Boolean(preview.recommendation.course || preview.recommendation.level || preview.recommendation.schedule) }
      ]
    : []

  return (
    <div className={styles.sendLayout}>
      <section id="report-send" className={styles.nowCard} aria-labelledby="report-send-title">
        <p className={styles.nowLabel}>지금 할 일</p>
        <h2 id="report-send-title" className={styles.nowTitle}>리포트를 확인하고 보내 주세요</h2>
        <p className={styles.nowDescription}>오른쪽이 학부모 앱에 보이는 리포트예요. 보내면 학부모 앱에서 리포트를 볼 수 있어요.</p>
        {checklist.length ? (
          <ul className={styles.checklist} aria-label="리포트에 들어가는 내용">
            {checklist.map((item) => (
              <li key={item.label} className={item.ok ? undefined : styles.checkMissing}>
                <V2CheckIcon size={18} />
                {item.label}
                {item.ok ? null : <span className={styles.srOnlyLike}> 없음</span>}
              </li>
            ))}
          </ul>
        ) : null}
        {loadErrorNotice}
        {lockedNotice ?? blockerNotice}
        {!sent && canPublishReport ? (
          <div className={styles.warn}>
            <V2InfoIcon size={18} />
            <p>보낸 뒤에는 고칠 수 없어요. 고칠 게 있으면 먼저 기록을 수정해 주세요.</p>
          </div>
        ) : null}
        <div className={styles.buttons}>
          {!sent && canPublishReport && !needsRecord ? (
            <form action={submitPublish}>
              <input type="hidden" name="expectedAssessmentUpdatedAt" value={assessmentUpdatedAt ?? ""} />
              <V2Button type="submit" size="lg" icon={<V2SendIcon size={18} />} disabled={!canPublish || isPublishing} aria-describedby={publishHelp || isPublishing ? "report-send-help" : undefined}>
                {isPublishing ? "보내는 중..." : "학부모에게 보내기"}
              </V2Button>
            </form>
          ) : null}
          {onEditRecord ? (
            <V2Button variant="outline" size="lg" icon={<V2PencilIcon size={18} />} disabled={!canEditRecord} onClick={onEditRecord}>
              기록 수정
            </V2Button>
          ) : null}
        </div>
        {isPublishing || publishHelp ? <p id="report-send-help" className={styles.hint}>{isPublishing ? "학부모 앱에 리포트를 공개하고 있어요." : publishHelp}</p> : null}
        {messages}
      </section>
      <aside className={styles.previewPane} aria-label="학부모에게 이렇게 보여요">
        <p className={styles.previewLabel}>학부모에게 이렇게 보여요</p>
        <div className={styles.previewCard}>
          {preview ? <ReportBody snapshot={preview} /> : <p className={styles.hint}>저장한 기록으로 리포트를 만들 수 없어요. 기록을 확인해 주세요.</p>}
        </div>
      </aside>
    </div>
  )
}
