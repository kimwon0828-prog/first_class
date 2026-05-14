import { getSupabaseServerClient } from "@/integrations/supabase/server"
import type {
  ApplicationLogEntry,
  AvailableScheduleSlot,
  ClassDetail,
  ClassSummary,
  DataAdapter,
  StudioApplicationDetail,
  StudioApplicationSummary,
  TeacherPublicProfile,
  TeacherSignupRequest,
  TeacherSignupRequestStatus,
  TrialApplicationInput,
  TrialApplicationSummary,
  UpdateStudioApplicationStatusInput
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
  confirmed_slot_at?: string | null
  confirmed_schedule_block_id?: string | null
  assigned_teacher_id?: string | null
  memo?: string | null
  status: TrialApplicationSummary["status"]
  created_at: string
  updated_at: string
  classes?: Array<{
    title: string
    subject?: string
    region?: string
  }> | null
}

type ApplicationLogRow = {
  id: string
  application_id: string
  from_status: TrialApplicationSummary["status"] | null
  to_status: TrialApplicationSummary["status"]
  actor_id: string
  note: string | null
  created_at: string
}

type ProfileActorRow = {
  id: string
  name: string
}

type ScheduleBlockRow = {
  id: string
  teacher_id: string
  start_at: string
  end_at: string
  capacity: number
  type?: string
}

