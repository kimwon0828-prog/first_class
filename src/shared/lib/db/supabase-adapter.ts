import { getSupabaseServerClient } from "@/integrations/supabase/server"
import type {
  AvailableScheduleSlot,
  ClassDetail,
  ClassSummary,
  DataAdapter,
  TeacherPublicProfile,
  TrialApplicationInput,
  TrialApplicationSummary
} from "@/shared/lib/db/adapter"

type ClassRow = {
  id: string
  title: string
  subject: string
  region: string
  target_age: string
  description: string
  trial_price: number
  teacher_id: string | null
  is_active: boolean
}

type TeacherPublicProfileRow = {
  teacher_id: string
  teacher_name: string
  intro: string | null
  specialty: string | null
  career_years: number
}

type TrialApplicationRow = {
  id: string
  class_id: string
  parent_id: string
  child_name: string
  child_grade: string
  requested_slot_at: string
  status: TrialApplicationSummary["status"]
  created_at: string
  classes?: Array<{
    title: string
  }> | null
}

type ScheduleBlockRow = {
  id: string
  teacher_id: string
  start_at: string
  end_at: string
  capacity: number
  type?: string
}

const mapTeacherProfile = (
  row: TeacherPublicProfileRow
): TeacherPublicProfile => ({
  teacherId: row.teacher_id,
  teacherName: row.teacher_name,
  intro: row.intro,
  specialty: row.specialty,
  careerYears: row.career_years
})

const mapClass = (
  row: ClassRow,
  teacherName: string | null
): ClassSummary => ({
  id: row.id,
  title: row.title,
  subject: row.subject,
  region: row.region,
  targetAge: row.target_age,
  description: row.description,
  trialPrice: row.trial_price,
  teacherId: row.teacher_id,
  teacherName,
  isActive: row.is_active
})

const mapApplication = (row: TrialApplicationRow): TrialApplicationSummary => ({
  id: row.id,
  classId: row.class_id,
  classTitle: row.classes?.[0]?.title ?? null,
  parentId: row.parent_id,
  childName: row.child_name,
  childGrade: row.child_grade,
  requestedSlotAt: row.requested_slot_at,
  status: row.status,
  createdAt: row.created_at
})

const mapAvailableSlot = (row: ScheduleBlockRow): AvailableScheduleSlot => ({
  id: row.id,
  teacherId: row.teacher_id,
  startAt: row.start_at,
  endAt: row.end_at,
  capacity: row.capacity,
  appliedCount: 0,
  remainingCount: row.capacity,
  isClosed: false
})

const ACTIVE_APPLICATION_STATUSES: TrialApplicationSummary["status"][] = [
  "new",
  "reviewing",
  "confirmed"
]

