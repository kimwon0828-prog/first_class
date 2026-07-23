"use client"

import { useActionState, useEffect, useMemo, useState, useTransition } from "react"

import { activateStudioTeacherAction } from "@/features/studio/actions/activate-studio-teacher"
import { deactivateStudioTeacherAction } from "@/features/studio/actions/deactivate-studio-teacher"
import { updateStudioTeacherPublicStateAction } from "@/features/studio/actions/update-studio-teacher-public-state"
import {
  upsertStudioTeacherAction,
  type UpsertStudioTeacherActionState
} from "@/features/studio/actions/upsert-studio-teacher"
import type { StudioTeacherSeatSummary, StudioTeacherSummary } from "@/shared/lib/db/adapter"
import {
  DEFAULT_TEACHER_PUBLIC_VISIBILITY,
  TEACHER_PUBLIC_VISIBILITY_KEYS,
  type TeacherPublicVisibility,
  type TeacherPublicVisibilityKey
} from "@/shared/lib/teacher-public-visibility"
import {
  getSubjectLabel,
  normalizeGradeBand,
  normalizeSubjectCategory,
  GRADE_BANDS,
  SUBJECT_CATEGORIES
} from "@/shared/constants/education-taxonomy"
import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import styles from "./studio-teachers-manager.module.css"

type StudioTeachersManagerProps = {
  items: StudioTeacherSummary[]
  seatSummary: StudioTeacherSeatSummary
}

type PanelState = {
  isOpen: boolean
  teacherId: string | null
}

const initialState: UpsertStudioTeacherActionState = {
  ok: false,
  message: ""
}

const SUBJECT_OPTIONS = SUBJECT_CATEGORIES.map((item) => item.value) as readonly string[]
const TARGET_OPTIONS = GRADE_BANDS.map((item) => item.value) as readonly string[]
const ADVANCED_VISIBILITY_FIELDS: Array<{ key: TeacherPublicVisibilityKey; label: string }> = [
  { key: "name", label: "이름" },
  { key: "subjects", label: "담당 과목" },
  { key: "targetStudents", label: "담당 대상" },
  { key: "specialties", label: "전문 영역" },
  { key: "shortIntro", label: "한 줄 소개" },
  { key: "teachingStyle", label: "수업 스타일" },
  { key: "intro", label: "상세 소개" }
]

const getInitials = (value: string) => value.trim().slice(0, 2) || "선생"
const toText = (value: string | null) => value?.trim() || null
const formatPhone = (value: string | null) => (toText(value) ? value : "미기록")
const parseCommaSeparatedValues = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .map((item) => normalizeGradeBand(item) ?? item)
    .filter(Boolean)

const formatTeacherSubjectValue = (value: string | null | undefined) => {
  const normalized = toText(value ?? null)
  if (!normalized) {
    return null
  }

  return getSubjectLabel(normalized)
}

const formatTeacherTargetValue = (value: string | null | undefined) => {
  const normalized = toText(value ?? null)
  if (!normalized) {
    return null
  }

  return formatStoredTargetGrades(normalized)
}

const buildPublicVisibility = (isPublic: boolean): TeacherPublicVisibility => {
  if (isPublic) {
    return { ...DEFAULT_TEACHER_PUBLIC_VISIBILITY }
  }

  return TEACHER_PUBLIC_VISIBILITY_KEYS.reduce(
    (acc, key) => {
      acc[key] = false
      return acc
    },
    {} as TeacherPublicVisibility
  )
}

const isTeacherPublic = (visibility: TeacherPublicVisibility) =>
  TEACHER_PUBLIC_VISIBILITY_KEYS.some((key) => visibility[key])

const isTeacherProfileIncomplete = (item: Pick<StudioTeacherSummary, "shortIntro">) =>
  !toText(item.shortIntro)

const getTeacherSummary = (item: StudioTeacherSummary) =>
  [formatTeacherSubjectValue(item.subjects), formatTeacherTargetValue(item.targetStudents), toText(item.specialties)]
    .filter(Boolean)
    .join(" · ")

