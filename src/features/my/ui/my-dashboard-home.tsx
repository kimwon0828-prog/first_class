import Link from "next/link"
import type { CSSProperties } from "react"

import type { MyDashboardData, TrialApplicationSummary } from "@/shared/lib/db/adapter"

type MyDashboardHomeProps = {
  profileName: string
  dashboard: MyDashboardData
}

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  backgroundColor: "#fff",
  padding: 14
} satisfies CSSProperties

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
}

const formatProgramType = (value: TrialApplicationSummary["classProgramType"]) => {
  if (value === "level_test") {
    return "레벨테스트"
  }

  return "체험수업"
}

const statusLabelMap: Record<TrialApplicationSummary["status"], string> = {
  new: "신규",
  reviewing: "검토 중",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소"
}

export const MyDashboardHome = ({ profileName, dashboard }: MyDashboardHomeProps) => {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <section style={{ ...cardStyle, backgroundColor: "#f8fafc" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>{profileName}님, 안녕하세요</h1>
        <p style={{ margin: 0, fontSize: 14, color: "#475467", lineHeight: 1.6 }}>
          신청 현황과 자녀 정보를 한 번에 확인할 수 있어요. 자녀 정보를 미리 등록해 두면 다음 신청 단계에서 더 편하게 연결할 수 있습니다.
        </p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <article style={cardStyle}>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#667085" }}>전체 신청</p>
          <strong style={{ fontSize: 22 }}>{dashboard.totalApplicationCount}</strong>
        </article>
        <article style={cardStyle}>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#667085" }}>등록 자녀</p>
          <strong style={{ fontSize: 22 }}>{dashboard.childrenCount}</strong>
        </article>
        <article style={cardStyle}>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#667085" }}>진행 중</p>
          <strong style={{ fontSize: 22 }}>
            {dashboard.newApplicationCount +
              dashboard.reviewingApplicationCount +
              dashboard.confirmedApplicationCount}
          </strong>
        </article>
        <article style={cardStyle}>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#667085" }}>완료/취소</p>
          <strong style={{ fontSize: 22 }}>
            {dashboard.completedApplicationCount + dashboard.canceledApplicationCount}
          </strong>
        </article>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>바로가기</h2>
            <p style={{ margin: 0, fontSize: 14, color: "#4b5563" }}>
              자녀 관리와 신청 내역을 빠르게 확인하세요.
            </p>
          </div>
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <Link
            href="/my/children"
            style={{
              display: "block",
              borderRadius: 10,
              border: "1px solid #d0d5dd",
              padding: 12,
              color: "#111827",
              textDecoration: "none"
            }}
          >
            자녀 관리 바로가기
          </Link>
          <Link
            href="/my/applications"
            style={{
              display: "block",
              borderRadius: 10,
              border: "1px solid #d0d5dd",
              padding: 12,
              color: "#111827",
              textDecoration: "none"
            }}
          >
            신청 내역 바로가기
          </Link>
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>최근 신청 내역</h2>
            <p style={{ margin: 0, fontSize: 14, color: "#4b5563" }}>
              최근 5건까지 보여드립니다.
            </p>
          </div>
          <Link href="/my/applications" style={{ fontSize: 14, color: "#2563eb" }}>
            전체 보기
          </Link>
        </div>

        {dashboard.recentApplications.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "#6b7280" }}>
              아직 신청한 내역이 없습니다.
            </p>
            <Link href="/classes" style={{ fontSize: 14, color: "#2563eb" }}>
              프로그램 보러가기
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {dashboard.recentApplications.map((item) => (
              <article
                key={item.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 12
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 15 }}>{item.classTitle ?? "프로그램 정보 없음"}</strong>
                  <span style={{ fontSize: 12, color: "#475467" }}>{statusLabelMap[item.status]}</span>
                </div>
                <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 14, color: "#374151" }}>
                  <p style={{ margin: 0 }}>유형: {formatProgramType(item.classProgramType)}</p>
                  <p style={{ margin: 0 }}>학생명: {item.childName}</p>
                  <p style={{ margin: 0 }}>예약 시간: {formatDateTime(item.requestedSlotAt)}</p>
                  <p style={{ margin: 0 }}>신청일: {formatDateTime(item.createdAt)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
