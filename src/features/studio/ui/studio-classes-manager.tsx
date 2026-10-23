"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react"

import {
  getOperatingRuleSlotMinutes,
  presentClassOperatingRuleState,
  presentOperatingRuleGroups,
  presentOperatingRuleHeading
} from "@/features/studio/lib/class-operation-presentation"
import type { EditableStudioScheduleSlotDraft } from "@/features/studio/lib/studio-operating-hours"
import { SEOUL_WEEKDAY_SHORT_LABELS, parseDateKey, toDayNumber, toWeekday } from "@/features/studio/lib/studio-schedule-month"
import {
  useStudioNavigationHostname,
  useStudioNavigationPathFactory
} from "@/features/studio/ui/studio-navigation-provider"
import { getParentCrossProductHref } from "@/shared/config/cross-product-navigation"
import { formatStoredTargetGrades } from "@/shared/constants/grade-options"
import type { StudioClassListItem, StudioScheduleCalendarDay, StudioScheduleCalendarItem } from "@/shared/lib/db/adapter"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"

import { BookingTimeDialog } from "./booking-time-dialog"
import { StudioClassLifecycleActions } from "./studio-class-lifecycle-actions"
import { StudioClassScheduleEditor } from "./studio-class-schedule-editor"
import { StudioClassesScheduleHeader } from "./studio-classes-schedule-header"
import { StudioQueryRetry } from "./studio-query-retry"
import { V2Chip } from "./v2/v2-chip"
import { V2Dialog } from "./v2/v2-dialog"
import { v2ButtonClassName } from "./v2/v2-button"
import { V2PencilIcon, V2PlusIcon } from "./v2/v2-icons"
import { V2StatusBadge } from "./v2/v2-status-badge"
import { V2SubjectIcon3D } from "./v2/v2-subject-icon-3d"
import styles from "./studio-classes-manager.module.css"

export type StudioClassIntro = {
  description: string
  recommendedFor: string | null
  experiencePoints: string | null
  curriculum: string | null
  classFormat: string | null
}

type StudioClassesManagerProps = {
  initialStatus?: "all" | "archived"
  items: StudioClassListItem[]
  error?: string | null
  intros?: Record<string, StudioClassIntro>
  todayKey?: string
  weekDateKeys?: string[]
  weekItems?: StudioScheduleCalendarItem[]
  weekError?: string | null
  /** ?class · ?date 가 있을 때 서버가 읽어 둔 "특정 날짜만 변경하기" 팝업 일정. */
  popup?: { classId: string; date: string; month: string; days: StudioScheduleCalendarDay[]; error: string | null } | null
  /** 수업·일정 머리. 없으면(종료 수업 보관 화면) 머리 · 예약 시간 관리 · URL 선택 동기화를 하지 않는다. */
  header?: { classesHref: string; scheduleHref: string; newClassHref: string }
}

type StatusFilter = "all" | "active" | "inactive" | "archived"

const formatPrice = (price: number) => (price <= 0 ? "무료" : `${price.toLocaleString("ko-KR")}원`)

const PROGRAM_TYPE_LABELS: Record<StudioClassListItem["programType"], string> = {
  trial_class: "체험수업",
  level_test: "레벨테스트"
}

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "전체 운영 수업" },
  { value: "active", label: "운영 중" },
  { value: "inactive", label: "비공개" },
  { value: "archived", label: "종료된 수업" }
]

const classStatus = (item: StudioClassListItem) =>
  item.archivedAt
    ? { label: "종료", tone: "gray" as const }
    : item.isActive
      ? { label: "운영 중", tone: "green" as const }
      : { label: "비공개", tone: "gray" as const }

const INTRO_SECTIONS: Array<{ key: keyof StudioClassIntro; title: string }> = [
  { key: "classFormat", title: "수업 방식" },
  { key: "description", title: "프로그램 소개" },
  { key: "recommendedFor", title: "이런 아이에게 추천해요" },
  { key: "experiencePoints", title: "이 수업에서 경험하는 것" },
  { key: "curriculum", title: "커리큘럼" }
]

