import { revalidatePath } from "next/cache"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

type PendingSignupRequestRow = {
  request_id: string
  user_id: string
  signup_email: string | null
  organization_name: string
  academy_area: string
  branch_name: string | null
  address: string | null
  address_detail: string | null
  teacher_name: string
  teacher_phone: string | null
  status: string
  created_at: string
}

const requireAdmin = async () => {
  await requireSession("/auth/sign-in?returnTo=/admin/academy-approvals")
  const profile = await getMyProfile()

  if (!profile) {
    redirect("/classes")
  }

  if (profile.dbRole !== "admin") {
    redirect(profile.role === "parent" ? "/classes" : "/studio")
  }

  return profile
}

export default async function AdminAcademyApprovalsPage() {
  await requireAdmin()

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("list_pending_teacher_signup_requests")

  const pending = ((data ?? []) as PendingSignupRequestRow[]).map((row) => ({
    requestId: row.request_id,
    signupEmail: row.signup_email,
    organizationName: row.organization_name,
    academyArea: row.academy_area,
    branchName: row.branch_name,
    address: row.address,
    addressDetail: row.address_detail,
    teacherName: row.teacher_name,
    teacherPhone: row.teacher_phone,
    status: row.status,
    createdAt: row.created_at
  }))

  const approve = async (formData: FormData) => {
    "use server"
    await requireAdmin()
    const requestId = String(formData.get("requestId") ?? "")
    if (!requestId) return

    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.rpc("approve_teacher_signup_request", { request_id: requestId })
    if (error) {
      redirect(`/admin/academy-approvals?error=${encodeURIComponent(error.message)}`)
    }

    revalidatePath("/admin/academy-approvals")
  }

  const reject = async (formData: FormData) => {
    "use server"
    await requireAdmin()
    const requestId = String(formData.get("requestId") ?? "")
    if (!requestId) return

    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.rpc("reject_teacher_signup_request", { request_id: requestId })
    if (error) {
      redirect(`/admin/academy-approvals?error=${encodeURIComponent(error.message)}`)
    }

    revalidatePath("/admin/academy-approvals")
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>학원/선생님 회원가입 승인</h1>
          <p style={{ margin: "8px 0 0", color: "#555" }}>
            대기 중인 신청 목록을 확인하고 승인/거절할 수 있습니다.
          </p>
        </div>
        <Link href="/studio" prefetch={false} style={{ color: "#2AAD38", fontWeight: 600 }}>
          Studio로 이동
        </Link>
      </header>

      {error ? (
        <section style={{ marginTop: 16, padding: 12, border: "1px solid #f2b8b5", background: "#fde7e9" }}>
          <div style={{ fontWeight: 700 }}>목록을 불러오지 못했습니다.</div>
          <div style={{ marginTop: 6, color: "#5f2120" }}>{error.message}</div>
        </section>
      ) : null}

      {pending.length === 0 ? (
        <section style={{ marginTop: 24, padding: 16, border: "1px solid #eee", borderRadius: 8 }}>
          <div style={{ fontWeight: 700 }}>대기 중인 신청이 없습니다.</div>
          <div style={{ marginTop: 6, color: "#666" }}>새로운 학원 가입 신청이 들어오면 여기에서 확인할 수 있어요.</div>
        </section>
      ) : (
        <section style={{ marginTop: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "10px 8px" }}>학원</th>
                <th style={{ padding: "10px 8px" }}>지역</th>
                <th style={{ padding: "10px 8px" }}>지점</th>
                <th style={{ padding: "10px 8px" }}>주소</th>
                <th style={{ padding: "10px 8px" }}>가입 이메일</th>
                <th style={{ padding: "10px 8px" }}>신청일</th>
                <th style={{ padding: "10px 8px" }}>상태</th>
                <th style={{ padding: "10px 8px" }}>처리</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr key={row.requestId} style={{ borderBottom: "1px solid #f3f3f3" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 700 }}>{row.organizationName}</div>
                    <div style={{ color: "#666", marginTop: 4 }}>
                      담당: {row.teacherName}
                      {row.teacherPhone ? ` · ${row.teacherPhone}` : ""}
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{row.academyArea}</td>
                  <td style={{ padding: "10px 8px" }}>{row.branchName ?? "-"}</td>
                  <td style={{ padding: "10px 8px", minWidth: 220 }}>
                    {row.address ? (
                      <>
                        <div>{row.address}</div>
                        {row.addressDetail ? (
                          <div style={{ color: "#666", marginTop: 4 }}>{row.addressDetail}</div>
                        ) : null}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={{ padding: "10px 8px" }}>{row.signupEmail ?? "-"}</td>
                  <td style={{ padding: "10px 8px" }}>
                    {new Date(row.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td style={{ padding: "10px 8px" }}>{row.status}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <form action={approve}>
                        <input type="hidden" name="requestId" value={row.requestId} />
                        <button
                          type="submit"
                          style={{
                            background: "#2AAD38",
                            color: "white",
                            border: "1px solid #2AAD38",
                            padding: "8px 10px",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontWeight: 700
                          }}
                        >
                          승인
                        </button>
                      </form>
                      <form action={reject}>
                        <input type="hidden" name="requestId" value={row.requestId} />
                        <button
                          type="submit"
                          style={{
                            background: "white",
                            color: "#333",
                            border: "1px solid #ddd",
                            padding: "8px 10px",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontWeight: 700
                          }}
                        >
                          거절
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  )
}
