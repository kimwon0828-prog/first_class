"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useMemo, useState } from "react"

import {
  createTrialApplicationAction,
  type CreateTrialApplicationActionState
} from "@/features/applications/actions/create-trial-application"
import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"

type ApplyFormProps = {
  classId: string
  availableSlots: AvailableScheduleSlot[]
  slotsError: string | null
}

const initialState: CreateTrialApplicationActionState = {
  status: "idle",
  message: ""
}

const gradeOptions = [
  "유아",
  "초1",
  "초2",
  "초3",
  "초4",
  "초5",
  "초6",
  "중1",
  "중2",
  "중3",
  "고1",
  "고2",
  "고3"
]

const formatSlot = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  })
}

export const ApplyForm = ({ classId, availableSlots, slotsError }: ApplyFormProps) => {
  const router = useRouter()
  const boundAction = createTrialApplicationAction.bind(null, classId)
  const [state, formAction, isPending] = useActionState(boundAction, initialState)
  const [selectedSlotId, setSelectedSlotId] = useState("")

  const selectedSlot = useMemo(
    () => availableSlots.find((slot) => slot.id === selectedSlotId) ?? null,
    [availableSlots, selectedSlotId]
  )
  const hasSelectableSlots = useMemo(
    () => availableSlots.some((slot) => !slot.isClosed),
    [availableSlots]
  )
  const canSubmit =
    !slotsError && hasSelectableSlots && Boolean(selectedSlot && !selectedSlot.isClosed)

  useEffect(() => {
    if (selectedSlot?.isClosed) {
      setSelectedSlotId("")
    }
  }, [selectedSlot?.isClosed])

  useEffect(() => {
    if (state.status === "success" && state.redirectTo) {
      router.replace(state.redirectTo)
    }
  }, [router, state.redirectTo, state.status])

  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span>학생명</span>
        <input
          name="childName"
          type="text"
          required
          minLength={2}
          maxLength={30}
          disabled={isPending}
          style={{ padding: 10 }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>학년</span>
        <select
          name="childGrade"
          required
          disabled={isPending}
          style={{ padding: 10 }}
          defaultValue=""
        >
          <option value="" disabled>
            학년을 선택해 주세요
          </option>
          {gradeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>보호자명</span>
        <input
          name="parentName"
          type="text"
          required
          minLength={2}
          maxLength={30}
          disabled={isPending}
          style={{ padding: 10 }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>보호자 연락처</span>
        <input
          name="parentPhone"
          type="tel"
          required
          minLength={8}
          maxLength={20}
          disabled={isPending}
          placeholder="010-0000-0000"
          style={{ padding: 10 }}
        />
      </label>

      <fieldset
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 10,
          display: "grid",
          gap: 8
        }}
      >
        <legend style={{ padding: "0 4px" }}>희망 시간대</legend>

        {slotsError ? (
          <p style={{ margin: 0, color: "#b42318", fontSize: 14 }}>{slotsError}</p>
        ) : null}

        {!slotsError && availableSlots.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            현재 선택 가능한 예약 시간대가 없습니다.
          </p>
        ) : null}

        {!slotsError && availableSlots.length > 0
          ? availableSlots.map((slot) => (
              <label
                key={slot.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "8px 6px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  opacity: slot.isClosed ? 0.6 : 1
                }}
              >
                <input
                  type="radio"
                  name="selectedScheduleBlockId"
                  value={slot.id}
                  required={hasSelectableSlots}
                  checked={selectedSlotId === slot.id}
                  onChange={() => {
                    setSelectedSlotId(slot.id)
                  }}
                  disabled={isPending || slot.isClosed}
                />
                <span style={{ fontSize: 14 }}>
                  {formatSlot(slot.startAt)}{" "}
                  {slot.isClosed ? (
                    <strong style={{ color: "#b42318" }}>마감</strong>
                  ) : (
                    <span style={{ color: "#4b5563" }}>남은 {slot.remainingCount}자리</span>
                  )}
                </span>
              </label>
            ))
          : null}
      </fieldset>

      <details
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 10,
          background: "#fcfcfd"
        }}
      >
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          선택 정보 추가 입력
        </summary>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>학교</span>
            <input
              name="childSchool"
              type="text"
              maxLength={60}
              disabled={isPending}
              style={{ padding: 10 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>학생 특이사항</span>
            <textarea
              name="childNotes"
              rows={3}
              maxLength={500}
              disabled={isPending}
              placeholder="알레르기, 성향, 주의사항이 있으면 적어 주세요."
              style={{ padding: 10, resize: "vertical" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>과목 경험 여부</span>
            <select
              name="subjectExperienceYn"
              defaultValue=""
              disabled={isPending}
              style={{ padding: 10 }}
            >
              <option value="">선택 안 함</option>
              <option value="yes">있음</option>
              <option value="no">없음</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>경험 기간</span>
            <input
              name="subjectExperienceDuration"
              type="text"
              maxLength={60}
              disabled={isPending}
              placeholder="예: 6개월, 1년"
              style={{ padding: 10 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>현재 수준</span>
            <input
              name="currentLevel"
              type="text"
              maxLength={80}
              disabled={isPending}
              placeholder="예: 기초 개념 가능, 입문 단계"
              style={{ padding: 10 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>실제 등록 시 선호 시간대</span>
            <input
              name="preferredRegularSchedule"
              type="text"
              maxLength={120}
              disabled={isPending}
              placeholder="예: 평일 5시 이후, 토요일 오전"
              style={{ padding: 10 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>목표</span>
            <select name="goalType" defaultValue="" disabled={isPending} style={{ padding: 10 }}>
              <option value="">선택 안 함</option>
              <option value="영재원">영재원</option>
              <option value="고입">고입</option>
              <option value="입시">입시</option>
              <option value="대회">대회</option>
              <option value="흥미">흥미</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>목표 상세</span>
            <textarea
              name="goalNote"
              rows={3}
              maxLength={500}
              disabled={isPending}
              placeholder="목표나 상담 희망 내용을 자유롭게 적어 주세요."
              style={{ padding: 10, resize: "vertical" }}
            />
          </label>
        </div>
      </details>

      <label style={{ display: "grid", gap: 6 }}>
        <span>추가 메모</span>
        <textarea
          name="memo"
          rows={4}
          maxLength={500}
          disabled={isPending}
          placeholder="아이 성향, 요청 사항이 있으면 남겨 주세요."
          style={{ padding: 10, resize: "vertical" }}
        />
      </label>

      {state.message ? (
        <p
          style={{
            margin: 0,
            color: state.status === "error" ? "#b42318" : "#1f2937",
            fontSize: 14
          }}
        >
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={isPending || !canSubmit} style={{ padding: "12px 14px" }}>
        {isPending ? "신청 제출 중..." : "신청하기"}
      </button>
    </form>
  )
}
