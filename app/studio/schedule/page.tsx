import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioClasses } from "@/features/studio/queries/get-studio-classes"
import { getStudioScheduleBlocks } from "@/features/studio/queries/get-studio-schedule-blocks"
import { StudioScheduleManager } from "@/features/studio/ui/studio-schedule-manager"

export default async function StudioSchedulePage() {
  const teacher = await requireTeacherStudioAccess()
  const [{ data: scheduleBlocks, error }, { data: classes }] = await Promise.all([
    getStudioScheduleBlocks(teacher.teacherId),
    getStudioClasses(teacher.organizationId)
  ])
  const myClasses = classes.filter((item) => item.teacherId === teacher.teacherId)

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
          일정 관리
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
          teacher 본인 기준 예약 가능 시간대를 만들고 blocked 상태를 전환합니다.
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
        <StudioScheduleManager items={scheduleBlocks} classes={myClasses} />
      )}
    </main>
  )
}
