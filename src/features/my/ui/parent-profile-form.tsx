"use client"

import { useActionState } from "react"

import {
  updateParentProfileAction,
  type UpdateParentProfileActionState
} from "@/features/my/actions/update-parent-profile"

type ParentProfileFormProps = {
  initialName: string
  initialPhone: string | null
}

const initialState: UpdateParentProfileActionState = {
  status: "idle",
  message: ""
}

export const ParentProfileForm = ({ initialName, initialPhone }: ParentProfileFormProps) => {
  const [state, formAction, isPending] = useActionState(updateParentProfileAction, initialState)

  return (
    <form action={formAction} style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span>보호자명</span>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={30}
          defaultValue={initialName}
          disabled={isPending}
          style={{ padding: 10 }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>보호자 연락처</span>
        <input
          name="phone"
          type="tel"
          maxLength={20}
          defaultValue={initialPhone ?? ""}
          disabled={isPending}
          placeholder="010-0000-0000"
          style={{ padding: 10 }}
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

      <button type="submit" disabled={isPending} style={{ padding: "12px 14px" }}>
        {isPending ? "저장 중..." : "보호자 정보 저장"}
      </button>
    </form>
  )
}
