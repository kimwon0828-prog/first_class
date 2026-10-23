"use client"

import { useActionState, useEffect, useMemo, useState, useTransition } from "react"

import { activateStudioTeacherAction } from "@/features/studio/actions/activate-studio-teacher"
import { deactivateStudioTeacherAction } from "@/features/studio/actions/deactivate-studio-teacher"
import { deleteStudioTeacherAction } from "@/features/studio/actions/delete-studio-teacher"
import {
  upsertStudioTeacherAction,
  type UpsertStudioTeacherActionState
} from "@/features/studio/actions/upsert-studio-teacher"
import type { StudioTeacherAssignmentSummary, StudioTeacherSummary } from "@/shared/lib/db/adapter"
import { V2Avatar } from "./v2/v2-avatar"
import { V2Button } from "./v2/v2-button"
import { V2Dialog } from "./v2/v2-dialog"
import { V2InfoIcon, V2MoreIcon, V2PlusIcon } from "./v2/v2-icons"
import { V2StatusBadge } from "./v2/v2-status-badge"
import { V2TextField } from "./v2/v2-text-field"
import { V2Toggle } from "./v2/v2-toggle"
import styles from "./studio-teachers-manager.module.css"

type StudioTeachersManagerProps = {
  items: StudioTeacherSummary[]
  assignmentsByTeacherId: Record<string, StudioTeacherAssignmentSummary>
}

type PanelState = {
  isOpen: boolean
  teacherId: string | null
}

const initialState: UpsertStudioTeacherActionState = {
  ok: false,
  message: ""
}


/**
 * 설정 · 선생님 (Figma 2148:6939). STUDIO_DESIGN_SYSTEM.md §5.22.
 * 로그인 없는 명부다. 추가 · 수정 · 사용 중지/다시 사용 · 삭제 · 문자 알림은 기존 서버 액션 그대로다.
 */
