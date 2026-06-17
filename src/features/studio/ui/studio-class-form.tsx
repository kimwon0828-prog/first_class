"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useMemo, useRef, useState } from "react"

import { academyAreaOptions, normalizeAcademyArea } from "@/shared/config/academy-areas"
import {
  upsertStudioClassAction,
  type UpsertStudioClassActionState
} from "@/features/studio/actions/upsert-studio-class"
import {
  parseStudioClassTargetAgeRange,
  studioClassProgramTypeOptions,
  studioClassGradeAgeOptions,
  studioClassSubjectOptions
} from "@/features/studio/lib/studio-class-options"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import type {
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
  variant?: "default" | "standalone"
  formId?: string
  createSuccessHref?: string
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
  displayLabel: ""
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
  displayLabel: schedule.displayLabel ?? ""
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

export const StudioClassForm = ({
  organizationId,
  currentTeacherId,
  teacherOptions,
  teacherOptionsError,
  initialItem,
  onCreated,
  variant = "default",
  formId,
  createSuccessHref
}: StudioClassFormProps) => {
  const router = useRouter()
  const safeTeacherOptions = Array.isArray(teacherOptions) ? teacherOptions : []
  const [selectedClassId, setSelectedClassId] = useState(initialItem?.id ?? "")
  const [selectedProgramType, setSelectedProgramType] = useState(initialItem?.programType ?? "trial_class")
  const [selectedSubject, setSelectedSubject] = useState(
    studioClassSubjectOptions.includes(initialItem?.subject as (typeof studioClassSubjectOptions)[number])
      ? initialItem?.subject
      : ""
  )
  const [description, setDescription] = useState(initialItem?.description ?? "")
  const [recommendedFor, setRecommendedFor] = useState(initialItem?.recommendedFor ?? "")
  const [experiencePoints, setExperiencePoints] = useState(initialItem?.experiencePoints ?? "")
  const [curriculum, setCurriculum] = useState(initialItem?.curriculum ?? "")
  const [teacherIntro, setTeacherIntro] = useState(initialItem?.teacherIntro ?? "")
  const [classFormat, setClassFormat] = useState(initialItem?.classFormat ?? "")
  const [coverImageFilePreviewUrl, setCoverImageFilePreviewUrl] = useState("")
  const [coverImageUrl, setCoverImageUrl] = useState(initialItem?.coverImageUrl ?? "")
  const [coverImageUploadError, setCoverImageUploadError] = useState<string | null>(null)
  const [isUploadingCoverImage, setIsUploadingCoverImage] = useState(false)
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>(
    initialItem?.schedules?.length
      ? initialItem.schedules.map(createScheduleSlotDraftFromItem)
      : []
  )
  const action = useMemo(() => upsertStudioClassAction, [])
  const [state, formAction, isPending] = useActionState(action, initialState)
  const targetAgeRange = parseStudioClassTargetAgeRange(initialItem?.targetAge)
  const selectedRegion = normalizeAcademyArea(initialItem?.region)
  const teacherOptionIds = new Set(safeTeacherOptions.map((option) => option.teacherId))
  const fallbackTeacherOption =
    initialItem?.teacherId &&
    !teacherOptionIds.has(initialItem.teacherId) &&
    (initialItem.teacherDisplayName || initialItem.teacherName)
      ? {
          teacherId: initialItem.teacherId,
          teacherName: initialItem.teacherDisplayName ?? initialItem.teacherName ?? "선생님"
        }
      : null
  const mergedTeacherOptions = fallbackTeacherOption
    ? [fallbackTeacherOption, ...safeTeacherOptions]
    : safeTeacherOptions
  const mergedTeacherOptionIds = new Set(mergedTeacherOptions.map((option) => option.teacherId))
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
  const selectedTeacherId =
    initialItem?.teacherId && mergedTeacherOptionIds.has(initialItem.teacherId)
      ? initialItem.teacherId
      : mergedTeacherOptionIds.has(currentTeacherId)
        ? currentTeacherId
        : (mergedTeacherOptions[0]?.teacherId ?? "")
  const isTeacherOptionUnavailable = mergedTeacherOptions.length === 0
  const hasNoActiveTeacherOption = safeTeacherOptions.length === 0
  const isTeacherSelectionLockedToInactive = Boolean(
    initialItem?.teacherId && fallbackTeacherOption && !teacherOptionIds.has(initialItem.teacherId)
  )
  const mode = selectedClassId ? "update" : "create"
  const previousOkRef = useRef(false)

  useEffect(() => {
    setSelectedClassId(initialItem?.id ?? "")
    setSelectedProgramType(initialItem?.programType ?? "trial_class")
    setSelectedSubject(
      studioClassSubjectOptions.includes(initialItem?.subject as (typeof studioClassSubjectOptions)[number])
        ? (initialItem?.subject ?? "")
        : ""
    )
    setDescription(initialItem?.description ?? "")
    setRecommendedFor(initialItem?.recommendedFor ?? "")
    setExperiencePoints(initialItem?.experiencePoints ?? "")
    setCurriculum(initialItem?.curriculum ?? "")
    setTeacherIntro(initialItem?.teacherIntro ?? "")
    setClassFormat(initialItem?.classFormat ?? "")
    setCoverImageFilePreviewUrl("")
    setCoverImageUrl(initialItem?.coverImageUrl ?? "")
    setCoverImageUploadError(null)
    setIsUploadingCoverImage(false)
    setScheduleSlots(
      initialItem?.schedules?.length
        ? initialItem.schedules.map(createScheduleSlotDraftFromItem)
        : []
    )
  }, [
    initialItem?.coverImageUrl,
    initialItem?.id,
    initialItem?.programType,
    initialItem?.subject,
    initialItem?.description,
    initialItem?.recommendedFor,
    initialItem?.experiencePoints,
    initialItem?.curriculum,
    initialItem?.teacherIntro,
    initialItem?.classFormat,
    initialItem?.schedules
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

      router.refresh()
    }
  }, [createSuccessHref, mode, onCreated, router, state.ok, variant])

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
    setScheduleSlots((current) =>
      current.map((slot) => (slot.localId === slotId ? { ...slot, [key]: value } : slot))
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
          persistedId: ""
        }
      ]
    })
  }

  const removeScheduleSlot = (slotId: string) => {
    setScheduleSlots((current) => current.filter((slot) => slot.localId !== slotId))
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
            같은 organization에 등록된 담당 선생님을 선택해 저장합니다. 예약 가능 시간은 매주 반복 또는 일회성으로 추가할 수 있고, 비워둔 채로 저장해도 됩니다.
          </p>
        </div>
      </div>

      <form id={formId} action={formAction} style={{ display: "grid", gap: 12 }}>
        <input type="hidden" name="mode" value={mode} />
        {mode === "update" ? <input type="hidden" name="classId" value={selectedClassId} /> : null}
        <input type="hidden" name="programType" value={selectedProgramType} />
        <input type="hidden" name="subject" value={selectedSubject} />
        <input type="hidden" name="coverImageUrl" value={coverImageUrl ?? ""} />

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
                  {option}
                </button>
              )
            })}
          </div>
          <span style={helperTextStyle}>
            {selectedSubject ? `선택한 과목: ${selectedSubject}` : "과목 칩에서 1개를 선택해 주세요."}
          </span>
        </label>

        <label style={fieldStyle}>
          <span>대상 학년/연령 범위</span>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <select
              name="targetAgeStart"
              defaultValue={targetAgeRange.start}
              required
              disabled={isPending}
              style={inputStyle}
            >
              {studioClassGradeAgeOptions.map((option) => (
                <option key={`start-${option}`} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              name="targetAgeEnd"
              defaultValue={targetAgeRange.end}
              required
              disabled={isPending}
              style={inputStyle}
            >
              {studioClassGradeAgeOptions.map((option) => (
                <option key={`end-${option}`} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <span style={helperTextStyle}>시작 대상이 끝 대상보다 뒤면 저장되지 않습니다.</span>
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
          <span>담당 선생님</span>
          {safeTeacherOptions.length > 0 ? (
            <select
              name="teacherId"
              defaultValue={selectedTeacherId}
              disabled={isPending}
              style={inputStyle}
            >
              {mergedTeacherOptions.map((option) => (
                <option key={option.teacherId} value={option.teacherId}>
                  {resolveTeacherLabel(option)}
                  {fallbackTeacherOption?.teacherId === option.teacherId
                    ? " (현재 비활성 선생님)"
                    : ""}
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
                ? "현재 organization에 등록된 선생님이 없어 저장할 수 없습니다."
                : "현재 organization에 등록된 선생님만 선택할 수 있습니다."}
          </span>
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
          <div style={{ display: "grid", gap: 4 }}>
            <strong style={{ color: "#111827", fontSize: 15 }}>예약 가능 시간</strong>
            <p style={{ ...helperTextStyle, margin: 0 }}>
              매주 반복 또는 일회성 시간을 등록할 수 있습니다. 예약 시간이 없어도 수업 저장은 가능합니다.
            </p>
          </div>

          {scheduleSlots.length > 0 ? (
            <div style={{ display: "grid", gap: 12 }}>
              {scheduleSlots.map((slot, index) => {
                const isWeekly = slot.scheduleType === "weekly"

                return (
                  <div key={slot.localId} style={slotRowStyle}>
                    <input type="hidden" name="slotId" value={slot.persistedId} />
                    <input type="hidden" name="slotScheduleType" value={slot.scheduleType} />

                    <div style={slotHeaderStyle}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong style={{ fontSize: 14, color: "#111827" }}>
                          {getScheduleCardTitle(slot, index)}
                        </strong>
                        <p style={{ margin: 0, color: "#8a8a8a", fontSize: 12, lineHeight: "16px" }}>
                          {formatScheduleDraftSummary(slot)}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                          onClick={() => removeScheduleSlot(slot.localId)}
                          disabled={isPending}
                          style={tertiaryButtonStyle}
                        >
                          제거
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => changeScheduleSlotType(slot.localId, "weekly")}
                        disabled={isPending}
                        style={{
                          ...chipButtonStyle,
                          borderColor: isWeekly ? "#2aad38" : "#d9d9d9",
                          background: isWeekly ? "#2aad38" : "#fff",
                          color: isWeekly ? "#fff" : "#111111"
                        }}
                      >
                        매주 반복
                      </button>
                      <button
                        type="button"
                        onClick={() => changeScheduleSlotType(slot.localId, "one_time")}
                        disabled={isPending}
                        style={{
                          ...chipButtonStyle,
                          borderColor: !isWeekly ? "#2aad38" : "#d9d9d9",
                          background: !isWeekly ? "#2aad38" : "#fff",
                          color: !isWeekly ? "#fff" : "#111111"
                        }}
                      >
                        일회성
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
                              disabled={isPending}
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
                              disabled={isPending}
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
                          disabled={isPending}
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
                          disabled={isPending}
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
                    </div>

                    <details style={advancedDetailsStyle}>
                      <summary style={advancedSummaryStyle}>고급 설정: 라벨 직접 입력</summary>
                      <div style={{ ...fieldStyle, marginTop: 10 }}>
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
                        <span style={helperTextStyle}>
                          비워두면 `{getDefaultScheduleLabel(slot) || fallbackTimeText}` 형태로 자동 저장됩니다.
                        </span>
                      </div>
                    </details>
                  </div>
                )
              })}
            </div>
          ) : (
            <p style={{ ...helperTextStyle, margin: 0 }}>
              아직 등록된 예약 가능 시간이 없습니다. 필요할 때만 추가해도 됩니다.
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p style={{ ...helperTextStyle, margin: 0 }}>
              수정 화면에서는 기존에 저장된 `class_schedules`를 다시 불러와 편집합니다.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => addScheduleSlot("weekly")}
                disabled={isPending}
                style={buttonStyle}
              >
                + 예약 시간 추가
              </button>
            </div>
          </div>
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

        {state.message || teacherOptionsError || isTeacherOptionUnavailable || isUploadingCoverImage ? (
          <p style={{ margin: 0, color: state.ok ? "#111827" : "#b42318", fontSize: 14 }}>
            {teacherOptionsError ??
              (isTeacherOptionUnavailable
                ? "담당 선생님 목록이 비어 있어 프로그램을 저장할 수 없습니다."
                : isUploadingCoverImage
                  ? "이미지 업로드 중입니다. 잠시만 기다려주세요."
                  : state.message)}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            isPending || isUploadingCoverImage || isTeacherOptionUnavailable || Boolean(teacherOptionsError)
          }
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

const advancedDetailsStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px dashed #d9d9d9",
  background: "#fcfcfc"
}

const advancedSummaryStyle = {
  cursor: "pointer",
  color: "#4b5563",
  fontSize: 13,
  lineHeight: "18px",
  fontWeight: 700
}

const slotSectionStyle = {
  display: "grid",
  gap: 12,
  padding: 16,
  border: "1px solid #eeeeee",
  borderRadius: 16,
  background: "#fafafa"
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

const slotGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))"
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
