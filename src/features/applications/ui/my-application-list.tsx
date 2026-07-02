"use client"

import { useTransition } from "react"
import Link from "next/link"

import {
  cancelMyApplicationAction,
  type CancelMyApplicationActionResult
} from "@/features/applications/actions/cancel-my-application"
import type { MyApplicationListItem } from "@/features/applications/ui/my-applications-client"
import styles from "./my-application-list.module.css"

type MyApplicationListProps = {
  items: MyApplicationListItem[]
  onCanceled?: () => Promise<void> | void
}

const statusLabelMap: Record<MyApplicationListItem["status"], string> = {
  new: "신청 완료",
  reviewing: "상담 대기",
  confirmed: "수업 확정",
  completed: "수업 완료",
  canceled: "신청 취소"
}

const statusHelpMap: Record<MyApplicationListItem["status"], string> = {
  new: "신청이 접수되었어요. 학원에서 확인 후 연락드릴 예정이에요.",
  reviewing: "상담 일정 확인이 필요해요.",
  confirmed: "첫수업 일정이 확정되었어요.",
  completed: "첫수업이 완료되었어요.",
  canceled: "취소된 신청이에요."
}

const canShowCancelButton = (item: MyApplicationListItem) => {
  if (item.registrationStatus === "enrolled") {
    return false
  }

  return item.status === "new" || item.status === "reviewing" || item.status === "confirmed"
}

const formatProgramType = (value: MyApplicationListItem["classProgramType"]) => {
  if (value === "level_test") {
    return "레벨테스트"
  }

  return "체험수업"
}

const resolveAcademyTeacherLabel = (item: MyApplicationListItem) => {
  const academyName = item.academyName?.trim() || null
  const teacherName = item.teacherDisplayName?.trim() || null

  if (academyName && teacherName) {
    return `${academyName} · ${teacherName}`
  }

  if (academyName) {
    return academyName
  }

  if (teacherName) {
    return teacherName
  }

  return "정보 준비 중"
}

const resolveLocation = (item: MyApplicationListItem) => {
  const address = item.organizationAddress?.trim() || null
  const addressDetail = item.organizationAddressDetail?.trim() || null
  const fullAddress = [address, addressDetail]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim()
  const academyName = item.academyName?.trim() || ""
  const searchQuery = [academyName, fullAddress].filter(Boolean).join(" ").trim()

  return {
    address: fullAddress || null,
    mapUrl: searchQuery
      ? `https://map.naver.com/p/search/${encodeURIComponent(searchQuery)}`
      : null
  }
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
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

const CancelButton = ({
  applicationId,
  onCanceled
}: {
  applicationId: string
  onCanceled?: () => Promise<void> | void
}) => {
  const [isPending, startTransition] = useTransition()

  const handleCancel = () => {
    startTransition(async () => {
      const result: CancelMyApplicationActionResult = await cancelMyApplicationAction(applicationId)
      window.alert(result.message)

      if (result.status === "success") {
        await onCanceled?.()
      }
    })
  }

  return (
    <button
      type="button"
      className={styles.cancelButton}
      onClick={handleCancel}
      disabled={isPending}
      aria-disabled={isPending}
    >
      {isPending ? "취소 처리 중..." : "신청 취소"}
    </button>
  )
}

export const MyApplicationList = ({ items, onCanceled }: MyApplicationListProps) => {
  return (
    <section className={styles.list} aria-label="신청 내역">
      {items.map((item) => {
        const schedule = resolveScheduleLabel(item)
        const classTitle = item.classTitle ?? "수업 정보 없음"
        const statusLabel = statusLabelMap[item.status]
        const statusHelp = statusHelpMap[item.status]
        const showCancelButton = canShowCancelButton(item)
        const academyTeacherLabel = resolveAcademyTeacherLabel(item)
        const location = resolveLocation(item)

        return (
          <article key={item.id} className={styles.card}>
            <header className={styles.cardHeader}>
              <span className={`${styles.badge} ${styles[`badge_${item.status}`]}`}>
                {statusLabel}
              </span>
              <Link href={`/classes/${item.classId}`} className={styles.classLink}>
                수업 보기
              </Link>
            </header>

            <h2 className={styles.classTitle}>{classTitle}</h2>
            <p className={styles.metaLine}>{formatProgramType(item.classProgramType)}</p>

            <div className={styles.metaGrid}>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>학원/선생님</span>
                <span className={styles.metaValue}>{academyTeacherLabel}</span>
              </div>
              {location.address ? (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>위치</span>
                  <span className={styles.metaValue}>
                    {location.address}
                    {location.mapUrl ? (
                      <a
                        href={location.mapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.mapLink}
                      >
                        네이버 지도에서 보기
                      </a>
                    ) : null}
                  </span>
                </div>
              ) : (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>위치</span>
                  <span className={styles.metaValue}>위치 정보 준비 중</span>
                </div>
              )}
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>아이</span>
                <span className={styles.metaValue}>
                  {item.childName} · {item.childGrade}
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>{schedule.label}</span>
                <span className={styles.metaValue}>{schedule.primaryValue}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>신청일</span>
                <span className={styles.metaValue}>{formatDateTime(item.createdAt) ?? "-"}</span>
              </div>
            </div>

            <p className={styles.helpText}>{statusHelp}</p>

            {showCancelButton ? (
              <div className={styles.actionRow}>
                <CancelButton applicationId={item.id} onCanceled={onCanceled} />
              </div>
            ) : null}
          </article>
        )
      })}
    </section>
  )
}
