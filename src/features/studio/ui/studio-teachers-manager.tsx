"use client"

import { useActionState, useMemo, useState, useTransition } from "react"

import { activateStudioTeacherAction } from "@/features/studio/actions/activate-studio-teacher"
import { deactivateStudioTeacherAction } from "@/features/studio/actions/deactivate-studio-teacher"
import {
  upsertStudioTeacherAction,
  type UpsertStudioTeacherActionState
} from "@/features/studio/actions/upsert-studio-teacher"
import type { StudioTeacherSeatSummary, StudioTeacherSummary } from "@/shared/lib/db/adapter"
import {
  DEFAULT_TEACHER_PUBLIC_VISIBILITY,
  type TeacherPublicVisibility,
  type TeacherPublicVisibilityKey
} from "@/shared/lib/teacher-public-visibility"
import styles from "./studio-teachers-manager.module.css"

type StudioTeachersManagerProps = {
  items: StudioTeacherSummary[]
  seatSummary: StudioTeacherSeatSummary
}

const initialState: UpsertStudioTeacherActionState = {
  ok: false,
  message: ""
}

const formatCreatedAt = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value))

const getInitials = (value: string) => value.trim().slice(0, 2) || "선생"
const formatPhone = (value: string | null) => (value?.trim() ? value : "미입력")
const toSingleLine = (value: string | null) => value?.trim() || null
const PUBLIC_VISIBILITY_FIELDS: Array<{ key: TeacherPublicVisibilityKey; label: string }> = [
  { key: "name", label: "이름" },
  { key: "intro", label: "상세 소개" },
  { key: "subjects", label: "담당 과목" },
  { key: "targetStudents", label: "담당 대상" },
  { key: "specialties", label: "전문 영역" },
  { key: "shortIntro", label: "한 줄 소개" },
  { key: "teachingStyle", label: "수업 스타일" }
]

const getTeacherCardSummary = (item: StudioTeacherSummary) =>
  [toSingleLine(item.subjects), toSingleLine(item.targetStudents)].filter(Boolean).join(" · ") || "공개 프로필 준비 중"

const getVisibilityStatusLabel = (isVisible: boolean) => (isVisible ? "노출" : "미노출")

