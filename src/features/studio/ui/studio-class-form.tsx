"use client"

import { useRouter } from "next/navigation"
import { Fragment, useActionState, useEffect, useMemo, useRef, useState } from "react"

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
import { getStudioClassFieldExamples } from "@/features/studio/lib/studio-class-field-examples"
import {
  normalizeStudioClassSubjectOption,
  studioClassProgramTypeOptions,
  studioClassSubjectOptions
} from "@/features/studio/lib/studio-class-options"
import { StudioClassScheduleEditor } from "@/features/studio/ui/studio-class-schedule-editor"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import type {
  ClassAssignmentMode,
  ClassSummary,
  StudioClassScheduleItem,
  StudioScheduleCalendarDay,
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
  const fieldExamples = useMemo(() => getStudioClassFieldExamples(selectedSubject), [selectedSubject])
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
      initialItem?.teacherId
    ]
  )
  const protectedScheduleCount = useMemo(
    () => scheduleSlots.filter((slot) => slot.isReferencedByApplications).length,
    [scheduleSlots]
  )

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
            placeholder={fieldExamples.title}
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
            placeholder={fieldExamples.description}
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
            placeholder={fieldExamples.recommendedFor}
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
            placeholder={fieldExamples.experiencePoints}
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
            placeholder={fieldExamples.curriculum}
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
          <span style={helperTextStyle}>권장 크기 1200 × 900px · 4:3 비율</span>
          <span style={helperTextStyle}>
            JPG, PNG 또는 WebP 이미지를 사용할 수 있어요. 중요한 인물이나 문구는 이미지 중앙에 배치해 주세요.
          </span>
          <span style={helperTextStyle}>5MB 이하 이미지만 업로드할 수 있어요.</span>
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
        </label>

        {coverImageUploadError ? (
          <p style={{ margin: 0, color: "#b42318", fontSize: 14 }}>{coverImageUploadError}</p>
        ) : null}

        <div style={previewWrapperStyle}>
          {coverImageFilePreviewUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImageFilePreviewUrl}
                alt={`${initialItem?.title ?? "새 프로그램"} 새 대표 이미지 미리보기`}
                style={previewImageStyle}
              />
            </>
          ) : coverImageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImageUrl}
                alt={`${initialItem?.title ?? "프로그램"} 기존 대표 이미지`}
                style={previewImageStyle}
              />
            </>
          ) : (
            <div style={previewPlaceholderStyle}>대표 이미지 미리보기</div>
          )}
        </div>

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
                <span style={sectionBadgeStyle}>기본 운영시간</span>
                <span style={sectionBadgeMutedStyle}>요약 카드</span>
                <span style={sectionBadgeMutedStyle}>예외 일정 분리</span>
            </div>
            {protectedScheduleCount > 0 ? (
              <p style={{ ...warningTextStyle, margin: 0 }}>
                이미 신청에 사용된 예약시간 {protectedScheduleCount}개는 요일/날짜/시간 변경과 삭제가 잠겨 있습니다.
              </p>
            ) : null}
            <p style={{ ...helperTextStyle, margin: 0 }}>
                기본 운영시간은 요약 카드와 모달에서 정리하고, 날짜별 예외는 아래 캘린더에서 별도로 관리합니다.
            </p>
          </div>

          {scheduleCalendarError ? (
            <p style={{ margin: 0, color: "#b42318", fontSize: 14 }}>{scheduleCalendarError}</p>
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
            <div style={slotEmptyStateStyle}>
              <strong style={{ fontSize: 14, color: "#111827" }}>일정 정보를 불러오지 못했습니다.</strong>
              <p style={{ ...helperTextStyle, margin: 0 }}>
                새로고침 후 다시 시도해 주세요.
              </p>
            </div>
          )}
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

const slotEmptyStateStyle = {
  display: "grid",
  gap: 6,
  padding: 16,
  borderRadius: 14,
  border: "1px dashed #d1d5db",
  background: "#ffffff"
}

const previewWrapperStyle = {
  width: "100%",
  aspectRatio: "4 / 3",
  border: "1px solid #eeeeee",
  borderRadius: 16,
  overflow: "hidden",
  background: "#fafafa"
}

const previewImageStyle = {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "cover" as const,
  objectPosition: "center" as const
}

const previewPlaceholderStyle = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  padding: 18,
  textAlign: "center" as const,
  color: "#6b7280",
  fontSize: 14,
  lineHeight: "20px",
  background: "linear-gradient(135deg, #f2fbf3 0%, #d8f0dc 100%)"
}