const getTeacherPreviewSummary = (subjects: string, targetStudents: string, specialties: string) =>
  [formatTeacherSubjectValue(subjects), formatTeacherTargetValue(targetStudents), toText(specialties)]
    .filter(Boolean)
    .join(" · ")

const getSubjectOptions = (currentValue: string) => {
  const normalized = toText(currentValue)
  if (!normalized || SUBJECT_OPTIONS.includes(normalized)) {
    return SUBJECT_OPTIONS
  }

  return [normalized, ...SUBJECT_OPTIONS]
}

const getTargetOptions = (values: string[]) => {
  const extras = values.filter((value) => !TARGET_OPTIONS.includes(value))
  return [...extras, ...TARGET_OPTIONS]
}

const renderProfileValue = (
  value: string | null,
  onWriteClick: () => void
) =>
  value ? (
    <span>{value}</span>
  ) : (
    <button type="button" className={styles.inlineWriteButton} onClick={onWriteClick}>
      미작성 · 작성하기
    </button>
  )

export const StudioTeachersManager = ({
  items,
  seatSummary
}: StudioTeachersManagerProps) => {
  const [panelState, setPanelState] = useState<PanelState>({ isOpen: false, teacherId: null })
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [openInternalTeacherId, setOpenInternalTeacherId] = useState<string | null>(null)
  const [isStatusActionPending, startStatusActionTransition] = useTransition()
  const [isVisibilityActionPending, startVisibilityActionTransition] = useTransition()

  const selectedTeacher = items.find((item) => item.id === panelState.teacherId) ?? null
  const publicCount = items.filter((item) => item.isActive && isTeacherPublic(item.publicVisibility)).length
  const incompleteCount = items.filter(isTeacherProfileIncomplete).length
  const canCreateTeacher = seatSummary.remainingTeacherSeats > 0
  const shouldShowSearch = items.length >= 3
  const usageRatio = Math.min(1, seatSummary.activeTeacherCount / seatSummary.teacherSeatLimit)

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

      return [
        item.displayName,
        item.subjects,
        item.targetStudents,
        formatTeacherSubjectValue(item.subjects),
        formatTeacherTargetValue(item.targetStudents),
        item.specialties,
        item.shortIntro,
        item.teachingStyle,
        item.intro
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [items, query, shouldShowSearch, statusFilter])

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

  const handlePublicToggle = (item: StudioTeacherSummary) => {
    setActionFeedback(null)
    startVisibilityActionTransition(async () => {
      const result = await updateStudioTeacherPublicStateAction(
        item.id,
        !isTeacherPublic(item.publicVisibility)
      )
      setActionFeedback(result.message)
    })
  }

  return (
    <div className={styles.root}>
      <section className={styles.headerRow}>
        <div className={styles.headerCopy}>
          <h1 className={styles.pageTitle}>선생님 관리</h1>
          <p className={styles.pageDescription}>
            학부모가 수업을 고를 때 선생님 소개를 보고 신뢰를 판단해요.
          </p>
        </div>
        <span
          className={styles.headerActionWrap}
          title={!canCreateTeacher ? "최대 3명까지 등록할 수 있어요" : undefined}
        >
          <button
            type="button"
            onClick={openCreatePanel}
            className={styles.primaryButton}
            disabled={!canCreateTeacher}
          >
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
          <span className={styles.summaryDot} aria-hidden="true" />
          <span className={styles.summaryItem}>
            <strong>{publicCount}명</strong> 공개 중
          </span>
          <span className={styles.summaryDot} aria-hidden="true" />
          <span
            className={`${styles.summaryItem} ${
              incompleteCount > 0 ? styles.summaryItemWarning : ""
            }`}
          >
            <strong>{incompleteCount}명</strong> 프로필 미완성
          </span>
        </div>
        <div className={styles.capacityWrap}>
          <span className={styles.capacityLabel}>최대 {seatSummary.teacherSeatLimit}명</span>
          <div className={styles.capacityTrack} aria-hidden="true">
            <div
              className={styles.capacityFill}
              style={{ width: seatSummary.activeTeacherCount === 0 ? "0%" : `${usageRatio * 100}%` }}
            />
          </div>
          <span className={styles.capacityCount}>
            {seatSummary.activeTeacherCount}/{seatSummary.teacherSeatLimit}
          </span>
        </div>
      </section>

      {shouldShowSearch ? (
        <section className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="선생님 이름이나 소개를 검색해 보세요"
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
                onTogglePublic={() => handlePublicToggle(item)}
                onToggleStatus={() => handleStatusAction(item)}
                onWriteClick={() => openEditPanel(item.id)}
                internalOpen={openInternalTeacherId === item.id}
                onToggleInternal={() =>
                  setOpenInternalTeacherId((current) => (current === item.id ? null : item.id))
                }
                statusPending={isStatusActionPending}
                visibilityPending={isVisibilityActionPending}
              />
            ))}
          </div>
        )}

        {items.length > 0 && canCreateTeacher ? (
          <section className={styles.emptySlotCard}>
            <p className={styles.emptySlotTitle}>
              선생님을 <strong>{seatSummary.remainingTeacherSeats}명</strong> 더 등록할 수 있어요
            </p>
            <p className={styles.emptySlotDescription}>
              여러 선생님이 등록되면 학부모가 수업별 담당을 보고 더 안심하고 선택할 수 있어요.
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
          seatSummary={seatSummary}
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
  onTogglePublic,
  onToggleStatus,
  onWriteClick,
  internalOpen,
  onToggleInternal,
  statusPending,
  visibilityPending
}: {
  item: StudioTeacherSummary
  onEdit: () => void
  onTogglePublic: () => void
  onToggleStatus: () => void
  onWriteClick: () => void
  internalOpen: boolean
  onToggleInternal: () => void
  statusPending: boolean
  visibilityPending: boolean
}) => {
  const isPublic = isTeacherPublic(item.publicVisibility)
  const isIncomplete = isTeacherProfileIncomplete(item)
  const summary = getTeacherSummary(item)
  const displaySummary = summary || "담당 정보가 아직 비어 있어요."
  const visibilityDescription = !item.isActive
    ? "현재 비활성 상태라 학부모 페이지에는 보이지 않아요."
    : isPublic
      ? "수업 상세 페이지에 이 선생님 소개가 표시돼요."
      : "끄면 내부 배정에만 사용되고 소개가 노출되지 않아요."

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
              <span className={`${styles.statusChip} ${isPublic && item.isActive ? styles.statusActive : styles.statusInactive}`}>
                {isPublic && item.isActive ? "공개 중" : "비공개"}
              </span>
              {isIncomplete ? <span className={styles.attentionChip}>프로필 미완성</span> : null}
            </div>
            <p className={styles.teacherSummary}>{displaySummary}</p>
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

      <section
        className={`${styles.publicStateCard} ${isPublic ? styles.publicStateCardActive : styles.publicStateCardInactive}`}
      >
        <div className={styles.publicStateCopy}>
          <strong className={styles.publicStateTitle}>
            {isPublic ? "학부모에게 공개 중" : "학부모에게 비공개"}
          </strong>
          <p className={styles.publicStateDescription}>{visibilityDescription}</p>
        </div>
        <SimpleSwitch
          checked={isPublic}
          onToggle={onTogglePublic}
          disabled={visibilityPending}
          ariaLabel="학부모 공개 여부"
        />
      </section>

      <dl className={styles.profileGrid}>
        <div className={styles.profileRow}>
          <dt className={styles.profileLabel}>담당</dt>
          <dd className={styles.profileValue}>
            {renderProfileValue(
              [formatTeacherSubjectValue(item.subjects), formatTeacherTargetValue(item.targetStudents)]
                .filter(Boolean)
                .join(" · ") || null,
              onWriteClick
            )}
          </dd>
        </div>
        <div className={styles.profileRow}>
          <dt className={styles.profileLabel}>전문 영역</dt>
          <dd className={styles.profileValue}>{renderProfileValue(toText(item.specialties), onWriteClick)}</dd>
        </div>
        <div className={styles.profileRow}>
          <dt className={styles.profileLabel}>수업 스타일</dt>
          <dd className={styles.profileValue}>{renderProfileValue(toText(item.teachingStyle), onWriteClick)}</dd>
        </div>
      </dl>

      <div className={styles.quoteBlock}>
        <span className={styles.quoteLabel}>한 줄 소개</span>
        {item.shortIntro ? (
          <p className={styles.quoteText}>{item.shortIntro}</p>
        ) : (
          <button type="button" className={styles.inlineWriteButton} onClick={onWriteClick}>
            미작성 · 작성하기
          </button>
        )}
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
              이 정보는 학부모에게 공개되지 않아요. 내부 운영과 알림 발송에만 사용됩니다.
            </p>
          </div>
        ) : null}
      </div>
    </article>
  )
}

