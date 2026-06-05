"use client"

import Link from "next/link"
import { useMemo, useState, useActionState } from "react"

import {
  createScheduleBlockAction,
  type CreateScheduleBlockActionState
} from "@/features/studio/actions/create-schedule-block"
import { submitUpdateScheduleBlockTypeAction } from "@/features/studio/actions/update-schedule-block-type"
import type { ClassSummary, StudioScheduleBlockSummary } from "@/shared/lib/db/adapter"

import styles from "./studio-schedule-manager.module.css"

type StudioScheduleManagerProps = {
  items: StudioScheduleBlockSummary[]
  classes: ClassSummary[]
}

const initialCreateState: CreateScheduleBlockActionState = {
  status: "idle",
  message: ""
}

const toLocalYmd = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const startOfLocalDay = (ymd: string) => new Date(`${ymd}T00:00:00`)

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeStyle: "short"
  }).format(new Date(value))

const formatDateLabel = (date: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric"
  }).format(date)

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const

const getTypeBadge = (block: StudioScheduleBlockSummary) => {
  if (block.type === "trial_booked") {
    return { label: "예약 확정", tone: "infoSoft" as const }
  }

  if (block.type === "available") {
    return { label: "예약 가능", tone: "successSoft" as const }
  }

  if (block.type === "blocked") {
    return { label: "차단됨", tone: "neutralSoft" as const }
  }

  if (block.type === "regular") {
    return { label: "정규", tone: "neutralSoft" as const }
  }

  return { label: block.type, tone: "neutralSoft" as const }
}

const getClosedBadge = (block: StudioScheduleBlockSummary) => {
  if (!block.isClosed) {
    return null
  }

  return { label: "마감", tone: "darkSolid" as const }
}

const PROGRAM_TYPE_LABELS: Record<ClassSummary["programType"], string> = {
  trial_class: "체험수업",
  level_test: "레벨테스트"
}

