"use client"

import { useState } from "react"

import { getStudioRegistrationStatusLabel } from "@/features/studio/lib/application-status-labels"
import type { ApplicationRegistrationStatus } from "@/shared/lib/db/adapter"

import styles from "./application-outcome-form.module.css"

type ApplicationRegistrationStatusSectionProps = {
  formId: string
  currentRegistrationStatus: ApplicationRegistrationStatus
  isCompleted: boolean
}

const REGISTRATION_OPTIONS: Array<{
  value: Extract<ApplicationRegistrationStatus, "enrolled" | "not_enrolled" | "pending">
  label: string
  description: string
}> = [
  { value: "enrolled", label: "등록함", description: "정규 수강으로 이어졌어요." },
  { value: "not_enrolled", label: "미등록", description: "등록하지 않기로 했어요." },
  {
    value: "pending",
    label: getStudioRegistrationStatusLabel("pending"),
    description: "추가 검토나 재연락이 필요해요."
  }
]

const getInitialRegistrationStatus = (
  value: ApplicationRegistrationStatus
): ApplicationRegistrationStatus => {
  if (value === "enrolled" || value === "not_enrolled" || value === "pending") {
    return value
  }

  return "undecided"
}

const getRegistrationSummary = (value: ApplicationRegistrationStatus) => {
  if (value === "enrolled") {
    return {
      label: getStudioRegistrationStatusLabel("enrolled"),
      description: "등록이 완료되었습니다."
    }
  }

  if (value === "not_enrolled") {
    return {
      label: getStudioRegistrationStatusLabel("not_enrolled"),
      description: "미등록으로 종료되었습니다."
    }
  }

  if (value === "pending") {
    return {
      label: getStudioRegistrationStatusLabel("pending"),
      description: "체험 후 검토 중입니다."
    }
  }

  return {
    label: getStudioRegistrationStatusLabel("undecided"),
    description: "등록 여부를 확인해 주세요."
  }
}

export const ApplicationRegistrationStatusSection = ({
  formId,
  currentRegistrationStatus,
  isCompleted
}: ApplicationRegistrationStatusSectionProps) => {
  const [registrationStatus, setRegistrationStatus] = useState<ApplicationRegistrationStatus>(
    getInitialRegistrationStatus(currentRegistrationStatus)
  )
  const [isExpanded, setIsExpanded] = useState(!isCompleted || currentRegistrationStatus === "undecided")
  const summary = getRegistrationSummary(registrationStatus)

  return (
    <section className={styles.section} aria-label="등록 전환">
      <div className={styles.compactHeader}>
        <div>
          <h3 className={styles.sectionTitle}>등록 상태</h3>
          <p className={styles.compactValue}>{summary.label}</p>
        </div>
        {isCompleted ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? "닫기" : "상태 변경"}
          </button>
        ) : null}
      </div>
      <p className={styles.compactDescription}>{summary.description}</p>
      {!isCompleted ? (
        <p className={styles.inlineNotice}>
          체험 완료 전에는 등록 결과를 저장할 수 없습니다. 완료 처리 후 다시 선택해 주세요.
        </p>
      ) : null}
      <input form={formId} type="hidden" name="registrationStatus" value={registrationStatus} />
      {isExpanded ? (
        <div className={styles.registrationCardStack}>
          {REGISTRATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={!isCompleted}
              onClick={() => setRegistrationStatus(option.value)}
              className={`${styles.registrationOption} ${
                registrationStatus === option.value ? styles.registrationOptionActive : ""
              }`}
            >
              <div className={styles.registrationOptionDot} />
              <div className={styles.registrationOptionBody}>
                <p className={styles.registrationOptionTitle}>{option.label}</p>
                <p className={styles.registrationOptionDescription}>{option.description}</p>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