const weekdayOf = (dateKey: string) => {
  const civil = parseDateKey(dateKey)
  return civil ? toWeekday(toDayNumber(civil)) : 0
}

/** "10월 17일(토) – 23일(금)" (날짜 표기 규칙: 요일을 꼭 함께) */
const formatWeekRange = (dateKeys: string[]) => {
  const first = parseDateKey(dateKeys[0] ?? "")
  const last = parseDateKey(dateKeys[dateKeys.length - 1] ?? "")
  if (!first || !last) return ""
  const head = `${first.month}월 ${first.day}일(${SEOUL_WEEKDAY_SHORT_LABELS[weekdayOf(dateKeys[0])]})`
  const tail = `${first.month === last.month ? "" : `${last.month}월 `}${last.day}일(${
    SEOUL_WEEKDAY_SHORT_LABELS[weekdayOf(dateKeys[dateKeys.length - 1])]
  })`
  return `${head} – ${tail}`
}

/** 팝업 안 "기존 반복 일정" 안내용. 달력 회차에서 weekly 일정만 한 번씩 골라 수정 화면과 같은 모양으로 넘긴다. */
const toWeeklySlotDrafts = (days: StudioScheduleCalendarDay[]): EditableStudioScheduleSlotDraft[] => {
  const seen = new Set<string>()
  return days
    .flatMap((day) => day.items)
    .filter((item) => item.scheduleType === "weekly" && !seen.has(item.classScheduleId) && seen.add(item.classScheduleId))
    .map((item) => ({
      localId: item.classScheduleId,
      persistedId: item.classScheduleId,
      scheduleType: "weekly",
      bookingStatus: item.bookingStatus,
      dayOfWeek: String(item.dayOfWeek ?? ""),
      specificDate: "",
      seriesId: item.seriesId ?? "",
      startTime: item.startTime,
      endTime: item.endTime,
      capacity: String(item.capacity),
      displayLabel: "",
      applicationCount: item.activeReservationCount,
      isReferencedByApplications: item.hasApplicationHistory
    }))
}

const slotTime = (value: string) => value.slice(0, 5)

const NOOP = () => {}

/** 지금 주소의 query 를 고친 주소. 이벤트 · effect 안에서만 부른다. */
const replaceQuery = (mutate: (params: URLSearchParams) => void) => {
  const params = new URLSearchParams(window.location.search)
  mutate(params)
  const search = params.toString()
  return `${window.location.pathname}${search ? `?${search}` : ""}`
}

