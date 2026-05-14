import type { ApplicationLogEntry } from "@/shared/lib/db/adapter"

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))

const STATUS_LABELS = {
  new: "신규",
  reviewing: "검토 중",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소"
}

type ApplicationLogListProps = {
  items: ApplicationLogEntry[]
}

export const ApplicationLogList = ({ items }: ApplicationLogListProps) => {
  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>처리 로그</h2>

      {items.length === 0 ? (
        <p style={emptyStyle}>아직 기록된 처리 로그가 없습니다.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((item) => (
            <article
              key={item.id}
              style={{
                border: "1px solid #f3f4f6",
                borderRadius: 12,
                padding: 14,
                background: "#fcfcfd"
              }}
            >
              <p style={metaStyle}>
                {formatDateTime(item.createdAt)} /{" "}
                {(item.fromStatus ? STATUS_LABELS[item.fromStatus] : "생성") +
                  " -> " +
                  STATUS_LABELS[item.toStatus]}
              </p>
              <p style={bodyStyle}>{item.note ?? "상태 변경 기록"}</p>
              <p style={subtleStyle}>
                actor: {item.actorName ?? "확인 불가"} / id: {item.actorId}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
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

const emptyStyle = {
  margin: 0,
  fontSize: 14,
  lineHeight: "20px",
  color: "#6b7280"
}

const metaStyle = {
  margin: "0 0 6px",
  fontSize: 13,
  lineHeight: "18px",
  color: "#4b5563"
}

const bodyStyle = {
  margin: "0 0 6px",
  fontSize: 14,
  lineHeight: "20px",
  color: "#111827"
}

const subtleStyle = {
  margin: 0,
  fontSize: 12,
  lineHeight: "18px",
  color: "#6b7280"
}
