import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { StudioApplicationTable } from "@/features/studio/ui/studio-application-table"

export default async function StudioApplicationsPage() {
  const teacher = await requireTeacherStudioAccess()
  const { data, error } = await getStudioApplications(teacher.organizationId)

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
      <header style={{ marginBottom: 24 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: "18px", color: "#4f46e5" }}>
          FIRST CLASS STUDIO
        </p>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: "34px", color: "#111827" }}>
          체험 신청함
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
          {teacher.name} 선생님이 처리할 수 있는 같은 organization 신청만 표시합니다.
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

      {!error && data.length === 0 ? (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#fff",
            padding: 24
          }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 18, lineHeight: "24px", color: "#111827" }}>
            아직 들어온 신청이 없습니다.
          </h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
            새로운 체험 신청이 들어오면 이 화면에서 신규 상태로 바로 확인할 수 있습니다.
          </p>
        </section>
      ) : null}

      {!error && data.length > 0 ? (
        <section style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
            총 {data.length}건
          </p>
          <StudioApplicationTable items={data} />
        </section>
      ) : null}
    </main>
  )
}
