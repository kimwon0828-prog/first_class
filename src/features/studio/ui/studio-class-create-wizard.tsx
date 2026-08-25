"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, useActionState, useEffect, useMemo, useRef, useState } from "react"

import {
  formatStoredTargetGrades
} from "@/shared/constants/grade-options"
import {
  LEARNER_GRADES,
  LEARNER_GRADE_GROUPS,
  getLearnerGradesByGroup
} from "@/shared/constants/education-taxonomy"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import {
  upsertStudioClassAction,
  type UpsertStudioClassActionState
} from "@/features/studio/actions/upsert-studio-class"
import { getStudioClassFieldExamples } from "@/features/studio/lib/studio-class-field-examples"
import { studioClassIntroTemplates } from "@/features/studio/lib/studio-class-intro-templates"
import {
  normalizeStudioClassSubjectOption,
  studioClassProgramTypeOptions
} from "@/features/studio/lib/studio-class-options"
import {
  buildCreateClassScheduleDraftSlots,
  createDefaultCreateClassScheduleDraft,
  StudioClassCreateScheduleStep,
  type CreateClassScheduleDraft
} from "@/features/studio/ui/studio-class-create-schedule-step"
import { StudioSubjectSelector } from "@/features/studio/ui/studio-subject-selector"
import type {
  ClassAssignmentMode,
  ClassProgramType,
  StudioTeacherOption
} from "@/shared/lib/db/adapter"
import {
  findSubjectCatalogCategory,
  findSubjectCatalogSelection,
  type SubjectCatalogCategory
} from "@/shared/lib/subject-master"
import styles from "./studio-class-create-wizard.module.css"

type StudioClassCreateWizardProps = {
  organizationId: string
  organizationAcademyArea: string | null
  currentTeacherId: string
  teacherOptions: StudioTeacherOption[]
  teacherOptionsError: string | null
  subjectCatalog: SubjectCatalogCategory[]
  subjectCatalogError: string | null
  createSuccessHref: string
}

type WizardStepId = 1 | 2 | 3 | 4

type VisibilityMode = "private" | "public"

type CreateFormTabId = "info" | "schedule" | "visibility"

