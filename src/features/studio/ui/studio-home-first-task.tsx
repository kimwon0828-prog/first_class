"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  updateApplicationStatusAction,
  type UpdateApplicationStatusActionState
} from "@/features/studio/actions/update-application-status"
import { StudioDetailLink } from "./studio-detail-link"
import { v2ButtonClassName } from "./v2/v2-button"
import { V2CheckIcon, V2ChevronLeftIcon, V2ChevronRightIcon } from "./v2/v2-icons"
import { V2SubjectIcon3D } from "./v2/v2-subject-icon-3d"
import styles from "./studio-home-first-task.module.css"

/** 홈 "가장 먼저" 카드 한 장. 문장 · 이동 위치는 서버가 기존 판정으로 정해 넘긴다. */
export type StudioHomeFirstTaskItem = {
  id: string
  href: string
  title: string
  meta: string
  subjectCategory: string | null
  /** confirm: 학부모 희망 시간 그대로 확정(상세 일정 확정과 같은 서버 액션). link: 상세의 해당 칸으로 이동만. */
  primary: { type: "confirm" } | { type: "link"; label: string; section: string | null }
  /** 일정 확정 단계의 [다른 시간 보기] — 상세 #confirm-schedule. */
  secondary: { label: string; section: string } | null
  hint: string | null
}

const initialState: UpdateApplicationStatusActionState = { status: "idle", message: "", completedPromptToken: null }

/* 상세 일정 확정 카드의 [이 일정으로 확정]과 같은 액션 · 같은 값(actionType=move_to_confirmed).
   담당 선생님 값은 보내지 않는다 — 서버 액션이 현재 담당을 그대로 둔다. */
function ConfirmButton({ applicationId }: { applicationId: string }) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(updateApplicationStatusAction.bind(null, applicationId), initialState)
  useEffect(() => {
    if (state.status === "success") router.refresh()
  }, [router, state.status])
  return <form action={formAction} className={styles.confirmForm}>
    <button type="submit" name="actionType" value="move_to_confirmed" disabled={isPending} className={v2ButtonClassName({ variant: "primary", size: "lg" })}>
      <V2CheckIcon size={18} />{isPending ? "확정 중…" : "이 시간으로 확정"}
    </button>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? styles.messageError : styles.message}>{state.message}</p> : null}
  </form>
}

/**
 * 홈 "가장 먼저" 카드 (Figma 2148:4978). 오늘 할 일 미리보기(최대 5건)를 한 장씩 넘긴다(화면 상태만).
 * 상태를 바꾸는 버튼은 일정 확정 하나뿐이고, 상세의 일정 확정과 같은 서버 액션을 쓴다.
 */
export function StudioHomeFirstTask({ items, totalCount }: { items: StudioHomeFirstTaskItem[]; totalCount: number }) {
  const [index, setIndex] = useState(0)
  const current = items[Math.min(index, items.length - 1)]

  if (!current) {
    return <section className={styles.card} aria-labelledby="first-task-title">
      <div className={styles.head}><span className={styles.badge}>가장 먼저</span><span className={styles.caption}>오늘 할 일이 없어요</span></div>
      <div className={styles.body}>
        <div className={styles.text}>
          <h2 id="first-task-title" className={styles.title}>지금 처리할 일이 없어요</h2>
          <p className={styles.meta}>새 신청이 들어오거나 체험이 끝나면 여기에서 먼저 알려 드릴게요.</p>
        </div>
      </div>
    </section>
  }

  const position = Math.min(index, items.length - 1)
  return <section className={styles.card} aria-labelledby="first-task-title" aria-roledescription="할 일 넘기기">
    <div className={styles.head}>
      <span className={styles.badge}>가장 먼저</span>
      <span className={styles.caption}>오늘 할 일 {totalCount}개 중 {position + 1}번째</span>
      <span className={styles.spacer} />
      {items.length > 1 ? <button type="button" className={styles.arrow} aria-label="이전 할 일" disabled={position === 0} onClick={() => setIndex(position - 1)}><V2ChevronLeftIcon size={16} /></button> : null}
      <span className={styles.dots} aria-hidden="true">
        {items.map((item, dot) => <span key={item.id} data-current={dot === position ? "" : undefined} />)}
      </span>
      {items.length > 1 ? <button type="button" className={styles.arrow} aria-label="다음 할 일" disabled={position === items.length - 1} onClick={() => setIndex(position + 1)}><V2ChevronRightIcon size={16} /></button> : null}
    </div>
    <div className={styles.body}>
      <span className={styles.subject}><V2SubjectIcon3D categoryCode={current.subjectCategory} size={48} /></span>
      <div className={styles.text}>
        <h2 id="first-task-title" className={styles.title}>{current.title}</h2>
        <p className={styles.meta}>{current.meta}</p>
      </div>
    </div>
    <div className={styles.actions}>
      {current.primary.type === "confirm"
        ? <ConfirmButton key={current.id} applicationId={current.id} />
        : <StudioDetailLink internalPath={current.href} section={current.primary.section} className={v2ButtonClassName({ variant: "primary", size: "lg" })}>{current.primary.label}</StudioDetailLink>}
      {current.secondary ? <StudioDetailLink internalPath={current.href} section={current.secondary.section} className={v2ButtonClassName({ variant: "outline", size: "lg" })}>{current.secondary.label}</StudioDetailLink> : null}
      <span className={styles.spacer} />
      {current.hint ? <span className={styles.hint}>{current.hint}</span> : null}
    </div>
  </section>
}
