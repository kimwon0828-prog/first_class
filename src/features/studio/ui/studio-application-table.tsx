import Link from "next/link"
import type { CSSProperties } from "react"

import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

const STATUS_LABELS: Record<StudioApplicationSummary["status"], string> = {
  new: "신규",
  reviewing: "검토 중",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소"
}

type StudioApplicationTableProps = {
  items: StudioApplicationSummary[]
}

export const StudioApplicationTable = ({ items }: StudioApplicationTableProps) => {
  return (
    <div
      style={{
        overflowX: "auto",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff"
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
        <thead>
          <tr style={{ background: "#f9fafb", textAlign: "left" }}>
            <th style={headerCellStyle}>신청일</th>
            <th style={headerCellStyle}>상태</th>
            <th style={headerCellStyle}>수업</th>
            <th style={headerCellStyle}>과목/지역</th>
            <th style={headerCellStyle}>아이</th>
            <th style={headerCellStyle}>희망 시간</th>
            <th style={headerCellStyle}>확정 시간</th>
            <th style={headerCellStyle}>상세</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={{ borderTop: "1px solid #f3f4f6" }}>
              <td style={bodyCellStyle}>{formatDateTime(item.createdAt)}</td>
              <td style={bodyCellStyle}>{STATUS_LABELS[item.status]}</td>
              <td style={bodyCellStyle}>{item.classTitle ?? "-"}</td>
              <td style={bodyCellStyle}>
                {[item.classSubject, item.classRegion].filter(Boolean).join(" / ") || "-"}
              </td>
              <td style={bodyCellStyle}>
                {item.childName} / {item.childGrade}
              </td>
              <td style={bodyCellStyle}>{formatDateTime(item.requestedSlotAt)}</td>
              <td style={bodyCellStyle}>{formatDateTime(item.confirmedSlotAt)}</td>
              <td style={bodyCellStyle}>
                <Link href={`/studio/applications/${item.id}`} style={linkStyle}>
                  상세 보기
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const headerCellStyle: CSSProperties = {
  padding: "12px 16px",
  fontSize: 13,
  lineHeight: "18px",
  color: "#4b5563",
  fontWeight: 600
}

const bodyCellStyle: CSSProperties = {
  padding: "14px 16px",
  fontSize: 14,
  lineHeight: "20px",
  color: "#111827",
  verticalAlign: "top"
}

const linkStyle: CSSProperties = {
  color: "#2563eb",
  textDecoration: "none",
  fontWeight: 600
}
