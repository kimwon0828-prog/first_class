"use client"

import { formatRegularPriceInput, parseRegularPrice, REGULAR_PRICE_NOTE_MAX_LENGTH, type RegularPriceType } from "@/shared/lib/regular-price"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  formatStoredTargetGrades,
  parseStoredTargetGrades
} from "@/shared/constants/grade-options"
import {
  LEARNER_GRADES,
  LEARNER_GRADE_GROUPS,
  getLearnerGradesByGroup,
  getSubjectLabel
} from "@/shared/constants/education-taxonomy"
import {
  upsertStudioClassAction,
  type UpsertStudioClassActionState
} from "@/features/studio/actions/upsert-studio-class"
import { getStudioClassFieldExamples } from "@/features/studio/lib/studio-class-field-examples"
import { StudioClassScheduleEditor } from "@/features/studio/ui/studio-class-schedule-editor"
import { StudioSubjectSelector } from "@/features/studio/ui/studio-subject-selector"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import type {
  ClassAssignmentMode,
  ClassProgramType,
  ClassSummary,
  StudioClassScheduleItem,
  StudioScheduleCalendarDay,
  StudioClassScheduleType,
  StudioTeacherOption
} from "@/shared/lib/db/adapter"
import {
  findSubjectCatalogCategory,
  findSubjectCatalogSelection,
  type SubjectCatalogCategory
} from "@/shared/lib/subject-master"
import { classScheduleSnapshot } from "@/features/studio/lib/class-form-schedule-save"
import { classOperatingRuleFromDraft, classOperatingRuleToDraft, rollingPreviewDraft } from "@/features/studio/lib/class-operating-rule"
import {
  presentOperatingDraft,
  presentOperatingDraftGroups
} from "@/features/studio/lib/class-operation-presentation"
import type { CreateClassScheduleDraft } from "@/features/studio/lib/studio-operating-hours"
import { useClassCreateDraft, type ClassFormDraftValues } from "@/features/studio/lib/use-class-create-draft"
import {
  createDefaultCreateClassScheduleDraft, buildCreateClassScheduleDraftSlots,
  normalizeStoredScheduleDraft,
  validateOperatingScheduleDraft
} from "@/features/studio/lib/studio-operating-hours"
import { formatSeoulDateKey } from "@/shared/lib/seoul-datetime"
import { StudioClassOperationEditor } from "./studio-class-operation-editor"
import { StudioClassFormDialog } from "./studio-class-form-dialog"
import styles from "./studio-class-form.module.css"

export type StudioClassFormProps = {
  organizationId: string
  teacherOptions: StudioTeacherOption[]
  teacherOptionsError: string | null
  subjectCatalog: SubjectCatalogCategory[]
  subjectCatalogError: string | null
  initialItem?: ClassSummary | null
  onCreated?: () => void
  onUpdated?: () => void
  variant?: "default" | "standalone"
  formId?: string
  createSuccessHref?: string
  updateSuccessHref?: string
  scheduleCalendarMonth?: string
  scheduleCalendarDays?: StudioScheduleCalendarDay[]
  scheduleCalendarError?: string | null
  initialSection?: "operations"
}

const initialState: UpsertStudioClassActionState = {
  ok: false,
  message: ""
}

type ScheduleSlotDraft = {
  localId: string
  persistedId: string
  scheduleType: StudioClassScheduleType
  bookingStatus: "open" | "closed" | "hidden"
  dayOfWeek: string
  specificDate: string
  seriesId: string
  startTime: string
  endTime: string
  capacity: string
  displayLabel: string
  applicationCount: number
  isReferencedByApplications: boolean
}

const ClassPreviewBasicInfo = ({
  subject,
  target,
  classFormat
}: {
  subject: string
  target: string
  classFormat: string
}) => (
  <dl aria-label="기본 수업 정보">
    <div><dt>과목</dt><dd>{subject}</dd></div>
    <div><dt>대상</dt><dd>{target}</dd></div>
    <div><dt>방식</dt><dd>{classFormat}</dd></div>
  </dl>
)

const formSections = [
  ["basic", "기본 정보"], ["price", "가격"], ["operations", "체험 운영"],
  ["description", "수업 소개"], ["image", "이미지"], ["visibility", "공개 설정"]
] as const
type FieldErrorKey = "title" | "subject" | "targetGrades" | "price" | "regularPrice" | "teacher" | "description" | "schedule" | "visibility"

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

const programTypeOptions: Array<{
  value: ClassProgramType
  label: string
}> = [
  { value: "trial_class", label: "체험수업" },
  { value: "level_test", label: "레벨테스트" }
]

const standardizedClassFormatOptions = [
  "1:1 개별수업",
  "개별진도 수업",
  "소수정예 수업",
  "그룹수업",
  "기타"
] as const

const customClassFormatOptionValue = "__custom__"

const formatCompactDate = (value: string) => {
  const matched = /^\d{4}-(\d{2})-(\d{2})$/.exec(value)
  if (!matched) return value
  return `${Number(matched[1])}/${Number(matched[2])}`
}

const resolveClassFormatSelection = (value: string) => {
  const normalized = value.trim()

  if (!normalized) {
    return ""
  }

  if (normalized === "기타") return customClassFormatOptionValue

  return standardizedClassFormatOptions.includes(normalized as (typeof standardizedClassFormatOptions)[number])
    ? normalized
    : customClassFormatOptionValue
}

const serializeFormData = (formData: FormData) =>
  Array.from(formData.entries())
    .filter(([key]) => !key.startsWith("slot") && !key.startsWith("schedule"))
    .map(([key, value]) => `${key}:${typeof value === "string" ? value : value.name}`)
    .join("\n")

const createScheduleSlotDraftFromItem = (schedule: StudioClassScheduleItem): ScheduleSlotDraft => ({
  localId: `${schedule.id}-${Math.random().toString(36).slice(2, 8)}`,
  persistedId: schedule.id,
  scheduleType: schedule.scheduleType,
  bookingStatus: schedule.bookingStatus ?? "open",
  dayOfWeek: schedule.dayOfWeek != null ? String(schedule.dayOfWeek) : "",
  specificDate: schedule.specificDate ?? "",
  seriesId: schedule.seriesId ?? "",
  startTime: schedule.startTime.slice(0, 5),
  endTime: schedule.endTime.slice(0, 5),
  capacity: schedule.capacity != null ? String(schedule.capacity) : "",
  displayLabel: schedule.displayLabel ?? "",
  applicationCount: schedule.applicationCount ?? 0,
  isReferencedByApplications: Boolean(schedule.isReferencedByApplications)
})

import { useStudioNavigationPath } from "@/features/studio/ui/studio-navigation-provider"

