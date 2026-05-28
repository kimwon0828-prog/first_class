import Link from "next/link"

import type { StudioDashboardSummary } from "@/shared/lib/db/adapter"

type StudioDashboardSummaryProps = {
  summary: StudioDashboardSummary
}

const items = [
  { key: "newApplicationCount", label: "신규 신청 수" },
  { key: "activeApplicationCount", label: "진행 중 신청 수" },
  { key: "todayScheduledCount", label: "오늘 예정 건수" },
  { key: "pendingConfirmationCount", label: "확정 대기 건수" }
] as const

const operationSummaryItems = [
  { key: "needsOutcomeCount", label: "완료 후 기록 필요" },
  { key: "registeredCount", label: "등록 완료 수" },
  { key: "enrollmentRate", label: "등록 전환율(%)" }
] as const

const monthlyItems = [
  { key: "monthlyApplicationCount", label: "이번 달 신청 수" },
  { key: "monthlyCompletedCount", label: "이번 달 완료 수" },
  { key: "monthlyEnrolledCount", label: "이번 달 등록 수" },
  { key: "monthlyEnrollmentRate", label: "이번 달 등록 전환율(%)" }
] as const

const links = [
  { href: "/studio/applications", label: "신청함", description: "들어온 체험 신청을 확인하고 상태를 처리합니다." },
  { href: "/studio/classes", label: "수업 관리", description: "체험수업 상품을 등록하고 공개 상태를 관리합니다." },
  { href: "/studio/schedule", label: "일정 관리", description: "예약 가능 시간대를 만들고 blocked 상태를 관리합니다." },
  { href: "/studio/teachers", label: "선생님 관리", description: "학원 내부 선생님 프로필을 등록하고 active 상태를 관리합니다." }
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

      <section style={{ display: "grid", gap: 12 }}>
        <div>
          <h2 style={sectionTitleStyle}>운영 요약</h2>
          <p style={sectionDescriptionStyle}>
            신규/진행/확정 대기 상태와 등록 전환 지표를 빠르게 확인합니다.
          </p>
        </div>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {operationSummaryItems.map((item) => (
            <div key={item.key} style={cardStyle}>
              <p style={labelStyle}>{item.label}</p>
              <p style={valueStyle}>
                {item.key === "enrollmentRate" ? `${summary[item.key]}%` : summary[item.key]}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div>
          <h2 style={sectionTitleStyle}>월간 운영 데이터</h2>
          <p style={sectionDescriptionStyle}>
            이번 달 기준 신청/완료/등록 지표를 요약합니다.
          </p>
        </div>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {monthlyItems.map((item) => (
            <div key={item.key} style={cardStyle}>
              <p style={labelStyle}>{item.label}</p>
              <p style={valueStyle}>
                {item.key === "monthlyEnrollmentRate" ? `${summary[item.key]}%` : summary[item.key]}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
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

const sectionTitleStyle = {
  margin: "0 0 6px",
  fontSize: 18,
  lineHeight: "24px",
  color: "#111827"
}

const sectionDescriptionStyle = {
  margin: 0,
  fontSize: 14,
  lineHeight: "20px",
  color: "#4b5563"
}

const linkCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: 10,
  textDecoration: "none"
}
