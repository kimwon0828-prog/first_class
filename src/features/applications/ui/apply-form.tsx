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

const ageOptions = Array.from({ length: 9 }, (_, index) => `${index + 5}세`)

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
        <span>자녀 이름</span>
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
        <span>자녀 나이</span>
        <select
          name="childGrade"
          required
          disabled={isPending}
          style={{ padding: 10 }}
          defaultValue=""
        >
          <option value="" disabled>
            자녀 나이를 선택해 주세요
          </option>
          {ageOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
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
        <legend style={{ padding: "0 4px" }}>예약 가능 시간대</legend>

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

      <label style={{ display: "grid", gap: 6 }}>
        <span>메모</span>
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
        {isPending ? "신청 제출 중..." : "체험 신청하기"}
      </button>
    </form>
  )
}
