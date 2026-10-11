"use client"

import { deriveApplicationDetailWorkflow, hasTrialRecordContent, type ApplicationWorkflowEvidence } from "@/features/studio/lib/application-detail-workflow-state"
import { ReportObservations } from "@/features/reports/ui/report-observations"
import { RegistrationResultEditor } from "./registration-result-editor"
import { ApplicationDetailIcon } from "./application-detail-icon"
import { StudioQueryRetry } from "./studio-query-retry"

import type { ReactNode } from "react"
import { startTransition, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { AcademyMemoEditor, type AcademyMemoData } from "./academy-memo-editor"
import { buildCaseActivityEvents } from "@/features/studio/lib/case-activity"
import {
  formatSeoulDateTime
} from "@/features/studio/lib/seoul-datetime"
import {
  upsertTrialResultAction,
  type UpsertTrialResultActionState
} from "@/features/studio/actions/upsert-trial-result"
import {
  getObservationGroups,
  getObservationGroupSnapshot,
  normalizeTrialResultObservation,
  describeTrialResultObservation,
  getTrialResultObservationLabel,
} from "@/features/studio/lib/trial-result-options"
import { ApplicationStatusActionForm } from "@/features/studio/ui/application-status-action-form"
import { PreviousConsultationRecords } from "@/features/studio/ui/consultation-history-modal"
import type {
  StudioApplicationDetail
} from "@/shared/lib/db/adapter"

import styles from "./application-trial-result-workflow.module.css"
import modalStyles from "./consultation-log-dialog.module.css"
import recordStyles from "./trial-record-dialog.module.css"
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

const initialTrialResultState: UpsertTrialResultActionState = {
  status: "idle",
  message: "",
  successToken: null
}

type ApplicationTrialResultWorkflowProps = {
  application: StudioApplicationDetail
  confirmationSection?: ReactNode
  headerContent?: ReactNode
  referenceSections?: ReactNode
  reportSection?: ReactNode
  feedbackSection?: ReactNode
  parentDecisionSection?: ReactNode
  sidebarContent?: ReactNode
  evidence: ApplicationWorkflowEvidence
  /** 서버가 정한 기준 시각. 체험 종료 판정이 hydration 전후로 갈리지 않게 한다. */
  nowIso: string
  /**
   * 쓰기 권한. 서버에서 해석해 넘긴다.
   *
   * ⚠️ 기능별로 따로 받는다. 하나의 boolean 으로 묶지 않는다 — 한 번 묶으면
   *    권한 경계가 바뀔 때(지금처럼) 어느 기능이 왜 잠겼는지 알 수 없게 된다.
   *
   * 화면에서 요금제 이름을 비교하지 않는다. 실제 차단은 server action 이 하고,
   * 여기서는 할 수 없는 버튼을 숨긴다.
   */
  canWriteTrialResults: boolean
  academyMemo: AcademyMemoData
}

export const ApplicationTrialResultWorkflow = ({
  application,
  evidence,
  headerContent,
  confirmationSection,
  sidebarContent = null,
  referenceSections = null,
  reportSection = null,
  feedbackSection = null,
  parentDecisionSection = null,
  nowIso,
  canWriteTrialResults,
  academyMemo
}: ApplicationTrialResultWorkflowProps) => {
  const router = useRouter()
  const observationGroups = getObservationGroups(application.reportSubjectCategory)
  const offeredCodes = new Set<string>(observationGroups.flatMap(group => group.options.map(option => option.value)))
  const reportLocked=Boolean(evidence.report.everSent || evidence.report.version)
  const [scheduleTouched,setScheduleTouched]=useState(false)
  const [editorSource,setEditorSource]=useState<StudioApplicationDetail["trialResult"]>(null)
  const [recordDraft, setRecordDraft] = useState({ recommendedCourse: "", recommendedLevel: "", publicSummary: "" })
  const [recommendedDays, setRecommendedDays] = useState<number[]>([])
  const [recommendedPeriod, setRecommendedPeriod] = useState<TrialRecommendedPeriod | "">("")
  const trialDialogRef = useRef<HTMLDialogElement>(null)
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
  const [trialResultState, trialResultFormAction, isSavingTrialResult] = useActionState(
    trialResultAction,
    initialTrialResultState
  )
  // Footer stays visible while the body scrolls, including a failed-save message.
  const [trialResultErrorMessage, setTrialResultErrorMessage] = useState<string | null>(null)
  const handledTrialResultSuccessTokenRef = useRef<string | null>(null)

  const recommendationSummary = useMemo(() => {
    return [
      application.trialResult?.recommendedCourse,
      application.trialResult?.recommendedLevel,
      application.trialResult?.recommendedSchedule
    ]
      .filter((item): item is string => Boolean(item))
      .join(" · ")
  }, [
    application.trialResult?.recommendedCourse,
    application.trialResult?.recommendedLevel,
    application.trialResult?.recommendedSchedule
  ])

  // 저장된 관찰 값을 현재 기준 code 와 과거 원문으로 갈라 둔다.
  // 화면 두 곳(요약 · 편집 폼)이 같은 기준을 쓴다.
  const storedObservations = useMemo(
    () => splitStoredObservations(application.trialResult?.observations),
    [application.trialResult?.observations]
  )

  // 체험 결과 form 은 관찰 기록만 다룬다. 등록 결정(등록 상태 / 미등록 사유)은
  // 등록 상담 form 의 몫이라 여기서 초기화할 상태가 없다.
  const resetTrialResultSelections = () => {
    setSelectedObservations(normalizeStoredObservations(application.trialResult?.observations))
    setObservationsTouched(false)
  }

  const openEditor = (options?: { refreshAfterClose?: boolean }) => {
    if (!canWriteTrialResult) return
    const record=application.trialResult
    setEditorSource(record?structuredClone(record):null)
    setRecordDraft({recommendedCourse:record?.recommendedCourse??"",recommendedLevel:record?.recommendedLevel??"",publicSummary:record?.publicSummary??""})
    const schedule=parseTrialRecommendedSchedule(record?.recommendedSchedule)
    setRecommendedDays(schedule?.days??[]);setRecommendedPeriod(schedule?.period??"");setScheduleTouched(false)
    resetTrialResultSelections()
    setTrialResultErrorMessage(null)
    setIsPromptOpen(false)
    setIsSuccessOpen(false)
    setRefreshOnEditorClose(Boolean(options?.refreshAfterClose))
    setIsEditorOpen(true)
  }

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

  const toggleObservation = (value: string) => {
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

  // Keep drafts intact and show server errors beside the finalization action.
  useEffect(() => {
    trialSubmitInFlight.current = false
    if (trialResultState.status === "error") {
      setTrialResultErrorMessage(trialResultState.message)
      if(trialResultState.message.includes("발행된 리포트")) router.refresh()
      return
    }

    if (trialResultState.status === "success") {
      setTrialResultErrorMessage(null)
    }
  }, [trialResultState,router])

  useEffect(() => {
    if (!isEditorOpen) return
    const dialog = trialDialogRef.current
    const previous = document.activeElement as HTMLElement | null
    const { overflow, paddingRight } = document.body.style
    const gutter = window.innerWidth - document.documentElement.clientWidth
    if (gutter > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gutter}px`
    dialog?.showModal()
    document.body.style.overflow = "hidden"
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, summary, a[href], [tabindex]"))
        .filter(element => !element.matches(":disabled") && element.tabIndex >= 0 && element.getClientRects().length > 0)
      const target = event.shiftKey && document.activeElement === controls[0] ? controls.at(-1)
        : !event.shiftKey && document.activeElement === controls.at(-1) ? controls[0] : null
      if (target) { event.preventDefault(); target.focus() }
    }
    dialog?.addEventListener("keydown", trapFocus)
    return () => {
      dialog?.removeEventListener("keydown", trapFocus)
      dialog?.close()
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      previous?.focus()
    }
  }, [isEditorOpen])

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
  const hasVisibleTrialResultContent = hasTrialRecordContent(application.trialResult)
  const draftSchedule=scheduleTouched?formatTrialRecommendedSchedule(recommendedDays,recommendedPeriod):editorSource?.recommendedSchedule??""
  const draftObservations=observationsTouched?selectedObservations:editorSource?.observations??selectedObservations
  const editorDirty=Object.entries(recordDraft).some(([field,value])=>value!==(editorSource?.[field as keyof typeof recordDraft]??""))
    || draftSchedule!==(editorSource?.recommendedSchedule??"")
    || JSON.stringify([...draftObservations].sort())!==JSON.stringify([...(editorSource?.observations??[])].sort())
  useEffect(()=>{
    if(!isEditorOpen || !editorDirty)return
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=""}
    const href=window.location.href,state=window.history.state
    const back=(event:PopStateEvent)=>{if(!window.confirm("저장하지 않은 변경이 있습니다. 변경을 버리고 이동할까요?")){event.stopImmediatePropagation();window.history.pushState(state,"",href)}}
    window.addEventListener("beforeunload",unload);window.addEventListener("popstate",back,true)
    return()=>{window.removeEventListener("beforeunload",unload);window.removeEventListener("popstate",back,true)}
  },[isEditorOpen,editorDirty])
  const handleCompletedSaved = useCallback(() => { setIsPromptOpen(true) }, [])
  const activityEvents = useMemo(() => buildCaseActivityEvents(application), [application])
  const systemEvents = activityEvents.filter(event => event.kind !== "consultation")
  const memoSection = isCompletedView || academyMemo.data?.note || application.trialResult?.note ? (
    <div id="consultation-records">
      <AcademyMemoEditor key={application.id} applicationId={application.id} initial={academyMemo}
        legacyNote={application.trialResult?.note ?? null}
        canWrite={canWriteTrialResults && isCompletedView && !application.noShowAt && !application.canceledAt}
        blockReason={!isCompletedView || application.noShowAt || application.canceledAt ? "체험 완료 처리 후 메모를 저장할 수 있어요." : !canWriteTrialResults ? "메모 작성 권한이 없어요. 학원 관리자에게 권한을 확인해 주세요." : null} />
    </div>
  ) : null
  const trialResultSection = !isCompletedView && !hasVisibleTrialResultContent ? null : (
    <section id="trial-record" className={styles.recordContent} aria-label="체험 기록">
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}><ApplicationDetailIcon name="record" />체험 기록</h3>
        {hasTrialResult ? <div><span className={styles.completedBadge}>✓ 저장 완료</span>{!reportLocked ? <button type="button" className={styles.inlineTextButton} onClick={()=>openEditor()} disabled={!canWriteTrialResult} aria-describedby={recordBlockReason ? "record-help" : undefined}>기록 수정</button> : null}</div> : null}
      </div>
      {recordBlockReason ? <p id="record-help" className={styles.sectionMetaLine}>{recordBlockReason}</p> : null}
      {hasTrialResult ? <p className={styles.sectionMetaLine}>{formatSeoulDateTime(application.trialResult?.updatedAt)} · {reportLocked?"보낸 뒤 읽기 전용":"보내기 전 수정 가능"}</p> : null}
      {hasTrialResult ? (
        <details className={styles.resultCompact} open={!reportLocked}><summary className={styles.disclosureSummary}>기록 보기</summary>
          {recommendationSummary ? <p className={styles.recordSummary}>{recommendationSummary}</p> : null}
          {storedObservations.canonical.length ? (
            <div className={styles.chipWrap}>
              {storedObservations.canonical.map((code) => (
                <span key={code} className={styles.summaryChip}>
                  {getTrialResultObservationLabel(code)}
                </span>
              ))}
            </div>
          ) : null}

          {/*
            문구를 저장하던 시절의 기록은 원문 그대로 보여 준다.
            현재 문구로 바꿔 보여 주면 옛 기록이 지금 기준의 관찰인 것처럼 읽힌다.
          */}
          {storedObservations.legacy.length ? (
            <div className={styles.legacyObservationBlock}>
              <p className={styles.legacyObservationTitle}>기존 관찰 기록</p>
              <div className={styles.chipWrap}>
                {storedObservations.legacy.map((text) => (
                  <span key={text} className={styles.legacyObservationChip}>
                    {text}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <dl className={styles.resultGrid}>
            <div className={styles.resultGridRow}><dt className={styles.resultGridLabel}>학부모에게 전달할 총평</dt><dd className={styles.resultGridValue}>{application.trialResult?.publicSummary?.trim() || "-"}</dd></div>
            <div className={styles.resultGridRow}>
              <dt className={styles.resultGridLabel}>추천 과정</dt>
              <dd className={styles.resultGridValue}>
                {application.trialResult?.recommendedCourse?.trim() || "-"}
              </dd>
            </div>
            <div className={styles.resultGridRow}>
              <dt className={styles.resultGridLabel}>추천 레벨</dt>
              <dd className={styles.resultGridValue}>
                {application.trialResult?.recommendedLevel?.trim() || "-"}
              </dd>
            </div>
            <div className={styles.resultGridRow}>
              <dt className={styles.resultGridLabel}>학원 추천 일정</dt>
              <dd className={styles.resultGridValue}>
                {application.trialResult?.recommendedSchedule?.trim() || "-"}
              </dd>
            </div>

          </dl>
        </details>
      ) : isCompletedView ? (
        <div className={styles.compactEmpty}>
          <p className={styles.sectionMetaLine}>체험 수업 내용을 기록하고,<br />학부모 리포트를 위한 기초 자료로 활용합니다.</p>
            <button type="button" className={styles.primaryButton} onClick={() => openEditor()} disabled={!canWriteTrialResult} aria-describedby={recordBlockReason ? "record-help" : undefined}>
              기록 작성
            </button>
        </div>
      ) : null}
    </section>
  )

  const registrationSection = isCompletedView ? (
    evidence.registration.error ? <div role="alert">등록 결과 정보를 불러오지 못했어요.<StudioQueryRetry /></div>
      : <RegistrationResultEditor key={application.id} application={application} />
  ) : null

  const systemSection = <details className={styles.systemDisclosure} aria-label="처리 이력" open={isTerminal}>
    <summary className={styles.disclosureSummary}>처리 이력 보기</summary>
    {systemEvents.length ? <ol className={styles.activityList}>{systemEvents.map(event => <li key={event.id} className={styles.activitySystemItem}><span className={styles.activitySystemTitle}>{event.title}{event.meta ? ` · ${event.meta}` : ""}</span><time className={styles.activitySystemTime} dateTime={event.at}>{formatSeoulDateTime(event.at)}</time></li>)}</ol> : <p className={styles.simpleEmptyLine}>처리 이력이 없습니다.</p>}
  </details>
  const beforeSending = isCompletedView && !isTerminal && !reportLocked
  const HistoryContainer = beforeSending ? "details" : "div"
  const recommendations = [
    ["추천 과정", application.trialResult?.recommendedCourse],
    ["추천 레벨", application.trialResult?.recommendedLevel],
    ["추천 일정", application.trialResult?.recommendedSchedule]
  ].filter((item): item is [string, string] => Boolean(item[1]?.trim()))

  const hasPublicReportContent = Boolean(storedObservations.canonical.length || storedObservations.legacy.length || recommendations.length || application.trialResult?.publicSummary?.trim())

  // Existing list links may target content now placed in a disclosure.
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

  return (
    <>
      <div className={`${styles.workspace} ${beforeSending ? styles.approvedWorkspace : ""} ${confirmationSection ? styles.withConfirmation : ""}`} data-phase={isTerminal ? "closed" : !isCompletedView ? "before" : reportLocked ? "sent" : "record"}>
        <section className={styles.workspaceHeader} aria-label="신청 작업 헤더">
          {headerContent}
          {!confirmationSection && workflow.primary?.action === "status" ? (
            <div className={styles.statusActions}>
              <ApplicationStatusActionForm applicationId={application.id} currentStatus={application.status}
                variant="case-detail" primaryTone={workflow.primary?.action === "status" ? "primary" : "secondary"} onCompletedSaved={handleCompletedSaved} />
            </div>
          ) : null}
        </section>

        {confirmationSection ? <section id="confirm-schedule" className={`${styles.card} ${styles.confirmationCard}`} aria-label="일정 확정">
          <h2 className={styles.sectionTitle}>일정 확정</h2>
          <p className={styles.sectionMetaLine}>체험 일정을 확정해 주세요.</p>
          {confirmationSection}
        </section> : null}
        {isTerminal ? <section className={styles.terminalSection} aria-label="종료 사유">
          <h2 className={styles.sectionTitle}>{application.noShowAt ? "불참" : "취소"} 처리 내역</h2>
          <p className={styles.activityNote}>{application.logs.find(log => log.toStatus === "canceled" && log.note?.trim())?.note || "별도로 기록된 사유가 없어요."}</p>
        </section> : null}
        {isTerminal ? systemSection : null}
        {beforeSending ? <>
          <section id="trial-record" className={styles.reportReading} aria-labelledby="record-report-title">
            <header className={styles.reportReadingHead}>
              <h2 id="record-report-title">{application.childName} 학생의 체험 리포트</h2>
              <p>오늘의 수업 · {formatSeoulDateTime(application.confirmedBlockStartAt ?? application.confirmedSlotAt ?? application.completedAt)}</p>
            </header>
            {evidence.trialResultError ? <div role="alert"><p>체험 기록 정보를 불러오지 못했어요.</p><StudioQueryRetry /></div> : hasPublicReportContent ? <>
              {storedObservations.canonical.length || storedObservations.legacy.length ? <section className={styles.reportReadingSection}>
                <h3>수업에서 보인 모습</h3>
                <ReportObservations observations={storedObservations.canonical.flatMap(value => {
                  const code = normalizeTrialResultObservation(value)
                  return code ? [{ code, label: getTrialResultObservationLabel(code)!, group: getObservationGroupSnapshot(code) }] : []
                })} />
                {storedObservations.legacy.length ? <><p className={styles.fieldHint}>기존 기준으로 작성된 관찰 기록</p><ul>{storedObservations.legacy.map(text => <li key={text}>{text}</li>)}</ul></> : null}
              </section> : null}
              {application.trialResult?.publicSummary?.trim() ? <section className={styles.reportReadingSection}>
                <h3>선생님 이야기</h3><p className={styles.savedText}>{application.trialResult.publicSummary}</p>
              </section> : null}
              {recommendations.length ? <section className={styles.reportReadingSection}>
                <h3>추천 정보</h3><dl>{recommendations.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              </section> : null}
            </> : <p className={styles.simpleEmptyLine}>아직 작성된 리포트 내용이 없어요. 체험에서 관찰한 모습과 총평을 기록해 주세요.</p>}
            <footer className={styles.reportReadingActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => openEditor()} disabled={!canWriteTrialResult} aria-describedby={recordBlockReason ? "record-help" : undefined}>{hasTrialResult ? "내용 수정" : "기록 작성"}</button>
              {recordBlockReason ? <p id="record-help" className={styles.fieldHint}>{recordBlockReason}</p> : null}
              {reportSection}
            </footer>
          </section>
          <aside className={styles.operations} aria-label="학원에서 관리할 내용">
            <h2>학원에서 관리할 내용</h2>
            {registrationSection}
            {memoSection}
            {parentDecisionSection}
            {!application.parentId ? <p className={styles.fieldHint}>학부모 계정이 연결되어 있지 않아요. 학원 등록 결과는 계속 기록할 수 있어요.</p> : null}
          </aside>
          <details className={styles.referenceDisclosure}>
            <summary className={styles.disclosureSummary}>학생·신청 정보</summary>
            <div className={styles.referenceContents}>{sidebarContent}{referenceSections}{feedbackSection}</div>
          </details>
        </> : <>
        <details className={styles.recordCard} open={isCompletedView && !isTerminal} aria-labelledby="record-report-title">
          <summary id="record-report-title" className={styles.disclosureSummary}>{isCompletedView ? "기록·리포트·등록 결과" : "기록·리포트"}</summary>
          <div className={styles.recordSections}>
          {reportLocked ? reportSection : null}
          {evidence.trialResultError || !trialResultSection ? <section id="trial-record" className={styles.recordContent} aria-label="체험 기록">
            <h3 className={styles.sectionTitle}><ApplicationDetailIcon name="record" />체험 기록</h3>
            {evidence.trialResultError ? <div role="alert"><p>체험 기록 정보를 불러오지 못했어요.</p><StudioQueryRetry /></div>
              : <p className={styles.simpleEmptyLine}>{application.status === "canceled" ? "남아 있는 체험 기록이 없습니다." : "체험을 완료한 뒤 기록할 수 있어요."}</p>}
          </section> : trialResultSection}
          {/* 기록 조회 실패와 발행본 조회는 독립적이다. 확인된 발행본은 계속 보여 준다. */}
          {!reportLocked ? reportSection ?? <section className={styles.registrationSection} aria-label="학부모 리포트"><div className={styles.sectionHead}><h3 className={styles.sectionTitle}><ApplicationDetailIcon name="report" />학부모 리포트</h3><span className={styles.sectionMetaLine}>아직 보내지 않음</span></div><p className={styles.sectionMetaLine}>기록 저장 후 리포트를 보낼 수 있어요.</p></section> : null}
          {registrationSection}
          </div>
        </details>

        </>}

        {!beforeSending ? <aside className={styles.workspaceAside} aria-label="신청 참고 패널">
          {sidebarContent}
          {isCompletedView ? <>
            {parentDecisionSection}
            {!application.parentId ? <p className={styles.sectionMetaLine}>학부모 계정이 연결되어 있지 않아요. 학원 등록 결과는 계속 기록할 수 있어요.</p> : null}
          </> : null}
          {referenceSections}
          {isCompletedView ? feedbackSection : null}
        </aside> : null}

        <HistoryContainer className={beforeSending ? styles.historyDisclosure : styles.supplementary}>
          {beforeSending ? <summary className={styles.disclosureSummary}>이전 상담·처리 이력</summary> : null}
          {!beforeSending ? memoSection : null}
          <PreviousConsultationRecords logs={application.consultationLogs} />
          <section className={`${styles.card} ${styles.sectionCard}`} aria-label="최근 활동">
            <h2 className={styles.sectionTitle}><ApplicationDetailIcon name="activity" />최근 활동</h2>
            {activityEvents.length ? <ol className={styles.activityList}>{activityEvents.slice(0, 3).map(event => <li key={event.id} className={styles.activityItem}><span className={styles.activityMarker} aria-hidden="true" /><div className={styles.activityContent}><p className={styles.activityTitle}>{event.title}</p><time className={styles.activityTime} dateTime={event.at}>{formatSeoulDateTime(event.at)}</time>{event.note ? <p className={styles.activityNote}>{event.note}</p> : null}</div></li>)}</ol> : <p className={styles.simpleEmptyLine}>아직 활동 내역이 없습니다.</p>}
          </section>
          {beforeSending ? systemSection : null}
        </HistoryContainer>
        {!isTerminal && !beforeSending ? systemSection : null}
      </div>

      {isPromptOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div className={styles.dialogCard} role="dialog" aria-modal="true" aria-labelledby="trial-result-prompt-title">
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="닫기"
              onClick={closePromptLater}
            >
              닫기
            </button>
            <div className={styles.dialogBody}>
              <h3 id="trial-result-prompt-title" className={styles.dialogTitle}>
                체험 기록을 작성할까요?
              </h3>
              <p className={styles.dialogDescription}>
                수업 직후 간단히 남겨두면 이후 상담에 바로 활용할 수 있습니다.
              </p>
            </div>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.secondaryButton} onClick={closePromptLater}>
                나중에 기록
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => openEditor({ refreshAfterClose: true })}
              >
                지금 기록하기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEditorOpen ? (
        <dialog ref={trialDialogRef} className={`${modalStyles.dialog} ${recordStyles.dialog}`} aria-labelledby="trial-result-editor-title" aria-describedby="trial-result-editor-description" onCancel={event => { event.preventDefault(); closeEditor() }}>
          <header className={modalStyles.header}>
            <div>
              <h3 id="trial-result-editor-title">{hasTrialResult?"리포트 내용 수정":"기록 작성"}</h3>
              <p id="trial-result-editor-description">{application.childName} · {application.classTitle} · {formatSeoulDateTime(application.confirmedBlockStartAt ?? application.confirmedSlotAt ?? application.completedAt)}</p>
            </div>
            <button type="button" className={modalStyles.close} aria-label="닫기" onClick={closeEditor} disabled={isSavingTrialResult}>×</button>
          </header>
          <form className={modalStyles.form} onSubmit={event => {
            event.preventDefault()
            if (isSavingTrialResult || trialSubmitInFlight.current || !canWriteTrialResult) return
            const data = new FormData(event.currentTarget)
            trialSubmitInFlight.current = true
            setTrialResultErrorMessage(null)
            // Call the same action without native form-action reset on a failed response.
            startTransition(() => trialResultFormAction(data))
          }}>
            <input type="hidden" name="expectedAssessmentUpdatedAt" value={editorSource?.updatedAt??""} />
            <div className={modalStyles.body}>
              <fieldset className={modalStyles.group} disabled={isSavingTrialResult || !canWriteTrialResult}>
                <legend>관찰한 모습</legend>
                {splitStoredObservations(editorSource?.observations).legacy.length > 0 ? (
                  <div className={styles.legacyObservationBlock}>
                    <p className={styles.legacyObservationTitle}>기존 기준으로 작성된 관찰 기록입니다.</p>
                    <p className={modalStyles.hint}>리포트를 보내려면 아래 현재 관찰 항목을 직접 확인해 선택해 주세요. 기존 문구는 자동 선택하지 않습니다.</p>
                    <div>{splitStoredObservations(editorSource?.observations).legacy.map(text => <span key={text} className={styles.legacyObservationChip}>{text}</span>)}</div>
                  </div>
                ) : null}
                {observationGroups.map(group => <div key={group.code} className={recordStyles.observationGroup} role={group.code === "general" ? undefined : "group"} aria-label={group.code === "general" ? undefined : group.label}>
                  {group.code !== "general" ? <h4>{group.label}</h4> : null}
                  <div className={`${modalStyles.chips} ${recordStyles.observations}`}>
                    {group.options.map(option => <button key={option.value} type="button" aria-pressed={selectedObservations.includes(option.value)} onClick={() => toggleObservation(option.value)}>{option.label}</button>)}
                  </div>
                </div>)}
                {normalizeStoredObservations(editorSource?.observations).some(code => !offeredCodes.has(code)) ? <details className={recordStyles.previousObservations} open>
                  <summary>이전에 선택한 관찰 항목</summary>
                  <p className={modalStyles.hint}>기존 선택은 유지돼요. 변경할 항목만 직접 해제해 주세요.</p>
                  <div className={`${modalStyles.chips} ${recordStyles.observations}`}>
                    {normalizeStoredObservations(editorSource?.observations).filter(code => !offeredCodes.has(code)).map(code => <button key={code} type="button" aria-pressed={selectedObservations.includes(code)} onClick={() => toggleObservation(code)}>{getTrialResultObservationLabel(code)}</button>)}
                  </div>
                </details> : null}
                <p className={modalStyles.hint}>오늘 확인한 항목만 선택해 주세요. 모든 영역을 선택하지 않아도 돼요.</p>
                {selectedObservations.map(item => <input key={item} type="hidden" name="observations" value={item} />)}
                <input type="hidden" name="observationsTouched" value={observationsTouched ? "true" : "false"} />
              </fieldset>
              <label className={modalStyles.field} htmlFor="trial-public-summary">
                <span>학부모에게 전달할 총평</span>
                <textarea id="trial-public-summary" name="publicSummary" aria-label="학부모에게 전달할 총평" aria-describedby="trial-public-summary-hint" value={recordDraft.publicSummary} onChange={event => setRecordDraft(draft => ({ ...draft, publicSummary: event.target.value }))} rows={4} placeholder={"어떤 장면을 관찰했고, 다음 수업에서 어떻게 지도하면 좋을지\n짧게 적어 주세요."} maxLength={1000} disabled={isSavingTrialResult || !canWriteTrialResult} />
                <p id="trial-public-summary-hint" className={modalStyles.hint}>학부모가 리포트에서 읽습니다.</p>
              </label>
              <details className={recordStyles.recommendations}>
                <summary>추천 과정·레벨·일정 <span>선택</span></summary>
              <div className={recordStyles.columns}>
                <label className={modalStyles.field} htmlFor="trial-recommended-course"><span>추천 과정</span><input id="trial-recommended-course" name="recommendedCourse" value={recordDraft.recommendedCourse} onChange={event => setRecordDraft(draft => ({ ...draft, recommendedCourse: event.target.value }))} disabled={isSavingTrialResult || !canWriteTrialResult} /></label>
                <label className={modalStyles.field} htmlFor="trial-recommended-level"><span>추천 레벨</span><input id="trial-recommended-level" name="recommendedLevel" value={recordDraft.recommendedLevel} onChange={event => setRecordDraft(draft => ({ ...draft, recommendedLevel: event.target.value }))} disabled={isSavingTrialResult || !canWriteTrialResult} /></label>
              </div>
              <section className={recordStyles.schedule} aria-labelledby="trial-recommended-schedule-title">
                <h4 id="trial-recommended-schedule-title">추천 일정</h4>
                <fieldset className={modalStyles.group} disabled={isSavingTrialResult || !canWriteTrialResult}>
                  <legend>추천 요일</legend>
                  <div className={modalStyles.chips}>{TRIAL_RECOMMENDED_DAYS.map((day, index) => <button key={day} type="button" aria-pressed={recommendedDays.includes(index + 1)} onClick={() => {setScheduleTouched(true);setRecommendedDays(current => current.includes(index + 1) ? current.filter(value => value !== index + 1) : [...current, index + 1])}}>{day}</button>)}</div>
                </fieldset>
                <fieldset className={modalStyles.group} disabled={isSavingTrialResult || !canWriteTrialResult} aria-describedby="trial-period-hint">
                  <legend>추천 시간대</legend>
                  <div className={modalStyles.chips}>{TRIAL_RECOMMENDED_PERIODS.map(period => <button key={period.value} type="button" aria-pressed={recommendedPeriod === period.value} onClick={() => {setScheduleTouched(true);setRecommendedPeriod(current => current === period.value ? "" : period.value)}}>{period.label}</button>)}</div>
                  <p id="trial-period-hint" className={modalStyles.hint}>{TRIAL_RECOMMENDED_PERIODS.filter(period => period.range).map(period => `${period.label} ${period.range}`).join(" · ")}</p>
                </fieldset>
                {!scheduleTouched && editorSource?.recommendedSchedule && !parseTrialRecommendedSchedule(editorSource.recommendedSchedule)?<p className={modalStyles.hint}>현재 추천 일정: {editorSource.recommendedSchedule}. 새 요일·시간대를 선택하면 이 값이 바뀝니다.</p>:null}
                <input type="hidden" name="recommendedSchedule" value={draftSchedule} />
              </section>
              </details>
            </div>
            <footer className={modalStyles.footer}>
              <p className={recordStyles.notice}>저장만으로 학부모에게 보내지지 않아요.</p>
              <p id="record-save-help" className={modalStyles.hint}>{isSavingTrialResult ? "기록을 저장하고 있어요." : recordBlockReason ?? (hasTrialResult && !editorDirty ? "저장된 내용과 같아요. 내용을 수정하면 저장할 수 있어요." : "저장한 내용으로 리포트를 미리 볼 수 있어요.")}</p>
              {trialResultErrorMessage ? <p className={modalStyles.error} role="alert">{trialResultErrorMessage}</p> : null}
              <div className={modalStyles.actions}>
                <button type="button" onClick={closeEditor} disabled={isSavingTrialResult}>취소</button>
                <button type="submit" aria-describedby="record-save-help" className={modalStyles.primary} disabled={isSavingTrialResult || !canWriteTrialResult || (hasTrialResult && !editorDirty)}>{isSavingTrialResult ? "저장 중..." : "기록 저장"}</button>
              </div>
            </footer>
          </form>
        </dialog>
      ) : null}

      {isSuccessOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div
            className={styles.dialogCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-result-success-title"
          >
            <div className={styles.dialogBody}>
              <h3 id="trial-result-success-title" className={styles.dialogTitle}>
                체험 기록을 저장했습니다.
              </h3>
              <p className={styles.dialogDescription}>
                저장한 내용이 리포트 미리보기에 반영됩니다. 학부모에게 전달하려면 리포트 보내기를 눌러 주세요.
              </p>
            </div>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.primaryButton} onClick={closeSuccessModal}>
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </>
  )
}
