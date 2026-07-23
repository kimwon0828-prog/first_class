"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useMemo, useRef, useState } from "react"

import {
  formatStoredTargetGrades,
  parseStoredTargetGradeBands
} from "@/shared/constants/grade-options"
import {
  GRADE_BANDS,
  getSubjectLabel
} from "@/shared/constants/education-taxonomy"
import { academyAreaOptions, normalizeAcademyArea } from "@/shared/config/academy-areas"
import {
  upsertStudioClassAction,
  type UpsertStudioClassActionState
} from "@/features/studio/actions/upsert-studio-class"
import {
  normalizeStudioClassSubjectOption,
  studioClassProgramTypeOptions,
  studioClassSubjectOptions
} from "@/features/studio/lib/studio-class-options"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import type {
  ClassAssignmentMode,
  ClassSummary,
  StudioClassScheduleItem,
  StudioClassScheduleType,
  StudioTeacherOption
} from "@/shared/lib/db/adapter"

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
}

const initialState: UpsertStudioClassActionState = {
  ok: false,
  message: ""
}

type ScheduleSlotDraft = {
  localId: string
  persistedId: string
  scheduleType: StudioClassScheduleType
  dayOfWeek: string
  specificDate: string
  startTime: string
  endTime: string
  capacity: string
  displayLabel: string
  applicationCount: number
  isReferencedByApplications: boolean
}

const fallbackTimeText = "시간 미입력"
const weekdayOptions = [
  { value: "0", label: "일요일" },
  { value: "1", label: "월요일" },
  { value: "2", label: "화요일" },
  { value: "3", label: "수요일" },
  { value: "4", label: "목요일" },
  { value: "5", label: "금요일" },
  { value: "6", label: "토요일" }
] as const

const createEmptyScheduleSlotDraft = (
  scheduleType: StudioClassScheduleType = "weekly"
): ScheduleSlotDraft => ({
  localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  persistedId: "",
  scheduleType,
  dayOfWeek: scheduleType === "weekly" ? "1" : "",
  specificDate: "",
  startTime: "",
  endTime: "",
  capacity: "",
  displayLabel: "",
  applicationCount: 0,
  isReferencedByApplications: false
})

const createScheduleSlotDraftFromItem = (schedule: StudioClassScheduleItem): ScheduleSlotDraft => ({
  localId: `${schedule.id}-${Math.random().toString(36).slice(2, 8)}`,
  persistedId: schedule.id,
  scheduleType: schedule.scheduleType,
  dayOfWeek: schedule.dayOfWeek != null ? String(schedule.dayOfWeek) : "",
  specificDate: schedule.specificDate ?? "",
  startTime: schedule.startTime.slice(0, 5),
  endTime: schedule.endTime.slice(0, 5),
  capacity: schedule.capacity != null ? String(schedule.capacity) : "",
  displayLabel: schedule.displayLabel ?? "",
  applicationCount: schedule.applicationCount ?? 0,
  isReferencedByApplications: Boolean(schedule.isReferencedByApplications)
})

const formatSpecificDateLabel = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const [year, month, day] = value.split("-")
  return `${year}.${month}.${day}`
}

const getScheduleTimeText = (slot: ScheduleSlotDraft) => {
  if (!slot.startTime && !slot.endTime) {
    return fallbackTimeText
  }

  return `${slot.startTime || "--:--"}~${slot.endTime || "--:--"}`
}

const getDefaultScheduleLabel = (slot: ScheduleSlotDraft) => {
  if (!slot.startTime || !slot.endTime) {
    return ""
  }

  if (slot.scheduleType === "weekly") {
    const weekdayLabel =
      weekdayOptions.find((option) => option.value === slot.dayOfWeek)?.label ?? null

    if (!weekdayLabel) {
      return ""
    }

    return `매주 ${weekdayLabel} ${slot.startTime}~${slot.endTime}`
  }

  if (!slot.specificDate) {
    return ""
  }

  return `${formatSpecificDateLabel(slot.specificDate)} ${slot.startTime}~${slot.endTime}`
}

const getScheduleCardTitle = (slot: ScheduleSlotDraft, index: number) => {
  const manualLabel = slot.displayLabel.trim()
  const defaultLabel = getDefaultScheduleLabel(slot)

  return manualLabel || defaultLabel || `예약 시간 ${index + 1}`
}

const formatScheduleDraftSummary = (slot: ScheduleSlotDraft) => {
  const typeText = slot.scheduleType === "weekly" ? "매주 반복" : "일회성"
  const dateOrDayText =
    slot.scheduleType === "weekly"
      ? (weekdayOptions.find((option) => option.value === slot.dayOfWeek)?.label ?? "요일 미선택")
      : (slot.specificDate ? formatSpecificDateLabel(slot.specificDate) : "날짜 미입력")
  const timeText = getScheduleTimeText(slot)
  const capacityText = slot.capacity ? `정원 ${slot.capacity}` : "정원 미입력"

  return `${typeText} · ${dateOrDayText} · ${timeText} · ${capacityText}`
}

