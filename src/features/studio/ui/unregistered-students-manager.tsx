import Link from "next/link"

import { getStudioRegistrationStatusLabel } from "@/features/studio/lib/application-status-labels"
import {
  getConsultationChannelLabel,
  getConsultationSentimentLabel
} from "@/features/studio/lib/consultation-log-options"
import { formatSeoulDateTime } from "@/features/studio/lib/seoul-datetime"
import {
  getChildGradeLabel,
  getSubjectLabel
} from "@/shared/constants/education-taxonomy"
import type {
  StudioConsultationPipelineApplicationItem,
  StudioConsultationPipelineGroup
} from "@/shared/lib/db/adapter"

import styles from "./unregistered-students-manager.module.css"

type UnregisteredStudentsManagerProps = {
  items: StudioConsultationPipelineApplicationItem[]
  counselorOptions: Array<{ id: string; name: string }>
  selectedQuery: string
  selectedCounselorId: string
  error?: string | null
  basePath?: string
}

const GROUP_ORDER: StudioConsultationPipelineGroup[] = [
  "TODAY_CONTACT",
  "NEEDS_CONSULTATION",
  "NO_NEXT_CONTACT",
  "UPCOMING_CONTACT",
  "CLOSED"
]

const GROUP_META: Record<
  StudioConsultationPipelineGroup,
  {
    title: string
    description: string
    emptyMessage: string
    actionTitle: string
    tone: "today" | "needs" | "warning" | "upcoming" | "closed"
  }
> = {
  TODAY_CONTACT: {
    title: "오늘 연락",
    description: "예정된 연락 시각이 지났거나 지금 바로 챙겨야 하는 학생이에요.",
    emptyMessage: "현재 연락할 학생이 없습니다.",
    actionTitle: "지금 연락해 주세요.",
    tone: "today"
  },
  NEEDS_CONSULTATION: {
    title: "상담 필요",
    description: "체험은 끝났지만 아직 상담 기록이 없는 학생이에요.",
    emptyMessage: "아직 상담이 필요한 학생이 없습니다.",
    actionTitle: "첫 상담을 남겨 주세요.",
    tone: "needs"
  },
  NO_NEXT_CONTACT: {
    title: "예정 없음",
    description: "상담은 했지만 다음 연락 일정이 없습니다.",
    emptyMessage: "다음 연락 일정이 비어 있는 학생이 없습니다.",
    actionTitle: "다음 연락 일정을 정해 주세요.",
    tone: "warning"
  },
  UPCOMING_CONTACT: {
    title: "연락 예정",
    description: "다가오는 연락 일정을 날짜순으로 확인하세요.",
    emptyMessage: "예정된 연락 학생이 없습니다.",
    actionTitle: "예정된 시각에 다시 연락하세요.",
    tone: "upcoming"
  },
  CLOSED: {
    title: "종료",
    description: "등록 또는 미등록으로 전환이 끝난 학생이에요.",
    emptyMessage: "종료된 학생이 아직 없습니다.",
    actionTitle: "상세 기록을 확인하세요.",
    tone: "closed"
  }
}

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium"
  }).format(date)
}

const normalizePhoneHref = (value: string | null) => {
  if (!value) {
    return null
  }

  const normalized = value.replace(/[^\d+]/g, "")
  return normalized.length > 0 ? normalized : null
}

const getAvatarLabel = (name: string) => name.trim().slice(0, 2) || "학생"

const getDisplayGradeLabel = (value: string | null | undefined) => {
  return getChildGradeLabel(value) ?? value ?? "학년 미기록"
}

const getDisplaySubjectLabel = (value: string | null | undefined) => {
  return getSubjectLabel(value) ?? value ?? null
}