export const StudioScheduleManager = ({ items, classes }: StudioScheduleManagerProps) => {
  const [state, formAction, isPending] = useActionState(createScheduleBlockAction, initialCreateState)
  const classById = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes])
  const todayKey = useMemo(() => toLocalYmd(new Date()), [])
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey)
  const [typeFilter, setTypeFilter] = useState<
    "all" | StudioScheduleBlockSummary["type"] | "closed"
  >("all")

  const weekDates = useMemo(() => {
    const today = new Date()
    const day = today.getDay()
    const mondayOffset = (day + 6) % 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - mondayOffset)

    const result: { key: string; date: Date; weekday: string; label: string }[] = []
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      const key = toLocalYmd(date)
      result.push({
        key,
        date,
        weekday: weekdayLabels[date.getDay()],
        label: formatDateLabel(date)
      })
    }
    return result
  }, [])

  const normalizedItems = useMemo(() => {
    return [...items].sort((a, b) => a.startAt.localeCompare(b.startAt))
  }, [items])

  const itemsForToday = useMemo(() => {
    const start = startOfLocalDay(todayKey)
    const end = new Date(start)
    end.setDate(start.getDate() + 1)
    return normalizedItems.filter((item) => {
      const date = new Date(item.startAt)
      return date >= start && date < end
    })
  }, [normalizedItems, todayKey])

  const itemsForSelectedDay = useMemo(() => {
    const start = startOfLocalDay(selectedDateKey)
    const end = new Date(start)
    end.setDate(start.getDate() + 1)
    const filteredByDate = normalizedItems.filter((item) => {
      const date = new Date(item.startAt)
      return date >= start && date < end
    })

    if (typeFilter === "all") {
      return filteredByDate
    }

    if (typeFilter === "closed") {
      return filteredByDate.filter((item) => item.isClosed)
    }

    return filteredByDate.filter((item) => item.type === typeFilter)
  }, [normalizedItems, selectedDateKey, typeFilter])

  const todayBookedItems = useMemo(
    () => itemsForToday.filter((item) => item.type === "trial_booked"),
    [itemsForToday]
  )

  const todayProgramSummary = useMemo(() => {
    const trialCount = todayBookedItems.filter((item) => {
      const classItem = item.classId ? classById.get(item.classId) : null
      return classItem?.programType === "trial_class"
    }).length

    const levelTestCount = todayBookedItems.filter((item) => {
      const classItem = item.classId ? classById.get(item.classId) : null
      return classItem?.programType === "level_test"
    }).length

    return {
      trialCount,
      levelTestCount
    }
  }, [todayBookedItems, classById])

  const todayMetrics = useMemo(() => {
    const total = itemsForToday.length
    const booked = itemsForToday.filter((item) => item.type === "trial_booked").length
    const available = itemsForToday.filter((item) => item.type === "available").length
    const blocked = itemsForToday.filter((item) => item.type === "blocked").length
    const closed = itemsForToday.filter((item) => item.isClosed).length
    return { total, booked, available, blocked, closed }
  }, [itemsForToday])

  return (
    <div className={styles.layout}>
      <aside className={styles.side}>
        <section className={styles.todayCard} aria-label="오늘 일정 요약">
          <div className={styles.todayHeader}>
            <div className={styles.todayHeaderLeft}>
              <div className={styles.todayIcon} aria-hidden="true">
                +
              </div>
              <div>
                <p className={styles.todayKicker}>TODAY</p>
                <h2 className={styles.todayTitle}>오늘 일정</h2>
              </div>
            </div>
            <div className={styles.todayCount}>
              <span className={styles.todayCountValue}>{todayMetrics.booked}</span>
              <span className={styles.todayCountUnit}>건</span>
            </div>
          </div>

          <p className={styles.todayDescription}>
            {todayProgramSummary.trialCount}건 체험수업 · {todayProgramSummary.levelTestCount}건 레벨테스트 ·
            예약 가능 {todayMetrics.available} · 차단 {todayMetrics.blocked}
          </p>

          <div className={styles.todayMetaRow}>
            <div className={styles.todayMetaItem}>
              <span className={styles.todayMetaLabel}>오늘 전체 슬롯</span>
              <span className={styles.todayMetaValue}>{todayMetrics.total}</span>
            </div>
            <div className={styles.todayMetaItem}>
              <span className={styles.todayMetaLabel}>마감</span>
              <span className={styles.todayMetaValue}>{todayMetrics.closed}</span>
            </div>
          </div>

          <div className={styles.todayActions}>
            <Link href="/studio/applications" prefetch={false} className={styles.buttonSecondary}>
              신청/상담 관리로 이동
            </Link>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>예약 가능 시간대 생성</h2>
              <p className={styles.cardDescription}>
                프로그램과 날짜/시간/정원을 입력해 `available` 슬롯을 생성합니다.
              </p>
            </div>
          </div>

          <form action={formAction} className={styles.form}>
            <label className={styles.field}>
              <span className={styles.label}>연결할 프로그램</span>
              <select
                name="classId"
                required
                disabled={isPending || classes.length === 0}
                className={styles.input}
                defaultValue=""
              >
                <option value="" disabled>
                  프로그램을 선택해 주세요
                </option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} ({PROGRAM_TYPE_LABELS[item.programType]})
                  </option>
                ))}
              </select>
              {classes.length === 0 ? (
                <span className={styles.helperText}>먼저 /studio/classes에서 프로그램을 등록해 주세요.</span>
              ) : null}
            </label>

            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.label}>날짜</span>
                <input name="date" type="date" required disabled={isPending} className={styles.input} />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>시작</span>
                <input name="startTime" type="time" required disabled={isPending} className={styles.input} />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>종료</span>
                <input name="endTime" type="time" required disabled={isPending} className={styles.input} />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>정원</span>
                <input
                  name="capacity"
                  type="number"
                  min={1}
                  defaultValue={1}
                  required
                  disabled={isPending}
                  className={styles.input}
                />
              </label>
            </div>

            {state.message ? (
              <div className={`${styles.formMessage} ${state.status === "error" ? styles.formMessageError : ""}`}>
                {state.message}
              </div>
            ) : null}

            <button type="submit" disabled={isPending} className={styles.buttonPrimary}>
              {isPending ? "생성 중..." : "예약 가능 슬롯 생성"}
            </button>
          </form>
        </section>
      </aside>

      <section className={styles.main}>
        <div className={styles.boardHeader}>
          <div>
            <h2 className={styles.boardTitle}>일정 보드</h2>
            <p className={styles.boardDescription}>주간 날짜를 선택해 해당 날짜의 슬롯을 확인하고 상태를 관리해요.</p>
          </div>
          <div className={styles.boardHeaderRight}>
            <button
              type="button"
              className={styles.buttonGhost}
              onClick={() => setSelectedDateKey(todayKey)}
            >
              오늘로 이동
            </button>
          </div>
        </div>

        <section className={styles.toolbar} aria-label="날짜 선택">
          <div className={styles.datePills} role="tablist" aria-label="이번 주 날짜">
            {weekDates.map((day) => {
              const isSelected = day.key === selectedDateKey
              const isToday = day.key === todayKey
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setSelectedDateKey(day.key)}
                  className={`${styles.datePill} ${isSelected ? styles.datePillActive : ""}`}
                >
                  <span className={styles.datePillTop}>
                    {day.weekday}
                    {isToday && !isSelected ? <span className={styles.todayMark}>오늘</span> : null}
                  </span>
                  <span className={styles.datePillBottom}>{day.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className={styles.toolbar} aria-label="필터">
          <div className={styles.pills} role="tablist" aria-label="일정 유형 필터">
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              className={`${styles.pill} ${typeFilter === "all" ? styles.pillActive : ""}`}
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("trial_booked")}
              className={`${styles.pill} ${typeFilter === "trial_booked" ? styles.pillActive : ""}`}
            >
              예약 확정
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("available")}
              className={`${styles.pill} ${typeFilter === "available" ? styles.pillActive : ""}`}
            >
              예약 가능
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("blocked")}
              className={`${styles.pill} ${typeFilter === "blocked" ? styles.pillActive : ""}`}
            >
              차단
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("closed")}
              className={`${styles.pill} ${typeFilter === "closed" ? styles.pillActive : ""}`}
            >
              마감
            </button>
          </div>
          <div className={styles.filteredCount}>표시 {itemsForSelectedDay.length}건</div>
        </section>

        {itemsForSelectedDay.length === 0 ? (
          <section className={styles.emptyCard} aria-label="빈 상태">
            <div className={styles.emptyIcon} aria-hidden="true">
              +
            </div>
            <p className={styles.emptyTitle}>선택한 날짜에 등록된 일정이 없어요.</p>
            <p className={styles.emptyDescription}>
              예약 가능 시간대를 추가하거나, 신청 관리에서 확정된 일정을 확인해 주세요.
            </p>
            <div className={styles.emptyActions}>
              <Link href="/studio/applications" prefetch={false} className={styles.buttonPrimaryInline}>
                신청 관리로 이동
              </Link>
            </div>
          </section>
        ) : (
          <div className={styles.timeline} aria-label="일정 목록">
            {itemsForSelectedDay.map((item) => {
              const classItem = item.classId ? classById.get(item.classId) : null
              const typeBadge = getTypeBadge(item)
              const closedBadge = getClosedBadge(item)
              const programLabel = classItem ? PROGRAM_TYPE_LABELS[classItem.programType] : null

              return (
                <article key={item.id} className={styles.timelineItem}>
                  <div className={styles.timeCol}>
                    <div className={styles.timeText}>{formatTime(item.startAt)}</div>
                    <div className={styles.timeSub}>~ {formatTime(item.endAt)}</div>
                  </div>

                  <div className={styles.eventCard}>
                    <div className={styles.eventTop}>
                      <div className={styles.badgeRow}>
                        <Badge label={typeBadge.label} tone={typeBadge.tone} />
                        {closedBadge ? <Badge label={closedBadge.label} tone={closedBadge.tone} /> : null}
                        {programLabel ? <span className={styles.programPill}>{programLabel}</span> : null}
                      </div>
                      <div className={styles.eventActions}>
                        {item.type === "trial_booked" ? null : (
                          <form action={submitUpdateScheduleBlockTypeAction}>
                            <input type="hidden" name="scheduleBlockId" value={item.id} />
                            <input
                              type="hidden"
                              name="nextType"
                              value={item.type === "available" ? "blocked" : "available"}
                            />
                            <button type="submit" className={styles.smallButton} disabled={isPending}>
                              {item.type === "available" ? "차단" : "복원"}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>

                    <div className={styles.eventBody}>
                      <strong className={styles.eventTitle}>
                        {classItem?.title ?? "미연결 슬롯"}
                      </strong>

                      <div className={styles.metaGrid}>
                        <div className={styles.metaRow}>
                          <span className={styles.metaLabel}>신청</span>
                          <span className={styles.metaValue}>{item.appliedCount}명</span>
                        </div>
                        <div className={styles.metaRow}>
                          <span className={styles.metaLabel}>남은</span>
                          <span className={styles.metaValue}>{item.remainingCount}명</span>
                        </div>
                        <div className={styles.metaRow}>
                          <span className={styles.metaLabel}>정원</span>
                          <span className={styles.metaValue}>{item.capacity}명</span>
                        </div>
                        <div className={styles.metaRow}>
                          <span className={styles.metaLabel}>지역</span>
                          <span className={styles.metaValue}>{classItem?.region ?? "-"}</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.eventFooter}>
                      <div className={styles.footerHint}>
                        {item.classId ? "프로그램 연결됨" : "legacy(미연결)"} · 슬롯 ID {item.id.slice(0, 6)}
                      </div>
                      <Link href="/studio/applications" prefetch={false} className={styles.linkButton}>
                        신청 보기
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

const Badge = ({
  label,
  tone
}: {
  label: string
  tone:
    | "successSoft"
    | "warningSoft"
    | "infoSoft"
    | "neutralSoft"
    | "dangerSoft"
    | "darkSolid"
    | "successSolid"
}) => {
  return <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>{label}</span>
}