export const StudioTeachersManager = ({
  items,
  assignmentsByTeacherId
}: StudioTeachersManagerProps) => {
  const [panelState, setPanelState] = useState<PanelState>({ isOpen: false, teacherId: null })
  const [actionFeedback, setActionFeedback] = useState<{ message: string; ok: boolean } | null>(null)
  // 한 번에 하나의 행 메뉴만 열린다.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [isStatusActionPending, startStatusActionTransition] = useTransition()
  const [isDeleteActionPending, startDeleteActionTransition] = useTransition()

  const selectedTeacher = items.find((item) => item.id === panelState.teacherId) ?? null

  useEffect(() => {
    if (!openMenuId) {
      return
    }

    const close = () => setOpenMenuId(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close()
      }
    }

    window.addEventListener("click", close)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [openMenuId])

  const handleDeleteAction = (item: StudioTeacherSummary) => {
    setOpenMenuId(null)
    const confirmed = window.confirm(
      [
        `'${item.displayName}' 선생님을 삭제할까요?`,
        "",
        "한 번도 수업·신청·일정·문자 기록에 쓰이지 않은 선생님만 삭제할 수 있어요.",
        "삭제한 선생님은 되돌릴 수 없어요."
      ].join("\n")
    )

    if (!confirmed) {
      return
    }

    setActionFeedback(null)
    startDeleteActionTransition(async () => {
      const result = await deleteStudioTeacherAction(item.id)
      setActionFeedback({ message: result.message, ok: result.ok })
    })
  }

  const handleStatusAction = (item: StudioTeacherSummary) => {
    setOpenMenuId(null)
    setActionFeedback(null)
    startStatusActionTransition(async () => {
      const result = item.isActive
        ? await deactivateStudioTeacherAction(item.id)
        : await activateStudioTeacherAction(item.id)
      setActionFeedback({ message: result.message, ok: result.ok })
    })
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>선생님 {items.length}명</h2>
          <p className={styles.description}>
            선생님은 따로 로그인하지 않아요. 학원에서 이름과 연락처를 등록해 두면 수업과 신청의 담당으로 지정할 수 있어요.
          </p>
        </div>
        <V2Button icon={<V2PlusIcon size={18} />} onClick={() => setPanelState({ isOpen: true, teacherId: null })}>
          선생님 등록
        </V2Button>
      </header>

      {actionFeedback ? (
        <p className={actionFeedback.ok ? styles.feedback : `${styles.feedback} ${styles.feedbackError}`} role="status">
          {actionFeedback.message}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>아직 등록한 선생님이 없어요</p>
          <p className={styles.emptyDescription}>수업과 신청을 맡을 선생님을 등록해 보세요.</p>
        </div>
      ) : (
        <div className={styles.table} role="table" aria-label="선생님 목록">
          <div className={styles.headRow} role="row">
            <span role="columnheader">선생님</span>
            <span role="columnheader">문자 알림</span>
            <span role="columnheader">담당 수업</span>
            <span role="columnheader">상태</span>
            <span role="columnheader"><span className={styles.srOnly}>관리</span></span>
          </div>
          {items.map((item) => (
            <TeacherRow
              key={item.id}
              item={item}
              assignment={assignmentsByTeacherId[item.id] ?? null}
              menuOpen={openMenuId === item.id}
              onToggleMenu={() => setOpenMenuId((current) => (current === item.id ? null : item.id))}
              onEdit={() => {
                setOpenMenuId(null)
                setPanelState({ isOpen: true, teacherId: item.id })
              }}
              onToggleStatus={() => handleStatusAction(item)}
              onDelete={() => handleDeleteAction(item)}
              statusPending={isStatusActionPending}
              deletePending={isDeleteActionPending}
            />
          ))}
        </div>
      )}

      <div className={styles.note}>
        <V2InfoIcon size={18} className={styles.noteIcon} />
        <p>수업·신청·일정·문자 기록에 쓰인 선생님은 삭제 대신 사용 중지해요. 문자 알림을 켜면 수업 일정과 학원 운영 알림 문자를 받아요.</p>
      </div>

      {panelState.isOpen ? (
        <TeacherFormDialog
          key={selectedTeacher?.id ?? "create"}
          initialItem={selectedTeacher}
          onClose={() => setPanelState({ isOpen: false, teacherId: null })}
          onComplete={(message, ok) => setActionFeedback({ message, ok })}
        />
      ) : null}
    </div>
  )
}

