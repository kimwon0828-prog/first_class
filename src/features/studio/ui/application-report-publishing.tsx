"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  publishExperienceReportAction,
  type PublishExperienceReportActionState
} from "@/features/studio/actions/publish-experience-report"
import {
  withdrawExperienceReportAction,
  type WithdrawExperienceReportActionState
} from "@/features/studio/actions/withdraw-experience-report"
import { formatSeoulDateTime } from "@/features/studio/lib/seoul-datetime"
import type { ExperienceReportSnapshotV1 } from "@/features/reports/lib/experience-report-snapshot"
import { SEOUL_TIME_ZONE } from "@/shared/lib/seoul-datetime"

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

type ApplicationReportPublishingProps = {
  applicationId: string
  /** 지금 저장된 평가로 만든 미리보기. 막힌 상태면 null 이다. */
  preview: ExperienceReportSnapshotV1 | null
  /** 지금 부모에게 공개돼 있는 발행본의 snapshot. 미리보기와 섞지 않는다. */
  publishedSnapshot: ExperienceReportSnapshotV1 | null
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
  canWrite: boolean
}

const initialPublishState: PublishExperienceReportActionState = {
  status: "idle",
  message: "",
  successToken: null
}

const initialWithdrawState: WithdrawExperienceReportActionState = {
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

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: SEOUL_TIME_ZONE
  }).format(date)
}

/**
 * 부모에게 실제로 보이는 내용.
 *
 * 미리보기와 발행본이 같은 함수를 쓴다. 둘을 다르게 그리면 "확인한 것" 과
 * "보낸 것" 이 달라 보이고, 원장이 무엇을 확인했는지 알 수 없게 된다.
 */
