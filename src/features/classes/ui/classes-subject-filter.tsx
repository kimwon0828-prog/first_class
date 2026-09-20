"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BottomSheet } from "@/shared/ui/bottom-sheet"
import styles from "./classes-subject-filter.module.css"

type Props = {
  categoryCode: string
  categoryName: string
  subjects: { code: string; name: string }[]
  selectedSubject: string | null
}

/** Only the existing subject query is edited. Other discovery context survives. */
export function ClassesSubjectFilter({ categoryCode, categoryName, subjects, selectedSubject }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(selectedSubject ?? "")
  const [pending, startTransition] = useTransition()

  return <>
    <button type="button" className={`${styles.trigger} ${selectedSubject ? styles.selected : ""}`}
      aria-haspopup="dialog" aria-expanded={open} aria-busy={pending}
      onClick={() => { setDraft(selectedSubject ?? ""); setOpen(true) }}>
      세부 과목
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <BottomSheet open={open} onClose={() => setOpen(false)} title={`${categoryName} 세부 과목`} manageFocus>
      <form className={styles.form} onSubmit={(event) => {
        event.preventDefault()
        const params = new URLSearchParams(searchParams.toString())
        params.delete("region")
        params.set("subjectCategory", categoryCode)
        if (draft) params.set("subject", draft)
        else params.delete("subject")
        setOpen(false)
        startTransition(() => router.replace(`/classes?${params.toString()}`))
      }}>
        <fieldset className={styles.options}>
          <legend className={styles.legend}>과목을 선택해주세요</legend>
          {[{ code: "", name: "전체 세부 과목" }, ...subjects].map((subject) => <label key={subject.code} className={styles.option}>
            <input type="radio" name="subject" value={subject.code} checked={draft === subject.code} onChange={() => setDraft(subject.code)} />
            <span>{subject.name}</span>
          </label>)}
        </fieldset>
        <div className={styles.actions}>
          <button type="button" className={styles.reset} onClick={() => setDraft("")}>초기화</button>
          <button type="submit" className={styles.apply}>결과 보기</button>
        </div>
      </form>
    </BottomSheet>
  </>
}
