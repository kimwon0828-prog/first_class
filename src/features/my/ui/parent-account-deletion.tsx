"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { unstable_rethrow } from "next/navigation"
import { deleteMyParentAccountAction } from "../actions/delete-parent-account"
import { clearParentFavoriteData } from "@/features/favorites/lib/storage"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import type { ParentDeletionResult } from "../lib/parent-account-deletion-workflow"
import styles from "./parent-account-deletion.module.css"

const initial: ParentDeletionResult = { status: "idle", message: "" }
async function submit(previous: ParentDeletionResult, form: FormData): Promise<ParentDeletionResult> {
  try { return await deleteMyParentAccountAction(previous, form) }
  catch (error) { unstable_rethrow(error); return { status: "error", message: "회원탈퇴를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." } }
}
export function ParentAccountDeletion({ onCancel, onBusyChange, recovery = false }: {
  onCancel?: () => void
  onBusyChange?: (busy: boolean) => void
  recovery?: boolean
}) {
  const [confirmed, setConfirmed] = useState(recovery)
  const [state, action, pending] = useActionState(submit, initial)
  const heading = useRef<HTMLHeadingElement>(null)
  const completing = useRef(false)
  const [appleBusy, setAppleBusy] = useState(false)
  const [appleError, setAppleError] = useState("")
  useEffect(() => {
    const restore = () => setAppleBusy(false)
    window.addEventListener("pageshow", restore)
    return () => window.removeEventListener("pageshow", restore)
  }, [])
  const cancel = onCancel ?? (() => window.location.assign("/my"))
  async function verifyApple() {
    if (appleBusy) return
    setAppleBusy(true); setAppleError("")
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({ provider: "apple", options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/my?delete=1")}` } })
      if (error) throw error
    } catch { setAppleError("Apple 본인 확인을 시작하지 못했어요. 다시 시도해 주세요."); setAppleBusy(false) }
  }
  useEffect(() => { onBusyChange?.(pending); return () => onBusyChange?.(false) }, [pending, onBusyChange])
  useEffect(() => { if (confirmed) heading.current?.focus() }, [confirmed])
  useEffect(() => {
    if (state.status !== "success" || completing.current) return
    completing.current = true
    let localCleanupFailed = false
    try { clearParentFavoriteData() } catch { localCleanupFailed = true }
    void getSupabaseBrowserClient().auth.signOut({ scope: "local" }).catch(() => {}).finally(() => {
      window.location.replace(`/account-deleted${localCleanupFailed ? "?local=blocked" : ""}`)
    })
  }, [state.status])

  return <div className={styles.content}>
    {confirmed ? <>
      <h3 ref={heading} tabIndex={-1} className={styles.title}>{recovery || state.cleanupStarted ? "회원탈퇴를 마무리해 주세요" : "정말 탈퇴하시겠어요?"}</h3>
      <p>탈퇴 후 첫수업 계정은 복구할 수 없습니다.</p>
      {recovery || state.cleanupStarted ? <p>개인 데이터 정리는 진행됐지만 계정 삭제를 완료하지 못했습니다. 다시 시도하면 남은 절차를 이어서 처리합니다.</p> : null}
      <form action={action} aria-busy={pending}>
        <input type="hidden" name="confirmation" value="delete" />
        {state.status === "error" ? <p className={styles.error} role="alert">{state.message}</p> : null}
        {appleError ? <p className={styles.error} role="alert">{appleError}</p> : null}
        <div className={styles.actions}>
          <button type="button" disabled={pending || appleBusy} onClick={cancel} className={styles.cancel}>취소</button>
          {state.appleReauthRequired ? <button type="button" disabled={appleBusy} onClick={() => void verifyApple()} className={styles.continue}>{appleBusy ? "Apple 연결 중…" : "Apple로 본인 확인"}</button> : <button type="submit" disabled={pending || state.status === "success"} className={styles.destructive}>{pending ? "처리 중…" : recovery || state.cleanupStarted ? "탈퇴 다시 시도" : "회원탈퇴"}</button>}
        </div>
      </form>
    </> : <>
      <p>첫수업 계정과 첫수업에서 관리하는 개인 정보가 삭제됩니다.</p>
      <p>첫수업에 저장된 이름·연락처, 상담 내용, 리포트와 사진도 삭제합니다. 예약·체험·등록 상태 등 최소 운영 기록은 체험 종료(취소·불참은 해당 처리 시점) 후 최대 12개월까지만 유지하고, 이후 개별 기록을 삭제합니다. 법령상 보관이나 분쟁 처리가 필요한 자료는 별도로 안내합니다. 진행 중인 예약은 자동 취소되지 않습니다.</p>
      <p>탈퇴 후에는 기존 첫수업 계정으로 서비스를 이용할 수 없습니다.</p>
      <div className={styles.actions}>
        <button type="button" onClick={cancel} className={styles.cancel}>취소</button>
        <button type="button" onClick={() => setConfirmed(true)} className={styles.continue}>회원탈퇴 계속</button>
      </div>
    </>}
  </div>
}
