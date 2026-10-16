import type { SupabaseClient } from "@supabase/supabase-js"
import { validateChildProfileForm } from "@/features/children/lib/child-form"
import { LEARNER_GRADES, LEARNER_GRADE_GROUPS, normalizeLearnerGrade } from "@/shared/constants/education-taxonomy"
import { validateParentBirthDate } from "@/shared/lib/parent-birth-date"

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } })
const fields = "id,name,grade,school_name,notes,current_level,interest_subjects,goal_note"
const childFields = ["name", "grade", "schoolName", "notes", "currentLevel", "interestSubjects", "goalNote"]
const mapChild = (row: Record<string, unknown>) => ({
  id: row.id, name: row.name, grade: normalizeLearnerGrade(String(row.grade ?? "")) ?? String(row.grade ?? ""),
  schoolName: row.school_name, notes: row.notes, currentLevel: row.current_level,
  interestSubjects: row.interest_subjects, goalNote: row.goal_note
})

// Invoked only after the shared reader verifies the caller, Parent role, phone and deletion status.
// Uses that caller's JWT/RLS for both reads and writes; ownership never comes from the body.
export async function nativeAccount(request: Request, path: string[], db: SupabaseClient, user: { id: string; email?: string }, phoneVerified: boolean) {
  const profileRoute = path.length === 1 && path[0] === "profile"
  const childrenRoute = path[0] === "children" && (path.length === 1 || (path.length === 2 && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(path[1])))
  if (!profileRoute && !childrenRoute) return json({ error: "not_found" }, 404)
  if (request.method === "GET" && path.length === 1) {
    if (profileRoute) {
      const { data, error } = await db.from("profiles").select("name,phone,parent_birth_date").eq("id", user.id).maybeSingle()
      if (error || !data) return json({ error: "profile_unavailable" }, 503)
      return json({ profile: { name: data.name ?? "", phone: data.phone ?? "", parentBirthDate: data.parent_birth_date ?? "", email: user.email ?? "", phoneVerified } })
    }
    const { data, error } = await db.from("children").select(fields).eq("parent_id", user.id).order("created_at", { ascending: false })
    if (error) return json({ error: "children_unavailable" }, 503)
    return json({ items: (data ?? []).map(mapChild), grades: LEARNER_GRADES, gradeGroups: LEARNER_GRADE_GROUPS })
  }
  if (request.method !== "POST") return json({ error: "not_found" }, 404)
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "invalid_input" }, 400)
  const raw = await request.text()
  if (raw.length > 12000) return json({ error: "invalid_input" }, 400)
  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return json({ error: "invalid_input" }, 400) }
  const allowed = profileRoute ? ["name", "phone", "parentBirthDate"] : childFields
  if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).some(key => !allowed.includes(key) || typeof body[key] !== "string")) return json({ error: "invalid_input" }, 400)
  if (profileRoute) {
    const name = String(body.name ?? "").trim(), phone = String(body.phone ?? "").trim() || null
    const birth = validateParentBirthDate(String(body.parentBirthDate ?? ""), { required: false })
    if (name.length < 2 || name.length > 30) return json({ error: "invalid_input", message: "보호자명은 2~30자로 입력해 주세요." }, 400)
    if (phone && (phone.length < 8 || phone.length > 20)) return json({ error: "invalid_input", message: "보호자 연락처를 다시 확인해 주세요." }, 400)
    if (!birth.ok) return json({ error: "invalid_input", message: birth.message }, 400)
    const { data, error } = await db.from("profiles").update({ name, phone, parent_birth_date: birth.parentBirthDate, updated_at: new Date().toISOString() }).eq("id", user.id).select("id").maybeSingle()
    if (error || !data) return json({ error: "save_failed", message: error?.message === "parent_verified_phone_immutable" ? "인증된 휴대폰 번호는 변경할 수 없어요. 기존 번호로 저장해 주세요." : error?.message === "parent_phone_verification_required" ? "휴대폰 인증을 먼저 완료해 주세요." : "보호자 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, 400)
    return json({ ok: true })
  }
  const form = new FormData()
  for (const key of childFields) form.set(key, String(body[key] ?? ""))
  const validated = validateChildProfileForm(form)
  if (!validated.ok) return json({ error: "invalid_input", message: validated.message }, 400)
  const input = validated.input
  const row = { name: input.name, grade: input.grade, school_name: input.schoolName, notes: input.notes, current_level: input.currentLevel, interest_subjects: input.interestSubjects, goal_note: input.goalNote }
  const query = path.length === 1
    ? db.from("children").insert({ ...row, parent_id: user.id })
    : db.from("children").update({ ...row, updated_at: new Date().toISOString() }).eq("id", path[1]).eq("parent_id", user.id)
  const { data, error } = await query.select(fields).maybeSingle()
  if (error) return json({ error: "save_failed", message: "자녀 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, 400)
  if (!data) return json({ error: "not_found", message: "자녀 정보를 찾을 수 없어요. 목록을 다시 확인해 주세요." }, 404)
  return json({ item: mapChild(data) })
}
