"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useMemo, useRef, useState } from "react"

import {
  formatGradeList,
  GRADE_OPTIONS,
  parseStoredTargetGrades
} from "@/shared/constants/grade-options"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import {
  upsertStudioClassAction,
  type UpsertStudioClassActionState
} from "@/features/studio/actions/upsert-studio-class"
import { studioClassIntroTemplates } from "@/features/studio/lib/studio-class-intro-templates"
import {
  normalizeStudioClassSubjectOption,
  studioClassProgramTypeOptions,
  studioClassSubjectOptions,
  type StudioClassSubjectOption
} from "@/features/studio/lib/studio-class-options"
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

type SlotRecurrence = "weekly" | "one_time"

type ScheduleSlotDraft = {
  id: string
  recurrence: SlotRecurrence
  dayOfWeek: string
  specificDate: string
  startTime: string
  durationMin: string
  capacity: string
}

type SlotComposerState = {
  recurrence: SlotRecurrence
  dayOfWeek: string
  specificDate: string
  startTime: string
  durationMin: string
  capacity: string
}

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
  teacherIntro: string
  coverImageUrl: string
  assignmentMode: ClassAssignmentMode
  teacherId: string
  visibility: VisibilityMode
  slots: ScheduleSlotDraft[]
}

type StoredDraft = {
  version: 1
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
  | "slotComposer"
  | "teacherId"
  | "description"
  | "slots"
  | "visibility",
  string
>>

type PreviewOccurrence = {
  id: string
  dateLabel: string
  timeLabel: string
}

type OptionalSectionKey = "recommendedFor" | "experiencePoints" | "curriculum" | "teacherIntro" | "coverImage"

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

const weekdayOptions = [
  { value: "0", label: "일요일" },
  { value: "1", label: "월요일" },
  { value: "2", label: "화요일" },
  { value: "3", label: "수요일" },
  { value: "4", label: "목요일" },
  { value: "5", label: "금요일" },
  { value: "6", label: "토요일" }
] as const

const classModeOptions: ClassModeOption[] = ["오프라인 소그룹", "1:1", "온라인"]

const optionalFieldLabels: Record<OptionalSectionKey, string> = {
  recommendedFor: "이런 아이에게 추천해요",
  experiencePoints: "이 수업에서 경험하는 것",
  curriculum: "커리큘럼",
  teacherIntro: "선생님 소개",
  coverImage: "대표 이미지"
}

const createEmptySlotComposer = (): SlotComposerState => ({
  recurrence: "weekly",
  dayOfWeek: "1",
  specificDate: "",
  startTime: "",
  durationMin: "60",
  capacity: "1"
})

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
  teacherIntro: "",
  coverImageUrl: "",
  assignmentMode: "post_assign",
  teacherId: "",
  visibility: "private",
  slots: []
})

const createDraftStorageKey = (organizationId: string) => `studio-class-create-draft:${organizationId}`

const createLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const isValidTimeValue = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

const addMinutesToTime = (startTime: string, durationMin: string) => {
  if (!isValidTimeValue(startTime)) {
    return null
  }

  const duration = Number(durationMin)
  if (!Number.isFinite(duration) || duration < 10) {
    return null
  }

  const [hours, minutes] = startTime.split(":").map(Number)
  const startMinutes = hours * 60 + minutes
  const endMinutes = startMinutes + duration
  if (endMinutes >= 24 * 60) {
    return null
  }

  const endHour = Math.floor(endMinutes / 60)
  const endMinute = endMinutes % 60
  return `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`
}

const formatProgramTypeLabel = (programType: ClassProgramType) =>
  studioClassProgramTypeOptions.find((option) => option.value === programType)?.label ?? "체험수업"

const formatSubjectLabel = (subject: StudioClassSubjectOption | "") => subject.replaceAll("/", "·")

const formatSlotLabel = (slot: ScheduleSlotDraft) => {
  const recurrenceLabel = slot.recurrence === "weekly" ? "매주 반복" : "특정 날짜 1회"
  const dateLabel =
    slot.recurrence === "weekly"
      ? weekdayOptions.find((option) => option.value === slot.dayOfWeek)?.label ?? "요일 미선택"
      : slot.specificDate || "날짜 미선택"
  const endTime = addMinutesToTime(slot.startTime, slot.durationMin)
  const timeLabel = slot.startTime && endTime ? `${slot.startTime}~${endTime}` : "시간 미입력"
  const capacityLabel = slot.capacity ? `정원 ${slot.capacity}명` : "정원 미입력"
  return `${recurrenceLabel} · ${dateLabel} · ${timeLabel} · ${capacityLabel}`
}