const buildHref = (
  basePath: string,
  nextParams: Partial<{
    q: string | null
    counselorId: string | null
  }>,
  currentParams: {
    q: string
    counselorId: string
  }
) => {
  const params = new URLSearchParams()
  const resolved = {
    q: nextParams.q ?? currentParams.q,
    counselorId: nextParams.counselorId ?? currentParams.counselorId
  }

  if (resolved.q.trim()) {
    params.set("q", resolved.q.trim())
  }

  if (resolved.counselorId && resolved.counselorId !== "all") {
    params.set("counselorId", resolved.counselorId)
  }

  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

const formatDateTime = (value: string | null | undefined) => {
  return formatSeoulDateTime(value, {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })
}

const formatShortDateTime = (value: string | null | undefined) => {
  return formatSeoulDateTime(value, {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })
}

const getOverdueLabel = (value: string | null) => {
  if (!value) {
    return null
  }

  const target = new Date(value).getTime()
  if (Number.isNaN(target)) {
    return null
  }

  const diffMs = Date.now() - target
  if (diffMs <= 0) {
    return null
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 24) {
    return `${Math.max(1, diffHours)}시간 지남`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${Math.max(1, diffDays)}일 지남`
}

const renderLatestConsultationMeta = (item: StudioConsultationPipelineApplicationItem) => {
  const meta = [
    item.latestConsultationOccurredAt ? formatShortDateTime(item.latestConsultationOccurredAt) : null,
    getConsultationChannelLabel(item.latestConsultationChannel)
  ].filter(Boolean)

  if (meta.length === 0) {
    return null
  }

  return meta.join(" · ")
}

export const UnregisteredStudentsManager = ({
  items,
  counselorOptions,
  selectedQuery,
  selectedCounselorId,
  error,
  basePath = "/studio/unregistered"
}: UnregisteredStudentsManagerProps) => {
  const currentParams = {
    q: selectedQuery,
    counselorId: selectedCounselorId
  }
  const groupedItems = Object.fromEntries(
    GROUP_ORDER.map((group) => [group, items.filter((item) => item.pipelineGroup === group)])
  ) as Record<StudioConsultationPipelineGroup, StudioConsultationPipelineApplicationItem[]>
  const closedItems = groupedItems.CLOSED
  const closedEnrolledCount = closedItems.filter((item) => item.registrationStatus === "enrolled").length
  const closedNotEnrolledCount = closedItems.filter(
    (item) => item.registrationStatus === "not_enrolled"
  ).length

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>등록 전환 파이프라인</p>
          <h1 className={styles.title}>상담 관리</h1>
          <p className={styles.description}>
            체험수업 이후 상담과 등록 전환을 관리하세요.
          </p>
        </div>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : null}

      <section className={styles.filterSection}>
        <form action={basePath} method="get" className={styles.filterForm}>
          <label className={styles.searchField}>
            <span className={styles.fieldLabel}>검색</span>
            <input
              type="search"
              name="q"
              defaultValue={selectedQuery}
              placeholder="학생명 / 보호자명 / 연락처 / 수업명 검색"
              className={styles.searchInput}
            />
          </label>

          <label className={styles.selectField}>
            <span className={styles.fieldLabel}>마지막 상담자</span>
            <select name="counselorId" defaultValue={selectedCounselorId} className={styles.select}>
              <option value="all">전체</option>
              {counselorOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className={styles.submitButton}>
            필터 적용
          </button>
        </form>
        <div className={styles.filterFooter}>
          <p className={styles.filterHint}>상담자 정보가 없는 항목은 항상 표시됩니다.</p>
          <Link href={buildHref(basePath, { q: null, counselorId: null }, currentParams)} className={styles.resetLink}>
            필터 초기화
          </Link>
        </div>
      </section>

      {items.length === 0 ? (
        <section className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>지금 표시할 상담 관리 항목이 없어요.</h2>
          <p className={styles.emptyDescription}>
            검색어나 상담자 필터를 비우거나 신청 관리에서 체험 완료 학생을 확인해 주세요.
          </p>
          <Link href="/studio/applications" className={styles.emptyButton}>
            신청 관리로 이동
          </Link>
        </section>
      ) : (
        <div className={styles.groupList}>
          {GROUP_ORDER.map((groupKey) => {
            const groupItems = groupedItems[groupKey]
            const groupMeta = GROUP_META[groupKey]
            if (groupKey === "CLOSED") {
              return (
                <details key={groupKey} className={styles.closedSection}>
                  <summary className={styles.closedSummary}>
                    <div>
                      <h2 className={styles.groupTitle}>
                        {groupMeta.title}
                        <span className={styles.groupCount}>{groupItems.length}명</span>
                      </h2>
                      <p className={styles.groupDescription}>
                        등록 {closedEnrolledCount} · 미등록 {closedNotEnrolledCount}
                      </p>
                    </div>
                    <span className={styles.closedToggle}>펼쳐보기</span>
                  </summary>

                  {groupItems.length === 0 ? (
                    <p className={styles.groupEmpty}>{groupMeta.emptyMessage}</p>
                  ) : (
                    <div className={styles.cardList}>
                      {groupItems.map((item) => {
                        const registrationLabel = getStudioRegistrationStatusLabel(item.registrationStatus)
                        const gradeLabel = getDisplayGradeLabel(item.childGrade)
                        const subjectLabel = getDisplaySubjectLabel(item.classSubject)
                        return (
                          <article key={item.id} className={`${styles.studentCard} ${styles.studentCardClosed}`}>
                            <div className={styles.cardLayout}>
                              <div className={styles.infoColumn}>
                                <div className={styles.avatar}>{getAvatarLabel(item.childName)}</div>
                                <div className={styles.cardTopBody}>
                                  <div className={styles.cardTitleRow}>
                                    <div>
                                      <h3 className={styles.cardTitle}>
                                        {item.childName}
                                        <span className={styles.cardTitleSub}> · {gradeLabel}</span>
                                      </h3>
                                      <p className={styles.cardSubTitle}>{item.classTitle ?? "체험 수업 미확인"}</p>
                                    </div>
                                    <span
                                      className={`${styles.statusBadge} ${
                                        item.registrationStatus === "enrolled"
                                          ? styles.statusBadgePositive
                                          : styles.statusBadgeMuted
                                      }`}
                                    >
                                      {registrationLabel}
                                    </span>
                                  </div>
                                  <p className={styles.metaRow}>
                                    {[item.parentName, item.parentPhone, subjectLabel]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </p>
                                </div>
                              </div>

                              <div className={styles.contextColumn}>
                                <p className={styles.contextLabel}>상태</p>
                                <p className={styles.contextPrimary}>
                                  {item.registrationStatus === "enrolled"
                                    ? `등록 완료 · ${formatDate(item.enrolledAt ?? item.completedAt)}`
                                    : `미등록 종료 · ${formatDate(item.lostAt ?? item.completedAt)}`}
                                </p>
                                {item.registrationStatus === "not_enrolled" ? (
                                  <p className={styles.secondaryLine}>
                                    {[item.unregisteredReason, item.unregisteredReasonNote]
                                      .filter(Boolean)
                                      .join(" · ") || "미등록 사유 미기록"}
                                  </p>
                                ) : null}
                              </div>

                              <div className={styles.actionColumn}>
                                <div className={styles.actionSummary}>
                                  <p className={styles.actionLabel}>다음 행동</p>
                                  <p className={styles.actionTitle}>{groupMeta.actionTitle}</p>
                                </div>
                                <div className={styles.cardActions}>
                                  <Link href={`/studio/applications/${item.id}`} className={styles.tertiaryButton}>
                                    상세 보기
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </details>
              )
            }

            return (
              <section
                key={groupKey}
                className={`${styles.groupSection} ${groupItems.length === 0 ? styles.groupSectionCompact : ""}`}
              >
                <header className={styles.groupHeader}>
                  <div>
                    <h2 className={styles.groupTitle}>
                      {groupMeta.title}
                      <span className={styles.groupCount}>{groupItems.length}</span>
                    </h2>
                    {groupItems.length > 0 ? (
                      <p className={styles.groupDescription}>{groupMeta.description}</p>
                    ) : null}
                  </div>
                </header>

                {groupItems.length === 0 ? (
                  <p className={styles.groupEmpty}>{groupMeta.emptyMessage}</p>
                ) : (
                  <div className={styles.cardList}>
                    {groupItems.map((item) => {
                      const phoneHref = normalizePhoneHref(item.parentPhone)
                      const registrationLabel = getStudioRegistrationStatusLabel(item.registrationStatus)
                      const sentimentLabel = getConsultationSentimentLabel(item.latestConsultationSentiment)
                      const latestConsultationMeta = renderLatestConsultationMeta(item)
                      const overdueLabel = getOverdueLabel(item.nextContactAt)
                      const detailHref = `/studio/applications/${item.id}`
                      const gradeLabel = getDisplayGradeLabel(item.childGrade)
                      const subjectLabel = getDisplaySubjectLabel(item.classSubject)
                      const nextContactLabel = formatDateTime(item.nextContactAt)
                      const needsLegacyFallback =
                        !item.latestConsultationOccurredAt && item.legacyImportExists
                      const actionSummaryLabel =
                        groupKey === "TODAY_CONTACT"
                          ? "지금 연락해 주세요."
                          : groupKey === "NEEDS_CONSULTATION"
                            ? "첫 상담을 남겨 주세요."
                            : groupKey === "NO_NEXT_CONTACT"
                              ? "다음 연락 일정을 정해 주세요."
                              : "예정된 시각에 다시 연락하세요."

                      return (
                        <article
                          key={item.id}
                          className={`${styles.studentCard} ${
                            groupKey === "TODAY_CONTACT"
                              ? styles.studentCardToday
                              : groupKey === "NO_NEXT_CONTACT"
                                ? styles.studentCardWarning
                                : styles.studentCardDefault
                          }`}
                        >
                          <div className={styles.cardLayout}>
                            <Link href={detailHref} className={styles.infoColumn}>
                              <div className={styles.avatar}>{getAvatarLabel(item.childName)}</div>
                              <div className={styles.cardTopBody}>
                                <div className={styles.cardTitleRow}>
                                  <div>
                                    <h3 className={styles.cardTitle}>
                                      {item.childName}
                                      <span className={styles.cardTitleSub}> · {gradeLabel}</span>
                                    </h3>
                                    <p className={styles.cardSubTitle}>{item.classTitle ?? "체험 수업 미확인"}</p>
                                  </div>
                                  <span
                                    className={`${styles.statusBadge} ${
                                      item.registrationStatus === "pending"
                                        ? styles.statusBadgeWarning
                                        : styles.statusBadgeMuted
                                    }`}
                                  >
                                    {registrationLabel}
                                  </span>
                                </div>
                                <p className={styles.metaRow}>
                                  {[item.parentName, item.parentPhone, subjectLabel]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              </div>
                            </Link>

                            <div className={styles.contextColumn}>
                              <p className={styles.contextLabel}>
                                {groupKey === "NEEDS_CONSULTATION"
                                  ? "현재 상태"
                                  : item.latestConsultationOccurredAt
                                    ? "마지막 상담"
                                    : needsLegacyFallback
                                      ? "이전 상담"
                                      : "상담 맥락"}
                              </p>

                              {groupKey === "NEEDS_CONSULTATION" ? (
                                <>
                                  <p className={styles.contextPrimary}>아직 상담 기록이 없습니다.</p>
                                  <p className={styles.secondaryLine}>
                                    체험 완료 {formatDate(item.completedAt)}
                                  </p>
                                </>
                              ) : item.latestConsultationOccurredAt ? (
                                <>
                                  <p className={styles.contextPrimary}>{latestConsultationMeta}</p>
                                  {item.latestConsultationNote ? (
                                    <blockquote className={styles.memoBlock}>
                                      <p className={styles.memoText}>{item.latestConsultationNote}</p>
                                    </blockquote>
                                  ) : null}
                                  <div className={styles.supportMeta}>
                                    {sentimentLabel ? (
                                      <span
                                        className={`${styles.sentimentBadge} ${
                                          item.latestConsultationSentiment === "POSITIVE"
                                            ? styles.sentimentPositive
                                            : item.latestConsultationSentiment === "NEGATIVE"
                                              ? styles.sentimentNegative
                                              : styles.sentimentNeutral
                                        }`}
                                      >
                                        {sentimentLabel}
                                      </span>
                                    ) : null}
                                  </div>
                                </>
                              ) : needsLegacyFallback ? (
                                <>
                                  <p className={styles.contextPrimary}>이전 상담 기록이 있어요.</p>
                                  <p className={styles.secondaryLine}>최근 실제 상담 내용은 아직 없습니다.</p>
                                </>
                              ) : (
                                <p className={styles.contextPrimary}>상담 정보가 없습니다.</p>
                              )}
                            </div>

                            <div className={styles.actionColumn}>
                              <div className={styles.actionSummary}>
                                <p className={styles.actionLabel}>다음 행동</p>
                                <p className={styles.actionTitle}>{actionSummaryLabel}</p>

                                {groupKey === "TODAY_CONTACT" ? (
                                  <>
                                    <p className={styles.primaryLine}>다음 연락 {nextContactLabel ?? "-"}</p>
                                    {overdueLabel ? (
                                      <p className={styles.overdueLine}>지금 연락 권장 · {overdueLabel}</p>
                                    ) : null}
                                  </>
                                ) : null}

                                {groupKey === "NO_NEXT_CONTACT" ? (
                                  <p className={styles.warningLine}>다음 연락 일정이 없습니다.</p>
                                ) : null}

                                {groupKey === "UPCOMING_CONTACT" ? (
                                  <p className={styles.primaryLine}>다음 연락 {nextContactLabel ?? "-"}</p>
                                ) : null}
                              </div>

                              <div className={styles.cardActions}>
                                {phoneHref ? (
                                  <a href={`tel:${phoneHref}`} className={styles.primaryButtonGreen}>
                                    전화
                                  </a>
                                ) : null}
                                <Link href={detailHref} className={styles.secondaryButton}>
                                  상담 기록
                                </Link>
                                <Link href={detailHref} className={styles.tertiaryButton}>
                                  상세 보기
                                </Link>
                              </div>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
