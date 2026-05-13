import type { TrialApplicationSummary } from "@/shared/lib/db/adapter"

type MyApplicationListProps = {
  items: TrialApplicationSummary[]
}

const statusLabelMap: Record<TrialApplicationSummary["status"], string> = {
  new: "신규",
  reviewing: "검토 중",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소"
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
}

export const MyApplicationList = ({ items }: MyApplicationListProps) => {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      {items.map((item) => (
        <article
          key={item.id}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 14,
            backgroundColor: "#fff"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>{item.classTitle ?? "수업 정보 없음"}</h2>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                padding: "2px 10px",
                border: "1px solid #d1d5db",
                fontSize: 12,
                color: "#374151"
              }}
            >
              {statusLabelMap[item.status]}
            </span>
          </div>
          <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 14, color: "#374151" }}>
            <p style={{ margin: 0 }}>자녀명: {item.childName}</p>
            <p style={{ margin: 0 }}>신청일: {formatDateTime(item.createdAt)}</p>
            <p style={{ margin: 0 }}>희망시간: {formatDateTime(item.requestedSlotAt)}</p>
          </div>
        </article>
      ))}
    </section>
  )
}