const ReportBody = ({ snapshot }: { snapshot: ExperienceReportSnapshotV1 }) => {
  const dateText = formatReportDate(snapshot.experience.date)
  const { course, level, schedule } = snapshot.recommendation
  // 값이 없는 항목에 "-" 를 채워 넣지 않는다. 없는 것은 그냥 보이지 않는다.
  const recommendations = [
    { label: "과정", value: course },
    { label: "레벨", value: level },
    { label: "일정", value: schedule }
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))

  return (
    <div className={styles.report}>
      <div className={styles.reportHead}>
        <p className={styles.reportChild}>
          {snapshot.experience.child.displayName} 학생
          {snapshot.experience.child.grade ? (
            <span className={styles.reportChildGrade}>· {snapshot.experience.child.grade}</span>
          ) : null}
        </p>
        {dateText ? <p className={styles.reportDate}>{dateText}</p> : null}
        <p className={styles.reportAcademy}>{snapshot.experience.academy.name}</p>
        <p className={styles.reportClass}>{snapshot.experience.class.title}</p>
      </div>

      <section className={styles.reportSection} aria-label="관찰된 모습">
        <h4 className={styles.reportSectionTitle}>관찰된 모습</h4>
        {snapshot.observations.length > 0 ? (
          <ul className={styles.reportList}>
            {snapshot.observations.map((item) => (
              <li key={item.code} className={styles.reportListItem}>
                {item.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.reportEmpty}>등록된 관찰 내용이 없습니다.</p>
        )}
      </section>

      {recommendations.length > 0 ? (
        <section className={styles.reportSection} aria-label="추천">
          <h4 className={styles.reportSectionTitle}>추천</h4>
          <dl className={styles.reportGrid}>
            {recommendations.map((item) => (
              <div key={item.label} className={styles.reportGridRow}>
                <dt className={styles.reportGridLabel}>{item.label}</dt>
                <dd className={styles.reportGridValue}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  )
}

const BLOCKER_TEXT: Record<ReportPublishBlocker["kind"], { title: string; body: string }> = {
  parent_not_linked: {
    title: "학부모 계정이 연결되어 있지 않습니다.",
    body: "학부모 연결 후 리포트를 발행할 수 있어요."
  },
  legacy_observations: {
    title: "기존 기준으로 작성된 관찰 기록입니다.",
    body: "현재 기준의 관찰 항목을 다시 확인한 뒤 리포트를 발행해 주세요."
  },
  experience_date_missing: {
    title: "체험 날짜를 확인할 수 없어 리포트를 발행할 수 없습니다.",
    body: "확정 일정 또는 체험 완료 처리를 먼저 확인해 주세요."
  },
  no_assessment: {
    title: "체험 결과가 아직 기록되지 않았습니다.",
    body: "체험 결과를 먼저 기록하면 부모님께 보일 내용을 확인할 수 있어요."
  }
}

export const ApplicationReportPublishing = ({
  applicationId,
  preview,
  publishedSnapshot,
  publishedVersion,
  publishedAt,
  publishedReportLoadError,
  assessmentUpdatedAt,
  assessmentChangedSincePublish,
  blockers,
  canWrite
}: ApplicationReportPublishingProps) => {
  const router = useRouter()
  const publishAction = publishExperienceReportAction.bind(null, applicationId)
  const [publishState, submitPublish, isPublishing] = useActionState(
    publishAction,
    initialPublishState
  )
  const withdrawAction = withdrawExperienceReportAction.bind(null, applicationId)
  const [withdrawState, submitWithdraw, isWithdrawing] = useActionState(
    withdrawAction,
    initialWithdrawState
  )
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false)
  const withdrawButtonRef = useRef<HTMLButtonElement | null>(null)
  const handledPublishTokenRef = useRef<string | null>(null)
  const handledWithdrawTokenRef = useRef<string | null>(null)

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

  useEffect(() => {
    if (withdrawState.status !== "success" || !withdrawState.successToken) {
      return
    }
    if (handledWithdrawTokenRef.current === withdrawState.successToken) {
      return
    }
    handledWithdrawTokenRef.current = withdrawState.successToken
    setIsWithdrawOpen(false)
    router.refresh()
  }, [withdrawState.status, withdrawState.successToken, router])

  // 평가가 바뀐 뒤의 발행 실패는 사용자가 고칠 수 있는 상황이다.
  // 최신 내용을 다시 확인하도록 화면을 새로 읽는다 — 자동으로 다시 발행하지 않는다.
  const isStaleFailure =
    publishState.status === "error" && publishState.message.includes("체험평가 내용이 변경")

  useEffect(() => {
    if (!isStaleFailure) {
      return
    }
    router.refresh()
  }, [isStaleFailure, router])

  const activeBlocker = blockers[0] ?? null
  // 현재 발행 상태를 모르면 어떤 발행 동작도 하지 않는다.
  // 미리보기는 그대로 보여 준다 — 그건 평가에서 만든 것이라 발행본과 무관하다.
  const canPublish =
    canWrite &&
    !publishedReportLoadError &&
    !activeBlocker &&
    Boolean(preview) &&
    Boolean(assessmentUpdatedAt)
  const canWithdraw = canWrite && !publishedReportLoadError && Boolean(publishedVersion)
  const publishedDateText = publishedAt ? formatSeoulDateTime(publishedAt) : null

  return (
    <section className={`${styles.card} ${styles.sectionCard}`} aria-labelledby="report-publishing-title">
      <div className={styles.sectionHead}>
        <h2 id="report-publishing-title" className={styles.sectionTitle}>
          부모 리포트
        </h2>
        {publishedReportLoadError ? (
          // 모르는 상태다. "없음" 이라고 말하지 않는다.
          <p className={styles.statusLine}>
            <span className={styles.statusMuted}>발행 상태를 확인하지 못했습니다.</span>
          </p>
        ) : publishedVersion ? (
          <p className={styles.statusLine}>
            <span className={styles.statusBadge}>리포트 발행 완료</span>
            <span className={styles.statusMeta}>
              v{publishedVersion}
              {publishedDateText ? ` · ${publishedDateText}` : ""}
            </span>
          </p>
        ) : (
          <p className={styles.statusLine}>
            <span className={styles.statusMuted}>현재 공개 중인 리포트가 없습니다.</span>
          </p>
        )}
      </div>

      <p className={styles.sectionDescription}>
        체험 결과를 부모님께 전달하기 전에 실제로 보여질 내용을 확인해 주세요.
      </p>

      {/*
        지금 공개돼 있는 것은 발행 시점에 얼어붙은 snapshot 이다.
        평가를 다시 조립해서 "현재 발행본" 이라고 보여 주지 않는다.
      */}
      {publishedSnapshot ? (
        <div className={styles.block}>
          <p className={styles.blockLabel}>현재 부모님께 공개된 내용</p>
          <ReportBody snapshot={publishedSnapshot} />
        </div>
      ) : null}

      {publishedReportLoadError ? (
        <div className={styles.notice} role="alert">
          <p className={styles.noticeTitle}>현재 발행된 리포트 정보를 불러오지 못했습니다.</p>
          <p className={styles.noticeBody}>
            화면을 새로고침한 뒤 다시 확인해 주세요. 발행 상태를 확인하기 전까지는 발행과 철회를 할
            수 없습니다.
          </p>
        </div>
      ) : null}

      {assessmentChangedSincePublish ? (
        <div className={styles.notice} role="status">
          <p className={styles.noticeTitle}>체험평가가 마지막 리포트 발행 이후 수정되었습니다.</p>
          <p className={styles.noticeBody}>
            변경 내용을 부모님께 전달하려면 새 버전으로 다시 발행해 주세요.
          </p>
        </div>
      ) : null}

      {preview ? (
        <div className={styles.block}>
          <p className={styles.blockLabel}>
            {publishedSnapshot ? "현재 평가 기준 미리보기" : "부모님께 보일 내용"}
          </p>
          <ReportBody snapshot={preview} />
        </div>
      ) : null}

      {activeBlocker ? (
        <div className={styles.notice} role="status">
          <p className={styles.noticeTitle}>{BLOCKER_TEXT[activeBlocker.kind].title}</p>
          <p className={styles.noticeBody}>{BLOCKER_TEXT[activeBlocker.kind].body}</p>
          {activeBlocker.kind === "legacy_observations" ? (
            <ul className={styles.noticeList}>
              {activeBlocker.values.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {publishState.status === "error" && publishState.message ? (
        <div className={`${styles.message} ${styles.messageError}`} role="alert">
          {publishState.message}
        </div>
      ) : null}
      {publishState.status === "success" && publishState.message ? (
        <div className={`${styles.message} ${styles.messageSuccess}`} role="status">
          {publishState.message}
        </div>
      ) : null}
      {withdrawState.status === "error" && withdrawState.message ? (
        <div className={`${styles.message} ${styles.messageError}`} role="alert">
          {withdrawState.message}
        </div>
      ) : null}

      {canWrite ? (
        <div className={styles.actions}>
          <form action={submitPublish} className={styles.publishForm}>
            {/* 원장이 확인한 revision. 그 사이 평가가 바뀌었으면 서버가 거절한다. */}
            <input
              type="hidden"
              name="expectedAssessmentUpdatedAt"
              value={assessmentUpdatedAt ?? ""}
            />
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={!canPublish || isPublishing || isWithdrawing}
            >
              {isPublishing
                ? "발행 중..."
                : publishedVersion
                  ? "새 버전으로 발행"
                  : "부모에게 리포트 발행"}
            </button>
          </form>

          {publishedVersion ? (
            <button
              ref={withdrawButtonRef}
              type="button"
              className={styles.textButton}
              onClick={() => setIsWithdrawOpen(true)}
              disabled={!canWithdraw || isPublishing || isWithdrawing}
            >
              리포트 발행 철회
            </button>
          ) : null}
        </div>
      ) : null}

      {canWrite && !publishedReportLoadError ? (
        <p className={styles.footnote}>
          {publishedVersion
            ? "기존 리포트는 과거 발행 기록으로 보존됩니다."
            : "발행된 리포트는 부모 공개 데이터로 저장됩니다."}
        </p>
      ) : null}

      {isWithdrawOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div
            className={styles.dialogCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-report-title"
          >
            <div className={styles.dialogBody}>
              <h3 id="withdraw-report-title" className={styles.dialogTitle}>
                리포트 발행을 철회할까요?
              </h3>
              <p className={styles.dialogDescription}>
                철회하면 부모님이 현재 리포트를 볼 수 없게 됩니다. 발행 기록은 삭제되지 않고
                보관됩니다.
              </p>
              {withdrawState.status === "error" && withdrawState.message ? (
                <div className={`${styles.message} ${styles.messageError}`}>
                  {withdrawState.message}
                </div>
              ) : null}
            </div>
            <form action={submitWithdraw} className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setIsWithdrawOpen(false)
                  withdrawButtonRef.current?.focus()
                }}
                disabled={isWithdrawing}
              >
                취소
              </button>
              <button type="submit" className={styles.dangerButton} disabled={isWithdrawing}>
                {isWithdrawing ? "철회 중..." : "발행 철회"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
