"use client"

import { useActionState, useEffect, useMemo, useState } from "react"

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
import type { ClassSummary, StudioTeacherOption } from "@/shared/lib/db/adapter"

type StudioClassFormProps = {
  currentTeacherId: string
  teacherOptions: StudioTeacherOption[]
  teacherOptionsError: string | null
  initialItem?: ClassSummary | null
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
  currentTeacherId,
  teacherOptions,
  teacherOptionsError,
  initialItem
}: StudioClassFormProps) => {
  const [selectedClassId, setSelectedClassId] = useState(initialItem?.id ?? "")
  const [selectedProgramType, setSelectedProgramType] = useState(initialItem?.programType ?? "trial_class")
  const [coverImageUrlDraft, setCoverImageUrlDraft] = useState(initialItem?.coverImageUrl ?? "")
  const [selectedSubject, setSelectedSubject] = useState(
    studioClassSubjectOptions.includes(initialItem?.subject as (typeof studioClassSubjectOptions)[number])
      ? initialItem?.subject
      : ""
  )
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>([createEmptyScheduleSlotDraft()])
  const action = useMemo(() => upsertStudioClassAction, [])
  const [state, formAction, isPending] = useActionState(action, initialState)
  const targetAgeRange = parseStudioClassTargetAgeRange(initialItem?.targetAge)
  const selectedRegion = normalizeAcademyArea(initialItem?.region)
  const teacherOptionIds = new Set(teacherOptions.map((option) => option.teacherId))
  const selectedTeacherId =
    initialItem?.teacherId && teacherOptionIds.has(initialItem.teacherId)
      ? initialItem.teacherId
      : teacherOptionIds.has(currentTeacherId)
        ? currentTeacherId
        : (teacherOptions[0]?.teacherId ?? "")
  const isTeacherOptionUnavailable = teacherOptions.length === 0
  const mode = selectedClassId ? "update" : "create"
  const safeCoverImageUrlDraft = coverImageUrlDraft ?? ""

  useEffect(() => {
    setSelectedClassId(initialItem?.id ?? "")
    setSelectedProgramType(initialItem?.programType ?? "trial_class")
    setCoverImageUrlDraft(initialItem?.coverImageUrl ?? "")
    setSelectedSubject(
      studioClassSubjectOptions.includes(initialItem?.subject as (typeof studioClassSubjectOptions)[number])
        ? (initialItem?.subject ?? "")
        : ""
    )
    setScheduleSlots([createEmptyScheduleSlotDraft()])
  }, [initialItem?.coverImageUrl, initialItem?.id, initialItem?.programType, initialItem?.subject])

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

  const removeScheduleSlot = (slotId: string) => {
    setScheduleSlots((current) =>
      current.length > 1 ? current.filter((slot) => slot.id !== slotId) : current
    )
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>{selectedClassId ? "프로그램 수정" : "새 프로그램 등록"}</h2>
      <p style={descriptionStyle}>
        같은 organization에 등록된 담당 선생님을 선택해 저장합니다. create 모드에서만 예약 가능 시간을 함께 만들고, update 모드는 이번 단계에서 기본 정보만 수정합니다.
      </p>

      <form action={formAction} style={{ display: "grid", gap: 12 }}>
        <input type="hidden" name="mode" value={mode} />
        {mode === "update" ? <input type="hidden" name="classId" value={selectedClassId} /> : null}
        <input type="hidden" name="programType" value={selectedProgramType} />
        <input type="hidden" name="subject" value={selectedSubject} />

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
                    borderColor: isSelected ? "#111827" : "#d1d5db",
                    background: isSelected ? "#111827" : "#fff",
                    color: isSelected ? "#fff" : "#111827"
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
                    borderColor: isSelected ? "#111827" : "#d1d5db",
                    background: isSelected ? "#111827" : "#fff",
                    color: isSelected ? "#fff" : "#111827"
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
          <span>프로그램 소개</span>
          <textarea
            name="description"
            defaultValue={initialItem?.description ?? ""}
            required
            minLength={10}
            rows={5}
            disabled={isPending}
            style={{ ...inputStyle, resize: "vertical" }}
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
          {teacherOptions.length > 0 ? (
            <select
              name="teacherId"
              defaultValue={selectedTeacherId}
              disabled={isPending}
              style={inputStyle}
            >
              {teacherOptions.map((option) => (
                <option key={option.teacherId} value={option.teacherId}>
                  {option.teacherName}
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
              : isTeacherOptionUnavailable
                ? "현재 organization에 등록된 선생님이 없어 저장할 수 없습니다."
                : "현재 organization에 등록된 선생님만 선택할 수 있습니다."}
          </span>
        </label>

        <label style={fieldStyle}>
          <span>대표 이미지 URL</span>
          <input
            name="coverImageUrl"
            type="url"
            value={safeCoverImageUrlDraft}
            onChange={(event) => setCoverImageUrlDraft(event.target.value ?? "")}
            disabled={isPending}
            placeholder="https://..."
            style={inputStyle}
          />
        </label>

        {safeCoverImageUrlDraft ? (
          <div style={previewWrapperStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={safeCoverImageUrlDraft}
              alt={`${initialItem?.title ?? "새 프로그램"} 대표 이미지`}
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: 14, color: "#111827" }}>시간 {index + 1}</strong>
                    <button
                      type="button"
                      onClick={() => removeScheduleSlot(slot.id)}
                      disabled={isPending || scheduleSlots.length === 1}
                      style={tertiaryButtonStyle}
                    >
                      제거
                    </button>
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

            <button type="button" onClick={addScheduleSlot} disabled={isPending} style={secondaryButtonStyle}>
              + 시간 추가
            </button>
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

        {state.message || teacherOptionsError || isTeacherOptionUnavailable ? (
          <p style={{ margin: 0, color: state.ok ? "#111827" : "#b42318", fontSize: 14 }}>
            {teacherOptionsError ??
              (isTeacherOptionUnavailable
                ? "담당 선생님 목록이 비어 있어 프로그램을 저장할 수 없습니다."
                : state.message)}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || isTeacherOptionUnavailable || Boolean(teacherOptionsError)}
          style={buttonStyle}
        >
          {isPending ? "저장 중..." : mode === "update" ? "프로그램 수정" : "프로그램 등록"}
        </button>
      </form>
    </section>
  )
}

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 20
}

const titleStyle = {
  margin: "0 0 8px",
  fontSize: 18,
  lineHeight: "24px",
  color: "#111827"
}

const descriptionStyle = {
  margin: "0 0 16px",
  fontSize: 14,
  lineHeight: "20px",
  color: "#4b5563"
}

const fieldStyle = {
  display: "grid",
  gap: 6
}

const inputStyle = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #d1d5db"
}

const helperTextStyle = {
  color: "#6b7280",
  fontSize: 13,
  lineHeight: "18px"
}

const chipGroupStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8
}

const chipButtonStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 999,
  background: "#fff",
  color: "#111827",
  fontSize: 13,
  lineHeight: "18px",
  fontWeight: 600,
  padding: "8px 12px",
  cursor: "pointer"
}

const buttonStyle = {
  border: 0,
  borderRadius: 10,
  background: "#111827",
  color: "#fff",
  fontSize: 14,
  lineHeight: "20px",
  fontWeight: 600,
  padding: "12px 16px",
  cursor: "pointer"
}

const secondaryButtonStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#fff",
  color: "#111827",
  fontSize: 13,
  lineHeight: "18px",
  fontWeight: 600,
  padding: "10px 14px",
  cursor: "pointer"
}

const tertiaryButtonStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
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
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fcfcfd"
}

const slotRowStyle = {
  display: "grid",
  gap: 12,
  padding: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff"
}

const slotGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))"
}

const previewWrapperStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  overflow: "hidden",
  background: "#f9fafb"
}

const previewImageStyle = {
  display: "block",
  width: "100%",
  maxHeight: 220,
  objectFit: "cover" as const
}
