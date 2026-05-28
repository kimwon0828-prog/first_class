import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioTeachers } from "@/features/studio/queries/get-studio-teachers"
import { StudioTeachersManager } from "@/features/studio/ui/studio-teachers-manager"

export default async function StudioTeachersPage() {
  const teacher = await requireTeacherStudioAccess()
  const { data, error } = await getStudioTeachers(teacher.organizationId)

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
          선생님 관리
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
          학원 계정 안에서 수업 담당 선생님 프로필을 최대 등록 가능 수까지 관리합니다.
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
      ) : (
        <StudioTeachersManager
          items={data.teachers}
          seatSummary={data.seatSummary}
        />
      )}
    </main>
  )
}