export const StudioTeachersManager = ({
  items,
  seatSummary
}: StudioTeachersManagerProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [isStatusActionPending, startStatusActionTransition] = useTransition()
  const selectedTeacher = items.find((item) => item.id === selectedId) ?? null
  const activeTeachers = items.filter((item) => item.isActive)
  const inactiveTeachers = items.filter((item) => !item.isActive)
  const needsProfileCount = items.filter(
    (item) => !toSingleLine(item.subjects) || !toSingleLine(item.targetStudents) || !toSingleLine(item.shortIntro)
  ).length
  const canCreateTeacher = seatSummary.remainingTeacherSeats > 0

  const filteredItems = useMemo(() => {
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
        item.phone,
        item.subjects,
        item.targetStudents,
        item.specialties,
        item.shortIntro,
        item.teachingStyle
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [items, query, statusFilter])

  const handleCreateClick = () => {
    setSelectedId(null)
    document.getElementById("studio-teacher-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className={styles.root}>
      <section className={styles.guideCard}>
        <div className={styles.guideBody}>
          <p className={styles.guideTitle}>
            선생님 소개는 학부모가 수업을 신청할 때 신뢰를 판단하는 중요한 정보예요.
          </p>
          <p className={styles.guideDescription}>
            학부모 공개용으로 담당 과목, 대상, 전문 영역과 수업 스타일을 정리해 주세요. 전화번호는 내부
            운영과 문자 알림용으로만 사용되며 학부모에게 공개되지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateClick}
          className={styles.primaryButton}
          disabled={!canCreateTeacher}
        >
          선생님 등록
        </button>
      </section>

      <section className={styles.statsGrid} aria-label="선생님 요약 지표">
        <SummaryCard
          label="등록 선생님"
          value={`${seatSummary.activeTeacherCount} / ${seatSummary.teacherSeatLimit}`}
          description="활성 선생님 기준 최대 3명까지 등록 가능"
        />
        <SummaryCard label="활성" value={`${activeTeachers.length}명`} description="현재 운영 중인 선생님" />
        <SummaryCard label="비활성" value={`${inactiveTeachers.length}명`} description="목록에 유지되는 비활성 선생님" />
        <SummaryCard
          label="보강 필요"
          value={`${needsProfileCount}명`}
          description="소개 또는 전문분야가 비어 있는 프로필"
        />
      </section>

      {seatSummary.remainingTeacherSeats <= 0 ? (
        <section className={styles.warningCard}>
          <strong className={styles.warningTitle}>선생님 등록 한도에 도달했습니다.</strong>
          <p className={styles.warningDescription}>
            추가 선생님 등록은 추가 결제 상품으로 제공될 예정입니다.
          </p>
        </section>
      ) : null}

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

      <section className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="선생님명 / 전문분야 / 소개 검색"
            className={styles.search}
            aria-label="선생님 검색"
          />
        </div>
        <div className={styles.pills} role="tablist" aria-label="상태 필터">
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

      <div className={styles.layout}>
        <section className={styles.listCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>선생님 목록</h2>
            </div>
            <button type="button" onClick={handleCreateClick} className={styles.secondaryButton}>
              선생님 등록
            </button>
          </div>

          {items.length === 0 ? (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIcon} aria-hidden="true" />
              <p className={styles.emptyTitle}>아직 등록된 선생님이 없어요.</p>
              <p className={styles.emptyDescription}>
                선생님 정보를 등록하면 수업 소개에 연결할 수 있어요.
              </p>
              {canCreateTeacher ? (
                <button type="button" onClick={handleCreateClick} className={styles.primaryButton}>
                  선생님 등록하기
                </button>
              ) : null}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.emptySoft}>
              <p className={styles.emptyTitle}>검색 결과가 없어요.</p>
              <p className={styles.emptyDescription}>다른 키워드나 상태로 다시 확인해 주세요.</p>
            </div>
          ) : (
            <div className={styles.cards}>
              {filteredItems.map((item) => {
                const needsAttention =
                  !toSingleLine(item.subjects) || !toSingleLine(item.targetStudents) || !toSingleLine(item.shortIntro)
                const cardSummary = getTeacherCardSummary(item)

                return (
                  <article
                    key={item.id}
                    className={`${styles.teacherCard} ${selectedId === item.id ? styles.teacherCardSelected : ""} ${
                      !item.isActive ? styles.teacherCardInactive : ""
                    }`}
                  >
                    <div className={styles.teacherTop}>
                      <div className={styles.teacherIdentity}>
                        <div className={styles.avatar} aria-hidden="true">
                          {getInitials(item.displayName)}
                        </div>
                        <div className={styles.teacherHeading}>
                          <div className={styles.nameRow}>
                            <strong className={styles.teacherName}>{item.displayName}</strong>
                            <StatusChip isActive={item.isActive} />
                            {needsAttention ? <span className={styles.attentionChip}>확인 필요</span> : null}
                          </div>
                          <p className={styles.createdAt}>등록일 {formatCreatedAt(item.createdAt)}</p>
                          <p className={styles.teacherSummary}>{cardSummary}</p>
                        </div>
                      </div>

                      <div className={styles.actions}>
                        <button type="button" onClick={() => setSelectedId(item.id)} className={styles.secondaryButtonSmall}>
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionFeedback(null)
                            startStatusActionTransition(async () => {
                              const result = item.isActive
                                ? await deactivateStudioTeacherAction(item.id)
                                : await activateStudioTeacherAction(item.id)
                              setActionFeedback(result.message)
                            })
                          }}
                          disabled={isStatusActionPending}
                          className={item.isActive ? styles.dangerButtonSmall : styles.secondaryButtonSmall}
                        >
                          {item.isActive ? "비활성화" : "활성화"}
                        </button>
                      </div>
                    </div>

                    <div className={styles.metaGrid}>
                      <div className={styles.metaItem}>
                        <p className={styles.metaLabel}>전화번호</p>
                        <p className={styles.metaValue}>{formatPhone(item.phone)}</p>
                      </div>
                      <div className={styles.metaItem}>
                        <p className={styles.metaLabel}>문자 수신</p>
                        <p className={styles.metaValue}>{item.smsEnabled ? "수신 동의" : "수신 안 함"}</p>
                      </div>
                      {item.specialty ? (
                        <div className={styles.metaItem}>
                          <p className={styles.metaLabel}>기존 전문분야</p>
                          <p className={styles.metaValue}>{item.specialty}</p>
                        </div>
                      ) : null}
                      {item.subjects ? (
                        <div className={styles.metaItem}>
                          <p className={styles.metaLabel}>담당 과목</p>
                          <p className={styles.metaValue}>{item.subjects}</p>
                        </div>
                      ) : null}
                      {item.targetStudents ? (
                        <div className={styles.metaItem}>
                          <p className={styles.metaLabel}>담당 대상</p>
                          <p className={styles.metaValue}>{item.targetStudents}</p>
                        </div>
                      ) : null}
                      {item.specialties ? (
                        <div className={styles.metaItem}>
                          <p className={styles.metaLabel}>전문 영역</p>
                          <p className={styles.metaValue}>{item.specialties}</p>
                        </div>
                      ) : null}
                      {item.teachingStyle ? (
                        <div className={styles.metaItem}>
                          <p className={styles.metaLabel}>수업 스타일</p>
                          <p className={styles.metaValue}>{item.teachingStyle}</p>
                        </div>
                      ) : null}
                      {item.careerYears > 0 ? (
                        <div className={styles.metaItem}>
                          <p className={styles.metaLabel}>경력</p>
                          <p className={styles.metaValue}>{item.careerYears}년</p>
                        </div>
                      ) : null}
                      <div className={styles.metaItem}>
                        <p className={styles.metaLabel}>프로필 상태</p>
                        <p className={styles.metaValue}>
                          {needsAttention ? "소개 보강 필요" : "프로필 작성 완료"}
                        </p>
                      </div>
                      <div className={`${styles.metaItem} ${styles.metaItemWide}`}>
                        <p className={styles.metaLabel}>학부모 공개 상태</p>
                        <div className={styles.visibilityChipList}>
                          {PUBLIC_VISIBILITY_FIELDS.map((field) => (
                            <span
                              key={`${item.id}-${field.key}`}
                              className={`${styles.visibilityChip} ${
                                item.publicVisibility[field.key] ? styles.visibilityChipVisible : styles.visibilityChipHidden
                              }`}
                            >
                              {field.label} {getVisibilityStatusLabel(item.publicVisibility[field.key])}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {item.shortIntro ? <p className={styles.intro}>{item.shortIntro}</p> : item.intro ? <p className={styles.intro}>{item.intro}</p> : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <StudioTeacherForm
          key={selectedTeacher?.id ?? "create"}
          initialItem={selectedTeacher}
          seatSummary={seatSummary}
          onResetCreate={() => setSelectedId(null)}
        />
      </div>
    </div>
  )
}

const StudioTeacherForm = ({
  initialItem,
  seatSummary,
  onResetCreate
}: {
  initialItem: StudioTeacherSummary | null
  seatSummary: StudioTeacherSeatSummary
  onResetCreate: () => void
}) => {
  const action = useMemo(() => upsertStudioTeacherAction, [])
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [phone, setPhone] = useState(initialItem?.phone ?? "")
  const [smsEnabled, setSmsEnabled] = useState(initialItem?.smsEnabled ?? false)
  const [publicVisibility, setPublicVisibility] = useState<TeacherPublicVisibility>(
    initialItem?.publicVisibility ?? DEFAULT_TEACHER_PUBLIC_VISIBILITY
  )
  const isCreateMode = !initialItem
  const isCreateDisabled = isCreateMode && seatSummary.activeTeacherCount >= seatSummary.teacherSeatLimit
  const hasPhone = phone.trim().length > 0
  const toggleVisibility = (key: TeacherPublicVisibilityKey) => {
    setPublicVisibility((current) => ({
      ...current,
      [key]: !current[key]
    }))
  }

  return (
    <section id="studio-teacher-form" className={styles.formCard}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{isCreateMode ? "선생님 등록" : "선생님 정보 수정"}</h2>
        </div>
        {!isCreateMode ? (
          <button type="button" onClick={onResetCreate} className={styles.secondaryButton}>
            새로 등록
          </button>
        ) : null}
      </div>

      <form action={formAction} className={styles.form}>
        <input type="hidden" name="mode" value={isCreateMode ? "create" : "update"} />
        {!isCreateMode ? <input type="hidden" name="teacherId" value={initialItem.id} /> : null}
        {PUBLIC_VISIBILITY_FIELDS.map((field) => (
          <input
            key={`visibility-input-${field.key}`}
            type="hidden"
            name={`publicVisibility_${field.key}`}
            value={String(publicVisibility[field.key])}
          />
        ))}

        <label className={styles.field}>
          <div className={styles.fieldHeader}>
            <span className={styles.label}>선생님 이름</span>
            <VisibilityToggle
              checked={publicVisibility.name}
              onToggle={() => toggleVisibility("name")}
              disabled={isPending}
            />
          </div>
          <input
            name="displayName"
            defaultValue={initialItem?.displayName ?? ""}
            required
            minLength={2}
            maxLength={30}
            disabled={isPending}
            className={styles.input}
            placeholder="예: 김수업 선생님"
          />
        </label>

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
          <span className={styles.fieldHint}>내부 알림과 문자 수신 대상 확인용입니다. 학부모에게 공개되지 않습니다.</span>
        </label>

        <label className={styles.checkboxField}>
          <input
            name="smsEnabled"
            type="checkbox"
            checked={smsEnabled}
            onChange={(event) => setSmsEnabled(event.target.checked)}
            disabled={isPending}
            className={styles.checkbox}
          />
          <div className={styles.checkboxBody}>
            <span className={styles.checkboxLabel}>체험수업 일정 알림 문자 받기</span>
            <span className={styles.checkboxDescription}>
              문자 발송 기능은 추후 연동 예정입니다.
            </span>
          </div>
        </label>

        <p className={styles.formHintNeutral}>
          전화번호와 수신 동의가 있는 선생님에게만 일정 알림 문자가 발송됩니다.
          {!hasPhone && smsEnabled
            ? " 현재 저장된 전화번호가 없어 실제 발송 대상이 될 수 없습니다."
            : ""}
        </p>

        <section className={styles.formSection}>
          <div className={styles.formSectionHeader}>
            <h3 className={styles.formSectionTitle}>공개 프로필</h3>
            <p className={styles.formSectionDescription}>
              아래 정보는 학부모가 수업 상세에서 보는 선생님 소개에 사용됩니다.
            </p>
          </div>

          <label className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>담당 과목</span>
              <VisibilityToggle
                checked={publicVisibility.subjects}
                onToggle={() => toggleVisibility("subjects")}
                disabled={isPending}
              />
            </div>
            <input
              name="subjects"
              defaultValue={initialItem?.subjects ?? ""}
              disabled={isPending}
              className={styles.input}
              placeholder="예: 국어, 수학, 코딩"
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>담당 대상</span>
              <VisibilityToggle
                checked={publicVisibility.targetStudents}
                onToggle={() => toggleVisibility("targetStudents")}
                disabled={isPending}
              />
            </div>
            <input
              name="targetStudents"
              defaultValue={initialItem?.targetStudents ?? ""}
              disabled={isPending}
              className={styles.input}
              placeholder="예: 초등 고학년, 중등, 고등"
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>전문 영역</span>
              <VisibilityToggle
                checked={publicVisibility.specialties}
                onToggle={() => toggleVisibility("specialties")}
                disabled={isPending}
              />
            </div>
            <input
              name="specialties"
              defaultValue={initialItem?.specialties ?? ""}
              disabled={isPending}
              className={styles.input}
              placeholder="예: 독해, 문법, 수능국어"
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>한 줄 소개</span>
              <VisibilityToggle
                checked={publicVisibility.shortIntro}
                onToggle={() => toggleVisibility("shortIntro")}
                disabled={isPending}
              />
            </div>
            <textarea
              name="shortIntro"
              defaultValue={initialItem?.shortIntro ?? ""}
              disabled={isPending}
              className={styles.textarea}
              rows={3}
              placeholder="예: 학생이 스스로 풀이 과정을 설명할 수 있도록 돕습니다."
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>수업 스타일</span>
              <VisibilityToggle
                checked={publicVisibility.teachingStyle}
                onToggle={() => toggleVisibility("teachingStyle")}
                disabled={isPending}
              />
            </div>
            <textarea
              name="teachingStyle"
              defaultValue={initialItem?.teachingStyle ?? ""}
              disabled={isPending}
              className={styles.textarea}
              rows={4}
              placeholder="예: 개념 설명 후 문제풀이와 오답 정리를 함께 진행합니다."
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>상세 소개</span>
              <VisibilityToggle
                checked={publicVisibility.intro}
                onToggle={() => toggleVisibility("intro")}
                disabled={isPending}
              />
            </div>
            <textarea
              name="intro"
              defaultValue={initialItem?.intro ?? ""}
              disabled={isPending}
              className={styles.textarea}
              rows={5}
              placeholder="예: 학생 성향을 먼저 파악한 뒤, 이해한 내용을 스스로 설명할 수 있게 돕는 수업을 진행합니다."
            />
            <span className={styles.fieldHint}>기존 한 줄 소개보다 조금 더 자세한 선생님 소개를 적어주세요.</span>
          </label>
        </section>

        {state.message ? (
          <p className={`${styles.formMessage} ${state.ok ? styles.formMessageSuccess : styles.formMessageError}`}>
            {state.message}
          </p>
        ) : null}

        {isCreateDisabled ? (
          <p className={styles.formHint}>
            active 선생님 수가 최대 등록 가능 수에 도달해 신규 등록을 막습니다.
          </p>
        ) : null}

        <button type="submit" disabled={isPending || isCreateDisabled} className={styles.primaryButton}>
          {isPending ? "저장 중..." : isCreateMode ? "선생님 등록" : "정보 수정"}
        </button>
      </form>
    </section>
  )
}

const SummaryCard = ({
  label,
  value,
  description
}: {
  label: string
  value: string
  description: string
}) => (
  <div className={styles.summaryCard}>
    <div className={styles.summaryTop}>
      <p className={styles.summaryLabel}>{label}</p>
    </div>
    <p className={styles.summaryValue}>{value}</p>
    <p className={styles.summaryDescription}>{description}</p>
  </div>
)

const StatusChip = ({ isActive }: { isActive: boolean }) => (
  <span className={`${styles.statusChip} ${isActive ? styles.statusActive : styles.statusInactive}`}>
    {isActive ? "활성" : "비활성"}
  </span>
)

const VisibilityToggle = ({
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
    onClick={onToggle}
    disabled={disabled}
    className={`${styles.visibilityToggle} ${checked ? styles.visibilityToggleActive : ""}`}
    aria-pressed={checked}
  >
    <span className={styles.visibilityToggleText}>
      <span className={styles.visibilityToggleLabel}>학부모 페이지</span>
      <span className={styles.visibilityToggleValue}>{checked ? "노출" : "비노출"}</span>
    </span>
    <span className={`${styles.visibilitySwitch} ${checked ? styles.visibilitySwitchActive : ""}`} aria-hidden="true">
      <span className={styles.visibilitySwitchThumb} />
    </span>
  </button>
)
