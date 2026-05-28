"use client"

import { useActionState, useMemo, useState, useTransition } from "react"

import { deactivateStudioTeacherAction } from "@/features/studio/actions/deactivate-studio-teacher"
import {
  upsertStudioTeacherAction,
  type UpsertStudioTeacherActionState
} from "@/features/studio/actions/upsert-studio-teacher"
import type { StudioTeacherSeatSummary, StudioTeacherSummary } from "@/shared/lib/db/adapter"

type StudioTeachersManagerProps = {
  items: StudioTeacherSummary[]
  seatSummary: StudioTeacherSeatSummary
}

const initialState: UpsertStudioTeacherActionState = {
  ok: false,
  message: ""
}

const formatCreatedAt = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value))

export const StudioTeachersManager = ({
  items,
  seatSummary
}: StudioTeachersManagerProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [isDeactivatePending, startDeactivateTransition] = useTransition()
  const selectedTeacher = items.find((item) => item.id === selectedId) ?? null

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={statsGridStyle}>
        <SummaryCard label="등록된 선생님" value={`${seatSummary.activeTeacherCount}명`} />
        <SummaryCard label="최대 등록 가능" value={`${seatSummary.teacherSeatLimit}명`} />
        <SummaryCard label="남은 좌석" value={`${seatSummary.remainingTeacherSeats}명`} />
      </section>

      {seatSummary.remainingTeacherSeats <= 0 ? (
        <section style={noticeCardStyle}>
          <strong style={{ color: "#7c2d12", fontSize: 15 }}>선생님 등록 한도에 도달했습니다.</strong>
          <p style={{ margin: 0, color: "#9a3412", fontSize: 14, lineHeight: "20px" }}>
            추가 선생님 등록은 추가 결제 상품으로 제공될 예정입니다.
          </p>
        </section>
      ) : null}

      {actionFeedback ? (
        <p style={{ margin: 0, color: actionFeedback.includes("실패") ? "#b42318" : "#111827", fontSize: 14 }}>
          {actionFeedback}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: 16,
          alignItems: "start",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(360px, 420px)"
        }}
      >
        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={titleStyle}>선생님 목록</h2>
              <p style={descriptionStyle}>
                현재 로그인한 학원 organization 기준으로만 조회합니다. 학원 로그인 계정에 연결된 선생님 row는 제외하고, 내부 선생님 프로필만 관리합니다.
              </p>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} style={secondaryButtonStyle}>
              신규 등록
            </button>
          </div>

          {items.length === 0 ? (
            <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: "20px" }}>
              아직 등록된 선생님이 없습니다. 먼저 선생님 프로필을 추가해 주세요.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {items.map((item) => {
                return (
                  <article
                    key={item.id}
                    style={{
                      border: selectedId === item.id ? "1px solid #111827" : "1px solid #e5e7eb",
                      borderRadius: 14,
                      background: "#fff",
                      padding: 16
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ color: "#111827", fontSize: 16 }}>{item.displayName}</strong>
                          <StatusChip isActive={item.isActive} />
                        </div>
                        <p style={metaTextStyle}>등록일: {formatCreatedAt(item.createdAt)}</p>
                      </div>

                      <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                        <button type="button" onClick={() => setSelectedId(item.id)} style={secondaryButtonStyle}>
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionFeedback(null)
                            startDeactivateTransition(async () => {
                              const result = await deactivateStudioTeacherAction(item.id)
                              setActionFeedback(result.message)
                            })
                          }}
                          disabled={isDeactivatePending || !item.isActive}
                          style={secondaryButtonStyle}
                        >
                          {item.isActive ? "비활성화" : "비활성 상태"}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <StudioTeacherForm
          key={selectedTeacher?.id ?? "create"}
          initialItem={selectedTeacher}
          seatSummary={seatSummary}
          onResetCreate={() => setSelectedId(null)}
        />
      </div>
    </div>
  )
}