const TeacherRow = ({
  item,
  assignment,
  menuOpen,
  onToggleMenu,
  onEdit,
  onToggleStatus,
  onDelete,
  statusPending,
  deletePending
}: {
  item: StudioTeacherSummary
  assignment: StudioTeacherAssignmentSummary | null
  menuOpen: boolean
  onToggleMenu: () => void
  onEdit: () => void
  onToggleStatus: () => void
  onDelete: () => void
  statusPending: boolean
  deletePending: boolean
}) => {
  // 담당 정보는 legacy teachers.subjects/target_students 가 아니라 실제 수업 배정에서 온다.
  const classTitles = assignment?.classTitles ?? []

  return (
    <div className={styles.row} role="row">
      <span className={styles.cellTeacher} role="cell">
        <V2Avatar name={item.displayName} size={40} tone={item.isActive ? "brand" : "neutral"} />
        <span className={styles.teacherText}>
          <strong>{item.displayName}</strong>
          <small>{item.phone ?? "연락처 없음"}</small>
        </span>
      </span>
      <span className={styles.cellText} role="cell">{item.smsEnabled ? "받음" : "안 받음"}</span>
      <span className={styles.cellClasses} role="cell">
        {classTitles.length ? classTitles.join(", ") : <span className={styles.muted}>담당 수업 없음</span>}
      </span>
      <span role="cell">
        <V2StatusBadge tone={item.isActive ? "green" : "gray"}>{item.isActive ? "사용 중" : "사용 중지"}</V2StatusBadge>
      </span>
      <span className={styles.cellActions} role="cell" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={styles.moreButton}
          aria-label={`${item.displayName} 관리 메뉴`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
        >
          <V2MoreIcon size={18} />
        </button>
        {menuOpen ? (
          <span className={styles.menu} role="menu">
            <button type="button" role="menuitem" onClick={onEdit}>수정</button>
            {/* 상태 배지와 헷갈리지 않도록 행동형으로 적는다. */}
            <button type="button" role="menuitem" onClick={onToggleStatus} disabled={statusPending}>
              {item.isActive ? "사용 중지하기" : "다시 사용하기"}
            </button>
            <button type="button" role="menuitem" className={styles.menuDanger} onClick={onDelete} disabled={deletePending}>
              삭제
            </button>
          </span>
        ) : null}
      </span>
    </div>
  )
}

const TeacherFormDialog = ({
  initialItem,
  onClose,
  onComplete
}: {
  initialItem: StudioTeacherSummary | null
  onClose: () => void
  onComplete: (message: string, ok: boolean) => void
}) => {
  const action = useMemo(() => upsertStudioTeacherAction, [])
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [displayName, setDisplayName] = useState(initialItem?.displayName ?? "")
  const [phone, setPhone] = useState(initialItem?.phone ?? "")
  const isCreateMode = !initialItem

  // 저장은 이름/전화번호/문자 수신 여부만 다룬다. legacy 공개 프로필 컬럼은 payload 에 넣지 않아
  // DB 에 남아 있는 기존 값이 그대로 보존된다.
  // sms_enabled 는 실제 발송 게이트라 여기서 직접 켜고 끈다. 신규 등록 기본값은 DB default 와 같은 OFF.
  const [smsEnabled, setSmsEnabled] = useState(initialItem?.smsEnabled ?? false)

  useEffect(() => {
    if (!state.message) {
      return
    }

    onComplete(state.message, state.ok)
    if (state.ok) {
      onClose()
    }
  }, [onClose, onComplete, state.message, state.ok])

  return (
    <V2Dialog
      title={isCreateMode ? "선생님 등록" : "선생님 수정"}
      description="학부모에게 보이지 않는 학원 내부 명부예요."
      width={480}
      busy={isPending}
      onClose={onClose}
      footerActions={<V2Button type="submit" form="teacher-form" disabled={isPending}>{isPending ? "저장 중…" : isCreateMode ? "등록하기" : "저장하기"}</V2Button>}
    >
      <form id="teacher-form" action={formAction} className={styles.form}>
        <input type="hidden" name="mode" value={isCreateMode ? "create" : "update"} />
        {!isCreateMode ? <input type="hidden" name="teacherId" value={initialItem.id} /> : null}
        {/* 서버 액션은 smsEnabled === "on" 만 켜짐으로 본다. 토글 상태를 그대로 넘긴다. */}
        <input type="hidden" name="smsEnabled" value={smsEnabled ? "on" : ""} />
        <V2TextField
          label="선생님 이름"
          name="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          minLength={2}
          maxLength={30}
          disabled={isPending}
          placeholder="예: 김수업"
        />
        <V2TextField
          label="전화번호 (선택)"
          name="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={isPending}
          placeholder="예: 010-1234-5678"
          helper="학원 내부 운영에만 쓰고 학부모에게 보이지 않아요."
        />
        <div className={styles.switchRow}>
          <span className={styles.switchText}>
            <strong>문자 알림 받기</strong>
            <small>수업 일정과 학원 운영 알림 문자를 받아요.</small>
          </span>
          <V2Toggle aria-label="문자 알림 받기" checked={smsEnabled} disabled={isPending} onChange={(event) => setSmsEnabled(event.target.checked)} />
        </div>
        {state.message && !state.ok ? <p className={`${styles.feedback} ${styles.feedbackError}`} role="alert">{state.message}</p> : null}
      </form>
    </V2Dialog>
  )
}
