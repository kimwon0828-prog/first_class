"use client"

import { getSeoulTodayKey } from "@/features/studio/lib/studio-schedule-month"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

import { createStudioClassScheduleAction } from "@/features/studio/actions/create-studio-class-schedule"
import { deleteStudioClassScheduleAction } from "@/features/studio/actions/delete-studio-class-schedule"
import {
  addMinutesToTime,
  format24HourTime,
  formatDateHeadline,
} from "@/features/studio/lib/class-schedule-rule-utils"
import {
  closeStudioClassSchedulesForDateAction,
  closeStudioClassScheduleAction,
  hideStudioClassScheduleAction,
  publishStudioClassScheduleAction,
  reopenStudioClassSchedulesForDateAction,
  reopenStudioClassScheduleAction,
  updateStudioClassScheduleCapacityAction
} from "@/features/studio/actions/update-studio-class-schedule"
import type { StudioScheduleCalendarDay } from "@/shared/lib/db/adapter"

import { v2ButtonClassName } from "./v2/v2-button"
import { V2PlusIcon } from "./v2/v2-icons"
import { V2StatusBadge } from "./v2/v2-status-badge"
import styles from "./studio-schedule-day-panel.module.css"
import { useStudioNavigationPath } from "@/features/studio/ui/studio-navigation-provider"

type StudioScheduleDayPanelProps = {
  classId: string
  onPendingChange?: (pending: boolean) => void
  selectedDate: string
  day: StudioScheduleCalendarDay | null
  classManagementHref?: string
}

