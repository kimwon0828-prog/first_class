"use client"

import { useRouter } from "next/navigation"
import { Fragment, useActionState, useEffect, useMemo, useRef, useState } from "react"

import {
  formatStoredTargetGrades
} from "@/shared/constants/grade-options"
import { GRADE_BANDS, getSubjectLabel } from "@/shared/constants/education-taxonomy"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import {
  upsertStudioClassAction,
  type UpsertStudioClassActionState
} from "@/features/studio/actions/upsert-studio-class"
import { getStudioClassFieldExamples } from "@/features/studio/lib/studio-class-field-examples"
import { studioClassIntroTemplates } from "@/features/studio/lib/studio-class-intro-templates"
import {
  normalizeStudioClassSubjectOption,
  studioClassProgramTypeOptions,
  studioClassSubjectOptions,
  type StudioClassSubjectOption
} from "@/features/studio/lib/studio-class-options"
import {
  buildCreateClassScheduleDraftSlots,
  createDefaultCreateClassScheduleDraft,
  StudioClassCreateScheduleStep,
  type CreateClassScheduleDraft,
  type CreateClassScheduleDraftSlot
} from "@/features/studio/ui/studio-class-create-schedule-step"
import type {
  ClassAssignmentMode,
  ClassProgramType,
  StudioTeacherOption
} from "@/shared/lib/db/adapter"
import styles from "./studio-class-create-wizard.module.css"

type StudioClassCreateWizardProps = {
  organizationId: string
  organizationAcademyArea: string | null
  currentTeacherId: string
  teacherOptions: StudioTeacherOption[]
  teacherOptionsError: string | null
  createSuccessHref: string
}

type WizardStepId = 1 | 2 | 3 | 4

type VisibilityMode = "private" | "public"

type ClassModeOption = "오프라인 소그룹" | "1:1" | "온라인"

type DraftValues = {
  programType: ClassProgramType
  title: string
  subject: StudioClassSubjectOption | ""
  targetGrades: string[]
  classFormat: ClassModeOption | ""
  trialPrice: string
  description: string
  recommendedFor: string
  experiencePoints: string
  curriculum: string
  coverImageUrl: string
  assignmentMode: ClassAssignmentMode
  teacherId: string
  visibility: VisibilityMode
  scheduleDraft: CreateClassScheduleDraft
}

type StoredDraft = {
  version: 1 | 2
  step: WizardStepId
  values: DraftValues
  updatedAt: string
}

type ValidationErrors = Partial<Record<
  | "organizationRegion"
  | "programType"
  | "title"
  | "subject"
  | "targetGrades"
  | "classFormat"
  | "teacherId"
  | "description"
  | "slots"
  | "visibility",
  string
>>

const initialActionState: UpsertStudioClassActionState = {
  ok: false,
  message: ""
}

const stepDefinitions = [
  { id: 1 as const, title: "기본 정보", subtitle: "30초면 끝나요" },
  { id: 2 as const, title: "예약시간", subtitle: "이 수업의 핵심" },
  { id: 3 as const, title: "소개 문구", subtitle: "필수는 1개뿐" },
  { id: 4 as const, title: "확인 후 등록", subtitle: "학부모 화면 미리보기" }
]

const classModeOptions: ClassModeOption[] = ["오프라인 소그룹", "1:1", "온라인"]

const createDefaultDraftValues = (): DraftValues => ({
  programType: "trial_class",
  title: "",
  subject: "",
  targetGrades: [],
  classFormat: "",
  trialPrice: "",
  description: "",
  recommendedFor: "",
  experiencePoints: "",
  curriculum: "",
  coverImageUrl: "",
  assignmentMode: "post_assign",
  teacherId: "",
  visibility: "private",
  scheduleDraft: createDefaultCreateClassScheduleDraft()
})

const createDraftStorageKey = (organizationId: string) => `studio-class-create-draft:${organizationId}`

const formatProgramTypeLabel = (programType: ClassProgramType) =>
  studioClassProgramTypeOptions.find((option) => option.value === programType)?.label ?? "체험수업"

const formatSubjectLabel = (subject: StudioClassSubjectOption | "") => getSubjectLabel(subject) ?? "과목 선택"

const getNextStepLabel = (step: WizardStepId) => {
  if (step === 1) return "예약시간"
  if (step === 2) return "소개 문구"
  if (step === 3) return "확인 후 등록"
  return "프로그램 등록"
}

const formatSavedTimeLabel = (isoText: string | null) => {
  if (!isoText) {
    return "작성 내용은 자동으로 임시저장돼요"
  }

  try {
    return `자동 임시저장 ${new Intl.DateTimeFormat("ko-KR", {
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(isoText))}`
  } catch {
    return "작성 내용은 자동으로 임시저장돼요"
  }
}

