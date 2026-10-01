"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { mutateStudioClassLifecycleAction } from "@/features/studio/actions/mutate-studio-class-lifecycle"
import { toggleStudioClassActiveAction } from "@/features/studio/actions/toggle-studio-class-active"
import { StudioClassFormDialog } from "./studio-class-form-dialog"
import styles from "./studio-classes-manager.module.css"

type Item = { id: string; title: string; isActive: boolean; archivedAt?: string | null; canPermanentlyDelete?: boolean }
export function StudioClassLifecycleActions({ item }: { item: Item }) {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState<"archive" | "delete" | null>(null)
  const [message, setMessage] = useState("")
  const [pending, startTransition] = useTransition()
  const run = (action: "archive" | "restore" | "delete" | "toggle") => startTransition(async () => {
    try {
    const result = action === "toggle" ? await toggleStudioClassActiveAction(item.id, !item.isActive) : await mutateStudioClassLifecycleAction(item.id, action)
    setMessage(result.message)
    if (result.status === "success") { setConfirmation(null); router.refresh() }
    } catch { setMessage("요청을 처리하지 못했습니다. 연결 상태를 확인한 후 다시 시도해 주세요.") }
  })
  return <>
    {item.archivedAt
      ? <button type="button" className={styles.rowMenuItem} disabled={pending} onClick={() => run("restore")}>수업 복구</button>
      : <>
        <button type="button" className={styles.rowMenuItem} disabled={pending} onClick={() => run("toggle")}>{item.isActive ? "비공개로 전환" : "공개하기"}</button>
        <button type="button" className={styles.rowMenuItem} disabled={pending} onClick={() => { setMessage(""); setConfirmation("archive") }}>수업 종료</button>
      </>}
    {!item.isActive && (item.canPermanentlyDelete
      ? <button type="button" className={`${styles.rowMenuItem} ${styles.destructive}`} disabled={pending} onClick={() => { setMessage(""); setConfirmation("delete") }}>영구 삭제</button>
      : <p className={styles.deleteExplanation}>수업 삭제 불가<br />이 수업에는 신청 또는 운영 기록이 있어 삭제할 수 없습니다. 수업 종료를 이용해 주세요.</p>)}
    {pending && <p role="status" className={styles.deleteExplanation}>처리 중...</p>}
    {message && !confirmation && <p role="status" className={styles.deleteExplanation}>{message}</p>}
    {confirmation && <StudioClassFormDialog title={confirmation === "archive" ? "수업을 종료할까요?" : "이 수업을 영구 삭제할까요?"} onClose={() => setConfirmation(null)} busy={pending}>
      <p><strong>{item.title}</strong></p>
      {confirmation === "archive" ? <><p>종료하면 학부모에게 더 이상 노출되지 않고 새로운 체험 신청을 받을 수 없습니다.</p><p>기존 신청·체험 기록·리포트·일정 기록은 그대로 보관됩니다.</p></> : <><p>아직 운영 기록이 없는 수업입니다.</p><p>삭제 후에는 복구할 수 없습니다.</p></>}
      {message && <p role="alert">{message}</p>}
      <div className={styles.confirmActions}>
        <button type="button" className={styles.pill} disabled={pending} onClick={() => setConfirmation(null)}>취소</button>
        <button type="button" className={confirmation === "delete" ? styles.destructiveButton : styles.primaryButton} disabled={pending} onClick={() => run(confirmation)}>{pending ? "처리 중..." : confirmation === "archive" ? "수업 종료" : "영구 삭제"}</button>
      </div>
    </StudioClassFormDialog>}
  </>
}