export const StudioClassesManager = ({
  items,
  error = null,
  initialStatus = "all",
  intros = {},
  todayKey = "",
  weekDateKeys = [],
  weekItems = [],
  weekError = null,
  popup = null,
  header
}: StudioClassesManagerProps) => {
  const studioPath = useStudioNavigationPathFactory()
  const hostname = useStudioNavigationHostname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus)
  const [query, setQuery] = useState("")
  const [toastState, setToastState] = useState<null | "created" | "updated">(null)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<"schedule" | "intro">("schedule")
  const [bookingOpen, setBookingOpen] = useState(false)
  const [dismissedPopup, setDismissedPopup] = useState<string | null>(null)
  const [popupBusy, setPopupBusy] = useState(false)
  const [openingDate, setOpeningDate] = useState<string | null>(null)
  const [isOpeningPopup, startPopupNavigation] = useTransition()

  const totalCount = items.length
  const activeCount = items.filter((item) => item.isActive && !item.archivedAt).length
  const archivedCount = items.filter((item) => item.archivedAt).length
  const inactiveCount = totalCount - activeCount - archivedCount
  const hasOperatingRuleReadError = items.some((item) => item.operatingRuleState.status === "error")
  const legacyItems = hasOperatingRuleReadError
    ? []
    : items.filter((item) => !item.archivedAt && item.operatingRuleState.status === "loaded" && !item.operatingRuleState.rule)

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return items.filter((item) => {
      if (statusFilter === "archived" ? !item.archivedAt : item.archivedAt) return false
      if (statusFilter === "active" && !item.isActive) return false
      if (statusFilter === "inactive" && item.isActive) return false
      if (!needle) return true

      return [item.title, item.teacherDisplayName, item.teacherName, PROGRAM_TYPE_LABELS[item.programType], item.subject, item.targetAge]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [items, query, statusFilter])

  // 공개 중인 수업을 먼저 보여준다. filter 는 순서를 보존하므로 각 그룹 안에서는 기존 순서 그대로다.
  const visibleItems = useMemo(() => {
    const activeItems = filteredItems.filter((item) => item.isActive)
    if (activeItems.length === 0 || activeItems.length === filteredItems.length) return filteredItems
    return [...activeItems, ...filteredItems.filter((item) => !item.isActive)]
  }, [filteredItems])

  // 선택은 URL(?class=id)이 갖는다. 없거나 지금 목록에 없으면 목록의 첫 수업.
  const urlClassId = searchParams.get("class")
  const selected = visibleItems.find((item) => item.id === urlClassId) ?? visibleItems[0] ?? null

  const weekCountByClass = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of weekItems) counts.set(item.classId, (counts.get(item.classId) ?? 0) + 1)
    return counts
  }, [weekItems])

  // 첫 진입 · 필터로 선택이 바뀌면 URL 을 맞춘다. 서버를 다시 부르지 않도록 history 만 바꾼다.
  useEffect(() => {
    if (!header || !selected || selected.id === urlClassId) return
    window.history.replaceState(null, "", replaceQuery((params) => params.set("class", selected.id)))
  }, [header, selected, urlClassId])

  const selectClass = (id: string) => {
    setMenuOpen(false)
    if (!header) return
    window.history.replaceState(
      null,
      "",
      replaceQuery((params) => {
        params.set("class", id)
        params.delete("date")
        params.delete("month")
      })
    )
  }

  const openDate = (dateKey: string) => {
    if (!selected || !header) return
    setDismissedPopup(null)
    setOpeningDate(dateKey)
    const url = replaceQuery((params) => {
      params.set("class", selected.id)
      params.set("date", dateKey)
      params.set("month", dateKey.slice(0, 7))
    })
    startPopupNavigation(() => router.push(url, { scroll: false }))
  }

  const popupKey = popup ? `${popup.classId}/${popup.date}` : null
  const showPopup = Boolean(popup && popupKey !== dismissedPopup)
  const closePopup = () => {
    setDismissedPopup(popupKey)
    setOpeningDate(null)
    // 팝업에서 바꾼 내용은 바로 저장된다. 주소에서 날짜를 빼며 다음 7일 칸을 다시 읽는다.
    router.replace(
      replaceQuery((params) => {
        params.delete("date")
        params.delete("month")
      }),
      { scroll: false }
    )
  }
  const weeklySlotDrafts = useMemo(() => (popup ? toWeeklySlotDrafts(popup.days) : []), [popup])

  useEffect(() => {
    const success = searchParams.get("success")
    const normalized =
      success === "updated" ? "updated" : success === "created" || searchParams.get("created") === "1" ? "created" : null
    if (!normalized) return

    setToastState(normalized)
    const url = new URL(window.location.href)
    url.searchParams.delete("success")
    url.searchParams.delete("created")
    window.history.replaceState({}, "", url.toString())
  }, [searchParams])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("click", close)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!toastState) return
    const timeoutId = window.setTimeout(() => setToastState(null), 4500)
    return () => window.clearTimeout(timeoutId)
  }, [toastState])

  const navigateLink = (href: string, label: string, className: string, icon?: ReactNode) => (
    <Link href={studioPath(href)} className={className} aria-busy={pendingHref === href} onClick={() => setPendingHref(href)}>
      {icon}
      {pendingHref === href ? "이동 중..." : label}
    </Link>
  )

  const renderSchedulePanel = (item: StudioClassListItem) => {
    const operation = presentClassOperatingRuleState(item.operatingRuleState)
    const rule = item.operatingRuleState.status === "loaded" ? item.operatingRuleState.rule : null
    const groups = rule ? presentOperatingRuleGroups(rule) : []
    const operationsHref = `/studio/classes/${item.id}/edit?section=operations`
    const classWeekItems = weekItems.filter((slot) => slot.classId === item.id)

    return (
      <div className={styles.tabPanel}>
        <section className={styles.rules} aria-labelledby="class-rules-title">
          <div className={styles.blockHead}>
            <h3 id="class-rules-title" className={styles.blockTitle}>
              운영 시간 · {item.archivedAt ? "운영 기록 보관" : rule ? presentOperatingRuleHeading(rule) : operation.title}
            </h3>
            {!item.archivedAt && operation.kind !== "error"
              ? navigateLink(
                  operationsHref,
                  operation.kind === "legacy" ? "운영 일정 설정" : "운영 시간 수정",
                  v2ButtonClassName({ variant: "ghost", size: "sm" }),
                  <V2PlusIcon size={16} />
                )
              : null}
          </div>
          {item.archivedAt ? (
            <p className={styles.ruleNote}>{operation.kind === "configured" ? operation.detail : "복구 후 운영 정보를 확인해 주세요."}</p>
          ) : operation.kind === "error" ? (
            <p className={`${styles.ruleNote} ${styles.ruleError}`} role="alert">
              {operation.title} · {operation.detail}
            </p>
          ) : operation.kind === "legacy" ? (
            <p className={`${styles.ruleNote} ${styles.ruleWarn}`}>
              {operation.detail} 앞으로의 운영 방식을 설정할 수 있어요.
            </p>
          ) : (
            <>
              {groups.map((group) => (
                <div key={group.id} className={styles.ruleRow}>
                  <strong className={styles.ruleDays}>{group.weekdayLabel}</strong>
                  <span className={styles.ruleText}>{group.ruleLabel}</span>
                  <span className={styles.ruleTimes}>{group.timesLabel}</span>
                </div>
              ))}
              {rule && !rule.isActive ? <p className={styles.ruleNote}>{operation.detail}</p> : null}
            </>
          )}
        </section>

        {item.archivedAt ? null : (
          <section className={styles.week} aria-labelledby="class-week-title">
            <div className={styles.blockHead}>
              <h3 id="class-week-title" className={styles.blockTitle}>
                다음 7일
              </h3>
              <span className={styles.blockMeta}>{formatWeekRange(weekDateKeys)}</span>
            </div>
            {weekError ? (
              <div className={styles.alert} role="alert">
                <p>{weekError}</p>
                <StudioQueryRetry />
              </div>
            ) : (
              <div className={styles.weekGrid}>
                {weekDateKeys.map((dateKey) => {
                  const slots = classWeekItems.filter((slot) => slot.specificDate === dateKey)
                  const weekday = weekdayOf(dateKey)
                  const isToday = dateKey === todayKey
                  const isOpening = isOpeningPopup && openingDate === dateKey
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      className={`${styles.dayCell} ${isToday ? styles.dayCellToday : ""}`}
                      onClick={() => openDate(dateKey)}
                      disabled={isOpeningPopup}
                      aria-busy={isOpening}
                      aria-label={`${parseDateKey(dateKey)?.month}월 ${parseDateKey(dateKey)?.day}일(${SEOUL_WEEKDAY_SHORT_LABELS[weekday]}) 예약 시간 바꾸기`}
                    >
                      <span className={styles.dayHead}>
                        <span className={weekday === 0 ? styles.sunday : weekday === 6 ? styles.saturday : styles.weekday}>
                          {SEOUL_WEEKDAY_SHORT_LABELS[weekday]}
                        </span>
                        <strong>{parseDateKey(dateKey)?.day}</strong>
                        {isToday ? <span className={styles.todayMark}>오늘</span> : null}
                      </span>
                      {slots.length === 0 ? <span className={styles.dayEmpty}>일정 없음</span> : null}
                      {slots.map((slot) => {
                        const unavailable = slot.status !== "open"
                        const booked = !unavailable && slot.activeReservationCount > 0
                        const counts = `${slot.activeReservationCount}/${slot.capacity}`
                        return (
                          <span
                            key={`${slot.classScheduleId}/${slot.startTime}`}
                            className={`${styles.slot} ${booked ? styles.slotBooked : ""} ${unavailable ? styles.slotClosed : ""}`}
                          >
                            <strong>{slotTime(slot.startTime)}</strong>
                            <small>
                              {slot.status === "closed"
                                ? "마감"
                                : slot.status === "hidden"
                                  ? "숨김"
                                  : booked
                                    ? `신청 ${counts}`
                                    : slot.scheduleType === "one_time" && !slot.seriesId
                                      ? `이 날만 · ${counts}`
                                      : `모집 ${counts}`}
                            </small>
                          </span>
                        )
                      })}
                      {isOpening ? <span className={styles.dayAdd}>여는 중…</span> : <span className={styles.dayAdd}>+ 이 날만 추가</span>}
                    </button>
                  )
                })}
              </div>
            )}
            <p className={styles.caption}>
              칸을 누르면 그날만 정원을 바꾸거나 마감·숨김할 수 있어요. 신청 이력(완료·취소 포함)이 있는 시간은 지울 수 없어요. 학부모는 체험
              24시간 전까지 신청할 수 있어요.
            </p>
          </section>
        )}
      </div>
    )
  }

  const renderIntroPanel = (item: StudioClassListItem) => {
    const intro = intros[item.id]
    if (!intro) {
      return (
        <div className={styles.tabPanel}>
          <p className={styles.ruleNote}>수업 소개를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>
        </div>
      )
    }
    return (
      <div className={styles.tabPanel}>
        {INTRO_SECTIONS.map((section) => {
          const value = intro[section.key]?.trim()
          return (
            <section key={section.key} className={styles.introSection}>
              <h3 className={styles.introTitle}>{section.title}</h3>
              <p className={value ? styles.introText : styles.introEmpty}>{value || "아직 입력하지 않았어요."}</p>
            </section>
          )
        })}
      </div>
    )
  }

  const renderDetail = (item: StudioClassListItem) => {
    const status = classStatus(item)
    const rule = item.operatingRuleState.status === "loaded" ? item.operatingRuleState.rule : null
    const minutes = rule ? getOperatingRuleSlotMinutes(rule) : null
    const summary = [
      PROGRAM_TYPE_LABELS[item.programType],
      formatStoredTargetGrades(item.targetAge),
      minutes ? `${minutes}분` : null,
      formatPrice(item.trialPrice),
      item.assignmentMode === "preassigned"
        ? `담당 ${item.teacherDisplayName ?? item.teacherName ?? "미지정"}`
        : "신청 후 배정"
    ]
      .filter(Boolean)
      .join(" · ")
    const editHref = `/studio/classes/${item.id}/edit`

    return (
      <section className={styles.detail} aria-label={`${item.title} 상세`}>
        <div className={styles.detailHead}>
          <span className={styles.detailIcon}>
            <V2SubjectIcon3D categoryCode={item.subjectCategoryCode} size={44} />
          </span>
          <div className={styles.detailTitleBox}>
            <div className={styles.detailTitleRow}>
              <h2 className={styles.detailTitle}>{item.title}</h2>
              <V2StatusBadge tone={status.tone}>{status.label}</V2StatusBadge>
            </div>
            <p className={styles.detailSummary}>
              {summary}
              {formatClassSubjectDisplayLabel(item) ? <span className={styles.detailSubject}> · {formatClassSubjectDisplayLabel(item)}</span> : null}
            </p>
          </div>
          <div className={styles.detailActions}>
            {!item.archivedAt ? (
              // Studio host 에서는 학부모 사이트 절대 주소, 그 밖의 host 에서는 같은 host 의 /classes/{id}.
              <a
                href={getParentCrossProductHref({ pathname: `/classes/${item.id}`, hostname })}
                className={v2ButtonClassName({ variant: "ghost", size: "sm" })}
              >
                학부모 화면 보기
              </a>
            ) : null}
            {navigateLink(
              editHref,
              item.archivedAt ? "보관 정보" : "수업 정보 수정",
              v2ButtonClassName({ variant: "outline", size: "sm" }),
              <V2PencilIcon size={16} />
            )}
            <div className={styles.rowMenu} onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className={`${styles.rowMenuButton} ${menuOpen ? styles.rowMenuButtonOpen : ""}`}
                aria-label={`${item.title} 관리 메뉴`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((current) => !current)}
              >
                ⋯
              </button>
              {menuOpen ? (
                <div className={styles.rowMenuList} role="menu">
                  <StudioClassLifecycleActions item={item} />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.detailTabs} role="tablist" aria-label={`${item.title} 보기`}>
          {(
            [
              ["schedule", "체험 일정"],
              ["intro", "수업 소개"]
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={detailTab === value}
              className={`${styles.detailTab} ${detailTab === value ? styles.detailTabActive : ""}`}
              onClick={() => setDetailTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {detailTab === "schedule" ? renderSchedulePanel(item) : renderIntroPanel(item)}
      </section>
    )
  }

  return (
    <div className={styles.root}>
      {header ? (
        <StudioClassesScheduleHeader
          active="classes"
          description="수업을 고르면 그 수업의 체험 일정을 바로 관리할 수 있어요."
          classesHref={header.classesHref}
          scheduleHref={header.scheduleHref}
          newClassHref={header.newClassHref}
          onOpenBookingTimes={() => setBookingOpen(true)}
        />
      ) : null}

      {toastState ? (
        <div className={styles.toast} role="status" aria-live="polite">
          <div className={styles.toastBody}>
            <p className={styles.toastTitle}>
              {toastState === "updated" ? "수업 정보가 수정되었습니다." : "새 프로그램이 등록되었습니다."}
            </p>
            <p className={styles.toastDescription}>
              {toastState === "updated"
                ? "수업 목록에서 최신 공개 상태와 예약 시간을 다시 확인해 주세요."
                : "수업 목록에서 공개 상태와 노출 정보를 확인해 주세요."}
            </p>
          </div>
          <button type="button" className={v2ButtonClassName({ variant: "ghost", size: "sm" })} onClick={() => setToastState(null)}>
            닫기
          </button>
        </div>
      ) : null}

      {error ? (
        <div className={styles.alert} role="alert">
          <p>{error}</p>
          <StudioQueryRetry />
        </div>
      ) : null}

      {statusFilter !== "archived" && legacyItems.length > 0 ? (
        <section className={styles.operationNotice} aria-label="운영 방식 확인 안내">
          <div>
            <strong>운영 방식 확인이 필요한 수업 {legacyItems.length}개</strong>
            <p>기존 일정은 그대로 유지되며, 앞으로의 운영 방식을 설정할 수 있습니다.</p>
          </div>
          <button
            type="button"
            className={v2ButtonClassName({ variant: "outline", size: "sm" })}
            onClick={() => {
              const target = legacyItems[0]
              if (!target) return
              if (!visibleItems.some((item) => item.id === target.id)) {
                setStatusFilter("all")
                setQuery("")
              }
              selectClass(target.id)
              document.getElementById(`studio-class-row-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
            }}
          >
            대상 수업 보기
          </button>
        </section>
      ) : null}

      {items.length === 0 && !error ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>아직 등록된 수업이 없어요.</p>
          <p className={styles.emptyDescription}>첫 수업을 등록하면 학부모가 수업을 확인하고 신청할 수 있어요.</p>
          {navigateLink("/studio/classes/new", "수업 등록", v2ButtonClassName({ variant: "primary" }))}
        </div>
      ) : items.length > 0 ? (
        <>
          <section className={styles.toolbar} aria-label="필터 및 검색">
            <div className={styles.chips} role="group" aria-label="상태 필터">
              {STATUS_FILTERS.map((option) => (
                <V2Chip
                  key={option.value}
                  label={option.label}
                  selected={statusFilter === option.value}
                  onClick={() => setStatusFilter(option.value)}
                />
              ))}
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="수업명 / 선생님명 / 과목 / 지역 검색"
              className={styles.search}
              aria-label="수업 검색"
            />
          </section>

          <div className={styles.content}>
            <section className={styles.list} aria-label="수업 목록">
              <div className={styles.listHead}>
                <strong>수업 {visibleItems.length}개</strong>
                <span>
                  공개 {activeCount} · 비공개 {inactiveCount} · 종료 {archivedCount}
                </span>
              </div>
              {visibleItems.length === 0 ? (
                <div className={styles.listEmpty}>
                  <p className={styles.emptyTitle}>검색 결과가 없어요.</p>
                  <p className={styles.emptyDescription}>다른 키워드로 다시 검색해 보세요.</p>
                </div>
              ) : (
                <ul className={styles.listItems}>
                  {visibleItems.map((item) => {
                    const status = classStatus(item)
                    const active = selected?.id === item.id
                    return (
                      <li key={item.id} id={`studio-class-row-${item.id}`}>
                        <button
                          type="button"
                          className={`${styles.classRow} ${active ? styles.classRowActive : ""}`}
                          aria-current={active ? "true" : undefined}
                          onClick={() => selectClass(item.id)}
                        >
                          <span className={styles.classIcon}>
                            <V2SubjectIcon3D categoryCode={item.subjectCategoryCode} size={28} />
                          </span>
                          <span className={styles.classText}>
                            <span className={styles.classTitle}>{item.title}</span>
                            <span className={styles.classMeta}>
                              {formatStoredTargetGrades(item.targetAge)} ·{" "}
                              {item.archivedAt ? "종료된 수업" : `다음 7일 ${weekCountByClass.get(item.id) ?? 0}회`}
                            </span>
                          </span>
                          <V2StatusBadge tone={status.tone}>{status.label}</V2StatusBadge>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {selected ? renderDetail(selected) : <div className={styles.detailEmpty}>왼쪽에서 수업을 골라 주세요.</div>}
          </div>
        </>
      ) : null}

      {bookingOpen && todayKey ? (
        <BookingTimeDialog
          dateKey={todayKey}
          initialClassId={null}
          todayKey={todayKey}
          onClose={() => {
            setBookingOpen(false)
            router.refresh()
          }}
          onChange={NOOP}
        />
      ) : null}

      {showPopup && popup ? (
        <V2Dialog
          busy={popupBusy}
          title="특정 날짜만 변경하기"
          description="휴무일이나 특별 운영일을 바꿔요. 이 날짜에만 적용되고, 바꾼 내용은 바로 저장돼요."
          footerNote="바꾼 내용은 바로 저장돼요. 이미 들어온 예약은 그대로 남아요."
          onClose={closePopup}
        >
          {popup.error ? (
            <p role="alert" className={styles.ruleError}>
              {popup.error}
            </p>
          ) : (
            <StudioClassScheduleEditor
              key={popupKey}
              operationsOnly
              onPendingChange={setPopupBusy}
              classId={popup.classId}
              month={popup.month}
              days={popup.days}
              initialSelectedDate={popup.date}
              scheduleSlots={weeklySlotDrafts}
              onChangeScheduleSlots={NOOP}
            />
          )}
        </V2Dialog>
      ) : null}
    </div>
  )
}
