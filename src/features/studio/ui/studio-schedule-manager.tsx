"use client"

import { useActionState } from "react"

import {
  createScheduleBlockAction,
  type CreateScheduleBlockActionState
} from "@/features/studio/actions/create-schedule-block"
import { submitUpdateScheduleBlockTypeAction } from "@/features/studio/actions/update-schedule-block-type"
import type { ClassSummary, StudioScheduleBlockSummary } from "@/shared/lib/db/adapter"

type StudioScheduleManagerProps = {
  items: StudioScheduleBlockSummary[]
  classes: ClassSummary[]
}

const initialCreateState: CreateScheduleBlockActionState = {
  status: "idle",
  message: ""
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))

const PROGRAM_TYPE_LABELS: Record<ClassSummary["programType"], string> = {
  trial_class: "체험수업",
  level_test: "레벨테스트"
}

export const StudioScheduleManager = ({ items, classes }: StudioScheduleManagerProps) => {
  const [state, formAction, isPending] = useActionState(createScheduleBlockAction, initialCreateState)
  const classTitleById = new Map(classes.map((item) => [item.id, item.title]))

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "420px minmax(0, 1fr)" }}>
      <section style={cardStyle}>
        <h2 style={titleStyle}>예약 가능 시간대 생성</h2>
        <p style={descriptionStyle}>
          프로그램을 선택한 뒤 가장 단순한 날짜/시간/정원 입력으로 `available` 슬롯을 생성합니다. 신규 생성은 `class_id`를 기본으로 연결합니다.
        </p>

        <form action={formAction} style={{ display: "grid", gap: 12 }}>
          <label style={fieldStyle}>
            <span>연결할 프로그램</span>
            <select
              name="classId"
              required
              disabled={isPending || classes.length === 0}
              style={inputStyle}
              defaultValue=""
            >
              <option value="" disabled>
                프로그램을 선택해 주세요
              </option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} ({PROGRAM_TYPE_LABELS[item.programType]})
                </option>
              ))}
            </select>
            {classes.length === 0 ? (
              <span style={helperTextStyle}>먼저 /studio/classes에서 프로그램을 등록해 주세요.</span>
            ) : null}
          </label>

          <label style={fieldStyle}>
            <span>날짜</span>
            <input name="date" type="date" required disabled={isPending} style={inputStyle} />
          </label>

          <label style={fieldStyle}>
            <span>시작 시간</span>
            <input name="startTime" type="time" required disabled={isPending} style={inputStyle} />
          </label>

          <label style={fieldStyle}>
            <span>종료 시간</span>
            <input name="endTime" type="time" required disabled={isPending} style={inputStyle} />
          </label>

          <label style={fieldStyle}>
            <span>정원</span>
            <input
              name="capacity"
              type="number"
              min={1}
              defaultValue={1}
              required
              disabled={isPending}
              style={inputStyle}
            />
          </label>

          {state.message ? (
            <p style={{ margin: 0, color: state.status === "error" ? "#b42318" : "#111827", fontSize: 14 }}>
              {state.message}
            </p>
          ) : null}

          <button type="submit" disabled={isPending} style={buttonStyle}>
            {isPending ? "생성 중..." : "available 슬롯 생성"}
          </button>
        </form>
      </section>

      <section style={cardStyle}>
        <h2 style={titleStyle}>예약 가능 시간대 목록</h2>
        <p style={descriptionStyle}>`trial_booked`는 읽기 전용으로만 표시합니다.</p>

        {items.length === 0 ? (
          <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: "20px" }}>
            아직 등록된 시간대가 없습니다.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((item) => (
              <article key={item.id} style={slotCardStyle}>
                <div style={{ display: "grid", gap: 6 }}>
                  <strong style={{ color: "#111827", fontSize: 16, lineHeight: "22px" }}>
                    {formatDateTime(item.startAt)} - {formatDateTime(item.endAt)}
                  </strong>
                  <p style={metaTextStyle}>
                    상태: {item.type} / 신청 {item.appliedCount}명 / 정원 {item.capacity}명 / 남은{" "}
                    {item.remainingCount}명
                  </p>
                  <p style={metaTextStyle}>
                    연결:{" "}
                    {item.classId
                      ? (classTitleById.get(item.classId) ?? "프로그램 정보 없음")
                      : "legacy(미연결)"}
                  </p>
                  <p style={metaTextStyle}>마감 여부: {item.isClosed ? "마감" : "예약 가능"}</p>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: "4px 10px",
                      background:
                        item.type === "available"
                          ? "#dcfce7"
                          : item.type === "blocked"
                            ? "#f3f4f6"
                            : "#fee2e2",
                      color:
                        item.type === "available"
                          ? "#166534"
                          : item.type === "blocked"
                            ? "#4b5563"
                            : "#b91c1c",
                      fontSize: 12,
                      lineHeight: "18px",
                      fontWeight: 600
                    }}
                  >
                    {item.type}
                  </span>

                  {item.type === "trial_booked" ? null : (
                    <form action={submitUpdateScheduleBlockTypeAction}>
                      <input type="hidden" name="scheduleBlockId" value={item.id} />
                      <input
                        type="hidden"
                        name="nextType"
                        value={item.type === "available" ? "blocked" : "available"}
                      />
                      <button type="submit" style={secondaryButtonStyle}>
                        {item.type === "available" ? "blocked 처리" : "available 복원"}
                      </button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 20
}

const slotCardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  display: "flex",
  justifyContent: "space-between",
  gap: 16
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
  padding: "8px 12px",
  cursor: "pointer"
}

const metaTextStyle = {
  margin: 0,
  color: "#4b5563",
  fontSize: 14,
  lineHeight: "20px"
}