const scrollToTop = () => {
  if (typeof window === "undefined") {
    return
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  window.scrollTo({
    top: 0,
    behavior: prefersReducedMotion ? "auto" : "smooth"
  })
}

const formatGeneratedSlotChip = (slot: CreateClassScheduleDraftSlot) => {
  return `${slot.specificDate} ${slot.startTime}~${slot.endTime}`
}

const parseStoredDraft = (raw: string | null): StoredDraft | null => {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredDraft
    if (!(parsed?.version === 1 || parsed?.version === 2) || !parsed.values) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const isLegacyEmptyOperatingHoursDraft = (value: Partial<CreateClassScheduleDraft>) => {
  const groups = Array.isArray(value.groups) ? value.groups : []
  const hasOperationDates = Boolean(value.operationStartDate || value.operationEndDate)
  const hasExtraData =
    (Array.isArray(value.extraSlots) && value.extraSlots.length > 0) ||
    (Array.isArray(value.closedDates) && value.closedDates.length > 0) ||
    (Array.isArray(value.closedSlotKeys) && value.closedSlotKeys.length > 0)

  if (hasOperationDates || hasExtraData) {
    return false
  }

  if (String(value.defaultCapacity ?? "") !== "3") {
    return false
  }

  if (groups.length === 0) {
    return true
  }

  return groups.every((group) =>
    Array.isArray(group.timeRanges)
      ? group.timeRanges.every(
          (range) =>
            !String(range.startTime ?? "").trim() &&
            !String(range.lastStartTime ?? "").trim() &&
            String(range.capacity ?? "") === "3"
        )
      : true
  )
}

const normalizeLoadedScheduleDraft = (value: unknown): CreateClassScheduleDraft => {
  const defaults = createDefaultCreateClassScheduleDraft()
  if (!value || typeof value !== "object") {
    return defaults
  }

  const candidate = value as Partial<CreateClassScheduleDraft>
  const shouldClearLegacyCapacity = isLegacyEmptyOperatingHoursDraft(candidate)
  const normalizedGroups = Array.isArray(candidate.groups)
    ? candidate.groups.map((group) => ({
        ...group,
        weekdays: Array.isArray(group.weekdays) ? group.weekdays : [],
        timeRanges: Array.isArray(group.timeRanges)
          ? group.timeRanges.map((range) => ({
              ...range,
              capacity:
                shouldClearLegacyCapacity && String(range.capacity ?? "") === "3" ? "" : String(range.capacity ?? "")
            }))
          : []
      }))
    : defaults.groups

  return {
    ...defaults,
    ...candidate,
    usePerTimeRangeCapacity: Boolean(candidate.usePerTimeRangeCapacity),
    defaultCapacity:
      shouldClearLegacyCapacity && String(candidate.defaultCapacity ?? "") === "3"
        ? ""
        : String(candidate.defaultCapacity ?? defaults.defaultCapacity),
    groups: normalizedGroups,
    extraSlots: Array.isArray(candidate.extraSlots) ? candidate.extraSlots : defaults.extraSlots,
    closedDates: Array.isArray(candidate.closedDates) ? candidate.closedDates : defaults.closedDates,
    closedSlotKeys: Array.isArray(candidate.closedSlotKeys) ? candidate.closedSlotKeys : defaults.closedSlotKeys
  }
}

const renderFieldError = (message: string | undefined) =>
  message ? (
    <p className={styles.errorText} role="alert">
      {message}
    </p>
  ) : null

export const StudioClassCreateWizard = ({
  organizationId,
  organizationAcademyArea,
  currentTeacherId,
  teacherOptions,
  teacherOptionsError,
  createSuccessHref
}: StudioClassCreateWizardProps) => {
  const router = useRouter()
  const safeTeacherOptions = useMemo(() => (Array.isArray(teacherOptions) ? teacherOptions : []), [teacherOptions])
  const [currentStep, setCurrentStep] = useState<WizardStepId>(1)
  const [values, setValues] = useState<DraftValues>(createDefaultDraftValues)
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({})
  const [draftStatus, setDraftStatus] = useState("작성 내용은 자동으로 임시저장돼요")
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const [coverImagePreviewUrl, setCoverImagePreviewUrl] = useState("")
  const [coverImageUploadError, setCoverImageUploadError] = useState<string | null>(null)
  const [isUploadingCoverImage, setIsUploadingCoverImage] = useState(false)
  const [state, formAction, isPending] = useActionState(upsertStudioClassAction, initialActionState)
  const draftHydratedRef = useRef(false)
  const draftStorageKey = useMemo(() => createDraftStorageKey(organizationId), [organizationId])

  const generatedScheduleSlots = useMemo(
    () => buildCreateClassScheduleDraftSlots(values.scheduleDraft),
    [values.scheduleDraft]
  )
  const fieldExamples = useMemo(() => getStudioClassFieldExamples(values.subject), [values.subject])
  const canPublish = generatedScheduleSlots.length > 0
  const selectedTeacherLabel =
    safeTeacherOptions.find((option) => option.teacherId === values.teacherId)?.teacherName ?? "미정"

  useEffect(() => {
    const parsed = parseStoredDraft(typeof window !== "undefined" ? window.localStorage.getItem(draftStorageKey) : null)
    if (parsed) {
      const normalizedSubject = normalizeStudioClassSubjectOption(parsed.values.subject) ?? ""
      setValues({
        ...createDefaultDraftValues(),
        ...parsed.values,
        subject: normalizedSubject,
        scheduleDraft: normalizeLoadedScheduleDraft(parsed.values.scheduleDraft)
      })
      setCurrentStep(parsed.step)
      setDraftSavedAt(parsed.updatedAt)
      setDraftStatus("브라우저 임시저장을 불러왔어요")
    }
    draftHydratedRef.current = true
  }, [draftStorageKey])

  useEffect(() => {
    if (values.assignmentMode !== "preassigned") {
      if (values.teacherId) {
        setValues((current) => ({ ...current, teacherId: "" }))
      }
      return
    }

    if (values.teacherId || safeTeacherOptions.length === 0) {
      return
    }

    const fallbackTeacherId =
      safeTeacherOptions.find((option) => option.teacherId === currentTeacherId)?.teacherId ??
      safeTeacherOptions[0]?.teacherId ??
      ""

    if (fallbackTeacherId) {
      setValues((current) => ({ ...current, teacherId: fallbackTeacherId }))
    }
  }, [currentTeacherId, safeTeacherOptions, values.assignmentMode, values.teacherId])

  useEffect(() => {
    if (!draftHydratedRef.current) {
      return
    }

    const timeout = window.setTimeout(() => {
      try {
        const payload: StoredDraft = {
          version: 2,
          step: currentStep,
          values,
          updatedAt: new Date().toISOString()
        }
        window.localStorage.setItem(draftStorageKey, JSON.stringify(payload))
        setDraftSavedAt(payload.updatedAt)
        setDraftStatus("브라우저에 자동 임시저장했어요")
      } catch {
        setDraftStatus("브라우저 임시저장에 실패했어요")
      }
    }, 700)

    return () => window.clearTimeout(timeout)
  }, [currentStep, draftStorageKey, values])

  useEffect(() => {
    if (values.visibility === "public" && !canPublish) {
      setValues((current) => ({ ...current, visibility: "private" }))
    }
  }, [canPublish, values.visibility])

  useEffect(() => {
    return () => {
      if (coverImagePreviewUrl) {
        URL.revokeObjectURL(coverImagePreviewUrl)
      }
    }
  }, [coverImagePreviewUrl])

  useEffect(() => {
    if (!state.ok) {
      return
    }

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftStorageKey)
      window.location.assign(createSuccessHref)
    } else {
      router.refresh()
    }
  }, [createSuccessHref, draftStorageKey, router, state.ok])

  const updateValue = <K extends keyof DraftValues>(key: K, nextValue: DraftValues[K]) => {
    setValues((current) => ({ ...current, [key]: nextValue }))
    setFieldErrors((current) => {
      if (!current[key as keyof ValidationErrors]) {
        return current
      }
      return { ...current, [key]: undefined }
    })
  }

  const toggleGrade = (grade: string) => {
    updateValue(
      "targetGrades",
      values.targetGrades.includes(grade)
        ? values.targetGrades.filter((item) => item !== grade)
        : [...values.targetGrades, grade]
    )
  }

  const saveDraftNow = () => {
    try {
      const payload: StoredDraft = {
        version: 2,
        step: currentStep,
        values,
        updatedAt: new Date().toISOString()
      }
      window.localStorage.setItem(draftStorageKey, JSON.stringify(payload))
      setDraftSavedAt(payload.updatedAt)
      setDraftStatus("브라우저에 임시저장했어요")
    } catch {
      setDraftStatus("브라우저 임시저장에 실패했어요")
    }
  }

  const validateStep = (step: WizardStepId): ValidationErrors => {
    const nextErrors: ValidationErrors = {}

    if (!organizationAcademyArea) {
      nextErrors.organizationRegion = "학원 프로필의 학원가 정보가 없어 저장할 수 없습니다. 학원 설정을 먼저 확인해 주세요."
    }

    if (step >= 1) {
      if (!values.programType) {
        nextErrors.programType = "프로그램 유형을 선택해 주세요."
      }
      if (values.title.trim().length < 2) {
        nextErrors.title = "프로그램명은 2자 이상 입력해 주세요."
      }
      if (!values.subject) {
        nextErrors.subject = "과목을 선택해 주세요."
      }
      if (values.targetGrades.length === 0) {
        nextErrors.targetGrades = "대상 학년을 1개 이상 선택해 주세요."
      }
      if (!values.classFormat) {
        nextErrors.classFormat = "수업 방식을 선택해 주세요."
      }
    }

    if (step >= 2) {
      if (values.assignmentMode === "preassigned" && !values.teacherId) {
        nextErrors.teacherId = "기본 담당을 미리 지정하려면 선생님을 선택해 주세요."
      }
    }

    if (step >= 3) {
      if (values.description.trim().length < 10) {
        nextErrors.description = "프로그램 소개는 10자 이상 입력해 주세요."
      }
    }

    if (step >= 4) {
      if (values.visibility === "public" && generatedScheduleSlots.length === 0) {
        nextErrors.visibility = "예약시간이 없어서 공개할 수 없어요."
        nextErrors.slots = "예약시간을 1개 이상 추가해야 바로 공개할 수 있어요."
      }
    }

    return nextErrors
  }

  const applyStepValidation = (step: WizardStepId) => {
    const nextErrors = validateStep(step)
    setFieldErrors(nextErrors)
    return nextErrors
  }

  const moveToStep = (nextStep: WizardStepId) => {
    setCurrentStep(nextStep)
    scrollToTop()
  }

  const handleStepChange = (nextStep: WizardStepId) => {
    if (nextStep <= currentStep) {
      moveToStep(nextStep)
      return
    }

    const errors = applyStepValidation(currentStep)
    if (Object.keys(errors).length > 0) {
      return
    }
    moveToStep(nextStep)
  }

  const handleNext = () => {
    const errors = applyStepValidation(currentStep)
    if (Object.keys(errors).length > 0) {
      return
    }

    if (currentStep < 4) {
      moveToStep((currentStep + 1) as WizardStepId)
    }
  }

  const handleFinalSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const errors = applyStepValidation(4)
    if (Object.keys(errors).length > 0) {
      event.preventDefault()
      if (errors.visibility || errors.slots) {
        moveToStep(2)
        return
      }
      if (errors.description) {
        moveToStep(3)
        return
      }
      moveToStep(1)
    }
  }

  const handleCoverImageChange = async (file: File | null) => {
    setCoverImageUploadError(null)

    if (coverImagePreviewUrl) {
      URL.revokeObjectURL(coverImagePreviewUrl)
      setCoverImagePreviewUrl("")
    }

    if (!file) {
      updateValue("coverImageUrl", "")
      return
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCoverImageUploadError("JPEG, PNG, WEBP 파일만 업로드할 수 있어요.")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setCoverImageUploadError("대표 이미지는 5MB 이하만 업로드할 수 있어요.")
      return
    }

    const filePreviewUrl = URL.createObjectURL(file)
    setCoverImagePreviewUrl(filePreviewUrl)

    const extension =
      file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : null

    if (!extension) {
      setCoverImageUploadError("JPEG, PNG, WEBP 파일만 업로드할 수 있어요.")
      return
    }

    setIsUploadingCoverImage(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const path = `${organizationId}/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from("class-covers").upload(path, file, {
        contentType: file.type,
        upsert: false
      })

      if (error) {
        throw error
      }

      const {
        data: { publicUrl }
      } = supabase.storage.from("class-covers").getPublicUrl(path)

      if (!publicUrl) {
        throw new Error("public_url_missing")
      }

      updateValue("coverImageUrl", publicUrl)
    } catch (error) {
      setCoverImageUploadError(
        error instanceof Error ? `대표 이미지 업로드에 실패했어요: ${error.message}` : "대표 이미지 업로드에 실패했어요."
      )
    } finally {
      setIsUploadingCoverImage(false)
    }
  }

  const applyIntroTemplate = () => {
    if (!values.subject) {
      setFieldErrors((current) => ({ ...current, subject: "예시 문구를 넣으려면 먼저 과목을 선택해 주세요." }))
      setCurrentStep(1)
      return
    }

    updateValue("description", studioClassIntroTemplates[values.subject])
    setFieldErrors((current) => ({ ...current, description: undefined }))
  }

  const previewTitle = values.title.trim() || "프로그램명이 여기에 표시돼요"
  const previewDescription = values.description.trim() || "프로그램 소개를 입력하면 학부모 화면 미리보기에 바로 반영됩니다."
  const previewMeta = [
    values.subject ? formatSubjectLabel(values.subject) : "과목 선택",
    values.targetGrades.length > 0 ? formatStoredTargetGrades(values.targetGrades.join(",")) : "대상 학년 선택",
    values.classFormat || "수업 방식 선택"
  ]
  const previewCta = values.programType === "level_test" ? "레벨테스트 신청하기" : "체험수업 신청하기"

  return (
    <form className={styles.form} action={formAction} onSubmit={handleFinalSubmit}>
      <input type="hidden" name="mode" value="create" />
      <input type="hidden" name="programType" value={values.programType} />
      <input type="hidden" name="title" value={values.title} />
      <input type="hidden" name="subject" value={values.subject} />
      <input type="hidden" name="region" value={organizationAcademyArea ?? ""} />
      <input type="hidden" name="description" value={values.description} />
      <input type="hidden" name="classFormat" value={values.classFormat} />
      <input type="hidden" name="recommendedFor" value={values.recommendedFor} />
      <input type="hidden" name="experiencePoints" value={values.experiencePoints} />
      <input type="hidden" name="curriculum" value={values.curriculum} />
      <input type="hidden" name="trialPrice" value={values.trialPrice.trim() || "0"} />
      <input type="hidden" name="assignmentMode" value={values.assignmentMode} />
      <input type="hidden" name="teacherId" value={values.teacherId} />
      <input type="hidden" name="coverImageUrl" value={values.coverImageUrl} />
      <input type="hidden" name="enforcePublicSlotGuard" value="true" />
      {values.visibility === "public" ? <input type="hidden" name="isActive" value="on" /> : null}
      {values.targetGrades.map((grade) => (
        <input key={grade} type="hidden" name="targetGrades" value={grade} />
      ))}
      {generatedScheduleSlots.map((slot) => {
        return (
          <Fragment key={slot.id}>
            <input type="hidden" name="slotId" value="" />
            <input type="hidden" name="slotScheduleType" value="one_time" />
            <input type="hidden" name="slotDayOfWeek" value="" />
            <input type="hidden" name="slotSpecificDate" value={slot.specificDate} />
            <input type="hidden" name="slotSeriesId" value={slot.seriesId ?? ""} />
            <input type="hidden" name="slotBookingStatus" value={slot.bookingStatus} />
            <input type="hidden" name="slotStartTime" value={slot.startTime} />
            <input type="hidden" name="slotEndTime" value={slot.endTime} />
            <input type="hidden" name="slotCapacity" value={slot.capacity} />
            <input type="hidden" name="slotDisplayLabel" value="" />
          </Fragment>
        )
      })}

      <section className={styles.stepIndicatorCard}>
        <ol className={styles.stepIndicatorList}>
          {stepDefinitions.map((step) => {
            const isActive = currentStep === step.id
            const isCompleted = currentStep > step.id
            return (
              <li key={step.id}>
                <button
                  type="button"
                  className={`${styles.stepButton} ${isActive ? styles.stepButtonActive : ""} ${
                    isCompleted ? styles.stepButtonCompleted : ""
                  }`}
                  onClick={() => handleStepChange(step.id)}
                >
                  <span className={styles.stepNumber}>{step.id}</span>
                  <span className={styles.stepTextGroup}>
                    <span className={styles.stepTitle}>{step.title}</span>
                    <span className={styles.stepSubtitle}>{step.subtitle}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      {state.message ? (
        <section className={`${styles.feedbackCard} ${state.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {state.message}
        </section>
      ) : null}

      {currentStep === 1 ? (
        <section className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div>
              <p className={styles.stepEyebrow}>STEP 1</p>
              <h2 className={styles.stepTitleText}>기본 정보</h2>
              <p className={styles.stepDescription}>유형, 이름, 과목, 학년, 수업 방식을 먼저 정리해 주세요.</p>
            </div>
          </div>

          {renderFieldError(fieldErrors.organizationRegion)}

          <div className={styles.fieldBlock}>
            <div className={styles.labelRow}>
              <label className={styles.fieldLabel}>프로그램 유형 *</label>
            </div>
            <div className={styles.chipRow}>
              {studioClassProgramTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.choiceChip} ${values.programType === option.value ? styles.choiceChipSelected : ""}`}
                  onClick={() => updateValue("programType", option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {renderFieldError(fieldErrors.programType)}
          </div>

          <div className={styles.fieldBlock}>
            <label className={styles.fieldLabel} htmlFor="class-title">
              프로그램명 *
            </label>
            <input
              id="class-title"
              value={values.title}
              onChange={(event) => updateValue("title", event.target.value)}
              className={styles.input}
              placeholder={fieldExamples.title}
              maxLength={60}
            />
            <p className={styles.helperText}>과목명보다 아이가 하게 될 활동이 드러나면 좋아요.</p>
            {renderFieldError(fieldErrors.title)}
          </div>

          <div className={styles.fieldBlock}>
            <label className={styles.fieldLabel}>과목 *</label>
            <div className={styles.chipRow}>
              {studioClassSubjectOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.choiceChip} ${values.subject === option ? styles.choiceChipSelected : ""}`}
                  onClick={() => updateValue("subject", option)}
                >
                  {formatSubjectLabel(option)}
                </button>
              ))}
            </div>
            {renderFieldError(fieldErrors.subject)}
          </div>

          <div className={styles.fieldBlock}>
            <label className={styles.fieldLabel}>대상 학년 *</label>
            <div className={styles.chipRow}>
              {GRADE_BANDS.map((grade) => (
                <button
                  key={grade.value}
                  type="button"
                  className={`${styles.choiceChip} ${values.targetGrades.includes(grade.value) ? styles.choiceChipSelected : ""}`}
                  onClick={() => toggleGrade(grade.value)}
                >
                  {grade.label}
                </button>
              ))}
            </div>
            {renderFieldError(fieldErrors.targetGrades)}
          </div>

          <div className={styles.fieldBlock}>
            <div className={styles.labelRow}>
              <label className={styles.fieldLabel}>수업 방식 *</label>
            </div>
            <div className={styles.chipRow}>
              {classModeOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.choiceChip} ${values.classFormat === option ? styles.choiceChipSelected : ""}`}
                  onClick={() => updateValue("classFormat", option)}
                >
                  {option}
                </button>
              ))}
            </div>
            {renderFieldError(fieldErrors.classFormat)}
          </div>

          <div className={styles.fieldBlock}>
            <div className={styles.labelRow}>
              <label className={styles.fieldLabel} htmlFor="trial-price">
                신청비
              </label>
              <span className={styles.optionalBadge}>선택</span>
            </div>
            <input
              id="trial-price"
              type="number"
              min={0}
              step={1000}
              value={values.trialPrice}
              onChange={(event) => updateValue("trialPrice", event.target.value)}
              className={styles.input}
              placeholder="무료면 비워두세요"
            />
          </div>
        </section>
      ) : null}

      {currentStep === 2 ? (
        <>
          <StudioClassCreateScheduleStep
            scheduleDraft={values.scheduleDraft}
            slotsError={fieldErrors.slots}
            onChange={(next) => {
              setValues((current) => ({ ...current, scheduleDraft: next }))
              setFieldErrors((current) => ({ ...current, slots: undefined, visibility: undefined }))
            }}
          />
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>B. 담당 선생님 배정 방식</h3>
                <p className={styles.sectionDescription}>신청 후 배정할지, 기본 담당을 미리 지정할지 선택해 주세요.</p>
              </div>
            </div>

            <div className={styles.assignmentGrid}>
              <button
                type="button"
                className={`${styles.assignmentCard} ${
                  values.assignmentMode === "post_assign" ? styles.assignmentCardSelected : ""
                }`}
                onClick={() => updateValue("assignmentMode", "post_assign")}
              >
                <strong>신청 후 직접 배정</strong>
                <span>신청 생성 시 담당을 비워두고, 신청 상세에서 나중에 배정합니다.</span>
              </button>
              <button
                type="button"
                className={`${styles.assignmentCard} ${
                  values.assignmentMode === "preassigned" ? styles.assignmentCardSelected : ""
                }`}
                onClick={() => updateValue("assignmentMode", "preassigned")}
              >
                <strong>기본 담당 미리 지정</strong>
                <span>기본 담당을 정해두면 신청 생성 시 자동으로 배정합니다.</span>
              </button>
            </div>

            {values.assignmentMode === "preassigned" ? (
              <div className={styles.fieldBlock}>
                <label className={styles.fieldLabel} htmlFor="default-teacher">
                  기본 담당 선생님 *
                </label>
                {safeTeacherOptions.length > 0 ? (
                  <select
                    id="default-teacher"
                    className={styles.input}
                    value={values.teacherId}
                    onChange={(event) => updateValue("teacherId", event.target.value)}
                  >
                    <option value="">선생님 선택</option>
                    {safeTeacherOptions.map((option) => (
                      <option key={option.teacherId} value={option.teacherId}>
                        {option.teacherName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className={styles.emptyState}>등록된 선생님이 없어 기본 담당을 미리 지정할 수 없어요.</div>
                )}
                <p className={styles.helperText}>
                  {teacherOptionsError
                    ? teacherOptionsError
                    : "기본 담당을 정해두면 신청이 들어왔을 때 자동으로 담당자가 채워집니다."}
                </p>
                {renderFieldError(fieldErrors.teacherId)}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {currentStep === 3 ? (
        <section className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div>
              <p className={styles.stepEyebrow}>STEP 3</p>
              <h2 className={styles.stepTitleText}>소개 문구</h2>
              <p className={styles.stepDescription}>학부모가 수업 내용을 쉽게 이해할 수 있도록 프로그램의 특징과 진행 내용을 작성해 주세요.</p>
            </div>
          </div>

          <div className={styles.fieldBlock}>
            <div className={styles.labelRow}>
              <label className={styles.fieldLabel} htmlFor="class-description">
                프로그램 소개 *
              </label>
              <button type="button" className={styles.secondaryInlineButton} onClick={applyIntroTemplate}>
                ✨ 예시 문구 넣기
              </button>
            </div>
            <textarea
              id="class-description"
              className={styles.textarea}
              rows={6}
              value={values.description}
              onChange={(event) => updateValue("description", event.target.value)}
              placeholder={fieldExamples.description}
            />
            {renderFieldError(fieldErrors.description)}
          </div>

          <div className={styles.fieldBlock}>
            <div className={styles.labelRow}>
              <label className={styles.fieldLabel} htmlFor="class-recommended-for">
                이런 아이에게 추천해요
              </label>
              <span className={styles.optionalBadge}>선택</span>
            </div>
            <p className={styles.helperText}>필요한 경우에만 입력해 주세요.</p>
            <textarea
              id="class-recommended-for"
              className={styles.textarea}
              rows={5}
              value={values.recommendedFor}
              onChange={(event) => updateValue("recommendedFor", event.target.value)}
              placeholder={fieldExamples.recommendedFor}
            />
          </div>

          <div className={styles.fieldBlock}>
            <div className={styles.labelRow}>
              <label className={styles.fieldLabel} htmlFor="class-experience-points">
                이 수업에서 경험하는 것
              </label>
              <span className={styles.optionalBadge}>선택</span>
            </div>
            <p className={styles.helperText}>필요한 경우에만 입력해 주세요.</p>
            <textarea
              id="class-experience-points"
              className={styles.textarea}
              rows={5}
              value={values.experiencePoints}
              onChange={(event) => updateValue("experiencePoints", event.target.value)}
              placeholder={fieldExamples.experiencePoints}
            />
          </div>

          <div className={styles.fieldBlock}>
            <div className={styles.labelRow}>
              <label className={styles.fieldLabel} htmlFor="class-curriculum">
                커리큘럼
              </label>
              <span className={styles.optionalBadge}>선택</span>
            </div>
            <p className={styles.helperText}>필요한 경우에만 입력해 주세요.</p>
            <textarea
              id="class-curriculum"
              className={styles.textarea}
              rows={5}
              value={values.curriculum}
              onChange={(event) => updateValue("curriculum", event.target.value)}
              placeholder={fieldExamples.curriculum}
            />
          </div>

          <div className={styles.fieldBlock}>
            <div className={styles.labelRow}>
              <span className={styles.fieldLabel}>대표 이미지</span>
              <span className={styles.optionalBadge}>선택</span>
            </div>
            <p className={styles.helperText}>권장 크기 1200 × 900px · 4:3 비율</p>
            <p className={styles.helperText}>
              JPG, PNG 또는 WebP 이미지를 사용할 수 있어요. 중요한 인물이나 문구는 이미지 중앙에 배치해 주세요.
            </p>
            <p className={styles.helperText}>5MB 이하 이미지만 업로드할 수 있어요. 없으면 과목 기본 이미지로 보입니다.</p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={styles.fileInput}
              disabled={isUploadingCoverImage || isPending}
              onChange={(event) => {
                const file = event.target.files?.[0]
                void handleCoverImageChange(file ?? null)
              }}
            />
            {coverImageUploadError ? renderFieldError(coverImageUploadError) : null}
            <div className={styles.imagePreview}>
              {coverImagePreviewUrl || values.coverImageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverImagePreviewUrl || values.coverImageUrl}
                    alt="대표 이미지 미리보기"
                    className={styles.imagePreviewImage}
                  />
                </>
              ) : (
                <span className={styles.imagePreviewPlaceholder}>대표 이미지 미리보기</span>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {currentStep === 4 ? (
        <section className={styles.reviewGrid}>
          <section className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <div>
                <p className={styles.stepEyebrow}>STEP 4</p>
                <h2 className={styles.stepTitleText}>확인 후 등록</h2>
                <p className={styles.stepDescription}>입력한 정보를 점검하고, 비공개 또는 바로 공개로 저장해 주세요.</p>
              </div>
            </div>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3 className={styles.sectionTitle}>체크리스트</h3>
                  <p className={styles.sectionDescription}>미완성 항목은 해당 단계로 바로 이동해 수정할 수 있어요.</p>
                </div>
              </div>
              <ul className={styles.checkList}>
                <li className={styles.checkItem}>
                  <span className={values.title.trim() ? styles.checkOk : styles.checkPending}>
                    {values.title.trim() ? "완료" : "미완료"}
                  </span>
                  <div className={styles.checkBody}>
                    <strong>프로그램명</strong>
                    <span>{values.title.trim() || "1단계에서 프로그램명을 입력해 주세요."}</span>
                  </div>
                  <button type="button" className={styles.jumpButton} onClick={() => moveToStep(1)}>
                    1단계로 이동
                  </button>
                </li>
                <li className={styles.checkItem}>
                  <span
                    className={
                      values.subject && values.targetGrades.length > 0 && values.classFormat
                        ? styles.checkOk
                        : styles.checkPending
                    }
                  >
                    {values.subject && values.targetGrades.length > 0 && values.classFormat ? "완료" : "미완료"}
                  </span>
                  <div className={styles.checkBody}>
                    <strong>과목 · 학년 · 수업방식</strong>
                    <span>
                      {values.subject && values.targetGrades.length > 0 && values.classFormat
                        ? `${formatSubjectLabel(values.subject)} · ${formatStoredTargetGrades(
                            values.targetGrades.join(",")
                          )} · ${values.classFormat}`
                        : "1단계에서 과목, 대상 학년, 수업 방식을 채워 주세요."}
                    </span>
                  </div>
                  <button type="button" className={styles.jumpButton} onClick={() => moveToStep(1)}>
                    1단계로 이동
                  </button>
                </li>
                <li className={styles.checkItem}>
                  <span className={generatedScheduleSlots.length > 0 ? styles.checkOk : styles.checkPending}>
                    {generatedScheduleSlots.length > 0 ? "완료" : "미완료"}
                  </span>
                  <div className={styles.checkBody}>
                    <strong>생성 예정 일정 {generatedScheduleSlots.length}개</strong>
                    <span>
                      {generatedScheduleSlots.length > 0
                        ? generatedScheduleSlots.slice(0, 6).map((slot) => formatGeneratedSlotChip(slot)).join(" / ")
                        : "2단계에서 기본 운영시간을 설정해 주세요."}
                    </span>
                  </div>
                  <button type="button" className={styles.jumpButton} onClick={() => moveToStep(2)}>
                    2단계로 이동
                  </button>
                </li>
                <li className={styles.checkItem}>
                  <span className={values.description.trim().length >= 10 ? styles.checkOk : styles.checkPending}>
                    {values.description.trim().length >= 10 ? "완료" : "미완료"}
                  </span>
                  <div className={styles.checkBody}>
                    <strong>프로그램 소개</strong>
                    <span>
                      {values.description.trim().length >= 10
                        ? "학부모 화면 미리보기에 반영됩니다."
                        : "3단계에서 프로그램 소개를 10자 이상 작성해 주세요."}
                    </span>
                  </div>
                  <button type="button" className={styles.jumpButton} onClick={() => moveToStep(3)}>
                    3단계로 이동
                  </button>
                </li>
              </ul>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3 className={styles.sectionTitle}>저장 방식</h3>
                  <p className={styles.sectionDescription}>처음에는 비공개로 저장한 뒤 내용을 확인하고 공개 전환하는 것을 권장합니다.</p>
                </div>
              </div>
              <div className={styles.assignmentGrid}>
                <button
                  type="button"
                  className={`${styles.assignmentCard} ${
                    values.visibility === "private" ? styles.assignmentCardSelected : ""
                  }`}
                  onClick={() => updateValue("visibility", "private")}
                >
                  <strong>비공개로 저장</strong>
                  <span>학부모에게 보이지 않습니다. 수업 관리에서 나중에 공개할 수 있어요.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.assignmentCard} ${
                    values.visibility === "public" ? styles.assignmentCardSelected : ""
                  } ${!canPublish ? styles.assignmentCardDisabled : ""}`}
                  onClick={() => {
                    if (canPublish) {
                      updateValue("visibility", "public")
                    }
                  }}
                  disabled={!canPublish}
                >
                  <strong>바로 공개</strong>
                  <span>저장 즉시 학부모에게 노출됩니다.</span>
                  {!canPublish ? (
                    <em className={styles.disabledReason}>예약시간이 없어서 공개할 수 없어요.</em>
                  ) : null}
                </button>
              </div>
              {renderFieldError(fieldErrors.visibility)}
            </section>
          </section>

          <aside className={styles.previewCard}>
            <div className={styles.previewImageArea}>
              {coverImagePreviewUrl || values.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverImagePreviewUrl || values.coverImageUrl}
                  alt="학부모 화면 미리보기"
                  className={styles.previewImage}
                />
              ) : (
                <div className={styles.previewFallback}>{values.subject ? formatSubjectLabel(values.subject) : "대표 이미지"}</div>
              )}
            </div>

            <div className={styles.previewBody}>
              <span className={styles.previewProgramBadge}>{formatProgramTypeLabel(values.programType)}</span>
              <h3 className={styles.previewHeading}>{previewTitle}</h3>
              <p className={styles.previewMeta}>{previewMeta.join(" · ")}</p>
              <p className={styles.previewDescription}>{previewDescription}</p>

              <div className={styles.previewSlotList}>
                {generatedScheduleSlots.length > 0 ? (
                  generatedScheduleSlots.slice(0, 4).map((slot) => (
                    <span key={slot.id} className={styles.previewSlotChip}>
                      {formatGeneratedSlotChip(slot)}
                    </span>
                  ))
                ) : (
                  <span className={styles.previewSlotEmpty}>예약시간을 추가하면 여기에 표시됩니다.</span>
                )}
              </div>

              <div className={styles.previewTeacherMeta}>
                <span>배정 방식: {values.assignmentMode === "preassigned" ? "기본 담당 미리 지정" : "신청 후 직접 배정"}</span>
                {values.assignmentMode === "preassigned" ? <span>기본 담당: {selectedTeacherLabel}</span> : null}
              </div>

              <button type="button" className={styles.previewCta} disabled>
                {previewCta}
              </button>
            </div>
          </aside>
        </section>
      ) : null}

      <div className={styles.stickyBar}>
        <div className={styles.stickyLeft}>
          <button type="button" className={styles.secondaryActionButton} onClick={saveDraftNow} disabled={isPending}>
            임시저장
          </button>
          <div className={styles.stickyHint}>
            <span>{draftStatus}</span>
            <span>{formatSavedTimeLabel(draftSavedAt)}</span>
          </div>
        </div>

        <div className={styles.stickyActions}>
          {currentStep > 1 ? (
            <button
              type="button"
              className={styles.secondaryActionButton}
              onClick={() => moveToStep((currentStep - 1) as WizardStepId)}
              disabled={isPending}
            >
              이전
            </button>
          ) : null}

          {currentStep < 4 ? (
            <button type="button" className={styles.primaryActionButton} onClick={handleNext} disabled={isPending}>
              다음 - {getNextStepLabel(currentStep)}
            </button>
          ) : (
            <button type="submit" className={styles.primaryActionButton} disabled={isPending || isUploadingCoverImage}>
              {isPending ? "등록 중..." : "프로그램 등록"}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