const formatSlotChip = (slot: ScheduleSlotDraft) => {
  const endTime = addMinutesToTime(slot.startTime, slot.durationMin)
  const dateText =
    slot.recurrence === "weekly"
      ? weekdayOptions.find((option) => option.value === slot.dayOfWeek)?.label ?? "요일 미선택"
      : slot.specificDate || "날짜 미선택"
  return `${dateText} ${slot.startTime}${endTime ? `~${endTime}` : ""}`
}

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

const isValidDateInput = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime())

const generatePreviewOccurrences = (slots: ScheduleSlotDraft[]): PreviewOccurrence[] => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nextItems: Array<PreviewOccurrence & { sortKey: number }> = []

  for (const slot of slots) {
    const endTime = addMinutesToTime(slot.startTime, slot.durationMin)
    if (!slot.startTime || !endTime) {
      continue
    }

    if (slot.recurrence === "one_time") {
      if (!isValidDateInput(slot.specificDate)) {
        continue
      }
      const start = new Date(`${slot.specificDate}T${slot.startTime}:00`)
      if (start.getTime() <= Date.now()) {
        continue
      }
      nextItems.push({
        id: `${slot.id}-${slot.specificDate}`,
        dateLabel: new Intl.DateTimeFormat("ko-KR", {
          month: "long",
          day: "numeric",
          weekday: "short"
        }).format(start),
        timeLabel: `${slot.startTime}~${endTime}`,
        sortKey: start.getTime()
      })
      continue
    }

    const dayOfWeek = Number(slot.dayOfWeek)
    if (!Number.isFinite(dayOfWeek)) {
      continue
    }

    for (let offset = 0; offset < 28; offset += 1) {
      const candidate = new Date(today)
      candidate.setDate(today.getDate() + offset)
      if (candidate.getDay() !== dayOfWeek) {
        continue
      }
      const dateText = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(
        candidate.getDate()
      ).padStart(2, "0")}`
      const start = new Date(`${dateText}T${slot.startTime}:00`)
      if (start.getTime() <= Date.now()) {
        continue
      }
      nextItems.push({
        id: `${slot.id}-${dateText}`,
        dateLabel: new Intl.DateTimeFormat("ko-KR", {
          month: "long",
          day: "numeric",
          weekday: "short"
        }).format(start),
        timeLabel: `${slot.startTime}~${endTime}`,
        sortKey: start.getTime()
      })
    }
  }

  return nextItems.sort((left, right) => left.sortKey - right.sortKey).slice(0, 8)
}

const parseStoredDraft = (raw: string | null): StoredDraft | null => {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredDraft
    if (parsed?.version !== 1 || !parsed.values) {
      return null
    }
    return parsed
  } catch {
    return null
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
  const [slotComposer, setSlotComposer] = useState<SlotComposerState>(createEmptySlotComposer)
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({})
  const [draftStatus, setDraftStatus] = useState("작성 내용은 자동으로 임시저장돼요")
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const [optionalSections, setOptionalSections] = useState<Record<OptionalSectionKey, boolean>>({
    recommendedFor: false,
    experiencePoints: false,
    curriculum: false,
    teacherIntro: false,
    coverImage: false
  })
  const [coverImagePreviewUrl, setCoverImagePreviewUrl] = useState("")
  const [coverImageUploadError, setCoverImageUploadError] = useState<string | null>(null)
  const [isUploadingCoverImage, setIsUploadingCoverImage] = useState(false)
  const [state, formAction, isPending] = useActionState(upsertStudioClassAction, initialActionState)
  const draftHydratedRef = useRef(false)
  const draftStorageKey = useMemo(() => createDraftStorageKey(organizationId), [organizationId])

  const canPublish = values.slots.length > 0
  const previewOccurrences = useMemo(() => generatePreviewOccurrences(values.slots), [values.slots])
  const selectedTeacherLabel =
    safeTeacherOptions.find((option) => option.teacherId === values.teacherId)?.teacherName ?? "미정"

  useEffect(() => {
    const parsed = parseStoredDraft(typeof window !== "undefined" ? window.localStorage.getItem(draftStorageKey) : null)
    if (parsed) {
      const normalizedSubject = normalizeStudioClassSubjectOption(parsed.values.subject) ?? ""
      setValues({
        ...createDefaultDraftValues(),
        ...parsed.values,
        subject: normalizedSubject
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
          version: 1,
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

  const toggleOptionalSection = (key: OptionalSectionKey) => {
    setOptionalSections((current) => ({ ...current, [key]: !current[key] }))
  }

  const saveDraftNow = () => {
    try {
      const payload: StoredDraft = {
        version: 1,
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

  const validateSlotComposer = () => {
    if (slotComposer.recurrence === "weekly" && slotComposer.dayOfWeek === "") {
      return "요일을 선택해 주세요."
    }
    if (slotComposer.recurrence === "one_time" && !isValidDateInput(slotComposer.specificDate)) {
      return "날짜를 정확히 입력해 주세요."
    }
    if (!isValidTimeValue(slotComposer.startTime)) {
      return "시작 시간을 정확히 입력해 주세요."
    }
    const duration = Number(slotComposer.durationMin)
    if (!Number.isFinite(duration) || duration < 10) {
      return "수업시간은 10분 이상으로 입력해 주세요."
    }
    if (!addMinutesToTime(slotComposer.startTime, slotComposer.durationMin)) {
      return "시작 시간과 수업시간을 다시 확인해 주세요."
    }
    const capacity = Number(slotComposer.capacity)
    if (!Number.isFinite(capacity) || capacity < 1) {
      return "정원은 1명 이상이어야 해요."
    }
    return null
  }

  const addSlot = () => {
    const error = validateSlotComposer()
    if (error) {
      setFieldErrors((current) => ({ ...current, slotComposer: error }))
      return
    }

    setValues((current) => ({
      ...current,
      slots: [
        ...current.slots,
        {
          id: createLocalId(),
          recurrence: slotComposer.recurrence,
          dayOfWeek: slotComposer.recurrence === "weekly" ? slotComposer.dayOfWeek : "",
          specificDate: slotComposer.recurrence === "one_time" ? slotComposer.specificDate : "",
          startTime: slotComposer.startTime,
          durationMin: slotComposer.durationMin,
          capacity: slotComposer.capacity
        }
      ]
    }))
    setFieldErrors((current) => ({ ...current, slotComposer: undefined, slots: undefined }))
    setSlotComposer((current) => ({
      ...createEmptySlotComposer(),
      recurrence: current.recurrence,
      dayOfWeek: current.dayOfWeek
    }))
  }

  const removeSlot = (slotId: string) => {
    setValues((current) => ({
      ...current,
      slots: current.slots.filter((slot) => slot.id !== slotId)
    }))
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
      if (values.visibility === "public" && values.slots.length === 0) {
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
    values.targetGrades.length > 0 ? formatGradeList(parseStoredTargetGrades(values.targetGrades.join(","))) : "대상 학년 선택",
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
      <input type="hidden" name="teacherIntro" value={values.teacherIntro} />
      <input type="hidden" name="trialPrice" value={values.trialPrice.trim() || "0"} />
      <input type="hidden" name="assignmentMode" value={values.assignmentMode} />
      <input type="hidden" name="teacherId" value={values.teacherId} />
      <input type="hidden" name="coverImageUrl" value={values.coverImageUrl} />
      <input type="hidden" name="enforcePublicSlotGuard" value="true" />
      {values.visibility === "public" ? <input type="hidden" name="isActive" value="on" /> : null}
      {values.targetGrades.map((grade) => (
        <input key={grade} type="hidden" name="targetGrades" value={grade} />
      ))}
      {values.slots.map((slot) => {
        const endTime = addMinutesToTime(slot.startTime, slot.durationMin) ?? ""
        return (
          <div key={slot.id}>
            <input type="hidden" name="slotId" value="" />
            <input type="hidden" name="slotScheduleType" value={slot.recurrence} />
            <input type="hidden" name="slotDayOfWeek" value={slot.recurrence === "weekly" ? slot.dayOfWeek : ""} />
            <input
              type="hidden"
              name="slotSpecificDate"
              value={slot.recurrence === "one_time" ? slot.specificDate : ""}
            />
            <input type="hidden" name="slotStartTime" value={slot.startTime} />
            <input type="hidden" name="slotEndTime" value={endTime} />
            <input type="hidden" name="slotCapacity" value={slot.capacity} />
            <input type="hidden" name="slotDisplayLabel" value="" />
          </div>
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
              placeholder="예: 사고력 수학 첫 진단 수업"
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
              {GRADE_OPTIONS.map((grade) => (
                <button
                  key={grade}
                  type="button"
                  className={`${styles.choiceChip} ${values.targetGrades.includes(grade) ? styles.choiceChipSelected : ""}`}
                  onClick={() => toggleGrade(grade)}
                >
                  {grade}
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
        <section className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div>
              <p className={styles.stepEyebrow}>STEP 2</p>
              <h2 className={styles.stepTitleText}>예약시간</h2>
              <p className={styles.stepDescription}>학부모가 신청할 수 있는 예약 슬롯과 담당 선생님 배정 방식을 정합니다.</p>
            </div>
          </div>

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>A. 예약 슬롯</h3>
                <p className={styles.sectionDescription}>입력한 슬롯은 아래 리스트와 4주 미리보기에 바로 반영됩니다.</p>
              </div>
            </div>

            <div className={styles.segmentRow}>
              <button
                type="button"
                className={`${styles.segmentButton} ${slotComposer.recurrence === "weekly" ? styles.segmentButtonActive : ""}`}
                onClick={() => {
                  setSlotComposer((current) => ({ ...current, recurrence: "weekly" }))
                  setFieldErrors((current) => ({ ...current, slotComposer: undefined }))
                }}
              >
                매주 반복
              </button>
              <button
                type="button"
                className={`${styles.segmentButton} ${
                  slotComposer.recurrence === "one_time" ? styles.segmentButtonActive : ""
                }`}
                onClick={() => {
                  setSlotComposer((current) => ({ ...current, recurrence: "one_time" }))
                  setFieldErrors((current) => ({ ...current, slotComposer: undefined }))
                }}
              >
                특정 날짜 1회
              </button>
            </div>

            <div className={styles.slotComposerGrid}>
              {slotComposer.recurrence === "weekly" ? (
                <label className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>요일</span>
                  <select
                    className={styles.input}
                    value={slotComposer.dayOfWeek}
                    onChange={(event) => setSlotComposer((current) => ({ ...current, dayOfWeek: event.target.value }))}
                  >
                    {weekdayOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>날짜</span>
                  <input
                    type="date"
                    className={styles.input}
                    value={slotComposer.specificDate}
                    onChange={(event) =>
                      setSlotComposer((current) => ({ ...current, specificDate: event.target.value }))
                    }
                  />
                </label>
              )}

              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>시간</span>
                <input
                  type="time"
                  className={styles.input}
                  value={slotComposer.startTime}
                  onChange={(event) => setSlotComposer((current) => ({ ...current, startTime: event.target.value }))}
                />
              </label>

              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>수업시간(분)</span>
                <input
                  type="number"
                  min={10}
                  step={10}
                  className={styles.input}
                  value={slotComposer.durationMin}
                  onChange={(event) => setSlotComposer((current) => ({ ...current, durationMin: event.target.value }))}
                />
              </label>

              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>정원</span>
                <input
                  type="number"
                  min={1}
                  className={styles.input}
                  value={slotComposer.capacity}
                  onChange={(event) => setSlotComposer((current) => ({ ...current, capacity: event.target.value }))}
                />
              </label>
            </div>

            <div className={styles.inlineActionRow}>
              <button type="button" className={styles.primaryInlineButton} onClick={addSlot}>
                + 예약시간 추가
              </button>
              {renderFieldError(fieldErrors.slotComposer)}
            </div>

            {values.slots.length === 0 ? (
              <div className={styles.emptyState}>
                아직 등록된 예약시간이 없어요. 위에서 요일·시간을 고르고 추가해 주세요.
              </div>
            ) : (
              <ul className={styles.slotList}>
                {values.slots.map((slot) => (
                  <li key={slot.id} className={styles.slotItem}>
                    <div className={styles.slotTextGroup}>
                      <span className={styles.slotBadge}>
                        {slot.recurrence === "weekly" ? "매주 반복" : "특정 날짜 1회"}
                      </span>
                      <strong>{formatSlotLabel(slot)}</strong>
                    </div>
                    <button type="button" className={styles.deleteButton} onClick={() => removeSlot(slot.id)}>
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {renderFieldError(fieldErrors.slots)}
          </section>

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

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>학부모 화면 4주 미리보기</h3>
                <p className={styles.sectionDescription}>입력한 예약 슬롯이 실제 날짜 기준으로 어떻게 보일지 미리 확인해 주세요.</p>
              </div>
            </div>
            {previewOccurrences.length === 0 ? (
              <div className={styles.emptyState}>예약시간을 추가하면 향후 4주 기준 실제 날짜가 여기에 표시됩니다.</div>
            ) : (
              <div className={styles.previewChipRow}>
                {previewOccurrences.map((item) => (
                  <span key={item.id} className={styles.previewChip}>
                    {item.dateLabel} · {item.timeLabel}
                  </span>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : null}

      {currentStep === 3 ? (
        <section className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div>
              <p className={styles.stepEyebrow}>STEP 3</p>
              <h2 className={styles.stepTitleText}>소개 문구</h2>
              <p className={styles.stepDescription}>필수 소개 1개만 먼저 작성하고, 나머지는 필요할 때 펼쳐서 채워 주세요.</p>
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
              placeholder="학부모가 이 프로그램을 한눈에 이해할 수 있게 소개해 주세요."
            />
            {renderFieldError(fieldErrors.description)}
          </div>

          {(["recommendedFor", "experiencePoints", "curriculum", "teacherIntro", "coverImage"] as const).map((key) => (
            <section key={key} className={styles.collapseCard}>
              <button type="button" className={styles.collapseHeader} onClick={() => toggleOptionalSection(key)}>
                <span>{optionalFieldLabels[key]}</span>
                <span>{optionalSections[key] ? "접기" : "열기"}</span>
              </button>

              {optionalSections[key] ? (
                <div className={styles.collapseBody}>
                  {key === "coverImage" ? (
                    <div className={styles.fieldBlock}>
                      <div className={styles.labelRow}>
                        <span className={styles.fieldLabel}>대표 이미지</span>
                        <span className={styles.optionalBadge}>선택</span>
                      </div>
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
                      <p className={styles.helperText}>JPEG/PNG/WEBP, 5MB 이하. 없으면 과목 기본 이미지로 보입니다.</p>
                      {coverImageUploadError ? renderFieldError(coverImageUploadError) : null}
                      {coverImagePreviewUrl || values.coverImageUrl ? (
                        <div className={styles.imagePreview}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={coverImagePreviewUrl || values.coverImageUrl}
                            alt="대표 이미지 미리보기"
                            className={styles.imagePreviewImage}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <textarea
                      className={styles.textarea}
                      rows={5}
                      value={values[key]}
                      onChange={(event) => updateValue(key, event.target.value)}
                      placeholder={`${optionalFieldLabels[key]} 내용을 작성해 주세요.`}
                    />
                  )}
                </div>
              ) : null}
            </section>
          ))}
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
                        ? `${formatSubjectLabel(values.subject)} · ${formatGradeList(
                            parseStoredTargetGrades(values.targetGrades.join(","))
                          )} · ${values.classFormat}`
                        : "1단계에서 과목, 대상 학년, 수업 방식을 채워 주세요."}
                    </span>
                  </div>
                  <button type="button" className={styles.jumpButton} onClick={() => moveToStep(1)}>
                    1단계로 이동
                  </button>
                </li>
                <li className={styles.checkItem}>
                  <span className={values.slots.length > 0 ? styles.checkOk : styles.checkPending}>
                    {values.slots.length > 0 ? "완료" : "미완료"}
                  </span>
                  <div className={styles.checkBody}>
                    <strong>예약시간 {values.slots.length}개</strong>
                    <span>
                      {values.slots.length > 0
                        ? values.slots.map((slot) => formatSlotChip(slot)).join(" / ")
                        : "2단계에서 예약시간을 추가해 주세요."}
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
                {values.slots.length > 0 ? (
                  values.slots.slice(0, 4).map((slot) => (
                    <span key={slot.id} className={styles.previewSlotChip}>
                      {formatSlotChip(slot)}
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