type TeacherSignupRequestRow = {
  id: string
  user_id: string
  status: TeacherSignupRequestStatus
  teacher_name: string
  teacher_phone: string | null
  organization_name: string
  branch_name: string | null
  organization_phone: string | null
  request_note: string | null
  created_at: string
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
  confirmedSlotAt: row.confirmed_slot_at ?? null,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const mapStudioApplication = (row: TrialApplicationRow): StudioApplicationSummary => ({
  ...mapApplication(row),
  classSubject: row.classes?.[0]?.subject ?? null,
  classRegion: row.classes?.[0]?.region ?? null,
  assignedTeacherId: row.assigned_teacher_id ?? null
})

const mapApplicationLog = (
  row: ApplicationLogRow,
  actorNameById: Map<string, string>
): ApplicationLogEntry => ({
  id: row.id,
  applicationId: row.application_id,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  actorId: row.actor_id,
  actorName: actorNameById.get(row.actor_id) ?? null,
  note: row.note,
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

const mapTeacherSignupRequest = (row: TeacherSignupRequestRow): TeacherSignupRequest => ({
  id: row.id,
  userId: row.user_id,
  status: row.status,
  teacherName: row.teacher_name,
  teacherPhone: row.teacher_phone,
  organizationName: row.organization_name,
  branchName: row.branch_name,
  organizationPhone: row.organization_phone,
  requestNote: row.request_note,
  createdAt: row.created_at
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

const getActorNameMap = async (actorIds: string[]) => {
  if (actorIds.length === 0) {
    return new Map<string, string>()
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", actorIds)

  if (error) {
    throw new Error("failed_to_fetch_application_log_actors")
  }

  return new Map<string, string>(
    ((data ?? []) as ProfileActorRow[]).map((row) => [row.id, row.name])
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
        "id, class_id, parent_id, child_name, child_grade, requested_slot_at, confirmed_slot_at, status, created_at, updated_at, classes(title)"
      )
      .eq("parent_id", parentId)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_my_trial_applications")
    }

    return ((data ?? []) as TrialApplicationRow[]).map(mapApplication)
  },
  async listStudioApplications(organizationId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("trial_applications")
      .select(
        "id, class_id, parent_id, child_name, child_grade, requested_slot_at, confirmed_slot_at, assigned_teacher_id, status, created_at, updated_at, classes!inner(title, subject, region, organization_id)"
      )
      .eq("classes.organization_id", organizationId)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_studio_applications")
    }

    return ((data ?? []) as TrialApplicationRow[]).map(mapStudioApplication)
  },
  async getStudioApplicationDetail(applicationId, organizationId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("trial_applications")
      .select(
        "id, class_id, parent_id, child_name, child_grade, requested_slot_at, confirmed_slot_at, confirmed_schedule_block_id, assigned_teacher_id, memo, status, created_at, updated_at, classes!inner(title, subject, region, organization_id)"
      )
      .eq("id", applicationId)
      .eq("classes.organization_id", organizationId)
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_fetch_studio_application_detail")
    }

    if (!data) {
      return null
    }

    const { data: logData, error: logError } = await supabase
      .from("application_logs")
      .select("id, application_id, from_status, to_status, actor_id, note, created_at")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })

    if (logError) {
      throw new Error("failed_to_fetch_application_logs")
    }

    const logRows = (logData ?? []) as ApplicationLogRow[]
    const actorIds = Array.from(new Set(logRows.map((row) => row.actor_id)))
    const actorNameById = await getActorNameMap(actorIds)

    const detail: StudioApplicationDetail = {
      ...mapStudioApplication(data as TrialApplicationRow),
      confirmedScheduleBlockId: (data as TrialApplicationRow).confirmed_schedule_block_id ?? null,
      memo: (data as TrialApplicationRow).memo ?? null,
      logs: logRows.map((row) => mapApplicationLog(row, actorNameById))
    }

    return detail
  },
  async updateStudioApplicationStatus(input: UpdateStudioApplicationStatusInput) {
    const supabase = await getSupabaseServerClient()
    const updatePayload: {
      status: TrialApplicationSummary["status"]
      updated_at: string
      confirmed_slot_at?: string | null
    } = {
      status: input.nextStatus,
      updated_at: new Date().toISOString()
    }

    if (input.nextStatus === "confirmed") {
      const { data: currentRow, error: currentError } = await supabase
        .from("trial_applications")
        .select("requested_slot_at")
        .eq("id", input.applicationId)
        .maybeSingle()

      if (currentError || !currentRow) {
        throw new Error("failed_to_prepare_application_status_update")
      }

      updatePayload.confirmed_slot_at = currentRow.requested_slot_at
    }

    const { data, error } = await supabase
      .from("trial_applications")
      .update(updatePayload)
      .eq("id", input.applicationId)
      .eq("status", input.currentStatus)
      .select("id")
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_update_application_status")
    }

    if (!data) {
      throw new Error("application_status_conflict")
    }

    const { error: logError } = await supabase.from("application_logs").insert({
      application_id: input.applicationId,
      from_status: input.currentStatus,
      to_status: input.nextStatus,
      actor_id: input.actorId,
      note: input.note
    })

    if (logError) {
      throw new Error("failed_to_create_application_log")
    }
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
        "id, class_id, parent_id, child_name, child_grade, requested_slot_at, confirmed_slot_at, status, created_at, updated_at, classes(title)"
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
  },
  async getPendingTeacherSignupRequest(userId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("teacher_signup_requests")
      .select("id, user_id, status, teacher_name, teacher_phone, organization_name, branch_name, organization_phone, request_note, created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_fetch_teacher_signup_request")
    }

    if (!data) {
      return null
    }

    return mapTeacherSignupRequest(data as TeacherSignupRequestRow)
  },
  async createTeacherSignupRequest(input) {
    const supabase = await getSupabaseServerClient()
    const { data: existing, error: existingError } = await supabase
      .from("teacher_signup_requests")
      .select("id")
      .eq("user_id", input.userId)
      .in("status", ["pending", "approved"])
      .maybeSingle()

    if (existingError) {
      throw new Error("failed_to_validate_teacher_signup_request")
    }

    if (existing) {
      throw new Error("already_requested_or_approved")
    }

    const { data, error } = await supabase
      .from("teacher_signup_requests")
      .insert({
        user_id: input.userId,
        status: "pending",
        teacher_name: input.teacherName,
        teacher_phone: input.teacherPhone,
        organization_name: input.organizationName,
        branch_name: input.branchName,
        organization_phone: input.organizationPhone,
        request_note: input.requestNote
      })
      .select("id, user_id, status, teacher_name, teacher_phone, organization_name, branch_name, organization_phone, request_note, created_at")
      .single()

    if (error || !data) {
      throw new Error("failed_to_create_teacher_signup_request")
    }

    return mapTeacherSignupRequest(data as TeacherSignupRequestRow)
  }
}
