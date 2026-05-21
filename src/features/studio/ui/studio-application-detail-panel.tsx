import type { ReactNode } from "react"

import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

const STATUS_LABELS: Record<StudioApplicationDetail["status"], string> = {
  new: "신규",
  reviewing: "검토 중",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소"
}

type StudioApplicationDetailPanelProps = {
  item: StudioApplicationDetail
}

export const StudioApplicationDetailPanel = ({ item }: StudioApplicationDetailPanelProps) => {
  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>신청 상담 기록지</h2>

      <Section title="기본 정보">
        <div style={gridStyle}>
          <InfoRow label="상태" value={STATUS_LABELS[item.status]} />
          <InfoRow label="신청 ID" value={item.id} />
          <InfoRow label="신청일" value={formatDateTime(item.createdAt)} />
          <InfoRow label="수업명" value={item.classTitle ?? "-"} />
          <InfoRow label="과목" value={item.classSubject ?? "-"} />
          <InfoRow label="지역" value={item.classRegion ?? "-"} />
          <InfoRow label="담당 teacher" value={item.assignedTeacherId ?? "-"} />
        </div>
      </Section>

      <Section title="학생/보호자 정보">
        <div style={gridStyle}>
          <InfoRow label="학생명" value={item.childName} />
          <InfoRow label="학년" value={item.childGrade} />
          <InfoRow label="학교" value={item.childSchool ?? "-"} />
          <InfoRow label="보호자명" value={item.parentName ?? "-"} />
          <InfoRow label="보호자 연락처" value={item.parentPhone ?? "-"} />
        </div>
        <InfoBlock
          label="학생 특이사항"
          value={item.childNotes}
          emptyLabel="등록된 학생 특이사항이 없습니다."
        />
      </Section>

      <Section title="체험 신청 정보">
        <div style={gridStyle}>
          <InfoRow label="체험 희망 시간" value={formatDateTime(item.requestedSlotAt)} />
          <InfoRow label="요청 슬롯 ID" value={item.requestedScheduleBlockId ?? "-"} />
          <InfoRow label="확정 시간" value={formatDateTime(item.confirmedSlotAt)} />
          <InfoRow label="확정 슬롯 ID" value={item.confirmedScheduleBlockId ?? "-"} />
          <InfoRow
            label="등록 시 선호 수업 시간대"
            value={item.preferredRegularSchedule ?? "-"}
          />
        </div>
        <InfoBlock
          label="학부모 추가 메모"
          value={item.memo}
          emptyLabel="남겨진 추가 메모가 없습니다."
        />
      </Section>

      <Section title="경험/수준">
        <div style={gridStyle}>
          <InfoRow
            label="과목 경험 여부"
            value={
              item.subjectExperienceYn == null
                ? "-"
                : item.subjectExperienceYn
                  ? "있음"
                  : "없음"
            }
          />
          <InfoRow label="경험 기간" value={item.subjectExperienceDuration ?? "-"} />
          <InfoRow label="현재 수준" value={item.currentLevel ?? "-"} />
        </div>
      </Section>

      <Section title="목표">
        <div style={gridStyle}>
          <InfoRow label="목표 유형" value={item.goalType ?? "-"} />
        </div>
        <InfoBlock
          label="목표 상세"
          value={item.goalNote}
          emptyLabel="등록된 목표 상세가 없습니다."
        />
      </Section>

      <Section title="상담/체험 기록">
        <InfoBlock
          label="상담 내용"
          value={item.consultationNote}
          emptyLabel="아직 저장된 상담 내용이 없습니다."
        />
        <InfoBlock
          label="체험 기록"
          value={item.trialFeedback}
          emptyLabel="아직 저장된 체험 기록이 없습니다."
        />
      </Section>

      <Section title="확정 정보">
        <div style={gridStyle}>
          <InfoRow label="체험 후 확정 레벨" value={item.finalLevel ?? "-"} />
          <InfoRow label="체험 후 확정 수업 시간" value={item.finalSchedule ?? "-"} />
        </div>
      </Section>
    </section>
  )
}

type SectionProps = {
  title: string
  children: ReactNode
}

const Section = ({ title, children }: SectionProps) => {
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={subTitleStyle}>{title}</h3>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  )
}

type InfoRowProps = {
  label: string
  value: string
}

const InfoRow = ({ label, value }: InfoRowProps) => {
  return (
    <div
      style={{
        border: "1px solid #f3f4f6",
        borderRadius: 12,
        padding: 14,
        background: "#fcfcfd"
      }}
    >
      <p style={{ margin: "0 0 4px", fontSize: 12, lineHeight: "18px", color: "#6b7280" }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#111827" }}>{value}</p>
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
    <div style={blockStyle}>
      <p style={{ margin: "0 0 6px", fontSize: 12, lineHeight: "18px", color: "#6b7280" }}>
        {label}
      </p>
      <p style={memoStyle}>{text}</p>
    </div>
  )
}

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 20
}

const titleStyle = {
  margin: "0 0 16px",
  fontSize: 18,
  lineHeight: "24px",
  color: "#111827"
}

const subTitleStyle = {
  margin: "0 0 8px",
  fontSize: 15,
  lineHeight: "20px",
  color: "#111827"
}

const gridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
}

const blockStyle = {
  border: "1px solid #f3f4f6",
  borderRadius: 12,
  padding: 14,
  background: "#fcfcfd"
}

const memoStyle = {
  margin: 0,
  fontSize: 14,
  lineHeight: "20px",
  color: "#111827",
  whiteSpace: "pre-wrap" as const
}
