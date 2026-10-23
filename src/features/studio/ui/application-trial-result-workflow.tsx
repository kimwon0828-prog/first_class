"use client"
import { ReportPhotoEditor } from "@/features/reports/ui/report-photo-editor"
import { ReportPhotos } from "@/features/reports/ui/report-photos"
import { ReportObservations } from "@/features/reports/ui/report-observations"
import type { ReportAttachment } from "@/features/reports/lib/report-attachments"

import { deriveApplicationDetailWorkflow, hasTrialRecordContent, type ApplicationWorkflowEvidence } from "@/features/studio/lib/application-detail-workflow-state"
import { RegistrationResultEditor } from "./registration-result-editor"
import { StudioQueryRetry } from "./studio-query-retry"

import type { ReactNode } from "react"
import { startTransition, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { AcademyMemoEditor, type AcademyMemoData } from "./academy-memo-editor"
import { ApplicationReportPublishing, type ApplicationReportPublishingProps } from "./application-report-publishing"
import { buildCaseActivityEvents } from "@/features/studio/lib/case-activity"
import { formatSeoulDateTime } from "@/features/studio/lib/seoul-datetime"
import {
  upsertTrialResultAction,
  type UpsertTrialResultActionState
} from "@/features/studio/actions/upsert-trial-result"
import {
  TRIAL_RESULT_OBSERVATION_MAX,
  describeTrialResultObservation,
  getObservationGroupSnapshot,
  getObservationGroups,
  getTrialResultObservationLabel,
  normalizeTrialResultObservation
} from "@/features/studio/lib/trial-result-options"
import { ApplicationStatusActionForm } from "@/features/studio/ui/application-status-action-form"
import { PreviousConsultationRecords } from "@/features/studio/ui/consultation-history-modal"
import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"

import { V2Button } from "./v2/v2-button"
import { V2Chip } from "./v2/v2-chip"
import { V2Dialog } from "./v2/v2-dialog"
import { V2PencilIcon } from "./v2/v2-icons"
import styles from "./application-detail-workspace.module.css"
import { TRIAL_RECOMMENDED_DAYS, TRIAL_RECOMMENDED_PERIODS, formatTrialRecommendedSchedule, parseTrialRecommendedSchedule, type TrialRecommendedPeriod } from "@/features/studio/lib/trial-recommended-schedule"

/**
 * 저장된 관찰 값을 "현재 기준 code" 와 "문구를 저장하던 시절의 원문" 으로 가른다.
 *
 * legacy 문구를 canonical 토글에 체크해 두지 않는다. 체크해 버리면 화면이
 * "옛 기록과 새 항목이 같은 관찰" 이라고 주장하는 셈인데, 둘은 같은 사실이 아니다.
 * legacy 는 원문 그대로 따로 보여 주고, 토글은 현재 기준으로만 쓴다.
 *
 * 알 수 없는 값은 버린다 — 어느 쪽으로도 읽을 수 없어 화면에 흘리지 않는다.
 */
const splitStoredObservations = (values: string[] | undefined) => {
  const canonical: string[] = []
  const legacy: string[] = []

  for (const value of values ?? []) {
    const described = describeTrialResultObservation(value)
    if (!described) {
      continue
    }

    const bucket = described.kind === "canonical" ? canonical : legacy
    if (!bucket.includes(described.value)) {
      bucket.push(described.value)
    }
  }

  return { canonical, legacy }
}

const normalizeStoredObservations = (values: string[] | undefined): string[] =>
  splitStoredObservations(values).canonical

const toObservationItems = (codes: string[]) =>
  codes.flatMap((value) => {
    const code = normalizeTrialResultObservation(value)
    return code ? [{ code, label: getTrialResultObservationLabel(code)!, group: getObservationGroupSnapshot(code) }] : []
  })

const initialTrialResultState: UpsertTrialResultActionState = {
  status: "idle",
  message: "",
  successToken: null
}

const PUBLIC_SUMMARY_MAX = 1000

type ApplicationTrialResultWorkflowProps = {
  application: StudioApplicationDetail
  /** 신규 신청의 일정 확정 폼(서버가 만든 ApplicationStatusActionForm). */
  confirmationSection?: ReactNode
  /** 오른쪽 "신청 정보" 상자. */
  infoSection?: ReactNode
  /** 담당 선생님 바꾸기(확정 이후). */
  assigneeSection?: ReactNode
  /** 리포트 보내기 · 보낸 리포트에 쓰는 값. 체험을 마친 신청에서만 있다. */
  report: ApplicationReportPublishingProps | null
  feedbackSection?: ReactNode
  parentDecisionSection?: ReactNode
  evidence: ApplicationWorkflowEvidence
  /** 서버가 정한 기준 시각. 체험 종료 판정이 hydration 전후로 갈리지 않게 한다. */
  nowIso: string
  /**
   * 쓰기 권한. 서버에서 해석해 넘긴다.
   *
   * ⚠️ 기능별로 따로 받는다. 하나의 boolean 으로 묶지 않는다 — 한 번 묶으면
   *    권한 경계가 바뀔 때 어느 기능이 왜 잠겼는지 알 수 없게 된다.
   *
   * 화면에서 요금제 이름을 비교하지 않는다. 실제 차단은 server action 이 하고,
   * 여기서는 할 수 없는 버튼을 숨긴다.
   */
  canWriteTrialResults: boolean
  academyMemo: AcademyMemoData
}

/**
 * 신청 상세 본문 (Figma 2148:5195 · 5324 · 5465 · 5579).
 *
 * "지금 할 일" 카드 하나 + 아래 [진행 기록 · 메모 | 신청 정보 · 학부모 의견 · 리포트 · 기록].
 * 무엇이 지금 할 일인지는 deriveApplicationDetailWorkflow 가 정한다 — 화면이 다시 판정하지 않는다.
 */
export const ApplicationTrialResultWorkflow = ({
  application,
  evidence,
  confirmationSection,
  infoSection = null,
  assigneeSection = null,
  report,
  feedbackSection = null,
  parentDecisionSection = null,
  nowIso,
  canWriteTrialResults,
  academyMemo
}: ApplicationTrialResultWorkflowProps) => {
  const router = useRouter()
  const [photos, setPhotos] = useState<ReportAttachment[]>([])
  const [photosBlocked, setPhotosBlocked] = useState(false)
  const observationGroups = getObservationGroups(application.reportSubjectCategory)
  const offeredCodes = new Set<string>(observationGroups.flatMap((group) => group.options.map((option) => option.value)))
  const reportLocked = Boolean(evidence.report.everSent || evidence.report.version)
  const [scheduleTouched, setScheduleTouched] = useState(false)
  const [editorSource, setEditorSource] = useState<StudioApplicationDetail["trialResult"]>(null)
  const [recordDraft, setRecordDraft] = useState({ recommendedCourse: "", recommendedLevel: "", publicSummary: "" })
  const [recommendedDays, setRecommendedDays] = useState<number[]>([])
  const [recommendedPeriod, setRecommendedPeriod] = useState<TrialRecommendedPeriod | "">("")
  const trialSubmitInFlight = useRef(false)
  const [isPromptOpen, setIsPromptOpen] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isSuccessOpen, setIsSuccessOpen] = useState(false)
  const [refreshOnEditorClose, setRefreshOnEditorClose] = useState(false)
  const [selectedObservations, setSelectedObservations] = useState<string[]>(
    normalizeStoredObservations(application.trialResult?.observations)
  )
  // 원장이 관찰 항목을 실제로 건드렸는지. 건드리지 않은 저장은 server 가 기존 값을
  // 그대로 다시 쓴다 — 폼으로 표현할 수 없는 과거 기록이 조용히 지워지지 않게.
  const [observationsTouched, setObservationsTouched] = useState(false)
  const trialResultAction = upsertTrialResultAction.bind(null, application.id)
  const [trialResultState, trialResultFormAction, isSavingTrialResult] = useActionState(trialResultAction, initialTrialResultState)
  const [trialResultErrorMessage, setTrialResultErrorMessage] = useState<string | null>(null)
  const handledTrialResultSuccessTokenRef = useRef<string | null>(null)

  // 저장된 관찰 값을 현재 기준 code 와 과거 원문으로 갈라 둔다. 요약 · 편집 폼이 같은 기준을 쓴다.
  const storedObservations = useMemo(
    () => splitStoredObservations(application.trialResult?.observations),
    [application.trialResult?.observations]
  )

  const resetTrialResultSelections = () => {
    setSelectedObservations(normalizeStoredObservations(application.trialResult?.observations))
    setObservationsTouched(false)
  }

  const hasTrialResult = Boolean(application.trialResult)
  const isCompletedView = application.status === "completed"
  const workflow = deriveApplicationDetailWorkflow({ application, evidence, nowIso, canWriteTrialResults, canWriteConsultations: false })
  const canWriteTrialResult = canWriteTrialResults && isCompletedView && !application.noShowAt && !application.canceledAt && !evidence.trialResultError && !evidence.report.error && !reportLocked
  const isTerminal = application.status === "canceled" || Boolean(application.noShowAt)
  const recordBlockReason = evidence.trialResultError || evidence.report.error
    ? "기록 또는 리포트 이력을 확인하지 못했어요. 새로고침 후 다시 확인해 주세요."
    : reportLocked ? "보낸 리포트는 수정할 수 없어요. 기록은 읽기 전용으로 보관돼요."
    : !isCompletedView || isTerminal ? "체험 완료 처리 후 기록을 작성할 수 있어요."
    : !canWriteTrialResults ? "기록 작성 권한이 없어요. 학원 관리자에게 권한을 확인해 주세요." : null

  const openEditor = (options?: { refreshAfterClose?: boolean }) => {
    if (!canWriteTrialResult) return
    const record = application.trialResult
    setEditorSource(record ? structuredClone(record) : null)
    setPhotos(structuredClone(record?.attachments ?? [])); setPhotosBlocked(false)
    setRecordDraft({ recommendedCourse: record?.recommendedCourse ?? "", recommendedLevel: record?.recommendedLevel ?? "", publicSummary: record?.publicSummary ?? "" })
    const schedule = parseTrialRecommendedSchedule(record?.recommendedSchedule)
    setRecommendedDays(schedule?.days ?? []); setRecommendedPeriod(schedule?.period ?? ""); setScheduleTouched(false)
    resetTrialResultSelections()
    setTrialResultErrorMessage(null)
    setIsPromptOpen(false)
    setIsSuccessOpen(false)
    setRefreshOnEditorClose(Boolean(options?.refreshAfterClose))
    setIsEditorOpen(true)
  }

  const draftSchedule = scheduleTouched ? formatTrialRecommendedSchedule(recommendedDays, recommendedPeriod) : editorSource?.recommendedSchedule ?? ""
  const draftObservations = observationsTouched ? selectedObservations : editorSource?.observations ?? selectedObservations
  const editorDirty = photosBlocked || JSON.stringify(photos) !== JSON.stringify(editorSource?.attachments ?? []) ||
    Object.entries(recordDraft).some(([field, value]) => value !== (editorSource?.[field as keyof typeof recordDraft] ?? ""))
    || draftSchedule !== (editorSource?.recommendedSchedule ?? "")
    || JSON.stringify([...draftObservations].sort()) !== JSON.stringify([...(editorSource?.observations ?? [])].sort())

  const closePromptLater = () => {
    setIsPromptOpen(false)
    router.refresh()
  }

  const closeEditor = () => {
    if (isSavingTrialResult || trialSubmitInFlight.current) return
    if (editorDirty && !window.confirm("저장하지 않은 변경이 있습니다. 변경을 버리고 닫을까요?")) return
    setIsEditorOpen(false)

    if (refreshOnEditorClose) {
      setRefreshOnEditorClose(false)
      router.refresh()
    }
  }

  const closeSuccessModal = () => {
    setIsSuccessOpen(false)
    if (refreshOnEditorClose) {
      setRefreshOnEditorClose(false)
    }
    router.refresh()
  }

  const atObservationLimit = selectedObservations.length >= TRIAL_RESULT_OBSERVATION_MAX
  const toggleObservation = (value: string) => {
    // 8번째는 고를 수 없다(저장 RPC 가 7개를 넘으면 거절). 고른 항목을 빼는 것은 언제나 된다.
    if (!selectedObservations.includes(value) && atObservationLimit) return
    setObservationsTouched(true)
    setSelectedObservations((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    )
  }

  useEffect(() => {
    if (trialResultState.status !== "success" || !trialResultState.successToken) {
      return
    }
    if (handledTrialResultSuccessTokenRef.current === trialResultState.successToken) {
      return
    }
    handledTrialResultSuccessTokenRef.current = trialResultState.successToken
    setIsEditorOpen(false)
    setIsPromptOpen(false)
    setIsSuccessOpen(true)
    router.refresh()
  }, [trialResultState.status, trialResultState.successToken, router])

  // Keep drafts intact and show server errors beside the save action.
  useEffect(() => {
    trialSubmitInFlight.current = false
    if (trialResultState.status === "error") {
      setTrialResultErrorMessage(trialResultState.message)
      if (trialResultState.message.includes("발행된 리포트")) router.refresh()
      return
    }
    if (trialResultState.status === "success") {
      setTrialResultErrorMessage(null)
    }
  }, [trialResultState, router])

  useEffect(() => {
    if (!isEditorOpen || !editorDirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    const href = window.location.href, state = window.history.state
    const back = (event: PopStateEvent) => { if (!window.confirm("저장하지 않은 변경이 있습니다. 변경을 버리고 이동할까요?")) { event.stopImmediatePropagation(); window.history.pushState(state, "", href) } }
    window.addEventListener("beforeunload", unload); window.addEventListener("popstate", back, true)
    return () => { window.removeEventListener("beforeunload", unload); window.removeEventListener("popstate", back, true) }
  }, [isEditorOpen, editorDirty])

  const handleCompletedSaved = useCallback(() => { setIsPromptOpen(true) }, [])
  const activityEvents = useMemo(() => buildCaseActivityEvents(application), [application])

  // Existing list links may target content placed in a disclosure.
  useEffect(() => {
    const revealAnchor = () => {
      let id: string
      try { id = decodeURIComponent(window.location.hash.slice(1)) } catch { return }
      const target = id ? document.getElementById(id) : null
      if (!target) return
      for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true
      }
      target.scrollIntoView({ block: "start" })
    }
    revealAnchor()
    window.addEventListener("hashchange", revealAnchor)
    return () => window.removeEventListener("hashchange", revealAnchor)
  }, [application.id])

  const recommendations = [
    ["추천 반", application.trialResult?.recommendedCourse],
    ["추천 레벨", application.trialResult?.recommendedLevel],
    ["추천 일정", application.trialResult?.recommendedSchedule]
  ].filter((item): item is [string, string] => Boolean(item[1]?.trim()))

  /* ── 지금 할 일 ─────────────────────────────────────────────── */
  const primary = workflow.primary
  const nowCard = (body: ReactNode, options?: { id?: string; label?: string; title?: string; description?: string; neutral?: boolean }) => (
    <section id={options?.id} className={options?.neutral ? `${styles.nowCard} ${styles.nowCardNeutral}` : styles.nowCard} aria-labelledby="now-title">
      <p className={styles.nowLabel}>{options?.label ?? "지금 할 일"}</p>
      <h2 id="now-title" className={styles.nowTitle}>{options?.title ?? workflow.title}</h2>
      {options?.description ?? workflow.description ? <p className={styles.nowDescription}>{options?.description ?? workflow.description}</p> : null}
      {body}
    </section>
  )

  let nowArea: ReactNode
  // 등록 결과 편집기가 "지금 할 일" 카드 안에 있는가. 아니면 오른쪽에 둔다(체험 완료 뒤에는 언제든 기록할 수 있다).
  let registrationInNow = false
  if (isTerminal) {
    nowArea = nowCard(
      <p className={styles.terminalNote}>{application.logs.find((log) => log.toStatus === "canceled" && log.note?.trim())?.note || "별도로 기록된 사유가 없어요."}</p>,
      { label: application.noShowAt ? "불참 처리 내역" : "취소 처리 내역", neutral: true, description: "확정된 체험 기록과 리포트는 보관돼요." }
    )
  } else if (application.status === "new" || application.status === "reviewing") {
    nowArea = nowCard(confirmationSection, {
      id: "confirm-schedule",
      title: "체험 일정을 확정해 주세요",
      description: "학부모가 고른 시간으로 확정해요. 확정하면 학부모에게 알림이 가요."
    })
  } else if (application.status === "confirmed") {
    nowArea = nowCard(
      primary?.action === "status" ? (
        <ApplicationStatusActionForm applicationId={application.id} currentStatus={application.status} variant="case-detail" onCompletedSaved={handleCompletedSaved} />
      ) : null,
      { neutral: primary?.action !== "status" }
    )
  } else if (evidence.trialResultError || evidence.registration.error) {
    nowArea = nowCard(<StudioQueryRetry />, { neutral: true })
  } else if (primary?.action === "record" || (!hasTrialResult && !workflow.closed)) {
    nowArea = nowCard(
      <div className={styles.nowButtons}>
        <V2Button size="lg" onClick={() => openEditor()} disabled={!canWriteTrialResult} aria-describedby={recordBlockReason ? "record-help" : undefined}>기록 작성</V2Button>
        {recordBlockReason ? <p id="record-help" className={styles.hint}>{recordBlockReason}</p> : null}
      </div>,
      { title: "체험 기록을 작성해 주세요", neutral: !canWriteTrialResult }
    )
  } else if (primary?.action === "report" && report) {
    nowArea = <ApplicationReportPublishing {...report} variant="send" onEditRecord={() => openEditor()} canEditRecord={canWriteTrialResult} />
  } else if (primary?.action === "registration") {
    registrationInNow = true
    nowArea = nowCard(<RegistrationResultEditor key={application.id} application={application} startEditing />, { title: "등록 결과를 알려 주세요" })
  } else {
    registrationInNow = true
    nowArea = nowCard(<RegistrationResultEditor key={application.id} application={application} />, { neutral: true })
  }

  const reportInNow = primary?.action === "report" && Boolean(report)

  /* ── 오른쪽: 체험 기록 요약 ─────────────────────────────────── */
  const recordCard = isCompletedView || hasTrialRecordContent(application.trialResult) ? (
    <section id="trial-record" className={styles.sideCard} aria-labelledby="record-card-title">
      <div className={styles.sideHead}>
        <h3 id="record-card-title">체험 기록</h3>
        {hasTrialResult && !reportLocked ? (
          <V2Button variant="outline" size="sm" icon={<V2PencilIcon size={16} />} onClick={() => openEditor()} disabled={!canWriteTrialResult}>기록 수정</V2Button>
        ) : null}
      </div>
      {evidence.trialResultError ? <div role="alert"><p className={styles.hint}>체험 기록 정보를 불러오지 못했어요.</p><StudioQueryRetry /></div> : hasTrialResult ? <>
        <p className={styles.hint}>{formatSeoulDateTime(application.trialResult?.updatedAt)} 저장 · {reportLocked ? "보낸 뒤 읽기 전용" : "보내기 전 수정 가능"}</p>
        {storedObservations.canonical.length ? <div className={styles.savedChips}>{storedObservations.canonical.map((code) => <span key={code}>{getTrialResultObservationLabel(code)}</span>)}</div> : null}
        {storedObservations.legacy.length ? <div className={styles.legacyBlock}><p>기존 관찰 기록</p><div className={styles.savedChips}>{storedObservations.legacy.map((text) => <span key={text}>{text}</span>)}</div></div> : null}
        {application.trialResult?.publicSummary?.trim() ? <p className={styles.savedText}>{application.trialResult.publicSummary}</p> : null}
        {recommendations.length ? <dl className={styles.savedList}>{recommendations.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
      </> : <p className={styles.hint}>{isCompletedView ? "아직 작성한 기록이 없어요." : "체험을 완료한 뒤 기록할 수 있어요."}</p>}
      {recordBlockReason && hasTrialResult && !reportLocked ? <p className={styles.hint}>{recordBlockReason}</p> : null}
    </section>
  ) : null

  /* ── 기록 작성 팝업: 왼쪽 입력 · 오른쪽 학부모 화면(저장 전 내용) ─────────── */
  const previewObservations = toObservationItems(observationsTouched ? selectedObservations : normalizeStoredObservations(editorSource?.observations))
  const previewRecommend = [recordDraft.recommendedCourse.trim(), recordDraft.recommendedLevel.trim(), draftSchedule.trim()].filter(Boolean)

  return (
    <>
      <div className={styles.workspace} data-phase={isTerminal ? "closed" : !isCompletedView ? "before" : reportLocked ? "sent" : "record"}>
        {nowArea}

        <div className={styles.bottom}>
          <div className={styles.main}>
            <section className={styles.history} aria-labelledby="history-title">
              <h2 id="history-title" className={styles.blockTitle}>진행 기록</h2>
              {activityEvents.length ? (
                <ol className={styles.timeline}>
                  {activityEvents.map((event, index) => (
                    <li key={event.id} className={index === 0 ? styles.timelineLatest : undefined}>
                      <span className={styles.timelineDot} aria-hidden="true" />
                      <div>
                        <p className={styles.timelineTitle}>{event.title}{event.meta ? ` · ${event.meta}` : ""}</p>
                        <time className={styles.timelineTime} dateTime={event.at}>{formatSeoulDateTime(event.at)}</time>
                        {event.note ? <p className={styles.timelineNote}>{event.note}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className={styles.hint}>아직 진행 기록이 없어요.</p>}
            </section>
            {isCompletedView || academyMemo.data?.note || application.trialResult?.note ? (
              <div id="consultation-records">
                <AcademyMemoEditor key={application.id} applicationId={application.id} initial={academyMemo}
                  legacyNote={application.trialResult?.note ?? null}
                  canWrite={canWriteTrialResults && isCompletedView && !application.noShowAt && !application.canceledAt}
                  blockReason={!isCompletedView || application.noShowAt || application.canceledAt ? "체험 완료 처리 후 메모를 저장할 수 있어요." : !canWriteTrialResults ? "메모 작성 권한이 없어요. 학원 관리자에게 권한을 확인해 주세요." : null} />
              </div>
            ) : null}
            <PreviousConsultationRecords logs={application.consultationLogs} />
          </div>

          <aside className={styles.side} aria-label="신청 정보와 기록">
            {infoSection}
            {assigneeSection}
            {isCompletedView ? parentDecisionSection : null}
            {isCompletedView ? feedbackSection : null}
            {!application.parentId && isCompletedView ? <p className={styles.hint}>학부모 계정이 연결되어 있지 않아요. 학원 등록 결과는 계속 기록할 수 있어요.</p> : null}
            {report && !reportInNow ? <ApplicationReportPublishing {...report} variant="summary" /> : null}
            {recordCard}
            {isCompletedView && !isTerminal && !registrationInNow ? (
              evidence.registration.error
                ? <div role="alert" className={styles.sideCard}><p className={styles.hint}>등록 결과 정보를 불러오지 못했어요.</p><StudioQueryRetry /></div>
                : <div className={styles.sideCard}><RegistrationResultEditor key={application.id} application={application} /></div>
            ) : null}
          </aside>
        </div>
      </div>

      {isPromptOpen ? (
        <V2Dialog title="체험 기록을 작성할까요?" description="수업 직후 간단히 남겨두면 이후 상담에 바로 활용할 수 있어요." width={480}
          onClose={closePromptLater}
          footerActions={<V2Button onClick={() => openEditor({ refreshAfterClose: true })}>지금 기록하기</V2Button>}>
          <p className={styles.hint}>닫으면 나중에 이 화면에서 기록을 작성할 수 있어요.</p>
        </V2Dialog>
      ) : null}

      {isEditorOpen ? (
        <V2Dialog title={hasTrialResult ? "체험 기록 수정" : "체험 기록 쓰기"} width={1104} busy={isSavingTrialResult}
          description={`${application.childName} · ${application.classTitle} · ${formatSeoulDateTime(application.confirmedBlockStartAt ?? application.confirmedSlotAt ?? application.completedAt)} — 고르고 짧게 쓰면 오른쪽 리포트가 바로 채워져요. 저장 전에는 학부모에게 보이지 않아요.`}
          onClose={closeEditor}
          footerNote={isSavingTrialResult ? "기록을 저장하고 있어요." : photosBlocked ? "사진 업로드를 완료하거나 실패한 사진을 제외해 주세요." : recordBlockReason ?? (hasTrialResult && !editorDirty ? "저장된 내용과 같아요. 내용을 수정하면 저장할 수 있어요." : "저장만으로 학부모에게 보내지지 않아요.")}
          footerActions={<V2Button type="submit" form="trial-record-form" disabled={isSavingTrialResult || photosBlocked || !canWriteTrialResult || (hasTrialResult && !editorDirty)}>{isSavingTrialResult ? "저장 중..." : "기록 저장"}</V2Button>}>
          <div className={styles.editor}>
            <form id="trial-record-form" className={styles.editorForm} onSubmit={(event) => {
              event.preventDefault()
              if (isSavingTrialResult || trialSubmitInFlight.current || photosBlocked || !canWriteTrialResult) return
              const data = new FormData(event.currentTarget)
              trialSubmitInFlight.current = true
              setTrialResultErrorMessage(null)
              // Call the same action without native form-action reset on a failed response.
              startTransition(() => trialResultFormAction(data))
            }}>
              <input type="hidden" name="attachments" value={JSON.stringify(photos)} />
              <input type="hidden" name="expectedAssessmentUpdatedAt" value={editorSource?.updatedAt ?? ""} />
              {trialResultErrorMessage ? <p className={styles.messageError} role="alert">{trialResultErrorMessage}</p> : null}

              <fieldset className={styles.fieldset} disabled={isSavingTrialResult || !canWriteTrialResult}>
                <legend className={styles.srOnly}>관찰한 모습</legend>
                <div className={styles.observationHead}>
                  <span className={styles.fieldLabel}>관찰한 모습</span>
                  <span className={atObservationLimit ? styles.counterFull : styles.counter} aria-live="polite">{selectedObservations.length} / {TRIAL_RESULT_OBSERVATION_MAX}개</span>
                </div>
                {splitStoredObservations(editorSource?.observations).legacy.length > 0 ? (
                  <div className={styles.legacyBlock}>
                    <p>기존 기준으로 작성된 관찰 기록이에요. 리포트를 보내려면 아래 현재 관찰 항목을 직접 골라 주세요. 기존 문구는 자동 선택하지 않아요.</p>
                    <div className={styles.savedChips}>{splitStoredObservations(editorSource?.observations).legacy.map((text) => <span key={text}>{text}</span>)}</div>
                  </div>
                ) : null}
                {observationGroups.map((group) => (
                  <div key={group.code} className={styles.observationGroup} role={group.code === "general" ? undefined : "group"} aria-label={group.code === "general" ? undefined : group.label}>
                    {group.code !== "general" ? <h4>{group.label}</h4> : null}
                    <div className={styles.chips}>
                      {group.options.map((option) => {
                        const selected = selectedObservations.includes(option.value)
                        return <V2Chip key={option.value} label={option.label} selected={selected} disabled={!selected && atObservationLimit} onClick={() => toggleObservation(option.value)} />
                      })}
                    </div>
                  </div>
                ))}
                {normalizeStoredObservations(editorSource?.observations).some((code) => !offeredCodes.has(code)) ? (
                  <details className={styles.previousObservations} open>
                    <summary>이전에 선택한 관찰 항목</summary>
                    <p className={styles.hint}>기존 선택은 유지돼요. 바꿀 항목만 직접 해제해 주세요.</p>
                    <div className={styles.chips}>
                      {normalizeStoredObservations(editorSource?.observations).filter((code) => !offeredCodes.has(code)).map((code) => {
                        const selected = selectedObservations.includes(code)
                        return <V2Chip key={code} label={getTrialResultObservationLabel(code)} selected={selected} disabled={!selected && atObservationLimit} onClick={() => toggleObservation(code)} />
                      })}
                    </div>
                  </details>
                ) : null}
                <p className={styles.hint}>{atObservationLimit ? `최대 ${TRIAL_RESULT_OBSERVATION_MAX}개까지 고를 수 있어요. 다른 항목을 고르려면 하나를 해제해 주세요.` : "오늘 확인한 항목만 골라 주세요. 모든 영역을 고르지 않아도 돼요."}</p>
                {selectedObservations.map((item) => <input key={item} type="hidden" name="observations" value={item} />)}
                <input type="hidden" name="observationsTouched" value={observationsTouched ? "true" : "false"} />
              </fieldset>

              <label className={styles.field} htmlFor="trial-public-summary">
                <span className={styles.fieldHead}><span className={styles.fieldLabel}>선생님 이야기</span><span className={styles.counter}>{recordDraft.publicSummary.length} / {PUBLIC_SUMMARY_MAX}자</span></span>
                <textarea id="trial-public-summary" name="publicSummary" className={styles.textarea} aria-describedby="trial-public-summary-hint" value={recordDraft.publicSummary}
                  onChange={(event) => setRecordDraft((draft) => ({ ...draft, publicSummary: event.target.value }))} rows={4}
                  placeholder={"어떤 장면을 관찰했고, 다음 수업에서 어떻게 지도하면 좋을지\n짧게 적어 주세요."} maxLength={PUBLIC_SUMMARY_MAX} disabled={isSavingTrialResult || !canWriteTrialResult} />
                <span id="trial-public-summary-hint" className={styles.hint}>학부모가 리포트에서 읽어요.</span>
              </label>

              <div className={styles.photoField}>
                <ReportPhotoEditor applicationId={application.id} value={photos} onChange={setPhotos} disabled={isSavingTrialResult || !canWriteTrialResult} onBlockedChange={setPhotosBlocked} />
              </div>

              <div className={styles.columns}>
                <label className={styles.field} htmlFor="trial-recommended-course">
                  <span className={styles.fieldLabel}>추천 반</span>
                  <input id="trial-recommended-course" className={styles.input} name="recommendedCourse" value={recordDraft.recommendedCourse}
                    onChange={(event) => setRecordDraft((draft) => ({ ...draft, recommendedCourse: event.target.value }))} disabled={isSavingTrialResult || !canWriteTrialResult} />
                </label>
                <label className={styles.field} htmlFor="trial-recommended-level">
                  <span className={styles.fieldLabel}>추천 레벨</span>
                  <input id="trial-recommended-level" className={styles.input} name="recommendedLevel" value={recordDraft.recommendedLevel}
                    onChange={(event) => setRecordDraft((draft) => ({ ...draft, recommendedLevel: event.target.value }))} disabled={isSavingTrialResult || !canWriteTrialResult} />
                </label>
              </div>

              <fieldset className={styles.fieldset} disabled={isSavingTrialResult || !canWriteTrialResult}>
                <legend className={styles.fieldLabel}>추천 요일</legend>
                <div className={styles.chips}>{TRIAL_RECOMMENDED_DAYS.map((day, index) => <V2Chip key={day} label={day} selected={recommendedDays.includes(index + 1)}
                  onClick={() => { setScheduleTouched(true); setRecommendedDays((current) => current.includes(index + 1) ? current.filter((value) => value !== index + 1) : [...current, index + 1]) }} />)}</div>
              </fieldset>
              <fieldset className={styles.fieldset} disabled={isSavingTrialResult || !canWriteTrialResult} aria-describedby="trial-period-hint">
                <legend className={styles.fieldLabel}>추천 시간대</legend>
                <div className={styles.chips}>{TRIAL_RECOMMENDED_PERIODS.map((period) => <V2Chip key={period.value} label={period.label} selected={recommendedPeriod === period.value}
                  onClick={() => { setScheduleTouched(true); setRecommendedPeriod((current) => current === period.value ? "" : period.value) }} />)}</div>
                <p id="trial-period-hint" className={styles.hint}>{TRIAL_RECOMMENDED_PERIODS.filter((period) => period.range).map((period) => `${period.label} ${period.range}`).join(" · ")}</p>
                {!scheduleTouched && editorSource?.recommendedSchedule && !parseTrialRecommendedSchedule(editorSource.recommendedSchedule)
                  ? <p className={styles.hint}>현재 추천 일정: {editorSource.recommendedSchedule}. 새 요일·시간대를 고르면 이 값이 바뀌어요.</p> : null}
                <input type="hidden" name="recommendedSchedule" value={draftSchedule} />
              </fieldset>
              <p className={styles.hint}>학원 메모(학부모에게 안 보여요)는 신청 화면 아래 &lsquo;등록 상담 메모&rsquo;에 따로 저장해요.</p>
            </form>

            <aside className={styles.preview} aria-label="학부모에게 이렇게 보여요">
              <p className={styles.previewLabel}>학부모에게 이렇게 보여요</p>
              <div className={styles.previewCard}>
                <p className={styles.previewAcademy}>{application.academyName}</p>
                <h3 className={styles.previewTitle}>{application.childName} 학생의 체험 리포트</h3>
                <p className={styles.previewMeta}>{[application.classTitle, formatSeoulDateTime(application.confirmedBlockStartAt ?? application.confirmedSlotAt ?? application.completedAt)].filter(Boolean).join(" · ")}</p>
                {recordDraft.publicSummary.trim() ? <section className={styles.previewSection}><h4>선생님 이야기</h4><p className={styles.previewSummary}>{recordDraft.publicSummary}</p></section> : null}
                <ReportPhotos attachments={photos} />
                {previewObservations.length ? <section className={styles.previewSection}><h4>수업에서 보인 모습</h4><ReportObservations observations={previewObservations} listClassName={styles.previewList} itemClassName={styles.previewListItem} /></section> : null}
                {previewRecommend.length ? <p className={styles.previewRecommend}><strong>추천</strong><span>{previewRecommend.join(" · ")}</span></p> : null}
                {!recordDraft.publicSummary.trim() && !photos.length && !previewObservations.length && !previewRecommend.length
                  ? <p className={styles.hint}>왼쪽에서 고르거나 쓰면 여기에 보여요.</p> : null}
              </div>
            </aside>
          </div>
        </V2Dialog>
      ) : null}

      {isSuccessOpen ? (
        <V2Dialog title="체험 기록을 저장했어요" description="저장한 내용이 리포트 미리보기에 반영돼요. 학부모에게 전달하려면 리포트를 보내 주세요." width={480} onClose={closeSuccessModal}>
          <p className={styles.hint}>닫으면 화면을 새로 불러와요.</p>
        </V2Dialog>
      ) : null}
    </>
  )
}
