import Link from "next/link"

import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"

import styles from "./studio-application-detail-panel.module.css"

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date)
}

const normalizeText = (value: string | null | undefined) => {
  if (value == null) {
    return null
  }

  const normalized = value.trim()
  if (normalized.length === 0 || normalized === "-") {
    return null
  }

  return normalized
}

type StudioApplicationDetailPanelProps = {
  item: StudioApplicationDetail
}

export const StudioApplicationDetailPanel = ({ item }: StudioApplicationDetailPanelProps) => {
  const programTypeLabel =
    item.classProgramType === "trial_class"
      ? "체험수업"
      : item.classProgramType === "level_test"
        ? "레벨테스트"
        : "미확인"

  const childSchool = normalizeText(item.childSchool)
  const currentLevel = normalizeText(item.currentLevel)
  const subjectExperienceText =
    item.subjectExperienceYn == null ? null : item.subjectExperienceYn ? "있음" : "없음"
  const subjectExperienceDuration = normalizeText(item.subjectExperienceDuration)

  const parentName = normalizeText(item.parentName)
  const parentPhone = normalizeText(item.parentPhone)

  const classTitle = normalizeText(item.classTitle)
  const classSubject = normalizeText(item.classSubject)
  const classRegion = normalizeText(item.classRegion)
  const assignedTeacherName = normalizeText(item.assignedTeacherName)
  const confirmedAt = item.confirmedSlotAt ? formatDateTime(item.confirmedSlotAt) : null
  const requestedAt = item.requestedSlotAt ? formatDateTime(item.requestedSlotAt) : null
  const selectedScheduleLabel = normalizeText(item.selectedScheduleLabel)
  const requestedScheduleValue = requestedAt ?? selectedScheduleLabel ?? "일정 협의 필요"
  const contactedAt = item.contactedAt ? formatDateTime(item.contactedAt) : null
  const scheduledAt = item.scheduledAt ? formatDateTime(item.scheduledAt) : null
  const completedAt = item.completedAt ? formatDateTime(item.completedAt) : null
  const canceledAt = item.canceledAt ? formatDateTime(item.canceledAt) : null
  const noShowAt = item.noShowAt ? formatDateTime(item.noShowAt) : null
  const enrolledAt = item.enrolledAt ? formatDateTime(item.enrolledAt) : null

  return (
    <div className={styles.stack}>
      <section className={styles.card} aria-label="학생 정보">
        <header className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>학생 정보</h2>
            <p className={styles.cardDescription}>학생의 기본 정보와 특이사항을 확인해요.</p>
          </div>
        </header>

        <dl className={styles.grid}>
          <InfoRow label="이름" value={item.childName} />
          {normalizeText(item.childGrade) ? (
            <InfoRow label="학년/나이" value={normalizeText(item.childGrade) ?? ""} />
          ) : null}
          {childSchool ? <InfoRow label="학교" value={childSchool} /> : null}
          {currentLevel ? <InfoRow label="현재 수준" value={currentLevel} /> : null}
          {subjectExperienceText ? <InfoRow label="과목 경험" value={subjectExperienceText} /> : null}
          {subjectExperienceDuration ? <InfoRow label="경험 기간" value={subjectExperienceDuration} /> : null}
        </dl>

        <InfoBlock label="학생 메모" value={item.childNotes} emptyLabel="입력된 정보가 없어요." />
      </section>

      <section className={styles.card} aria-label="보호자 정보">
        <header className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>보호자 정보</h2>
            <p className={styles.cardDescription}>연락처를 빠르게 확인하고 필요하면 바로 연락해요.</p>
          </div>
          {parentPhone ? (
            <div className={styles.actionRow}>
              <a className={styles.actionButton} href={`tel:${parentPhone}`}>
                전화
              </a>
              <a className={styles.actionButton} href={`sms:${parentPhone}`}>
                문자
              </a>
            </div>
          ) : null}
        </header>

        <dl className={styles.grid}>
          {parentName ? <InfoRow label="보호자명" value={parentName} /> : null}
          {parentPhone ? <InfoRow label="연락처" value={parentPhone} emphasize /> : null}
        </dl>

        <InfoBlock label="학부모 메모" value={item.memo} emptyLabel="남겨진 추가 메모가 없어요." />
      </section>

      <section className={styles.card} aria-label="신청 수업">
        <header className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>신청 수업</h2>
            <p className={styles.cardDescription}>신청한 수업 정보를 확인해요.</p>
          </div>
          {item.classId ? (
            <Link href={`/classes/${item.classId}`} prefetch={false} className={styles.linkButton}>
              미리보기
            </Link>
          ) : null}
        </header>

        {classTitle || classSubject || classRegion ? (
          <dl className={styles.grid}>
            {classTitle ? <InfoRow label="수업명" value={classTitle} /> : null}
            {classSubject ? <InfoRow label="과목" value={classSubject} /> : null}
            {classRegion ? <InfoRow label="지역" value={classRegion} /> : null}
            {assignedTeacherName ? <InfoRow label="담당 선생님" value={assignedTeacherName} /> : null}
          </dl>
        ) : (
          <InfoBlock label="안내" value="수업 정보가 연결되지 않았어요." emptyLabel="-" />
        )}
      </section>

      <section className={styles.card} aria-label="일정 정보">
        <header className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>일정 정보</h2>
            <p className={styles.cardDescription}>희망 일정과 신청 유형을 확인해요.</p>
          </div>
        </header>

        <dl className={styles.grid}>
          <InfoRow label="희망 일정" value={requestedScheduleValue} />
          <InfoRow label="신청 유형" value={programTypeLabel} />
          {selectedScheduleLabel ? <InfoRow label="선택 시간 라벨" value={selectedScheduleLabel} /> : null}
          {confirmedAt ? <InfoRow label="확정 일정" value={confirmedAt} /> : null}
        </dl>
      </section>

      <section className={styles.card} aria-label="처리 이력">
        <header className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>처리 이력</h2>
            <p className={styles.cardDescription}>상태 전이와 등록 전환 시점을 확인해요.</p>
          </div>
        </header>

        <dl className={styles.grid}>
          <InfoRow label="첫 연락 시각" value={contactedAt ?? "-"} />
          <InfoRow label="일정 확정 시각" value={scheduledAt ?? "-"} />
          <InfoRow label="체험 완료 시각" value={completedAt ?? "-"} />
          <InfoRow label="취소 처리 시각" value={canceledAt ?? "-"} />
          <InfoRow label="노쇼 처리 시각" value={noShowAt ?? "-"} />
          <InfoRow label="등록 완료 시각" value={enrolledAt ?? "-"} />
        </dl>
      </section>
    </div>
  )
}

type InfoRowProps = {
  label: string
  value: string
  emphasize?: boolean
}

const InfoRow = ({ label, value, emphasize }: InfoRowProps) => {
  return (
    <div className={styles.infoRow}>
      <p className={styles.infoLabel}>{label}</p>
      <p className={`${styles.infoValue} ${emphasize ? styles.infoValueEmphasize : ""}`}>{value}</p>
    </div>
  )
}

type InfoBlockProps = {
  label: string
  value: string | null
  emptyLabel: string
}

const InfoBlock = ({ label, value, emptyLabel }: InfoBlockProps) => {
  const text = value?.trim() ? value : emptyLabel

  return (
    <div className={styles.infoBlock}>
      <p className={styles.infoLabel}>{label}</p>
      <p className={styles.memo}>{text}</p>
    </div>
  )
}
