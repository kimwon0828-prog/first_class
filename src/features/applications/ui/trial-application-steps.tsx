"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { isBookablePublicSlot } from "@/features/applications/lib/public-class-slots"
import { saveTrialApplicationDraft } from "@/features/applications/lib/trial-application-draft"
import { appDateLabel, appDurationLabel, appTimeLabel } from "@/features/classes/lib/app-presentation"
import { AppIcon, type AppIconName } from "@/features/classes/ui/app-icon"
import { AppButton, AppButtonLink } from "@/features/classes/ui/parent-app-ui"
import ui from "@/features/classes/ui/parent-app-ui.module.css"
import { getMyAcademyNewsConsentAction, setAcademyNewsConsentAction } from "@/features/marketing-consent/actions/set-academy-news-consent"
import { MARKETING_CONSENT_TEXT_VERSION, type MarketingConsentState } from "@/features/marketing-consent/lib/marketing-consent"
import { isChildEligibleForClass } from "@/shared/constants/grade-options"
import { LEARNER_GRADES, getChildGradeLabel } from "@/shared/constants/education-taxonomy"

import { SlotPicker } from "./class-detail-booking"
import { useTrialApplicationForm, type TrialApplicationFormProps } from "./use-trial-application-form"
import styles from "./trial-application-steps.module.css"

// 앱 application-sheet.tsx(feat/marketing-consent 2b7854e)의 3단계. 신청 로직 · 검증 · 저장은 기존 useTrialApplicationForm 그대로다.

const MARKETING_CONSENT_LABEL = "첫수업 학원 소식 받기 (광고)"
const MARKETING_CONSENT_HELP = "체험한 학원에 새 반·특강이 열리면 첫수업이 문자로 알려드려요. 마이 › 학원 소식에서 언제든 끌 수 있어요."
const agreements = [
  "(필수) 체험수업 신청에 필요한 개인정보 수집·이용에 동의합니다.",
  "(필수) 신청 정보가 해당 학원 및 담당 선생님에게 제공되는 것에 동의합니다.",
  "(필수) 학생의 법정대리인으로서 신청 정보를 제공하는 것에 동의합니다."
] as const
const titles = ["언제 체험할까요?", "누가 체험하나요?", "마지막으로 내용을 확인해주세요"] as const
const STEPS = 3

export type Step = 1 | 2 | 3
type ConsentState = { status: "loading" } | { status: "hidden" } | { status: "ready"; consent: MarketingConsentState }

export type TrialApplicationStepsProps = TrialApplicationFormProps & {
  mode: "sheet" | "page"
  classTitle: string
  /** 3단계 장소 줄: "학원 · 지역" */
  placeLabel: string | null
  /** 3단계 가격 줄(앱 classPrice): "체험수업 10,000원" */
  priceLabel: string
  /** 마지막 버튼: "무료 체험 신청하기" */
  submitLabel: string
  hasSession: boolean
  isParentUser: boolean
  signInHref: string
  now: number
  initialStep?: Step
  initialOptionId?: string
  onClose?: () => void
  /** 페이지 모드에서 1단계 위에 둘 신청 수업 요약 */
  summary?: ReactNode
}

// 신청은 이미 성공했으므로 동의 저장 실패가 신청을 되돌리지 않는다. 조용히 한 번만 다시 시도한다(앱과 같다).
async function saveAcademyNewsConsent() {
  const input = { consented: true, textVersion: MARKETING_CONSENT_TEXT_VERSION }
  try {
    const first = await setAcademyNewsConsentAction(input)
    if (first.ok) return
  } catch { /* 다시 한 번 */ }
  try { await setAcademyNewsConsentAction(input) } catch { /* 신청은 성공으로 둔다. */ }
}