type SchedulePreviewOccurrence = {
  id: string
  dateKey: string
  dateLabel: string
  timeLabel: string
  capacityLabel: string
  displayLabel: string | null
}

const isValidTimeValue = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

const formatPreviewDateLabel = (date: Date) => {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date)
}

const buildPreviewOccurrence = (dateText: string, slot: ScheduleSlotDraft, index: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return null
  }

  if (!isValidTimeValue(slot.startTime) || !isValidTimeValue(slot.endTime) || slot.endTime <= slot.startTime) {
    return null
  }

  const startDate = new Date(`${dateText}T${slot.startTime}:00`)
  const endDate = new Date(`${dateText}T${slot.endTime}:00`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return null
  }

  if (startDate <= new Date()) {
    return null
  }

  return {
    id: `${slot.localId}-${dateText}-${index}`,
    dateKey: dateText,
    dateLabel: formatPreviewDateLabel(startDate),
    timeLabel: `${slot.startTime} ~ ${slot.endTime}`,
    capacityLabel: `정원 ${Math.max(1, Number(slot.capacity || 1))}명`,
    displayLabel: slot.displayLabel.trim() || null,
    startAt: startDate.getTime()
  }
}

const generateSchedulePreviewOccurrences = (slot: ScheduleSlotDraft) => {
  if (!slot.startTime || !slot.endTime) {
    return []
  }

  if (slot.scheduleType === "one_time") {
    const preview = buildPreviewOccurrence(slot.specificDate, slot, 0)
    return preview ? [preview] : []
  }

  const dayOfWeek = Number(slot.dayOfWeek)
  if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return []
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const previews: Array<SchedulePreviewOccurrence & { startAt: number }> = []

  for (let dayOffset = 0; dayOffset < 28 && previews.length < 4; dayOffset += 1) {
    const candidate = new Date(today)
    candidate.setDate(today.getDate() + dayOffset)
    if (candidate.getDay() !== dayOfWeek) {
      continue
    }

    const dateText = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(
      candidate.getDate()
    ).padStart(2, "0")}`
    const preview = buildPreviewOccurrence(dateText, slot, dayOffset)
    if (preview) {
      previews.push(preview)
    }
  }

  return previews
}

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
  updateSuccessHref
}: StudioClassFormProps) => {
  const router = useRouter()
  const safeTeacherOptions = useMemo(
    () => (Array.isArray(teacherOptions) ? teacherOptions : []),
    [teacherOptions]
  )
  const [selectedClassId, setSelectedClassId] = useState(initialItem?.id ?? "")
  const [selectedProgramType, setSelectedProgramType] = useState(initialItem?.programType ?? "trial_class")
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
  const [teacherIntro, setTeacherIntro] = useState(initialItem?.teacherIntro ?? "")
  const [classFormat, setClassFormat] = useState(initialItem?.classFormat ?? "")
  const [selectedTargetGrades, setSelectedTargetGrades] = useState<string[]>(
    parseStoredTargetGradeBands(initialItem?.targetAge).filter(
      (value): value is (typeof GRADE_BANDS)[number]["value"] => value !== "preschool" && value !== "high"
    )
  )
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
    () =>
      parseStoredTargetGradeBands(initialItem?.targetAge).filter(
        (value): value is (typeof GRADE_BANDS)[number]["value"] => value !== "preschool" && value !== "high"
      ),
    [initialItem?.targetAge]
  )
  const legacyTargetAgeValue =
    initialItem?.targetAge?.trim() && initialTargetGrades.length === 0 ? initialItem.targetAge.trim() : null
  const selectedRegion = normalizeAcademyArea(initialItem?.region)
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
  const mode = selectedClassId ? "update" : "create"
  const previousOkRef = useRef(false)
  const initializedSnapshotKeyRef = useRef<string | null>(null)
  const initialFormSnapshot = useMemo(
    () => ({
      id: initialItem?.id ?? "",
      programType: initialItem?.programType ?? "trial_class",
      assignmentMode: initialItem?.assignmentMode ?? "post_assign",
      subject: normalizeStudioClassSubjectOption(initialItem?.subject) ?? "",
      description: initialItem?.description ?? "",
      targetGrades: parseStoredTargetGradeBands(initialItem?.targetAge).filter(
        (value): value is (typeof GRADE_BANDS)[number]["value"] => value !== "preschool" && value !== "high"
      ),
      recommendedFor: initialItem?.recommendedFor ?? "",
      experiencePoints: initialItem?.experiencePoints ?? "",
      curriculum: initialItem?.curriculum ?? "",
      teacherIntro: initialItem?.teacherIntro ?? "",
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
      initialItem?.recommendedFor,
      initialItem?.schedules,
      initialItem?.subject,
      initialItem?.targetAge,
      initialItem?.teacherId,
      initialItem?.teacherIntro
    ]
  )
  const protectedScheduleCount = useMemo(
    () => scheduleSlots.filter((slot) => slot.isReferencedByApplications).length,
    [scheduleSlots]
  )
  const previewGroups = useMemo(() => {
    const grouped = new Map<
      string,
      {
        dateLabel: string
        items: SchedulePreviewOccurrence[]
      }
    >()

    const previewItems = scheduleSlots
      .flatMap((slot) => generateSchedulePreviewOccurrences(slot))
      .sort((left, right) => left.startAt - right.startAt)

    for (const item of previewItems) {
      const current = grouped.get(item.dateKey) ?? {
        dateLabel: item.dateLabel,
        items: []
      }
      current.items.push(item)
      grouped.set(item.dateKey, current)
    }

    return Array.from(grouped.entries()).map(([dateKey, value]) => ({
      dateKey,
      dateLabel: value.dateLabel,
      items: value.items
    }))
  }, [scheduleSlots])

  useEffect(() => {
    const snapshotKey = initialFormSnapshot.id || "__create__"
    if (initializedSnapshotKeyRef.current === snapshotKey) {
      return
    }

    initializedSnapshotKeyRef.current = snapshotKey
    setSelectedClassId(initialFormSnapshot.id)
    setSelectedProgramType(initialFormSnapshot.programType)
    setSelectedAssignmentMode(initialFormSnapshot.assignmentMode)
    setSelectedSubject(initialFormSnapshot.subject)
    setDescription(initialFormSnapshot.description)
    setSelectedTargetGrades(initialFormSnapshot.targetGrades)
    setRecommendedFor(initialFormSnapshot.recommendedFor)
    setExperiencePoints(initialFormSnapshot.experiencePoints)
    setCurriculum(initialFormSnapshot.curriculum)
    setTeacherIntro(initialFormSnapshot.teacherIntro)
    setClassFormat(initialFormSnapshot.classFormat)
    setSelectedTeacherId(initialFormSnapshot.teacherId)
    setCoverImageFilePreviewUrl("")
    setCoverImageUrl(initialFormSnapshot.coverImageUrl)
    setCoverImageUploadError(null)
    setIsUploadingCoverImage(false)
    setScheduleSlots(initialFormSnapshot.scheduleSlots)
  }, [initialFormSnapshot])

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
  }, [createSuccessHref, mode, onCreated, onUpdated, router, state.ok, updateSuccessHref, variant])

  useEffect(() => {
    return () => {
      if (coverImageFilePreviewUrl) {
        URL.revokeObjectURL(coverImageFilePreviewUrl)
      }
    }
  }, [coverImageFilePreviewUrl])

  const handleScheduleSlotChange = (
    slotId: string,
    key: keyof Omit<ScheduleSlotDraft, "localId" | "persistedId">,
    value: string
  ) => {
    const protectedKeys: Array<keyof Omit<ScheduleSlotDraft, "localId" | "persistedId">> = [
      "scheduleType",
      "dayOfWeek",
      "specificDate",
      "startTime",
      "endTime"
    ]
    setScheduleSlots((current) =>
      current.map((slot) => {
        if (slot.localId !== slotId) {
          return slot
        }

        if (slot.isReferencedByApplications && protectedKeys.includes(key)) {
          return slot
        }

        return { ...slot, [key]: value }
      })
    )
  }

  const addScheduleSlot = (scheduleType: StudioClassScheduleType = "weekly") => {
    setScheduleSlots((current) => [...current, createEmptyScheduleSlotDraft(scheduleType)])
  }

  const changeScheduleSlotType = (slotId: string, nextType: StudioClassScheduleType) => {
    setScheduleSlots((current) =>
      current.map((slot) => {
        if (slot.localId !== slotId) {
          return slot
        }

        if (slot.isReferencedByApplications) {
          return slot
        }

        return {
          ...slot,
          scheduleType: nextType,
          dayOfWeek: nextType === "weekly" ? slot.dayOfWeek || "1" : "",
          specificDate: nextType === "one_time" ? slot.specificDate : ""
        }
      })
    )
  }

  const duplicateScheduleSlot = (slotId: string) => {
    setScheduleSlots((current) => {
      const source = current.find((slot) => slot.localId === slotId)
      if (!source) {
        return current
      }

      return [
        ...current,
        {
          ...source,
          localId: createEmptyScheduleSlotDraft(source.scheduleType).localId,
          persistedId: "",
          applicationCount: 0,
          isReferencedByApplications: false
        }
      ]
    })
  }

  const removeScheduleSlot = (slotId: string) => {
    setScheduleSlots((current) => current.filter((slot) => slot.localId !== slotId))
  }

  const toggleTargetGrade = (grade: string) => {
    setSelectedTargetGrades((current) =>
      current.includes(grade) ? current.filter((item) => item !== grade) : [...current, grade]
    )
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

      console.log("[supabase url]", supabaseUrl)
      console.log("[cover upload start]", {
        organizationId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        path: objectName
      })

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
    <section id="studio-class-form" style={cardStyle}>
      <div style={heroStyle}>
        <div style={heroIconStyle} aria-hidden="true">
          +
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <p style={heroBadgeStyle}>NEW PROGRAM</p>
          <h2 style={titleStyle}>{selectedClassId ? "프로그램 수정" : "새 프로그램 등록"}</h2>
          <p style={descriptionStyle}>
            수업의 기본 담당 선생님과 신청별 담당 선생님 배정 방식을 함께 설정합니다. 예약 가능 시간은 매주 반복 또는 일회성으로 추가할 수 있고, 비워둔 채로 저장해도 됩니다.
          </p>
        </div>
      </div>

      <form id={formId} action={formAction} style={{ display: "grid", gap: 12 }}>
        <input type="hidden" name="mode" value={mode} />
        {mode === "update" ? <input type="hidden" name="classId" value={selectedClassId} /> : null}
        <input type="hidden" name="programType" value={selectedProgramType} />
        <input type="hidden" name="subject" value={selectedSubject} />
        <input type="hidden" name="coverImageUrl" value={coverImageUrl ?? ""} />
        {selectedTargetGrades.map((grade) => (
          <input key={grade} type="hidden" name="targetGrades" value={grade} />
        ))}

        <label style={fieldStyle}>
          <span>프로그램 유형</span>
          <div style={chipGroupStyle}>
            {studioClassProgramTypeOptions.map((option) => {
              const isSelected = selectedProgramType === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedProgramType(option.value)}
                  disabled={isPending}
                  style={{
                    ...chipButtonStyle,
                    borderColor: isSelected ? "#2aad38" : "#d9d9d9",
                    background: isSelected ? "#2aad38" : "#fff",
                    color: isSelected ? "#fff" : "#111111"
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <span style={helperTextStyle}>
            {selectedProgramType === "level_test"
              ? "레벨테스트 프로그램으로 저장됩니다."
              : "체험수업 프로그램으로 저장됩니다."}
          </span>
        </label>

        <label style={fieldStyle}>
          <span>프로그램명</span>
          <input
            name="title"
            defaultValue={initialItem?.title ?? ""}
            required
            minLength={2}
            maxLength={60}
            disabled={isPending}
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>과목</span>
          <div style={chipGroupStyle}>
            {studioClassSubjectOptions.map((option) => {
              const isSelected = selectedSubject === option

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelectedSubject(option)}
                  disabled={isPending}
                  style={{
                    ...chipButtonStyle,
                    borderColor: isSelected ? "#2aad38" : "#d9d9d9",
                    background: isSelected ? "#2aad38" : "#fff",
                    color: isSelected ? "#fff" : "#111111"
                  }}
                >
                  {getSubjectLabel(option)}
                </button>
              )
            })}
          </div>
          <span style={helperTextStyle}>
            {selectedSubject ? `선택한 과목: ${getSubjectLabel(selectedSubject)}` : "과목 칩에서 1개를 선택해 주세요."}
          </span>
          {legacySubjectValue ? (
            <span style={helperTextStyle}>
              기존 저장값은 `{getSubjectLabel(legacySubjectValue) ?? legacySubjectValue}` 입니다. 수정 저장 시에는 과목을
              다시 선택해 주세요.
            </span>
          ) : null}
        </label>

        <label style={fieldStyle}>
          <span>대상 학년</span>
          <div style={chipGroupStyle}>
            {GRADE_BANDS.map((option) => {
              const isSelected = selectedTargetGrades.includes(option.value)

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleTargetGrade(option.value)}
                  disabled={isPending}
                  style={{
                    ...chipButtonStyle,
                    borderColor: isSelected ? "#2aad38" : "#d9d9d9",
                    background: isSelected ? "#2aad38" : "#fff",
                    color: isSelected ? "#fff" : "#111111"
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <span style={helperTextStyle}>
            {selectedTargetGrades.length > 0
              ? `선택한 대상 학년: ${formatStoredTargetGrades(selectedTargetGrades.join(","))}`
              : "여러 학년을 선택할 수 있습니다."}
          </span>
          {legacyTargetAgeValue ? (
            <span style={helperTextStyle}>
              기존 저장값은 `{formatStoredTargetGrades(legacyTargetAgeValue)}` 입니다. 수정 저장 시에는 학년을
              다시 선택해 주세요.
            </span>
          ) : null}
        </label>

        <label style={fieldStyle}>
          <span>지역</span>
          <select
            name="region"
            defaultValue={selectedRegion}
            disabled={isPending}
            style={inputStyle}
          >
            {academyAreaOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span>수업 방식</span>
          <input
            name="classFormat"
            value={classFormat}
            onChange={(event) => setClassFormat(event.target.value)}
            disabled={isPending}
            placeholder="예: 오프라인 소그룹 / 1:1 / 온라인"
            style={inputStyle}
          />
          <span style={helperTextStyle}>학부모 상세페이지의 “수업 방식”에 표시됩니다.</span>
        </label>

        <label style={fieldStyle}>
          <span>프로그램 소개</span>
          <textarea
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
            minLength={10}
            rows={5}
            disabled={isPending}
            placeholder="파이썬 기초 문법을 배우고 간단한 프로그램을 만들어보는 체험수업입니다."
            style={textareaStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>이런 아이에게 추천해요</span>
          <textarea
            name="recommendedFor"
            value={recommendedFor}
            onChange={(event) => setRecommendedFor(event.target.value)}
            rows={5}
            disabled={isPending}
            placeholder="코딩을 처음 시작하는 아이, 파이썬을 배워보고 싶은 아이, 논리적으로 문제를 해결하는 활동을 좋아하는 아이에게 추천해요."
            style={textareaStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>이 수업에서 경험하는 것</span>
          <textarea
            name="experiencePoints"
            value={experiencePoints}
            onChange={(event) => setExperiencePoints(event.target.value)}
            rows={5}
            disabled={isPending}
            placeholder="변수와 출력문을 사용해보고, 간단한 조건문으로 나만의 미니 프로그램을 만들어봅니다."
            style={textareaStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>커리큘럼</span>
          <textarea
            name="curriculum"
            value={curriculum}
            onChange={(event) => setCurriculum(event.target.value)}
            rows={6}
            disabled={isPending}
            placeholder={"1단계: 파이썬이 무엇인지 알아보기\n2단계: 변수와 출력문 사용해보기\n3단계: 조건문으로 간단한 프로그램 만들기\n4단계: 나만의 미니 프로젝트 완성하기"}
            style={textareaStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>선생님 소개</span>
          <textarea
            name="teacherIntro"
            value={teacherIntro}
            onChange={(event) => setTeacherIntro(event.target.value)}
            rows={5}
            disabled={isPending}
            placeholder="아이의 수준에 맞춰 개념을 쉽게 설명하고, 직접 만들어보는 활동을 중심으로 수업합니다."
            style={textareaStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>신청비</span>
          <input
            name="trialPrice"
            type="number"
            min={0}
            step={1000}
            defaultValue={initialItem?.trialPrice ?? 0}
            required
            disabled={isPending}
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>대표 이미지</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={isPending || isUploadingCoverImage}
            style={fileInputStyle}
            onChange={(event) => {
              const file = event.target.files?.[0]
              void handleCoverImageChange(file ?? null)
            }}
          />
          <span style={helperTextStyle}>JPEG/PNG/WEBP 파일, 5MB 이하만 업로드할 수 있습니다.</span>
        </label>

        {coverImageUploadError ? (
          <p style={{ margin: 0, color: "#b42318", fontSize: 14 }}>{coverImageUploadError}</p>
        ) : null}

        {coverImageFilePreviewUrl ? (
          <div style={previewWrapperStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImageFilePreviewUrl}
              alt={`${initialItem?.title ?? "새 프로그램"} 새 대표 이미지 미리보기`}
              style={previewImageStyle}
            />
          </div>
        ) : coverImageUrl ? (
          <div style={previewWrapperStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImageUrl}
              alt={`${initialItem?.title ?? "프로그램"} 기존 대표 이미지`}
              style={previewImageStyle}
            />
          </div>
        ) : null}

        <section style={slotSectionStyle}>
          <div style={slotSectionHeaderStyle}>
            <div style={{ display: "grid", gap: 6 }}>
              <strong style={{ color: "#111827", fontSize: 17 }}>
                {selectedProgramType === "level_test" ? "레벨테스트 예약시간 설정" : "체험수업 예약시간 설정"}
              </strong>
              <p style={{ ...helperTextStyle, margin: 0 }}>
                학부모가 신청할 수 있는 체험수업 가능 시간을 설정해 주세요.
              </p>
            </div>
            <button
              type="button"
              onClick={() => addScheduleSlot("weekly")}
              disabled={isPending}
              style={buttonStyle}
            >
              + 예약시간 추가
            </button>
          </div>

          <section style={teacherAssignmentCardStyle}>
            <div style={{ display: "grid", gap: 4 }}>
              <strong style={{ color: "#111827", fontSize: 14 }}>담당 선생님 배정 방식</strong>
              <p style={{ ...helperTextStyle, margin: 0 }}>
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

            {mergedTeacherOptions.length > 0 ? (
              <select
                name="teacherId"
                value={selectedTeacherId}
                onChange={(event) => setSelectedTeacherId(event.target.value)}
                disabled={isPending}
                required={isPreassignedMode}
                style={inputStyle}
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
              <div
                aria-live="polite"
                style={{
                  ...inputStyle,
                  color: "#6b7280",
                  backgroundColor: "#f9fafb"
                }}
              >
                등록된 선생님이 없습니다.
              </div>
            )}
            <span style={helperTextStyle}>
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
          </section>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={sectionBadgeStyle}>예약 방식</span>
              <span style={sectionBadgeMutedStyle}>매주 반복</span>
              <span style={sectionBadgeMutedStyle}>특정 날짜 1회</span>
            </div>
            {protectedScheduleCount > 0 ? (
              <p style={{ ...warningTextStyle, margin: 0 }}>
                이미 신청에 사용된 예약시간 {protectedScheduleCount}개는 요일/날짜/시간 변경과 삭제가 잠겨 있습니다.
              </p>
            ) : null}
          </div>

          {scheduleSlots.length > 0 ? (
            <div style={{ display: "grid", gap: 12 }}>
              {scheduleSlots.map((slot, index) => {
                const isWeekly = slot.scheduleType === "weekly"
                const isProtected = slot.isReferencedByApplications

                return (
                  <div key={slot.localId} style={slotRowStyle}>
                    <input type="hidden" name="slotId" value={slot.persistedId} />
                    <input type="hidden" name="slotScheduleType" value={slot.scheduleType} />

                    <div style={slotHeaderStyle}>
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <strong style={{ fontSize: 14, color: "#111827" }}>
                            {getScheduleCardTitle(slot, index)}
                          </strong>
                          <span style={isWeekly ? previewTypeBadgeStyle : oneTimeBadgeStyle}>
                            {isWeekly ? "매주 반복" : "특정 날짜 1회"}
                          </span>
                          {isProtected ? (
                            <span style={protectedBadgeStyle}>신청 사용 중 {slot.applicationCount}건</span>
                          ) : null}
                        </div>
                        <p style={{ margin: 0, color: "#8a8a8a", fontSize: 12, lineHeight: "16px" }}>
                          {formatScheduleDraftSummary(slot)}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => duplicateScheduleSlot(slot.localId)}
                          disabled={isPending}
                          style={tertiaryButtonStyle}
                        >
                          복사
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (isProtected) {
                              window.alert(
                                "이미 신청된 예약시간일 수 있습니다. 삭제하면 기존 신청 확정에 영향을 줄 수 있어요."
                              )
                              return
                            }

                            removeScheduleSlot(slot.localId)
                          }}
                          disabled={isPending}
                          style={tertiaryButtonStyle}
                        >
                          {isProtected ? "삭제 불가" : "제거"}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => changeScheduleSlotType(slot.localId, "weekly")}
                        disabled={isPending || isProtected}
                        style={{
                          ...chipButtonStyle,
                          borderColor: isWeekly ? "#2aad38" : "#d9d9d9",
                          background: isWeekly ? "#2aad38" : "#fff",
                          color: isWeekly ? "#fff" : "#111111",
                          opacity: isProtected ? 0.65 : 1
                        }}
                      >
                        매주 반복
                      </button>
                      <button
                        type="button"
                        onClick={() => changeScheduleSlotType(slot.localId, "one_time")}
                        disabled={isPending || isProtected}
                        style={{
                          ...chipButtonStyle,
                          borderColor: !isWeekly ? "#2aad38" : "#d9d9d9",
                          background: !isWeekly ? "#2aad38" : "#fff",
                          color: !isWeekly ? "#fff" : "#111111",
                          opacity: isProtected ? 0.65 : 1
                        }}
                      >
                        특정 날짜 1회
                      </button>
                    </div>

                    <div style={slotGridStyle}>
                      {isWeekly ? (
                        <>
                          <label style={fieldStyle}>
                            <span>요일</span>
                            <select
                              name="slotDayOfWeek"
                              value={slot.dayOfWeek}
                              onChange={(event) =>
                                handleScheduleSlotChange(slot.localId, "dayOfWeek", event.target.value)
                              }
                              disabled={isPending || isProtected}
                              style={inputStyle}
                            >
                              <option value="">요일 선택</option>
                              {weekdayOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <input type="hidden" name="slotSpecificDate" value="" />
                        </>
                      ) : (
                        <>
                          <input type="hidden" name="slotDayOfWeek" value="" />
                          <label style={fieldStyle}>
                            <span>날짜</span>
                            <input
                              name="slotSpecificDate"
                              type="date"
                              value={slot.specificDate}
                              onChange={(event) =>
                                handleScheduleSlotChange(slot.localId, "specificDate", event.target.value)
                              }
                              disabled={isPending || isProtected}
                              style={inputStyle}
                            />
                          </label>
                        </>
                      )}

                      <label style={fieldStyle}>
                        <span>시작 시간</span>
                        <input
                          name="slotStartTime"
                          type="time"
                          value={slot.startTime}
                          onChange={(event) =>
                            handleScheduleSlotChange(slot.localId, "startTime", event.target.value)
                          }
                          disabled={isPending || isProtected}
                          style={inputStyle}
                        />
                      </label>

                      <label style={fieldStyle}>
                        <span>종료 시간</span>
                        <input
                          name="slotEndTime"
                          type="time"
                          value={slot.endTime}
                          onChange={(event) =>
                            handleScheduleSlotChange(slot.localId, "endTime", event.target.value)
                          }
                          disabled={isPending || isProtected}
                          style={inputStyle}
                        />
                      </label>

                      <label style={fieldStyle}>
                        <span>정원</span>
                        <input
                          name="slotCapacity"
                          type="number"
                          min={1}
                          step={1}
                          value={slot.capacity}
                          onChange={(event) =>
                            handleScheduleSlotChange(slot.localId, "capacity", event.target.value)
                          }
                          disabled={isPending}
                          placeholder="예: 4"
                          style={inputStyle}
                        />
                      </label>

                      <label style={fieldStyle}>
                        <span>노출 라벨</span>
                        <input
                          name="slotDisplayLabel"
                          value={slot.displayLabel}
                          onChange={(event) =>
                            handleScheduleSlotChange(slot.localId, "displayLabel", event.target.value)
                          }
                          disabled={isPending}
                          placeholder={getDefaultScheduleLabel(slot) || "자동 생성 라벨이 저장됩니다."}
                          style={inputStyle}
                        />
                      </label>
                    </div>

                    <p style={{ ...helperTextStyle, margin: 0 }}>
                      {isProtected
                        ? "이미 신청에 사용된 예약시간입니다. 삭제하거나 요일/날짜/시간을 바꾸면 기존 신청 확정에 영향을 줄 수 있어요."
                        : "비워두면 노출 라벨은 자동 생성되고, 저장 후 학부모 신청 화면과 동일한 기준으로 노출됩니다."}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={slotEmptyStateStyle}>
              <strong style={{ fontSize: 14, color: "#111827" }}>아직 등록된 예약시간이 없습니다.</strong>
              <p style={{ ...helperTextStyle, margin: 0 }}>
                예약 가능 시간을 1개 이상 등록해야 학부모가 신청할 수 있어요.
              </p>
            </div>
          )}

          <section style={previewCardStyle}>
            <div style={{ display: "grid", gap: 4 }}>
              <strong style={{ color: "#111827", fontSize: 15 }}>학부모 화면 4주 미리보기</strong>
              <p style={{ ...helperTextStyle, margin: 0 }}>
                현재 입력한 예약시간 기준으로 앞으로 4주 동안 학부모에게 보일 시간을 미리 계산해 보여줍니다.
              </p>
            </div>

            {previewGroups.length > 0 ? (
              <div style={{ display: "grid", gap: 12 }}>
                {previewGroups.map((group) => (
                  <div key={group.dateKey} style={previewGroupStyle}>
                    <strong style={{ color: "#111827", fontSize: 14 }}>{group.dateLabel}</strong>
                    <div style={{ display: "grid", gap: 8 }}>
                      {group.items.map((item) => (
                        <div key={item.id} style={previewItemStyle}>
                          <span style={{ color: "#111827", fontSize: 14 }}>{item.timeLabel}</span>
                          <span style={helperTextStyle}>{item.capacityLabel}</span>
                          {item.displayLabel ? (
                            <span style={{ ...helperTextStyle, color: "#4b5563" }}>{item.displayLabel}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ ...helperTextStyle, margin: 0 }}>
                현재 입력한 예약시간으로 생성되는 4주 미리보기 일정이 없습니다.
              </p>
            )}
          </section>
        </section>

        <label style={{ ...fieldStyle, gridTemplateColumns: "20px 1fr", alignItems: "center" }}>
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={initialItem?.isActive ?? true}
            disabled={isPending}
          />
          <span>공개 상태로 저장</span>
        </label>

        {state.message || teacherOptionsError || isUploadingCoverImage ? (
          <p style={{ margin: 0, color: state.ok ? "#111827" : "#b42318", fontSize: 14 }}>
            {teacherOptionsError ??
              (isUploadingCoverImage
                ? "이미지 업로드 중입니다. 잠시만 기다려주세요."
                : state.message)}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || isUploadingCoverImage || Boolean(teacherOptionsError)}
          style={buttonStyle}
        >
          {isPending ? "저장 중..." : mode === "update" ? "프로그램 수정" : "프로그램 등록"}
        </button>
      </form>
    </section>
  )
}

const cardStyle = {
  border: "1px solid #eeeeee",
  borderRadius: 22,
  background: "#fff",
  padding: 22,
  boxShadow: "0 12px 30px rgba(17, 17, 17, 0.06)"
}

const titleStyle = {
  margin: 0,
  fontSize: 18,
  lineHeight: "24px",
  color: "#111111",
  fontWeight: 800,
  letterSpacing: "-0.02em"
}

const descriptionStyle = {
  margin: 0,
  fontSize: 14,
  lineHeight: "22px",
  color: "#666666"
}

const heroStyle = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
  padding: 18,
  borderRadius: 18,
  background: "#f3fbf4",
  border: "1px solid #d8f0dc",
  marginBottom: 16,
  flexWrap: "wrap" as const
}

const heroIconStyle = {
  width: 48,
  height: 48,
  borderRadius: 16,
  background: "#ffffff",
  border: "1px solid #eaf8ec",
  color: "#2aad38",
  display: "grid",
  placeItems: "center",
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1
}

const heroBadgeStyle = {
  margin: 0,
  fontSize: 12,
  lineHeight: "16px",
  fontWeight: 800,
  letterSpacing: "0.12em",
  color: "#2aad38"
}

const fieldStyle = {
  display: "grid",
  gap: 6
}

const inputStyle = {
  padding: "0 14px",
  height: 48,
  borderRadius: 12,
  border: "1px solid #d9d9d9",
  background: "#ffffff",
  color: "#111111",
  fontSize: 15,
  lineHeight: "20px"
}

const textareaStyle = {
  ...inputStyle,
  padding: 14,
  height: "auto",
  minHeight: 120,
  lineHeight: "22px",
  resize: "vertical" as const
}

const fileInputStyle = {
  ...inputStyle,
  padding: 10,
  height: "auto"
}

const helperTextStyle = {
  color: "#8a8a8a",
  fontSize: 13,
  lineHeight: "18px"
}

const chipGroupStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8
}

const chipButtonStyle = {
  border: "1px solid #d9d9d9",
  borderRadius: 999,
  background: "#fff",
  color: "#111111",
  fontSize: 13,
  lineHeight: "18px",
  fontWeight: 700,
  padding: "8px 12px",
  cursor: "pointer"
}

const buttonStyle = {
  border: "1px solid #2aad38",
  borderRadius: 12,
  background: "#2aad38",
  color: "#fff",
  fontSize: 15,
  lineHeight: "20px",
  fontWeight: 800,
  padding: "14px 16px",
  cursor: "pointer"
}

const tertiaryButtonStyle = {
  border: "1px solid #eeeeee",
  borderRadius: 10,
  background: "#fff",
  color: "#4b5563",
  fontSize: 12,
  lineHeight: "16px",
  padding: "6px 10px",
  cursor: "pointer"
}

const slotSectionStyle = {
  display: "grid",
  gap: 12,
  padding: 16,
  border: "1px solid #eeeeee",
  borderRadius: 16,
  background: "#fafafa"
}

const slotSectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap" as const
}

const teacherAssignmentCardStyle = {
  display: "grid",
  gap: 10,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "#ffffff"
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

const sectionBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "6px 10px",
  background: "#111827",
  color: "#ffffff",
  fontSize: 12,
  lineHeight: "16px",
  fontWeight: 700
}

const sectionBadgeMutedStyle = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "6px 10px",
  background: "#ecfdf3",
  color: "#166534",
  fontSize: 12,
  lineHeight: "16px",
  fontWeight: 700
}

const warningTextStyle = {
  color: "#b54708",
  fontSize: 13,
  lineHeight: "18px"
}

const slotHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap" as const
}

const slotRowStyle = {
  display: "grid",
  gap: 12,
  padding: 12,
  border: "1px solid #eeeeee",
  borderRadius: 16,
  background: "#fff"
}

const previewTypeBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "4px 8px",
  background: "#ecfdf3",
  color: "#15803d",
  fontSize: 11,
  lineHeight: "14px",
  fontWeight: 700
}

const oneTimeBadgeStyle = {
  ...previewTypeBadgeStyle,
  background: "#eff6ff",
  color: "#1d4ed8"
}

const protectedBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "4px 8px",
  background: "#fff7ed",
  color: "#c2410c",
  fontSize: 11,
  lineHeight: "14px",
  fontWeight: 700
}

const slotGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))"
}

const slotEmptyStateStyle = {
  display: "grid",
  gap: 6,
  padding: 16,
  borderRadius: 14,
  border: "1px dashed #d1d5db",
  background: "#ffffff"
}

const previewCardStyle = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "#ffffff"
}

const previewGroupStyle = {
  display: "grid",
  gap: 8
}

const previewItemStyle = {
  display: "grid",
  gap: 2,
  padding: "10px 12px",
  borderRadius: 12,
  background: "#f9fafb",
  border: "1px solid #f3f4f6"
}

const previewWrapperStyle = {
  border: "1px solid #eeeeee",
  borderRadius: 16,
  overflow: "hidden",
  background: "#fafafa"
}

const previewImageStyle = {
  display: "block",
  width: "100%",
  maxHeight: 220,
  objectFit: "cover" as const
}
