import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getPublicEnv } from "@/shared/config/env"
import type { AcademyArea } from "@/shared/config/academy-areas"
import type {
  ApplicationLogEntry,
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  AvailableScheduleSlot,
  ChildProfile,
  ChildProfileInput,
  ClassProgramType,
  ClassDetail,
  ClassSummary,
  DataAdapter,
  MyDashboardData,
  OrganizationLocationInfo,
  StudioApplicationDetail,
  StudioApplicationSummary,
  StudioClassInput,
  StudioClassScheduleItem,
  StudioScheduleBlockSummary,
  StudioScheduleBlockType,
  StudioClassScheduleType,
  StudioDashboardTeacherFilterOption,
  StudioTeacherSeatSummary,
  StudioTeacherSummary,
  TeacherPublicProfile,
  TeacherSignupRequest,
  TeacherSignupRequestStatus,
  TrialApplicationInput,
  TrialApplicationSummary,
  UpdateChildProfileInput,
  UpdateStudioApplicationAssigneeInput,
  UpdateStudioApplicationOutcomeInput,
  UpdateStudioApplicationStatusInput
} from "@/shared/lib/db/adapter"

type ClassRow = {
  id: string
  organization_id?: string
  program_type: ClassProgramType
  title: string
  subject: string
  region: AcademyArea
  target_age: string
  class_format?: string | null
  description: string
  recommended_for?: string | null
  experience_points?: string | null
  curriculum?: string | null
  teacher_intro?: string | null
  trial_price: number
  teacher_id: string | null
  teacher_display_name?: string | null
  cover_image_url?: string | null
  is_active: boolean
  organizations?: OrganizationLocationRow[] | OrganizationLocationRow | null
  class_schedules?: ClassScheduleRow[] | null
}

type TeacherPublicProfileRow = {
  teacher_id: string
  teacher_name: string
  intro: string | null
  specialty: string | null
  career_years: number
}

type OrganizationRow = {
  id: string
  name: string
}

type OrganizationLocationRow = {
  name: string
  branch_name?: string | null
  address?: string | null
  address_detail?: string | null
}

type EmbeddedClassRow = {
  program_type?: ClassProgramType
  title: string
  subject?: string
  region?: string
  is_active?: boolean
}

type TrialApplicationRow = {
  id: string
  class_id: string
  parent_id: string
  child_id?: string | null
  child_name: string
  child_grade: string
  parent_name?: string | null
  parent_phone?: string | null
  child_school?: string | null
  child_notes?: string | null
  subject_experience_yn?: boolean | null
  subject_experience_duration?: string | null
  current_level?: string | null
  preferred_regular_schedule?: string | null
  goal_type?: string | null
  goal_note?: string | null
  requested_slot_at: string
  class_schedule_id?: string | null
  requested_schedule_block_id?: string | null
  selected_schedule_label?: string | null
  confirmed_slot_at?: string | null
  confirmed_schedule_block_id?: string | null
  assigned_teacher_id?: string | null
  contacted_at?: string | null
  scheduled_at?: string | null
  completed_at?: string | null
  enrolled_at?: string | null
  canceled_at?: string | null
  no_show_at?: string | null
  consultation_note?: string | null
  trial_feedback?: string | null
  final_level?: string | null
  final_schedule?: string | null
  registration_status?: ApplicationRegistrationStatus
  registered_course?: string | null
  unregistered_reason?: ApplicationUnregisteredReason | null
  follow_up_note?: string | null
  memo?: string | null
  status: TrialApplicationSummary["status"]
  created_at: string
  updated_at: string
  classes?: EmbeddedClassRow[] | EmbeddedClassRow | null
}

type ChildProfileRow = {
  id: string
  parent_id: string
  name: string
  grade: string
  school_name?: string | null
  notes?: string | null
  current_level?: string | null
  interest_subjects?: string | null
  goal_note?: string | null
  created_at: string
  updated_at: string
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

type ScheduleBlockRow = {
  id: string
  teacher_id: string
  class_id?: string | null
  start_at: string
  end_at: string
  capacity: number
  type?: string
}

type ClassScheduleRow = {
  id: string
  class_id: string
  schedule_type: StudioClassScheduleType
  day_of_week?: number | null
  specific_date?: string | null
  start_time: string
  end_time: string
  capacity?: number | null
  display_label?: string | null
  sort_order?: number | null
  created_at?: string
}

type TeacherSignupRequestRow = {
  id: string
  user_id: string
  status: TeacherSignupRequestStatus
  teacher_name: string
  teacher_phone: string | null
  organization_name: string
  academy_area: AcademyArea
  branch_name: string | null
  address: string | null
  address_detail: string | null
  organization_phone: string | null
  request_note: string | null
  created_at: string
}

type TeacherRow = {
  id: string
  profile_id: string | null
  organization_id: string
  display_name: string
  phone: string | null
  sms_enabled: boolean
  specialty: string | null
  intro: string | null
  career_years: number
  is_active: boolean
  created_at: string
}

type StudioDashboardTeacherFilterRow = {
  id: string
  display_name: string
}

type TeacherDisplayRow = {
  id: string
  display_name: string | null
  profile_id: string | null
}

type OrganizationTeacherSeatRow = {
  id: string
  teacher_seat_limit: number | null
}

type ProfileNameRow = {
  id: string
  name: string | null
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
): ClassSummary => {
  const resolvedTeacherName = teacherName ?? row.teacher_display_name ?? null

  return {
    id: row.id,
    programType: row.program_type,
    title: row.title,
    subject: row.subject,
    region: row.region,
    targetAge: row.target_age,
    classFormat: row.class_format ?? null,
    description: row.description,
    recommendedFor: row.recommended_for ?? null,
    experiencePoints: row.experience_points ?? null,
    curriculum: row.curriculum ?? null,
    teacherIntro: row.teacher_intro ?? null,
    trialPrice: row.trial_price,
    teacherId: row.teacher_id,
    teacherDisplayName: resolvedTeacherName,
    teacherName: resolvedTeacherName,
    coverImageUrl: row.cover_image_url ?? null,
    isActive: row.is_active,
    schedules: (row.class_schedules ?? []).map(mapClassSchedule)
  }
}

const mapClassSchedule = (row: ClassScheduleRow): StudioClassScheduleItem => ({
  id: row.id,
  scheduleType: row.schedule_type,
  dayOfWeek: row.day_of_week ?? null,
  specificDate: row.specific_date ?? null,
  startTime: row.start_time,
  endTime: row.end_time,
  capacity: row.capacity ?? null,
  displayLabel: row.display_label ?? null,
  sortOrder: row.sort_order ?? 0
})

const CLASS_SCHEDULE_SELECT_FIELDS =
  "id, class_id, schedule_type, day_of_week, specific_date, start_time, end_time, capacity, display_label, sort_order, created_at"

const attachClassSchedulesToRows = async (
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  rows: ClassRow[]
) => {
  const classIds = rows.map((row) => row.id)
  if (classIds.length === 0) {
    return rows.map((row) => ({ ...row, class_schedules: [] as ClassScheduleRow[] }))
  }

  const { data, error } = await supabase
    .from("class_schedules")
    .select(CLASS_SCHEDULE_SELECT_FIELDS)
    .in("class_id", classIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error("failed_to_fetch_studio_class_schedules")
  }

  const schedulesByClassId = new Map<string, ClassScheduleRow[]>()
  for (const row of (data ?? []) as ClassScheduleRow[]) {
    const current = schedulesByClassId.get(row.class_id) ?? []
    current.push(row)
    schedulesByClassId.set(row.class_id, current)
  }

  return rows.map((row) => ({
    ...row,
    class_schedules: schedulesByClassId.get(row.id) ?? []
  }))
}

const getEmbeddedOrganization = (row: ClassRow): OrganizationLocationRow | null => {
  if (!row.organizations) {
    return null
  }

  if (Array.isArray(row.organizations)) {
    return row.organizations[0] ?? null
  }

  return row.organizations
}

const mapOrganizationLocation = (row: OrganizationLocationRow | null): OrganizationLocationInfo | null => {
  if (!row) {
    return null
  }

  return {
    name: row.name,
    branchName: row.branch_name ?? null,
    address: row.address ?? null,
    addressDetail: row.address_detail ?? null
  }
}

const getEmbeddedClass = (row: TrialApplicationRow): EmbeddedClassRow | null => {
  if (!row.classes) {
    return null
  }

  if (Array.isArray(row.classes)) {
    return row.classes[0] ?? null
  }

  return row.classes
}

const mapApplication = (row: TrialApplicationRow): TrialApplicationSummary => {
  const embeddedClass = getEmbeddedClass(row)

  return {
    id: row.id,
    classId: row.class_id,
    classTitle: embeddedClass?.title ?? null,
    classProgramType: embeddedClass?.program_type ?? null,
    parentId: row.parent_id,
    childName: row.child_name,
    childGrade: row.child_grade,
    parentName: row.parent_name ?? null,
    parentPhone: row.parent_phone ?? null,
    classScheduleId: row.class_schedule_id ?? null,
    requestedScheduleBlockId: row.requested_schedule_block_id ?? null,
    selectedScheduleLabel: row.selected_schedule_label ?? null,
    requestedSlotAt: row.requested_slot_at,
    confirmedSlotAt: row.confirmed_slot_at ?? null,
    status: row.status,
    goalType: row.goal_type ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const mapChildProfile = (row: ChildProfileRow): ChildProfile => ({
  id: row.id,
  parentId: row.parent_id,
  name: row.name,
  grade: row.grade,
  schoolName: row.school_name ?? null,
  notes: row.notes ?? null,
  currentLevel: row.current_level ?? null,
  interestSubjects: row.interest_subjects ?? null,
  goalNote: row.goal_note ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const mapStudioApplication = (
  row: TrialApplicationRow,
  teacherNameById: Map<string, string> = new Map()
): StudioApplicationSummary => {
  const embeddedClass = getEmbeddedClass(row)

  return {
    ...mapApplication(row),
    classSubject: embeddedClass?.subject ?? null,
    classRegion: embeddedClass?.region ?? null,
    assignedTeacherId: row.assigned_teacher_id ?? null,
    assignedTeacherName: row.assigned_teacher_id
      ? teacherNameById.get(row.assigned_teacher_id) ?? null
      : null,
    contactedAt: row.contacted_at ?? null,
    scheduledAt: row.scheduled_at ?? null,
    completedAt: row.completed_at ?? null,
    canceledAt: row.canceled_at ?? null,
    noShowAt: row.no_show_at ?? null,
    enrolledAt: row.enrolled_at ?? null,
    registrationStatus: row.registration_status ?? "undecided"
  }
}

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
  source: "schedule_block",
  optionId: `schedule_block:${row.id}`,
  classScheduleId: null,
  scheduleBlockId: row.id,
  teacherId: row.teacher_id,
  classId: row.class_id ?? null,
  label: formatConcreteOccurrenceLabel(row.start_at, row.end_at),
  startAt: row.start_at,
  endAt: row.end_at,
  capacity: row.capacity,
  appliedCount: 0,
  remainingCount: row.capacity,
  isClosed: false
})

const mapClassScheduleOccurrenceSlot = (input: {
  row: ClassScheduleRow
  teacherId: string
  startAt: string
  endAt: string
  label: string
  capacity: number
  appliedCount: number
  scheduleBlockId: string | null
  isClosed?: boolean
}): AvailableScheduleSlot => {
  const remainingCount = Math.max(0, input.capacity - input.appliedCount)
  return {
    id: `class_schedule:${input.row.id}:${input.startAt}`,
    source: "class_schedule",
    optionId: `class_schedule:${input.row.id}:${input.startAt}`,
    classScheduleId: input.row.id,
    scheduleBlockId: input.scheduleBlockId,
    teacherId: input.teacherId,
    classId: input.row.class_id,
    label: input.label,
    startAt: input.startAt,
    endAt: input.endAt,
    capacity: input.capacity,
    appliedCount: input.appliedCount,
    remainingCount,
    isClosed: input.isClosed ?? remainingCount <= 0
  }
}

const mapScheduleBlockType = (value: string | undefined): StudioScheduleBlockType => {
  if (
    value === "regular" ||
    value === "available" ||
    value === "blocked" ||
    value === "trial_booked"
  ) {
    return value
  }

  return "blocked"
}

const mapStudioScheduleBlock = (
  row: ScheduleBlockRow,
  appliedCount = 0
): StudioScheduleBlockSummary => {
  const remainingCount = Math.max(0, row.capacity - appliedCount)

  return {
    id: row.id,
    teacherId: row.teacher_id,
    classId: row.class_id ?? null,
    type: mapScheduleBlockType(row.type),
    startAt: row.start_at,
    endAt: row.end_at,
    capacity: row.capacity,
    appliedCount,
    remainingCount,
    isClosed: remainingCount <= 0
  }
}

const mapTeacherSignupRequest = (row: TeacherSignupRequestRow): TeacherSignupRequest => ({
  id: row.id,
  userId: row.user_id,
  status: row.status,
  teacherName: row.teacher_name,
  teacherPhone: row.teacher_phone,
  organizationName: row.organization_name,
  academyArea: row.academy_area,
  branchName: row.branch_name,
  address: row.address,
  addressDetail: row.address_detail,
  organizationPhone: row.organization_phone,
  requestNote: row.request_note,
  createdAt: row.created_at
})

const mapStudioTeacher = (
  row: TeacherRow,
  profileNameById: Map<string, string>
): StudioTeacherSummary => ({
  id: row.id,
  profileId: row.profile_id,
  organizationId: row.organization_id,
  displayName:
    row.display_name?.trim() || (row.profile_id ? profileNameById.get(row.profile_id) : null) || "이름 미등록 선생님",
  phone: row.phone?.trim() ? row.phone.trim() : null,
  smsEnabled: Boolean(row.sms_enabled),
  specialty: row.specialty,
  intro: row.intro,
  careerYears: row.career_years,
  isActive: row.is_active,
  createdAt: row.created_at
})

const ACTIVE_APPLICATION_STATUSES: TrialApplicationSummary["status"][] = [
  "new",
  "reviewing",
  "confirmed"
]

const WEEKDAY_LABELS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일"
] as const

const WEEKLY_OCCURRENCE_COUNT = 4

const formatTimeText = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed
}

const formatConcreteOccurrenceLabel = (startAt: string, endAt: string) => {
  const startDate = new Date(startAt)
  const endDate = new Date(endAt)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return startAt
  }

  const dateText = `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(2, "0")}.${String(
    startDate.getDate()
  ).padStart(2, "0")}`
  const weekdayText = WEEKDAY_LABELS[startDate.getDay()]
  const timeText = `${String(startDate.getHours()).padStart(2, "0")}:${String(
    startDate.getMinutes()
  ).padStart(2, "0")}~${String(endDate.getHours()).padStart(2, "0")}:${String(
    endDate.getMinutes()
  ).padStart(2, "0")}`

  return `${dateText} ${weekdayText} ${timeText}`
}

