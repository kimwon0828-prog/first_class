"use client"

import type { CSSProperties } from "react"
import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import {
  createChildProfileAction,
  type ChildProfileActionState
} from "@/features/children/actions/create-child-profile"
import { updateChildProfileAction } from "@/features/children/actions/update-child-profile"
import { ChildProfileForm } from "@/features/children/ui/child-profile-form"
import type { ChildProfile } from "@/shared/lib/db/adapter"

type MyChildrenManagerProps = {
  items: ChildProfile[]
}

const initialActionState: ChildProfileActionState = {
  status: "idle",
  message: ""
}

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  backgroundColor: "#fff",
  padding: 14
} satisfies CSSProperties

export const MyChildrenManager = ({ items }: MyChildrenManagerProps) => {
  const router = useRouter()
  const [editingChildId, setEditingChildId] = useState<string | null>(null)
  const [formVersion, setFormVersion] = useState(0)
  const [createState, createFormAction, isCreatePending] = useActionState(
    createChildProfileAction,
    initialActionState
  )
  const [updateState, updateFormAction, isUpdatePending] = useActionState(
    updateChildProfileAction,
    initialActionState
  )

  const editingChild = useMemo(
    () => items.find((item) => item.id === editingChildId) ?? null,
    [editingChildId, items]
  )

  useEffect(() => {
    if (createState.status === "success") {
      setFormVersion((value) => value + 1)
      router.refresh()
    }
  }, [createState.status, router])

  useEffect(() => {
    if (updateState.status === "success") {
      setEditingChildId(null)
      setFormVersion((value) => value + 1)
      router.refresh()
    }
  }, [router, updateState.status])

  const formMode = editingChild ? "update" : "create"
  const activeState = editingChild ? updateState : createState
  const activeFormAction = editingChild ? updateFormAction : createFormAction
  const isPending = editingChild ? isUpdatePending : isCreatePending
  const formKey = editingChild ? `update-${editingChild.id}-${editingChild.updatedAt}` : `create-${formVersion}`

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <section style={cardStyle}>
        <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {editingChild ? "자녀 정보 수정" : "자녀 정보 등록"}
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "#4b5563" }}>
            신청 전에 자녀 정보를 미리 등록해 두면 다음 단계에서 반복 입력을 줄일 수 있어요.
          </p>
        </div>
        <div key={formKey}>
          <ChildProfileForm
            mode={formMode}
            formAction={activeFormAction}
            isPending={isPending}
            state={activeState}
            initialValue={editingChild}
            onCancelEdit={() => setEditingChildId(null)}
          />
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>등록된 자녀</h2>
          <p style={{ margin: 0, fontSize: 14, color: "#4b5563" }}>
            총 {items.length}명의 자녀 정보가 등록되어 있습니다.
          </p>
        </div>

        {items.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
            아직 등록된 자녀가 없습니다. 아래 폼에서 첫 자녀 정보를 등록해 주세요.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((item) => (
              <article
                key={item.id}
                style={{
                  border: editingChildId === item.id ? "1px solid #111827" : "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: "#fff"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <strong style={{ fontSize: 15 }}>{item.name}</strong>
                    <span style={{ fontSize: 13, color: "#4b5563" }}>{item.grade}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingChildId(item.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #d0d5dd",
                      backgroundColor: "#fff",
                      color: "#344054",
                      fontSize: 13
                    }}
                  >
                    수정하기
                  </button>
                </div>

                <div style={{ display: "grid", gap: 4, marginTop: 10, fontSize: 14, color: "#374151" }}>
                  <p style={{ margin: 0 }}>학교: {item.schoolName ?? "-"}</p>
                  <p style={{ margin: 0 }}>현재 수준: {item.currentLevel ?? "-"}</p>
                  <p style={{ margin: 0 }}>관심 과목: {item.interestSubjects ?? "-"}</p>
                  <p style={{ margin: 0 }}>특이사항: {item.notes ?? "-"}</p>
                  <p style={{ margin: 0 }}>목표/고민 메모: {item.goalNote ?? "-"}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
