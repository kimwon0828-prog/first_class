import Link from "next/link"

import {
  getStudioRegistrationStatusLabel
} from "@/features/studio/lib/application-status-labels"
import {
  UNREGISTERED_PERIOD_OPTIONS,
  UNREGISTERED_REGISTRATION_FILTERS,
  getDaysSinceCompleted,
  resolveUnregisteredGroupKey,
  type ResolvedUnregisteredPeriod,
  type UnregisteredRegistrationFilterKey
} from "@/features/studio/lib/unregistered-students"
import type { StudioUnregisteredSummary } from "@/features/studio/queries/get-unregistered-applications"
import type {
  StudioDashboardTeacherFilterOption,
  StudioUnregisteredApplicationItem
} from "@/shared/lib/db/adapter"

import styles from "./unregistered-students-manager.module.css"

type UnregisteredStudentsManagerProps = {
  items: StudioUnregisteredApplicationItem[]
  summary: StudioUnregisteredSummary
  teacherOptions: StudioDashboardTeacherFilterOption[]
  selectedQuery: string
  selectedTeacherId: string
  selectedRegistrationStatus: UnregisteredRegistrationFilterKey
  selectedPeriod: ResolvedUnregisteredPeriod
  error?: string | null
  basePath?: string
}

const GROUP_META = {
  pending: {
    title: "고민 중",
    description: "가장 전환 가능성이 높아요",
    tone: "pending" as const,
    primaryActionLabel: "전화 걸기"
  },
  undecided: {
    title: "결과 미기록",
    description: "기록해야 전환율이 정확해져요",
    tone: "undecided" as const,
    primaryActionLabel: "등록 여부 기록"
  },
  not_enrolled: {
    title: "미등록 확정",
    description: "새 프로그램이 생기면 다시 제안할 수 있어요",
    tone: "notEnrolled" as const,
    primaryActionLabel: "전화 걸기"
  }
} as const

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

const getLastMemoText = (item: StudioUnregisteredApplicationItem) =>
  item.followUpNote?.trim() ||
  item.consultationNote?.trim() ||
  item.latestApplicationLogNote?.trim() ||
  "기록이 없어요"