export const StudioScheduleDayPanel = ({
  classId,
  onPendingChange,
  selectedDate,
  day,
  classManagementHref: internalClassManagementHref = "/studio/classes"
}: StudioScheduleDayPanelProps) => {
  const classManagementHref = useStudioNavigationPath(internalClassManagementHref)
  const router = useRouter()
  const [extraStartTime, setExtraStartTime] = useState("")
  const [extraLessonMinutes, setExtraLessonMinutes] = useState("60")
  const [extraCapacity, setExtraCapacity] = useState("3")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  useEffect(() => { onPendingChange?.(isPending) }, [isPending, onPendingChange])
  const isPast = selectedDate < getSeoulTodayKey()

  const oneTimeItems = day?.items.filter((item) => item.scheduleType === "one_time") ?? []
  const hasWeeklyItems = Boolean(day?.items.some((item) => item.scheduleType === "weekly"))
  const isDateClosed = oneTimeItems.length > 0 && oneTimeItems.every((item) => item.bookingStatus === "closed")

  const getItemStatusText = (status: "open" | "closed" | "hidden") => {
    if (status === "hidden") {
      return "예약 화면 숨김"
    }

    return status === "closed" ? "마감" : "모집 중"
  }

  const getItemStatusTone = (status: "open" | "closed" | "hidden", bookingStatus: "open" | "closed" | "hidden") => {
    if (status === "hidden") {
      return "gray" as const
    }

    return status === "closed" || bookingStatus === "closed" ? "amber" as const : "green" as const
  }

  if (!day) {
    return (
      <section className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h3 className={styles.title}>날짜 상세</h3>
            <p className={styles.description}>캘린더에서 날짜를 선택하면 해당 날짜의 예약 가능 일정을 볼 수 있습니다.</p>
          </div>
        </div>
      </section>
    )
  }

  const closeDateDisabled = isPending || isPast || oneTimeItems.length === 0 || isDateClosed || hasWeeklyItems
  const reopenDateDisabled = isPending || isPast || oneTimeItems.length === 0 || !isDateClosed || hasWeeklyItems

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h3 className={styles.title}>{formatDateHeadline(selectedDate)}</h3>
          <p className={styles.description}>이 날짜의 예약 가능 시간 · 총 {day.items.length}타임</p>
        </div>
        {/* 날짜 전체 마감 / 다시 열기는 지금 상태에 맞는 하나만 보인다. 실행 조건은 그대로다. */}
        {isDateClosed ? (
          <button
            type="button"
            className={v2ButtonClassName({ variant: "outline", size: "sm" })}
            disabled={reopenDateDisabled}
            onClick={() =>
              startTransition(async () => {
                setMessage(null)
                setError(null)
                try {
                  await reopenStudioClassSchedulesForDateAction({ classId, specificDate: selectedDate })
                  setMessage("이 날짜의 one_time 일정을 다시 열었습니다.")
                  router.refresh()
                } catch (actionError) {
                  setError(actionError instanceof Error ? actionError.message : "날짜 전체 다시 열기에 실패했습니다.")
                }
              })
            }
          >
            날짜 전체 다시 열기
          </button>
        ) : (
          <button
            type="button"
            className={v2ButtonClassName({ variant: "outline", size: "sm" })}
            disabled={closeDateDisabled}
            onClick={() =>
              startTransition(async () => {
                setMessage(null)
                setError(null)
                try {
                  await closeStudioClassSchedulesForDateAction({ classId, specificDate: selectedDate })
                  setMessage("이 날짜의 one_time 일정을 모두 마감했습니다.")
                  router.refresh()
                } catch (actionError) {
                  setError(actionError instanceof Error ? actionError.message : "날짜 전체 마감에 실패했습니다.")
                }
              })
            }
          >
            날짜 전체 마감
          </button>
        )}
      </div>
      {hasWeeklyItems ? (
        <p className={styles.warningText}>
          반복 일정이 포함된 날짜입니다. 반복 일정은 수업 기본 일정에서 관리해 주세요.
        </p>
      ) : null}

      {message ? <p className={styles.message} role="status">{message}</p> : null}
      {error ? <p className={styles.errorText} role="alert">{error}</p> : null}

      {day.items.map((item) => (
        <article key={item.classScheduleId} className={styles.timeCard}>
          <div className={styles.timeHeader}>
            <strong className={styles.timeHeadline}>
              {format24HourTime(item.startTime)} – {format24HourTime(item.endTime)}
            </strong>
            <V2StatusBadge tone="gray">{item.scheduleType === "weekly" ? "반복 일정" : "이 날만"}</V2StatusBadge>
            <span className={styles.timeMeta}>
              신청 {item.activeReservationCount}/{item.capacity} · 남은 자리 {item.remainingCapacity}명
            </span>
            <V2StatusBadge tone={getItemStatusTone(item.status, item.bookingStatus)}>
              {item.bookingStatus === "open" && item.status === "closed" ? "정원 마감" : getItemStatusText(item.status)}
            </V2StatusBadge>
          </div>

          {item.scheduleType === "one_time" ? (
            <div className={styles.timeActions}>
              <span className={styles.capacityLabel}>정원</span>
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepperButton}
                  aria-label={`${format24HourTime(item.startTime)} 정원 1명 줄이기`}
                  disabled={isPending || isPast || item.capacity <= item.minimumCapacity}
                  onClick={() =>
                    startTransition(async () => {
                      setMessage(null)
                      setError(null)
                      try {
                        await updateStudioClassScheduleCapacityAction({
                          classScheduleId: item.classScheduleId,
                          capacity: item.capacity - 1
                        })
                        setMessage("정원을 수정했습니다.")
                        router.refresh()
                      } catch (actionError) {
                        setError(actionError instanceof Error ? actionError.message : "정원 수정에 실패했습니다.")
                      }
                    })
                  }
                >
                  −
                </button>
                <span className={styles.stepperValue}>{item.capacity}명</span>
                <button
                  type="button"
                  className={styles.stepperButton}
                  aria-label={`${format24HourTime(item.startTime)} 정원 1명 늘리기`}
                  disabled={isPending || isPast}
                  onClick={() =>
                    startTransition(async () => {
                      setMessage(null)
                      setError(null)
                      try {
                        await updateStudioClassScheduleCapacityAction({
                          classScheduleId: item.classScheduleId,
                          capacity: item.capacity + 1
                        })
                        setMessage("정원을 수정했습니다.")
                        router.refresh()
                      } catch (actionError) {
                        setError(actionError instanceof Error ? actionError.message : "정원 수정에 실패했습니다.")
                      }
                    })
                  }
                >
                  +
                </button>
              </div>
              {item.bookingStatus === "open" ? (
                <button
                  type="button"
                  className={v2ButtonClassName({ variant: "outline", size: "sm" })}
                  disabled={isPending || isPast}
                  onClick={() =>
                    startTransition(async () => {
                      setMessage(null)
                      setError(null)
                      try {
                        await closeStudioClassScheduleAction(item.classScheduleId)
                        setMessage("해당 일정의 모집을 마감했습니다.")
                        router.refresh()
                      } catch (actionError) {
                        setError(actionError instanceof Error ? actionError.message : "마감 처리에 실패했습니다.")
                      }
                    })
                  }
                >
                  마감
                </button>
              ) : null}
              {item.bookingStatus === "closed" ? (
                <button
                  type="button"
                  className={v2ButtonClassName({ variant: "outline", size: "sm" })}
                  disabled={isPending || isPast}
                  onClick={() =>
                    startTransition(async () => {
                      setMessage(null)
                      setError(null)
                      try {
                        await reopenStudioClassScheduleAction(item.classScheduleId)
                        setMessage("해당 일정의 모집을 다시 열었습니다.")
                        router.refresh()
                      } catch (actionError) {
                        setError(actionError instanceof Error ? actionError.message : "모집 재개에 실패했습니다.")
                      }
                    })
                  }
                >
                  다시 모집
                </button>
              ) : null}
              {item.bookingStatus === "hidden" ? (
                <button
                  type="button"
                  className={v2ButtonClassName({ variant: "outline", size: "sm" })}
                  disabled={isPending || isPast}
                  onClick={() =>
                    startTransition(async () => {
                      setMessage(null)
                      setError(null)
                      try {
                        await publishStudioClassScheduleAction(item.classScheduleId)
                        setMessage("해당 일정을 다시 공개했습니다.")
                        router.refresh()
                      } catch (actionError) {
                        setError(actionError instanceof Error ? actionError.message : "일정 공개에 실패했습니다.")
                      }
                    })
                  }
                >
                  다시 공개
                </button>
              ) : null}
              {item.bookingStatus !== "hidden" ? (
                <button
                  type="button"
                  className={v2ButtonClassName({ variant: "ghost", size: "sm" })}
                  disabled={isPending || isPast}
                  onClick={() =>
                    startTransition(async () => {
                      setMessage(null)
                      setError(null)
                      try {
                        await hideStudioClassScheduleAction(item.classScheduleId)
                        setMessage("해당 일정을 예약 화면에서 숨겼습니다.")
                        router.refresh()
                      } catch (actionError) {
                        setError(actionError instanceof Error ? actionError.message : "숨김 처리에 실패했습니다.")
                      }
                    })
                  }
                >
                  예약 화면에서 숨기기
                </button>
              ) : null}
              {!item.hasApplicationHistory ? (
                <button
                  type="button"
                  className={v2ButtonClassName({ variant: "ghost", size: "sm", className: styles.dangerButton })}
                  disabled={isPending || isPast}
                  onClick={() =>
                    startTransition(async () => {
                      setMessage(null)
                      setError(null)
                      try {
                        await deleteStudioClassScheduleAction(item.classScheduleId)
                        setMessage("일정을 영구 삭제했습니다.")
                        router.refresh()
                      } catch (actionError) {
                        setError(actionError instanceof Error ? actionError.message : "일정 삭제에 실패했습니다.")
                      }
                    })
                  }
                >
                  영구 삭제
                </button>
              ) : null}
            </div>
          ) : (
            <div className={styles.timeActions}>
              <p className={styles.hint}>반복 일정은 수업 관리에서 수정할 수 있습니다.</p>
              <a href={classManagementHref} className={v2ButtonClassName({ variant: "outline", size: "sm" })}>
                수업 관리로 이동
              </a>
            </div>
          )}

          {item.hasApplicationHistory ? (
            <p className={styles.hint}>
              신청 이력이 있어 삭제할 수 없어요. 새 예약을 막으려면 마감하거나 숨겨 주세요.
            </p>
          ) : null}
        </article>
      ))}

      <section className={styles.extraCard} aria-labelledby={`extra-time-${selectedDate}`}>
        <strong id={`extra-time-${selectedDate}`} className={styles.extraTitle}>이 날짜에만 시간 추가</strong>
        <div className={styles.extraRow}>
          <input
            className={`${styles.input} ${styles.timeInput}`}
            aria-label="추가할 시작 시간"
            type="time"
            lang="en-GB"
            value={extraStartTime}
            onChange={(event) => setExtraStartTime(event.target.value)}
            disabled={isPending || isPast}
          />
          <label className={`${styles.unitInput} ${styles.minutesInput}`}>
            <input
              aria-label="수업 길이(분)"
              type="number"
              min={30}
              step={10}
              value={extraLessonMinutes}
              onChange={(event) => setExtraLessonMinutes(event.target.value)}
              disabled={isPending || isPast}
            />
            <span>분</span>
          </label>
          <label className={`${styles.unitInput} ${styles.capacityInput}`}>
            <input
              aria-label="정원"
              type="number"
              min={1}
              value={extraCapacity}
              onChange={(event) => setExtraCapacity(event.target.value)}
              disabled={isPending || isPast}
            />
            <span>명</span>
          </label>
          <button
            type="button"
            className={v2ButtonClassName({ variant: "tonal", size: "sm" })}
            disabled={isPending || isPast}
            onClick={() =>
              startTransition(async () => {
                setMessage(null)
                setError(null)

                const endTime = addMinutesToTime(extraStartTime, Number(extraLessonMinutes))
                if (!extraStartTime || !endTime || Number(extraCapacity) < 1) {
                  setError("시작 시간, 수업 길이, 정원을 정확히 입력해 주세요.")
                  return
                }

                const formData = new FormData()
                formData.set("classId", classId)
                formData.set("specificDate", selectedDate)
                formData.set("startTime", extraStartTime)
                formData.set("endTime", endTime)
                formData.set("capacity", extraCapacity)

                const result = await createStudioClassScheduleAction(undefined, formData)
                if (result.status === "error") {
                  setError(result.message)
                  return
                }

                setMessage(result.message)
                setExtraStartTime("")
                setExtraLessonMinutes("60")
                setExtraCapacity("3")
                router.refresh()
              })
            }
          >
            <V2PlusIcon size={16} />
            추가
          </button>
        </div>
        <p className={styles.hint}>같은 날짜에 같은 시작 시간이 이미 있으면 추가되지 않아요. 반복 일정은 체험 운영(C)에서 바꿔요.</p>
      </section>
    </section>
  )
}