export function TrialApplicationSteps(props: TrialApplicationStepsProps) {
  const { mode, classTitle, placeLabel, priceLabel, submitLabel, hasSession, isParentUser, signInHref, now, initialStep = 1, initialOptionId, onClose, summary,
    classId, classTargetAge, availableSlots, slotsError, childProfiles, childProfilesError, parentName, parentPhone } = props
  const [step, setStep] = useState<Step>(initialStep)
  const [manual, setManual] = useState(false)
  const [extra, setExtra] = useState(false)
  // 첫수업 학원 소식(광고) 수신 동의 — 선택, 기본 꺼짐. 이미 동의했으면 묻지 않고, 읽지 못하면 묻지 않는다.
  const [consent, setConsent] = useState<ConsentState>(hasSession && isParentUser ? { status: "loading" } : { status: "hidden" })
  const [marketing, setMarketing] = useState(false)
  const alreadyConsented = consent.status === "ready" && consent.consent.consented
  const showConsent = consent.status === "ready" && !consent.consent.consented
  const form = useTrialApplicationForm({ classId, classTargetAge, availableSlots, slotsError, childProfiles }, {
    autoSelectSingleSlot: false,
    onSuccess: marketing && showConsent ? saveAcademyNewsConsent : undefined
  })
  const { state, formAction, isPending, selectedChildId, setSelectedChildId, selectedOptionId, setSelectedOptionId, childName, setChildName, childGrade, setChildGrade,
    privacyAgreed, setPrivacyAgreed, thirdPartyAgreed, setThirdPartyAgreed, guardianAgreed, setGuardianAgreed, clientMessage, selectedSlot, isGradeEligible, canSubmit,
    requiredAgreementsChecked, handleSubmit, formRef } = form

  useEffect(() => { if (initialOptionId) setSelectedOptionId(initialOptionId) }, [initialOptionId, setSelectedOptionId])
  useEffect(() => {
    if (!hasSession || !isParentUser) return
    let active = true
    getMyAcademyNewsConsentAction()
      .then(result => { if (active) setConsent(result.ok ? { status: "ready", consent: result.data } : { status: "hidden" }) })
      .catch(() => { if (active) setConsent({ status: "hidden" }) })
    return () => { active = false }
  }, [hasSession, isParentUser])

  const eligibleGrades = useMemo(() => LEARNER_GRADES.filter(grade => isChildEligibleForClass(grade.value, classTargetAge)), [classTargetAge])
  const required = [privacyAgreed, thirdPartyAgreed, guardianAgreed]
  const setRequired = [setPrivacyAgreed, setThirdPartyAgreed, setGuardianAgreed]
  const allChecked = required.every(Boolean) && (!showConsent || marketing)
  const toggleAll = () => { const next = !allChecked; setRequired.forEach(set => set(next)); if (showConsent) setMarketing(next) }
  const validSlot = Boolean(selectedSlot && isBookablePublicSlot(selectedSlot, now))
  const validChild = hasSession && isParentUser && childName.trim().length >= 2 && childGrade.trim().length > 0 && isGradeEligible
  const available = availableSlots.filter(slot => isBookablePublicSlot(slot, now))
  const when = selectedSlot ? [`${appDateLabel(selectedSlot.startAt)} ${appTimeLabel(selectedSlot.startAt)}`, appDurationLabel(selectedSlot)].filter(Boolean).join(" · ") : ""
  const gradeLabel = childGrade ? getChildGradeLabel(childGrade) ?? childGrade : ""
  const childLine = childName ? [childName, gradeLabel].filter(Boolean).join(" · ") : ""
  const canFinalSubmit = hasSession && isParentUser && canSubmit && requiredAgreementsChecked && validSlot && validChild
  const nextDisabled = isPending || (step === 1 ? !validSlot : step === 2 ? !validChild : !canFinalSubmit)
  const message = clientMessage || state.message
  const go = (next: Step) => { setStep(next); document.getElementById(`${classId}-application-body`)?.scrollTo({ top: 0 }) }
  const set = (setter: (value: string) => void) => (event: { target: { value: string } }) => setter(event.target.value)

  return <form ref={formRef} action={formAction} onSubmit={handleSubmit} className={styles.layout} data-mode={mode}>
    <div>
      {mode === "sheet" ? <div className={styles.handle} aria-hidden="true" /> : null}
      <div className={styles.header}>
        <h2 className={styles.stepTitle}>{titles[step - 1]}</h2>
        <span className={styles.stepCount}>{step}/{STEPS}</span>
        {onClose ? <button type="button" className={styles.close} aria-label="닫기" disabled={isPending} onClick={onClose}><AppIcon name="x" size={24} /></button> : null}
      </div>
      <div className={styles.track} aria-hidden="true"><span style={{ width: `${(step / STEPS) * 100}%` }} /></div>
    </div>

    <div className={styles.body} id={`${classId}-application-body`}>
      {step === 1 ? <>
        {summary}
        {slotsError ? <p className={ui.body} role="alert">{slotsError}</p>
          : !available.length ? <p className={ui.bodyMuted}>현재 예약 가능한 일정이 없어요.</p>
          : <SlotPicker slots={availableSlots} now={now} selectedId={selectedOptionId} onSelect={setSelectedOptionId} />}
      </> : null}

      {step === 2 ? <>
        {!hasSession ? <>
          <p className={ui.body}>로그인 후 신청할 수 있어요.</p>
          <AppButtonLink href={signInHref} onClick={() => saveTrialApplicationDraft({ classId, selectedScheduleOptionId: selectedOptionId })}>로그인하기</AppButtonLink>
        </> : !isParentUser ? <p className={ui.body}>학부모 계정으로 신청할 수 있어요. 학부모 계정으로 로그인한 뒤 자녀 정보를 선택해주세요.</p> : <>
          {childProfilesError ? <p className={ui.error} role="alert">{childProfilesError}</p> : null}
          {childProfiles.length ? <div className={styles.children} role="radiogroup" aria-label="체험할 자녀">
            {childProfiles.map(child => {
              const eligible = isChildEligibleForClass(child.grade, classTargetAge)
              const label = getChildGradeLabel(child.grade) ?? child.grade
              return <button key={child.id} type="button" role="radio" className={styles.child} aria-checked={selectedChildId === child.id} disabled={!eligible || isPending}
                aria-label={`${child.name} · ${label}${eligible ? "" : " · 대상 아님"}`} onClick={() => { setManual(false); setSelectedChildId(child.id) }}>
                <span className={styles.avatar} aria-hidden="true">{child.name.slice(0, 1)}</span>
                <span className={styles.childText}><span className={styles.childName}>{child.name}</span><span className={ui.caption}>{label}{eligible ? "" : " · 대상 아님"}</span></span>
                <span className={styles.radio} aria-hidden="true" />
              </button>
            })}
          </div> : null}
          <button type="button" className={styles.textButton} onClick={() => { setManual(true); setSelectedChildId(""); setChildName(""); setChildGrade("") }}>직접 입력하기</button>
          {!selectedChildId && (manual || !childProfiles.length) ? <>
            <Field label="자녀 이름"><input className={styles.input} value={childName} onChange={set(setChildName)} disabled={isPending} maxLength={2000} /></Field>
            <div className={styles.field}><span className={styles.fieldLabel} id={`${classId}-grade`}>학년</span>
              <div className={ui.chipRow} role="group" aria-labelledby={`${classId}-grade`}>
                {eligibleGrades.map(grade => <button key={grade.value} type="button" className={ui.filterChip} aria-pressed={childGrade === grade.value} onClick={() => setChildGrade(grade.value)}>{grade.label}</button>)}
              </div>
              {!isGradeEligible && childGrade.trim() ? <p className={ui.error}>선택한 자녀의 학년이 이 수업의 대상 학년과 맞지 않아 신청할 수 없어요.</p> : null}
            </div>
          </> : null}
          <Field label="학원에 전할 말" optional><textarea className={styles.input} value={form.memo} onChange={set(form.setMemo)} disabled={isPending} maxLength={2000} /></Field>
          <div className={ui.softBox}><p className={ui.body}>보호자 · {parentName}</p><p className={ui.caption}>{parentPhone ?? "등록된 연락처가 없습니다."}</p></div>
          <button type="button" className={styles.disclosure} aria-expanded={extra} onClick={() => setExtra(value => !value)}>추가 정보 (선택)<AppIcon name={extra ? "chevron-up" : "chevron-down"} size={20} /></button>
          {extra ? <>
            <Field label="학교"><input className={styles.input} value={form.childSchool} onChange={set(form.setChildSchool)} disabled={isPending} maxLength={2000} /></Field>
            <Field label="아이에 대해 알려주세요"><input className={styles.input} value={form.childNotes} onChange={set(form.setChildNotes)} disabled={isPending} maxLength={2000} /></Field>
            <p className={ui.caption}>진단명·알레르기 등 건강정보는 입력하지 말고, 필요한 내용은 학원에 직접 전달해 주세요.</p>
            <Chips label="이 과목을 배운 경험" value={form.subjectExperienceYn} onChange={form.setSubjectExperienceYn} options={[["", "선택 안 함"], ["yes", "있음"], ["no", "없음"]]} />
            <Field label="경험 기간"><input className={styles.input} value={form.subjectExperienceDuration} onChange={set(form.setSubjectExperienceDuration)} disabled={isPending} maxLength={2000} /></Field>
            <Field label="현재 수준"><input className={styles.input} value={form.currentLevel} onChange={set(form.setCurrentLevel)} disabled={isPending} maxLength={2000} /></Field>
            <Field label="실제 등록 시 선호 시간대"><input className={styles.input} value={form.preferredRegularSchedule} onChange={set(form.setPreferredRegularSchedule)} disabled={isPending} maxLength={2000} /></Field>
            <Chips label="목표" value={form.goalType} onChange={form.setGoalType} options={["", "영재원", "고입", "입시", "대회", "흥미"].map(value => [value, value || "선택 안 함"])} />
            <Field label="목표 상세"><textarea className={styles.input} value={form.goalNote} onChange={set(form.setGoalNote)} disabled={isPending} maxLength={2000} /></Field>
          </> : null}
        </>}
      </> : null}

      {step === 3 ? <>
        <div className={ui.softBox}>
          <p className={ui.subtitle}>{classTitle}</p>
          <InfoLine icon="calendar" text={when} /><InfoLine icon="user" text={childLine} /><InfoLine icon="map-pin" text={placeLabel ?? ""} /><InfoLine icon="tag" text={priceLabel} />
        </div>
        <div className={styles.agreements}>
          <button type="button" role="checkbox" aria-checked={allChecked} disabled={isPending} onClick={toggleAll} className={`${styles.agreement} ${styles.allAgree}`}
            aria-label={showConsent ? "전체 동의, 선택 항목 포함" : "전체 동의"}>
            <AppIcon name={allChecked ? "check-square" : "square"} size={22} /><span className={styles.agreementText}>전체 동의{showConsent ? <span className={styles.allAgreeNote}>(선택 항목 포함)</span> : null}</span>
          </button>
          {agreements.map((label, index) => <button key={label} type="button" role="checkbox" aria-checked={required[index]} disabled={isPending} onClick={() => setRequired[index](!required[index])} className={styles.agreement}>
            <AppIcon name={required[index] ? "check-square" : "square"} size={22} /><span className={styles.agreementText}>{label}</span>
          </button>)}
          {showConsent ? <div className={styles.marketing}>
            <button type="button" role="checkbox" aria-checked={marketing} disabled={isPending} onClick={() => setMarketing(value => !value)} className={styles.agreement} aria-label={`선택, ${MARKETING_CONSENT_LABEL}`}>
              <AppIcon name={marketing ? "check-square" : "square"} size={22} /><span className={styles.agreementText}>(선택) {MARKETING_CONSENT_LABEL}</span>
            </button>
            <p className={styles.marketingHelp}>{MARKETING_CONSENT_HELP}</p>
          </div> : null}
        </div>
        {alreadyConsented ? <p className={ui.caption}>학원 소식을 받고 있어요 · 마이 › 학원 소식에서 바꿀 수 있어요</p> : null}
      </> : null}

      {message ? <p className={state.status === "error" || clientMessage ? ui.error : ui.caption} role="alert">{message}</p> : null}
      {state.status === "error" && state.message.includes("이미 신청한 내역") ?<Link href="/my/applications" className={ui.button} data-variant="secondary">신청 내역 확인</Link> : null}
    </div>

    <div className={styles.footer}>
      <div className={styles.footerRow}>
        {step > 1 ? <AppButton variant="secondary" disabled={isPending} onClick={() => go((step - 1) as Step)}>이전</AppButton> : null}
        {step < STEPS ? <AppButton disabled={nextDisabled} onClick={() => go((step + 1) as Step)}>다음</AppButton>
          : <AppButton type="submit" disabled={nextDisabled}>{isPending ? "신청 제출 중…" : submitLabel}</AppButton>}
      </div>
      {step === STEPS ? <p className={styles.footerNote}>신청하면 학원이 확인한 뒤 확정 알림을 보내드려요</p> : null}
    </div>

    <input type="hidden" name="selectedScheduleOptionId" value={selectedOptionId} />
    <input type="hidden" name="childId" value={selectedChildId} />
    <input type="hidden" name="childName" value={childName} />
    <input type="hidden" name="childGrade" value={childGrade} />
    <input type="hidden" name="childSchool" value={form.childSchool} />
    <input type="hidden" name="childNotes" value={form.childNotes} />
    <input type="hidden" name="subjectExperienceYn" value={form.subjectExperienceYn} />
    <input type="hidden" name="subjectExperienceDuration" value={form.subjectExperienceDuration} />
    <input type="hidden" name="currentLevel" value={form.currentLevel} />
    <input type="hidden" name="preferredRegularSchedule" value={form.preferredRegularSchedule} />
    <input type="hidden" name="goalType" value={form.goalType} />
    <input type="hidden" name="goalNote" value={form.goalNote} />
    <input type="hidden" name="memo" value={form.memo} />
    {privacyAgreed ? <input type="hidden" name="privacyAgreed" value="yes" /> : null}
    {thirdPartyAgreed ? <input type="hidden" name="thirdPartyAgreed" value="yes" /> : null}
    {guardianAgreed ? <input type="hidden" name="guardianAgreed" value="yes" /> : null}
  </form>
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return <label className={styles.field}><span className={styles.fieldLabel}>{label}{optional ? <span className={styles.optional}>선택</span> : null}</span>{children}</label>
}
function Chips({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <div className={styles.field} role="group" aria-label={label}><span className={styles.fieldLabel}>{label}</span>
    <div className={ui.chipRow}>{options.map(([option, text]) => <button key={option} type="button" className={ui.filterChip} aria-pressed={value === option} onClick={() => onChange(option)}>{text}</button>)}</div>
  </div>
}
function InfoLine({ icon, text }: { icon: AppIconName; text: string }) {
  if (!text) return null
  return <p className={`${ui.body} ${styles.infoLine}`}><AppIcon name={icon} size={16} /><span>{text}</span></p>
}