const buildHref = (
  basePath: string,
  nextParams: Partial<{
    q: string | null
    teacherId: string | null
    registrationStatus: UnregisteredRegistrationFilterKey | null
    period: string | null
  }>,
  currentParams: {
    q: string
    teacherId: string
    registrationStatus: UnregisteredRegistrationFilterKey
    period: string
  }
) => {
  const params = new URLSearchParams()
  const resolved = {
    q: nextParams.q ?? currentParams.q,
    teacherId: nextParams.teacherId ?? currentParams.teacherId,
    registrationStatus:
      nextParams.registrationStatus === null
        ? "all"
        : nextParams.registrationStatus ?? currentParams.registrationStatus,
    period: nextParams.period ?? currentParams.period
  }

  if (resolved.q.trim()) {
    params.set("q", resolved.q.trim())
  }

  if (resolved.teacherId && resolved.teacherId !== "all") {
    params.set("teacherId", resolved.teacherId)
  }

  if (resolved.registrationStatus !== "all") {
    params.set("registrationStatus", resolved.registrationStatus)
  }

  if (resolved.period && resolved.period !== "all") {
    params.set("period", resolved.period)
  }

  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

export const UnregisteredStudentsManager = ({
  items,
  summary,
  teacherOptions,
  selectedQuery,
  selectedTeacherId,
  selectedRegistrationStatus,
  selectedPeriod,
  error,
  basePath = "/studio/unregistered"
}: UnregisteredStudentsManagerProps) => {
  const currentParams = {
    q: selectedQuery,
    teacherId: selectedTeacherId,
    registrationStatus: selectedRegistrationStatus,
    period: selectedPeriod.key
  }

  const groupedItems = {
    pending: items.filter((item) => resolveUnregisteredGroupKey(item.registrationStatus) === "pending"),
    undecided: items.filter((item) => resolveUnregisteredGroupKey(item.registrationStatus) === "undecided"),
    not_enrolled: items.filter((item) => resolveUnregisteredGroupKey(item.registrationStatus) === "not_enrolled")
  }

  const visibleGroups =
    selectedRegistrationStatus === "all"
      ? (["pending", "undecided", "not_enrolled"] as const)
      : ([selectedRegistrationStatus] as const)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>리드 관리</p>
          <h1 className={styles.title}>미등록 학생관리</h1>
          <p className={styles.description}>
            체험수업을 마쳤지만 아직 등록하지 않은 학부모예요. 다시 연락하면 등록으로 이어질 수 있어요.
          </p>
        </div>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : null}

      <section className={styles.actionSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2 className={styles.sectionTitle}>지금 챙길 학생</h2>
            <p className={styles.sectionDescription}>
              이 두 그룹은 아직 결과가 확정되지 않았어요. 먼저 처리해 주세요.
            </p>
          </div>
        </div>

        <div className={styles.actionGrid}>
          <Link
            href={buildHref(basePath, { registrationStatus: "pending" }, currentParams)}
            className={`${styles.actionCard} ${styles.actionCardPending}`}
          >
            <p className={styles.actionLabel}>고민 중</p>
            <strong className={styles.actionValue}>{summary.pendingCount}</strong>
            <p className={styles.actionText}>등록을 망설이는 학부모예요</p>
          </Link>
          <Link
            href={buildHref(basePath, { registrationStatus: "undecided" }, currentParams)}
            className={`${styles.actionCard} ${styles.actionCardUndecided}`}
          >
            <p className={styles.actionLabel}>결과 미기록</p>
            <strong className={styles.actionValue}>{summary.undecidedCount}</strong>
            <p className={styles.actionText}>등록 여부를 아직 안 적었어요</p>
          </Link>
        </div>
      </section>

      <section className={styles.stripSection} aria-label="참고 지표">
        <div className={styles.stripGrid}>
          <article className={styles.stripItem}>
            <p className={styles.stripLabel}>전체 관리 대상</p>
            <p className={styles.stripValue}>{summary.totalCount}</p>
            <p className={styles.stripDescription}>체험 완료 · 미등록</p>
          </article>
          <article className={styles.stripItem}>
            <p className={styles.stripLabel}>미등록 확정</p>
            <p className={styles.stripValue}>{summary.notEnrolledCount}</p>
            <p className={styles.stripDescription}>등록 안 하기로 결정</p>
          </article>
          <article className={styles.stripItem}>
            <p className={styles.stripLabel}>평균 경과</p>
            <p className={styles.stripValue}>
              {summary.averageElapsedDays != null ? `${summary.averageElapsedDays}일` : "—"}
            </p>
            <p className={styles.stripDescription}>체험 완료 후</p>
          </article>
          <article className={styles.stripItem}>
            <p className={styles.stripLabel}>재상담 여지</p>
            <p className={styles.stripValue}>{summary.reengageableCount}</p>
            <p className={styles.stripDescription}>고민 중 + 미기록</p>
          </article>
        </div>
      </section>

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
            <span className={styles.fieldLabel}>기간</span>
            <select name="period" defaultValue={selectedPeriod.key} className={styles.select}>
              {UNREGISTERED_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.selectField}>
            <span className={styles.fieldLabel}>담당 선생님</span>
            <select name="teacherId" defaultValue={selectedTeacherId} className={styles.select}>
              <option value="all">전체</option>
              {teacherOptions.map((option) => (
                <option key={option.teacherId} value={option.teacherId}>
                  {option.teacherName}
                </option>
              ))}
            </select>
          </label>

          {selectedRegistrationStatus !== "all" ? (
            <input type="hidden" name="registrationStatus" value={selectedRegistrationStatus} />
          ) : null}

          <button type="submit" className={styles.submitButton}>
            필터 적용
          </button>
        </form>

        <div className={styles.tabs} role="tablist" aria-label="등록 상태 필터">
          {UNREGISTERED_REGISTRATION_FILTERS.map((filter) => {
            const count =
              filter.key === "all"
                ? summary.totalCount
                : filter.key === "pending"
                  ? summary.pendingCount
                  : filter.key === "undecided"
                    ? summary.undecidedCount
                    : summary.notEnrolledCount

            return (
              <Link
                key={filter.key}
                href={buildHref(
                  basePath,
                  {
                    registrationStatus: filter.key === "all" ? null : filter.key
                  },
                  currentParams
                )}
                className={`${styles.tabChip} ${
                  selectedRegistrationStatus === filter.key ? styles.tabChipActive : ""
                }`}
                role="tab"
                aria-selected={selectedRegistrationStatus === filter.key}
              >
                <span>{filter.label}</span>
                <span className={styles.tabCount}>{count}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {items.length === 0 ? (
        <section className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>아직 관리할 미등록 학생이 없어요.</h2>
          <p className={styles.emptyDescription}>
            체험 완료 후 등록하지 않은 학생이 생기면 이곳에서 다시 상담할 수 있어요.
          </p>
          <Link href="/studio/applications" className={styles.emptyButton}>
            신청 관리로 이동
          </Link>
        </section>
      ) : (
        <div className={styles.groupList}>
          {visibleGroups.map((groupKey) => {
            const groupItems = groupedItems[groupKey]
            if (groupItems.length === 0) {
              return null
            }

            const groupMeta = GROUP_META[groupKey]
            return (
              <section key={groupKey} className={styles.groupSection}>
                <header className={styles.groupHeader}>
                  <div>
                    <h2 className={styles.groupTitle}>
                      {groupMeta.title}
                      <span className={styles.groupCount}>{groupItems.length}건</span>
                    </h2>
                    <p className={styles.groupDescription}>{groupMeta.description}</p>
                  </div>
                </header>

                <div className={styles.cardList}>
                  {groupItems.map((item) => {
                    const phoneHref = normalizePhoneHref(item.parentPhone)
                    const dayCount = getDaysSinceCompleted(item.completedAt)
                    const memoText = getLastMemoText(item)
                    const registrationLabel = getStudioRegistrationStatusLabel(item.registrationStatus)
                    const isUndecided = groupKey === "undecided"
                    const isPending = groupKey === "pending"
                    return (
                      <article
                        key={item.id}
                        className={`${styles.studentCard} ${
                          isPending
                            ? styles.studentCardPending
                            : isUndecided
                              ? styles.studentCardUndecided
                              : styles.studentCardNotEnrolled
                        }`}
                      >
                        <Link href={`/studio/applications/${item.id}`} className={styles.cardTopLink}>
                          <div className={styles.avatar}>{getAvatarLabel(item.childName)}</div>
                          <div className={styles.cardTopBody}>
                            <div className={styles.cardTitleRow}>
                              <div>
                                <h3 className={styles.cardTitle}>
                                  {item.childName}
                                  <span className={styles.cardTitleSub}> · {item.childGrade}</span>
                                </h3>
                                <p className={styles.cardSubTitle}>{item.classTitle ?? "수업 정보 없음"}</p>
                              </div>
                              <div className={styles.cardBadges}>
                                <span
                                  className={`${styles.statusBadge} ${
                                    isPending
                                      ? styles.statusBadgePending
                                      : isUndecided
                                        ? styles.statusBadgeUndecided
                                        : styles.statusBadgeNotEnrolled
                                  }`}
                                >
                                  {registrationLabel}
                                </span>
                                <span
                                  className={`${styles.elapsedBadge} ${
                                    dayCount > 30 ? styles.elapsedBadgeAlert : ""
                                  }`}
                                >
                                  체험 후 {dayCount}일
                                </span>
                              </div>
                            </div>

                            <p className={styles.metaRow}>
                              {[item.classTitle, `체험 완료일 ${formatDate(item.completedAt)}`, item.parentName, item.parentPhone, item.assignedTeacherName]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </Link>

                        <blockquote className={styles.memoBlock}>
                          <p className={styles.memoLabel}>마지막 상담 메모</p>
                          <p className={styles.memoText}>{memoText}</p>
                        </blockquote>

                        <div className={styles.cardActions}>
                          {groupKey === "undecided" ? (
                            <Link href={`/studio/applications/${item.id}`} className={styles.primaryButtonBlue}>
                              등록 여부 기록
                            </Link>
                          ) : phoneHref ? (
                            <a
                              href={`tel:${phoneHref}`}
                              className={
                                groupKey === "not_enrolled"
                                  ? styles.outlineButton
                                  : styles.primaryButtonGreen
                              }
                            >
                              {groupMeta.primaryActionLabel}
                            </a>
                          ) : (
                            <Link href={`/studio/applications/${item.id}`} className={styles.outlineButton}>
                              상세 보기
                            </Link>
                          )}

                          {groupKey !== "not_enrolled" && phoneHref ? (
                            groupKey === "undecided" ? (
                              <a href={`tel:${phoneHref}`} className={styles.outlineButton}>
                                전화 걸기
                              </a>
                            ) : (
                              <a href={`sms:${phoneHref}`} className={styles.outlineButton}>
                                문자
                              </a>
                            )
                          ) : null}

                          <Link href={`/studio/applications/${item.id}`} className={styles.outlineButton}>
                            상세 보기
                          </Link>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <section className={styles.futureCard}>
        <h2 className={styles.futureTitle}>앞으로 추가될 기능</h2>
        <p className={styles.futureDescription}>
          미등록 사유 분류, 재상담 예정일 알림, 관심 태그, 마지막 연락일 추적, 새 특강 추천 발송,
          마케팅 수신 동의 관리를 이 화면에서 이어서 제공할 예정이에요.
        </p>
      </section>
    </div>
  )
}
