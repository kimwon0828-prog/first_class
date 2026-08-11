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
  onSaved?: () => void | Promise<void>
}

const initialActionState: ChildProfileActionState = {
  status: "idle",
  message: ""
}

export const MyChildrenManager = ({ items, onSaved }: MyChildrenManagerProps) => {
  const router = useRouter()
  const [editingChildId, setEditingChildId] = useState<string | null>(null)
  const [formVersion, setFormVersion] = useState(0)
  const [isFormExpanded, setIsFormExpanded] = useState(items.length === 0)
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
      setIsFormExpanded(false)
      if (onSaved) {
        void onSaved()
      } else {
        router.refresh()
      }
    }
  }, [createState.status, onSaved, router])

  useEffect(() => {
    if (updateState.status === "success") {
      setEditingChildId(null)
      setFormVersion((value) => value + 1)
      setIsFormExpanded(false)
      if (onSaved) {
        void onSaved()
      } else {
        router.refresh()
      }
    }
  }, [onSaved, router, updateState.status])

  useEffect(() => {
    if (items.length === 0) {
      setIsFormExpanded(true)
    }
  }, [items.length])

  useEffect(() => {
    if (editingChildId) {
      setIsFormExpanded(true)
    }
  }, [editingChildId])

  const formMode = editingChild ? "update" : "create"
  const activeState = editingChild ? updateState : createState
  const activeFormAction = editingChild ? updateFormAction : createFormAction
  const isPending = editingChild ? isUpdatePending : isCreatePending
  const formKey = editingChild ? `update-${editingChild.id}-${editingChild.updatedAt}` : `create-${formVersion}`

  return (
    <section className={styles.stack}>
      {items.length === 0 ? (
        <section className={styles.noticeCard}>
          <p className={styles.noticeText}>
            자녀 정보를 미리 등록해두면 신청서 작성 시 아이 이름과 학년을 자동으로 불러올 수 있어요.
          </p>
        </section>
      ) : null}

      <section className={styles.listSection}>
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
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className={styles.formSection}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{editingChild ? "자녀 정보 수정" : "자녀 등록"}</h2>
        </header>

        {!editingChild && items.length > 0 && !isFormExpanded ? (
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setIsFormExpanded(true)}
          >
            + 자녀 등록
          </button>
        ) : null}

        {isFormExpanded ? (
          <div key={formKey} className={styles.formPanel}>
            <ChildProfileForm
              mode={formMode}
              formAction={activeFormAction}
              isPending={isPending}
              state={activeState}
              initialValue={editingChild}
              onCancelEdit={() => {
                setEditingChildId(null)
                if (items.length > 0) {
                  setIsFormExpanded(false)
                }
              }}
            />
          </div>
        ) : null}
      </section>
    </section>
  )
}
