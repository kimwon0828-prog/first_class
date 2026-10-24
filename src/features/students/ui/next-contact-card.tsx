"use client"

import { useActionState, useEffect, useState, type ReactNode } from "react"

import { setStudentNextContactAction, type SetNextContactState } from "@/features/students/actions/set-next-contact"
import { NEXT_CONTACT_NOTE_MAX } from "@/features/students/lib/student-grouping"
import { v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { V2TextField } from "@/features/studio/ui/v2/v2-text-field"

import styles from "./student-detail.module.css"

const initialState: SetNextContactState = { status: "idle", message: "" }

type NextContactCardProps = {
  applicationId: string
  nextContact: { dateKey: string; dateLabel: string; note: string } | null
  todayKey: string
  /** 카드 안 주 버튼 [안내 보내기](§5.28). 보내기 패널을 여는 쪽이 넘긴다. */
  sendButton?: ReactNode
}

/**
 * 학생 상세 "다음 연락"(Figma 2148:6014). 메모 + 날짜를 정해 두면 그날 홈 "오늘 할 일"에 뜬다.
 * 학원에 문자를 보내지 않는다.
 */
export function NextContactCard({ applicationId, nextContact, todayKey, sendButton }: NextContactCardProps) {
  const [editing, setEditing] = useState(false)
  const [state, formAction, pending] = useActionState(setStudentNextContactAction.bind(null, applicationId), initialState)

  useEffect(() => {
    if (state.status === "success") setEditing(false)
  }, [state])

  return (
    <section className={styles.nextCard} aria-labelledby="next-contact-title">
      <p id="next-contact-title" className={styles.nextLabel}>다음 연락</p>
      {editing ? (
        <form action={formAction} className={styles.nextForm}>
          <label className={styles.dateField}>
            <span className={styles.dateFieldLabel}>연락할 날</span>
            <input type="date" name="date" min={todayKey} defaultValue={nextContact?.dateKey ?? todayKey} required />
          </label>
          <V2TextField
            label="메모"
            name="note"
            maxLength={NEXT_CONTACT_NOTE_MAX}
            defaultValue={nextContact?.note ?? ""}
            placeholder="예) 토요일 반이 생기면 안내하기"
            helper={`그날 홈 오늘 할 일에 떠요. ${NEXT_CONTACT_NOTE_MAX}자까지.`}
            required
          />
          <div className={styles.nextActions}>
            <button type="submit" name="intent" value="save" disabled={pending} className={v2ButtonClassName({ variant: "tonal", size: "sm" })}>
              {pending ? "저장 중…" : "저장"}
            </button>
            <button type="button" disabled={pending} onClick={() => setEditing(false)} className={v2ButtonClassName({ variant: "ghost", size: "sm" })}>
              취소
            </button>
          </div>
        </form>
      ) : nextContact ? (
        <>
          <p className={styles.nextTitle}>{nextContact.note}</p>
          <p className={styles.nextMeta}>{nextContact.dateLabel} 알림</p>
          {sendButton}
          <form action={formAction} className={styles.nextActions}>
            <button type="button" onClick={() => setEditing(true)} className={v2ButtonClassName({ variant: "ghost", size: "sm" })}>고치기</button>
            <button type="submit" name="intent" value="clear" disabled={pending} className={v2ButtonClassName({ variant: "ghost", size: "sm" })}>
              {pending ? "지우는 중…" : "지우기"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className={styles.nextMeta}>다음에 연락할 날을 정해 두면 그날 홈 오늘 할 일에 떠요.</p>
          {sendButton}
          <div className={styles.nextActions}>
            <button type="button" onClick={() => setEditing(true)} className={v2ButtonClassName({ variant: "outline", size: "sm" })}>다음 연락 정하기</button>
          </div>
        </>
      )}
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? styles.formError : styles.formMessage}>
          {state.message}
        </p>
      ) : null}
    </section>
  )
}