const buildOccurrenceRange = (dateText: string, startTime: string, endTime: string) => {
  const startDate = new Date(`${dateText}T${startTime}`)
  const endDate = new Date(`${dateText}T${endTime}`)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return null
  }

  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString()
  }
}

const formatClassScheduleDefaultLabel = (row: ClassScheduleRow, startAt: string, endAt: string) => {
  if (row.display_label?.trim()) {
    return row.display_label.trim()
  }

  return formatConcreteOccurrenceLabel(startAt, endAt)
}

const generateUpcomingClassScheduleOccurrences = (
  row: ClassScheduleRow,
  now: Date = new Date()
): Array<{ startAt: string; endAt: string; label: string }> => {
  const startTime = formatTimeText(row.start_time)
  const endTime = formatTimeText(row.end_time)

  if (row.schedule_type === "one_time") {
    if (!row.specific_date) {
      return []
    }

    const occurrence = buildOccurrenceRange(row.specific_date, startTime, endTime)
    if (!occurrence) {
      return []
    }

    return new Date(occurrence.startAt) > now
      ? [{ ...occurrence, label: formatClassScheduleDefaultLabel(row, occurrence.startAt, occurrence.endAt) }]
      : []
  }

  if (row.day_of_week == null || row.day_of_week < 0 || row.day_of_week > 6) {
    return []
  }

  const occurrences: Array<{ startAt: string; endAt: string; label: string }> = []
  const baseDate = new Date(now)
  baseDate.setHours(0, 0, 0, 0)

  for (let dayOffset = 0; dayOffset < 56 && occurrences.length < WEEKLY_OCCURRENCE_COUNT; dayOffset += 1) {
    const candidate = new Date(baseDate)
    candidate.setDate(baseDate.getDate() + dayOffset)

    if (candidate.getDay() !== row.day_of_week) {
      continue
    }

    const dateText = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(
      candidate.getDate()
    ).padStart(2, "0")}`
    const occurrence = buildOccurrenceRange(dateText, startTime, endTime)
    if (!occurrence) {
      continue
    }

    if (new Date(occurrence.startAt) <= now) {
      continue
    }

    occurrences.push({
      ...occurrence,
      label: formatClassScheduleDefaultLabel(row, occurrence.startAt, occurrence.endAt)
    })
  }

  return occurrences
}

const parseSelectedScheduleOptionId = (value: string | undefined) => {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }

  if (normalized.startsWith("schedule_block:")) {
    const scheduleBlockId = normalized.slice("schedule_block:".length).trim()
    return scheduleBlockId ? ({ source: "schedule_block", scheduleBlockId } as const) : null
  }

  if (normalized.startsWith("class_schedule:")) {
    const [, classScheduleId, ...startAtParts] = normalized.split(":")
    const occurrenceStartAt = startAtParts.join(":").trim()
    if (!classScheduleId || !occurrenceStartAt) {
      return null
    }

    return { source: "class_schedule", classScheduleId, occurrenceStartAt } as const
  }

  return null
}

const buildRequestedOccurrenceEndAt = (
  requestedSlotAt: string,
  classScheduleRow: Pick<ClassScheduleRow, "start_time" | "end_time">
) => {
  const startDate = new Date(requestedSlotAt)
  if (Number.isNaN(startDate.getTime())) {
    return null
  }

  const startTimeText = formatTimeText(classScheduleRow.start_time)
  const endTimeText = formatTimeText(classScheduleRow.end_time)
  const startHour = Number(startTimeText.slice(0, 2))
  const startMinute = Number(startTimeText.slice(3, 5))
  const endHour = Number(endTimeText.slice(0, 2))
  const endMinute = Number(endTimeText.slice(3, 5))

  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
    return null
  }

  if (
    startDate.getHours() !== startHour ||
    startDate.getMinutes() !== startMinute
  ) {
    return null
  }

  const endDate = new Date(startDate)
  endDate.setHours(endHour, endMinute, 0, 0)

  if (endDate <= startDate) {
    return null
  }

  return endDate.toISOString()
}

const TEACHER_SELECT_FIELDS =
  "id, profile_id, organization_id, display_name, phone, sms_enabled, specialty, intro, career_years, is_active, created_at"

const getProfileNameMap = async (profileIds: string[]) => {
  if (profileIds.length === 0) {
    return new Map<string, string>()
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", profileIds)

  if (error) {
    throw new Error("failed_to_fetch_profile_names")
  }

  return new Map<string, string>(
    ((data ?? []) as ProfileNameRow[])
      .filter((row): row is ProfileNameRow & { name: string } => typeof row.name === "string")
      .map((row) => [row.id, row.name])
  )
}

const getStudioTeacherDisplayNameMap = async (teacherIds: string[]) => {
  const uniqueTeacherIds = Array.from(new Set(teacherIds.filter(Boolean)))
  if (uniqueTeacherIds.length === 0) {
    return new Map<string, string>()
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("teachers")
    .select("id, display_name, profile_id")
    .in("id", uniqueTeacherIds)

  if (error) {
    throw new Error("failed_to_fetch_assigned_teacher_names")
  }

  const teacherRows = (data ?? []) as TeacherDisplayRow[]
  const profileNameById = await getProfileNameMap(
    teacherRows
      .map((row) => row.profile_id)
      .filter((profileId): profileId is string => Boolean(profileId))
  )

  return new Map<string, string>(
    teacherRows.map((row) => [
      row.id,
      row.display_name?.trim() ||
        (row.profile_id ? profileNameById.get(row.profile_id) : null) ||
        "이름 미등록 선생님"
    ])
  )
}

const getTeacherNamesByIds = async (teacherIds: string[]) => {
  let teacherMap = new Map<string, TeacherPublicProfile>()
  try {
    teacherMap = await getTeacherProfilesMap(teacherIds)
  } catch {
    teacherMap = new Map<string, TeacherPublicProfile>()
  }

  return new Map<string, string>(
    teacherIds.map((teacherId) => [teacherId, teacherMap.get(teacherId)?.teacherName ?? "이름 미정"])
  )
}

const getAppliedCountByTeacherScheduleBlockId = async (
  teacherId: string,
  scheduleRows: ScheduleBlockRow[]
) => {
  if (scheduleRows.length === 0) {
    return new Map<string, number>()
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("trial_applications")
    .select("requested_schedule_block_id, requested_slot_at, classes!inner(teacher_id)")
    .eq("classes.teacher_id", teacherId)
    .in("status", ACTIVE_APPLICATION_STATUSES)

  if (error) {
    throw new Error("failed_to_count_teacher_schedule_applications")
  }

  const counts = new Map<string, number>()
  const slotIdByStartAt = new Map(scheduleRows.map((row) => [row.start_at, row.id]))

  for (const item of data ?? []) {
    const matchedSlotId =
      item.requested_schedule_block_id ??
      (typeof item.requested_slot_at === "string"
        ? (slotIdByStartAt.get(item.requested_slot_at) ?? null)
        : null)

    if (!matchedSlotId) {
      continue
    }

    counts.set(matchedSlotId, (counts.get(matchedSlotId) ?? 0) + 1)
  }

  return counts
}

const getAppliedCountByClassScheduleBlockId = async (
  classId: string,
  scheduleRows: ScheduleBlockRow[]
) => {
  if (scheduleRows.length === 0) {
    return new Map<string, number>()
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("trial_applications")
    .select("requested_schedule_block_id, requested_slot_at")
    .eq("class_id", classId)
    .in("status", ACTIVE_APPLICATION_STATUSES)

  if (error) {
    throw new Error("failed_to_count_class_schedule_applications")
  }

  const counts = new Map<string, number>()
  const slotIdByStartAt = new Map(scheduleRows.map((row) => [row.start_at, row.id]))

  for (const item of data ?? []) {
    const matchedSlotId =
      item.requested_schedule_block_id ??
      (typeof item.requested_slot_at === "string"
        ? (slotIdByStartAt.get(item.requested_slot_at) ?? null)
        : null)

    if (!matchedSlotId) {
      continue
    }

    counts.set(matchedSlotId, (counts.get(matchedSlotId) ?? 0) + 1)
  }

  return counts
}

const assertTeacherBelongsToOrganization = async (teacherId: string, organizationId: string) => {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("teachers")
    .select("id")
    .eq("id", teacherId)
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(
      formatSupabaseError("invalid_teacher_for_organization", error, {
        teacherId,
        organizationId
      })
    )
  }

  if (!data) {
    throw new Error(
      `invalid_teacher_for_organization | payload=${JSON.stringify({
        teacherId,
        organizationId
      })}`
    )
  }
}

const formatSupabaseError = (
  context: string,
  error: {
    message?: string | null
    code?: string | null
    details?: string | null
    hint?: string | null
  },
  payload?: Record<string, unknown>
) => {
  const parts = [
    context,
    `message=${error.message ?? "unknown"}`,
    `code=${error.code ?? "unknown"}`,
    `details=${error.details ?? "none"}`
  ]

  if (error.hint) {
    parts.push(`hint=${error.hint}`)
  }

  if (payload) {
    parts.push(`payload=${JSON.stringify(payload)}`)
  }

  return parts.join(" | ")
}

const normalizeStudioClassId = (value: string | undefined) => {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  return uuidPattern.test(normalized) ? normalized : null
}

const normalizeStudioClassScheduleTimeForDb = (value: string) => {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value
}

type DbClassSchedulePayload = {
  id?: string
  class_id: string
  schedule_type: StudioClassScheduleType
  day_of_week: number | null
  specific_date: string | null
  start_time: string
  end_time: string
  capacity: number | null
  display_label: string | null
  sort_order: number
  updated_at: string
}

type DbClassScheduleInsertPayload = Omit<DbClassSchedulePayload, "id">

const omitIdFromDbClassSchedulePayload = (
  payload: DbClassSchedulePayload
): DbClassScheduleInsertPayload => ({
  class_id: payload.class_id,
  schedule_type: payload.schedule_type,
  day_of_week: payload.day_of_week,
  specific_date: payload.specific_date,
  start_time: payload.start_time,
  end_time: payload.end_time,
  capacity: payload.capacity,
  display_label: payload.display_label,
  sort_order: payload.sort_order,
  updated_at: payload.updated_at
})

const toDbClassSchedulePayload = (
  classId: string,
  slots: StudioClassInput["scheduleSlots"]
) => {
  return (slots ?? []).map((slot, index) => {
    const payload: DbClassSchedulePayload = {
      class_id: classId,
      schedule_type: slot.scheduleType,
      day_of_week: slot.scheduleType === "weekly" ? slot.dayOfWeek : null,
      specific_date: slot.scheduleType === "one_time" ? slot.specificDate : null,
      start_time: normalizeStudioClassScheduleTimeForDb(slot.startTime),
      end_time: normalizeStudioClassScheduleTimeForDb(slot.endTime),
      capacity: slot.capacity,
      display_label: slot.displayLabel,
      sort_order: slot.sortOrder ?? index,
      updated_at: new Date().toISOString()
    }
    const normalizedId = normalizeStudioClassId(slot.id)
    if (normalizedId) {
      payload.id = normalizedId
    }

    return payload
  })
}

const summarizeStudioClassScheduleSlots = (slots: StudioClassInput["scheduleSlots"]) =>
  (slots ?? []).map((slot) => ({
    id: slot.id ?? null,
    scheduleType: slot.scheduleType,
    dayOfWeek: slot.dayOfWeek,
    specificDate: slot.specificDate,
    startTime: slot.startTime,
    endTime: slot.endTime,
    capacity: slot.capacity,
    displayLabel: slot.displayLabel,
    sortOrder: slot.sortOrder
  }))

const CLASS_BASE_SELECT_FIELDS =
  "id, organization_id, program_type, title, subject, region, target_age, description, trial_price, teacher_id, teacher_display_name, cover_image_url, is_active"

const ORGANIZATION_LOCATION_SELECT_FIELDS = "organizations(name, branch_name, address, address_detail)"
const ORGANIZATION_BASE_SELECT_FIELDS = "organizations(name, branch_name)"

const CLASS_DETAIL_SELECT_FIELDS =
  `${CLASS_BASE_SELECT_FIELDS}, class_format, recommended_for, experience_points, curriculum, teacher_intro, ${ORGANIZATION_LOCATION_SELECT_FIELDS}`

const CLASS_BASE_FALLBACK_SELECT_FIELDS = `${CLASS_BASE_SELECT_FIELDS}, ${ORGANIZATION_BASE_SELECT_FIELDS}`

const isMissingColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) {
    return false
  }

  const code = typeof error.code === "string" ? error.code : ""
  const message = typeof error.message === "string" ? error.message : ""
  return code === "42703" || message.includes("does not exist")
}

const SCHEDULE_BLOCK_SELECT_FIELDS = "id, teacher_id, class_id, start_at, end_at, capacity, type"
const CHILD_SELECT_FIELDS =
  "id, parent_id, name, grade, school_name, notes, current_level, interest_subjects, goal_note, created_at, updated_at"

const shouldDebugDb = () => process.env.NEXT_PUBLIC_DEBUG_DB === "1"

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
  try {
    return await getProfileNameMap(actorIds)
  } catch {
    throw new Error("failed_to_fetch_application_log_actors")
  }
}

const getStudioTeacherSeatSummaryByOrganization = async (
  organizationId: string
): Promise<StudioTeacherSeatSummary> => {
  const supabase = await getSupabaseServerClient()
  const [{ data: organizationRow, error: organizationError }, { count: activeTeacherCount, error: countError }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, teacher_seat_limit")
        .eq("id", organizationId)
        .maybeSingle(),
      supabase
        .from("teachers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .is("profile_id", null)
    ])

  if (organizationError || !organizationRow) {
    throw new Error("failed_to_fetch_organization_teacher_seat_limit")
  }

  if (countError) {
    throw new Error("failed_to_count_active_teachers")
  }

  const teacherSeatLimit = Math.max(1, (organizationRow as OrganizationTeacherSeatRow).teacher_seat_limit ?? 3)
  const safeActiveTeacherCount = activeTeacherCount ?? 0

  return {
    organizationId,
    teacherSeatLimit,
    activeTeacherCount: safeActiveTeacherCount,
    remainingTeacherSeats: Math.max(0, teacherSeatLimit - safeActiveTeacherCount)
  }
}

export const supabaseDataAdapter: DataAdapter = {
  async listClasses(options) {
    const debugEnabled = shouldDebugDb()
    const searchTerm = options?.query?.trim() ? options.query.trim() : ""
    const subject = options?.subject?.trim() ? options.subject.trim() : ""
    if (debugEnabled) {
      const { supabaseUrl } = getPublicEnv()
      console.info(
        `[listClasses] ${JSON.stringify({
          called: true,
          supabaseHost: new URL(supabaseUrl).host,
          region: options?.region ?? null,
          subject: subject || null,
          query: searchTerm || null
        })}`
      )
    }

    const supabase = await getSupabaseServerClient()
    let query = supabase
      .from("classes")
      .select(CLASS_BASE_SELECT_FIELDS)
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (options?.region) {
      query = query.eq("region", options.region)
    }

    if (subject) {
      query = query.eq("subject", subject)
    }

    const { data, error } = await query

    if (error) {
      if (debugEnabled) {
        console.error("[listClasses] classes query failed", {
          message: error.message ?? null,
          code: (error as { code?: string }).code ?? null,
          details: (error as { details?: string }).details ?? null
        })
      }
      throw new Error("failed_to_fetch_classes")
    }

    const classRows = (data ?? []) as ClassRow[]
    if (debugEnabled) {
      console.info(
        `[listClasses] ${JSON.stringify({ classesRows: classRows.length })}`
      )
    }
    const teacherIds = classRows
      .map((row) => row.teacher_id)
      .filter((id): id is string => Boolean(id))
    let teacherMap = new Map<string, TeacherPublicProfile>()
    try {
      teacherMap = await getTeacherProfilesMap(teacherIds)
    } catch {
      teacherMap = new Map<string, TeacherPublicProfile>()
    }
    if (debugEnabled) {
      console.info(
        `[listClasses] ${JSON.stringify({
          teacherIds: teacherIds.length,
          teacherProfiles: teacherMap.size
        })}`
      )
    }

    const organizationIds = Array.from(
      new Set(
        classRows
          .map((row) => row.organization_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    )
    let organizationNameById = new Map<string, string>()
    try {
      if (organizationIds.length > 0) {
        const { data: organizationData, error: organizationError } = await supabase
          .from("organizations")
          .select("id, name")
          .in("id", organizationIds)

        if (!organizationError) {
          organizationNameById = new Map<string, string>(
            ((organizationData ?? []) as OrganizationRow[]).map((row) => [row.id, row.name])
          )
        }
      }
    } catch {
      organizationNameById = new Map<string, string>()
    }

    const normalizeText = (value: string | null | undefined) =>
      (value ?? "").toString().trim().toLowerCase()

    const needle = normalizeText(searchTerm)
    const shouldFilterByQuery = Boolean(needle)

    const mapped = classRows
      .map((row) => {
        const teacherName = row.teacher_id
          ? (teacherMap.get(row.teacher_id)?.teacherName ?? null)
          : null
        const organizationName = row.organization_id
          ? (organizationNameById.get(row.organization_id) ?? null)
          : null

        return {
          mapped: mapClass(row, teacherName),
          haystacks: [
            row.title,
            row.description,
            row.subject,
            row.teacher_display_name ?? null,
            teacherName,
            organizationName
          ]
        }
      })
      .filter(({ haystacks }) => {
        if (!shouldFilterByQuery) {
          return true
        }

        return haystacks.map(normalizeText).some((value) => value.includes(needle))
      })
      .map(({ mapped }) => mapped)
    if (debugEnabled) {
      console.info(`[listClasses] ${JSON.stringify({ returned: mapped.length })}`)
    }

    return mapped
  },
  async getClassById(classId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("classes")
      .select(CLASS_DETAIL_SELECT_FIELDS)
      .eq("id", classId)
      .eq("is_active", true)
      .maybeSingle()

    if (isMissingColumnError(error)) {
      const retry = await supabase
        .from("classes")
        .select(CLASS_BASE_FALLBACK_SELECT_FIELDS)
        .eq("id", classId)
        .eq("is_active", true)
        .maybeSingle()

      if (retry.error) {
        throw new Error("failed_to_fetch_class")
      }

      if (!retry.data) {
        return null
      }

      const classRow = retry.data as ClassRow
      let teacherProfile: TeacherPublicProfile | null = null
      if (classRow.teacher_id) {
        try {
          const teacherMap = await getTeacherProfilesMap([classRow.teacher_id])
          teacherProfile = teacherMap.get(classRow.teacher_id) ?? null
        } catch {
          teacherProfile = null
        }
      }

      const detail: ClassDetail = {
        ...mapClass(classRow, teacherProfile?.teacherName ?? null),
        teacherProfile,
        organization: mapOrganizationLocation(getEmbeddedOrganization(classRow))
      }

      return detail
    }

    if (error) {
      throw new Error("failed_to_fetch_class")
    }

    if (!data) {
      return null
    }

    const classRow = data as ClassRow
    let teacherProfile: TeacherPublicProfile | null = null
    if (classRow.teacher_id) {
      try {
        const teacherMap = await getTeacherProfilesMap([classRow.teacher_id])
        teacherProfile = teacherMap.get(classRow.teacher_id) ?? null
      } catch {
        teacherProfile = null
      }
    }

    const detail: ClassDetail = {
      ...mapClass(classRow, teacherProfile?.teacherName ?? null),
      teacherProfile,
      organization: mapOrganizationLocation(getEmbeddedOrganization(classRow))
    }

    return detail
  },
  async listStudioClasses(organizationId) {
    const debugEnabled = shouldDebugDb()
    if (debugEnabled) {
      const { supabaseUrl } = getPublicEnv()
      console.info("[listStudioClasses] start", {
        supabaseHost: new URL(supabaseUrl).host,
        organizationId
      })
    }

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("classes")
      .select(CLASS_DETAIL_SELECT_FIELDS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })

    if (isMissingColumnError(error)) {
      const retry = await supabase
        .from("classes")
        .select(CLASS_BASE_SELECT_FIELDS)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })

      if (retry.error) {
        throw new Error("failed_to_fetch_studio_classes")
      }

      const classRows = (retry.data ?? []) as ClassRow[]
      const classRowsWithSchedules = await attachClassSchedulesToRows(supabase, classRows)
      if (debugEnabled) {
        console.info("[listStudioClasses] classes fetched (fallback)", { rows: classRows.length })
      }
      const teacherIds = Array.from(
        new Set(classRowsWithSchedules.map((row) => row.teacher_id).filter((id): id is string => Boolean(id)))
      )
      let teacherMap = new Map<string, TeacherPublicProfile>()
      try {
        teacherMap = await getTeacherProfilesMap(teacherIds)
      } catch {
        teacherMap = new Map<string, TeacherPublicProfile>()
      }
      if (debugEnabled) {
        console.info("[listStudioClasses] teacher profiles (fallback)", {
          teacherIds: teacherIds.length,
          teacherProfiles: teacherMap.size
        })
      }

      const mapped = classRowsWithSchedules.map((row) =>
        mapClass(row, row.teacher_id ? (teacherMap.get(row.teacher_id)?.teacherName ?? null) : null)
      )
      if (debugEnabled) {
        console.info("[listStudioClasses] done (fallback)", { returned: mapped.length })
      }

      return mapped
    }

    if (error) {
      if (debugEnabled) {
        console.error("[listStudioClasses] classes query failed", {
          message: error.message ?? null,
          code: (error as { code?: string }).code ?? null,
          details: (error as { details?: string }).details ?? null
        })
      }
      throw new Error("failed_to_fetch_studio_classes")
    }

    const classRows = await attachClassSchedulesToRows(supabase, (data ?? []) as ClassRow[])
    if (debugEnabled) {
      console.info("[listStudioClasses] classes fetched", { rows: classRows.length })
    }
    const teacherIds = Array.from(
      new Set(classRows.map((row) => row.teacher_id).filter((id): id is string => Boolean(id)))
    )
    let teacherMap = new Map<string, TeacherPublicProfile>()
    try {
      teacherMap = await getTeacherProfilesMap(teacherIds)
    } catch {
      teacherMap = new Map<string, TeacherPublicProfile>()
    }
    if (debugEnabled) {
      console.info("[listStudioClasses] teacher profiles", {
        teacherIds: teacherIds.length,
        teacherProfiles: teacherMap.size
      })
    }

    const mapped = classRows.map((row) =>
      mapClass(row, row.teacher_id ? (teacherMap.get(row.teacher_id)?.teacherName ?? null) : null)
    )
    if (debugEnabled) {
      console.info("[listStudioClasses] done", { returned: mapped.length })
    }

    return mapped
  },
  async listStudioTeacherOptions(organizationId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("teachers")
      .select(TEACHER_SELECT_FIELDS)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("profile_id", null)
      .order("created_at", { ascending: true })

    if (error) {
      throw new Error("failed_to_fetch_studio_teacher_options")
    }

    const teacherRows = (data ?? []) as TeacherRow[]
    const profileNameById = await getProfileNameMap(
      teacherRows
        .map((row) => row.profile_id)
        .filter((profileId): profileId is string => Boolean(profileId))
    )

    return teacherRows.map((row) => ({
      teacherId: row.id,
      teacherName:
        row.display_name?.trim() || (row.profile_id ? profileNameById.get(row.profile_id) : null) || "이름 미정"
    }))
  },
  async listStudioDashboardTeacherFilterOptions(organizationId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("teachers")
      .select("id, display_name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("profile_id", null)
      .order("created_at", { ascending: true })

    if (error) {
      throw new Error("failed_to_fetch_dashboard_teacher_filter_options")
    }

    return ((data ?? []) as StudioDashboardTeacherFilterRow[]).map(
      (row): StudioDashboardTeacherFilterOption => ({
        teacherId: row.id,
        teacherName: row.display_name
      })
    )
  },
  async listStudioTeachers(organizationId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("teachers")
      .select(TEACHER_SELECT_FIELDS)
      .eq("organization_id", organizationId)
      .is("profile_id", null)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_studio_teachers")
    }

    const teacherRows = (data ?? []) as TeacherRow[]
    const profileNameById = await getProfileNameMap(
      teacherRows
        .map((row) => row.profile_id)
        .filter((profileId): profileId is string => Boolean(profileId))
    )

    return teacherRows.map((row) => mapStudioTeacher(row, profileNameById))
  },
  async getStudioTeacherSeatSummary(organizationId) {
    return getStudioTeacherSeatSummaryByOrganization(organizationId)
  },
  async createStudioTeacher(input) {
    const seatSummary = await getStudioTeacherSeatSummaryByOrganization(input.organizationId)
    if (seatSummary.activeTeacherCount >= seatSummary.teacherSeatLimit) {
      throw new Error("teacher_seat_limit_reached")
    }

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("teachers")
      .insert({
        profile_id: null,
        organization_id: input.organizationId,
        display_name: input.displayName,
        phone: input.phone,
        sms_enabled: input.smsEnabled,
        specialty: null,
        intro: null,
        career_years: 0,
        is_active: true
      })
      .select(TEACHER_SELECT_FIELDS)
      .maybeSingle()

    if (error || !data) {
      throw new Error(
        formatSupabaseError("failed_to_create_studio_teacher", error ?? {}, {
          organizationId: input.organizationId
        })
      )
    }

    return mapStudioTeacher(data as TeacherRow, new Map())
  },
  async updateStudioTeacher(input) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("teachers")
      .update({
        display_name: input.displayName,
        phone: input.phone,
        sms_enabled: input.smsEnabled,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.teacherId)
      .eq("organization_id", input.organizationId)
      .is("profile_id", null)
      .select(TEACHER_SELECT_FIELDS)
      .maybeSingle()

    if (error) {
      throw new Error(
        formatSupabaseError("failed_to_update_studio_teacher", error, {
          organizationId: input.organizationId,
          teacherId: input.teacherId
        })
      )
    }

    if (!data) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    const savedTeacher = data as TeacherRow
    const profileNameById = await getProfileNameMap(
      savedTeacher.profile_id ? [savedTeacher.profile_id] : []
    )

    return mapStudioTeacher(savedTeacher, profileNameById)
  },
  async deactivateStudioTeacher(input) {
    const supabase = await getSupabaseServerClient()
    const { data: targetTeacher, error: targetError } = await supabase
      .from("teachers")
      .select("id, profile_id, organization_id, is_active")
      .eq("id", input.teacherId)
      .eq("organization_id", input.organizationId)
      .maybeSingle()

    if (targetError) {
      throw new Error(
        formatSupabaseError("failed_to_fetch_studio_teacher_for_deactivate", targetError, {
          organizationId: input.organizationId,
          teacherId: input.teacherId
        })
      )
    }

    if (!targetTeacher) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    if (targetTeacher.profile_id) {
      throw new Error("cannot_deactivate_linked_teacher")
    }

    if (!targetTeacher.is_active) {
      return
    }

    const { error: updateError } = await supabase
      .from("teachers")
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.teacherId)
      .eq("organization_id", input.organizationId)
      .is("profile_id", null)

    if (updateError) {
      throw new Error(
        formatSupabaseError("failed_to_deactivate_studio_teacher", updateError, {
          organizationId: input.organizationId,
          teacherId: input.teacherId
        })
      )
    }
  },
  async upsertStudioClass(input) {
    const normalizedClassId = normalizeStudioClassId(input.classId)

    await assertTeacherBelongsToOrganization(input.teacherId, input.organizationId)
    const teacherNames = await getTeacherNamesByIds([input.teacherId])
    const teacherDisplayName = teacherNames.get(input.teacherId) ?? input.teacherDisplayName

    const supabase = await getSupabaseServerClient()
    const schedulePayloadForLog = summarizeStudioClassScheduleSlots(input.scheduleSlots)
    const basePayload = {
      organization_id: input.organizationId,
      program_type: input.programType,
      title: input.title,
      subject: input.subject,
      target_age: input.targetAge,
      region: input.region,
      description: input.description,
      trial_price: input.trialPrice,
      teacher_id: input.teacherId,
      teacher_display_name: teacherDisplayName,
      cover_image_url: input.coverImageUrl,
      is_active: input.isActive,
      updated_at: new Date().toISOString()
    }
    const detailPayload = {
      ...basePayload,
      class_format: input.classFormat,
      recommended_for: input.recommendedFor,
      experience_points: input.experiencePoints,
      curriculum: input.curriculum,
      teacher_intro: input.teacherIntro
    }

    if (input.mode === "update" && !normalizedClassId) {
      throw new Error("invalid_class_id_for_update")
    }

    const buildQuery = (payload: typeof basePayload | typeof detailPayload) =>
      input.mode === "update"
        ? supabase
            .from("classes")
            .update(payload)
            .eq("id", normalizedClassId)
            .eq("organization_id", input.organizationId)
        : supabase.from("classes").insert(payload)

    const initialResult = await buildQuery(detailPayload).select(CLASS_BASE_SELECT_FIELDS).maybeSingle()
    const { data, error } = isMissingColumnError(initialResult.error)
      ? await buildQuery(basePayload).select(CLASS_BASE_SELECT_FIELDS).maybeSingle()
      : initialResult

    if (error) {
      throw new Error(
        formatSupabaseError(
          input.mode === "create" ? "class_create_failed" : "class_update_failed",
          error,
          {
          mode: input.mode,
          classId: normalizedClassId,
          organizationId: input.organizationId,
          teacherId: input.teacherId,
          title: input.title,
          subject: input.subject,
          targetAge: input.targetAge,
          region: input.region,
          trialPrice: input.trialPrice
          }
        )
      )
    }

    let savedClassRow: ClassRow | null = (data as ClassRow | null) ?? null

    if (!savedClassRow) {
      if (input.mode === "create") {
        const { data: fallbackRow, error: fallbackError } = await supabase
          .from("classes")
          .select(CLASS_BASE_SELECT_FIELDS)
          .eq("organization_id", input.organizationId)
          .eq("teacher_id", input.teacherId)
          .eq("title", input.title)
          .eq("subject", input.subject)
          .eq("target_age", input.targetAge)
          .eq("region", input.region)
          .eq("trial_price", input.trialPrice)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (fallbackError) {
          throw new Error(
            formatSupabaseError("create_studio_class_fallback_lookup_failed", fallbackError, {
              mode: input.mode,
              classId: normalizedClassId,
              organizationId: input.organizationId,
              teacherId: input.teacherId,
              title: input.title,
              subject: input.subject,
              targetAge: input.targetAge,
              region: input.region,
              trialPrice: input.trialPrice
            })
          )
        }

        if (fallbackRow) {
          savedClassRow = fallbackRow as ClassRow
        } else {
          throw new Error(
            `create_studio_class_inserted_but_no_visible_row_returned | payload=${JSON.stringify({
              mode: input.mode,
              organizationId: input.organizationId,
              teacherId: input.teacherId,
              title: input.title,
              subject: input.subject,
              targetAge: input.targetAge,
              region: input.region,
              trialPrice: input.trialPrice
            })}`
          )
        }
      } else {
        throw new Error(
          `studio_class_not_found_or_forbidden | payload=${JSON.stringify({
            mode: input.mode,
            classId: normalizedClassId,
            organizationId: input.organizationId,
            teacherId: input.teacherId
          })}`
        )
      }
    }

    const { data: existingScheduleData, error: existingScheduleError } = await supabase
      .from("class_schedules")
      .select(CLASS_SCHEDULE_SELECT_FIELDS)
      .eq("class_id", savedClassRow.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (existingScheduleError) {
      throw new Error(
        formatSupabaseError("class_schedule_fetch_failed", existingScheduleError, {
          mode: input.mode,
          classId: savedClassRow.id,
          organizationId: input.organizationId
        })
      )
    }

    const existingSchedules = (existingScheduleData ?? []) as ClassScheduleRow[]
    const existingScheduleIdSet = new Set(existingSchedules.map((slot) => slot.id))
    const normalizedSchedulePayload: Array<DbClassSchedulePayload | DbClassScheduleInsertPayload> =
      toDbClassSchedulePayload(savedClassRow.id, input.scheduleSlots).map((slot) => {
        if (slot.id && existingScheduleIdSet.has(slot.id)) {
          return slot
        }

        return omitIdFromDbClassSchedulePayload(slot)
      })
    const persistedSchedulePayload = normalizedSchedulePayload.filter(
      (slot): slot is DbClassSchedulePayload & { id: string } =>
        "id" in slot && typeof slot.id === "string"
    )
    const newSchedulePayload = normalizedSchedulePayload.filter(
      (slot): slot is DbClassScheduleInsertPayload =>
        !("id" in slot) || typeof slot.id !== "string"
    )
    const keptScheduleIdSet = new Set(persistedSchedulePayload.map((slot) => slot.id))
    const removedScheduleIds = existingSchedules
      .map((slot) => slot.id)
      .filter((scheduleId) => !keptScheduleIdSet.has(scheduleId))

    if (persistedSchedulePayload.length > 0) {
      const { error: updateScheduleError } = await supabase
        .from("class_schedules")
        .upsert(persistedSchedulePayload, { onConflict: "id" })

      if (updateScheduleError) {
        throw new Error(
          formatSupabaseError("class_schedule_update_failed", updateScheduleError, {
            mode: input.mode,
            classId: savedClassRow.id,
            organizationId: input.organizationId,
            teacherId: input.teacherId,
            scheduleSlots: schedulePayloadForLog
          })
        )
      }
    }

    if (newSchedulePayload.length > 0) {
      const { error: insertScheduleError } = await supabase.from("class_schedules").insert(newSchedulePayload)

      if (insertScheduleError) {
        throw new Error(
          formatSupabaseError("class_schedule_insert_failed", insertScheduleError, {
            mode: input.mode,
            classId: savedClassRow.id,
            organizationId: input.organizationId,
            teacherId: input.teacherId,
            scheduleSlots: schedulePayloadForLog
          })
        )
      }
    }

    if (removedScheduleIds.length > 0) {
      const { error: deleteScheduleError } = await supabase
        .from("class_schedules")
        .delete()
        .eq("class_id", savedClassRow.id)
        .in("id", removedScheduleIds)

      if (deleteScheduleError) {
        throw new Error(
          formatSupabaseError("class_schedule_delete_failed", deleteScheduleError, {
            mode: input.mode,
            classId: savedClassRow.id,
            organizationId: input.organizationId,
            teacherId: input.teacherId,
            removedScheduleIds,
            scheduleSlots: schedulePayloadForLog
          })
        )
      }
    }

    const { data: refreshedScheduleData, error: refreshedScheduleError } = await supabase
      .from("class_schedules")
      .select(CLASS_SCHEDULE_SELECT_FIELDS)
      .eq("class_id", savedClassRow.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (refreshedScheduleError) {
      throw new Error(
        formatSupabaseError("class_schedule_fetch_failed", refreshedScheduleError, {
          mode: input.mode,
          classId: savedClassRow.id,
          organizationId: input.organizationId
        })
      )
    }

    const savedTeacherIds = savedClassRow.teacher_id ? [savedClassRow.teacher_id] : []
    const teacherNameMap = await getTeacherProfilesMap(savedTeacherIds)
    const classWithSchedules = {
      ...savedClassRow,
      class_schedules: (refreshedScheduleData ?? []) as ClassScheduleRow[]
    }

    return mapClass(
      classWithSchedules as ClassRow,
      savedClassRow.teacher_id ? (teacherNameMap.get(savedClassRow.teacher_id)?.teacherName ?? null) : null
    )
  },
  async updateStudioClassActive(classId, organizationId, isActive) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("classes")
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq("id", classId)
      .eq("organization_id", organizationId)
      .select("id")
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_update_studio_class_active")
    }

    if (!data) {
      throw new Error("studio_class_not_found_or_forbidden")
    }
  },
  async listTeacherScheduleBlocks(teacherId) {
    const supabase = await getSupabaseServerClient()
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from("schedule_blocks")
      .select(SCHEDULE_BLOCK_SELECT_FIELDS)
      .eq("teacher_id", teacherId)
      .gte("end_at", nowIso)
      .order("start_at", { ascending: true })

    if (error) {
      throw new Error("failed_to_fetch_teacher_schedule_blocks")
    }

    const scheduleRows = (data ?? []) as ScheduleBlockRow[]
    const appliedCountBySlotId = await getAppliedCountByTeacherScheduleBlockId(teacherId, scheduleRows)

    return scheduleRows.map((row) =>
      mapStudioScheduleBlock(row, appliedCountBySlotId.get(row.id) ?? 0)
    )
  },
  async createStudioScheduleBlock(input) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("schedule_blocks")
      .insert({
        teacher_id: input.teacherId,
        class_id: input.classId ?? null,
        type: "available",
        start_at: input.startAt,
        end_at: input.endAt,
        capacity: input.capacity,
        updated_at: new Date().toISOString()
      })
      .select(SCHEDULE_BLOCK_SELECT_FIELDS)
      .maybeSingle()

    if (error || !data) {
      throw new Error("failed_to_create_studio_schedule_block")
    }

    return mapStudioScheduleBlock(data as ScheduleBlockRow, 0)
  },
  async updateStudioScheduleBlockType(input) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("schedule_blocks")
      .update({
        type: input.nextType,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.scheduleBlockId)
      .eq("teacher_id", input.teacherId)
      .select("id")
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_update_studio_schedule_block_type")
    }

    if (!data) {
      throw new Error("studio_schedule_block_not_found_or_forbidden")
    }
  },
  async listMyChildren(parentId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("children")
      .select(CHILD_SELECT_FIELDS)
      .eq("parent_id", parentId)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_my_children")
    }

    return ((data ?? []) as ChildProfileRow[]).map(mapChildProfile)
  },
  async createChildProfile(input: ChildProfileInput) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("children")
      .insert({
        parent_id: input.parentId,
        name: input.name,
        grade: input.grade,
        school_name: input.schoolName,
        notes: input.notes,
        current_level: input.currentLevel,
        interest_subjects: input.interestSubjects,
        goal_note: input.goalNote
      })
      .select(CHILD_SELECT_FIELDS)
      .single()

    if (error || !data) {
      throw new Error("failed_to_create_child_profile")
    }

    return mapChildProfile(data as ChildProfileRow)
  },
  async updateChildProfile(input: UpdateChildProfileInput) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("children")
      .update({
        name: input.name,
        grade: input.grade,
        school_name: input.schoolName,
        notes: input.notes,
        current_level: input.currentLevel,
        interest_subjects: input.interestSubjects,
        goal_note: input.goalNote,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.childId)
      .eq("parent_id", input.parentId)
      .select(CHILD_SELECT_FIELDS)
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_update_child_profile")
    }

    if (!data) {
      throw new Error("child_profile_not_found_or_forbidden")
    }

    return mapChildProfile(data as ChildProfileRow)
  },
  async getMyDashboard(parentId) {
    const supabase = await getSupabaseServerClient()
    const [applications, childrenCountResult] = await Promise.all([
      this.listMyApplications(parentId),
      supabase.from("children").select("id", { count: "exact", head: true }).eq("parent_id", parentId)
    ])

    if (childrenCountResult.error) {
      throw new Error("failed_to_fetch_my_dashboard")
    }

    const summary: MyDashboardData = {
      childrenCount: childrenCountResult.count ?? 0,
      totalApplicationCount: applications.length,
      newApplicationCount: applications.filter((item) => item.status === "new").length,
      reviewingApplicationCount: applications.filter((item) => item.status === "reviewing").length,
      confirmedApplicationCount: applications.filter((item) => item.status === "confirmed").length,
      completedApplicationCount: applications.filter((item) => item.status === "completed").length,
      canceledApplicationCount: applications.filter((item) => item.status === "canceled").length,
      recentApplications: applications.slice(0, 5)
    }

    return summary
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
    const { data: classScheduleData, error: classScheduleError } = await supabase
      .from("class_schedules")
      .select(CLASS_SCHEDULE_SELECT_FIELDS)
      .eq("class_id", classId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (classScheduleError) {
      throw new Error("failed_to_fetch_available_schedule_slots")
    }

    const classScheduleRows = (classScheduleData ?? []) as ClassScheduleRow[]

    if (classScheduleRows.length > 0) {
      const { data: existingBlockData, error: existingBlockError } = await supabase
        .from("schedule_blocks")
        .select(SCHEDULE_BLOCK_SELECT_FIELDS)
        .eq("class_id", classId)
        .gt("end_at", nowIso)
        .order("start_at", { ascending: true })

      if (existingBlockError) {
        throw new Error("failed_to_fetch_available_schedule_slots")
      }

      const existingBlocks = (existingBlockData ?? []) as ScheduleBlockRow[]
      const availableBlocks = existingBlocks.filter((row) => row.type === "available")
      const appliedCountBySlotId = await getAppliedCountByClassScheduleBlockId(classId, availableBlocks)
      const blockByRange = new Map<string, ScheduleBlockRow>()

      for (const block of existingBlocks) {
        const key = `${block.start_at}|${block.end_at}`
        const current = blockByRange.get(key)
        if (!current || current.type !== "available") {
          blockByRange.set(key, block)
        }
      }

      return classScheduleRows
        .flatMap((row) => {
          return generateUpcomingClassScheduleOccurrences(row).map((occurrence) => {
            const key = `${occurrence.startAt}|${occurrence.endAt}`
            const matchedBlock = blockByRange.get(key) ?? null
            const isAvailableBlock = matchedBlock?.type === "available"
            const capacity = matchedBlock?.capacity ?? Math.max(1, row.capacity ?? 1)
            const appliedCount =
              matchedBlock && isAvailableBlock ? (appliedCountBySlotId.get(matchedBlock.id) ?? 0) : 0

            return mapClassScheduleOccurrenceSlot({
              row,
              teacherId: classData.teacher_id,
              startAt: occurrence.startAt,
              endAt: occurrence.endAt,
              label: occurrence.label,
              capacity,
              appliedCount,
              scheduleBlockId: isAvailableBlock ? matchedBlock?.id ?? null : null,
              isClosed: matchedBlock != null && !isAvailableBlock ? true : undefined
            })
          })
        })
        .sort((a, b) => a.startAt.localeCompare(b.startAt))
    }

    const { data: primaryData, error: primaryError } = await supabase
      .from("schedule_blocks")
      .select("id, teacher_id, class_id, start_at, end_at, capacity")
      .eq("class_id", classId)
      .eq("type", "available")
      .gt("start_at", nowIso)
      .order("start_at", { ascending: true })

    if (primaryError) {
      throw new Error("failed_to_fetch_available_schedule_slots")
    }

    let scheduleRows = (primaryData ?? []) as ScheduleBlockRow[]
    let usesFallback = false

    if (scheduleRows.length === 0) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("schedule_blocks")
        .select("id, teacher_id, class_id, start_at, end_at, capacity")
        .is("class_id", null)
        .eq("teacher_id", classData.teacher_id)
        .eq("type", "available")
        .gt("start_at", nowIso)
        .order("start_at", { ascending: true })

      if (fallbackError) {
        throw new Error("failed_to_fetch_available_schedule_slots")
      }

      scheduleRows = (fallbackData ?? []) as ScheduleBlockRow[]
      usesFallback = scheduleRows.length > 0
    }

    if (scheduleRows.length === 0) {
      return []
    }

    const appliedCountBySlotId = usesFallback
      ? await getAppliedCountByTeacherScheduleBlockId(classData.teacher_id, scheduleRows)
      : await getAppliedCountByClassScheduleBlockId(classId, scheduleRows)

    return scheduleRows.map((row) => {
      const mapped = mapAvailableSlot(row)
      const appliedCount = appliedCountBySlotId.get(row.id) ?? 0
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
        "id, class_id, parent_id, child_name, child_grade, parent_name, parent_phone, class_schedule_id, requested_schedule_block_id, selected_schedule_label, requested_slot_at, confirmed_slot_at, goal_type, status, created_at, updated_at, classes(title, program_type, region)"
      )
      .eq("parent_id", parentId)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_my_trial_applications")
    }

    return ((data ?? []) as TrialApplicationRow[]).map(mapApplication)
  },
  async listStudioApplications(organizationId, options) {
    const supabase = await getSupabaseServerClient()
    let query = supabase
      .from("trial_applications")
      .select(
        "id, class_id, parent_id, child_name, child_grade, parent_name, parent_phone, class_schedule_id, requested_schedule_block_id, selected_schedule_label, requested_slot_at, confirmed_slot_at, assigned_teacher_id, contacted_at, scheduled_at, completed_at, enrolled_at, canceled_at, no_show_at, goal_type, registration_status, status, created_at, updated_at, classes!inner(title, subject, region, organization_id, program_type)"
      )
      .eq("classes.organization_id", organizationId)

    if (options?.teacherId) {
      query = query.eq("assigned_teacher_id", options.teacherId)
    }

    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_studio_applications")
    }

    const rows = (data ?? []) as TrialApplicationRow[]
    const teacherNameById = await getStudioTeacherDisplayNameMap(
      rows
        .map((row) => row.assigned_teacher_id)
        .filter((teacherId): teacherId is string => Boolean(teacherId))
    )

    return rows.map((row) => mapStudioApplication(row, teacherNameById))
  },
  async getStudioApplicationDetail(applicationId, organizationId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("trial_applications")
      .select(
        "id, class_id, parent_id, child_name, child_grade, parent_name, parent_phone, child_school, child_notes, subject_experience_yn, subject_experience_duration, current_level, preferred_regular_schedule, goal_type, goal_note, class_schedule_id, requested_slot_at, requested_schedule_block_id, selected_schedule_label, confirmed_slot_at, confirmed_schedule_block_id, assigned_teacher_id, contacted_at, scheduled_at, completed_at, enrolled_at, canceled_at, no_show_at, consultation_note, trial_feedback, final_level, final_schedule, registration_status, registered_course, unregistered_reason, follow_up_note, memo, status, created_at, updated_at, classes!inner(title, subject, region, organization_id, program_type)"
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

    const teacherNameById = await getStudioTeacherDisplayNameMap(
      (data as TrialApplicationRow).assigned_teacher_id
        ? [(data as TrialApplicationRow).assigned_teacher_id as string]
        : []
    )

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
      ...mapStudioApplication(data as TrialApplicationRow, teacherNameById),
      confirmedScheduleBlockId: (data as TrialApplicationRow).confirmed_schedule_block_id ?? null,
      childSchool: (data as TrialApplicationRow).child_school ?? null,
      childNotes: (data as TrialApplicationRow).child_notes ?? null,
      subjectExperienceYn: (data as TrialApplicationRow).subject_experience_yn ?? null,
      subjectExperienceDuration: (data as TrialApplicationRow).subject_experience_duration ?? null,
      currentLevel: (data as TrialApplicationRow).current_level ?? null,
      preferredRegularSchedule: (data as TrialApplicationRow).preferred_regular_schedule ?? null,
      goalNote: (data as TrialApplicationRow).goal_note ?? null,
      consultationNote: (data as TrialApplicationRow).consultation_note ?? null,
      trialFeedback: (data as TrialApplicationRow).trial_feedback ?? null,
      finalLevel: (data as TrialApplicationRow).final_level ?? null,
      finalSchedule: (data as TrialApplicationRow).final_schedule ?? null,
      registrationStatus:
        (data as TrialApplicationRow).registration_status ?? "undecided",
      registeredCourse: (data as TrialApplicationRow).registered_course ?? null,
      unregisteredReason:
        (data as TrialApplicationRow).unregistered_reason ?? null,
      followUpNote: (data as TrialApplicationRow).follow_up_note ?? null,
      memo: (data as TrialApplicationRow).memo ?? null,
      logs: logRows.map((row) => mapApplicationLog(row, actorNameById))
    }

    return detail
  },
  async updateStudioApplicationAssignee(input: UpdateStudioApplicationAssigneeInput) {
    const supabase = await getSupabaseServerClient()

    const { data: applicationData, error: applicationError } = await supabase
      .from("trial_applications")
      .select("id, classes!inner(organization_id)")
      .eq("id", input.applicationId)
      .eq("classes.organization_id", input.organizationId)
      .maybeSingle()

    if (applicationError) {
      throw new Error("failed_to_update_application_assignee")
    }

    if (!applicationData) {
      throw new Error("application_not_found_or_forbidden")
    }

    if (input.assignedTeacherId) {
      const { data: teacherData, error: teacherError } = await supabase
        .from("teachers")
        .select("id, organization_id, is_active, profile_id")
        .eq("id", input.assignedTeacherId)
        .eq("organization_id", input.organizationId)
        .eq("is_active", true)
        .is("profile_id", null)
        .maybeSingle()

      if (teacherError) {
        throw new Error("failed_to_update_application_assignee")
      }

      if (!teacherData) {
        throw new Error("invalid_teacher_for_application_organization")
      }
    }

    const { data: updatedData, error: updateError } = await supabase
      .from("trial_applications")
      .update({
        assigned_teacher_id: input.assignedTeacherId,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.applicationId)
      .select("id")
      .maybeSingle()

    if (updateError) {
      throw new Error("failed_to_update_application_assignee")
    }

    if (!updatedData) {
      throw new Error("application_not_found_or_forbidden")
    }
  },
  async updateStudioApplicationStatus(input: UpdateStudioApplicationStatusInput) {
    const supabase = await getSupabaseServerClient()
    const nowIso = new Date().toISOString()
    const updatePayload: {
      status: TrialApplicationSummary["status"]
      updated_at: string
      assigned_teacher_id?: string | null
      requested_schedule_block_id?: string | null
      confirmed_slot_at?: string | null
      confirmed_schedule_block_id?: string | null
      contacted_at?: string | null
      scheduled_at?: string | null
      completed_at?: string | null
      canceled_at?: string | null
      no_show_at?: string | null
    } = {
      status: input.nextStatus,
      updated_at: nowIso
    }

    if (input.actionType === "move_to_reviewing") {
      updatePayload.contacted_at = nowIso
    }

    if (input.actionType === "move_to_confirmed") {
      updatePayload.scheduled_at = nowIso
      const { data: currentRow, error: currentError } = await supabase
        .from("trial_applications")
        .select("class_id, requested_slot_at, requested_schedule_block_id, class_schedule_id, assigned_teacher_id")
        .eq("id", input.applicationId)
        .maybeSingle()

      if (currentError || !currentRow) {
        throw new Error("failed_to_prepare_application_status_update")
      }

      if (!currentRow.assigned_teacher_id) {
        const { data: classTeacherData, error: classTeacherError } = await supabase
          .from("classes")
          .select("teacher_id")
          .eq("id", currentRow.class_id)
          .maybeSingle()

        if (classTeacherError) {
          throw new Error("failed_to_prepare_application_status_update")
        }

        if (!classTeacherData?.teacher_id) {
          throw new Error("missing_class_teacher_for_confirmation")
        }

        updatePayload.assigned_teacher_id = classTeacherData.teacher_id
      }

      if (currentRow.requested_schedule_block_id) {
        updatePayload.confirmed_slot_at = currentRow.requested_slot_at
        updatePayload.confirmed_schedule_block_id = currentRow.requested_schedule_block_id
      } else if (currentRow.class_schedule_id) {
        const { data: classScheduleData, error: classScheduleError } = await supabase
          .from("class_schedules")
          .select("id, class_id, start_time, end_time, capacity")
          .eq("id", currentRow.class_schedule_id)
          .eq("class_id", currentRow.class_id)
          .maybeSingle()

        if (classScheduleError || !classScheduleData) {
          throw new Error("failed_to_prepare_application_status_update")
        }

        const requestedSlotAt = currentRow.requested_slot_at
        const requestedEndAt = buildRequestedOccurrenceEndAt(
          requestedSlotAt,
          classScheduleData as Pick<ClassScheduleRow, "start_time" | "end_time">
        )

        if (!requestedEndAt) {
          throw new Error("invalid_requested_class_schedule_occurrence")
        }

        const { data: existingBlockData, error: existingBlockError } = await supabase
          .from("schedule_blocks")
          .select("id, teacher_id, class_id, start_at, end_at, capacity, type")
          .eq("class_id", currentRow.class_id)
          .eq("start_at", requestedSlotAt)
          .eq("end_at", requestedEndAt)

        if (existingBlockError) {
          throw new Error("failed_to_prepare_application_status_update")
        }

        const existingBlocks = (existingBlockData ?? []) as ScheduleBlockRow[]
        const availableBlock = existingBlocks.find((row) => row.type === "available") ?? null

        if (!availableBlock && existingBlocks.length > 0) {
          throw new Error("schedule_block_conflict_for_requested_occurrence")
        }

        let resolvedBlock = availableBlock
        if (!resolvedBlock) {
          const { data: classData, error: classError } = await supabase
            .from("classes")
            .select("teacher_id")
            .eq("id", currentRow.class_id)
            .maybeSingle()

          if (classError) {
            throw new Error("failed_to_prepare_application_status_update")
          }

          if (!classData?.teacher_id) {
            throw new Error("missing_class_teacher_for_confirmation")
          }

          const capacity = Math.max(1, Number(classScheduleData.capacity ?? 1))
          const { data: createdBlock, error: createBlockError } = await supabase
            .from("schedule_blocks")
            .insert({
              teacher_id: classData.teacher_id,
              class_id: currentRow.class_id,
              type: "available",
              start_at: requestedSlotAt,
              end_at: requestedEndAt,
              capacity,
              updated_at: new Date().toISOString()
            })
            .select("id, teacher_id, class_id, start_at, end_at, capacity, type")
            .single()

          if (createBlockError || !createdBlock) {
            throw new Error("failed_to_create_schedule_block_for_confirmation")
          }

          resolvedBlock = createdBlock as ScheduleBlockRow
        }

        updatePayload.requested_schedule_block_id = resolvedBlock.id
        updatePayload.confirmed_slot_at = requestedSlotAt
        updatePayload.confirmed_schedule_block_id = resolvedBlock.id
      } else {
        throw new Error("missing_requested_schedule_block")
      }
    }

    if (input.actionType === "move_to_completed") {
      updatePayload.completed_at = nowIso
    }

    if (input.actionType === "cancel") {
      updatePayload.confirmed_slot_at = null
      updatePayload.confirmed_schedule_block_id = null
      updatePayload.canceled_at = nowIso
    }

    if (input.actionType === "no_show") {
      updatePayload.confirmed_slot_at = null
      updatePayload.confirmed_schedule_block_id = null
      updatePayload.no_show_at = nowIso
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
      console.warn(
        formatSupabaseError("non_critical_failed_to_create_application_log", logError, {
          applicationId: input.applicationId,
          fromStatus: input.currentStatus,
          toStatus: input.nextStatus,
          actorId: input.actorId
        })
      )
    }
  },
  async updateStudioApplicationOutcome(input: UpdateStudioApplicationOutcomeInput) {
    const supabase = await getSupabaseServerClient()
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from("trial_applications")
      .update({
        consultation_note: input.consultationNote,
        trial_feedback: input.trialFeedback,
        registered_course: input.registeredCourse,
        final_level: input.finalLevel,
        final_schedule: input.finalSchedule,
        follow_up_note: input.followUpNote,
        registration_status: input.registrationStatus,
        enrolled_at: input.registrationStatus === "enrolled" ? nowIso : null,
        unregistered_reason: input.unregisteredReason,
        updated_at: nowIso
      })
      .eq("id", input.applicationId)
      .eq("status", input.currentStatus)
      .select("id")
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_update_application_outcome")
    }

    if (!data) {
      throw new Error(
        input.currentStatus === "completed"
          ? "application_outcome_status_conflict"
          : "application_not_found_or_forbidden"
      )
    }

    const { error: logError } = await supabase.from("application_logs").insert({
      application_id: input.applicationId,
      from_status: input.currentStatus,
      to_status: input.currentStatus,
      actor_id: input.actorId,
      note: input.note
    })

    if (logError) {
      console.warn(
        formatSupabaseError("non_critical_failed_to_create_application_log", logError, {
          applicationId: input.applicationId,
          fromStatus: input.currentStatus,
          toStatus: input.currentStatus,
          actorId: input.actorId
        })
      )
    }
  },
  async createTrialApplication(input: TrialApplicationInput) {
    const supabase = await getSupabaseServerClient()
    const parsedScheduleOption = parseSelectedScheduleOptionId(
      input.selectedScheduleOptionId ??
        (input.selectedScheduleBlockId ? `schedule_block:${input.selectedScheduleBlockId}` : undefined)
    )

    if (!parsedScheduleOption) {
      throw new Error("invalid_schedule_slot")
    }

    const { data: classData, error: classError } = await supabase
      .from("classes")
      .select("teacher_id")
      .eq("id", input.classId)
      .eq("is_active", true)
      .maybeSingle()

    if (classError) {
      throw new Error("invalid_schedule_slot")
    }

    if (!classData?.teacher_id) {
      throw new Error("missing_class_teacher_for_application")
    }

    const nowIso = new Date().toISOString()
    let matchedSlot: AvailableScheduleSlot | null = null
    let requestedScheduleBlockId: string | null = null
    let requestedSlotAt = ""
    let classScheduleId: string | null = null
    let selectedScheduleLabel: string | null = null

    if (parsedScheduleOption.source === "schedule_block") {
      const { data: slotData, error: slotError } = await supabase
        .from("schedule_blocks")
        .select("id, teacher_id, class_id, start_at, end_at, capacity, type")
        .eq("id", parsedScheduleOption.scheduleBlockId)
        .eq("type", "available")
        .gt("start_at", nowIso)
        .maybeSingle()

      if (slotError || !slotData) {
        throw new Error("invalid_schedule_slot")
      }

      matchedSlot = mapAvailableSlot(slotData as ScheduleBlockRow)
      const isLinkedClassSlot = matchedSlot.classId === input.classId
      const isLegacyTeacherFallbackSlot =
        matchedSlot.classId == null && matchedSlot.teacherId === classData.teacher_id

      if (!isLinkedClassSlot && !isLegacyTeacherFallbackSlot) {
        throw new Error("invalid_schedule_slot")
      }

      const appliedCountBySlotId = isLegacyTeacherFallbackSlot
        ? await getAppliedCountByTeacherScheduleBlockId(classData.teacher_id, [slotData as ScheduleBlockRow])
        : await getAppliedCountByClassScheduleBlockId(input.classId, [slotData as ScheduleBlockRow])
      const appliedCount = appliedCountBySlotId.get(matchedSlot.scheduleBlockId ?? matchedSlot.id) ?? 0

      matchedSlot = {
        ...matchedSlot,
        appliedCount,
        remainingCount: Math.max(0, matchedSlot.capacity - appliedCount),
        isClosed: appliedCount >= matchedSlot.capacity
      }
      requestedScheduleBlockId = matchedSlot.scheduleBlockId
      requestedSlotAt = matchedSlot.startAt
      selectedScheduleLabel = matchedSlot.label
    } else {
      const { data: classScheduleData, error: classScheduleError } = await supabase
        .from("class_schedules")
        .select(CLASS_SCHEDULE_SELECT_FIELDS)
        .eq("id", parsedScheduleOption.classScheduleId)
        .eq("class_id", input.classId)
        .maybeSingle()

      if (classScheduleError || !classScheduleData) {
        throw new Error("invalid_schedule_slot")
      }

      const classScheduleRow = classScheduleData as ClassScheduleRow
      const occurrence = generateUpcomingClassScheduleOccurrences(classScheduleRow).find(
        (item) => item.startAt === parsedScheduleOption.occurrenceStartAt
      )

      if (!occurrence) {
        throw new Error("invalid_schedule_slot")
      }
      matchedSlot = mapClassScheduleOccurrenceSlot({
        row: classScheduleRow,
        teacherId: classData.teacher_id,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        label: occurrence.label,
        capacity: Math.max(1, classScheduleRow.capacity ?? 1),
        appliedCount: 0,
        scheduleBlockId: null
      })
      requestedSlotAt = occurrence.startAt
      classScheduleId = classScheduleRow.id
      selectedScheduleLabel = occurrence.label
    }

    if (!matchedSlot || !requestedSlotAt) {
      throw new Error("invalid_schedule_slot")
    }

    if (parsedScheduleOption.source === "schedule_block" && !requestedScheduleBlockId) {
      throw new Error("invalid_schedule_slot")
    }

    if (matchedSlot.appliedCount >= matchedSlot.capacity) {
      throw new Error("slot_capacity_reached")
    }

    const { data: existing, error: existingError } = await supabase
      .from("trial_applications")
      .select("id")
      .eq("parent_id", input.parentId)
      .eq("class_id", input.classId)
      .eq("child_name", input.childName)
      .eq("requested_slot_at", requestedSlotAt)
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
        assigned_teacher_id: classData.teacher_id,
        child_id: input.childId ?? null,
        child_name: input.childName,
        child_grade: input.childGrade,
        parent_name: input.parentName,
        parent_phone: input.parentPhone,
        child_school: input.childSchool,
        child_notes: input.childNotes,
        subject_experience_yn: input.subjectExperienceYn,
        subject_experience_duration: input.subjectExperienceDuration,
        current_level: input.currentLevel,
        preferred_regular_schedule: input.preferredRegularSchedule,
        goal_type: input.goalType,
        goal_note: input.goalNote,
        class_schedule_id: classScheduleId,
        requested_schedule_block_id: requestedScheduleBlockId,
        requested_slot_at: requestedSlotAt,
        selected_schedule_label: selectedScheduleLabel,
        memo: input.memo,
        status: "new"
      })
      .select(
        "id, class_id, parent_id, child_name, child_grade, parent_name, parent_phone, class_schedule_id, requested_schedule_block_id, selected_schedule_label, requested_slot_at, confirmed_slot_at, goal_type, status, created_at, updated_at, classes(title, program_type)"
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
      console.warn(
        formatSupabaseError("non_critical_failed_to_create_application_log", logError, {
          applicationId: insertedApplication.id,
          actorId: input.parentId
        })
      )
    }

    return mapApplication(insertedApplication)
  },
  async getPendingTeacherSignupRequest(userId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("teacher_signup_requests")
      .select("id, user_id, status, teacher_name, teacher_phone, organization_name, academy_area, branch_name, address, address_detail, organization_phone, request_note, created_at")
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
        academy_area: input.academyArea,
        branch_name: input.branchName,
        address: input.address,
        address_detail: input.addressDetail,
        organization_phone: input.organizationPhone,
        request_note: input.requestNote
      })
      .select("id, user_id, status, teacher_name, teacher_phone, organization_name, academy_area, branch_name, address, address_detail, organization_phone, request_note, created_at")
      .single()

    if (error || !data) {
      throw new Error("failed_to_create_teacher_signup_request")
    }

    return mapTeacherSignupRequest(data as TeacherSignupRequestRow)
  }
}
