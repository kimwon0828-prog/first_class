"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import {
  createChildProfileAction,
  type ChildProfileActionState
} from "@/features/children/actions/create-child-profile"
import { updateChildProfileAction } from "@/features/children/actions/update-child-profile"
import { ChildProfileForm } from "@/features/children/ui/child-profile-form"
import type { ChildProfile } from "@/shared/lib/db/adapter"
import styles from "./my-children-manager.module.css"

type MyChildrenManagerProps = {
  items: ChildProfile[]
}

const initialActionState: ChildProfileActionState = {
  status: "idle",
  message: ""
}

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
    <section className={styles.stack}>
      <section className={styles.listCard}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>등록된 자녀</h2>
          <p className={styles.sectionDesc}>총 {items.length}명의 자녀 정보가 등록되어 있어요.</p>
        </header>

        {items.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>아직 등록된 자녀가 없어요.</p>
            <p className={styles.emptyDesc}>아래에서 첫 자녀 정보를 등록해보세요.</p>
          </div>
        ) : (
          <div className={styles.childList}>
            {items.map((item) => {
              const isEditing = editingChildId === item.id
              const infoRows = [
                item.schoolName ? { label: "학교", value: item.schoolName } : null,
                item.currentLevel ? { label: "현재 수준", value: item.currentLevel } : null,
                item.notes ? { label: "메모", value: item.notes } : null,
                item.goalNote ? { label: "목표/고민", value: item.goalNote } : null
              ].filter(Boolean) as Array<{ label: string; value: string }>
              const visibleRows = infoRows.slice(0, 3)

              return (
                <article key={item.id} className={`${styles.childCard} ${isEditing ? styles.childCardActive : ""}`}>
                  <div className={styles.childTop}>
                    <div className={styles.childNameRow}>
                      <div className={styles.childName}>{item.name}</div>
                      <span className={styles.gradeBadge}>{item.grade}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingChildId(item.id)}
                      className={styles.editButton}
                    >
                      수정
                    </button>
                  </div>

                  {visibleRows.length > 0 ? (
                    <div className={styles.kvGrid}>
                      {visibleRows.map((row) => (
                        <div key={row.label} className={styles.kvRow}>
                          <span className={styles.kvLabel}>{row.label}</span>
                          <span className={styles.kvValue}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.childHint}>등록된 추가 정보가 없어요.</p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className={styles.formCard}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{editingChild ? "자녀 정보 수정" : "자녀 등록"}</h2>
          <p className={styles.sectionDesc}>등록해두면 첫수업 신청서 작성이 더 빨라져요.</p>
        </header>
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
    </section>
  )
}
