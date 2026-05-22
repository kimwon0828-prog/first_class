"use client"

import type { CSSProperties } from "react"

import type { ChildProfile } from "@/shared/lib/db/adapter"

import type { ChildProfileActionState } from "@/features/children/actions/create-child-profile"

type ChildProfileFormProps = {
  mode: "create" | "update"
  formAction: (payload: FormData) => void
  isPending: boolean
  state: ChildProfileActionState
  initialValue?: ChildProfile | null
  onCancelEdit?: () => void
}

const inputStyle = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d0d5dd",
  fontSize: 14
} satisfies CSSProperties

export const ChildProfileForm = ({
  mode,
  formAction,
  isPending,
  state,
  initialValue,
  onCancelEdit
}: ChildProfileFormProps) => {
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      {mode === "update" && initialValue ? <input type="hidden" name="childId" value={initialValue.id} /> : null}

      <label style={{ display: "grid", gap: 6 }}>
        <span>학생명</span>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={30}
          defaultValue={initialValue?.name ?? ""}
          disabled={isPending}
          style={inputStyle}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>학년/연령</span>
        <input
          name="grade"
          type="text"
          required
          maxLength={30}
          defaultValue={initialValue?.grade ?? ""}
          disabled={isPending}
          placeholder="예: 초3, 7세"
          style={inputStyle}
        />
      </label>

      <details
        open={mode === "update"}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 12,
          backgroundColor: "#fcfcfd"
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
          선택 정보 더 입력하기
        </summary>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>학교</span>
            <input
              name="schoolName"
              type="text"
              maxLength={60}
              defaultValue={initialValue?.schoolName ?? ""}
              disabled={isPending}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>특이사항</span>
            <textarea
              name="notes"
              rows={3}
              maxLength={500}
              defaultValue={initialValue?.notes ?? ""}
              disabled={isPending}
              placeholder="성향, 주의사항, 알레르기 등을 적어 주세요."
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>현재 수준</span>
            <input
              name="currentLevel"
              type="text"
              maxLength={120}
              defaultValue={initialValue?.currentLevel ?? ""}
              disabled={isPending}
              placeholder="예: 입문 단계, 기초 개념 가능"
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>관심 과목</span>
            <input
              name="interestSubjects"
              type="text"
              maxLength={120}
              defaultValue={initialValue?.interestSubjects ?? ""}
              disabled={isPending}
              placeholder="예: 수학, 과학"
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>목표/고민 메모</span>
            <textarea
              name="goalNote"
              rows={4}
              maxLength={500}
              defaultValue={initialValue?.goalNote ?? ""}
              disabled={isPending}
              placeholder="학습 목표나 상담 시 전달하고 싶은 내용을 적어 주세요."
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
        </div>
      </details>

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

      <div style={{ display: "grid", gap: 8 }}>
        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "none",
            backgroundColor: "#111827",
            color: "#fff",
            fontSize: 14
          }}
        >
          {isPending
            ? mode === "create"
              ? "등록 중..."
              : "수정 중..."
            : mode === "create"
              ? "자녀 등록"
              : "자녀 정보 저장"}
        </button>

        {mode === "update" && onCancelEdit ? (
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={isPending}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #d0d5dd",
              backgroundColor: "#fff",
              color: "#344054",
              fontSize: 14
            }}
          >
            수정 취소
          </button>
        ) : null}
      </div>
    </form>
  )
}
