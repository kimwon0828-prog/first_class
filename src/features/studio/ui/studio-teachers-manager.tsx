"use client"

import { useActionState, useMemo, useState, useTransition } from "react"

import { deactivateStudioTeacherAction } from "@/features/studio/actions/deactivate-studio-teacher"
import {
  upsertStudioTeacherAction,
  type UpsertStudioTeacherActionState
} from "@/features/studio/actions/upsert-studio-teacher"
import type { StudioTeacherSeatSummary, StudioTeacherSummary } from "@/shared/lib/db/adapter"
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

export const StudioTeachersManager = ({
  items,
  seatSummary
}: StudioTeachersManagerProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [isDeactivatePending, startDeactivateTransition] = useTransition()
  const selectedTeacher = items.find((item) => item.id === selectedId) ?? null
  const activeTeachers = items.filter((item) => item.isActive)
  const inactiveTeachers = items.filter((item) => !item.isActive)
  const needsProfileCount = items.filter((item) => !item.specialty || !item.intro).length
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

      return [item.displayName, item.specialty, item.intro]
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
        <div className={styles.guideIcon} aria-hidden="true">
          +
        </div>
        <div className={styles.guideBody}>
          <p className={styles.guideTitle}>
            선생님 소개는 학부모가 수업을 신청할 때 신뢰를 판단하는 중요한 정보예요.
          </p>
          <p className={styles.guideDescription}>
            담당 과목, 수업 스타일, 경력 정보를 간단히 정리해 주세요.
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
          description="최대 3명까지 등록 가능"
        />
        <SummaryCard label="노출 중" value={`${activeTeachers.length}명`} description="학부모 화면에 연결 가능한 프로필" />
        <SummaryCard label="비노출" value={`${inactiveTeachers.length}명`} description="현재 비활성화된 선생님" />
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
            노출 중
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("inactive")}
            className={`${styles.pill} ${statusFilter === "inactive" ? styles.pillActive : ""}`}
          >
            비노출
          </button>
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.listCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>선생님 목록</h2>
              <p className={styles.sectionDescription}>
                현재 로그인한 학원 organization 기준으로만 조회합니다. 학원 로그인 계정에 연결된 선생님 row는 제외하고, 내부 선생님 프로필만 관리합니다.
              </p>
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
                const needsAttention = !item.specialty || !item.intro

                return (
                  <article
                    key={item.id}
                    className={`${styles.teacherCard} ${selectedId === item.id ? styles.teacherCardSelected : ""}`}
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
                            startDeactivateTransition(async () => {
                              const result = await deactivateStudioTeacherAction(item.id)
                              setActionFeedback(result.message)
                            })
                          }}
                          disabled={isDeactivatePending || !item.isActive}
                          className={styles.dangerButtonSmall}
                        >
                          {item.isActive ? "비활성화" : "비활성 상태"}
                        </button>
                      </div>
                    </div>

                    <div className={styles.metaGrid}>
                      {item.specialty ? (
                        <div className={styles.metaItem}>
                          <p className={styles.metaLabel}>담당 분야</p>
                          <p className={styles.metaValue}>{item.specialty}</p>
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
                    </div>

                    {item.intro ? <p className={styles.intro}>{item.intro}</p> : null}
                  </article>
                )
              })}

              {canCreateTeacher ? (
                <button type="button" onClick={handleCreateClick} className={styles.addCard}>
                  <span className={styles.addCardIcon} aria-hidden="true">
                    +
                  </span>
                  <span className={styles.addCardTitle}>선생님을 추가해보세요</span>
                  <span className={styles.addCardDescription}>
                    수업에 연결할 선생님 정보를 등록할 수 있어요.
                  </span>
                </button>
              ) : null}
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
  const isCreateMode = !initialItem
  const isCreateDisabled = isCreateMode && seatSummary.activeTeacherCount >= seatSummary.teacherSeatLimit

  return (
    <section id="studio-teacher-form" className={styles.formCard}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{isCreateMode ? "선생님 등록" : "선생님 정보 수정"}</h2>
          <p className={styles.sectionDescription}>
            선생님 이름만 관리합니다. 선생님 개별 로그인 계정 생성은 이번 MVP 범위에 포함하지 않습니다.
          </p>
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

        <label className={styles.field}>
          <span className={styles.label}>선생님 이름</span>
          <input
            name="displayName"
            defaultValue={initialItem?.displayName ?? ""}
            required
            minLength={2}
            maxLength={30}
            disabled={isPending}
            className={styles.input}
            placeholder="예: 이태경 선생님"
          />
        </label>

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
      <span className={styles.summaryAccent} aria-hidden="true" />
    </div>
    <p className={styles.summaryValue}>{value}</p>
    <p className={styles.summaryDescription}>{description}</p>
  </div>
)

const StatusChip = ({ isActive }: { isActive: boolean }) => (
  <span className={`${styles.statusChip} ${isActive ? styles.statusActive : styles.statusInactive}`}>
    {isActive ? "노출 중" : "비노출"}
  </span>
)