const getTeacherProfilesMap = async (teacherIds: string[]) => {
  if (teacherIds.length === 0) {
    return new Map<string, TeacherPublicProfile>()
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("teacher_public_profiles")
    .select("teacher_id, teacher_name, intro, specialty, career_years")
    .in("teacher_id", teacherIds)

  if (error) {
    throw new Error("failed_to_fetch_teacher_profiles")
  }

  const mapped = (data ?? []).map((row) =>
    mapTeacherProfile(row as TeacherPublicProfileRow)
  )

  return new Map<string, TeacherPublicProfile>(
    mapped.map((profile) => [profile.teacherId, profile])
  )
}

export const supabaseDataAdapter: DataAdapter = {
  async listClasses() {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("classes")
      .select(
        "id, title, subject, region, target_age, description, trial_price, teacher_id, is_active"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_classes")
    }

    const classRows = (data ?? []) as ClassRow[]
    const teacherIds = classRows
      .map((row) => row.teacher_id)
      .filter((id): id is string => Boolean(id))
    const teacherMap = await getTeacherProfilesMap(teacherIds)

    return classRows.map((row) => {
      const teacherName = row.teacher_id
        ? (teacherMap.get(row.teacher_id)?.teacherName ?? null)
        : null

      return mapClass(row, teacherName)
    })
  },
  async getClassById(classId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("classes")
      .select(
        "id, title, subject, region, target_age, description, trial_price, teacher_id, is_active"
      )
      .eq("id", classId)
      .eq("is_active", true)
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_fetch_class")
    }

    if (!data) {
      return null
    }

    const classRow = data as ClassRow
    let teacherProfile: TeacherPublicProfile | null = null
    if (classRow.teacher_id) {
      const teacherMap = await getTeacherProfilesMap([classRow.teacher_id])
      teacherProfile = teacherMap.get(classRow.teacher_id) ?? null
    }

    const detail: ClassDetail = {
      ...mapClass(classRow, teacherProfile?.teacherName ?? null),
      teacherProfile
    }

    return detail
  },
  async listAvailableScheduleSlotsByClassId(classId) {
    const supabase = await getSupabaseServerClient()
    const { data: classData, error: classError } = await supabase
      .from("classes")
      .select("teacher_id")
      .eq("id", classId)
      .eq("is_active", true)
      .maybeSingle()

    if (classError) {
      throw new Error("failed_to_fetch_class_for_slots")
    }

    if (!classData || !classData.teacher_id) {
      return []
    }

    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from("schedule_blocks")
      .select("id, teacher_id, start_at, end_at, capacity")
      .eq("teacher_id", classData.teacher_id)
      .eq("type", "available")
      .gt("start_at", nowIso)
      .order("start_at", { ascending: true })

    if (error) {
      throw new Error("failed_to_fetch_available_schedule_slots")
    }

    const scheduleRows = (data ?? []) as ScheduleBlockRow[]
    if (scheduleRows.length === 0) {
      return []
    }

    // TODO: migrate aggregation key from (class_id + requested_slot_at) to selected_schedule_block_id when the schema is expanded.
    const requestedSlotValues = scheduleRows.map((row) => row.start_at)
    const { data: activeApplications, error: activeApplicationsError } = await supabase
      .from("trial_applications")
      .select("requested_slot_at")
      .eq("class_id", classId)
      .in("status", ACTIVE_APPLICATION_STATUSES)
      .in("requested_slot_at", requestedSlotValues)

    if (activeApplicationsError) {
      throw new Error("failed_to_count_slot_applications")
    }

    const appliedCountBySlotStart = new Map<number, number>()
    for (const item of activeApplications ?? []) {
      const slotAtTime = new Date(item.requested_slot_at).getTime()
      appliedCountBySlotStart.set(slotAtTime, (appliedCountBySlotStart.get(slotAtTime) ?? 0) + 1)
    }

    return scheduleRows.map((row) => {
      const mapped = mapAvailableSlot(row)
      const slotAtTime = new Date(mapped.startAt).getTime()
      const appliedCount = appliedCountBySlotStart.get(slotAtTime) ?? 0
      const remainingCount = Math.max(0, mapped.capacity - appliedCount)

      return {
        ...mapped,
        appliedCount,
        remainingCount,
        isClosed: remainingCount <= 0
      }
    })
  },
  async listMyApplications(parentId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("trial_applications")
      .select(
        "id, class_id, parent_id, child_name, child_grade, requested_slot_at, status, created_at, classes(title)"
      )
      .eq("parent_id", parentId)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_my_trial_applications")
    }

    return ((data ?? []) as TrialApplicationRow[]).map(mapApplication)
  },
  async createTrialApplication(input: TrialApplicationInput) {
    const supabase = await getSupabaseServerClient()
    if (!input.selectedScheduleBlockId) {
      throw new Error("invalid_schedule_slot")
    }

    const { data: classData, error: classError } = await supabase
      .from("classes")
      .select("teacher_id")
      .eq("id", input.classId)
      .eq("is_active", true)
      .maybeSingle()

    if (classError || !classData?.teacher_id) {
      throw new Error("invalid_schedule_slot")
    }

    const nowIso = new Date().toISOString()
    const { data: slotData, error: slotError } = await supabase
      .from("schedule_blocks")
      .select("id, teacher_id, start_at, end_at, capacity, type")
      .eq("id", input.selectedScheduleBlockId)
      .eq("teacher_id", classData.teacher_id)
      .eq("type", "available")
      .gt("start_at", nowIso)
      .maybeSingle()

    if (slotError || !slotData) {
      throw new Error("invalid_schedule_slot")
    }

    const matchedSlot = mapAvailableSlot(slotData as ScheduleBlockRow)
    const { data: activeApplications, error: activeApplicationsError } = await supabase
      .from("trial_applications")
      .select("requested_slot_at")
      .eq("class_id", input.classId)
      .eq("requested_slot_at", matchedSlot.startAt)
      .in("status", ACTIVE_APPLICATION_STATUSES)

    if (activeApplicationsError) {
      throw new Error("failed_to_validate_trial_application")
    }

    const appliedCount = (activeApplications ?? []).length
    if (appliedCount >= matchedSlot.capacity) {
      throw new Error("slot_capacity_reached")
    }

    const { data: existing, error: existingError } = await supabase
      .from("trial_applications")
      .select("id")
      .eq("parent_id", input.parentId)
      .eq("class_id", input.classId)
      .eq("child_name", input.childName)
      .eq("requested_slot_at", matchedSlot.startAt)
      .in("status", ACTIVE_APPLICATION_STATUSES)
      .maybeSingle()

    if (existingError) {
      throw new Error("failed_to_validate_trial_application")
    }

    if (existing) {
      throw new Error("duplicate_trial_application")
    }

    const { data, error } = await supabase
      .from("trial_applications")
      .insert({
        parent_id: input.parentId,
        class_id: input.classId,
        child_name: input.childName,
        child_grade: input.childGrade,
        requested_slot_at: matchedSlot.startAt,
        memo: input.memo,
        status: "new"
      })
      .select(
        "id, class_id, parent_id, child_name, child_grade, requested_slot_at, status, created_at, classes(title)"
      )
      .single()

    if (error || !data) {
      throw new Error("failed_to_create_trial_application")
    }

    const insertedApplication = data as TrialApplicationRow

    const { error: logError } = await supabase.from("application_logs").insert({
      application_id: insertedApplication.id,
      from_status: null,
      to_status: "new",
      actor_id: input.parentId,
      note: "학부모 체험 신청 생성"
    })

    if (logError) {
      throw new Error("failed_to_create_application_log")
    }

    return mapApplication(insertedApplication)
  }
}
