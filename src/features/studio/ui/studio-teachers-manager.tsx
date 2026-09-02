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

const getInitials = (value: string) => value.trim().slice(0, 2) || "선생"

export const StudioTeachersManager = ({
  items,
  assignmentsByTeacherId
}: StudioTeachersManagerProps) => {
  const [panelState, setPanelState] = useState<PanelState>({ isOpen: false, teacherId: null })
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  // 한 번에 하나의 행 메뉴만 열린다.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [isStatusActionPending, startStatusActionTransition] = useTransition()
  const [isDeleteActionPending, startDeleteActionTransition] = useTransition()

  const selectedTeacher = items.find((item) => item.id === panelState.teacherId) ?? null
  const shouldShowSearch = items.length >= 3
  const totalCount = items.length
  const activeCount = items.filter((item) => item.isActive).length
  const inactiveCount = totalCount - activeCount

  const filteredItems = useMemo(() => {
    if (!shouldShowSearch) {
      return items
    }

    const needle = query.trim().toLowerCase()

    return items.filter((item) => {
      if (statusFilter === "active" && !item.isActive) {
        return false
      }

      if (statusFilter === "inactive" && item.isActive) {
        return false
      }

      if (!needle) {
        return true
      }

      // 검색 대상은 목록에 실제로 보이는 정보와 같아야 한다.
      // legacy teachers.subjects / target_students 는 담당 정보의 source 가 아니므로 쓰지 않는다.
      const assignment = assignmentsByTeacherId[item.id]

      return [
        item.displayName,
        item.phone,
        ...(assignment?.classTitles ?? []),
        ...(assignment?.subjectLabels ?? [])
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [assignmentsByTeacherId, items, query, shouldShowSearch, statusFilter])

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

  const openCreatePanel = () => {
    setPanelState({ isOpen: true, teacherId: null })
  }

  const openEditPanel = (teacherId: string) => {
    setPanelState({ isOpen: true, teacherId })
  }

  const closePanel = () => {
    setPanelState({ isOpen: false, teacherId: null })
  }

  const handleDeleteAction = (item: StudioTeacherSummary) => {
    const confirmed = window.confirm(
      [
        `'${item.displayName}' 선생님을 삭제할까요?`,
        "",
        "한 번도 수업·신청·일정·문자 기록에 사용되지 않은 선생님만 삭제할 수 있습니다.",
        "삭제한 선생님은 복구할 수 없습니다."
      ].join("\n")
    )

    if (!confirmed) {
      return
    }

    setActionFeedback(null)
    startDeleteActionTransition(async () => {
      const result = await deleteStudioTeacherAction(item.id)
      setActionFeedback(result.message)
    })
  }

  const handleStatusAction = (item: StudioTeacherSummary) => {
    setActionFeedback(null)
    startStatusActionTransition(async () => {
      const result = item.isActive
        ? await deactivateStudioTeacherAction(item.id)
        : await activateStudioTeacherAction(item.id)
      setActionFeedback(result.message)
    })
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>선생님 관리</h1>
          <p className={styles.description}>
            학원 내부 선생님 명부예요. 수업 배정과 알림 발송에 사용됩니다.
          </p>
        </div>
        <div className={styles.headerRight}>
          <button type="button" onClick={openCreatePanel} className={styles.primaryButton}>
            선생님 등록
          </button>
        </div>
      </header>

      {actionFeedback ? (
        <p
          className={`${styles.feedback} ${
            actionFeedback.includes("실패") || actionFeedback.includes("없습니다")
              ? styles.feedbackError
              : styles.feedbackSuccess
          }`}
          role="status"
        >
          {actionFeedback}
        </p>
      ) : null}

      {shouldShowSearch ? (
        <section className={styles.toolbar} aria-label="필터 및 검색">
          <div className={styles.searchWrap}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="선생님 이름 / 담당 수업 검색"
              className={styles.search}
              aria-label="선생님 검색"
            />
          </div>
          <div className={styles.pills} role="tablist" aria-label="선생님 상태">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`${styles.pill} ${statusFilter === "all" ? styles.pillActive : ""}`}
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`${styles.pill} ${statusFilter === "active" ? styles.pillActive : ""}`}
            >
              활성
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`${styles.pill} ${statusFilter === "inactive" ? styles.pillActive : ""}`}
            >
              비활성
            </button>
          </div>
        </section>
      ) : null}

      <section className={styles.workspace} aria-label="선생님 목록">
        <p className={styles.resultMeta}>
          전체 {totalCount}명 · 활성 {activeCount}명 · 비활성 {inactiveCount}명
          {filteredItems.length !== totalCount ? ` · 조건에 맞는 선생님 ${filteredItems.length}명` : ""}
        </p>

        {items.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>등록된 선생님이 없습니다.</p>
            <p className={styles.emptyDescription}>수업을 담당할 선생님을 등록해 보세요.</p>
            <button type="button" onClick={openCreatePanel} className={styles.primaryButton}>
              선생님 등록
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>조건에 맞는 선생님이 없어요.</p>
            <p className={styles.emptyDescription}>다른 검색어로 다시 확인해 주세요.</p>
          </div>
        ) : (
          <>
            <div className={styles.listHead} aria-hidden="true">
              <span>선생님</span>
              <span>담당 수업</span>
              <span>과목</span>
              <span>상태</span>
              <span />
            </div>

            <ul className={styles.list}>
              {filteredItems.map((item) => (
                <TeacherRow
                  key={item.id}
                  item={item}
                  assignment={assignmentsByTeacherId[item.id] ?? null}
                  menuOpen={openMenuId === item.id}
                  onToggleMenu={() =>
                    setOpenMenuId((current) => (current === item.id ? null : item.id))
                  }
                  onEdit={() => openEditPanel(item.id)}
                  onToggleStatus={() => handleStatusAction(item)}
                  onDelete={() => handleDeleteAction(item)}
                  statusPending={isStatusActionPending}
                  deletePending={isDeleteActionPending}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {panelState.isOpen ? (
        <TeacherFormDrawer
          key={selectedTeacher?.id ?? "create"}
          initialItem={selectedTeacher}
          onClose={closePanel}
          onComplete={(message) => setActionFeedback(message)}
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
  const classCount = assignment?.classCount ?? 0
  const firstClassTitle = assignment?.classTitles?.[0] ?? null
  const subjectLine = (assignment?.subjectLabels ?? []).join(" · ")

  return (
    <li className={styles.row}>
      <div className={styles.cellTeacher}>
        <span className={styles.avatar} aria-hidden="true">
          {getInitials(item.displayName)}
        </span>
        <span className={styles.teacherName}>{item.displayName}</span>
      </div>

      <div className={styles.cellText}>
        {classCount > 0 ? (
          <>
            {`${classCount}개`}
            {firstClassTitle ? (
              <span className={styles.cellSub}>
                {classCount > 1 ? `${firstClassTitle} 외 ${classCount - 1}개` : firstClassTitle}
              </span>
            ) : null}
          </>
        ) : (
          <span className={styles.cellMuted}>담당 수업 없음</span>
        )}
      </div>

      <div className={styles.cellText}>
        {subjectLine ? subjectLine : <span className={styles.cellMuted}>—</span>}
      </div>

      <div className={styles.cellStatus}>
        <span
          className={`${styles.badge} ${item.isActive ? styles.badgeActive : styles.badgeInactive}`}
        >
          {item.isActive ? "활성" : "비활성"}
        </span>
      </div>

      <div className={styles.cellActions}>
        <button type="button" onClick={onEdit} className={styles.rowActionStrong}>
          수정
        </button>
        <div className={styles.rowMenu} onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={`${styles.rowMenuButton} ${menuOpen ? styles.rowMenuButtonOpen : ""}`}
            aria-label={`${item.displayName} 관리 메뉴`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className={styles.rowMenuList} role="menu">
              {/* 상태 배지("활성"/"비활성")와 헷갈리지 않도록 행동형으로 적는다. */}
              <button
                type="button"
                role="menuitem"
                className={styles.rowMenuItem}
                onClick={onToggleStatus}
                disabled={statusPending}
              >
                {item.isActive ? "비활성화하기" : "활성화하기"}
              </button>
              <button
                type="button"
                role="menuitem"
                className={`${styles.rowMenuItem} ${styles.rowMenuItemDanger}`}
                onClick={onDelete}
                disabled={deletePending}
              >
                삭제
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

const TeacherFormDrawer = ({
  initialItem,
  onClose,
  onComplete
}: {
  initialItem: StudioTeacherSummary | null
  onClose: () => void
  onComplete: (message: string) => void
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

    onComplete(state.message)
    if (state.ok) {
      onClose()
    }
  }, [onClose, onComplete, state.message, state.ok])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div className={styles.drawerRoot}>
      <button type="button" className={styles.drawerOverlay} aria-label="닫기" onClick={onClose} />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={isCreateMode ? "선생님 등록" : "선생님 수정"}
      >
        <form action={formAction} className={styles.drawerForm}>
          <input type="hidden" name="mode" value={isCreateMode ? "create" : "update"} />
          {!isCreateMode ? <input type="hidden" name="teacherId" value={initialItem.id} /> : null}
          {/* 토글이 button 이라 값을 스스로 제출하지 못한다. boolean 을 안정적으로 넘기기 위한 hidden 이다. */}
          <input type="hidden" name="smsEnabled" value={smsEnabled ? "on" : ""} />

          <header className={styles.drawerHeader}>
            <h2 className={styles.drawerTitle}>{isCreateMode ? "선생님 등록" : "선생님 수정"}</h2>
            <button
              type="button"
              onClick={onClose}
              className={styles.drawerCloseButton}
              aria-label="닫기"
            >
              ✕
            </button>
          </header>

          <div className={styles.drawerBody}>
            <label className={styles.field}>
              <span className={styles.label}>선생님 이름</span>
              <input
                name="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                minLength={2}
                maxLength={30}
                disabled={isPending}
                className={styles.input}
                placeholder="예: 김수업 선생님"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>
                전화번호
                <span className={styles.optionalText}>(선택)</span>
              </span>
              <input
                name="phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={isPending}
                className={styles.input}
                placeholder="예: 010-1234-5678"
              />
              <span className={styles.fieldHint}>
                전화번호는 학원 내부 운영용으로만 사용되며 학부모에게 공개되지 않아요.
              </span>
            </label>

            <div className={styles.switchField}>
              <div className={styles.switchCopy}>
                <strong className={styles.label}>문자 알림 수신</strong>
                <span className={styles.fieldHint}>
                  수업 일정 및 학원 운영 관련 알림 문자를 받을 수 있어요.
                </span>
              </div>
              <SmsSwitch
                checked={smsEnabled}
                onToggle={() => setSmsEnabled((current) => !current)}
                disabled={isPending}
              />
            </div>

            {state.message ? (
              <p
                className={`${styles.formMessage} ${
                  state.ok ? styles.formMessageSuccess : styles.formMessageError
                }`}
                role="status"
              >
                {state.message}
              </p>
            ) : null}
          </div>

          <div className={styles.drawerFooter}>
            <button
              type="button"
              onClick={onClose}
              className={styles.secondaryButton}
              disabled={isPending}
            >
              취소
            </button>
            <button type="submit" className={styles.primaryButton} disabled={isPending}>
              {isPending ? "저장 중..." : isCreateMode ? "등록하기" : "저장하기"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}

const SmsSwitch = ({
  checked,
  onToggle,
  disabled
}: {
  checked: boolean
  onToggle: () => void
  disabled: boolean
}) => (
  <button
    type="button"
    aria-pressed={checked}
    aria-label="문자 알림 수신"
    onClick={onToggle}
    disabled={disabled}
    className={`${styles.switchRoot} ${checked ? styles.switchRootActive : ""}`}
  >
    <span className={styles.switchTrack}>
      <span className={styles.switchThumb} />
    </span>
    <span className={styles.switchLabel}>{checked ? "ON" : "OFF"}</span>
  </button>
)
