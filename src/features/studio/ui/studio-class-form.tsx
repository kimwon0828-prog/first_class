"use client"

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
import type { ClassSummary, StudioTeacherOption } from "@/shared/lib/db/adapter"

type StudioClassFormProps = {
  organizationId: string
  currentTeacherId: string
  teacherOptions: StudioTeacherOption[]
  teacherOptionsError: string | null
  initialItem?: ClassSummary | null
  onCreated?: () => void
}

const initialState: UpsertStudioClassActionState = {
  ok: false,
  message: ""
}

type ScheduleSlotDraft = {
  id: string
  date: string
  startTime: string
  endTime: string
  capacity: string
}

const createEmptyScheduleSlotDraft = (): ScheduleSlotDraft => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  date: "",
  startTime: "",
  endTime: "",
  capacity: "1"
})

export const StudioClassForm = ({
  organizationId,
  currentTeacherId,
  teacherOptions,
  teacherOptionsError,
  initialItem,
  onCreated
}: StudioClassFormProps) => {
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
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>([createEmptyScheduleSlotDraft()])
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
    setScheduleSlots([createEmptyScheduleSlotDraft()])
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
    initialItem?.classFormat
  ])

  useEffect(() => {
    const previousOk = previousOkRef.current
    previousOkRef.current = state.ok

    if (!previousOk && state.ok && mode === "create") {
      onCreated?.()
    }
  }, [mode, onCreated, state.ok])

  useEffect(() => {
    return () => {
      if (coverImageFilePreviewUrl) {
        URL.revokeObjectURL(coverImageFilePreviewUrl)
      }
    }
  }, [coverImageFilePreviewUrl])

  const handleScheduleSlotChange = (
    slotId: string,
    key: keyof Omit<ScheduleSlotDraft, "id">,
    value: string
  ) => {
    setScheduleSlots((current) =>
      current.map((slot) => (slot.id === slotId ? { ...slot, [key]: value } : slot))
    )
  }

  const addScheduleSlot = () => {
    setScheduleSlots((current) => [...current, createEmptyScheduleSlotDraft()])
  }

  const duplicateScheduleSlot = (slotId: string) => {
    setScheduleSlots((current) => {
      const source = current.find((slot) => slot.id === slotId)
      if (!source) {
        return current
      }

      return [...current, { ...source, id: createEmptyScheduleSlotDraft().id }]
    })
  }

  const removeScheduleSlot = (slotId: string) => {
    setScheduleSlots((current) =>
      current.length > 1 ? current.filter((slot) => slot.id !== slotId) : current
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

      console.log("[supabase url]", process.env.NEXT_PUBLIC_SUPABASE_URL)
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
        console.error("[cover upload failed]", {
          message: (uploadError as unknown as { message?: unknown }).message,
          name: (uploadError as unknown as { name?: unknown }).name,
          statusCode: (uploadError as unknown as { statusCode?: unknown }).statusCode,
          cause: uploadError,
          organizationId,
          path: objectName
        })

        const debug =
          process.env.NODE_ENV === "development"
            ? `: ${
                typeof (uploadError as unknown as { message?: unknown }).message === "string"
                  ? (uploadError as unknown as { message: string }).message
                  : "알 수 없는 오류"
              }`
            : ""
        setCoverImageUploadError(`이미지 업로드에 실패했어요. 관리자에게 문의해주세요${debug}`)
        return
      }

      const {
        data: { publicUrl }
      } = supabase.storage.from("class-covers").getPublicUrl(objectName)

      if (!publicUrl) {
        const debug = process.env.NODE_ENV === "development" ? `: publicUrl이 비어있습니다` : ""
        setCoverImageUploadError(`이미지 업로드에 실패했어요. 관리자에게 문의해주세요${debug}`)
        return
      }

      setCoverImageUrl(publicUrl)
    } catch (error) {
      console.error("[cover upload failed]", {
        message: error instanceof Error ? error.message : undefined,
        name: error instanceof Error ? error.name : undefined,
        statusCode: (error as unknown as { statusCode?: unknown })?.statusCode,
        cause: error,
        organizationId,
        path: `${organizationId}/(generated).${extension}`
      })

      const debug =
        process.env.NODE_ENV === "development"
          ? `: ${error instanceof Error ? error.message : "알 수 없는 오류"}`
          : ""
      setCoverImageUploadError(`이미지 업로드에 실패했어요. 관리자에게 문의해주세요${debug}`)
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
            같은 organization에 등록된 담당 선생님을 선택해 저장합니다. create 모드에서만 예약 가능 시간을 함께 만들고, update 모드는 이번 단계에서 기본 정보만 수정합니다.
          </p>
        </div>
      </div>

      <form action={formAction} style={{ display: "grid", gap: 12 }}>
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

        {mode === "create" ? (
          <section style={slotSectionStyle}>
            <div style={{ display: "grid", gap: 4 }}>
              <strong style={{ color: "#111827", fontSize: 15 }}>예약 가능 시간</strong>
              <p style={{ ...helperTextStyle, margin: 0 }}>
                신규 프로그램 등록과 동시에 `available` 슬롯을 생성합니다. 반복 생성, 겹침 탐지는 이번 단계에서 만들지 않습니다.
              </p>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {scheduleSlots.map((slot, index) => (
                <div key={slot.id} style={slotRowStyle}>
                  <div style={slotHeaderStyle}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <strong style={{ fontSize: 14, color: "#111827" }}>시간 {index + 1}</strong>
                      <p style={{ margin: 0, color: "#8a8a8a", fontSize: 12, lineHeight: "16px" }}>
                        {(slot.date || slot.startTime || slot.endTime || slot.capacity) ? (
                          <>
                            {(slot.date || "-")} · {(slot.startTime || "--:--")}~{(slot.endTime || "--:--")} · 정원{" "}
                            {(slot.capacity || "-")}
                          </>
                        ) : (
                          <>날짜/시간을 입력해 주세요.</>
                        )}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => duplicateScheduleSlot(slot.id)}
                        disabled={isPending}
                        style={tertiaryButtonStyle}
                      >
                        복사
                      </button>
                      <button
                        type="button"
                        onClick={() => removeScheduleSlot(slot.id)}
                        disabled={isPending || scheduleSlots.length === 1}
                        style={tertiaryButtonStyle}
                      >
                        제거
                      </button>
                    </div>
                  </div>

                  <div style={slotGridStyle}>
                    <label style={fieldStyle}>
                      <span>날짜</span>
                      <input
                        name="slotDate"
                        type="date"
                        value={slot.date}
                        onChange={(event) =>
                          handleScheduleSlotChange(slot.id, "date", event.target.value)
                        }
                        required
                        disabled={isPending}
                        style={inputStyle}
                      />
                    </label>

                    <label style={fieldStyle}>
                      <span>시작 시간</span>
                      <input
                        name="slotStartTime"
                        type="time"
                        value={slot.startTime}
                        onChange={(event) =>
                          handleScheduleSlotChange(slot.id, "startTime", event.target.value)
                        }
                        required
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
                          handleScheduleSlotChange(slot.id, "endTime", event.target.value)
                        }
                        required
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
                          handleScheduleSlotChange(slot.id, "capacity", event.target.value)
                        }
                        required
                        disabled={isPending}
                        style={inputStyle}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <p style={{ ...helperTextStyle, margin: 0 }}>
                여러 시간대를 등록해두면 학부모와 상담할 때 선택지가 늘어납니다.
              </p>
              <button
                type="button"
                onClick={addScheduleSlot}
                disabled={isPending}
                style={secondaryButtonStyle}
              >
                + 시간 추가
              </button>
            </div>
          </section>
        ) : (
          <section style={slotSectionStyle}>
            <strong style={{ color: "#111827", fontSize: 15 }}>연결된 예약 가능 시간</strong>
            <p style={{ ...helperTextStyle, margin: 0 }}>
              update 모드에서는 프로그램 기본 정보만 수정합니다. linked slot 대량 수정은 이번 단계 범위에서 제외합니다.
            </p>
          </section>
        )}

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

const secondaryButtonStyle = {
  border: "1px solid #d9d9d9",
  borderRadius: 12,
  background: "#fff",
  color: "#111111",
  fontSize: 14,
  lineHeight: "18px",
  fontWeight: 700,
  padding: "10px 14px",
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
