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
      <h2 style={titleStyle}>신청 상세</h2>

      <div style={gridStyle}>
        <InfoRow label="상태" value={STATUS_LABELS[item.status]} />
        <InfoRow label="신청 ID" value={item.id} />
        <InfoRow label="수업명" value={item.classTitle ?? "-"} />
        <InfoRow label="과목" value={item.classSubject ?? "-"} />
        <InfoRow label="지역" value={item.classRegion ?? "-"} />
        <InfoRow label="학부모 ID" value={item.parentId} />
        <InfoRow label="아이 이름" value={item.childName} />
        <InfoRow label="학년/연령" value={item.childGrade} />
        <InfoRow label="희망 시간" value={formatDateTime(item.requestedSlotAt)} />
        <InfoRow label="확정 시간" value={formatDateTime(item.confirmedSlotAt)} />
        <InfoRow label="담당 teacher" value={item.assignedTeacherId ?? "-"} />
        <InfoRow label="확정 슬롯 ID" value={item.confirmedScheduleBlockId ?? "-"} />
      </div>

      <div style={{ marginTop: 20 }}>
        <h3 style={subTitleStyle}>메모</h3>
        <p style={memoStyle}>{item.memo?.trim() ? item.memo : "남겨진 메모가 없습니다."}</p>
      </div>
    </section>
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

const memoStyle = {
  margin: 0,
  border: "1px solid #f3f4f6",
  borderRadius: 12,
  padding: 14,
  background: "#fcfcfd",
  fontSize: 14,
  lineHeight: "20px",
  color: "#111827",
  whiteSpace: "pre-wrap" as const
}
