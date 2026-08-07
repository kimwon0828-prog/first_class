"use client"

import { useMemo, useState } from "react"

import {
  buildCreateClassScheduleDraftSlots,
  createDefaultCreateClassScheduleDraft,
  summarizeCreateScheduleDraft,
  type CreateClassScheduleDraft,
  type CreateClassScheduleDraftSlot
} from "@/features/studio/lib/studio-operating-hours"

import { StudioOperatingHoursModal } from "./studio-operating-hours-modal"
import { StudioOperatingHoursSummary } from "./studio-operating-hours-summary"
import styles from "./studio-class-create-schedule-step.module.css"

type StudioClassCreateScheduleStepProps = {
  scheduleDraft: CreateClassScheduleDraft
  slotsError?: string
  onChange: (next: CreateClassScheduleDraft) => void
}

export const StudioClassCreateScheduleStep = ({
  scheduleDraft,
  slotsError,
  onChange
}: StudioClassCreateScheduleStepProps) => {
  const generatedSlots = useMemo(() => buildCreateClassScheduleDraftSlots(scheduleDraft), [scheduleDraft])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const summary = useMemo(() => summarizeCreateScheduleDraft(scheduleDraft), [scheduleDraft])

  return (
    <div className={styles.scheduleStepLayout}>
      <StudioOperatingHoursSummary
        title="체험수업 예약시간"
        emptyDescription="예약 가능한 기본 운영시간을 설정해 주세요."
        summary={summary}
        actionLabel={summary.hasValue ? "기본 운영시간 수정" : "기본 운영시간 설정"}
        onOpen={() => setIsModalOpen(true)}
      />

      <section className={styles.noteCard}>
        <div className={styles.noteBlock}>
          <strong className={styles.noteTitle}>생성 예정 일정</strong>
          <p className={styles.noteText}>모달에서 저장한 기본 운영시간은 최종 수업 등록 버튼을 누를 때 실제 날짜별 one_time 일정으로 생성됩니다.</p>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricChip}>생성 예정 {generatedSlots.length}개</span>
          <span className={styles.metricChipMuted}>DB 변경 없음</span>
        </div>
      </section>

      <section className={styles.noteCard}>
        <div className={styles.noteBlock}>
          <strong className={styles.noteTitle}>날짜별 예외 일정</strong>
          <p className={styles.noteText}>날짜별 휴무와 예외 시간은 수업을 등록한 후 설정할 수 있습니다.</p>
        </div>
      </section>

      {slotsError ? <p className={styles.errorText}>{slotsError}</p> : null}

      <StudioOperatingHoursModal
        isOpen={isModalOpen}
        title={summary.hasValue ? "기본 운영시간 수정하기" : "기본 운영시간 설정하기"}
        value={scheduleDraft ?? createDefaultCreateClassScheduleDraft()}
        onClose={() => setIsModalOpen(false)}
        onSave={(next) => {
          onChange(next)
          setIsModalOpen(false)
        }}
      />
    </div>
  )
}

export type { CreateClassScheduleDraft, CreateClassScheduleDraftSlot }
export { buildCreateClassScheduleDraftSlots, createDefaultCreateClassScheduleDraft }
