"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"

import {
  cancelMyApplicationAction,
  type CancelMyApplicationActionResult
} from "@/features/applications/actions/cancel-my-application"
import { resolveApplicationStatusDisplay } from "@/features/applications/lib/application-status-display"
import { CancelConfirmDialog } from "@/features/applications/ui/cancel-confirm-dialog"
import type { MyApplicationListItem } from "@/features/applications/ui/my-applications-client"
import styles from "./my-application-list.module.css"

type MyApplicationListProps = {
  items: MyApplicationListItem[]
  onCanceled?: () => Promise<void> | void
}

const canShowCancelButton = (item: MyApplicationListItem) => {
  if (item.registrationStatus === "enrolled") {
    return false
  }

  return item.status === "new" || item.status === "reviewing" || item.status === "confirmed"
}

const resolveAcademyLabel = (item: MyApplicationListItem) => {
  const academyName = item.academyName?.trim() || null

  if (academyName) {
    return academyName
  }

  return item.teacherDisplayName?.trim() || "정보 준비 중"
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
  const hours = date.getHours()
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  const meridiem = hours < 12 ? "오전" : "오후"
  const displayHour = hours % 12 || 12
  const dateText = `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]})`
  const timeText = `${meridiem} ${displayHour}:${minutes}`
  const currentYear = new Date().getFullYear()

  if (date.getFullYear() !== currentYear) {
    return `${date.getFullYear()}년 ${dateText} ${timeText}`
  }

  return `${dateText} ${timeText}`
}

const formatShortDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
  return `${date.getMonth() + 1}/${date.getDate()} (${weekdays[date.getDay()]})`
}

const formatCancelPromptDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]})`
}

const getComparableScheduleAt = (item: MyApplicationListItem) => {
  const value = item.confirmedSlotAt ?? item.requestedSlotAt ?? null
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

const getSortableTimestamp = (item: MyApplicationListItem) => {
  const iso = getComparableScheduleAt(item)
  if (!iso) {
    return null
  }

  return new Date(iso).getTime()
}

const getDdayLabel = (value: string | null) => {
  if (!value) {
    return null
  }

  const target = new Date(value)
  if (Number.isNaN(target.getTime())) {
    return null
  }

  const today = new Date()
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const diffDays = Math.floor((targetDate - base) / (24 * 60 * 60 * 1000))

  if (diffDays <= 0) {
    return "오늘"
  }

  if (diffDays === 1) {
    return "내일"
  }

  return `D-${diffDays}`
}

const compareAscending = (left: MyApplicationListItem, right: MyApplicationListItem) => {
  const leftTime = getSortableTimestamp(left)
  const rightTime = getSortableTimestamp(right)

  if (leftTime == null && rightTime == null) {
    return 0
  }

  if (leftTime == null) {
    return 1
  }

  if (rightTime == null) {
    return -1
  }

  return leftTime - rightTime
}

const compareDescending = (left: MyApplicationListItem, right: MyApplicationListItem) => {
  const leftTime = getSortableTimestamp(left)
  const rightTime = getSortableTimestamp(right)

  if (leftTime == null && rightTime == null) {
    return 0
  }

  if (leftTime == null) {
    return 1
  }

  if (rightTime == null) {
    return -1
  }

  return rightTime - leftTime
}

const resolveScheduleLabel = (item: MyApplicationListItem) => {
  const confirmedAt = item.confirmedSlotAt ? formatDateTime(item.confirmedSlotAt) : null
  const requestedAt = item.requestedSlotAt ? formatDateTime(item.requestedSlotAt) : null
  const selectedLabel = item.selectedScheduleLabel?.trim() ? item.selectedScheduleLabel.trim() : null
  const requestedValue = requestedAt ?? selectedLabel ?? "일정 협의 필요"

  if (item.status === "completed") {
    return {
      label: "수업일",
      primaryValue: confirmedAt ?? requestedValue
    }
  }

  if (item.status === "confirmed" && confirmedAt) {
    return {
      label: "확정 일정",
      primaryValue: confirmedAt
    }
  }

  if (item.status === "confirmed") {
    return {
      label: "희망 일정",
      primaryValue: requestedValue
    }
  }

  return {
    label: "희망 일정",
    primaryValue: requestedValue
  }
}

export const MyApplicationList = ({ items, onCanceled }: MyApplicationListProps) => {
  const [isPending, startTransition] = useTransition()
  const [dialogItem, setDialogItem] = useState<MyApplicationListItem | null>(null)
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null)

  const groupedItems = useMemo(() => {
    const next = {
      upcoming: [] as MyApplicationListItem[],
      pending: [] as MyApplicationListItem[],
      past: [] as MyApplicationListItem[]
    }

    for (const item of items) {
      const statusDisplay = resolveApplicationStatusDisplay({
        status: item.status,
        scheduledAt: getComparableScheduleAt(item),
        registrationStatus: item.registrationStatus
      })
      next[statusDisplay.group].push(item)
    }

    next.upcoming.sort(compareAscending)
    next.pending.sort(compareAscending)
    next.past.sort(compareDescending)

    return next
  }, [items])

  const handleCancel = (item: MyApplicationListItem) => {
    setPendingApplicationId(item.id)
    startTransition(async () => {
      const result: CancelMyApplicationActionResult = await cancelMyApplicationAction(item.id)
      window.alert(result.message)

      if (result.status === "success") {
        await onCanceled?.()
      }

      setPendingApplicationId(null)
    })
  }

  const renderPrimaryCard = (item: MyApplicationListItem) => {
    const schedule = resolveScheduleLabel(item)
    const classTitle = item.classTitle ?? "수업 정보 없음"
    const statusDisplay = resolveApplicationStatusDisplay({
      status: item.status,
      scheduledAt: getComparableScheduleAt(item),
      registrationStatus: item.registrationStatus
    })
    const showCancelButton = canShowCancelButton(item)
    const academyLabel = resolveAcademyLabel(item)
    const ddayLabel =
      statusDisplay.group === "upcoming" && item.confirmedSlotAt ? getDdayLabel(item.confirmedSlotAt) : null
    const showRequestedLabel = !item.confirmedSlotAt && Boolean(schedule.primaryValue)
    const isCanceling = isPending && pendingApplicationId === item.id

    return (
      <article key={item.id} className={styles.card}>
        {ddayLabel ? <p className={styles.dday}>{ddayLabel}</p> : null}
        {showRequestedLabel ? <p className={styles.scheduleEyebrow}>{schedule.label}</p> : null}
        <p className={styles.scheduleText}>{schedule.primaryValue}</p>
        <h2 className={styles.classTitle}>{classTitle}</h2>
        <p className={styles.academyName}>{academyLabel}</p>
        <p className={styles.childMeta}>
          {item.childName} · {item.childGrade}
        </p>

        <div className={styles.cardActions}>
          <span
            className={`${styles.statusBadge} ${
              statusDisplay.tone === "active" ? styles.statusBadgeActive : styles.statusBadgeMuted
            }`}
          >
            {statusDisplay.label}
          </span>
          <div className={styles.actionButtons}>
            <Link href={`/classes/${item.classId}`} className={styles.ghostButton}>
              상세
            </Link>
            {showCancelButton ? (
              <button
                type="button"
                className={styles.dangerButton}
                disabled={isCanceling}
                onClick={() => {
                  if (item.status === "confirmed") {
                    setDialogItem(item)
                    return
                  }

                  handleCancel(item)
                }}
              >
                {isCanceling ? "취소 처리 중..." : "취소"}
              </button>
            ) : null}
          </div>
        </div>

        {item.registrationStatus === "enrolled" ? (
          <p className={styles.enrolledText}>등록이 완료된 신청이에요</p>
        ) : null}
      </article>
    )
  }

  return (
    <>
      <section className={styles.sections} aria-label="신청 내역">
        {groupedItems.upcoming.length > 0 ? (
          <section className={styles.sectionBlock} aria-labelledby="upcoming-section-title">
            <header className={styles.sectionHeader}>
              <h2 id="upcoming-section-title" className={styles.sectionTitle}>
                다가오는 체험
              </h2>
              <span className={styles.sectionCount}>{groupedItems.upcoming.length}건</span>
            </header>
            <div className={styles.cardList}>{groupedItems.upcoming.map(renderPrimaryCard)}</div>
          </section>
        ) : null}

        {groupedItems.pending.length > 0 ? (
          <section className={styles.sectionBlock} aria-labelledby="pending-section-title">
            <header className={styles.sectionHeader}>
              <h2 id="pending-section-title" className={styles.sectionTitle}>
                확인 중
              </h2>
              <span className={styles.sectionCount}>{groupedItems.pending.length}건</span>
            </header>
            <div className={styles.cardList}>{groupedItems.pending.map(renderPrimaryCard)}</div>
          </section>
        ) : null}

        {groupedItems.past.length > 0 ? (
          <details className={styles.pastDetails}>
            <summary className={styles.pastSummary}>지난 내역 {groupedItems.past.length}건</summary>
            <div className={styles.pastList}>
              {groupedItems.past.map((item) => {
                const statusDisplay = resolveApplicationStatusDisplay({
                  status: item.status,
                  scheduledAt: getComparableScheduleAt(item),
                  registrationStatus: item.registrationStatus
                })
                const dateText = (() => {
                  const scheduleAt = getComparableScheduleAt(item)
                  if (!scheduleAt) {
                    return "-"
                  }

                  return formatShortDate(scheduleAt) ?? "-"
                })()

                return (
                  <Link key={item.id} href={`/classes/${item.classId}`} className={styles.pastRow}>
                    <span className={styles.pastDate}>{dateText}</span>
                    <span className={styles.pastTitle}>{item.classTitle ?? "수업 정보 없음"}</span>
                    <span className={styles.pastStatus}>{statusDisplay.label}</span>
                  </Link>
                )
              })}
            </div>
          </details>
        ) : null}
      </section>

      <CancelConfirmDialog
        open={Boolean(dialogItem)}
        description={`${
          formatCancelPromptDate(dialogItem?.confirmedSlotAt ?? dialogItem?.requestedSlotAt ?? "") ?? "선택한 일정"
        } 체험을 취소할까요?\n학원에 일정이 잡혀 있어 취소하면 다시 신청해야 합니다.`}
        onClose={() => {
          if (!isPending) {
            setDialogItem(null)
          }
        }}
        onConfirm={() => {
          if (!dialogItem) {
            return
          }

          const currentItem = dialogItem
          setDialogItem(null)
          handleCancel(currentItem)
        }}
      />
    </>
  )
}
