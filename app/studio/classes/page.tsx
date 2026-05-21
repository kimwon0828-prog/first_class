import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioClasses } from "@/features/studio/queries/get-studio-classes"
import { StudioClassesManager } from "@/features/studio/ui/studio-classes-manager"

export default async function StudioClassesPage() {
  const teacher = await requireTeacherStudioAccess()
  const { data: classes, error } = await getStudioClasses(teacher.organizationId)

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
          수업 관리
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
          같은 organization 체험수업을 등록하고 담당 선생님과 공개 상태를 관리합니다.
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
        <StudioClassesManager items={classes} currentTeacherName={teacher.name} />
      )}
    </main>
  )
}
