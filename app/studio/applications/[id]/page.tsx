import Link from "next/link"
import { notFound } from "next/navigation"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { ApplicationOutcomeForm } from "@/features/studio/ui/application-outcome-form"
import { ApplicationLogList } from "@/features/studio/ui/application-log-list"
import { ApplicationStatusActionForm } from "@/features/studio/ui/application-status-action-form"
import { StudioApplicationDetailPanel } from "@/features/studio/ui/studio-application-detail-panel"
import type { ApplicationStatus } from "@/shared/lib/db/adapter"

type StudioApplicationDetailPageProps = {
  params: Promise<{
    id: string
  }>
}

const NEXT_STATUS_BY_CURRENT: Partial<Record<ApplicationStatus, ApplicationStatus>> = {
  new: "reviewing",
  reviewing: "confirmed",
  confirmed: "completed"
}

export default async function StudioApplicationDetailPage({
  params
}: StudioApplicationDetailPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedParams = await params
  const { data, error } = await getStudioApplicationDetail(
    resolvedParams.id,
    teacher.organizationId
  )

  if (!error && !data) {
    notFound()
  }

  return (
    <main
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "32px 24px 48px",
        background: "#f9fafb",
        minHeight: "100dvh"
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <Link href="/studio/applications" prefetch={false} style={{ color: "#2563eb", textDecoration: "none" }}>
          신청함으로 돌아가기
        </Link>
      </div>

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: "34px", color: "#111827" }}>
          체험 신청 상세
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
          teacher 본인 organization 범위에서 조회 가능한 신청만 확인할 수 있습니다.
        </p>
      </header>

      {error ? (
        <section
          style={{
            border: "1px solid #fecaca",
            borderRadius: 16,
            background: "#fff",
            padding: 20
          }}
        >
          <p style={{ margin: 0, color: "#991b1b", fontSize: 14, lineHeight: "20px" }}>{error}</p>
        </section>
      ) : null}

      {data ? (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr) 360px" }}>
          <div style={{ display: "grid", gap: 16 }}>
            <StudioApplicationDetailPanel item={data} />
            {data.status === "completed" ? (
              <ApplicationOutcomeForm item={data} />
            ) : (
              <section
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "#fff",
                  padding: 20
                }}
              >
                <h2 style={{ margin: "0 0 8px", fontSize: 18, lineHeight: "24px", color: "#111827" }}>
                  운영 기록 및 등록 전환
                </h2>
                <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
                  체험수업/레벨테스트 완료 처리 후 상담 기록과 등록 전환 정보를 입력할 수
                  있습니다.
                </p>
              </section>
            )}
            <ApplicationLogList items={data.logs} />
          </div>

          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <ApplicationStatusActionForm
              applicationId={data.id}
              nextStatus={NEXT_STATUS_BY_CURRENT[data.status] ?? null}
            />
            <section
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                background: "#fff",
                padding: 20
              }}
            >
              <h2 style={{ margin: "0 0 8px", fontSize: 18, lineHeight: "24px", color: "#111827" }}>
                처리 원칙
              </h2>
              <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
                허용 전이: `new → reviewing → confirmed → completed`
              </p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
                상태 변경 시 같은 action 안에서 `application_logs`를 함께 기록합니다.
              </p>
            </section>
          </div>
        </div>
      ) : null}
    </main>
  )
}