export const StudioClassForm = ({
  organizationId,
  teacherOptions,
  teacherOptionsError,
  subjectCatalog,
  subjectCatalogError,
  initialItem,
  onCreated,
  onUpdated,
  variant = "default",
  formId,
  createSuccessHref,
  updateSuccessHref,
  scheduleCalendarMonth,
  scheduleCalendarDays = [],
  scheduleCalendarError,
  initialSection
}: StudioClassFormProps) => {
  const classesHref = useStudioNavigationPath("/studio/classes")
  const router = useRouter()
  const resolvedFormId = formId ?? "studio-class-fields"
  const formRef = useRef<HTMLFormElement | null>(null)
  const initialSerializedFormRef = useRef("")
  const safeTeacherOptions = useMemo(
    () => (Array.isArray(teacherOptions) ? teacherOptions : []),
    [teacherOptions]
  )
  const safeSubjectCatalog = useMemo(
    () => (Array.isArray(subjectCatalog) ? subjectCatalog : []),
    [subjectCatalog]
  )
  const initialSubjectSelection = useMemo(
    () => findSubjectCatalogSelection(safeSubjectCatalog, initialItem?.subjectId),
    [initialItem?.subjectId, safeSubjectCatalog]
  )
  const [isDirty, setIsDirty] = useState(false)
  const [headerTitle, setHeaderTitle] = useState(initialItem?.title ?? "")
  const [isActivePreview, setIsActivePreview] = useState(initialItem?.isActive ?? true)
  const [selectedClassId, setSelectedClassId] = useState(initialItem?.id ?? "")
  const [selectedProgramType, setSelectedProgramType] = useState(initialItem?.programType ?? "trial_class")
  const [trialPrice, setTrialPrice] = useState(initialItem ? String(initialItem.trialPrice ?? 0) : "")
  const [regularPriceType, setRegularPriceType] = useState<RegularPriceType | "">(initialItem?.regularPriceType ?? "")
  const [regularPriceAmount, setRegularPriceAmount] = useState(initialItem?.regularPriceAmount == null ? "" : String(initialItem.regularPriceAmount))
  const [regularPriceNote, setRegularPriceNote] = useState(initialItem?.regularPriceNote ?? "")
  const [priceMode, setPriceMode] = useState<"" | "free" | "paid">(initialItem ? initialItem.trialPrice === 0 ? "free" : "paid" : "")
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldErrorKey, string>>>({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const [operationsOpen, setOperationsOpen] = useState(false)
  const [operationsBusy, setOperationsBusy] = useState(false)
  const [createScheduleDraft, setCreateScheduleDraft] = useState(createDefaultCreateClassScheduleDraft)
  const [editedOperatingDraft, setEditedOperatingDraft] = useState<CreateClassScheduleDraft | null>(null)
  const [hasOperatingRuleSelection, setHasOperatingRuleSelection] = useState(Boolean(initialItem?.operatingRule))
  const [operatingRuleRevision, setOperatingRuleRevision] = useState(initialItem?.operatingRule?.revision ?? 0)
  useEffect(() => {
    if (!editedOperatingDraft) setOperatingRuleRevision(initialItem?.operatingRule?.revision ?? 0)
  }, [editedOperatingDraft,initialItem?.operatingRule?.revision])
  const [scheduleEdited, setScheduleEdited] = useState(false)
  const [scheduleBaseline, setScheduleBaseline] = useState(() => classScheduleSnapshot(initialItem?.schedules ?? []))
  const [selectedAssignmentMode, setSelectedAssignmentMode] = useState<ClassAssignmentMode>(
    initialItem?.assignmentMode ?? "post_assign"
  )
  const [selectedSubjectCategoryId, setSelectedSubjectCategoryId] = useState(
    initialItem?.subjectCategoryId ?? initialSubjectSelection?.category.id ?? ""
  )
  const [selectedSubjectId, setSelectedSubjectId] = useState(
    initialItem?.subjectId ?? ""
  )
  const [description, setDescription] = useState(initialItem?.description ?? "")
  const [recommendedFor, setRecommendedFor] = useState(initialItem?.recommendedFor ?? "")
  const [experiencePoints, setExperiencePoints] = useState(initialItem?.experiencePoints ?? "")
  const [curriculum, setCurriculum] = useState(initialItem?.curriculum ?? "")
  const [classFormatSelection, setClassFormatSelection] = useState(resolveClassFormatSelection(initialItem?.classFormat ?? ""))
  const [customClassFormat, setCustomClassFormat] = useState(
    resolveClassFormatSelection(initialItem?.classFormat ?? "") === customClassFormatOptionValue
      ? initialItem?.classFormat ?? ""
      : ""
  )
  const [selectedTargetGrades, setSelectedTargetGrades] = useState<string[]>(parseStoredTargetGrades(initialItem?.targetAge))
  const [targetGradeRangeStart, setTargetGradeRangeStart] = useState<string | null>(null)
  const [coverImageUrl, setCoverImageUrl] = useState(initialItem?.coverImageUrl ?? "")
  const [coverImageUploadError, setCoverImageUploadError] = useState<string | null>(null)
  const [isUploadingCoverImage, setIsUploadingCoverImage] = useState(false)
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>(
    initialItem?.schedules?.length
      ? initialItem.schedules.map(createScheduleSlotDraftFromItem)
      : []
  )
  const [selectedTeacherId, setSelectedTeacherId] = useState(initialItem?.teacherId ?? "")
  const action = useMemo(() => upsertStudioClassAction, [])
  const [state, formAction, isPending] = useActionState(action, initialState)
  const legacySubjectValue =
    !initialItem?.subjectCategoryId && !initialItem?.subjectId && initialItem?.subject?.trim()
      ? initialItem.subject.trim()
      : null
  const initialTargetGrades = useMemo(
    () => parseStoredTargetGrades(initialItem?.targetAge),
    [initialItem?.targetAge]
  )
  const legacyTargetAgeValue =
    initialItem?.targetAge?.trim() && initialTargetGrades.length === 0 ? initialItem.targetAge.trim() : null
  const teacherOptionIds = useMemo(
    () => new Set(safeTeacherOptions.map((option) => option.teacherId)),
    [safeTeacherOptions]
  )
  const fallbackTeacherOption = useMemo(
    () =>
      initialItem?.teacherId &&
      !teacherOptionIds.has(initialItem.teacherId) &&
      (initialItem.teacherDisplayName || initialItem.teacherName)
        ? {
            teacherId: initialItem.teacherId,
            teacherName: initialItem.teacherDisplayName ?? initialItem.teacherName ?? "선생님"
          }
        : null,
    [
      initialItem?.teacherDisplayName,
      initialItem?.teacherId,
      initialItem?.teacherName,
      teacherOptionIds
    ]
  )
  const mergedTeacherOptions = useMemo(
    () => (fallbackTeacherOption ? [fallbackTeacherOption, ...safeTeacherOptions] : safeTeacherOptions),
    [fallbackTeacherOption, safeTeacherOptions]
  )
  const resolveTeacherLabel = (option: StudioTeacherOption | (StudioTeacherOption & Record<string, unknown>)) => {
    const candidate = option as unknown as {
      displayName?: unknown
      teacherName?: unknown
      name?: unknown
    }
    const raw =
      (typeof candidate.displayName === "string" ? candidate.displayName : null) ??
      (typeof candidate.teacherName === "string" ? candidate.teacherName : null) ??
      (typeof candidate.name === "string" ? candidate.name : null) ??
      ""
    const normalized = raw.trim()
    return normalized || "선생님"
  }
  const isTeacherSelectionLockedToInactive = Boolean(
    initialItem?.teacherId && fallbackTeacherOption && !teacherOptionIds.has(initialItem.teacherId)
  )
  const isPreassignedMode = selectedAssignmentMode === "preassigned"
  const selectedSubjectSelection = useMemo(
    () => findSubjectCatalogSelection(safeSubjectCatalog, selectedSubjectId),
    [safeSubjectCatalog, selectedSubjectId]
  )
  const selectedSubjectCategory = useMemo(
    () => findSubjectCatalogCategory(safeSubjectCatalog, selectedSubjectCategoryId),
    [safeSubjectCatalog, selectedSubjectCategoryId]
  )
  const fieldExamples = useMemo(
    () => getStudioClassFieldExamples(selectedSubjectSelection?.subject.code),
    [selectedSubjectSelection?.subject.code]
  )
  const mode = selectedClassId ? "update" : "create"
  const previousOkRef = useRef(false)
  const initializedSnapshotKeyRef = useRef<string | null>(null)
  const initialFormSnapshot = useMemo(
    () => ({
      id: initialItem?.id ?? "",
      programType: initialItem?.programType ?? "trial_class",
      trialPrice: String(initialItem?.trialPrice ?? 0),
      regularPriceType: initialItem?.regularPriceType ?? ("" as const),
      regularPriceAmount: initialItem?.regularPriceAmount == null ? "" : String(initialItem.regularPriceAmount),
      regularPriceNote: initialItem?.regularPriceNote ?? "",
      assignmentMode: initialItem?.assignmentMode ?? "post_assign",
      subjectCategoryId:
        initialItem?.subjectCategoryId ?? initialSubjectSelection?.category.id ?? "",
      subjectId: initialItem?.subjectId ?? "",
      description: initialItem?.description ?? "",
      targetGrades: parseStoredTargetGrades(initialItem?.targetAge),
      recommendedFor: initialItem?.recommendedFor ?? "",
      experiencePoints: initialItem?.experiencePoints ?? "",
      curriculum: initialItem?.curriculum ?? "",
      classFormat: initialItem?.classFormat ?? "",
      teacherId: initialItem?.teacherId ?? "",
      coverImageUrl: initialItem?.coverImageUrl ?? "",
      scheduleSlots: initialItem?.schedules?.length
        ? initialItem.schedules.map(createScheduleSlotDraftFromItem)
        : []
    }),
    [
      initialItem?.classFormat,
      initialItem?.coverImageUrl,
      initialItem?.curriculum,
      initialItem?.description,
      initialItem?.experiencePoints,
      initialItem?.id,
      initialItem?.assignmentMode,
      initialItem?.programType,
      initialItem?.trialPrice,
      initialItem?.regularPriceType, initialItem?.regularPriceAmount, initialItem?.regularPriceNote,
      initialItem?.recommendedFor,
      initialItem?.schedules,
      initialItem?.subjectId,
      initialItem?.subjectCategoryId,
      initialItem?.targetAge,
      initialItem?.teacherId,
      initialSubjectSelection?.category.id
    ]
  )
  const resolvedClassFormat = useMemo(() => {
    if (classFormatSelection === customClassFormatOptionValue) {
      return customClassFormat
    }

    return classFormatSelection
  }, [classFormatSelection, customClassFormat])
  const previewImageUrl = coverImageUrl || ""
  const previewTargetGradeLabel =
    selectedTargetGrades.length > 0 ? formatStoredTargetGrades(selectedTargetGrades.join(",")) : ""
  const previewSections = [
    {
      title: "프로그램 소개",
      value: description.trim(),
      empty: "프로그램 소개를 입력하면 학부모에게 이렇게 보입니다."
    },
    {
      title: "이런 아이에게 추천해요",
      value: recommendedFor.trim(),
      empty: "추천 대상을 입력하면 학부모가 우리 아이와 맞는지 쉽게 확인할 수 있어요."
    },
    {
      title: "이 수업에서 경험하는 것",
      value: experiencePoints.trim(),
      empty: "아이들이 실제로 경험하게 될 활동을 정리해 주세요."
    },
    {
      title: "커리큘럼",
      value: curriculum.trim(),
      empty: "수업 진행 순서를 적으면 학부모가 전체 흐름을 한눈에 이해할 수 있어요."
    }
  ]
  const refreshDirtyState = useCallback(
    (nextBaseline = false) => {
      const form = formRef.current
      if (!form) {
        return
      }

      const formData = new FormData(form)
      const serialized = serializeFormData(formData)

      if (nextBaseline || !initialSerializedFormRef.current) {
        initialSerializedFormRef.current = serialized
        setIsDirty(false)
        return
      }

      setIsDirty(serialized !== initialSerializedFormRef.current)
    },
    []
  )

  useEffect(() => {
    const orderedTargetGrades = getOrderedTargetGrades(selectedTargetGrades)
    setTargetGradeRangeStart(orderedTargetGrades[0] ?? null)
  }, [selectedTargetGrades])

  useEffect(() => {
    const snapshotKey = initialFormSnapshot.id || "__create__"
    if (initializedSnapshotKeyRef.current === snapshotKey) {
      return
    }

    initializedSnapshotKeyRef.current = snapshotKey
    setSelectedClassId(initialFormSnapshot.id)
    setSelectedProgramType(initialFormSnapshot.programType)
    setRegularPriceType(initialFormSnapshot.regularPriceType)
    setRegularPriceAmount(initialFormSnapshot.regularPriceAmount)
    setRegularPriceNote(initialFormSnapshot.regularPriceNote)
    setTrialPrice(initialFormSnapshot.id ? initialFormSnapshot.trialPrice : "")
    setPriceMode(initialFormSnapshot.id ? Number(initialFormSnapshot.trialPrice) === 0 ? "free" : "paid" : "")
    setScheduleEdited(false)
    setEditedOperatingDraft(null)
    setHasOperatingRuleSelection(Boolean(initialItem?.operatingRule))
    setSelectedAssignmentMode(initialFormSnapshot.assignmentMode)
    setSelectedSubjectCategoryId(initialFormSnapshot.subjectCategoryId)
    setSelectedSubjectId(initialFormSnapshot.subjectId)
    setDescription(initialFormSnapshot.description)
    setSelectedTargetGrades(initialFormSnapshot.targetGrades)
    setRecommendedFor(initialFormSnapshot.recommendedFor)
    setExperiencePoints(initialFormSnapshot.experiencePoints)
    setCurriculum(initialFormSnapshot.curriculum)
    setClassFormatSelection(resolveClassFormatSelection(initialFormSnapshot.classFormat))
    setCustomClassFormat(
      resolveClassFormatSelection(initialFormSnapshot.classFormat) === customClassFormatOptionValue
        ? initialFormSnapshot.classFormat
        : ""
    )
    setSelectedTeacherId(initialFormSnapshot.teacherId)
    setCoverImageUrl(initialFormSnapshot.coverImageUrl)
    setCoverImageUploadError(null)
    setIsUploadingCoverImage(false)
    setScheduleSlots(initialFormSnapshot.scheduleSlots)
    setHeaderTitle(initialItem?.title ?? "")
    setIsActivePreview(initialItem?.isActive ?? true)
  }, [initialFormSnapshot, initialItem?.isActive, initialItem?.operatingRule, initialItem?.title])

  useEffect(() => {
    if (initialSection !== "operations") return
    const frame = window.requestAnimationFrame(() => {
      const section = formRef.current?.querySelector<HTMLDetailsElement>(
        'details[data-class-section="operations"]'
      )
      if (!section) return
      section.open = true
      section.scrollIntoView({ behavior: "smooth", block: "start" })
      section.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialSection])

  useEffect(() => {
    if (selectedAssignmentMode !== "preassigned" || selectedTeacherId) {
      return
    }

    if (mergedTeacherOptions[0]?.teacherId) {
      setSelectedTeacherId(mergedTeacherOptions[0].teacherId)
    }
  }, [mergedTeacherOptions, selectedAssignmentMode, selectedTeacherId])

  useEffect(() => {
    const previousOk = previousOkRef.current
    previousOkRef.current = state.ok

    if (!previousOk && state.ok) {
      refreshDirtyState(true)
      setScheduleEdited(false)
      setEditedOperatingDraft(null)
      if (mode === "create") {
        onCreated?.()
        if (variant === "standalone" && createSuccessHref) {
          try {
            localStorage.removeItem(`studio-class-create-draft:${organizationId}`)
            sessionStorage.removeItem(`studio-class-create-active-session:${organizationId}`)
          } catch {}
          window.location.assign(createSuccessHref)
          return
        }
      }

      if (mode === "update") {
        onUpdated?.()
        if (variant === "standalone" && updateSuccessHref) {
          window.location.assign(updateSuccessHref)
          return
        }
      }

      router.refresh()
    }
  }, [organizationId, createSuccessHref, mode, onCreated, onUpdated, refreshDirtyState, router, state.ok, updateSuccessHref, variant])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      refreshDirtyState(true)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [initialItem?.id, refreshDirtyState])

  useEffect(() => {
    refreshDirtyState()
  }, [
    refreshDirtyState,
    selectedProgramType,
    priceMode,
    trialPrice,
    regularPriceType, regularPriceAmount, regularPriceNote,
    headerTitle,
    isActivePreview,
    selectedSubjectCategoryId,
    selectedSubjectId,
    selectedTargetGrades,
    selectedAssignmentMode,
    selectedTeacherId,
    description,
    recommendedFor,
    experiencePoints,
    curriculum,
    resolvedClassFormat,
    coverImageUrl,
    scheduleSlots
  ])

  const toggleTargetGrade = (grade: string) => {
    const orderedTargetGrades = getOrderedTargetGrades(selectedTargetGrades)
    const hasCompletedRange = orderedTargetGrades.length > 1

    if (orderedTargetGrades.length === 0 || !targetGradeRangeStart || hasCompletedRange) {
      setTargetGradeRangeStart(grade)
      setSelectedTargetGrades([grade])
      return
    }

    setSelectedTargetGrades(getTargetGradeRange(targetGradeRangeStart, grade))
  }

  const todayKey = formatSeoulDateKey(new Date()) ?? ""
  const generatedSlots = useMemo(() => buildCreateClassScheduleDraftSlots(rollingPreviewDraft(createScheduleDraft,todayKey)), [createScheduleDraft,todayKey])
  useEffect(() => {
    if (mode !== "create") return
    setScheduleSlots(generatedSlots.map((slot) => ({
      localId: slot.id, persistedId: "", scheduleType: "one_time", bookingStatus: slot.bookingStatus,
      dayOfWeek: "", specificDate: slot.specificDate, seriesId: slot.seriesId ?? "",
      startTime: slot.startTime, endTime: slot.endTime, capacity: String(slot.capacity), displayLabel: "",
      applicationCount: 0, isReferencedByApplications: false
    })))
  }, [generatedSlots, mode])

  // Only refresh saved schedules when no basic-hours edit is pending. Other form fields stay intact.
  useEffect(() => {
    if (mode !== "update" || scheduleEdited) return
    setScheduleSlots((initialItem?.schedules ?? []).map(createScheduleSlotDraftFromItem))
    setScheduleBaseline(classScheduleSnapshot(initialItem?.schedules ?? []))
  }, [initialItem?.schedules, mode, scheduleEdited])

  const operatingDraft = useMemo(() => mode === "create" ? createScheduleDraft
    : editedOperatingDraft ?? (initialItem?.operatingRule ? classOperatingRuleToDraft(initialItem.operatingRule)
      : createDefaultCreateClassScheduleDraft()),
    [mode, createScheduleDraft, editedOperatingDraft, initialItem?.operatingRule])
  const operatingRulePayload = useMemo(() => {
    if (mode === "update" && !editedOperatingDraft) return ""
    if (!hasOperatingRuleSelection) return ""
    if (!operatingDraft.groups.length) return ""
    try { return JSON.stringify(classOperatingRuleFromDraft(operatingDraft)) } catch { return "" }
  }, [mode, editedOperatingDraft, hasOperatingRuleSelection, operatingDraft])
  const operatingPresentation = useMemo(
    () => presentOperatingDraft(operatingDraft, hasOperatingRuleSelection),
    [hasOperatingRuleSelection, operatingDraft]
  )
  const operatingGroupPresentations = useMemo(
    () => presentOperatingDraftGroups(operatingDraft),
    [operatingDraft]
  )
  const previewSlots = scheduleSlots.filter((slot) => slot.scheduleType === "one_time" && slot.specificDate >= todayKey)
  const subjectLabel = selectedSubjectSelection?.subject.name ?? selectedSubjectCategory?.name ?? "과목 미선택"
  const programLabel = selectedProgramType === "level_test" ? "레벨테스트" : "체험수업"
  const priceLabel = priceMode === "free" ? `무료 ${programLabel}`
    : priceMode === "paid" && /^\d+$/.test(trialPrice) && Number(trialPrice) > 0
      ? `${programLabel} ${Number(trialPrice).toLocaleString("ko-KR")}원` : "가격 미설정"
  const savedVisibility = initialItem?.isActive ? "공개" : "비공개"
  const nextVisibility = isActivePreview ? "공개" : "비공개"
  const visibilitySummaryLabel = mode === "create" ? `등록 후 ${nextVisibility}`
    : savedVisibility === nextVisibility ? `현재 ${nextVisibility}` : `현재 ${savedVisibility} → 저장 후 ${nextVisibility}`
  const operationType = hasOperatingRuleSelection
    ? operatingDraft.isAlwaysOpen ? "rolling" as const : "fixed_period" as const
    : null
  const operatingCapacityValues = useMemo(
    () => new Set(
      operatingDraft.groups
        .flatMap((group) => group.timeRanges.map((range) => range.capacity.trim()))
        .filter(Boolean)
    ),
    [operatingDraft.groups]
  )
  const singleOperatingCapacity = [...operatingCapacityValues][0] ?? operatingDraft.defaultCapacity
  const operatingCapacityLabel = !hasOperatingRuleSelection
    ? "미설정"
    : operatingCapacityValues.size > 1
      ? operatingDraft.timeInputMode === "individual" ? "시간별 다름" : "그룹별 다름"
      : singleOperatingCapacity ? `${singleOperatingCapacity}명` : "미설정"
  const selectedTeacherOption = mergedTeacherOptions.find((option) => option.teacherId === selectedTeacherId)
  const teacherSummaryLabel = isPreassignedMode && selectedTeacherOption
    ? resolveTeacherLabel(selectedTeacherOption)
    : "신청 후 배정"
  const operationsSectionSummary = operatingPresentation
    ? operatingDraft.isAlwaysOpen
      ? `상시 운영 · ${operatingPresentation.detail}`
      : operatingDraft.operationStartDate && operatingDraft.operationEndDate
        ? `기간 지정 · ${formatCompactDate(operatingDraft.operationStartDate)}~${formatCompactDate(operatingDraft.operationEndDate)}`
        : "기간 지정 · 운영 기간 미설정"
    : mode === "update" ? "운영 방식 확인 필요" : "운영 방식 미설정"

  const handleOperatingDraftChange = useCallback((next: CreateClassScheduleDraft) => {
    if (mode === "create") {
      setCreateScheduleDraft(next)
    } else {
      setEditedOperatingDraft(next)
      setScheduleEdited(true)
    }
    setHasOperatingRuleSelection(true)
    setFieldErrors((current) => ({ ...current, schedule: undefined }))
  }, [mode])
  const draftValues = useMemo<ClassFormDraftValues>(() => ({
    title: headerTitle, programType: selectedProgramType, subjectCategoryId: selectedSubjectCategoryId,
    subjectId: selectedSubjectId, targetGrades: selectedTargetGrades, classFormat: resolvedClassFormat,
    trialPrice, priceMode, regularPriceType, regularPriceAmount, regularPriceNote, assignmentMode: selectedAssignmentMode, teacherId: selectedTeacherId,
    description, recommendedFor, experiencePoints, curriculum, coverImageUrl,
    visibility: isActivePreview ? "public" : "private", scheduleDraft: createScheduleDraft
  }), [headerTitle, selectedProgramType, selectedSubjectCategoryId, selectedSubjectId, selectedTargetGrades,
    resolvedClassFormat, trialPrice, priceMode, regularPriceType, regularPriceAmount, regularPriceNote, selectedAssignmentMode, selectedTeacherId, description,
    recommendedFor, experiencePoints, curriculum, coverImageUrl, isActivePreview, createScheduleDraft])
  const restoreDraft = useCallback((draft: ClassFormDraftValues) => {
    setHeaderTitle(draft.title); setSelectedProgramType(draft.programType)
    const subject = findSubjectCatalogSelection(safeSubjectCatalog, draft.subjectId)
    const category = findSubjectCatalogCategory(safeSubjectCatalog, draft.subjectCategoryId) ?? subject?.category
    setSelectedSubjectCategoryId(category?.id ?? "")
    setSelectedSubjectId(subject?.category.id === category?.id ? subject?.subject.id ?? "" : "")
    setSelectedTargetGrades(getOrderedTargetGrades(draft.targetGrades))
    setClassFormatSelection(resolveClassFormatSelection(draft.classFormat)); setCustomClassFormat(draft.classFormat)
    setRegularPriceType(draft.regularPriceType ?? ""); setRegularPriceAmount(draft.regularPriceAmount ?? ""); setRegularPriceNote(draft.regularPriceNote ?? "")
    setTrialPrice(draft.trialPrice); setPriceMode(draft.priceMode); setSelectedAssignmentMode(draft.assignmentMode)
    setSelectedTeacherId(draft.teacherId); setDescription(draft.description); setRecommendedFor(draft.recommendedFor)
    setExperiencePoints(draft.experiencePoints); setCurriculum(draft.curriculum); setCoverImageUrl(draft.coverImageUrl)
    setIsActivePreview(draft.visibility === "public"); setCreateScheduleDraft(normalizeStoredScheduleDraft(draft.scheduleDraft))
    setHasOperatingRuleSelection(draft.scheduleDraft.groups.length > 0)
  }, [safeSubjectCatalog])
  const { pendingDraft, chooseDraft, storageUnavailable } = useClassCreateDraft(
    mode === "create", organizationId, draftValues, restoreDraft, state.ok
  )

  const focusError = useCallback((key: FieldErrorKey) => {
    const field = formRef.current?.querySelector<HTMLElement>(`[data-field="${key}"]`)
      ?? formRef.current?.querySelector<HTMLElement>(`[name="${key}"]`)
    // Reveal the existing controls before moving focus; validation and submitted values are unchanged.
    const section = field?.closest<HTMLDetailsElement>("details[data-class-section]")
    if (section) section.open = true
    field?.scrollIntoView({ behavior: "smooth", block: "center" })
    const focusable = field?.matches("input, textarea, select, button") ? field
      : field?.querySelector<HTMLElement>("input:not([type=hidden]), select, button, textarea")
    focusable?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!state.message || state.ok) return
    const key: FieldErrorKey | null = /예약시간|일정|정원|운영 방식|운영 규칙/.test(state.message) ? "schedule"
      : /과목/.test(state.message) ? "subject" : /선생님/.test(state.message) ? "teacher"
      : /정규 수강료/.test(state.message) ? "regularPrice" : /신청비/.test(state.message) ? "price" : /소개/.test(state.message) ? "description" : null
    if (key) { setFieldErrors((current) => ({ ...current, [key]: state.message })); focusError(key) }
    else document.getElementById("class-save-feedback")?.focus()
    if (/다른 작업에서 변경/.test(state.message)) router.refresh()
  }, [state, focusError, router])

  const validateForm = (event: React.FormEvent<HTMLFormElement>) => {
    const errors: Partial<Record<FieldErrorKey, string>> = {}
    const scheduleValidation = mode === "create" || editedOperatingDraft
      ? validateOperatingScheduleDraft(operatingDraft)
      : null
    if (headerTitle.trim().length < 2) errors.title = "수업명은 2자 이상 입력해 주세요."
    if (!selectedSubjectCategoryId) errors.subject = "과목 분류를 선택해 주세요."
    if (!selectedTargetGrades.length) errors.targetGrades = "대상 학년을 선택해 주세요."
    if (!priceMode) errors.price = "무료 또는 유료를 선택해 주세요."
    else if (priceMode === "paid" && (!/^\d+$/.test(trialPrice.trim()) || Number(trialPrice) <= 0)) {
      errors.price = "유료 비용은 1원 이상의 정수로 입력해 주세요. 무료는 무료 항목을 선택해 주세요."
    }
    const regularPrice = parseRegularPrice({ type: regularPriceType, amount: regularPriceAmount, note: regularPriceNote })
    if (!regularPrice.ok) errors.regularPrice = regularPrice.message
    if (isPreassignedMode && !selectedTeacherId) errors.teacher = "담당 선생님을 선택해 주세요."
    if (description.trim().length < 10) errors.description = "수업 소개는 10자 이상 입력해 주세요."
    if (mode === "create" && !hasOperatingRuleSelection)
      errors.schedule = "운영 방식을 선택해 주세요."
    else if ((mode === "create" || editedOperatingDraft) && !operatingDraft.isAlwaysOpen
      && (!operatingDraft.operationStartDate || !operatingDraft.operationEndDate
        || operatingDraft.operationEndDate < operatingDraft.operationStartDate))
      errors.schedule = "운영 기간을 입력해 주세요."
    else if (scheduleValidation === "duration") errors.schedule = "체험수업 시간을 선택해 주세요."
    else if (scheduleValidation === "weekday" || scheduleValidation === "duplicate_weekday")
      errors.schedule = "운영 요일을 선택해 주세요. 같은 요일은 한 그룹에서만 사용할 수 있어요."
    else if (scheduleValidation === "capacity") errors.schedule = "회차당 정원을 입력해 주세요."
    else if (scheduleValidation === "slot_limit") errors.schedule = "주간 예약 가능 시간은 336개 이하로 설정해 주세요."
    else if (scheduleValidation) errors.schedule = "운영 시간을 확인해 주세요."
    else if ((mode === "create" || editedOperatingDraft) && !operatingRulePayload)
      errors.schedule = "운영 요일과 시간을 확인해 주세요."
    else if (mode === "create" && isActivePreview && !scheduleSlots.length)
      errors.schedule = "공개하려면 예약시간을 1개 이상 설정해 주세요."
    setFieldErrors(errors)
    const first = Object.keys(errors)[0] as FieldErrorKey | undefined
    if (first || isUploadingCoverImage || pendingDraft) {
      event.preventDefault()
      if (first) focusError(first)
    }
  }
  const renderError = (key: FieldErrorKey) => fieldErrors[key]
    ? <p id={`class-error-${key}`} className={styles.errorText} role="alert">{fieldErrors[key]}</p> : null

  const handleCoverImageChange = async (file: File | null) => {
    if (!file) return
    setCoverImageUploadError(null)
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCoverImageUploadError("JPEG, PNG, WebP 파일만 업로드할 수 있어요."); return
    }
    if (file.size > 5 * 1024 * 1024) {
      setCoverImageUploadError("이미지는 5MB 이하만 업로드할 수 있어요."); return
    }
    setIsUploadingCoverImage(true)
    try {
      const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp"
      const client = getSupabaseBrowserClient()
      const objectName = `${organizationId}/${crypto.randomUUID()}.${extension}`
      const { error } = await client.storage.from("class-covers").upload(objectName, file, { contentType: file.type, upsert: false })
      if (error) throw error
      const { data } = client.storage.from("class-covers").getPublicUrl(objectName)
      if (!data.publicUrl) throw new Error("missing_public_url")
      // Only a successfully uploaded image becomes both the preview and the persisted value.
      setCoverImageUrl(data.publicUrl)
    } catch (error) {
      console.error("[class cover upload failed]", error)
      setCoverImageUploadError("이미지를 업로드하지 못했어요. 기존 이미지는 유지됩니다. 다시 선택해 주세요.")
    } finally { setIsUploadingCoverImage(false) }
  }

  const programTypeField = <div className={styles.field}>
    <span className={styles.fieldLabel}>수업 유형 *</span>
    <div className={styles.chipGroup}>{programTypeOptions.map((option) => (
      <button key={option.value} type="button" aria-pressed={selectedProgramType === option.value}
        disabled={isPending} onClick={() => setSelectedProgramType(option.value)}
        className={`${styles.chipButton} ${selectedProgramType === option.value ? styles.chipButtonSelected : ""}`}>{option.label}</button>
    ))}</div>
  </div>

  const sectionSummaries = {
    basic: [headerTitle || "수업 정보 입력", previewTargetGradeLabel].filter(Boolean).join(" · "),
    price: priceLabel,
    operations: operationsSectionSummary,
    description: [description.trim() && "소개", recommendedFor.trim() && "추천 대상", experiencePoints.trim() && "경험", curriculum.trim() && "커리큘럼"].filter(Boolean).join(" · ") || "소개·추천 대상·커리큘럼",
    image: previewImageUrl ? "대표 이미지 1개" : "대표 이미지 없음",
    visibility: visibilitySummaryLabel
  }
  const renderSectionHeader = (id: (typeof formSections)[number][0]) => {
    const index = formSections.findIndex(([key]) => key === id)
    const errorKeys: Record<typeof id, FieldErrorKey[]> = {
      basic: ["title", "subject", "targetGrades"], price: ["price", "regularPrice"], operations: ["teacher", "schedule"],
      description: ["description"], image: [], visibility: ["visibility"]
    }
    const hasError = errorKeys[id].some((key) => fieldErrors[key])
    return <summary className={styles.sectionHeading}>
      <span className={styles.sectionLetter} aria-hidden="true">{String.fromCharCode(65 + index)}</span>
      <h2 id={`class-${id}-title`}>{formSections[index][1]}</h2>
      {hasError ? <span className={styles.sectionError}>확인 필요</span> : null}
      <span className={styles.sectionSummary}>{sectionSummaries[id]}</span>
      <span className={styles.sectionChevron} aria-hidden="true" />
    </summary>
  }
  const teacherAssignmentField = <div className={styles.field} data-field="teacher">
    <label htmlFor={`${resolvedFormId}-teacher`} className={styles.fieldLabel}>담당 선생님</label>
    <select id={`${resolvedFormId}-teacher`} name="teacherId" value={isPreassignedMode ? selectedTeacherId : ""} onChange={(event) => {
      const teacherId = event.target.value
      setSelectedTeacherId(teacherId)
      setSelectedAssignmentMode(teacherId ? "preassigned" : "post_assign")
      setFieldErrors((current) => ({ ...current, teacher: undefined }))
    }} disabled={isPending} className={styles.select} aria-invalid={Boolean(fieldErrors.teacher)}>
      <option value="">신청 후 배정</option>
      {mergedTeacherOptions.map((option) => <option key={option.teacherId} value={option.teacherId}>
        {resolveTeacherLabel(option)}{fallbackTeacherOption?.teacherId === option.teacherId ? " (현재 비활성 선생님)" : ""}
      </option>)}
    </select>
    <span className={styles.fieldHint}>{teacherOptionsError ? "선생님 목록을 불러오지 못했습니다. 다시 불러온 뒤 확인해 주세요."
      : isTeacherSelectionLockedToInactive ? "기존 비활성 담당자를 유지하거나 다른 선생님을 선택할 수 있습니다."
      : isPreassignedMode ? "새 신청은 선택한 선생님에게 자동으로 배정돼요."
      : "신청이 들어오면 적절한 선생님을 배정해요."}</span>
    {renderError("teacher")}
  </div>

  return (
    <section id="studio-class-form" className={styles.page}>
      <header className={styles.pageHeader}>
        <div><Link href={classesHref} className={styles.backLink}>← 수업 관리</Link>
          <h1>{mode === "create" ? "수업 등록" : "수업 수정"}</h1>
          <p>수업 정보와 체험 운영을 한 곳에서 정리하세요.</p></div>
        {mode === "update" && <span className={styles.dirtyText} role="status">{isDirty || scheduleEdited ? "저장하지 않은 변경사항" : "변경사항 없음"}</span>}
      </header>
      {pendingDraft && <div className={styles.draftNotice} role="status">
        <span>이 브라우저에 작성 중인 내용이 있습니다.</span>
        <button type="button" className={styles.draftContinue} onClick={() => chooseDraft(true)}>이어쓰기</button>
        <button type="button" className={styles.draftReset} onClick={() => chooseDraft(false)}>새로 작성</button>
      </div>}
      <form data-class-form id={resolvedFormId} ref={formRef} action={formAction} noValidate onSubmit={validateForm}
        className={styles.unifiedForm} onInput={() => refreshDirtyState()} onChange={() => refreshDirtyState()}>
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="classId" value={selectedClassId} />
        <input type="hidden" name="programType" value={selectedProgramType} />
        <input type="hidden" name="assignmentMode" value={selectedAssignmentMode} />
        <input type="hidden" name="classFormat" value={resolvedClassFormat} />
        <input type="hidden" name="subjectCategoryId" value={selectedSubjectCategoryId} />
        <input type="hidden" name="subjectId" value={selectedSubjectId} />
        <input type="hidden" name="coverImageUrl" value={coverImageUrl} />
        <input type="hidden" name="regularPriceType" value={regularPriceType} />
        <input type="hidden" name="regularPriceAmount" value={regularPriceType === "monthly" || regularPriceType === "per_session" ? regularPriceAmount : ""} />
        <input type="hidden" name="regularPriceNote" value={regularPriceType ? regularPriceNote : ""} />
        <input type="hidden" name="trialPrice" value={priceMode === "free" ? "0" : trialPrice} />
        <input type="hidden" name="enforcePublicSlotGuard" value={mode === "create" ? "true" : "false"} />
        <input type="hidden" name="scheduleWriteMode" value={scheduleEdited ? "replace" : "preserve"} />
        <input type="hidden" name="scheduleSnapshot" value={scheduleBaseline} />
        <input type="hidden" name="operatingRule" value={operatingRulePayload} />
        <input type="hidden" name="operatingRuleRevision" value={operatingRuleRevision} />
        {selectedTargetGrades.map((grade) => <input key={grade} type="hidden" name="targetGrades" value={grade} />)}
        {scheduleSlots.map((slot) => <Fragment key={slot.localId}>
          <input type="hidden" name="slotId" value={slot.persistedId} />
          <input type="hidden" name="slotScheduleType" value={slot.scheduleType} />
          <input type="hidden" name="slotDayOfWeek" value={slot.dayOfWeek} />
          <input type="hidden" name="slotSpecificDate" value={slot.specificDate} />
          <input type="hidden" name="slotSeriesId" value={slot.seriesId} />
          <input type="hidden" name="slotBookingStatus" value={slot.bookingStatus} />
          <input type="hidden" name="slotStartTime" value={slot.startTime} />
          <input type="hidden" name="slotEndTime" value={slot.endTime} />
          <input type="hidden" name="slotCapacity" value={slot.capacity} />
          <input type="hidden" name="slotDisplayLabel" value={slot.displayLabel} />
        </Fragment>)}
        <div className={styles.sections}>
          <details data-class-section="basic" open={true} id="class-section-basic" className={styles.formSection} aria-labelledby="class-basic-title">
            {renderSectionHeader("basic")}
            <div className={styles.sectionBody}>
                    <div className={styles.basicInfoGrid}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>수업명 * </span>
                        <input
                          name="title"
                          value={headerTitle}
                          onChange={(event) => setHeaderTitle(event.target.value)}
                          aria-invalid={Boolean(fieldErrors.title)}
                          aria-describedby="class-error-title"
                          required
                          minLength={2}

                          disabled={isPending}
                          placeholder={fieldExamples.title}
                          className={styles.input}
                        />
                        {renderError("title")}
                      </label>

                      {programTypeField}
                      <div className={styles.field} data-field="subject">
                        <span className={styles.fieldLabel}>과목 *</span>
                        <StudioSubjectSelector
                          catalog={safeSubjectCatalog}
                          categoryId={selectedSubjectCategoryId}
                          subjectId={selectedSubjectId}
                          onCategoryChange={setSelectedSubjectCategoryId}
                          onSubjectChange={setSelectedSubjectId}
                          disabled={isPending}
                          catalogError={subjectCatalogError}
                          error={fieldErrors.subject}
                          legacySubjectLabel={
                            legacySubjectValue && !selectedSubjectCategoryId
                              ? getSubjectLabel(legacySubjectValue) ?? legacySubjectValue
                              : null
                          }
                        />
                      </div>

                      <div className={styles.field} data-field="targetGrades">
                        <span className={styles.fieldLabel}>대상 학년 *</span>
                        <div className={styles.gradeGroupList}>
                          {LEARNER_GRADE_GROUPS.map((group) => (
                            <div key={group.value} className={styles.gradeGroup}>
                              <span className={styles.gradeGroupLabel}>{group.label}</span>
                              <div className={styles.chipGroup}>
                                {getLearnerGradesByGroup(group.value).map((option) => {
                                  const isSelected = selectedTargetGrades.includes(option.value)

                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => toggleTargetGrade(option.value)}
                                      disabled={isPending}
                                      aria-pressed={isSelected}
                                      className={`${styles.chipButton} ${isSelected ? styles.chipButtonSelected : ""}`}
                                    >
                                      {option.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <span className={styles.fieldHint}>
                          시작 학년과 마지막 학년을 선택하면 사이 학년이 자동으로 선택됩니다.
                        </span>
                        <span className={styles.fieldHint}>
                          {selectedTargetGrades.length > 0
                            ? `선택한 대상 학년: ${formatStoredTargetGrades(selectedTargetGrades.join(","))}`
                            : "여러 학년을 선택할 수 있습니다."}
                        </span>
                        {legacyTargetAgeValue ? (
                          <span className={styles.fieldHint}>
                            기존 저장값은 `{formatStoredTargetGrades(legacyTargetAgeValue)}` 입니다. 수정 저장 시에는 학년을
                            다시 선택해 주세요.
                          </span>
                        ) : null}
                        {renderError("targetGrades")}
                      </div>

                      <div className={styles.field}>
                        <label htmlFor={`${resolvedFormId}-class-format`} className={styles.fieldLabel}>
                          수업 방식 (선택)
                        </label>
                        <select
                          id={`${resolvedFormId}-class-format`}
                          value={classFormatSelection}
                          onChange={(event) => setClassFormatSelection(event.target.value)}
                          disabled={isPending}
                          className={styles.select}
                        >
                          <option value="">선택해 주세요</option>
                          {standardizedClassFormatOptions.map((option) => (
                            <option
                              key={option}
                              value={option === "기타" ? customClassFormatOptionValue : option}
                            >
                              {option}
                            </option>
                          ))}
                        </select>
                        <span className={styles.fieldHint}>학생이 어떤 형태로 수업을 진행하는지 선택해 주세요.</span>
                        {classFormatSelection === customClassFormatOptionValue ? (
                          <div className={styles.field}>
                            <label htmlFor={`${resolvedFormId}-class-format-custom`} className={styles.fieldLabel}>
                              직접 입력
                            </label>
                            <input
                              id={`${resolvedFormId}-class-format-custom`}
                              value={customClassFormat}
                              onChange={(event) => setCustomClassFormat(event.target.value)}
                              disabled={isPending}
                              placeholder="예) 프로젝트형 수업"
                              className={styles.input}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
            </div>
          </details>
          <details data-class-section="price" open={undefined} id="class-section-price" className={styles.formSection} aria-labelledby="class-price-title">
            {renderSectionHeader("price")}
            <div className={styles.sectionBody}>
            <div className={styles.field} data-field="price"><span className={styles.fieldLabel}>{programLabel === "체험수업" ? "체험수업 가격" : "레벨테스트 비용"} *</span>
              <p className={styles.fieldHint}>1회 신청 비용입니다. 무료 여부를 선택해 주세요.</p>
              <div className={styles.priceChoices}>
                <label className={styles.radioCard}><input type="radio" name="priceChoice" value="free" checked={priceMode === "free"} onChange={() => setPriceMode("free")} disabled={isPending} /><strong>무료</strong></label>
                <label className={styles.radioCard}><input type="radio" name="priceChoice" value="paid" checked={priceMode === "paid"} onChange={() => setPriceMode("paid")} disabled={isPending} /><strong>유료</strong></label>
                {priceMode === "paid" && <label className={styles.priceInput}><input aria-label={`${programLabel} 유료 비용`} type="number" min={1} step={1} inputMode="numeric" value={trialPrice === "0" ? "" : trialPrice}
                  onChange={(event) => setTrialPrice(event.target.value)} disabled={isPending} className={styles.input} placeholder="금액 입력" aria-invalid={Boolean(fieldErrors.price)} aria-describedby="class-error-price" /><span>원</span></label>}
              </div>{renderError("price")}
            </div>
            <div className={styles.regularPriceFields} data-field="regularPrice">
              <label className={styles.fieldLabel} htmlFor="regular-price-type">정규 수강료 <span className={styles.fieldHint}>(선택)</span></label>
              <p className={styles.fieldHint}>정규수업의 수강료 안내입니다. 학부모 수업 상세에 표시됩니다.</p>
              <div className={styles.regularPriceRow}>
                <select id="regular-price-type" className={styles.select} value={regularPriceType} disabled={isPending}
                  onChange={(event) => {
                    const next = event.target.value as RegularPriceType | ""
                    setRegularPriceType(next)
                    if (!next || next === "consultation") setRegularPriceAmount("")
                    if (!next) setRegularPriceNote("")
                  }}>
                  <option value="">표시하지 않음</option>
                  <option value="monthly">월 수강료</option>
                  <option value="per_session">회당 수강료</option>
                  <option value="consultation">상담 후 안내</option>
                </select>
                {(regularPriceType === "monthly" || regularPriceType === "per_session") && <label className={styles.priceInput}>
                  <input aria-label="정규 수강료 금액" className={styles.input} inputMode="numeric" type="text"
                    value={formatRegularPriceInput(regularPriceAmount)} disabled={isPending} placeholder="금액 입력"
                    onChange={(event) => setRegularPriceAmount(event.target.value.replace(/,/g, ""))}
                    aria-invalid={Boolean(fieldErrors.regularPrice)} aria-describedby="class-error-regularPrice" />
                  <span>원</span>
                </label>}
              </div>
              {regularPriceType && <label className={styles.field}>
                <span className={styles.fieldLabel}>추가 안내 (선택)</span>
                <input className={styles.input} aria-label="정규 수강료 추가 안내" value={regularPriceNote}
                  onChange={(event) => setRegularPriceNote(event.target.value)} maxLength={REGULAR_PRICE_NOTE_MAX_LENGTH}
                  disabled={isPending} placeholder="예: 주 2회 기준, 교재비 별도" />
              </label>}
              {renderError("regularPrice")}
            </div>
            </div>
          </details>
          <details data-class-section="operations" open={undefined} id="class-section-operations" className={styles.formSection} aria-labelledby="class-operations-title">
            {renderSectionHeader("operations")}
            <div className={styles.sectionBody}>
            <div className={styles.operationBlock} data-field="schedule">
              {mode === "update" && !initialItem?.operatingRule && !editedOperatingDraft ? <div className={styles.legacyNotice}>
                <strong>앞으로의 운영 일정을 설정해 주세요.</strong>
                <p>기존 일정과 예약은 그대로 유지됩니다.</p>
              </div> : null}
              <StudioClassOperationEditor
                value={operatingDraft}
                operationType={operationType}
                todayKey={todayKey}
                disabled={isPending}
                onChange={handleOperatingDraftChange}
              />
              {renderError("schedule")}
              {hasOperatingRuleSelection ? teacherAssignmentField
                : <input type="hidden" name="teacherId" value={isPreassignedMode ? selectedTeacherId : ""} />}
              {mode === "update" && (initialItem?.operatingRule || editedOperatingDraft) ? <div className={styles.protectionInfo}>
                <span aria-hidden="true">i</span>
                <p>기존에 등록된 일정과 예약은 그대로 유지돼요.</p>
              </div> : null}
              {mode === "update" && hasOperatingRuleSelection ? <button type="button" className={styles.dateOverrideAction}
                disabled={scheduleEdited || isPending} onClick={() => setOperationsOpen(true)}>
                <span><strong>특정 날짜만 변경하기</strong><small>휴무일이나 특별 운영일의 시간을 변경할 수 있어요.</small></span>
                <span aria-hidden="true">›</span>
              </button> : null}
              {scheduleEdited ? <div className={styles.pendingOperationNote}>
                <p>운영 일정 변경사항을 저장하면 특정 날짜 변경을 다시 사용할 수 있어요.</p>
                <button type="button" className={styles.textButton} onClick={() => { setScheduleEdited(false); setEditedOperatingDraft(null); setHasOperatingRuleSelection(Boolean(initialItem?.operatingRule)); setFieldErrors((current) => ({ ...current, schedule: undefined })); router.refresh() }}>운영 일정 변경 되돌리기</button>
              </div> : null}
            </div>
            </div>
          </details>
          <details data-class-section="description" open={undefined} id="class-section-description" className={styles.formSection} aria-labelledby="class-description-title">
            {renderSectionHeader("description")}
            <div className={styles.sectionBody}>
                    <div className={styles.detailsGrid}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>수업 소개 *</span>
                        <textarea
                          name="description"
                          aria-invalid={Boolean(fieldErrors.description)}
                          aria-describedby="class-error-description"
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          required
                          minLength={10}
                          rows={3}
                          disabled={isPending}
                          placeholder={fieldExamples.description}
                          className={styles.textarea}
                        />
                        <span className={styles.fieldHint}>수업의 특징과 진행 방식을 10자 이상 소개해 주세요.</span>
                        {renderError("description")}
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>이런 아이에게 추천해요 (선택)</span>
                        <span className={styles.fieldHint}>어떤 관심이나 학습 상황의 아이에게 잘 맞는지 적어 주세요.</span>
                        <textarea
                          name="recommendedFor"
                          value={recommendedFor}
                          onChange={(event) => setRecommendedFor(event.target.value)}
                          rows={2}
                          disabled={isPending}
                          placeholder={fieldExamples.recommendedFor}
                          className={`${styles.textarea} ${styles.compactTextarea}`}
                        />
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>이 수업에서 경험하는 것 (선택)</span>
                        <span className={styles.fieldHint}>아이가 직접 해보는 활동과 얻어가는 경험을 적어 주세요.</span>
                        <textarea
                          name="experiencePoints"
                          value={experiencePoints}
                          onChange={(event) => setExperiencePoints(event.target.value)}
                          rows={2}
                          disabled={isPending}
                          placeholder={fieldExamples.experiencePoints}
                          className={`${styles.textarea} ${styles.compactTextarea}`}
                        />
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>커리큘럼 (선택)</span>
                        <span className={styles.fieldHint}>도입부터 마무리까지 수업 순서를 적어 주세요.</span>
                        <textarea
                          name="curriculum"
                          value={curriculum}
                          onChange={(event) => setCurriculum(event.target.value)}
                          rows={2}
                          disabled={isPending}
                          placeholder={fieldExamples.curriculum}
                          className={`${styles.textarea} ${styles.compactTextarea}`}
                        />
                      </label>
                    </div>
            </div>
          </details>
          <details data-class-section="image" open={undefined} id="class-section-image" className={styles.formSection} aria-labelledby="class-image-title">
            {renderSectionHeader("image")}
            <div className={styles.sectionBody}>
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>대표 이미지</span>
                      {/* Create 와 같은 문법: 이미지 자리 자체가 업로드 트리거다. */}
                      <label className={styles.uploader}>
                        <input
                          type="file"
                          aria-label="대표 이미지 업로드"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={isPending || isUploadingCoverImage}
                          className={styles.uploaderInput}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            void handleCoverImageChange(file ?? null)
                            event.target.value = ""
                          }}
                        />
                        {previewImageUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={previewImageUrl}
                              alt={`${initialItem?.title ?? "프로그램"} 대표 이미지 미리보기`}
                              className={styles.uploaderImage}
                            />
                            <span className={styles.uploaderOverlay}>
                              {isUploadingCoverImage ? "업로드 중..." : "이미지 변경"}
                            </span>
                          </>
                        ) : (
                          <span className={styles.uploaderEmpty}>
                            <span className={styles.uploaderEmptyTitle}>대표 이미지 등록</span>
                            <span className={styles.uploaderEmptyHint}>
                              {isUploadingCoverImage ? "업로드 중..." : "이미지를 클릭해 업로드하세요"}
                            </span>
                            <span className={styles.uploaderEmptyMeta}>
                              1200 × 900px · 4:3 · JPG · PNG · WebP · 5MB 이하
                            </span>
                          </span>
                        )}
                      </label>
                    </div>

                    {coverImageUploadError ? (
                      <p className={`${styles.feedbackMessage} ${styles.feedbackMessageError}`}>{coverImageUploadError}</p>
                    ) : null}
            </div>
          </details>
          <details data-class-section="visibility" open={undefined} id="class-section-visibility" className={styles.formSection} aria-labelledby="class-visibility-title">
            {renderSectionHeader("visibility")}
            <div className={styles.sectionBody}>
            <label className={styles.visibilitySetting}>
              <span><strong>학부모에게 공개</strong><small>{isActivePreview ? "저장 후 공개 설정이 적용됩니다." : "비공개 수업은 학부모에게 표시되지 않습니다."}</small></span>
              <input type="checkbox" name="isActive" checked={isActivePreview} onChange={(event) => setIsActivePreview(event.target.checked)} disabled={isPending} />
            </label>
            {mode === "update" && !scheduleSlots.length && isActivePreview && <p className={styles.fieldHint}>설정된 예약시간이 없습니다. 신청받을 시간을 확인해 주세요.</p>}
            </div>
          </details>
        </div>
        <aside className={styles.summaryRail} aria-label="수업 요약 및 저장">
          <div className={styles.summaryCard}>
            <div className={styles.summaryHeader}>수업 미리보기</div>
            <div className={styles.summaryContent}>
              <div className={styles.summaryImageFrame}>
                {previewImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewImageUrl} alt="대표 이미지" className={styles.summaryImage} />
                ) : <div className={styles.summaryImageEmpty}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg>
                  <span>대표 이미지 미등록</span>
                </div>}
                <span className={styles.programBadge}>{programLabel}</span>
              </div>
            <h2>{headerTitle || "수업명을 입력해 주세요"}</h2>
            <ClassPreviewBasicInfo
              subject={subjectLabel}
              target={previewTargetGradeLabel || "학년 미선택"}
              classFormat={resolvedClassFormat || "선택 안 함"}
            />
            <strong className={styles.summaryPrice}>{priceLabel}</strong>
            {operatingPresentation ? <dl className={styles.operationSummary}>
              <div><dt>운영 방식</dt><dd>{operatingPresentation.title}</dd></div>
              {!operatingDraft.isAlwaysOpen ? <div><dt>운영 기간</dt><dd>{operatingDraft.operationStartDate && operatingDraft.operationEndDate
                ? `${operatingDraft.operationStartDate.replaceAll("-", ".")} ~ ${operatingDraft.operationEndDate.replaceAll("-", ".")}`
                : "기간 미설정"}</dd></div> : null}
              <div><dt>체험수업 시간</dt><dd>{operatingDraft.intervalMinutes ? `${operatingDraft.intervalMinutes}분` : "미설정"}</dd></div>
              <div><dt>운영 시간</dt><dd>{operatingGroupPresentations.length > 0
                ? operatingGroupPresentations.map((group) => `${group.weekdayLabel} · ${group.timeLabel}`).join(" / ")
                : "요일·시간 미설정"}</dd></div>
              <div><dt>회차당 정원</dt><dd>{operatingCapacityLabel}</dd></div>
              <div><dt>담당 선생님</dt><dd>{teacherSummaryLabel}</dd></div>
            </dl> : null}
            <p className={styles.visibilityStatus}><span>공개 상태</span><strong>{visibilitySummaryLabel}</strong></p>
            </div>
            <div className={styles.summaryFooter}>
            <div className={styles.summaryActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setPreviewOpen(true)}>수업 미리보기</button>
              <button type="submit" disabled={isPending || isUploadingCoverImage || Boolean(pendingDraft)} className={styles.saveButton}>{isPending ? "저장 중…" : mode === "create" ? "수업 등록하기" : "변경사항 저장"}</button>
            </div>
            <div id="class-save-feedback" tabIndex={-1} aria-live="polite">
              {Object.values(fieldErrors).some(Boolean) ? <p className={styles.errorText}>입력 내용을 확인해 주세요. 표시된 항목을 수정한 뒤 다시 저장할 수 있습니다.</p>
                : state.message ? <p className={state.ok ? styles.successText : styles.errorText}>{state.message}</p> : null}
              {isUploadingCoverImage && <p className={styles.fieldHint}>이미지를 업로드하고 있습니다.</p>}
            </div>
            {mode === "create" && <p className={styles.storageHint}>{storageUnavailable ? "브라우저 저장 공간을 사용할 수 없어 자동 보관되지 않습니다." : "작성 중인 내용은 이 브라우저에 임시 보관됩니다."}</p>}
            </div>
          </div>
        </aside>
      </form>
      {previewOpen && <StudioClassFormDialog title="수업 미리보기" onClose={() => setPreviewOpen(false)}>
        <p className={styles.fieldHint}>작성 중인 내용을 미리 확인하는 화면입니다. 저장 전에는 공개되지 않습니다.</p>
        {previewImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewImageUrl} alt="수업 대표 이미지" className={styles.parentPreviewImage} />
        ) : null}
        <p className={styles.previewMeta}>{programLabel} · {subjectLabel} · {previewTargetGradeLabel || "대상 미선택"}</p>
        <h2>{headerTitle || "수업명"}</h2><p>{resolvedClassFormat}</p><strong className={styles.summaryPrice}>{priceLabel}</strong>
        {previewSections.map((section) => <section key={section.title} className={styles.parentPreviewSection}><h3>{section.title}</h3><p>{section.value || section.empty}</p></section>)}
        <section className={styles.parentPreviewSection}><h3>체험 일정</h3>{previewSlots.length ? <ul>{previewSlots.slice(0, 6).map((slot) => <li key={slot.localId}>{slot.specificDate} {slot.startTime}–{slot.endTime}</li>)}</ul> : <p>예약시간이 아직 설정되지 않았습니다.</p>}</section>
      </StudioClassFormDialog>}
      {operationsOpen && selectedClassId && scheduleCalendarMonth && <StudioClassFormDialog busy={operationsBusy} title="특정 날짜 변경" onClose={() => { setOperationsOpen(false); router.refresh() }}>
        <p className={styles.notice}>휴무일이나 특별 운영일 변경은 즉시 저장됩니다.</p>
        {scheduleCalendarError ? <p role="alert" className={styles.errorText}>{scheduleCalendarError}</p> : <StudioClassScheduleEditor operationsOnly onPendingChange={setOperationsBusy} classId={selectedClassId} month={scheduleCalendarMonth} days={scheduleCalendarDays} scheduleSlots={scheduleSlots} onChangeScheduleSlots={setScheduleSlots} />}
      </StudioClassFormDialog>}
    </section>
  )
}
