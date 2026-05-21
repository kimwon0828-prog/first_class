import Link from "next/link"

import type { StudioDashboardSummary } from "@/shared/lib/db/adapter"

type StudioDashboardSummaryProps = {
  summary: StudioDashboardSummary
}

const items = [
  { key: "newApplicationCount", label: "신규 신청 수" },
  { key: "activeApplicationCount", label: "진행 중 신청 수" },
  { key: "myClassCount", label: "내 수업 수" },
  { key: "availableSlotCount", label: "예약 가능 슬롯 수" }
] as const

const links = [
  { href: "/studio/applications", label: "신청함", description: "들어온 체험 신청을 확인하고 상태를 처리합니다." },
  { href: "/studio/classes", label: "수업 관리", description: "체험수업 상품을 등록하고 공개 상태를 관리합니다." },
  { href: "/studio/schedule", label: "일정 관리", description: "예약 가능 시간대를 만들고 blocked 상태를 관리합니다." }
]

export const StudioDashboardSummaryView = ({ summary }: StudioDashboardSummaryProps) => {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section
        style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        {items.map((item) => (
          <div key={item.key} style={cardStyle}>
            <p style={labelStyle}>{item.label}</p>
            <p style={valueStyle}>{summary[item.key]}</p>
          </div>
        ))}
      </section>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {links.map((item) => (
          <Link key={item.href} href={item.href} style={linkCardStyle}>
            <strong style={{ color: "#111827", fontSize: 16, lineHeight: "22px" }}>{item.label}</strong>
            <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: "20px" }}>
              {item.description}
            </p>
          </Link>
        ))}
      </section>
    </div>
  )
}

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 20
}

const labelStyle = {
  margin: "0 0 8px",
  fontSize: 14,
  lineHeight: "20px",
  color: "#4b5563"
}

const valueStyle = {
  margin: 0,
  fontSize: 32,
  lineHeight: "38px",
  color: "#111827",
  fontWeight: 700
}

const linkCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: 10,
  textDecoration: "none"
}