const TeacherFormPanel = ({
  initialItem,
  seatSummary,
  onClose,
  onComplete
}: {
  initialItem: StudioTeacherSummary | null
  seatSummary: StudioTeacherSeatSummary
  onClose: () => void
  onComplete: (message: string) => void
}) => {
  const action = useMemo(() => upsertStudioTeacherAction, [])
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [displayName, setDisplayName] = useState(initialItem?.displayName ?? "")
  const [subject, setSubject] = useState(normalizeSubjectCategory(initialItem?.subjects) ?? initialItem?.subjects ?? "")
  const [targetSelections, setTargetSelections] = useState(parseCommaSeparatedValues(initialItem?.targetStudents ?? null))
  const [specialties, setSpecialties] = useState(initialItem?.specialties ?? "")
  const [shortIntro, setShortIntro] = useState(initialItem?.shortIntro ?? "")
  const [teachingStyle, setTeachingStyle] = useState(initialItem?.teachingStyle ?? "")
  const [intro, setIntro] = useState(initialItem?.intro ?? "")
  const [phone, setPhone] = useState(initialItem?.phone ?? "")
  const [smsEnabled] = useState(initialItem?.smsEnabled ?? false)
  const [publicVisibility, setPublicVisibility] = useState<TeacherPublicVisibility>(
    initialItem?.publicVisibility ?? DEFAULT_TEACHER_PUBLIC_VISIBILITY
  )
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)

  const isCreateMode = !initialItem
  const isCreateDisabled = isCreateMode && seatSummary.activeTeacherCount >= seatSummary.teacherSeatLimit
  const targetOptions = getTargetOptions(targetSelections)
  const subjectOptions = getSubjectOptions(subject)
  const isPublic = isTeacherPublic(publicVisibility)
  const targetStudentsValue = targetSelections.join(", ")
  const previewSummary = getTeacherPreviewSummary(subject, targetStudentsValue, specialties)

  useEffect(() => {
    if (!state.message) {
      return
    }

    onComplete(state.message)
    if (state.ok) {
      onClose()
    }
  }, [onClose, onComplete, state.message, state.ok])

  const toggleTarget = (value: string) => {
    setTargetSelections((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    )
  }

  const toggleAdvancedVisibility = (key: TeacherPublicVisibilityKey) => {
    setPublicVisibility((current) => ({
      ...current,
      [key]: !current[key]
    }))
  }

  const toggleMainPublic = () => {
    setPublicVisibility(buildPublicVisibility(!isPublic))
  }

  return (
    <div className={styles.panelRoot}>
      <button type="button" className={styles.panelOverlay} aria-label="패널 닫기" onClick={onClose} />
      <aside className={styles.panel} role="dialog" aria-modal="true" aria-label={isCreateMode ? "선생님 등록" : "선생님 정보 수정"}>
        <form action={formAction} className={styles.panelForm}>
          <input type="hidden" name="mode" value={isCreateMode ? "create" : "update"} />
          {!isCreateMode ? <input type="hidden" name="teacherId" value={initialItem.id} /> : null}
          <input type="hidden" name="subjects" value={subject} />
          <input type="hidden" name="targetStudents" value={targetStudentsValue} />
          <input type="hidden" name="smsEnabled" value={smsEnabled ? "on" : ""} />
          {ADVANCED_VISIBILITY_FIELDS.map((field) => (
            <input
              key={`visibility-${field.key}`}
              type="hidden"
              name={`publicVisibility_${field.key}`}
              value={String(publicVisibility[field.key])}
            />
          ))}

          <header className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>선생님 프로필</p>
              <h2 className={styles.panelTitle}>{isCreateMode ? "선생님 등록" : "선생님 정보 수정"}</h2>
            </div>
            <button type="button" onClick={onClose} className={styles.panelCloseButton}>
              닫기
            </button>
          </header>

          <div className={styles.panelBody}>
            <section className={styles.formSection}>
              <div className={styles.publicFieldRow}>
                <div>
                  <strong className={styles.fieldTitle}>학부모에게 공개</strong>
                  <p className={styles.fieldDescription}>
                    끄면 내부 배정에만 사용되고 소개가 노출되지 않아요.
                  </p>
                </div>
                <SimpleSwitch
                  checked={isPublic}
                  onToggle={toggleMainPublic}
                  disabled={isPending}
                  ariaLabel="학부모 공개"
                />
              </div>
            </section>

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

              <div className={styles.field}>
                <span className={styles.label}>담당 과목</span>
                <div className={styles.chipGroup}>
                  {subjectOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSubject(option)}
                      className={`${styles.choiceChip} ${subject === option ? styles.choiceChipActive : ""}`}
                    >
                      {formatTeacherSubjectValue(option)}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>담당 대상</span>
                <div className={styles.chipGroup}>
                  {targetOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleTarget(option)}
                      className={`${styles.choiceChip} ${
                        targetSelections.includes(option) ? styles.choiceChipActive : ""
                      }`}
                    >
                      {formatTeacherTargetValue(option)}
                    </button>
                  ))}
                </div>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>전문 영역</span>
                <input
                  name="specialties"
                  value={specialties}
                  onChange={(event) => setSpecialties(event.target.value)}
                  disabled={isPending}
                  className={styles.input}
                  placeholder="예: 글쓰기, 독해, 발표 수업"
                />
              </label>
            </section>

            <section className={styles.formSection}>
              <div className={styles.formSectionHeader}>
                <h3 className={styles.formSectionTitle}>학부모에게 보여질 소개</h3>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>한 줄 소개</span>
                <input
                  name="shortIntro"
                  value={shortIntro}
                  onChange={(event) => setShortIntro(event.target.value)}
                  required
                  disabled={isPending}
                  className={styles.input}
                  placeholder="예: 아이 눈높이에 맞춰 자신감을 키우는 수업을 진행해요."
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>수업 스타일</span>
                <textarea
                  name="teachingStyle"
                  value={teachingStyle}
                  onChange={(event) => setTeachingStyle(event.target.value)}
                  disabled={isPending}
                  className={styles.textarea}
                  rows={4}
                  placeholder="예: 개념 설명 후 예시를 함께 풀고 스스로 설명하게 도와요."
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>상세 소개</span>
                <textarea
                  name="intro"
                  value={intro}
                  onChange={(event) => setIntro(event.target.value)}
                  disabled={isPending}
                  className={styles.textarea}
                  rows={5}
                  placeholder="예: 학생 성향을 먼저 파악하고, 수업 이후에도 스스로 정리할 수 있게 돕습니다."
                />
              </label>

              <TeacherPreviewCard
                displayName={displayName}
                summary={previewSummary}
                shortIntro={shortIntro}
                isPublic={isPublic}
              />
            </section>

            <section className={styles.formSection}>
              <div className={styles.formSectionHeader}>
                <h3 className={styles.formSectionTitle}>내부 운영 정보</h3>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>전화번호</span>
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
                  학부모에게 공개되지 않아요. 내부 운영과 알림 발송에만 사용됩니다.
                </span>
              </label>

              <div className={styles.lockNotice}>
                <strong className={styles.lockTitle}>일정 알림 문자는 아직 준비 중이에요.</strong>
                <p className={styles.lockDescription}>
                  연동이 완료되면 이 화면에서 켤 수 있게 안내드릴게요.
                  {smsEnabled ? " 현재 저장된 선생님은 문자 수신 동의 상태예요." : ""}
                </p>
              </div>
            </section>

            <section className={styles.formSection}>
              <button
                type="button"
                className={styles.advancedToggle}
                onClick={() => setIsAdvancedOpen((current) => !current)}
              >
                항목별 노출 설정 (고급)
              </button>
              <p className={styles.fieldDescription}>
                보통은 건드릴 필요 없어요. 특정 항목만 숨기고 싶을 때 사용하세요.
              </p>

              {isAdvancedOpen ? (
                <div className={styles.advancedList}>
                  {ADVANCED_VISIBILITY_FIELDS.map((field) => (
                    <div key={field.key} className={styles.advancedItem}>
                      <span className={styles.advancedLabel}>{field.label}</span>
                      <SimpleSwitch
                        checked={publicVisibility[field.key]}
                        onToggle={() => toggleAdvancedVisibility(field.key)}
                        disabled={isPending}
                        ariaLabel={`${field.label} 노출`}
                        compact
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            {state.message ? (
              <p className={`${styles.formMessage} ${state.ok ? styles.formMessageSuccess : styles.formMessageError}`}>
                {state.message}
              </p>
            ) : null}
            {isCreateDisabled ? (
              <p className={styles.formHint}>최대 3명까지 등록할 수 있어요.</p>
            ) : null}
          </div>

          <div className={styles.panelFooter}>
            <button type="button" onClick={onClose} className={styles.secondaryButton} disabled={isPending}>
              취소
            </button>
            <button type="submit" disabled={isPending || isCreateDisabled} className={styles.primaryButton}>
              {isPending ? "저장 중..." : isCreateMode ? "선생님 등록" : "변경사항 저장"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}

const TeacherPreviewCard = ({
  displayName,
  summary,
  shortIntro,
  isPublic
}: {
  displayName: string
  summary: string
  shortIntro: string
  isPublic: boolean
}) => (
  <section className={styles.previewCard}>
    <div className={styles.previewTop}>
      <div className={styles.previewAvatar} aria-hidden="true">
        {getInitials(displayName || "선생")}
      </div>
      <div className={styles.previewHeading}>
        <strong className={styles.previewName}>{displayName || "선생님 이름"}</strong>
        <p className={styles.previewSummary}>{summary || "담당 요약이 여기에 표시돼요."}</p>
      </div>
      <span className={`${styles.previewBadge} ${isPublic ? styles.previewBadgeActive : styles.previewBadgeInactive}`}>
        {isPublic ? "공개 중" : "비공개"}
      </span>
    </div>
    <p className={styles.previewIntro}>{shortIntro.trim() || "한 줄 소개가 여기에 표시돼요."}</p>
  </section>
)

const SimpleSwitch = ({
  checked,
  onToggle,
  disabled,
  ariaLabel,
  compact = false
}: {
  checked: boolean
  onToggle: () => void
  disabled: boolean
  ariaLabel: string
  compact?: boolean
}) => (
  <button
    type="button"
    aria-pressed={checked}
    aria-label={ariaLabel}
    onClick={onToggle}
    disabled={disabled}
    className={`${styles.switchRoot} ${compact ? styles.switchRootCompact : ""} ${
      checked ? styles.switchRootActive : ""
    }`}
  >
    <span className={styles.switchTrack}>
      <span className={styles.switchThumb} />
    </span>
    <span className={styles.switchLabel}>{checked ? "ON" : "OFF"}</span>
  </button>
)
