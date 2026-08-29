"use client"

import { useActionState, useEffect, useMemo, useState, useTransition } from "react"

import { activateStudioTeacherAction } from "@/features/studio/actions/activate-studio-teacher"
import { deactivateStudioTeacherAction } from "@/features/studio/actions/deactivate-studio-teacher"
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
const toText = (value: string | null) => value?.trim() || null
const formatPhone = (value: string | null) => (toText(value) ? value : "미기록")
export const StudioTeachersManager = ({
  items,
  assignmentsByTeacherId
}: StudioTeachersManagerProps) => {
  const [panelState, setPanelState] = useState<PanelState>({ isOpen: false, teacherId: null })
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [openInternalTeacherId, setOpenInternalTeacherId] = useState<string | null>(null)
  const [isStatusActionPending, startStatusActionTransition] = useTransition()

  const selectedTeacher = items.find((item) => item.id === panelState.teacherId) ?? null
  const shouldShowSearch = items.length >= 3

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

  const openCreatePanel = () => {
    setPanelState({ isOpen: true, teacherId: null })
  }

  const openEditPanel = (teacherId: string) => {
    setPanelState({ isOpen: true, teacherId })
  }

  const closePanel = () => {
    setPanelState({ isOpen: false, teacherId: null })
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
      <section className={styles.headerRow}>
        <div className={styles.headerCopy}>
          <h1 className={styles.pageTitle}>선생님 관리</h1>
          <p className={styles.pageDescription}>
            학원 내부 선생님 명부예요. 수업 배정과 알림 발송에 사용됩니다.
          </p>
        </div>
        <span className={styles.headerActionWrap}>
          <button type="button" onClick={openCreatePanel} className={styles.primaryButton}>
            + 선생님 등록
          </button>
        </span>
      </section>

      {actionFeedback ? (
        <p
          className={`${styles.feedback} ${
            actionFeedback.includes("실패") || actionFeedback.includes("없습니다")
              ? styles.feedbackError
              : styles.feedbackSuccess
          }`}
        >
          {actionFeedback}
        </p>
      ) : null}

      <section className={styles.summaryBar} aria-label="선생님 요약">
        <div className={styles.summaryItems}>
          <span className={styles.summaryItem}>
            <strong>{items.length}명</strong> 등록
          </span>
        </div>
      </section>

      {shouldShowSearch ? (
        <section className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="선생님 이름이나 담당 수업을 검색해 보세요"
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

      <section className={styles.listSection}>
        {items.length === 0 ? (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon} aria-hidden="true" />
            <p className={styles.emptyTitle}>아직 등록된 선생님이 없어요.</p>
            <p className={styles.emptyDescription}>
              수업 소개에 연결할 선생님 프로필을 먼저 만들어 두세요.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className={styles.emptySoft}>
            <p className={styles.emptyTitle}>조건에 맞는 선생님이 없어요.</p>
            <p className={styles.emptyDescription}>다른 검색어로 다시 확인해 주세요.</p>
          </div>
        ) : (
          <div className={styles.cards}>
            {filteredItems.map((item) => (
              <TeacherCard
                key={item.id}
                item={item}
                onEdit={() => openEditPanel(item.id)}
                onToggleStatus={() => handleStatusAction(item)}
                internalOpen={openInternalTeacherId === item.id}
                onToggleInternal={() =>
                  setOpenInternalTeacherId((current) => (current === item.id ? null : item.id))
                }
                assignment={assignmentsByTeacherId[item.id] ?? null}
                statusPending={isStatusActionPending}
              />
            ))}
          </div>
        )}

        {items.length > 0 ? (
          <section className={styles.emptySlotCard}>
            <p className={styles.emptySlotTitle}>선생님을 더 등록할 수 있어요</p>
            <p className={styles.emptySlotDescription}>
선생님을 등록해 두면 수업 배정과 알림 발송 대상을 지정할 수 있어요.
            </p>
            <button type="button" onClick={openCreatePanel} className={styles.secondaryButton}>
              + 선생님 등록
            </button>
          </section>
        ) : null}
      </section>

      {panelState.isOpen ? (
        <TeacherFormPanel
          key={selectedTeacher?.id ?? "create"}
          initialItem={selectedTeacher}
          onClose={closePanel}
          onComplete={(message) => setActionFeedback(message)}
        />
      ) : null}
    </div>
  )
}

const TeacherCard = ({
  item,
  onEdit,
  onToggleStatus,
  internalOpen,
  onToggleInternal,
  assignment,
  statusPending
}: {
  item: StudioTeacherSummary
  onEdit: () => void
  onToggleStatus: () => void
  internalOpen: boolean
  onToggleInternal: () => void
  assignment: StudioTeacherAssignmentSummary | null
  statusPending: boolean
}) => {
  // 담당 정보는 legacy teachers.subjects/target_students 가 아니라 실제 수업 배정에서 온다.
  const classCount = assignment?.classCount ?? 0
  const subjectLine = (assignment?.subjectLabels ?? []).join(" · ")

  return (
    <article className={`${styles.teacherCard} ${!item.isActive ? styles.teacherCardInactive : ""}`}>
      <div className={styles.teacherTop}>
        <div className={styles.teacherIdentity}>
          <div className={styles.avatar} aria-hidden="true">
            {getInitials(item.displayName)}
          </div>
          <div className={styles.teacherHeading}>
            <div className={styles.nameRow}>
              <strong className={styles.teacherName}>{item.displayName}</strong>
              <span className={`${styles.statusChip} ${item.isActive ? styles.statusActive : styles.statusInactive}`}>
                {item.isActive ? "활성" : "비활성"}
              </span>
            </div>
            <p className={styles.teacherSummary}>
              {classCount > 0 ? `담당 수업 ${classCount}개` : "담당 수업 없음"}
            </p>
            {subjectLine ? <p className={styles.teacherSubjectLine}>{subjectLine}</p> : null}
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={onEdit} className={styles.secondaryButtonSmall}>
            수정
          </button>
          <button
            type="button"
            onClick={onToggleStatus}
            disabled={statusPending}
            className={styles.secondaryButtonSmall}
          >
            {item.isActive ? "비활성화" : "활성화"}
          </button>
        </div>
      </div>

      <div className={styles.internalWrap}>
        <button type="button" onClick={onToggleInternal} className={styles.internalToggle}>
          {internalOpen ? "내부 운영 정보 닫기" : "내부 운영 정보 보기 (연락처 · 알림 설정)"}
        </button>

        {internalOpen ? (
          <div className={styles.internalPanel}>
            <dl className={styles.internalGrid}>
              <div className={styles.internalItem}>
                <dt className={styles.internalLabel}>연락처</dt>
                <dd className={styles.internalValue}>{formatPhone(item.phone)}</dd>
              </div>
              <div className={styles.internalItem}>
                <dt className={styles.internalLabel}>알림 설정</dt>
                <dd className={styles.internalValue}>{item.smsEnabled ? "문자 수신 동의" : "문자 수신 안 함"}</dd>
              </div>
            </dl>
            <p className={styles.internalHint}>
이 정보는 학원 내부 운영과 알림 발송에만 사용됩니다.
            </p>
          </div>
        ) : null}
      </div>
    </article>
  )
}

const TeacherFormPanel = ({
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

  // 아래 값들은 더 이상 UI 에서 편집하지 않는다. 다만 update payload 가 폼 값으로 덮어쓰므로
  // 기존 DB 값을 그대로 되돌려 보내 legacy 데이터가 지워지지 않게 한다.
  const preservedSmsEnabled = initialItem?.smsEnabled ?? false
  const preserved: Array<[string, string]> = [
    ["intro", initialItem?.intro ?? ""],
    ["subjects", initialItem?.subjects ?? ""],
    ["targetStudents", initialItem?.targetStudents ?? ""],
    ["specialties", initialItem?.specialties ?? ""],
    ["shortIntro", initialItem?.shortIntro ?? ""],
    ["teachingStyle", initialItem?.teachingStyle ?? ""]
  ]
  const preservedVisibility = initialItem?.publicVisibility ?? null

  useEffect(() => {
    if (!state.message) {
      return
    }

    onComplete(state.message)
    if (state.ok) {
      onClose()
    }
  }, [onClose, onComplete, state.message, state.ok])

  return (
    <div className={styles.panelRoot}>
      <button type="button" className={styles.panelOverlay} aria-label="패널 닫기" onClick={onClose} />
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={isCreateMode ? "선생님 등록" : "선생님 정보 수정"}
      >
        <form action={formAction} className={styles.panelForm}>
          <input type="hidden" name="mode" value={isCreateMode ? "create" : "update"} />
          {!isCreateMode ? <input type="hidden" name="teacherId" value={initialItem.id} /> : null}
          <input type="hidden" name="smsEnabled" value={preservedSmsEnabled ? "on" : ""} />
          {preserved.map(([name, value]) => (
            <input key={`preserved-${name}`} type="hidden" name={name} value={value} />
          ))}
          {preservedVisibility
            ? Object.entries(preservedVisibility).map(([key, value]) => (
                <input
                  key={`visibility-${key}`}
                  type="hidden"
                  name={`publicVisibility_${key}`}
                  value={String(value)}
                />
              ))
            : null}

          <header className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>{isCreateMode ? "선생님 등록" : "선생님 정보 수정"}</h2>
            </div>
            <button type="button" onClick={onClose} className={styles.panelCloseButton}>
              닫기
            </button>
          </header>

          <div className={styles.panelBody}>
            <section className={styles.formSection}>
              <div className={styles.formSectionHeader}>
                <h3 className={styles.formSectionTitle}>기본 정보</h3>
              </div>

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
            </section>

            <section className={styles.formSection}>
              <div className={styles.formSectionHeader}>
                <h3 className={styles.formSectionTitle}>내부 운영 정보</h3>
              </div>

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

              {!isCreateMode ? (
                <div className={styles.lockNotice}>
                  <strong className={styles.lockTitle}>일정 알림 문자는 아직 준비 중이에요.</strong>
                  <p className={styles.lockDescription}>
                    연동이 완료되면 이 화면에서 켤 수 있게 안내드릴게요.
                    {preservedSmsEnabled ? " 현재 저장된 선생님은 문자 수신 동의 상태예요." : ""}
                  </p>
                </div>
              ) : null}
            </section>

            {state.message ? (
              <p
                className={`${styles.formMessage} ${
                  state.ok ? styles.formMessageSuccess : styles.formMessageError
                }`}
              >
                {state.message}
              </p>
            ) : null}
          </div>

          <div className={styles.panelFooter}>
            <button type="button" onClick={onClose} className={styles.secondaryButton} disabled={isPending}>
              취소
            </button>
            <button type="submit" className={styles.primaryButton} disabled={isPending}>
              {isPending ? "저장 중..." : isCreateMode ? "선생님 등록" : "변경 사항 저장"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
