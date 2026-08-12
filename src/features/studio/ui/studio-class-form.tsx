"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  formatStoredTargetGrades,
  parseStoredTargetGrades
} from "@/shared/constants/grade-options"
import {
  CHILD_GRADES,
  getSubjectLabel
} from "@/shared/constants/education-taxonomy"
import {
  academyAreaConfigs,
  getAcademyAreaConfig,
  normalizeAcademyArea,
  type AcademyArea
} from "@/shared/config/academy-areas"
import {
  upsertStudioClassAction,
  type UpsertStudioClassActionState
} from "@/features/studio/actions/upsert-studio-class"
import { getStudioClassFieldExamples } from "@/features/studio/lib/studio-class-field-examples"
import {
  normalizeStudioClassSubjectOption,
  studioClassSubjectOptions
} from "@/features/studio/lib/studio-class-options"
import { StudioClassScheduleEditor } from "@/features/studio/ui/studio-class-schedule-editor"
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
import styles from "./studio-class-form.module.css"

type StudioClassFormProps = {
  organizationId: string
  currentTeacherId: string
  teacherOptions: StudioTeacherOption[]
  teacherOptionsError: string | null
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

type EditFormTabId = "info" | "schedule" | "visibility"

const editFormTabs: Array<{
  id: EditFormTabId
  label: string
}> = [
  { id: "info", label: "수업 정보" },
  { id: "schedule", label: "예약 시간" },
  { id: "visibility", label: "공개 · 신청 설정" }
]

const CHILD_GRADE_ORDER: string[] = CHILD_GRADES.map((item) => item.value)

const getOrderedTargetGrades = (values: readonly string[]) => {
  const selectedSet = new Set(values)
  return CHILD_GRADE_ORDER.filter((value) => selectedSet.has(value))
}

const getTargetGradeRange = (start: string, end: string) => {
  const startIndex = CHILD_GRADE_ORDER.indexOf(start)
  const endIndex = CHILD_GRADE_ORDER.indexOf(end)

  if (startIndex < 0 || endIndex < 0) {
    return start ? [start] : []
  }

  const rangeStart = Math.min(startIndex, endIndex)
  const rangeEnd = Math.max(startIndex, endIndex)
  return CHILD_GRADE_ORDER.slice(rangeStart, rangeEnd + 1)
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

const resolveClassFormatSelection = (value: string) => {
  const normalized = value.trim()

  if (!normalized) {
    return ""
  }

  return standardizedClassFormatOptions.includes(normalized as (typeof standardizedClassFormatOptions)[number])
    ? normalized
    : customClassFormatOptionValue
}

const serializeFormData = (formData: FormData) =>
  Array.from(formData.entries())
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

export const StudioClassForm = ({
  organizationId,
  currentTeacherId,
  teacherOptions,
  teacherOptionsError,
  initialItem,
  onCreated,
  onUpdated,
  variant = "default",
  formId,
  createSuccessHref,
  updateSuccessHref,
  scheduleCalendarMonth,
  scheduleCalendarDays = [],
  scheduleCalendarError
}: StudioClassFormProps) => {
  const router = useRouter()
  const resolvedFormId = formId ?? "studio-class-form"
  const formRef = useRef<HTMLFormElement | null>(null)
  const initialSerializedFormRef = useRef("")
  const safeTeacherOptions = useMemo(
    () => (Array.isArray(teacherOptions) ? teacherOptions : []),
    [teacherOptions]
  )
  const [activeTab, setActiveTab] = useState<EditFormTabId>("info")
  const [isDirty, setIsDirty] = useState(false)
  const [headerTitle, setHeaderTitle] = useState(initialItem?.title ?? "")
  const [isActivePreview, setIsActivePreview] = useState(initialItem?.isActive ?? true)
  const [selectedClassId, setSelectedClassId] = useState(initialItem?.id ?? "")
  const [selectedProgramType, setSelectedProgramType] = useState(initialItem?.programType ?? "trial_class")
  const [trialPrice, setTrialPrice] = useState(String(initialItem?.trialPrice ?? 0))
  const [selectedAssignmentMode, setSelectedAssignmentMode] = useState<ClassAssignmentMode>(
    initialItem?.assignmentMode ?? "post_assign"
  )
  const [selectedSubject, setSelectedSubject] = useState(
    normalizeStudioClassSubjectOption(initialItem?.subject) ?? ""
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
  const [coverImageFilePreviewUrl, setCoverImageFilePreviewUrl] = useState("")
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
    initialItem?.subject?.trim() && !normalizeStudioClassSubjectOption(initialItem.subject)
      ? initialItem.subject.trim()
      : null
  const initialTargetGrades = useMemo(
    () => parseStoredTargetGrades(initialItem?.targetAge),
    [initialItem?.targetAge]
  )
  const legacyTargetAgeValue =
    initialItem?.targetAge?.trim() && initialTargetGrades.length === 0 ? initialItem.targetAge.trim() : null
  const [selectedRegion, setSelectedRegion] = useState<AcademyArea>(normalizeAcademyArea(initialItem?.region))
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
  const mergedTeacherOptionIds = useMemo(
    () => new Set(mergedTeacherOptions.map((option) => option.teacherId)),
    [mergedTeacherOptions]
  )
  const selectedRegionConfig = useMemo(() => getAcademyAreaConfig(selectedRegion), [selectedRegion])
  const regionOptions = useMemo(
    () =>
      academyAreaConfigs.map((option) => ({
        ...option,
        isDisabled: !option.enabled && option.value !== selectedRegion
      })),
    [selectedRegion]
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
  const hasNoActiveTeacherOption = safeTeacherOptions.length === 0
  const isTeacherSelectionLockedToInactive = Boolean(
    initialItem?.teacherId && fallbackTeacherOption && !teacherOptionIds.has(initialItem.teacherId)
  )
  const isPreassignedMode = selectedAssignmentMode === "preassigned"
  const fieldExamples = useMemo(() => getStudioClassFieldExamples(selectedSubject), [selectedSubject])
  const mode = selectedClassId ? "update" : "create"
  const previousOkRef = useRef(false)
  const initializedSnapshotKeyRef = useRef<string | null>(null)
  const initialFormSnapshot = useMemo(
    () => ({
      id: initialItem?.id ?? "",
      programType: initialItem?.programType ?? "trial_class",
      trialPrice: String(initialItem?.trialPrice ?? 0),
      assignmentMode: initialItem?.assignmentMode ?? "post_assign",
      subject: normalizeStudioClassSubjectOption(initialItem?.subject) ?? "",
      description: initialItem?.description ?? "",
      targetGrades: parseStoredTargetGrades(initialItem?.targetAge),
      region: normalizeAcademyArea(initialItem?.region),
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
      initialItem?.recommendedFor,
      initialItem?.region,
      initialItem?.schedules,
      initialItem?.subject,
      initialItem?.targetAge,
      initialItem?.teacherId
    ]
  )
  const protectedScheduleCount = useMemo(
    () => scheduleSlots.filter((slot) => slot.isReferencedByApplications).length,
    [scheduleSlots]
  )
  const resolvedClassFormat = useMemo(() => {
    if (classFormatSelection === customClassFormatOptionValue) {
      return customClassFormat
    }

    return classFormatSelection
  }, [classFormatSelection, customClassFormat])
  const previewImageUrl = coverImageFilePreviewUrl || coverImageUrl || ""
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
  const updateHeaderSnapshot = useCallback(
    (formData: FormData) => {
      const nextTitle = String(formData.get("title") ?? "").trim()
      setHeaderTitle(nextTitle || initialItem?.title || "수업 정보")
      setIsActivePreview(String(formData.get("isActive") ?? "") === "on")
    },
    [initialItem?.title]
  )
  const refreshDirtyState = useCallback(
    (nextBaseline = false) => {
      const form = formRef.current
      if (!form) {
        return
      }

      const formData = new FormData(form)
      const serialized = serializeFormData(formData)
      updateHeaderSnapshot(formData)

      if (nextBaseline || !initialSerializedFormRef.current) {
        initialSerializedFormRef.current = serialized
        setIsDirty(false)
        return
      }

      setIsDirty(serialized !== initialSerializedFormRef.current)
    },
    [updateHeaderSnapshot]
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
    setTrialPrice(initialFormSnapshot.trialPrice)
    setSelectedAssignmentMode(initialFormSnapshot.assignmentMode)
    setSelectedSubject(initialFormSnapshot.subject)
    setDescription(initialFormSnapshot.description)
    setSelectedTargetGrades(initialFormSnapshot.targetGrades)
    setSelectedRegion(initialFormSnapshot.region)
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
    setCoverImageFilePreviewUrl("")
    setCoverImageUrl(initialFormSnapshot.coverImageUrl)
    setCoverImageUploadError(null)
    setIsUploadingCoverImage(false)
    setScheduleSlots(initialFormSnapshot.scheduleSlots)
    setHeaderTitle(initialItem?.title ?? "")
    setIsActivePreview(initialItem?.isActive ?? true)
    setActiveTab("info")
  }, [initialFormSnapshot, initialItem?.isActive, initialItem?.title])

  useEffect(() => {
    if (selectedAssignmentMode !== "preassigned" || selectedTeacherId) {
      return
    }

    if (mergedTeacherOptionIds.has(currentTeacherId)) {
      setSelectedTeacherId(currentTeacherId)
      return
    }

    if (mergedTeacherOptions[0]?.teacherId) {
      setSelectedTeacherId(mergedTeacherOptions[0].teacherId)
    }
  }, [
    currentTeacherId,
    mergedTeacherOptionIds,
    mergedTeacherOptions,
    selectedAssignmentMode,
    selectedTeacherId
  ])

  useEffect(() => {
    const previousOk = previousOkRef.current
    previousOkRef.current = state.ok

    if (!previousOk && state.ok) {
      refreshDirtyState(true)
      if (mode === "create") {
        onCreated?.()
        if (variant === "standalone" && createSuccessHref) {
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
  }, [createSuccessHref, mode, onCreated, onUpdated, refreshDirtyState, router, state.ok, updateSuccessHref, variant])

  useEffect(() => {
    return () => {
      if (coverImageFilePreviewUrl) {
        URL.revokeObjectURL(coverImageFilePreviewUrl)
      }
    }
  }, [coverImageFilePreviewUrl])

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
    trialPrice,
    selectedSubject,
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

  const handleCoverImageChange = async (file: File | null) => {
    setCoverImageUploadError(null)

    if (coverImageFilePreviewUrl) {
      URL.revokeObjectURL(coverImageFilePreviewUrl)
    }

    if (!file) {
      setCoverImageFilePreviewUrl("")
      if (mode === "create") {
        setCoverImageUrl("")
      }
      return
    }

    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"])
    if (!allowedMimeTypes.has(file.type)) {
      setCoverImageFilePreviewUrl("")
      setCoverImageUploadError("jpg, png, webp 파일만 업로드할 수 있어요.")
      return
    }

    const maxFileSize = 5 * 1024 * 1024
    if (file.size > maxFileSize) {
      setCoverImageFilePreviewUrl("")
      setCoverImageUploadError("이미지는 5MB 이하만 업로드할 수 있어요.")
      return
    }

    if (!organizationId) {
      setCoverImageFilePreviewUrl("")
      setCoverImageUploadError("학원 정보를 확인하지 못해 이미지를 업로드할 수 없어요.")
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setCoverImageFilePreviewUrl(previewUrl)

    const extension =
      file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : null

    if (!extension) {
      setCoverImageUploadError("jpg, png, webp 파일만 업로드할 수 있어요.")
      return
    }

    setIsUploadingCoverImage(true)
    try {
      const objectName = `${organizationId}/${crypto.randomUUID()}.${extension}`
      if (!objectName || objectName.includes("undefined") || objectName.includes("null")) {
        setCoverImageUploadError(`이미지 저장 경로가 올바르지 않아요: ${objectName}`)
        return
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

      if (!supabaseUrl) {
        console.error("[cover upload failed]", {
          message: "NEXT_PUBLIC_SUPABASE_URL is required",
          name: "missing_supabase_public_env",
          statusCode: "unknown",
          cause: {
            hasSupabaseUrl: Boolean(supabaseUrl),
            hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
            hasSupabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
          },
          organizationId,
          path: objectName
        })
        setCoverImageUploadError("NEXT_PUBLIC_SUPABASE_URL is required / status: unknown")
        return
      }

      if (!supabaseKey) {
        console.error("[cover upload failed]", {
          message: "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required",
          name: "missing_supabase_public_env",
          statusCode: "unknown",
          cause: {
            hasSupabaseUrl: Boolean(supabaseUrl),
            hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
            hasSupabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
          },
          organizationId,
          path: objectName
        })
        setCoverImageUploadError(
          "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required / status: unknown"
        )
        return
      }

      const supabase = getSupabaseBrowserClient()
      const { error: uploadError } = await supabase.storage.from("class-covers").upload(objectName, file, {
        contentType: file.type,
        upsert: false
      })

      if (uploadError) {
        const uploadErrorAny = uploadError as unknown as {
          message?: unknown
          name?: unknown
          statusCode?: unknown
          status?: unknown
        }
        const errorMessage =
          typeof uploadErrorAny.message === "string" && uploadErrorAny.message.trim().length > 0
            ? uploadErrorAny.message
            : "알 수 없는 오류"
        const statusCode = uploadErrorAny.statusCode ?? uploadErrorAny.status ?? "unknown"

        console.error("[cover upload failed]", {
          message: uploadErrorAny.message,
          name: uploadErrorAny.name,
          statusCode,
          cause: uploadError,
          organizationId,
          path: objectName
        })

        setCoverImageUploadError(`이미지 업로드 실패: ${errorMessage} / status: ${String(statusCode)}`)
        return
      }

      const {
        data: { publicUrl }
      } = supabase.storage.from("class-covers").getPublicUrl(objectName)

      if (!publicUrl) {
        setCoverImageUploadError("이미지 업로드 실패: publicUrl이 비어있습니다 / status: unknown")
        return
      }

      setCoverImageUrl(publicUrl)
    } catch (error) {
      const statusCode = (error as unknown as { statusCode?: unknown })?.statusCode ?? "unknown"
      console.error("[cover upload failed]", {
        message: error instanceof Error ? error.message : undefined,
        name: error instanceof Error ? error.name : undefined,
        statusCode,
        cause: error,
        organizationId,
        path: `${organizationId}/(generated).${extension}`
      })

      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류"
      setCoverImageUploadError(`이미지 업로드 실패: ${errorMessage} / status: ${String(statusCode)}`)
    } finally {
      setIsUploadingCoverImage(false)
    }
  }

  return (
    <section id="studio-class-form" className={styles.page}>
      <div className={styles.stickyChrome}>
        <header className={styles.headerCard}>
          <div className={styles.headerLeft}>
            <Link href="/studio/classes" className={styles.backButton} aria-label="수업 목록으로 돌아가기">
              ←
            </Link>
            <div className={styles.titleGroup}>
              <h1 className={styles.title}>{headerTitle || "수업 정보"}</h1>
              <span
                className={`${styles.statusBadge} ${
                  isActivePreview ? styles.statusBadgeActive : styles.statusBadgeInactive
                }`}
              >
                {isActivePreview ? "공개중" : "비공개"}
              </span>
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={`${styles.dirtyText} ${isDirty ? styles.dirtyTextActive : ""}`}>
              {isDirty ? "저장하지 않은 변경사항" : "변경사항 없음"}
            </span>
            <button
              type="submit"
              form={resolvedFormId}
              disabled={isPending || isUploadingCoverImage || Boolean(teacherOptionsError)}
              className={styles.saveButton}
            >
              {isPending ? "저장 중..." : "저장"}
            </button>
          </div>
        </header>

        <nav className={styles.tabBar} aria-label="수업 수정 탭">
          {editFormTabs.map((tab) => {
            const isSelected = activeTab === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tabButton} ${isSelected ? styles.tabButtonActive : ""}`}
                aria-pressed={isSelected}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      <form
        id={resolvedFormId}
        ref={formRef}
        action={formAction}
        className={styles.form}
        onInput={() => refreshDirtyState()}
        onChange={() => refreshDirtyState()}
      >
        <input type="hidden" name="mode" value={mode} />
        {mode === "update" ? <input type="hidden" name="classId" value={selectedClassId} /> : null}
        <input type="hidden" name="programType" value={selectedProgramType} />
        <input type="hidden" name="classFormat" value={resolvedClassFormat} />
        <input type="hidden" name="subject" value={selectedSubject} />
        <input type="hidden" name="coverImageUrl" value={coverImageUrl ?? ""} />
        {selectedTargetGrades.map((grade) => (
          <input key={grade} type="hidden" name="targetGrades" value={grade} />
        ))}
        {scheduleSlots.map((slot) => (
          <Fragment key={slot.localId}>
            <input type="hidden" name="slotId" value={slot.persistedId} />
            <input type="hidden" name="slotScheduleType" value={slot.scheduleType} />
            <input type="hidden" name="slotDayOfWeek" value={slot.scheduleType === "weekly" ? slot.dayOfWeek : ""} />
            <input
              type="hidden"
              name="slotSpecificDate"
              value={slot.scheduleType === "one_time" ? slot.specificDate : ""}
            />
            <input type="hidden" name="slotSeriesId" value={slot.seriesId} />
            <input type="hidden" name="slotBookingStatus" value={slot.bookingStatus} />
            <input type="hidden" name="slotStartTime" value={slot.startTime} />
            <input type="hidden" name="slotEndTime" value={slot.endTime} />
            <input type="hidden" name="slotCapacity" value={slot.capacity} />
            <input type="hidden" name="slotDisplayLabel" value={slot.displayLabel} />
          </Fragment>
        ))}

        <section className={styles.panel}>
          <div className={styles.tabPanel} hidden={activeTab !== "info"}>
            <div className={styles.panelInner}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>수업 정보</h2>
                <p className={styles.panelDescription}>
                  학부모가 수업 내용을 쉽게 이해할 수 있도록 프로그램의 특징과 진행 내용을 작성해 주세요.
                </p>
              </div>

              <div className={styles.infoGrid}>
                <div className={styles.infoMainColumn}>
                  <p className={styles.tabSectionLabel}>기본 정보</p>
                  <section className={styles.sectionCard}>
                    <div className={styles.basicInfoGrid}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>프로그램명</span>
                        <input
                          name="title"
                          defaultValue={initialItem?.title ?? ""}
                          required
                          minLength={2}
                          maxLength={60}
                          disabled={isPending}
                          placeholder={fieldExamples.title}
                          className={styles.input}
                        />
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>과목</span>
                        <div className={styles.chipGroup}>
                          {studioClassSubjectOptions.map((option) => {
                            const isSelected = selectedSubject === option

                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => setSelectedSubject(option)}
                                disabled={isPending}
                                className={`${styles.chipButton} ${isSelected ? styles.chipButtonSelected : ""}`}
                              >
                                {getSubjectLabel(option)}
                              </button>
                            )
                          })}
                        </div>
                        <span className={styles.fieldHint}>
                          {selectedSubject ? `선택한 과목: ${getSubjectLabel(selectedSubject)}` : "과목 칩에서 1개를 선택해 주세요."}
                        </span>
                        {legacySubjectValue ? (
                          <span className={styles.fieldHint}>
                            기존 저장값은 `{getSubjectLabel(legacySubjectValue) ?? legacySubjectValue}` 입니다. 수정 저장 시에는 과목을
                            다시 선택해 주세요.
                          </span>
                        ) : null}
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>대상 학년</span>
                        <div className={styles.chipGroup}>
                          {CHILD_GRADES.map((option) => {
                            const isSelected = selectedTargetGrades.includes(option.value)

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => toggleTargetGrade(option.value)}
                                disabled={isPending}
                                className={`${styles.chipButton} ${isSelected ? styles.chipButtonSelected : ""}`}
                              >
                                {option.label}
                              </button>
                            )
                          })}
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
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>지역</span>
                        <select
                          name="region"
                          value={selectedRegion}
                          onChange={(event) => setSelectedRegion(event.target.value as AcademyArea)}
                          disabled={isPending}
                          className={styles.select}
                        >
                          {regionOptions.map((option) => (
                            <option key={option.value} value={option.value} disabled={option.isDisabled}>
                              {option.statusLabel ? `${option.value} · ${option.statusLabel}` : option.value}
                            </option>
                          ))}
                        </select>
                        {!selectedRegionConfig?.enabled ? (
                          <span className={styles.fieldHint}>
                            기존 학원가 값은 유지할 수 있지만, 다른 지역으로 변경한 뒤에는 다시 선택할 수 없습니다.
                          </span>
                        ) : null}
                      </label>

                      <div className={styles.field}>
                        <label htmlFor={`${resolvedFormId}-class-format`} className={styles.fieldLabel}>
                          수업 방식
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
                  </section>

                  <p className={styles.tabSectionLabel}>상세 소개</p>
                  <section className={styles.sectionCard}>
                    <div className={styles.detailsGrid}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>프로그램 소개</span>
                        <textarea
                          name="description"
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          required
                          minLength={10}
                          rows={5}
                          disabled={isPending}
                          placeholder={fieldExamples.description}
                          className={styles.textarea}
                        />
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>이런 아이에게 추천해요</span>
                        <textarea
                          name="recommendedFor"
                          value={recommendedFor}
                          onChange={(event) => setRecommendedFor(event.target.value)}
                          rows={5}
                          disabled={isPending}
                          placeholder={fieldExamples.recommendedFor}
                          className={styles.textarea}
                        />
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>이 수업에서 경험하는 것</span>
                        <textarea
                          name="experiencePoints"
                          value={experiencePoints}
                          onChange={(event) => setExperiencePoints(event.target.value)}
                          rows={5}
                          disabled={isPending}
                          placeholder={fieldExamples.experiencePoints}
                          className={styles.textarea}
                        />
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>커리큘럼</span>
                        <textarea
                          name="curriculum"
                          value={curriculum}
                          onChange={(event) => setCurriculum(event.target.value)}
                          rows={6}
                          disabled={isPending}
                          placeholder={fieldExamples.curriculum}
                          className={styles.textarea}
                        />
                      </label>
                    </div>
                  </section>

                  <p className={styles.tabSectionLabel}>대표 이미지</p>
                  <section className={styles.sectionCard}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>대표 이미지 업로드</span>
                      <span className={styles.fieldHint}>1200 × 900px · 4:3 · JPG · PNG · WebP · 5MB 이하</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={isPending || isUploadingCoverImage}
                        className={styles.fileInput}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          void handleCoverImageChange(file ?? null)
                        }}
                      />
                    </label>

                    {coverImageUploadError ? (
                      <p className={`${styles.feedbackMessage} ${styles.feedbackMessageError}`}>{coverImageUploadError}</p>
                    ) : null}

                    <div className={styles.previewImageFrame}>
                      {previewImageUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={previewImageUrl}
                            alt={`${initialItem?.title ?? "프로그램"} 대표 이미지 미리보기`}
                            className={styles.previewImage}
                          />
                        </>
                      ) : (
                        <div className={styles.previewImageEmpty}>대표 이미지가 아직 없습니다.</div>
                      )}
                    </div>
                  </section>
                </div>

                <aside className={styles.infoSideColumn}>
                  <div className={styles.previewRail}>
                    <section className={styles.previewCard}>
                      <div className={styles.previewHeader}>
                        <h3 className={styles.previewTitle}>학부모에게 보이는 화면</h3>
                        <p className={styles.previewDescription}>현재 입력한 값을 바탕으로 공개 화면에 가까운 미리보기를 보여줍니다.</p>
                      </div>

                      <div className={styles.previewImageFrame}>
                        {previewImageUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={previewImageUrl}
                              alt={`${headerTitle || "프로그램"} 대표 이미지`}
                              className={styles.previewImage}
                            />
                          </>
                        ) : (
                          <div className={styles.previewImageEmpty}>대표 이미지가 비어 있습니다.</div>
                        )}
                      </div>

                      <div className={styles.previewMetaRow}>
                        {selectedSubject ? <span className={styles.previewPill}>{getSubjectLabel(selectedSubject)}</span> : null}
                        {previewTargetGradeLabel ? <span className={styles.previewPill}>{previewTargetGradeLabel}</span> : null}
                      </div>

                      <div className={styles.previewHeader}>
                        <h4 className={styles.previewHeading}>{headerTitle || "프로그램명을 입력해 주세요."}</h4>
                        <p className={styles.previewFormat}>
                          {resolvedClassFormat.trim() || "수업 방식이 아직 입력되지 않았습니다."}
                        </p>
                      </div>

                      {previewSections.map((section) => (
                        <section key={section.title} className={styles.previewSection}>
                          <h5 className={styles.previewSectionTitle}>{section.title}</h5>
                          {section.value ? (
                            <p className={styles.previewSectionBody}>{section.value}</p>
                          ) : (
                            <p className={styles.previewSectionEmpty}>{section.empty}</p>
                          )}
                        </section>
                      ))}
                    </section>
                  </div>
                </aside>
              </div>
            </div>
          </div>

          <div className={styles.tabPanel} hidden={activeTab !== "schedule"}>
            <div className={styles.panelInner}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>예약 시간</h2>
                <p className={styles.panelDescription}>
                  담당 선생님 배정과 기본 운영시간, 날짜별 예외 일정을 현재 운영 방식 그대로 관리해요.
                </p>
              </div>

              <section className={styles.scheduleSection}>
                <section className={styles.scheduleCard}>
                  <div className={styles.scheduleCardHeader}>
                    <p className={styles.tabSectionLabel}>담당 선생님</p>
                    <h3 className={styles.scheduleCardTitle}>배정 방식</h3>
                    <p className={styles.scheduleCardDescription}>
                      수업에는 기본/대표 담당 선생님을 둘 수 있고, 실제 체험 신청 담당자는 신청별로 따로 관리합니다.
                    </p>
                  </div>

                  <div style={assignmentModeGridStyle}>
                    <label style={radioCardStyle}>
                      <input
                        type="radio"
                        name="assignmentMode"
                        value="post_assign"
                        checked={selectedAssignmentMode === "post_assign"}
                        onChange={() => setSelectedAssignmentMode("post_assign")}
                        disabled={isPending}
                      />
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong style={{ color: "#111827", fontSize: 14 }}>신청 후 관리자가 배정</strong>
                        <span style={helperTextStyle}>
                          신청 생성 시 담당 선생님은 비워두고, 신청 상세에서 나중에 배정합니다.
                        </span>
                      </div>
                    </label>

                    <label style={radioCardStyle}>
                      <input
                        type="radio"
                        name="assignmentMode"
                        value="preassigned"
                        checked={selectedAssignmentMode === "preassigned"}
                        onChange={() => setSelectedAssignmentMode("preassigned")}
                        disabled={isPending}
                      />
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong style={{ color: "#111827", fontSize: 14 }}>수업 등록 시 미리 배정</strong>
                        <span style={helperTextStyle}>
                          수업에 연결한 기본 담당 선생님을 신청 생성 시 자동으로 배정합니다.
                        </span>
                      </div>
                    </label>
                  </div>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>담당 선생님</span>
                    {mergedTeacherOptions.length > 0 ? (
                      <select
                        name="teacherId"
                        value={selectedTeacherId}
                        onChange={(event) => setSelectedTeacherId(event.target.value)}
                        disabled={isPending}
                        required={isPreassignedMode}
                        className={styles.select}
                      >
                        <option value="">선택 안 함</option>
                        {mergedTeacherOptions.map((option) => (
                          <option key={option.teacherId} value={option.teacherId}>
                            {resolveTeacherLabel(option)}
                            {fallbackTeacherOption?.teacherId === option.teacherId ? " (현재 비활성 선생님)" : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div aria-live="polite" className={styles.readonlyField}>
                        등록된 선생님이 없습니다.
                      </div>
                    )}
                    <span className={styles.fieldHint}>
                      {teacherOptionsError
                        ? teacherOptionsError
                        : isTeacherSelectionLockedToInactive
                          ? "현재 연결된 선생님이 비활성 상태라 표시만 유지합니다. 다른 선생님으로 바꾸려면 active 목록에서 다시 선택해 주세요."
                          : hasNoActiveTeacherOption
                            ? isPreassignedMode
                              ? "미리 배정 방식은 담당 선생님이 필요합니다. 먼저 선생님 프로필을 추가해 주세요."
                              : "등록된 선생님이 없어도 신청 후 배정 방식으로는 저장할 수 있습니다."
                            : isPreassignedMode
                              ? "미리 배정 방식은 담당 선생님 선택이 필수입니다."
                              : "신청 후 배정 방식에서는 기본/대표 담당 선생님을 선택사항으로 둘 수 있습니다."}
                    </span>
                  </label>
                </section>

                <section className={styles.scheduleCard}>
                  <div className={styles.scheduleCardHeader}>
                    <p className={styles.tabSectionLabel}>예약 시간</p>
                    <h3 className={styles.scheduleCardTitle}>
                      {selectedProgramType === "level_test" ? "레벨테스트 예약시간 설정" : "체험수업 예약시간 설정"}
                    </h3>
                    <p className={styles.scheduleCardDescription}>
                      기본 운영시간은 요약 카드와 모달에서 정리하고, 날짜별 예외 일정은 아래 캘린더에서 별도로 관리합니다.
                    </p>
                  </div>

                  <div className={styles.scheduleHintRow}>
                    <span className={styles.scheduleBadge}>기본 운영시간</span>
                    <span className={styles.scheduleBadgeMuted}>요약 카드</span>
                    <span className={styles.scheduleBadgeMuted}>예외 일정 분리</span>
                  </div>
                  {protectedScheduleCount > 0 ? (
                    <p className={styles.warningText}>
                      이미 신청에 사용된 예약시간 {protectedScheduleCount}개는 요일/날짜/시간 변경과 삭제가 잠겨 있습니다.
                    </p>
                  ) : null}

                  {scheduleCalendarError ? (
                    <p className={`${styles.feedbackMessage} ${styles.feedbackMessageError}`}>{scheduleCalendarError}</p>
                  ) : null}
                  {selectedClassId && scheduleCalendarMonth ? (
                    <StudioClassScheduleEditor
                      classId={selectedClassId}
                      month={scheduleCalendarMonth}
                      days={scheduleCalendarDays}
                      scheduleSlots={scheduleSlots}
                      onChangeScheduleSlots={setScheduleSlots}
                    />
                  ) : (
                    <div className={styles.emptyState}>
                      <strong style={{ fontSize: 14, color: "#111827" }}>일정 정보를 불러오지 못했습니다.</strong>
                      <p className={styles.fieldHint}>새로고침 후 다시 시도해 주세요.</p>
                    </div>
                  )}
                </section>
              </section>
            </div>
          </div>

          <div className={styles.tabPanel} hidden={activeTab !== "visibility"}>
            <div className={styles.panelInner}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>공개 · 신청 설정</h2>
                <p className={styles.panelDescription}>
                  학부모 노출 여부와 프로그램 유형, 신청비를 현재 저장 경로 그대로 수정할 수 있어요.
                </p>
              </div>

              <div className={styles.visibilityLayout}>
                <section className={styles.settingsSection}>
                  <p className={styles.tabSectionLabel}>공개 상태</p>
                  <div className={styles.settingsCard}>
                    <label className={styles.toggleCard}>
                      <div className={styles.toggleRow}>
                        <div className={styles.toggleLabelWrap}>
                          <strong className={styles.toggleTitle}>
                            {isActivePreview ? "학부모에게 공개중" : "비공개"}
                          </strong>
                          <p className={styles.toggleDescription}>
                            {isActivePreview
                              ? "검색 결과와 학원 페이지에 노출되고, 신청을 받을 수 있어요."
                              : "학부모에게 보이지 않고 새로운 신청을 받을 수 없어요."}
                          </p>
                        </div>
                        <span className={styles.toggleSwitch}>
                          <input
                            name="isActive"
                            type="checkbox"
                            checked={isActivePreview}
                            onChange={(event) => setIsActivePreview(event.target.checked)}
                            disabled={isPending}
                            className={styles.toggleInput}
                          />
                          <span className={styles.toggleSlider} aria-hidden="true" />
                        </span>
                      </div>
                    </label>
                  </div>
                </section>

                <section className={styles.settingsSection}>
                  <p className={styles.tabSectionLabel}>프로그램 유형</p>
                  <div className={styles.settingsCard}>
                    <div className={styles.settingContent}>
                      <div className={styles.chipGroup}>
                        {programTypeOptions.map((option) => {
                          const isSelected = selectedProgramType === option.value

                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setSelectedProgramType(option.value)}
                              disabled={isPending}
                              className={`${styles.chipButton} ${isSelected ? styles.chipButtonSelected : ""}`}
                              aria-pressed={isSelected}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                      <p className={styles.helperText}>
                        {selectedProgramType === "level_test"
                          ? "레벨테스트로 저장돼요. 유형에 따라 학부모 화면의 신청 안내 문구가 달라져요."
                          : "체험수업으로 저장돼요. 유형에 따라 학부모 화면의 신청 안내 문구가 달라져요."}
                      </p>
                    </div>
                  </div>
                </section>

                <section className={styles.settingsSection}>
                  <p className={styles.tabSectionLabel}>신청비</p>
                  <div className={styles.settingsCard}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>1회 신청비 (원)</span>
                      <input
                        name="trialPrice"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1000}
                        value={trialPrice}
                        onChange={(event) => setTrialPrice(event.target.value)}
                        disabled={isPending}
                        className={styles.input}
                      />
                      <span className={styles.helperText}>0원이면 학부모 화면에 무료로 표시돼요.</span>
                    </label>
                  </div>
                </section>

                <section className={styles.settingsSection}>
                  <p className={styles.tabSectionLabel}>위험한 작업</p>
                  <div className={styles.settingsCard}>
                    <div className={styles.dangerRow}>
                      <div className={styles.dangerCopy}>
                        <strong className={styles.dangerTitle}>이 수업 삭제</strong>
                        <p className={styles.dangerDescription}>
                          지난 신청 기록은 남지만 새 신청은 받을 수 없어요.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        className={styles.dangerButton}
                        title="현재는 수업 삭제 backend가 연결되어 있지 않습니다."
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>

        {state.message || teacherOptionsError || isUploadingCoverImage ? (
          <p
            className={`${styles.feedbackMessage} ${
              state.ok && !teacherOptionsError && !isUploadingCoverImage
                ? styles.feedbackMessageSuccess
                : styles.feedbackMessageError
            }`}
          >
            {teacherOptionsError ??
              (isUploadingCoverImage
                ? "이미지 업로드 중입니다. 잠시만 기다려주세요."
                : state.message)}
          </p>
        ) : null}
      </form>
    </section>
  )
}

const helperTextStyle = {
  color: "#8a8a8a",
  fontSize: 13,
  lineHeight: "18px"
}

const assignmentModeGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
}

const radioCardStyle = {
  display: "grid",
  gridTemplateColumns: "16px 1fr",
  gap: 10,
  alignItems: "flex-start",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#f9fafb"
}
