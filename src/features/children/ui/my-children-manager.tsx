"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createChildProfileAction, type ChildProfileActionState } from "@/features/children/actions/create-child-profile"
import { updateChildProfileAction } from "@/features/children/actions/update-child-profile"
import { ChildProfileForm } from "./child-profile-form"
import { getChildGradeLabel, normalizeLearnerGrade } from "@/shared/constants/education-taxonomy"
import type { ChildProfile } from "@/shared/lib/db/adapter"
import styles from "./my-children-manager.module.css"

type Props = { items: ChildProfile[]; onSaved?: () => void | Promise<void> }
const initialActionState: ChildProfileActionState = { status: "idle", message: "" }

function Avatar() {
  return <span className={styles.avatar} aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span>
}

// Each opened form owns fresh action state, so switching children never carries an old error.
function Editor({ child, onCancel, onSaved, onPendingChange }: { child?: ChildProfile; onCancel: () => void; onSaved: () => void; onPendingChange?: (pending: boolean) => void }) {
  const [state, action, pending] = useActionState(child ? updateChildProfileAction : createChildProfileAction, initialActionState)
  useEffect(() => { onPendingChange?.(pending) }, [pending, onPendingChange])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const savedRef = useRef(onSaved)
  savedRef.current = onSaved
  useEffect(() => {
    const heading = headingRef.current
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }, [])
  useEffect(() => {
    if (state.status === "success") savedRef.current()
  }, [state])
  return <div className={styles.formPanel}>
    <h3 ref={headingRef} tabIndex={-1} className={styles.formTitle}>{child ? "자녀 정보 수정" : "새로운 자녀를 등록해요"}</h3>
    <ChildProfileForm mode={child ? "update" : "create"} initialValue={child} formAction={action} state={state} isPending={pending} onCancelEdit={onCancel} />
  </div>
}

export const MyChildrenManager = ({ items, onSaved }: Props) => {
  const router = useRouter()
  const [editor, setEditor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const openerIdRef = useRef<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const close = () => setEditor(null)
  useEffect(() => {
    if (editor !== null || openerIdRef.current === null) return
    const button = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-editor-trigger]") ?? []).find(node => node.dataset.editorTrigger === openerIdRef.current)
    button?.focus({ preventScroll: true })
    openerIdRef.current = null
  }, [editor])
  const saved = () => {
    setAnnouncement(editor === "create" ? "자녀 정보를 등록했어요." : "자녀 정보를 수정했어요.")
    close()
    if (onSaved) void onSaved()
    else router.refresh()
  }
  const open = (id: string) => { openerIdRef.current = id; setAnnouncement(""); setEditor(id) }
  return <section ref={rootRef} className={styles.stack}>
    <p className={styles.announcement} role="status">{announcement}</p>
    {editor !== "create" && items.length > 0 ? <div className={styles.noticeCard}><Avatar /><p>자녀 정보를 확인하고 언제든 수정할 수 있어요.</p></div> : null}
    {items.length > 0 ? <section className={styles.listSection} aria-labelledby="children-list-title">
      <h2 id="children-list-title" className={styles.sectionTitle}>등록된 자녀 {items.length}명</h2>
      <div className={styles.childList}>{items.map(item => {
        const isEditing = editor === item.id
        const grade = normalizeLearnerGrade(item.grade)
        return <article key={item.id} className={`${styles.childCard} ${isEditing ? styles.childCardActive : ""}`}>
          <div className={styles.childTop}>
            <Avatar />
            <div className={styles.childBody}>
              <h3 className={styles.childName}>{item.name}</h3>
              <p className={styles.childMeta}>{grade ? getChildGradeLabel(grade) : "학년 확인 필요"}</p>
              {item.schoolName ? <p className={styles.childMeta}>{item.schoolName}</p> : null}
            </div>
            <button type="button" className={styles.editButton} aria-label={`${item.name} 정보 ${isEditing ? "닫기" : "수정"}`} aria-expanded={isEditing} aria-controls={isEditing ? `child-editor-${item.id}` : undefined} disabled={isEditing ? saving : editor !== null} data-editor-trigger={item.id} onClick={() => isEditing ? close() : open(item.id)}>{isEditing ? "닫기" : "수정"}</button>
          </div>
          {isEditing ? <div id={`child-editor-${item.id}`}><Editor child={item} onCancel={close} onSaved={saved} onPendingChange={setSaving} /></div> : null}
        </article>
      })}</div>
    </section> : editor !== "create" ? <div className={styles.empty}>
      <Avatar />
      <h2 className={styles.emptyTitle}>등록된 자녀가 없어요.</h2>
      <p className={styles.emptyDesc}>자녀를 등록하면 체험수업 신청 시<br />정보를 편하게 불러올 수 있어요.</p>
      <button type="button" className={styles.primaryButton} data-editor-trigger="create" onClick={() => open("create")}>+ 자녀 추가하기</button>
    </div> : null}
    {editor === "create" ? <Editor onCancel={close} onSaved={saved} /> : items.length > 0 && !editor ? <button type="button" className={styles.addButton} data-editor-trigger="create" onClick={() => open("create")}>+ 자녀 추가하기</button> : null}
  </section>
}
