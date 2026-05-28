import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioDashboardTeacherOptions } from "@/features/studio/queries/get-studio-dashboard-teacher-options"
import { getStudioDashboardSummary } from "@/features/studio/queries/get-studio-dashboard-summary"
import { StudioDashboardSummaryView } from "@/features/studio/ui/studio-dashboard-summary"
import { StudioTeacherFilter } from "@/features/studio/ui/studio-teacher-filter"

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StudioIndexPageProps = {
  searchParams?: Promise<{ teacherId?: string }>
}

export default async function StudioIndexPage({ searchParams }: StudioIndexPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const teacherIdParam = String(resolvedSearchParams?.teacherId ?? "").trim()
  const { data: filterOptions, error: filterError } = await getStudioDashboardTeacherOptions(
    teacher.organizationId
  )
  const availableTeacherIdSet = new Set(filterOptions.map((option) => option.teacherId))
  const validatedTeacherId =
    teacherIdParam && teacherIdParam !== "all" && uuidPattern.test(teacherIdParam) && availableTeacherIdSet.has(teacherIdParam)
      ? teacherIdParam
      : null
  const selectedTeacherId = validatedTeacherId ?? "all"

  const { data, error } = await getStudioDashboardSummary(teacher.organizationId, {
    teacherId: validatedTeacherId
  })

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
          운영 대시보드
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
          선생님별 운영 현황을 필터링해서 요약합니다.
        </p>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <StudioTeacherFilter options={filterOptions} selectedTeacherId={selectedTeacherId} />
          {filterError ? (
            <p style={{ margin: 0, color: "#b42318", fontSize: 13, lineHeight: "18px" }}>
              {filterError}
            </p>
          ) : null}
        </div>
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
        <StudioDashboardSummaryView summary={data} />
      )}
    </main>
  )
}