type DraftValues = {
  programType: ClassProgramType
  title: string
  subjectCategoryId: string
  subjectId: string
  targetGrades: string[]
  classFormat: string
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
  version: 1 | 2 | 3 | 4
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

const createFormTabs: Array<{ id: CreateFormTabId; label: string }> = [
  { id: "info", label: "수업 정보" },
  { id: "schedule", label: "예약 시간" },
  { id: "visibility", label: "공개 · 신청 설정" }
]

const classFormatOptions = [
  "1:1 개별수업",
  "개별진도 수업",
  "소수정예 수업",
  "그룹수업",
  "기타"
] as const

const customClassFormatOptionValue = "__custom__"

const resolveClassFormatSelection = (value: string) => {
  const normalized = value.trim()

  if (!normalized) {
    return ""
  }

  return classFormatOptions.includes(normalized as (typeof classFormatOptions)[number])
    ? normalized
    : customClassFormatOptionValue
}

const createDefaultDraftValues = (): DraftValues => ({
  programType: "trial_class",
  title: "",
  subjectCategoryId: "",
  subjectId: "",
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

const LEARNER_GRADE_ORDER: string[] = LEARNER_GRADES.map((item) => item.value)

const getOrderedTargetGrades = (values: readonly string[]) => {
  const selectedSet = new Set(values)
  return LEARNER_GRADE_ORDER.filter((value) => selectedSet.has(value))
}

const getTargetGradeRange = (start: string, end: string) => {
  const startIndex = LEARNER_GRADE_ORDER.indexOf(start)
  const endIndex = LEARNER_GRADE_ORDER.indexOf(end)

  if (startIndex < 0 || endIndex < 0) {
    return start ? [start] : []
  }

  const rangeStart = Math.min(startIndex, endIndex)
  const rangeEnd = Math.max(startIndex, endIndex)
  return LEARNER_GRADE_ORDER.slice(rangeStart, rangeEnd + 1)
}

const getTabForStep = (step: WizardStepId): CreateFormTabId => {
  if (step === 1) {
    return "info"
  }

  if (step === 2) {
    return "schedule"
  }

  return "visibility"
}

const getStepForTab = (tab: CreateFormTabId): WizardStepId => {
  if (tab === "info") {
    return 1
  }

  if (tab === "schedule") {
    return 2
  }

  return 3
}

const normalizeCurrentStep = (step: WizardStepId): WizardStepId => (step === 4 ? 3 : step)

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

const parseStoredDraft = (raw: string | null): StoredDraft | null => {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredDraft
    if (
      !(
        parsed?.version === 1 ||
        parsed?.version === 2 ||
        parsed?.version === 3 ||
        parsed?.version === 4
      ) ||
      !parsed.values
    ) {
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
  subjectCatalog,
  subjectCatalogError,
  createSuccessHref
}: StudioClassCreateWizardProps) => {
  const router = useRouter()
  const safeTeacherOptions = useMemo(() => (Array.isArray(teacherOptions) ? teacherOptions : []), [teacherOptions])
  const safeSubjectCatalog = useMemo(
    () => (Array.isArray(subjectCatalog) ? subjectCatalog : []),
    [subjectCatalog]
  )
  const [currentStep, setCurrentStep] = useState<WizardStepId>(1)
  const [values, setValues] = useState<DraftValues>(createDefaultDraftValues)
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({})
  const [coverImagePreviewUrl, setCoverImagePreviewUrl] = useState("")
  const [coverImageUploadError, setCoverImageUploadError] = useState<string | null>(null)
  const [isUploadingCoverImage, setIsUploadingCoverImage] = useState(false)
  const [classFormatSelection, setClassFormatSelection] = useState("")
  const [customClassFormat, setCustomClassFormat] = useState("")
  const [targetGradeRangeStart, setTargetGradeRangeStart] = useState<string | null>(null)
  const [state, formAction, isPending] = useActionState(upsertStudioClassAction, initialActionState)
  const draftHydratedRef = useRef(false)
  const draftStorageKey = useMemo(() => createDraftStorageKey(organizationId), [organizationId])

  const generatedScheduleSlots = useMemo(
    () => buildCreateClassScheduleDraftSlots(values.scheduleDraft),
    [values.scheduleDraft]
  )
  const selectedSubjectSelection = useMemo(
    () => findSubjectCatalogSelection(safeSubjectCatalog, values.subjectId),
    [safeSubjectCatalog, values.subjectId]
  )
  const selectedSubjectCategory = useMemo(
    () => findSubjectCatalogCategory(safeSubjectCatalog, values.subjectCategoryId),
    [safeSubjectCatalog, values.subjectCategoryId]
  )
  const fieldExamples = useMemo(
    () => getStudioClassFieldExamples(selectedSubjectSelection?.subject.code),
    [selectedSubjectSelection?.subject.code]
  )
  const canPublish = generatedScheduleSlots.length > 0

  useEffect(() => {
    const parsed = parseStoredDraft(typeof window !== "undefined" ? window.localStorage.getItem(draftStorageKey) : null)
    if (parsed) {
      const restoredValues = { ...parsed.values } as DraftValues & { subject?: unknown }
      delete restoredValues.subject
      const restoredSubjectSelection =
        parsed.version >= 3
          ? findSubjectCatalogSelection(safeSubjectCatalog, restoredValues.subjectId)
          : null
      const restoredCategory =
        parsed.version === 4
          ? findSubjectCatalogCategory(safeSubjectCatalog, restoredValues.subjectCategoryId)
          : restoredSubjectSelection?.category ?? null
      const restoredSubject =
        restoredSubjectSelection &&
        restoredSubjectSelection.category.id === restoredCategory?.id
          ? restoredSubjectSelection.subject
          : null
      const normalizedClassFormat = String(restoredValues.classFormat ?? "")
      const nextClassFormatSelection = resolveClassFormatSelection(normalizedClassFormat)
      setValues({
        ...createDefaultDraftValues(),
        ...restoredValues,
        subjectCategoryId: restoredCategory?.id ?? "",
        subjectId: restoredSubject?.id ?? "",
        classFormat: normalizedClassFormat,
        scheduleDraft: normalizeLoadedScheduleDraft(restoredValues.scheduleDraft)
      })
      setClassFormatSelection(nextClassFormatSelection)
      setCustomClassFormat(
        nextClassFormatSelection === customClassFormatOptionValue ? normalizedClassFormat : ""
      )
      setCurrentStep(normalizeCurrentStep(parsed.step))
    } else {
      setClassFormatSelection("")
      setCustomClassFormat("")
    }
    draftHydratedRef.current = true
  }, [draftStorageKey, safeSubjectCatalog])

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
          version: 4,
          step: normalizeCurrentStep(currentStep),
          values,
          updatedAt: new Date().toISOString()
        }
        window.localStorage.setItem(draftStorageKey, JSON.stringify(payload))
      } catch {}
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
    const orderedTargetGrades = getOrderedTargetGrades(values.targetGrades)
    setTargetGradeRangeStart(orderedTargetGrades[0] ?? null)
  }, [values.targetGrades])

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

  const updateSubjectCategoryId = (categoryId: string) => {
    updateValue("subjectCategoryId", categoryId)
    setFieldErrors((current) => ({ ...current, subject: undefined }))
  }

  const updateSubjectId = (subjectId: string) => {
    updateValue("subjectId", subjectId)
    setFieldErrors((current) => ({ ...current, subject: undefined }))
  }

  const toggleGrade = (grade: string) => {
    const orderedTargetGrades = getOrderedTargetGrades(values.targetGrades)
    const hasCompletedRange = orderedTargetGrades.length > 1

    if (orderedTargetGrades.length === 0 || !targetGradeRangeStart || hasCompletedRange) {
      setTargetGradeRangeStart(grade)
      updateValue("targetGrades", [grade])
      return
    }

    updateValue("targetGrades", getTargetGradeRange(targetGradeRangeStart, grade))
  }

  const handleClassFormatSelectionChange = (nextSelection: string) => {
    setClassFormatSelection(nextSelection)

    if (nextSelection === customClassFormatOptionValue) {
      updateValue("classFormat", customClassFormat)
      return
    }

    updateValue("classFormat", nextSelection)
  }

  const handleCustomClassFormatChange = (nextValue: string) => {
    setCustomClassFormat(nextValue)
    updateValue("classFormat", nextValue)
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
      if (!values.subjectCategoryId) {
        nextErrors.subject = "과목을 선택해 주세요."
      }
      if (values.targetGrades.length === 0) {
        nextErrors.targetGrades = "대상 학년을 1개 이상 선택해 주세요."
      }
      if (!values.classFormat.trim()) {
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

  const resolveStepForErrors = (errors: ValidationErrors): WizardStepId => {
    if (
      errors.organizationRegion ||
      errors.title ||
      errors.subject ||
      errors.targetGrades ||
      errors.classFormat ||
      errors.description
    ) {
      return 1
    }

    if (errors.teacherId) {
      return 2
    }

    if (errors.programType || errors.visibility || errors.slots) {
      return 3
    }

    return 1
  }

  const moveToStep = (nextStep: WizardStepId) => {
    setCurrentStep(normalizeCurrentStep(nextStep))
    scrollToTop()
  }

  const handleFinalSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const errors = applyStepValidation(4)
    if (Object.keys(errors).length > 0) {
      event.preventDefault()
      moveToStep(resolveStepForErrors(errors))
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
    if (!selectedSubjectSelection) {
      setFieldErrors((current) => ({ ...current, subject: "예시 문구를 넣으려면 먼저 과목을 선택해 주세요." }))
      setCurrentStep(1)
      return
    }

    const legacyTemplateSubject = normalizeStudioClassSubjectOption(
      selectedSubjectSelection.subject.code
    )
    updateValue(
      "description",
      legacyTemplateSubject
        ? studioClassIntroTemplates[legacyTemplateSubject]
        : fieldExamples.description
    )
    setFieldErrors((current) => ({ ...current, description: undefined }))
  }

  const previewTitle = values.title.trim() || "프로그램명이 여기에 표시돼요"
  const previewImageUrl = coverImagePreviewUrl || values.coverImageUrl
  const infoPreviewSections = [
    {
      title: "프로그램 소개",
      value: values.description.trim(),
      empty: "프로그램 소개가 아직 입력되지 않았습니다."
    },
    {
      title: "이런 아이에게 추천해요",
      value: values.recommendedFor.trim(),
      empty: "추천 대상이 아직 입력되지 않았습니다."
    },
    {
      title: "이 수업에서 경험하는 것",
      value: values.experiencePoints.trim(),
      empty: "경험 포인트가 아직 입력되지 않았습니다."
    },
    {
      title: "커리큘럼",
      value: values.curriculum.trim(),
      empty: "커리큘럼이 아직 입력되지 않았습니다."
    }
  ]
  const activeTab = getTabForStep(currentStep)
  const formId = "studio-class-create-form"

  return (
    <section className={styles.page}>
      <div className={styles.stickyChrome}>
        <header className={styles.headerCard}>
          <div className={styles.headerLeft}>
            <Link href="/studio/classes" className={styles.backButton} aria-label="수업 목록으로 돌아가기">
              ←
            </Link>
            <div className={styles.titleGroup}>
              <h1 className={styles.pageTitle}>새 수업 등록</h1>
            </div>
          </div>
          <div className={styles.headerRight}>
            <button
              type="submit"
              form={formId}
              className={styles.saveButton}
              disabled={isPending || isUploadingCoverImage}
            >
              {isPending ? "등록 중..." : "수업 등록"}
            </button>
          </div>
        </header>

        <nav className={styles.tabBar} aria-label="신규 수업 등록 탭">
          {createFormTabs.map((tab) => {
            const isSelected = activeTab === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tabButton} ${isSelected ? styles.tabButtonActive : ""}`}
                aria-pressed={isSelected}
                onClick={() => moveToStep(getStepForTab(tab.id))}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      <form id={formId} className={styles.form} action={formAction} onSubmit={handleFinalSubmit}>
        <input type="hidden" name="mode" value="create" />
        <input type="hidden" name="programType" value={values.programType} />
        <input type="hidden" name="title" value={values.title} />
        <input type="hidden" name="subjectCategoryId" value={values.subjectCategoryId} />
        <input type="hidden" name="subjectId" value={values.subjectId} />
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

        {state.message ? (
          <section className={`${styles.feedbackCard} ${state.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
            {state.message}
          </section>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.tabPanel} hidden={activeTab !== "info"}>
            {currentStep === 1 ? (
              <div className={styles.panelInner}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}>수업 정보</h2>
                  <p className={styles.panelDescription}>
                    학부모가 가장 먼저 보는 기본 정보와 소개 문구, 대표 이미지를 한 번에 정리해 주세요.
                  </p>
                </div>

                {renderFieldError(fieldErrors.organizationRegion)}

                <div className={styles.infoGrid}>
                  <div className={styles.infoMainColumn}>
                    <div className={styles.infoSection}>
                      <p className={styles.tabSectionLabel}>기본 정보</p>
                      <section className={styles.infoSectionCard}>
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
                          <StudioSubjectSelector
                            catalog={safeSubjectCatalog}
                            categoryId={values.subjectCategoryId}
                            subjectId={values.subjectId}
                            onCategoryChange={updateSubjectCategoryId}
                            onSubjectChange={updateSubjectId}
                            disabled={isPending}
                            error={fieldErrors.subject}
                            catalogError={subjectCatalogError}
                          />
                        </div>

                        <div className={styles.fieldBlock}>
                          <label className={styles.fieldLabel}>대상 학년 *</label>
                          <div className={styles.gradeGroupList}>
                            {LEARNER_GRADE_GROUPS.map((group) => (
                              <div key={group.value} className={styles.gradeGroup}>
                                <span className={styles.gradeGroupLabel}>{group.label}</span>
                                <div className={styles.chipRow}>
                                  {getLearnerGradesByGroup(group.value).map((grade) => (
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
                              </div>
                            ))}
                          </div>
                          <p className={styles.helperText}>
                            시작 학년과 마지막 학년을 선택하면 사이 학년이 자동으로 선택됩니다.
                          </p>
                          {renderFieldError(fieldErrors.targetGrades)}
                        </div>

                        <div className={styles.fieldBlock}>
                          <label className={styles.fieldLabel} htmlFor="class-region">
                            지역
                          </label>
                          <div id="class-region" className={styles.readonlyField}>
                            {organizationAcademyArea ?? "학원 설정에서 학원가 정보를 먼저 확인해 주세요."}
                          </div>
                          <p className={styles.helperText}>학원 프로필의 학원가 정보가 자동으로 저장됩니다.</p>
                        </div>

                        <div className={styles.fieldBlock}>
                          <label className={styles.fieldLabel} htmlFor="class-format">
                            수업 방식 *
                          </label>
                          <select
                            id="class-format"
                            value={classFormatSelection}
                            onChange={(event) => handleClassFormatSelectionChange(event.target.value)}
                            className={styles.input}
                          >
                            <option value="">선택해 주세요</option>
                            {classFormatOptions.map((option) => (
                              <option key={option} value={option === "기타" ? customClassFormatOptionValue : option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <p className={styles.helperText}>학생이 어떤 형태로 수업을 진행하는지 선택해 주세요.</p>
                          {classFormatSelection === customClassFormatOptionValue ? (
                            <div className={styles.fieldBlock}>
                              <label className={styles.fieldLabel} htmlFor="class-format-custom">
                                직접 입력
                              </label>
                              <input
                                id="class-format-custom"
                                value={customClassFormat}
                                onChange={(event) => handleCustomClassFormatChange(event.target.value)}
                                className={styles.input}
                                placeholder="예) 프로젝트형 수업"
                              />
                            </div>
                          ) : null}
                          {renderFieldError(fieldErrors.classFormat)}
                        </div>
                      </section>
                    </div>

                    <div className={styles.infoSection}>
                      <p className={styles.tabSectionLabel}>상세 소개</p>
                      <section className={styles.infoSectionCard}>
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
                          <textarea
                            id="class-curriculum"
                            className={styles.textarea}
                            rows={5}
                            value={values.curriculum}
                            onChange={(event) => updateValue("curriculum", event.target.value)}
                            placeholder={fieldExamples.curriculum}
                          />
                        </div>
                      </section>
                    </div>

                    <div className={styles.infoSection}>
                      <p className={styles.tabSectionLabel}>대표 이미지</p>
                      <section className={styles.infoSectionCard}>
                        <div className={styles.fieldBlock}>
                          <span className={styles.fieldLabel}>대표 이미지 업로드</span>
                          <span className={styles.helperText}>1200 × 900px · 4:3 · JPG · PNG · WebP · 5MB 이하</span>
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
                        </div>

                        {coverImageUploadError ? renderFieldError(coverImageUploadError) : null}

                        <div className={styles.infoPreviewImageFrame}>
                          {previewImageUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={previewImageUrl} alt="대표 이미지 미리보기" className={styles.infoPreviewImage} />
                            </>
                          ) : (
                            <div className={styles.infoPreviewImageEmpty}>대표 이미지가 아직 없습니다.</div>
                          )}
                        </div>
                      </section>
                    </div>
                  </div>

                  <aside className={styles.infoSideColumn}>
                    <div className={styles.previewRail}>
                      <section className={styles.infoPreviewCard}>
                        <div className={styles.infoPreviewHeader}>
                          <h3 className={styles.infoPreviewTitle}>학부모에게 보이는 화면</h3>
                          <p className={styles.infoPreviewDescription}>
                            현재 입력한 값을 바탕으로 공개 화면에 가까운 미리보기를 보여줍니다.
                          </p>
                        </div>

                        <div className={styles.infoPreviewImageFrame}>
                          {previewImageUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={previewImageUrl} alt={`${previewTitle} 대표 이미지`} className={styles.infoPreviewImage} />
                            </>
                          ) : (
                            <div className={styles.infoPreviewImageEmpty}>대표 이미지가 비어 있습니다.</div>
                          )}
                        </div>

                        <div className={styles.infoPreviewMetaRow}>
                          {selectedSubjectCategory ? (
                            <span className={styles.infoPreviewPill}>
                              {selectedSubjectSelection?.subject.name ?? selectedSubjectCategory.name}
                            </span>
                          ) : null}
                          {values.targetGrades.length > 0 ? (
                            <span className={styles.infoPreviewPill}>
                              {formatStoredTargetGrades(values.targetGrades.join(","))}
                            </span>
                          ) : null}
                          {values.trialPrice.trim() ? (
                            <span className={styles.infoPreviewPill}>
                              {Number(values.trialPrice) > 0 ? `${Number(values.trialPrice).toLocaleString("ko-KR")}원` : "무료"}
                            </span>
                          ) : null}
                        </div>

                        <div className={styles.infoPreviewHeader}>
                          <h4 className={styles.infoPreviewHeading}>{previewTitle}</h4>
                          <p className={styles.infoPreviewFormat}>{values.classFormat.trim() || "수업 방식이 아직 입력되지 않았습니다."}</p>
                        </div>

                        {infoPreviewSections.map((section) => (
                          <section key={section.title} className={styles.infoPreviewSection}>
                            <h5 className={styles.infoPreviewSectionTitle}>{section.title}</h5>
                            {section.value ? (
                              <p className={styles.infoPreviewSectionBody}>{section.value}</p>
                            ) : (
                              <p className={styles.infoPreviewSectionEmpty}>{section.empty}</p>
                            )}
                          </section>
                        ))}
                      </section>
                    </div>
                  </aside>
                </div>
              </div>
            ) : null}
          </div>

          <div className={styles.tabPanel} hidden={activeTab !== "schedule"}>
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
          </div>

          <div className={styles.tabPanel} hidden={activeTab !== "visibility"}>
            <div className={styles.panelInner}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>공개 · 신청 설정</h2>
                <p className={styles.panelDescription}>
                  공개 여부와 프로그램 유형, 신청비를 정리해 두면 학부모 화면과 신청 흐름이 더 명확해집니다.
                </p>
              </div>

              <div className={styles.visibilityLayout}>
                <div className={styles.settingsSection}>
                  <p className={styles.tabSectionLabel}>공개 상태</p>
                  <section className={styles.settingsCard}>
                    <label className={styles.toggleCard}>
                      <div className={styles.toggleRow}>
                        <div className={styles.toggleLabelWrap}>
                          <p className={styles.toggleTitle}>
                            {values.visibility === "public" ? "학부모에게 공개중" : "비공개"}
                          </p>
                          <p className={styles.toggleDescription}>
                            {values.visibility === "public"
                              ? "학부모가 수업을 보고 신청할 수 있어요."
                              : "학부모에게 노출되지 않고 새로운 신청을 받을 수 없어요."}
                          </p>
                        </div>
                        <span className={styles.toggleSwitch}>
                          <input
                            type="checkbox"
                            checked={values.visibility === "public"}
                            onChange={(event) => updateValue("visibility", event.target.checked ? "public" : "private")}
                            disabled={isPending}
                            className={styles.toggleInput}
                          />
                          <span className={styles.toggleSlider} aria-hidden="true" />
                        </span>
                      </div>
                    </label>
                    {values.visibility === "public" && !canPublish ? (
                      <p className={styles.warningText}>예약시간이 없어서 지금은 공개로 등록할 수 없어요.</p>
                    ) : null}
                    {renderFieldError(fieldErrors.visibility)}
                    {fieldErrors.slots ? <p className={styles.errorText}>{fieldErrors.slots}</p> : null}
                  </section>
                </div>

                <div className={styles.settingsSection}>
                  <p className={styles.tabSectionLabel}>프로그램 유형</p>
                  <section className={styles.settingsCard}>
                    <div className={styles.fieldBlock}>
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
                      <p className={styles.toggleDescription}>
                        {values.programType === "level_test"
                          ? "레벨테스트로 저장돼요. 유형에 따라 학부모 화면의 신청 안내 문구가 달라져요."
                          : "체험수업으로 저장돼요. 유형에 따라 학부모 화면의 신청 안내 문구가 달라져요."}
                      </p>
                      {renderFieldError(fieldErrors.programType)}
                    </div>
                  </section>
                </div>

                <div className={styles.settingsSection}>
                  <p className={styles.tabSectionLabel}>신청비</p>
                  <section className={styles.settingsCard}>
                    <div className={styles.fieldBlock}>
                      <label className={styles.fieldLabel} htmlFor="create-trial-price">
                        1회 신청비 (원)
                      </label>
                      <input
                        id="create-trial-price"
                        type="number"
                        min={0}
                        step={1000}
                        value={values.trialPrice}
                        onChange={(event) => updateValue("trialPrice", event.target.value)}
                        className={styles.input}
                        placeholder="0"
                      />
                      <p className={styles.toggleDescription}>0원이면 학부모 화면에 무료로 표시돼요.</p>
                    </div>
                  </section>
                </div>

                {fieldErrors.description ? (
                  <section className={styles.settingsCard}>
                    <p className={styles.errorText}>{fieldErrors.description}</p>
                    <p className={styles.helperText}>프로그램 소개는 `수업 정보` 탭에서 10자 이상 작성해 주세요.</p>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </section>

      </form>
    </section>
  )
}