const StudioTeacherForm = ({
  initialItem,
  seatSummary,
  onResetCreate
}: {
  initialItem: StudioTeacherSummary | null
  seatSummary: StudioTeacherSeatSummary
  onResetCreate: () => void
}) => {
  const action = useMemo(() => upsertStudioTeacherAction, [])
  const [state, formAction, isPending] = useActionState(action, initialState)
  const isCreateMode = !initialItem
  const isCreateDisabled = isCreateMode && seatSummary.activeTeacherCount >= seatSummary.teacherSeatLimit

  return (
    <section style={cardStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <h2 style={titleStyle}>{isCreateMode ? "새 선생님 등록" : "선생님 정보 수정"}</h2>
          <p style={descriptionStyle}>
            선생님 이름만 관리합니다. 선생님 개별 로그인 계정 생성은 이번 MVP 범위에 포함하지 않습니다.
          </p>
        </div>
        {!isCreateMode ? (
          <button type="button" onClick={onResetCreate} style={secondaryButtonStyle}>
            새로 등록
          </button>
        ) : null}
      </div>

      <form action={formAction} style={{ display: "grid", gap: 12 }}>
        <input type="hidden" name="mode" value={isCreateMode ? "create" : "update"} />
        {!isCreateMode ? <input type="hidden" name="teacherId" value={initialItem.id} /> : null}

        <label style={fieldStyle}>
          <span>선생님 이름</span>
          <input
            name="displayName"
            defaultValue={initialItem?.displayName ?? ""}
            required
            minLength={2}
            maxLength={30}
            disabled={isPending}
            style={inputStyle}
          />
        </label>

        {state.message ? (
          <p style={{ margin: 0, color: state.ok ? "#111827" : "#b42318", fontSize: 14 }}>
            {state.message}
          </p>
        ) : null}

        {isCreateDisabled ? (
          <p style={{ margin: 0, color: "#92400e", fontSize: 13, lineHeight: "18px" }}>
            active 선생님 수가 최대 등록 가능 수에 도달해 신규 등록을 막습니다.
          </p>
        ) : null}

        <button type="submit" disabled={isPending || isCreateDisabled} style={buttonStyle}>
          {isPending ? "저장 중..." : isCreateMode ? "선생님 등록" : "정보 수정"}
        </button>
      </form>
    </section>
  )
}

const SummaryCard = ({ label, value }: { label: string; value: string }) => (
  <div style={cardStyle}>
    <p style={summaryLabelStyle}>{label}</p>
    <p style={summaryValueStyle}>{value}</p>
  </div>
)

const StatusChip = ({ isActive }: { isActive: boolean }) => (
  <span
    style={{
      borderRadius: 999,
      padding: "4px 10px",
      background: isActive ? "#dcfce7" : "#f3f4f6",
      color: isActive ? "#166534" : "#4b5563",
      fontSize: 12,
      lineHeight: "18px",
      fontWeight: 600
    }}
  >
    {isActive ? "active" : "inactive"}
  </span>
)

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 20
}

const noticeCardStyle = {
  ...cardStyle,
  background: "#fff7ed",
  border: "1px solid #fdba74",
  display: "grid",
  gap: 8
}

const statsGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))"
}

const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 16
}

const titleStyle = {
  margin: "0 0 8px",
  fontSize: 18,
  lineHeight: "24px",
  color: "#111827"
}

const descriptionStyle = {
  margin: 0,
  fontSize: 14,
  lineHeight: "20px",
  color: "#4b5563"
}

const summaryLabelStyle = {
  margin: "0 0 8px",
  fontSize: 14,
  lineHeight: "20px",
  color: "#4b5563"
}

const summaryValueStyle = {
  margin: 0,
  fontSize: 28,
  lineHeight: "34px",
  color: "#111827",
  fontWeight: 700
}

const metaTextStyle = {
  margin: 0,
  color: "#4b5563",
  fontSize: 14,
  lineHeight: "20px"
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
