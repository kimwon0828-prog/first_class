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

export const ApplicationRegistrationStatusSection = ({
  formId,
  currentRegistrationStatus,
  isCompleted
}: ApplicationRegistrationStatusSectionProps) => {
  const [registrationStatus, setRegistrationStatus] = useState<ApplicationRegistrationStatus>(
    getInitialRegistrationStatus(currentRegistrationStatus)
  )

  return (
    <section className={styles.section} aria-label="등록 전환">
      <h3 className={styles.sectionTitle}>등록 전환</h3>
      {!isCompleted ? (
        <p className={styles.inlineNotice}>
          체험 완료 전에는 등록 결과를 저장할 수 없습니다. 완료 처리 후 다시 선택해 주세요.
        </p>
      ) : null}
      <input form={formId} type="hidden" name="registrationStatus" value={registrationStatus} />
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
    </section>
  )
}
