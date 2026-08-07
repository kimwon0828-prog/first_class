"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { createStudioClassScheduleAction } from "@/features/studio/actions/create-studio-class-schedule"
import { deleteStudioClassScheduleAction } from "@/features/studio/actions/delete-studio-class-schedule"
import {
  addMinutesToTime,
  formatDateHeadline,
  formatKoreanMeridiemTime
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

import styles from "./studio-schedule-day-panel.module.css"

type StudioScheduleDayPanelProps = {
  classId: string
  selectedDate: string
  day: StudioScheduleCalendarDay | null
  classManagementHref?: string
}

export const StudioScheduleDayPanel = ({
  classId,
  selectedDate,
  day,
  classManagementHref = "/studio/classes"
}: StudioScheduleDayPanelProps) => {
  const router = useRouter()
  const [extraStartTime, setExtraStartTime] = useState("")
  const [extraLessonMinutes, setExtraLessonMinutes] = useState("60")
  const [extraCapacity, setExtraCapacity] = useState("3")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isPast = selectedDate < new Date().toISOString().slice(0, 10)

  const oneTimeItems = day?.items.filter((item) => item.scheduleType === "one_time") ?? []
  const hasWeeklyItems = Boolean(day?.items.some((item) => item.scheduleType === "weekly"))
  const isDateClosed = oneTimeItems.length > 0 && oneTimeItems.every((item) => item.bookingStatus === "closed")

  const getItemStatusText = (status: "open" | "closed" | "hidden") => {
    if (status === "hidden") {
      return "예약 화면 숨김"
    }

    return status === "closed" ? "마감" : "모집 중"
  }

  const getItemStatusClassName = (status: "open" | "closed" | "hidden") => {
    if (status === "hidden") {
      return styles.metaBadgeMuted
    }

    return status === "closed" ? styles.metaBadgeWarning : styles.metaBadge
  }

  if (!day) {
    return (
      <section className={styles.panel}>
        <div>
          <h2 className={styles.title}>날짜 상세</h2>
          <p className={styles.description}>캘린더에서 날짜를 선택하면 해당 날짜의 예약 가능 일정을 볼 수 있습니다.</p>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{formatDateHeadline(selectedDate)}</h2>
          <p className={styles.description}>이 날짜의 예약 가능 시간 · 총 {day.items.length}타임</p>
        </div>
      </div>

      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.buttonSecondary}
          disabled={isPending || isPast || oneTimeItems.length === 0 || isDateClosed || hasWeeklyItems}
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
        <button
          type="button"
          className={styles.buttonSecondary}
          disabled={isPending || isPast || oneTimeItems.length === 0 || !isDateClosed || hasWeeklyItems}
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
      </div>
      {hasWeeklyItems ? (
        <p className={styles.warningText}>
          반복 일정이 포함된 날짜입니다. 반복 일정은 수업 기본 일정에서 관리해 주세요.
        </p>
      ) : null}

      {message ? <p className={styles.message}>{message}</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}

      <section className={styles.extraCard}>
        <div>
          <strong className={styles.fieldLabel}>이 날짜에만 시간 추가</strong>
          <p className={styles.hint}>같은 날짜의 같은 시작 시간이 이미 있으면 추가되지 않습니다.</p>
        </div>
        <div className={styles.extraGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>시작 시간</span>
            <input
              className={styles.input}
              type="time"
              value={extraStartTime}
              onChange={(event) => setExtraStartTime(event.target.value)}
              disabled={isPending || isPast}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>수업 길이</span>
            <input
              className={styles.input}
              type="number"
              min={30}
              step={10}
              value={extraLessonMinutes}
              onChange={(event) => setExtraLessonMinutes(event.target.value)}
              disabled={isPending || isPast}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>정원</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={extraCapacity}
              onChange={(event) => setExtraCapacity(event.target.value)}
              disabled={isPending || isPast}
            />
          </label>
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.buttonPrimary}
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
            추가 버튼
          </button>
        </div>
      </section>

      <div className={styles.panel}>
        {day.items.map((item) => (
          <article key={item.classScheduleId} className={styles.timeCard}>
            <div className={styles.timeHeader}>
              <div>
                <strong className={styles.timeHeadline}>
                  {formatKoreanMeridiemTime(item.startTime)} ~ {formatKoreanMeridiemTime(item.endTime)}
                </strong>
                <div className={styles.badgeRow}>
                  <span className={styles.metaBadge}>신청 {item.activeReservationCount}건</span>
                  {item.activeReservationCount > 0 ? <span className={styles.metaBadgeMuted}>수정 잠금</span> : null}
                  <span className={styles.metaBadgeMuted}>{item.scheduleType === "weekly" ? "반복 일정" : "이 날만"}</span>
                  {item.bookingStatus === "closed" ? <span className={styles.metaBadgeWarning}>마감</span> : null}
                  {item.bookingStatus === "hidden" ? <span className={styles.metaBadgeMuted}>예약 화면 숨김</span> : null}
                </div>
              </div>
              <span className={getItemStatusClassName(item.status)}>{getItemStatusText(item.status)}</span>
            </div>

            {item.scheduleType === "one_time" ? (
              <>
                <div className={styles.capacityRow}>
                  <div>
                    <p className={styles.description}>정원 {item.capacity}명 · 남은 자리 {item.remainingCapacity}명</p>
                  </div>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      className={styles.stepperButton}
                      disabled={isPending || isPast || item.capacity <= Math.max(1, item.activeReservationCount)}
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
                      -
                    </button>
                    <span className={styles.stepperValue}>{item.capacity}명</span>
                    <button
                      type="button"
                      className={styles.stepperButton}
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
                </div>

                <div className={styles.timeActions}>
                  {item.bookingStatus === "open" ? (
                    <button
                      type="button"
                      className={styles.buttonSecondary}
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
                      닫기
                    </button>
                  ) : null}
                  {item.bookingStatus === "closed" ? (
                    <button
                      type="button"
                      className={styles.buttonSecondary}
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
                      className={styles.buttonSecondary}
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
                      className={styles.buttonSecondary}
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
                  {item.activeReservationCount === 0 ? (
                    <button
                      type="button"
                      className={styles.buttonDanger}
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
              </>
            ) : (
              <div className={styles.timeActions}>
                <p className={styles.hint}>반복 일정은 수업 관리에서 수정할 수 있습니다.</p>
                <a href={classManagementHref} className={styles.buttonSecondary}>
                  수업 관리로 이동
                </a>
              </div>
            )}

            {item.activeReservationCount > 0 ? (
              <p className={styles.warningText}>
                예약자가 있어 영구 삭제할 수 없습니다. 신규 예약을 중단하려면 예약 화면에서 숨겨주세요.
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
