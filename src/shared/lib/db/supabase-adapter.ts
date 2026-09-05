import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import {
  getActiveSubjectCategoryForWriteWithClient,
  getActiveSubjectForWriteByCodeWithClient,
  getActiveSubjectForWriteWithClient,
  loadSubjectMasterMapsByIdsWithClient
} from "@/features/subjects/queries/get-subject-master"
import { getPublicEnv } from "@/shared/config/env"
import { getConsultationPipelineGroup } from "@/shared/lib/consultation-pipeline"
import {
  buildClassSubjectWritePayload,
  resolveLegacySubjectChange
} from "@/shared/lib/class-subject-write"
import {
  buildSeoulOccurrenceRange,
  formatSeoulDateKey,
  formatSeoulOccurrenceLabel,
  resolveRequestedClassScheduleOccurrence
} from "@/shared/lib/seoul-datetime"
import {
  buildClassSubjectReadModel,
  formatClassSubjectDisplayLabel,
  resolveClassSubjectDisplay,
  type Subject,
  type SubjectCategory
} from "@/shared/lib/subject-master"
import { normalizeSubjectCategory } from "@/shared/constants/education-taxonomy"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import {
  EMPTY_STUDIO_CLASS_SCHEDULE_SUMMARY,
  summarizeStudioClassSchedules
} from "@/features/studio/lib/class-schedule-summary"
import type { StudioClassScheduleSummaryInput } from "@/features/studio/lib/class-schedule-summary"
import { isApplicationUnregisteredReason } from "@/shared/lib/db/adapter"
import type {
  StudioConsultationTransactionResult,
  StudioTrialResultSaveContext,
  ActivateStudioTeacherInput,
  StudioTeacherReferenceCounts,
  ApplicationLogEntry,
  ClassAssignmentMode,
  ApplicationRegistrationStatus,
  ConsultationLogActivityType,
  ConsultationLogChannel,
  ConsultationLogNextAction,
  ConsultationSentiment,
  CreateStudioConsultationLogInput,
  CreateStudioConsultationTransactionInput,
  OrganizationBillingSnapshot,
  OrganizationEntitlementOverride,
  OrganizationPaidPlanCode,
  OrganizationSubscription,
  OrganizationSubscriptionStatus,
  UpdateStudioConsultationLogInput,
  ApplicationUnregisteredReason,
  AvailableScheduleSlot,
  BulkCreateClassSchedulesInput,
  BulkCreateClassSchedulesPreview,
  BulkCreateClassSchedulesPreviewConflict,
  BulkCreateClassSchedulesPreviewItem,
  ChildProfile,
  ChildProfileInput,
  ClassProgramType,
  ClassDetail,
  ClassSummary,
  DataAdapter,
  MyDashboardData,
  OrganizationLocationInfo,
  StudioApplicationListOptions,
  StudioApplicationDetail,
  StudioApplicationSummary,
  StudioConsultationPipelineApplicationItem,
  StudioUnregisteredApplicationItem,
  StudioUnregisteredListOptions,
  StudioClassListItem,
  StudioClassScheduleSummary,
  StudioClassInput,
  StudioClassScheduleBookingStatus,
  StudioClassScheduleItem,
  StudioScheduleCalendarDay,
  StudioScheduleCalendarItem,
  StudioScheduleBlockSummary,
  StudioConsultationLog,
  StudioScheduleBlockType,
  StudioClassScheduleType,
  StudioDashboardTeacherFilterOption,
  StudioTeacherSummary,
  TeacherSignupRequest,
  TeacherSignupRequestStatus,
  TrialApplicationInput,
  UpsertStudioTrialResultInput,
  TrialApplicationSummary,
  StudioTrialResult,
  UpdateChildProfileInput,
  UpdateStudioApplicationAssigneeInput,
  RegularSchedulePreferenceWrite,
  UpdateStudioApplicationConsultationSnapshotInput,
  UpdateStudioApplicationLatestConsultationSnapshotInput,
  UpdateStudioApplicationOutcomeInput,
  UpdateStudioApplicationStatusInput
} from "@/shared/lib/db/adapter"

type ClassRow = {
  id: string
  organization_id?: string
  program_type: ClassProgramType
  assignment_mode?: ClassAssignmentMode | null
  title: string
  subject_category_id?: string | null
  subject_id?: string | null
  subject: string
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
  subject_master?: Subject | null
  subject_category_master?: SubjectCategory | null
}

type StudioClassListRow = {
  id: string
  program_type: ClassProgramType
  assignment_mode?: ClassAssignmentMode | null
  title: string
  subject_category_id?: string | null
  subject_id?: string | null
  subject: string
  target_age: string
  trial_price: number
  teacher_id: string | null
  teacher_display_name?: string | null
  cover_image_url?: string | null
  is_active: boolean
  subject_master?: Subject | null
  subject_category_master?: SubjectCategory | null
}

type OrganizationRow = {
  id: string
  name: string
}

type OrganizationLocationByIdRow = {
  id: string
  name: string
  branch_name?: string | null
  address?: string | null
  address_detail?: string | null
}

type OrganizationLocationRow = {
  name: string
  branch_name?: string | null
  address?: string | null
  address_detail?: string | null
  sido?: string | null
  sigungu?: string | null
  bname?: string | null
}

type EmbeddedClassOrganizationRow = Pick<
  OrganizationLocationRow,
  "name" | "sido" | "sigungu" | "bname"
>

type EmbeddedClassRow = {
  program_type?: ClassProgramType
  assignment_mode?: ClassAssignmentMode | null
  title: string
  subject?: string
  is_active?: boolean
  organization_id?: string | null
  organizations?: EmbeddedClassOrganizationRow | EmbeddedClassOrganizationRow[] | null
  teacher_display_name?: string | null
}

type EmbeddedClassScheduleRow = Pick<ClassScheduleRow, "start_time" | "end_time">

/** confirmed_schedule_block_id 로 embed 한 확정 예약 블록. 종료 시각의 1순위 source 다. */
type EmbeddedConfirmedBlockRow = {
  start_at: string | null
  end_at: string | null
}

type TrialApplicationRow = {
  id: string
  class_id: string
  /** 엑셀로 이관한 예약에는 학부모 계정이 없다. */
  parent_id: string | null
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
  unregistered_reason_note?: string | null
  lost_at?: string | null
  follow_up_note?: string | null
  next_contact_at?: string | null
  last_activity_at?: string | null
  regular_schedule_preference?: unknown
  regular_schedule_preference_note?: string | null
  regular_schedule_preference_updated_at?: string | null
  memo?: string | null
  status: TrialApplicationSummary["status"]
  created_at: string
  updated_at: string
  classes?: EmbeddedClassRow[] | EmbeddedClassRow | null
  class_schedules?: EmbeddedClassScheduleRow[] | EmbeddedClassScheduleRow | null
  confirmed_block?: EmbeddedConfirmedBlockRow[] | EmbeddedConfirmedBlockRow | null
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

/** 체험 결과의 "내용" 컬럼만. 저장 컨텍스트는 이 만큼만 읽는다. */
type TrialResultFieldsRow = {
  observations: string[] | null
  parent_reaction: string | null
  recommended_course: string | null
  recommended_level: string | null
  recommended_schedule: string | null
  next_action: string | null
  note: string | null
}

type TrialResultRow = TrialResultFieldsRow & {
  id: string
  application_id: string
  parent_reaction: string | null
  recommended_course: string | null
  recommended_level: string | null
  recommended_schedule: string | null
  next_action: string | null
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type ConsultationLogRow = {
  id: string
  application_id: string
  occurred_at: string
  activity_type: string
  channel: string | null
  sentiment: string | null
  registration_status_snapshot: string | null
  regular_schedule_preference_snapshot?: unknown
  regular_schedule_preference_note_snapshot?: string | null
  unregistered_reason_snapshot?: string | null
  unregistered_reason_note_snapshot?: string | null
  next_action: string | null
  next_contact_at: string | null
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
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
  booking_status?: StudioClassScheduleBookingStatus
  day_of_week?: number | null
  specific_date?: string | null
  series_id?: string | null
  start_time: string
  end_time: string
  capacity?: number | null
  display_label?: string | null
  sort_order?: number | null
  created_at?: string
  application_count?: number
}

type TeacherSignupRequestRow = {
  id: string
  user_id: string
  status: TeacherSignupRequestStatus
  teacher_name: string
  teacher_phone: string | null
  organization_name: string
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

type ProfileNameRow = {
  id: string
  name: string | null
}


const resolveClassAssignmentMode = (row: { assignment_mode?: string | null; teacher_id?: string | null }) => {
  if (row.assignment_mode === "post_assign" || row.assignment_mode === "preassigned") {
    return row.assignment_mode
  }

  return row.teacher_id ? "preassigned" : "post_assign"
}

const mapClass = (
  row: ClassRow,
  teacherName: string | null,
  options?: { allowClassTeacherFallback?: boolean }
): ClassSummary => {
  const resolvedTeacherName =
    teacherName ?? (options?.allowClassTeacherFallback === false ? null : row.teacher_display_name ?? null)

  return {
    id: row.id,
    programType: row.program_type,
    assignmentMode: resolveClassAssignmentMode(row),
    title: row.title,
    ...buildClassSubjectReadModel({
      subjectCategoryId: row.subject_category_id,
      masterCategory: row.subject_category_master,
      subjectId: row.subject_id,
      masterSubject: row.subject_master
    }),
    subject: row.subject,
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

const mapStudioClassListItem = (
  row: StudioClassListRow,
  teacherName: string | null,
  scheduleSummary: StudioClassScheduleSummary
): StudioClassListItem => {
  const resolvedTeacherName = teacherName ?? row.teacher_display_name ?? null

  return {
    id: row.id,
    programType: row.program_type,
    assignmentMode: resolveClassAssignmentMode(row),
    title: row.title,
    ...buildClassSubjectReadModel({
      subjectCategoryId: row.subject_category_id,
      masterCategory: row.subject_category_master,
      subjectId: row.subject_id,
      masterSubject: row.subject_master
    }),
    subject: row.subject,
    targetAge: row.target_age,
    trialPrice: row.trial_price,
    teacherId: row.teacher_id,
    teacherDisplayName: resolvedTeacherName,
    teacherName: resolvedTeacherName,
    coverImageUrl: row.cover_image_url ?? null,
    isActive: row.is_active,
    scheduleSummary
  }
}

const mapClassSchedule = (row: ClassScheduleRow): StudioClassScheduleItem => ({
  id: row.id,
  scheduleType: row.schedule_type,
  bookingStatus: row.booking_status ?? "open",
  dayOfWeek: row.day_of_week ?? null,
  specificDate: row.specific_date ?? null,
  seriesId: row.series_id ?? null,
  startTime: row.start_time,
  endTime: row.end_time,
  capacity: row.capacity ?? null,
  displayLabel: row.display_label ?? null,
  sortOrder: row.sort_order ?? 0,
  applicationCount: row.application_count ?? 0,
  isReferencedByApplications: (row.application_count ?? 0) > 0
})

const filterPublicVisibleClassSchedules = (schedules: StudioClassScheduleItem[] | undefined) =>
  schedules?.filter((schedule) => (schedule.bookingStatus ?? "open") !== "hidden")

const hideHiddenSchedulesForPublicClass = <T extends ClassSummary | ClassDetail>(classItem: T): T => ({
  ...classItem,
  schedules: filterPublicVisibleClassSchedules(classItem.schedules)
})

const attachSubjectMasterToRows = async <T extends ClassRow | StudioClassListRow>(
  supabase: SupabaseClient,
  rows: T[]
): Promise<T[]> => {
  const categoryIds = rows
    .map((row) => row.subject_category_id)
    .filter((categoryId): categoryId is string => Boolean(categoryId))
  const subjectIds = rows
    .map((row) => row.subject_id)
    .filter((subjectId): subjectId is string => Boolean(subjectId))

  if (categoryIds.length === 0 && subjectIds.length === 0) {
    return rows
  }

  try {
    const { categoryById, subjectById } = await loadSubjectMasterMapsByIdsWithClient(
      supabase,
      categoryIds,
      subjectIds
    )
    return rows.map((row) => ({
      ...row,
      subject_category_master: row.subject_category_id
        ? categoryById.get(row.subject_category_id) ?? null
        : null,
      subject_master: row.subject_id ? subjectById.get(row.subject_id) ?? null : null
    }))
  } catch {
    // Preserve legacy class reads if the optional master projection is temporarily unavailable.
    return rows
  }
}

const CLASS_SCHEDULE_SELECT_FIELDS =
  "id, class_id, schedule_type, booking_status, day_of_week, specific_date, series_id, start_time, end_time, capacity, display_label, sort_order, created_at"

const chunkArray = <T,>(items: T[], chunkSize: number) => {
  if (chunkSize <= 0) {
    return [items]
  }

  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

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

  const scheduleRows = (data ?? []) as ClassScheduleRow[]
  const scheduleIds = scheduleRows.map((row) => row.id)
  const applicationCountByScheduleId = new Map<string, number>()

  if (scheduleIds.length > 0) {
    const scheduleIdChunks = chunkArray(scheduleIds, 100)

    for (const scheduleIdChunk of scheduleIdChunks) {
      const { data: applicationData, error: applicationError } = await supabase
        .from("trial_applications")
        .select("class_schedule_id")
        .in("class_schedule_id", scheduleIdChunk)

      if (applicationError) {
        throw new Error("failed_to_fetch_studio_class_schedule_usage")
      }

      for (const row of (applicationData ?? []) as Array<{ class_schedule_id: string | null }>) {
        if (!row.class_schedule_id) {
          continue
        }

        applicationCountByScheduleId.set(
          row.class_schedule_id,
          (applicationCountByScheduleId.get(row.class_schedule_id) ?? 0) + 1
        )
      }
    }
  }

  const schedulesByClassId = new Map<string, ClassScheduleRow[]>()
  for (const row of scheduleRows) {
    const scheduleRow = {
      ...row,
      application_count: applicationCountByScheduleId.get(row.id) ?? 0
    }
    const current = schedulesByClassId.get(row.class_id) ?? []
    current.push(scheduleRow)
    schedulesByClassId.set(row.class_id, current)
  }

  return rows.map((row) => ({
    ...row,
    class_schedules: schedulesByClassId.get(row.id) ?? []
  }))
}

/** PostgREST 는 한 응답에서 최대 1000 row 만 돌려준다. 그 이상은 나눠 받는다. */
const SCHEDULE_SUMMARY_PAGE_SIZE = 1000

/**
 * Classes List 의 "예약 일정" 요약.
 *
 * 반복 수업이 occurrence 단위로 저장돼 한 수업에 수백 row 가 생길 수 있고,
 * 조직 전체 합계가 1000 row 를 넘으면 예전 count 쿼리는 조용히 잘린 값을 돌려줬다.
 * (실제로 384 row 짜리 수업이 목록에 34개로 보였다.)
 * classIds 는 이미 organization scope 가 확정된 목록이라 다른 조직 데이터가 섞이지 않는다.
 */
const getScheduleSummaryByClassId = async (
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  classIds: string[]
) => {
  const uniqueClassIds = Array.from(new Set(classIds.filter(Boolean)))
  if (uniqueClassIds.length === 0) {
    return new Map<string, StudioClassScheduleSummary>()
  }

  const rowsByClassId = new Map<string, StudioClassScheduleSummaryInput[]>()

  for (let offset = 0; ; offset += SCHEDULE_SUMMARY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("class_schedules")
      .select("class_id, schedule_type, day_of_week, specific_date, start_time")
      .in("class_id", uniqueClassIds)
      .order("id", { ascending: true })
      .range(offset, offset + SCHEDULE_SUMMARY_PAGE_SIZE - 1)

    if (error) {
      throw new Error("failed_to_fetch_studio_class_schedule_summaries")
    }

    const page = (data ?? []) as Array<{
      class_id: string | null
      schedule_type: string | null
      day_of_week: number | null
      specific_date: string | null
      start_time: string | null
    }>

    for (const row of page) {
      if (!row.class_id) {
        continue
      }

      const current = rowsByClassId.get(row.class_id) ?? []
      current.push({
        scheduleType: row.schedule_type,
        dayOfWeek: row.day_of_week,
        specificDate: row.specific_date,
        startTime: row.start_time
      })
      rowsByClassId.set(row.class_id, current)
    }

    if (page.length < SCHEDULE_SUMMARY_PAGE_SIZE) {
      break
    }
  }

  const summaryByClassId = new Map<string, StudioClassScheduleSummary>()
  for (const [classId, rows] of rowsByClassId) {
    summaryByClassId.set(classId, summarizeStudioClassSchedules(rows))
  }

  return summaryByClassId
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
    addressDetail: row.address_detail ?? null,
    sido: row.sido ?? null,
    sigungu: row.sigungu ?? null,
    bname: row.bname ?? null
  }
}

const getOrganizationLocationMap = async (organizationIds: string[]) => {
  const uniqueOrganizationIds = Array.from(new Set(organizationIds.filter(Boolean)))
  if (uniqueOrganizationIds.length === 0) {
    return new Map<string, OrganizationLocationByIdRow>()
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("organizations")
    .select("id, name, branch_name, address, address_detail, sido, sigungu, bname")
    .in("id", uniqueOrganizationIds)

  if (error) {
    throw new Error("failed_to_fetch_application_organizations")
  }

  return new Map<string, OrganizationLocationByIdRow>(
    ((data ?? []) as OrganizationLocationByIdRow[]).map((row) => [row.id, row])
  )
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

const getEmbeddedClassOrganization = (row: EmbeddedClassRow | null) => {
  if (!row?.organizations) {
    return null
  }

  return Array.isArray(row.organizations) ? (row.organizations[0] ?? null) : row.organizations
}

/**
 * 확정된 예약 블록 한 개. confirmed_schedule_block_id 가 schedule_blocks 로 가는 FK 라
 * embed 는 to-one 이다. 두 개 이상이면 특정할 수 없으므로 null 이다.
 */
const getEmbeddedConfirmedBlock = (row: TrialApplicationRow): EmbeddedConfirmedBlockRow | null => {
  if (!row.confirmed_block) {
    return null
  }

  if (!Array.isArray(row.confirmed_block)) {
    return row.confirmed_block
  }

  return row.confirmed_block.length === 1 ? row.confirmed_block[0] : null
}

/**
 * 신청이 실제로 예약한 수업 시간 한 개.
 *
 * class_schedule_id 는 class_schedules 로 가는 FK 라 embed 결과는 to-one 이다.
 * 그래도 배열로 오는 경우를 대비하되, 두 개 이상이면 어느 것인지 특정할 수 없으므로
 * 첫 번째를 고르지 않고 null 을 돌려준다(추정하지 않는다).
 */
const getEmbeddedClassSchedule = (row: TrialApplicationRow): EmbeddedClassScheduleRow | null => {
  if (!row.class_schedules) {
    return null
  }

  if (!Array.isArray(row.class_schedules)) {
    return row.class_schedules
  }

  return row.class_schedules.length === 1 ? row.class_schedules[0] : null
}

const mapApplication = (row: TrialApplicationRow): TrialApplicationSummary => {
  const embeddedClass = getEmbeddedClass(row)

  return {
    id: row.id,
    classId: row.class_id,
    classTitle: embeddedClass?.title ?? null,
    classProgramType: embeddedClass?.program_type ?? null,
    academyName: null,
    teacherDisplayName: embeddedClass?.teacher_display_name ?? null,
    organizationAddress: null,
    organizationAddressDetail: null,
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
    registrationStatus: row.registration_status ?? null,
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
  const embeddedClassSchedule = getEmbeddedClassSchedule(row)

  return {
    ...mapApplication(row),
    classSubject: embeddedClass?.subject ?? null,
    // 지역 표시는 organization 행정지역 metadata 로만 만든다. legacy classes.region 은 쓰지 않는다.
    classRegion: formatAdministrativeRegionLabel(getEmbeddedClassOrganization(embeddedClass) ?? {}),
    classAssignmentMode: resolveClassAssignmentMode(embeddedClass ?? {}),
    scheduleStartTime: embeddedClassSchedule?.start_time ?? null,
    scheduleEndTime: embeddedClassSchedule?.end_time ?? null,
    confirmedBlockStartAt: getEmbeddedConfirmedBlock(row)?.start_at ?? null,
    confirmedBlockEndAt: getEmbeddedConfirmedBlock(row)?.end_at ?? null,
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
    registrationStatus: row.registration_status ?? "undecided",
    unregisteredReason: isApplicationUnregisteredReason(row.unregistered_reason)
      ? row.unregistered_reason
      : null
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

const mapStudioTrialResultFields = (
  row: TrialResultFieldsRow
): StudioTrialResultSaveContext["trialResult"] & object => ({
  observations: Array.isArray(row.observations) ? row.observations.filter((item): item is string => typeof item === "string") : [],
  parentReaction:
    row.parent_reaction === "positive" ||
    row.parent_reaction === "considering" ||
    row.parent_reaction === "negative"
      ? row.parent_reaction
      : null,
  recommendedCourse: row.recommended_course?.trim() ? row.recommended_course.trim() : null,
  recommendedLevel: row.recommended_level?.trim() ? row.recommended_level.trim() : null,
  recommendedSchedule: row.recommended_schedule?.trim() ? row.recommended_schedule.trim() : null,
  nextAction:
    row.next_action === "consultation" ||
    row.next_action === "follow_up" ||
    row.next_action === "registration_discussion" ||
    row.next_action === "undecided"
      ? row.next_action
      : null,
  note: row.note?.trim() ? row.note.trim() : null
})

const mapStudioTrialResult = (row: TrialResultRow): StudioTrialResult => ({
  id: row.id,
  applicationId: row.application_id,
  ...mapStudioTrialResultFields(row),
  createdBy: row.created_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const mapStudioConsultationLog = (row: ConsultationLogRow): StudioConsultationLog => ({
  id: row.id,
  applicationId: row.application_id,
  occurredAt: row.occurred_at,
  activityType:
    row.activity_type === "CONSULTATION" ||
    row.activity_type === "LEGACY_IMPORT" ||
    row.activity_type === "CALL_ATTEMPT"
      ? (row.activity_type as ConsultationLogActivityType)
      : "CONSULTATION",
  channel:
    row.channel === "PHONE" ||
    row.channel === "KAKAO" ||
    row.channel === "SMS" ||
    row.channel === "VISIT" ||
    row.channel === "OTHER"
      ? (row.channel as ConsultationLogChannel)
      : null,
  sentiment:
    row.sentiment === "POSITIVE" ||
    row.sentiment === "NEUTRAL" ||
    row.sentiment === "NEGATIVE"
      ? (row.sentiment as ConsultationSentiment)
      : null,
  registrationStatusSnapshot:
    row.registration_status_snapshot === "undecided" ||
    row.registration_status_snapshot === "pending" ||
    row.registration_status_snapshot === "enrolled" ||
    row.registration_status_snapshot === "not_enrolled"
      ? (row.registration_status_snapshot as ApplicationRegistrationStatus)
      : null,
  nextAction:
    row.next_action === "REGISTER" ||
    row.next_action === "LOST" ||
    row.next_action === "FOLLOW_UP" ||
    row.next_action === "NONE"
      ? (row.next_action as ConsultationLogNextAction)
      : null,
  nextContactAt: row.next_contact_at ?? null,
  note: row.note?.trim() ? row.note.trim() : null,
  // 원본 그대로 넘긴다. 파싱/판정은 화면 쪽 parser 가 한다(조용히 null 로 바꾸지 않는다).
  regularSchedulePreferenceSnapshot: row.regular_schedule_preference_snapshot ?? null,
  regularSchedulePreferenceNoteSnapshot: row.regular_schedule_preference_note_snapshot ?? null,
  unregisteredReasonSnapshot: isApplicationUnregisteredReason(row.unregistered_reason_snapshot)
    ? row.unregistered_reason_snapshot
    : null,
  unregisteredReasonNoteSnapshot: row.unregistered_reason_note_snapshot ?? null,
  createdBy: row.created_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? row.created_at
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
  teacherId: string | null
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
    scheduleType: input.row.schedule_type,
    bookingStatus: input.row.booking_status ?? "open",
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
  isActive: row.is_active,
  createdAt: row.created_at
})

const ACTIVE_APPLICATION_STATUSES: TrialApplicationSummary["status"][] = [
  "new",
  "reviewing",
  "confirmed"
]

const WEEKLY_OCCURRENCE_COUNT = 4
const TRIAL_BOOKING_CUTOFF_MS = 24 * 60 * 60 * 1000

const formatTimeText = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed
}

const formatConcreteOccurrenceLabel = (startAt: string, endAt: string) =>
  formatSeoulOccurrenceLabel(startAt, endAt) ?? startAt

const buildOccurrenceRange = (dateText: string, startTime: string, endTime: string) =>
  buildSeoulOccurrenceRange(dateText, startTime, endTime)

const pad2 = (value: number) => String(value).padStart(2, "0")

const isValidDateString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const isLeapYear = (year: number) => {
  if (year % 400 === 0) {
    return true
  }

  if (year % 100 === 0) {
    return false
  }

  return year % 4 === 0
}

const getDaysInMonth = (year: number, month: number) => {
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return monthLengths[month - 1] ?? 0
}

const parseDateParts = (value: string) => {
  if (!isValidDateString(value)) {
    return null
  }

  const [yearText, monthText, dayText] = value.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  if (month < 1 || month > 12) {
    return null
  }

  const daysInMonth = getDaysInMonth(year, month)
  if (day < 1 || day > daysInMonth) {
    return null
  }

  return { year, month, day }
}

const compareDateStrings = (left: string, right: string) => left.localeCompare(right)

const dateStringToWeekday = (value: string) => {
  const parts = parseDateParts(value)
  if (!parts) {
    return null
  }

  let year = parts.year
  let month = parts.month
  const day = parts.day

  if (month < 3) {
    month += 12
    year -= 1
  }

  const k = year % 100
  const j = Math.floor(year / 100)
  const h =
    (day +
      Math.floor((13 * (month + 1)) / 5) +
      k +
      Math.floor(k / 4) +
      Math.floor(j / 4) +
      5 * j) %
    7

  return (h + 6) % 7
}

const addDaysToDateString = (value: string, days: number) => {
  const parts = parseDateParts(value)
  if (!parts || !Number.isInteger(days)) {
    return null
  }

  let year = parts.year
  let month = parts.month
  let day = parts.day + days

  while (day > getDaysInMonth(year, month)) {
    day -= getDaysInMonth(year, month)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  while (day < 1) {
    month -= 1
    if (month < 1) {
      month = 12
      year -= 1
    }
    day += getDaysInMonth(year, month)
  }

  return `${year}-${pad2(month)}-${pad2(day)}`
}

const getMonthRange = (monthText: string) => {
  const normalized = monthText.trim()
  const parts = parseDateParts(`${normalized}-01`)
  if (!parts) {
    return null
  }

  return {
    monthStart: `${parts.year}-${pad2(parts.month)}-01`,
    monthEnd: `${parts.year}-${pad2(parts.month)}-${pad2(getDaysInMonth(parts.year, parts.month))}`
  }
}

const normalizeTimeValue = (value: string) => {
  const trimmed = value.trim()
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed.slice(0, 5)
  }

  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : ""
}

const compareTimeValues = (left: string, right: string) => normalizeTimeValue(left).localeCompare(normalizeTimeValue(right))

const rangesOverlap = (
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
) => {
  const normalizedLeftStart = normalizeTimeValue(leftStart)
  const normalizedLeftEnd = normalizeTimeValue(leftEnd)
  const normalizedRightStart = normalizeTimeValue(rightStart)
  const normalizedRightEnd = normalizeTimeValue(rightEnd)

  return normalizedLeftStart < normalizedRightEnd && normalizedRightStart < normalizedLeftEnd
}

const resolveRepeatWeekdays = (input: BulkCreateClassSchedulesInput) => {
  switch (input.repeatMode) {
    case "daily":
      return [0, 1, 2, 3, 4, 5, 6]
    case "weekdays":
      return [1, 2, 3, 4, 5]
    case "weekends":
      return [0, 6]
    case "custom":
      return Array.from(new Set(input.weekdays)).sort((a, b) => a - b)
    default:
      return []
  }
}

const buildScheduleDuplicateKey = (classId: string, specificDate: string, startTime: string) =>
  `${classId}::${specificDate}::${normalizeTimeValue(startTime)}`

const buildTeacherConflictKey = (teacherId: string, specificDate: string) => `${teacherId}::${specificDate}`

const normalizeEmbeddedClass = (
  value:
    | Pick<ClassRow, "id" | "organization_id" | "title" | "teacher_id" | "teacher_display_name">
    | Array<Pick<ClassRow, "id" | "organization_id" | "title" | "teacher_id" | "teacher_display_name">>
    | null
    | undefined
) => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

const getTrialBookingCutoffDate = (baseDate: Date = new Date()) =>
  new Date(baseDate.getTime() + TRIAL_BOOKING_CUTOFF_MS)

const isTrialBookingBookable = (startAt: string, baseDate: Date = new Date()) => {
  const startDate = new Date(startAt)
  if (Number.isNaN(startDate.getTime())) {
    return false
  }

  return startDate.getTime() > getTrialBookingCutoffDate(baseDate).getTime()
}

const formatClassScheduleDefaultLabel = (row: ClassScheduleRow, startAt: string, endAt: string) => {
  if (row.display_label?.trim()) {
    return row.display_label.trim()
  }

  return formatConcreteOccurrenceLabel(startAt, endAt)
}

const generateClassScheduleOccurrencesWithinRange = (
  row: ClassScheduleRow,
  startDateText: string,
  endDateText: string
): Array<{ specificDate: string; startAt: string; endAt: string; label: string }> => {
  const startTime = formatTimeText(row.start_time)
  const endTime = formatTimeText(row.end_time)

  if (compareDateStrings(startDateText, endDateText) > 0) {
    return []
  }

  if (row.schedule_type === "one_time") {
    if (!row.specific_date) {
      return []
    }

    if (
      compareDateStrings(row.specific_date, startDateText) < 0 ||
      compareDateStrings(row.specific_date, endDateText) > 0
    ) {
      return []
    }

    const occurrence = buildOccurrenceRange(row.specific_date, startTime, endTime)
    if (!occurrence) {
      return []
    }

    return [
      {
        specificDate: row.specific_date,
        ...occurrence,
        label: formatClassScheduleDefaultLabel(row, occurrence.startAt, occurrence.endAt)
      }
    ]
  }

  if (row.day_of_week == null || row.day_of_week < 0 || row.day_of_week > 6) {
    return []
  }

  const occurrences: Array<{ specificDate: string; startAt: string; endAt: string; label: string }> = []
  let cursor = startDateText

  while (compareDateStrings(cursor, endDateText) <= 0) {
    const weekday = dateStringToWeekday(cursor)
    if (weekday === row.day_of_week) {
      const occurrence = buildOccurrenceRange(cursor, startTime, endTime)
      if (occurrence) {
        occurrences.push({
          specificDate: cursor,
          ...occurrence,
          label: formatClassScheduleDefaultLabel(row, occurrence.startAt, occurrence.endAt)
        })
      }
    }

    const nextCursor = addDaysToDateString(cursor, 1)
    if (!nextCursor) {
      break
    }
    cursor = nextCursor
  }

  return occurrences
}

const generateUpcomingClassScheduleOccurrences = (
  row: ClassScheduleRow,
  now: Date = new Date()
): Array<{ startAt: string; endAt: string; label: string }> => {
  const rangeStart = formatSeoulDateKey(now)
  const rangeEnd = rangeStart ? addDaysToDateString(rangeStart, 55) : null

  if (!rangeStart || !rangeEnd) {
    return []
  }

  return generateClassScheduleOccurrencesWithinRange(row, rangeStart, rangeEnd)
    .filter((occurrence) => new Date(occurrence.startAt) > now)
    .slice(0, WEEKLY_OCCURRENCE_COUNT)
    .map((occurrence) => ({
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      label: occurrence.label
    }))
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

const TEACHER_SELECT_FIELDS =
  "id, profile_id, organization_id, display_name, phone, sms_enabled, is_active, created_at"

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

/**
 * listStudioApplications 의 page 크기.
 *
 * PostgREST 의 db max_rows(supabase/config.toml: 1000)와 같은 값이다.
 * 이보다 크게 잡으면 서버가 조용히 잘라내 마지막 페이지 판정이 틀린다.
 */
/**
 * 희망 일정 3컬럼의 update payload.
 *
 * write 가 없으면 빈 객체다 — 컬럼을 아예 건드리지 않아 기존 값이 남는다.
 * "전달되지 않음"을 "지우기"로 해석하지 않기 위한 구분이다.
 */
const buildRegularSchedulePreferenceUpdate = (
  write: RegularSchedulePreferenceWrite | undefined
) =>
  write
    ? {
        regular_schedule_preference: write.preference,
        regular_schedule_preference_note: write.note,
        regular_schedule_preference_updated_at: write.updatedAt
      }
    : {}

const STUDIO_APPLICATION_PAGE_SIZE = 1000

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
  // display_name 이 이미 있으면 profile.name fallback 을 쓰지 않는다.
  // fallback 이 실제로 필요한 teacher 가 없으면 profiles 조회 자체가 발생하지 않는다.
  const profileNameById = await getProfileNameMap(
    teacherRows
      .filter((row) => !row.display_name?.trim())
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

const getTeacherNamesByIds = async (teacherIds: string[]) => getStudioTeacherDisplayNameMap(teacherIds)

const getAppliedCountByTeacherScheduleBlockIdWithClient = async (
  supabase: SupabaseClient,
  teacherId: string,
  scheduleRows: ScheduleBlockRow[]
) => {
  if (scheduleRows.length === 0) {
    return new Map<string, number>()
  }

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

const getAppliedCountByTeacherScheduleBlockId = async (
  teacherId: string,
  scheduleRows: ScheduleBlockRow[]
) => {
  const supabase = await getSupabaseServerClient()
  return getAppliedCountByTeacherScheduleBlockIdWithClient(supabase, teacherId, scheduleRows)
}

const getAppliedCountByClassScheduleBlockIdWithClient = async (
  supabase: SupabaseClient,
  classId: string,
  scheduleRows: ScheduleBlockRow[]
) => {
  if (scheduleRows.length === 0) {
    return new Map<string, number>()
  }

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

const getAppliedCountByClassScheduleBlockId = async (
  classId: string,
  scheduleRows: ScheduleBlockRow[]
) => {
  const supabase = await getSupabaseServerClient()
  return getAppliedCountByClassScheduleBlockIdWithClient(supabase, classId, scheduleRows)
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

const getClassOwnershipRow = async (classId: string, organizationId: string) => {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("classes")
    .select("id, organization_id, title, teacher_id, teacher_display_name, is_active")
    .eq("id", classId)
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(
      formatSupabaseError("failed_to_fetch_class_ownership", error, {
        classId,
        organizationId
      })
    )
  }

  if (!data) {
    throw new Error("studio_class_not_found_or_forbidden")
  }

  return data as Pick<ClassRow, "id" | "organization_id" | "title" | "teacher_id" | "teacher_display_name" | "is_active">
}

const getClassScheduleById = async (classScheduleId: string, organizationId: string) => {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("class_schedules")
    .select(
      "id, class_id, schedule_type, day_of_week, specific_date, series_id, start_time, end_time, capacity, display_label, sort_order, created_at, classes!inner(id, organization_id, title, teacher_id, teacher_display_name)"
    )
    .eq("id", classScheduleId)
    .eq("classes.organization_id", organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(
      formatSupabaseError("failed_to_fetch_class_schedule", error, {
        classScheduleId,
        organizationId
      })
    )
  }

  if (!data) {
    throw new Error("class_schedule_not_found_or_forbidden")
  }

  const normalizedClass = normalizeEmbeddedClass(
    (data as {
      classes?:
        | Pick<ClassRow, "id" | "organization_id" | "title" | "teacher_id" | "teacher_display_name">
        | Array<Pick<ClassRow, "id" | "organization_id" | "title" | "teacher_id" | "teacher_display_name">>
        | null
    }).classes
  )

  if (!normalizedClass) {
    throw new Error("class_schedule_not_found_or_forbidden")
  }

  return {
    ...(data as ClassScheduleRow),
    classes: normalizedClass
  }
}

const getActiveReservationCountByClassScheduleIds = async (classScheduleIds: string[]) => {
  const counts = new Map<string, number>()
  if (classScheduleIds.length === 0) {
    return counts
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("trial_applications")
    .select("class_schedule_id, status")
    .in("class_schedule_id", classScheduleIds)
    .in("status", ACTIVE_APPLICATION_STATUSES)

  if (error) {
    throw new Error(formatSupabaseError("failed_to_fetch_class_schedule_application_counts", error))
  }

  for (const row of (data ?? []) as Array<{ class_schedule_id: string | null }>) {
    if (!row.class_schedule_id) {
      continue
    }
    counts.set(row.class_schedule_id, (counts.get(row.class_schedule_id) ?? 0) + 1)
  }

  return counts
}

const buildScheduleOccurrenceReservationKey = (classScheduleId: string, startAt: string) =>
  `${classScheduleId}::${startAt}`

const getActiveReservationCountByScheduleOccurrenceWithClient = async (
  supabase: SupabaseClient,
  classId: string,
  classScheduleIds: string[]
) => {
  const counts = new Map<string, number>()
  if (classScheduleIds.length === 0) {
    return counts
  }

  const targetScheduleIds = new Set(classScheduleIds)
  const { data, error } = await supabase
    .from("trial_applications")
    .select("class_schedule_id, requested_slot_at, status")
    .eq("class_id", classId)
    .in("status", ACTIVE_APPLICATION_STATUSES)
    .not("class_schedule_id", "is", null)
    .not("requested_slot_at", "is", null)

  if (error) {
    throw new Error(formatSupabaseError("failed_to_fetch_schedule_occurrence_application_counts", error))
  }

  for (const row of (data ?? []) as Array<{ class_schedule_id: string | null; requested_slot_at?: string | null }>) {
    if (!row.class_schedule_id || !row.requested_slot_at) {
      continue
    }

    if (!targetScheduleIds.has(row.class_schedule_id)) {
      continue
    }

    const key = buildScheduleOccurrenceReservationKey(row.class_schedule_id, row.requested_slot_at)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return counts
}

const getActiveReservationCountByScheduleOccurrence = async (
  classId: string,
  classScheduleIds: string[]
) => {
  const supabase = await getSupabaseServerClient()
  return getActiveReservationCountByScheduleOccurrenceWithClient(supabase, classId, classScheduleIds)
}

const buildCalendarItemStatus = (
  capacity: number,
  activeReservationCount: number,
  bookingStatus: StudioClassScheduleBookingStatus
) => {
  if (bookingStatus === "hidden") {
    return "hidden"
  }

  return bookingStatus === "closed" || activeReservationCount >= capacity ? "closed" : "open"
}

const buildStudioScheduleCalendarItem = (
  row: ClassScheduleRow & {
    classes: Pick<ClassRow, "id" | "title" | "teacher_id" | "teacher_display_name">
  },
  teacherNameById: Map<string, string>,
  occurrence: {
    specificDate: string
    startAt: string
    endAt: string
  },
  activeReservationCount: number
): StudioScheduleCalendarItem => {
  const capacity = Math.max(1, row.capacity ?? 1)
  const teacherId = row.classes.teacher_id ?? null
  const teacherName =
    (teacherId ? teacherNameById.get(teacherId) : null) ?? row.classes.teacher_display_name ?? null
  const remainingCapacity = Math.max(capacity - activeReservationCount, 0)
  const bookingStatus = row.booking_status ?? "open"

  return {
    classScheduleId: row.id,
    classId: row.class_id,
    classTitle: row.classes.title,
    teacherId,
    teacherName,
    scheduleType: row.schedule_type,
    bookingStatus,
    dayOfWeek: row.day_of_week ?? null,
    specificDate: occurrence.specificDate,
    startTime: formatTimeText(row.start_time),
    endTime: formatTimeText(row.end_time),
    capacity,
    activeReservationCount,
    remainingCapacity,
    status: buildCalendarItemStatus(capacity, activeReservationCount, bookingStatus),
    seriesId: row.series_id ?? null
  }
}

const buildStudioScheduleCalendarDays = (items: StudioScheduleCalendarItem[]): StudioScheduleCalendarDay[] => {
  const map = new Map<string, StudioScheduleCalendarItem[]>()
  for (const item of items) {
    const current = map.get(item.specificDate) ?? []
    current.push(item)
    map.set(item.specificDate, current)
  }

  return Array.from(map.entries())
    .sort((a, b) => compareDateStrings(a[0], b[0]))
    .map(([date, dateItems]) => {
      const sortedItems = [...dateItems].sort((left, right) => {
        const timeCompare = compareTimeValues(left.startTime, right.startTime)
        if (timeCompare !== 0) {
          return timeCompare
        }
        return left.classTitle.localeCompare(right.classTitle)
      })

      const totalCapacity = sortedItems.reduce((sum, item) => sum + item.capacity, 0)
      const totalActiveReservationCount = sortedItems.reduce(
        (sum, item) => sum + item.activeReservationCount,
        0
      )
      const totalRemainingCapacity = sortedItems.reduce((sum, item) => sum + item.remainingCapacity, 0)
      const closedCount = sortedItems.filter((item) => item.status === "closed").length
      const hiddenCount = sortedItems.filter((item) => item.status === "hidden").length

      return {
        date,
        items: sortedItems,
        totalCapacity,
        totalActiveReservationCount,
        totalRemainingCapacity,
        closedCount,
        hiddenCount
      }
    })
}

const listClassSchedulesInRange = async (
  organizationId: string,
  startDate: string,
  endDate: string,
  filters?: {
    classId?: string | null
    teacherId?: string | null
  }
) => {
  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from("class_schedules")
    .select(
      "id, class_id, schedule_type, booking_status, day_of_week, specific_date, series_id, start_time, end_time, capacity, display_label, sort_order, created_at, classes!inner(id, organization_id, title, teacher_id, teacher_display_name)"
    )
    .eq("classes.organization_id", organizationId)
    .order("schedule_type", { ascending: true })
    .order("start_time", { ascending: true })
    .order("created_at", { ascending: true })

  if (filters?.classId) {
    query = query.eq("class_id", filters.classId)
  }

  if (filters?.teacherId) {
    query = query.eq("classes.teacher_id", filters.teacherId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(
      formatSupabaseError("failed_to_fetch_class_schedules_in_range", error, {
        organizationId,
        startDate,
        endDate,
        classId: filters?.classId ?? null,
        teacherId: filters?.teacherId ?? null
      })
    )
  }

  return ((data ?? []) as Array<
    ClassScheduleRow & {
      classes?:
        | Pick<ClassRow, "id" | "organization_id" | "title" | "teacher_id" | "teacher_display_name">
        | Array<Pick<ClassRow, "id" | "organization_id" | "title" | "teacher_id" | "teacher_display_name">>
        | null
    }
  >)
    .map((row) => {
      const normalizedClass = normalizeEmbeddedClass(row.classes)
      if (!normalizedClass) {
        return null
      }

      return {
        ...row,
        classes: normalizedClass
      }
    })
    .filter(
      (
        row
      ): row is ClassScheduleRow & {
        classes: Pick<ClassRow, "id" | "organization_id" | "title" | "teacher_id" | "teacher_display_name">
      } => Boolean(row)
    )
}

const validateBulkCreateClassSchedulesInput = (input: BulkCreateClassSchedulesInput) => {
  if (!isValidDateString(input.startDate) || !isValidDateString(input.endDate)) {
    throw new Error("invalid_schedule_date_range")
  }

  if (compareDateStrings(input.startDate, input.endDate) > 0) {
    throw new Error("invalid_schedule_date_range")
  }

  const resolvedWeekdays = resolveRepeatWeekdays(input)
  if (resolvedWeekdays.length === 0) {
    throw new Error("schedule_repeat_days_required")
  }

  if (!Array.isArray(input.timeSlots) || input.timeSlots.length === 0) {
    throw new Error("schedule_time_slots_required")
  }

  const totalDays = (() => {
    let count = 0
    let cursor = input.startDate
    while (compareDateStrings(cursor, input.endDate) <= 0) {
      count += 1
      const next = addDaysToDateString(cursor, 1)
      if (!next) {
        break
      }
      cursor = next
    }
    return count
  })()

  if (totalDays > 120) {
    throw new Error("schedule_date_range_too_large")
  }

  if (input.timeSlots.length > 12) {
    throw new Error("schedule_time_slots_too_many")
  }

  for (const slot of input.timeSlots) {
    const startTime = normalizeTimeValue(slot.startTime)
    const endTime = normalizeTimeValue(slot.endTime)
    if (!startTime || !endTime || compareTimeValues(startTime, endTime) >= 0) {
      throw new Error("invalid_schedule_time_range")
    }

    if (!Number.isInteger(slot.capacity) || slot.capacity < 1) {
      throw new Error("invalid_schedule_capacity")
    }
  }

  if (totalDays * input.timeSlots.length > 500) {
    throw new Error("schedule_generation_count_too_large")
  }

  return resolvedWeekdays
}

const buildBulkPreviewItems = async (
  input: BulkCreateClassSchedulesInput
): Promise<{
  preview: BulkCreateClassSchedulesPreview
  creatableRows: DbClassScheduleInsertPayload[]
}> => {
  const classRow = await getClassOwnershipRow(input.classId, input.organizationId)
  if (input.teacherId) {
    await assertTeacherBelongsToOrganization(input.teacherId, input.organizationId)
  }

  const effectiveTeacherId = input.teacherId ?? classRow.teacher_id ?? null
  const teacherNameById = effectiveTeacherId ? await getTeacherNamesByIds([effectiveTeacherId]) : new Map()
  const teacherName =
    (effectiveTeacherId ? teacherNameById.get(effectiveTeacherId) : null) ??
    classRow.teacher_display_name ??
    null

  const weekdays = validateBulkCreateClassSchedulesInput(input)
  const existingRows = await listClassSchedulesInRange(input.organizationId, input.startDate, input.endDate, {
    teacherId: effectiveTeacherId
  })

  const duplicateKeySet = new Set<string>()
  const teacherRowsByDate = new Map<string, Array<{ startTime: string; endTime: string; classScheduleId: string }>>()
  for (const row of existingRows) {
    const occurrences = generateClassScheduleOccurrencesWithinRange(row, input.startDate, input.endDate)
    for (const occurrence of occurrences) {
      if (row.class_id === input.classId) {
        duplicateKeySet.add(buildScheduleDuplicateKey(row.class_id, occurrence.specificDate, row.start_time))
      }

      const rowTeacherId = row.classes.teacher_id
      if (!rowTeacherId || effectiveTeacherId !== rowTeacherId) {
        continue
      }

      const conflictKey = buildTeacherConflictKey(rowTeacherId, occurrence.specificDate)
      const current = teacherRowsByDate.get(conflictKey) ?? []
      current.push({
        startTime: row.start_time,
        endTime: row.end_time,
        classScheduleId: row.id
      })
      teacherRowsByDate.set(conflictKey, current)
    }
  }

  const items: BulkCreateClassSchedulesPreviewItem[] = []
  const excludedItems: BulkCreateClassSchedulesPreviewConflict[] = []
  const creatableRows: DbClassScheduleInsertPayload[] = []
  const inBatchDuplicateKeySet = new Set<string>()
  const seriesId = crypto.randomUUID()
  let cursor = input.startDate

  while (compareDateStrings(cursor, input.endDate) <= 0) {
    const weekday = dateStringToWeekday(cursor)
    if (weekday != null && weekdays.includes(weekday)) {
      input.timeSlots.forEach((slot, index) => {
        const startTime = normalizeTimeValue(slot.startTime)
        const endTime = normalizeTimeValue(slot.endTime)
        const duplicateKey = buildScheduleDuplicateKey(input.classId, cursor, startTime)
        const teacherConflictKey =
          effectiveTeacherId != null ? buildTeacherConflictKey(effectiveTeacherId, cursor) : null
        const existingTeacherRows = teacherConflictKey ? teacherRowsByDate.get(teacherConflictKey) ?? [] : []
        const isDuplicate = duplicateKeySet.has(duplicateKey) || inBatchDuplicateKeySet.has(duplicateKey)
        const hasTeacherConflict = existingTeacherRows.some((row) =>
          rangesOverlap(row.startTime, row.endTime, startTime, endTime)
        )

        const item: BulkCreateClassSchedulesPreviewItem = {
          specificDate: cursor,
          startTime,
          endTime,
          capacity: slot.capacity,
          classId: input.classId,
          teacherId: effectiveTeacherId,
          classTitle: classRow.title,
          teacherName,
          isDuplicate,
          hasTeacherConflict
        }

        items.push(item)

        if (isDuplicate) {
          excludedItems.push({
            kind: "duplicate",
            specificDate: cursor,
            startTime,
            endTime,
            capacity: slot.capacity,
            message: "같은 수업, 날짜, 시작 시간의 기존 일정이 있어 생성에서 제외됩니다."
          })
          return
        }

        if (hasTeacherConflict) {
          excludedItems.push({
            kind: "teacher_conflict",
            specificDate: cursor,
            startTime,
            endTime,
            capacity: slot.capacity,
            message: "같은 선생님의 기존 일정과 시간이 겹칩니다."
          })
        }

        inBatchDuplicateKeySet.add(duplicateKey)
        creatableRows.push({
          class_id: input.classId,
          schedule_type: "one_time",
          booking_status: "open",
          day_of_week: null,
          specific_date: cursor,
          series_id: seriesId,
          start_time: normalizeStudioClassScheduleTimeForDb(startTime),
          end_time: normalizeStudioClassScheduleTimeForDb(endTime),
          capacity: slot.capacity,
          display_label: null,
          sort_order: index,
          updated_at: new Date().toISOString()
        })
      })
    }

    const nextCursor = addDaysToDateString(cursor, 1)
    if (!nextCursor) {
      break
    }
    cursor = nextCursor
  }

  return {
    preview: {
      totalCalculatedCount: items.length,
      creatableCount: creatableRows.length,
      duplicateCount: excludedItems.filter((item) => item.kind === "duplicate").length,
      teacherConflictCount: excludedItems.filter((item) => item.kind === "teacher_conflict").length,
      excludedItems,
      items
    },
    creatableRows
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
  booking_status?: StudioClassScheduleBookingStatus
  day_of_week: number | null
  specific_date: string | null
  series_id?: string | null
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
  booking_status: payload.booking_status ?? "open",
  day_of_week: payload.day_of_week,
  specific_date: payload.specific_date,
  series_id: payload.series_id ?? null,
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
      booking_status: slot.bookingStatus ?? "open",
      day_of_week: slot.scheduleType === "weekly" ? slot.dayOfWeek : null,
      specific_date: slot.scheduleType === "one_time" ? slot.specificDate : null,
      series_id: slot.seriesId ?? null,
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

const mergeExistingClassScheduleMeta = (
  payload: DbClassSchedulePayload,
  existing: Pick<ClassScheduleRow, "booking_status" | "series_id">
): DbClassSchedulePayload => ({
  ...payload,
  booking_status: existing.booking_status ?? "open",
  series_id: existing.series_id ?? null
})

const cleanupCreatedStudioClass = async (
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  classId: string,
  organizationId: string
) => {
  await supabase.from("class_schedules").delete().eq("class_id", classId)
  await supabase.from("classes").delete().eq("id", classId).eq("organization_id", organizationId)
}

const isProtectedClassScheduleChanged = (
  existing: Pick<
    ClassScheduleRow,
    "schedule_type" | "day_of_week" | "specific_date" | "start_time" | "end_time"
  >,
  next: Pick<
    DbClassSchedulePayload,
    "schedule_type" | "day_of_week" | "specific_date" | "start_time" | "end_time"
  >
) => {
  return (
    existing.schedule_type !== next.schedule_type ||
    (existing.day_of_week ?? null) !== (next.day_of_week ?? null) ||
    (existing.specific_date ?? null) !== (next.specific_date ?? null) ||
    existing.start_time !== next.start_time ||
    existing.end_time !== next.end_time
  )
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

const LEGACY_CLASS_BASE_SELECT_FIELDS =
  "id, organization_id, program_type, title, subject, target_age, description, trial_price, teacher_id, teacher_display_name, cover_image_url, is_active"

const CLASS_BASE_SELECT_FIELDS =
  `${LEGACY_CLASS_BASE_SELECT_FIELDS}, assignment_mode, subject_category_id, subject_id`

const LEGACY_STUDIO_CLASS_LIST_SELECT_FIELDS =
  "id, program_type, title, subject, target_age, trial_price, teacher_id, teacher_display_name, cover_image_url, is_active"

type StudioTeacherAssignmentRow = {
  id: string
  title: string
  teacher_id: string | null
  subject: string | null
  subject_category_id: string | null
  subject_id: string | null
}

const STUDIO_CLASS_LIST_SELECT_FIELDS =
  `${LEGACY_STUDIO_CLASS_LIST_SELECT_FIELDS}, assignment_mode, subject_category_id, subject_id`

const ORGANIZATION_LOCATION_SELECT_FIELDS =
  "organizations(name, branch_name, address, address_detail, sido, sigungu, bname)"
const ORGANIZATION_BASE_SELECT_FIELDS = "organizations(name, branch_name)"

const CLASS_DETAIL_SELECT_FIELDS =
  `${CLASS_BASE_SELECT_FIELDS}, class_format, recommended_for, experience_points, curriculum, teacher_intro, ${ORGANIZATION_LOCATION_SELECT_FIELDS}`

const CLASS_BASE_FALLBACK_SELECT_FIELDS = `${LEGACY_CLASS_BASE_SELECT_FIELDS}, ${ORGANIZATION_BASE_SELECT_FIELDS}`

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

const getActorNameMap = async (actorIds: string[]) => {
  try {
    return await getProfileNameMap(actorIds)
  } catch {
    throw new Error("failed_to_fetch_application_log_actors")
  }
}

export const listAvailableScheduleSlotsByClassIdWithClient = async ({
  classId,
  supabase
}: {
  classId: string
  supabase: SupabaseClient
}): Promise<AvailableScheduleSlot[]> => {
  const now = new Date()
  const bookingCutoffIso = getTrialBookingCutoffDate(now).toISOString()
  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("teacher_id")
    .eq("id", classId)
    .eq("is_active", true)
    .maybeSingle()

  if (classError) {
    throw new Error("failed_to_fetch_class_for_slots")
  }

  if (!classData) {
    return []
  }

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
    const visibleClassScheduleRows = classScheduleRows.filter((row) => (row.booking_status ?? "open") !== "hidden")

    if (visibleClassScheduleRows.length === 0) {
      return []
    }

    const { data: existingBlockData, error: existingBlockError } = await supabase
      .from("schedule_blocks")
      .select(SCHEDULE_BLOCK_SELECT_FIELDS)
      .eq("class_id", classId)
      .gt("end_at", bookingCutoffIso)
      .order("start_at", { ascending: true })

    if (existingBlockError) {
      throw new Error("failed_to_fetch_available_schedule_slots")
    }

    const existingBlocks = (existingBlockData ?? []) as ScheduleBlockRow[]
    const availableBlocks = existingBlocks.filter((row) => row.type === "available")
    const appliedCountBySlotId = await getAppliedCountByClassScheduleBlockIdWithClient(
      supabase,
      classId,
      availableBlocks
    )
    const appliedCountByOccurrence = await getActiveReservationCountByScheduleOccurrenceWithClient(
      supabase,
      classId,
      visibleClassScheduleRows.map((row) => row.id)
    )
    const blockByRange = new Map<string, ScheduleBlockRow>()

    for (const block of existingBlocks) {
      const key = `${block.start_at}|${block.end_at}`
      const current = blockByRange.get(key)
      if (!current || current.type !== "available") {
        blockByRange.set(key, block)
      }
    }

    return visibleClassScheduleRows
      .flatMap((row) => {
        return generateUpcomingClassScheduleOccurrences(row, now)
          .filter((occurrence) => isTrialBookingBookable(occurrence.startAt, now))
          .map((occurrence) => {
            const key = `${occurrence.startAt}|${occurrence.endAt}`
            const matchedBlock = blockByRange.get(key) ?? null
            const isAvailableBlock = matchedBlock?.type === "available"
            const capacity = matchedBlock?.capacity ?? Math.max(1, row.capacity ?? 1)
            const appliedCount =
              matchedBlock && isAvailableBlock
                ? (appliedCountBySlotId.get(matchedBlock.id) ?? 0)
                : (appliedCountByOccurrence.get(buildScheduleOccurrenceReservationKey(row.id, occurrence.startAt)) ?? 0)

            return mapClassScheduleOccurrenceSlot({
              row,
              teacherId: classData.teacher_id,
              startAt: occurrence.startAt,
              endAt: occurrence.endAt,
              label: occurrence.label,
              capacity,
              appliedCount,
              scheduleBlockId: isAvailableBlock ? matchedBlock?.id ?? null : null,
              isClosed:
                row.booking_status === "closed" ||
                (matchedBlock != null && !isAvailableBlock ? true : undefined)
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
    .gt("start_at", bookingCutoffIso)
    .order("start_at", { ascending: true })

  if (primaryError) {
    throw new Error("failed_to_fetch_available_schedule_slots")
  }

  let scheduleRows = (primaryData ?? []) as ScheduleBlockRow[]
  let usesFallback = false

  if (scheduleRows.length === 0) {
    if (!classData.teacher_id) {
      return []
    }

    const { data: fallbackData, error: fallbackError } = await supabase
      .from("schedule_blocks")
      .select("id, teacher_id, class_id, start_at, end_at, capacity")
      .is("class_id", null)
      .eq("teacher_id", classData.teacher_id)
      .eq("type", "available")
      .gt("start_at", bookingCutoffIso)
      .order("start_at", { ascending: true })

    if (fallbackError) {
      throw new Error("failed_to_fetch_available_schedule_slots")
    }

    scheduleRows = (fallbackData ?? []) as ScheduleBlockRow[]
    usesFallback = true
  }

  const appliedCountBySlotId = usesFallback
    ? await getAppliedCountByTeacherScheduleBlockIdWithClient(supabase, classData.teacher_id, scheduleRows)
    : await getAppliedCountByClassScheduleBlockIdWithClient(supabase, classId, scheduleRows)

  return scheduleRows.map((row) => {
    const mapped = mapAvailableSlot(row)
    const appliedCount = appliedCountBySlotId.get(row.id) ?? 0
    const remainingCount = Math.max(0, row.capacity - appliedCount)
    return {
      ...mapped,
      appliedCount,
      remainingCount,
      isClosed: remainingCount <= 0
    }
  })
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
          subject: subject || null,
          subjectCategoryId: options?.subjectCategoryId ?? null,
          subjectId: options?.subjectId ?? null,
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

    if (options?.subjectCategoryId) {
      query = query.eq("subject_category_id", options.subjectCategoryId)
    }

    if (options?.subjectId) {
      query = query.eq("subject_id", options.subjectId)
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

    const classRows = await attachSubjectMasterToRows(supabase, (data ?? []) as ClassRow[])
    if (debugEnabled) {
      console.info(
        `[listClasses] ${JSON.stringify({ classesRows: classRows.length })}`
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
      .filter((row) => {
        if (!subject) {
          return true
        }

        return normalizeSubjectCategory(row.subject) === normalizeSubjectCategory(subject)
      })
      .map((row) => {
        // 선생님은 학원 내부 명부 개념이라 학부모 목록에 이름을 노출하지 않는다.
        const teacherName = null
        const organizationName = row.organization_id
          ? (organizationNameById.get(row.organization_id) ?? null)
          : null
        const mappedClass = mapClass(row, teacherName, {
          allowClassTeacherFallback: false
        })
        const subjectLabel = formatClassSubjectDisplayLabel(mappedClass)

        return {
          mapped: mappedClass,
          haystacks: [
            row.title,
            row.description,
            row.subject,
            subjectLabel,
            mappedClass.subjectCategoryName,
            mappedClass.subjectName,
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
      .map(({ mapped }) => hideHiddenSchedulesForPublicClass(mapped))
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

      const [classRow] = await attachSubjectMasterToRows(supabase, [retry.data as ClassRow])
      const detail: ClassDetail = {
        ...mapClass(classRow, null, {
          allowClassTeacherFallback: false
        }),
        organization: mapOrganizationLocation(getEmbeddedOrganization(classRow))
      }

      return hideHiddenSchedulesForPublicClass(detail)
    }

    if (error) {
      throw new Error("failed_to_fetch_class")
    }

    if (!data) {
      return null
    }

    const [classRow] = await attachSubjectMasterToRows(supabase, [data as ClassRow])
    const detail: ClassDetail = {
      ...mapClass(classRow, null, {
        allowClassTeacherFallback: false
      }),
      organization: mapOrganizationLocation(getEmbeddedOrganization(classRow))
    }

    return hideHiddenSchedulesForPublicClass(detail)
  },
  async listStudioClassListItems(organizationId) {
    const debugEnabled = shouldDebugDb()
    if (debugEnabled) {
      const { supabaseUrl } = getPublicEnv()
      console.info("[listStudioClassListItems] start", {
        supabaseHost: new URL(supabaseUrl).host,
        organizationId
      })
    }

    const supabase = await getSupabaseServerClient()
    const initialResult = await supabase
      .from("classes")
      .select(STUDIO_CLASS_LIST_SELECT_FIELDS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })

    const { data, error } = isMissingColumnError(initialResult.error)
      ? await supabase
          .from("classes")
          .select(LEGACY_STUDIO_CLASS_LIST_SELECT_FIELDS)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
      : initialResult

    if (error) {
      if (debugEnabled) {
        console.error("[listStudioClassListItems] classes query failed", {
          message: error.message ?? null,
          code: (error as { code?: string }).code ?? null,
          details: (error as { details?: string }).details ?? null
        })
      }
      throw new Error("failed_to_fetch_studio_class_list_items")
    }

    const classRows = await attachSubjectMasterToRows(
      supabase,
      (data ?? []) as StudioClassListRow[]
    )
    const [scheduleSummaryByClassId, teacherNameMap] = await Promise.all([
      getScheduleSummaryByClassId(
        supabase,
        classRows.map((row) => row.id)
      ),
      getStudioTeacherDisplayNameMap(
        classRows.map((row) => row.teacher_id).filter((id): id is string => Boolean(id))
      ).catch(() => new Map<string, string>())
    ])

    const mapped = classRows.map((row) =>
      mapStudioClassListItem(
        row,
        row.teacher_id ? (teacherNameMap.get(row.teacher_id) ?? null) : null,
        scheduleSummaryByClassId.get(row.id) ?? EMPTY_STUDIO_CLASS_SCHEDULE_SUMMARY
      )
    )

    if (debugEnabled) {
      console.info("[listStudioClassListItems] done", {
        rows: classRows.length,
        returned: mapped.length,
        teacherNames: teacherNameMap.size
      })
    }

    return mapped
  },
  async getStudioScheduleCalendar(input) {
    const monthRange = getMonthRange(input.month)
    if (!monthRange) {
      throw new Error("invalid_schedule_month")
    }

    const rows = await listClassSchedulesInRange(
      input.organizationId,
      monthRange.monthStart,
      monthRange.monthEnd,
      {
        classId: input.classId ?? null,
        teacherId: input.teacherId ?? null
      }
    )

    const teacherIds = Array.from(
      new Set(rows.map((row) => row.classes.teacher_id).filter((teacherId): teacherId is string => Boolean(teacherId)))
    )
    const teacherNameById = await getTeacherNamesByIds(teacherIds)
    const activeReservationCountByOccurrence = await getActiveReservationCountByScheduleOccurrence(
      input.classId ?? "",
      rows.map((row) => row.id)
    )

    const items = rows.flatMap((row) =>
      generateClassScheduleOccurrencesWithinRange(row, monthRange.monthStart, monthRange.monthEnd).map((occurrence) =>
        buildStudioScheduleCalendarItem(
          row,
          teacherNameById,
          occurrence,
          activeReservationCountByOccurrence.get(
            buildScheduleOccurrenceReservationKey(row.id, occurrence.startAt)
          ) ?? 0
        )
      )
    )

    return {
      items,
      days: buildStudioScheduleCalendarDays(items)
    }
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

      const classRows = await attachSubjectMasterToRows(supabase, (retry.data ?? []) as ClassRow[])
      const classRowsWithSchedules = await attachClassSchedulesToRows(supabase, classRows)
      if (debugEnabled) {
        console.info("[listStudioClasses] classes fetched (fallback)", { rows: classRows.length })
      }
      const teacherIds = Array.from(
        new Set(classRowsWithSchedules.map((row) => row.teacher_id).filter((id): id is string => Boolean(id)))
      )
      let teacherNameMap = new Map<string, string>()
      try {
        teacherNameMap = await getStudioTeacherDisplayNameMap(teacherIds)
      } catch {
        teacherNameMap = new Map<string, string>()
      }
      if (debugEnabled) {
        console.info("[listStudioClasses] teacher names (fallback)", {
          teacherIds: teacherIds.length,
          teacherNames: teacherNameMap.size
        })
      }

      const mapped = classRowsWithSchedules.map((row) =>
        mapClass(row, row.teacher_id ? (teacherNameMap.get(row.teacher_id) ?? null) : null)
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

    const classRowsWithSubjects = await attachSubjectMasterToRows(supabase, (data ?? []) as ClassRow[])
    const classRows = await attachClassSchedulesToRows(supabase, classRowsWithSubjects)
    if (debugEnabled) {
      console.info("[listStudioClasses] classes fetched", { rows: classRows.length })
    }
    const teacherIds = Array.from(
      new Set(classRows.map((row) => row.teacher_id).filter((id): id is string => Boolean(id)))
    )
    let teacherNameMap = new Map<string, string>()
    try {
      teacherNameMap = await getStudioTeacherDisplayNameMap(teacherIds)
    } catch {
      teacherNameMap = new Map<string, string>()
    }
    if (debugEnabled) {
      console.info("[listStudioClasses] teacher names", {
        teacherIds: teacherIds.length,
        teacherNames: teacherNameMap.size
      })
    }

    const mapped = classRows.map((row) =>
      mapClass(row, row.teacher_id ? (teacherNameMap.get(row.teacher_id) ?? null) : null)
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
  // 선생님 수만큼 조회하지 않는다. organization 단위로 배정된 수업을 한 번 읽고 메모리에서 묶는다.
  // 명부의 "담당 수업" 은 현재 운영 중인 수업을 뜻하므로 비활성 수업은 제외한다.
  async listStudioTeacherAssignments(organizationId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("classes")
      .select("id, title, teacher_id, subject, subject_category_id, subject_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .not("teacher_id", "is", null)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_studio_teacher_assignments")
    }

    const rows = (data ?? []) as StudioTeacherAssignmentRow[]
    if (rows.length === 0) {
      return []
    }

    const { categoryById, subjectById } = await loadSubjectMasterMapsByIdsWithClient(
      supabase,
      rows.map((row) => row.subject_category_id).filter((id): id is string => Boolean(id)),
      rows.map((row) => row.subject_id).filter((id): id is string => Boolean(id))
    )

    const byTeacherId = new Map<string, { titles: string[]; subjects: string[] }>()
    for (const row of rows) {
      if (!row.teacher_id) {
        continue
      }

      const bucket = byTeacherId.get(row.teacher_id) ?? { titles: [], subjects: [] }
      bucket.titles.push(row.title)

      // 명부 목록은 좁으므로 과목명만 쓰고, 과목이 없으면 카테고리명으로 떨어진다.
      // resolve 되지 않으면 억지 fallback 을 넣지 않는다.
      const display = resolveClassSubjectDisplay({
        ...buildClassSubjectReadModel({
          subjectCategoryId: row.subject_category_id,
          masterCategory: row.subject_category_id ? categoryById.get(row.subject_category_id) ?? null : null,
          subjectId: row.subject_id,
          masterSubject: row.subject_id ? subjectById.get(row.subject_id) ?? null : null
        }),
        subject: row.subject
      })
      const label = (display.subjectLabel ?? display.categoryLabel ?? "").trim()

      if (label && !bucket.subjects.includes(label)) {
        bucket.subjects.push(label)
      }

      byTeacherId.set(row.teacher_id, bucket)
    }

    return Array.from(byTeacherId.entries()).map(([teacherId, bucket]) => ({
      teacherId,
      classCount: bucket.titles.length,
      classTitles: bucket.titles,
      subjectLabels: bucket.subjects
    }))
  },
  async createStudioTeacher(input) {
    // 선생님 등록은 학원 내부 명부 등록이라 인원 상한으로 막지 않는다.
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("teachers")
      .insert({
        profile_id: null,
        organization_id: input.organizationId,
        display_name: input.displayName,
        phone: input.phone,
        sms_enabled: input.smsEnabled
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
      // legacy 공개 프로필 컬럼은 payload 에 넣지 않는다. 컬럼은 아직 DB 에 남아 있고
      // 기존 값도 그대로 보존된다(부분 업데이트).
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
  async activateStudioTeacher(input: ActivateStudioTeacherInput) {
    const supabase = await getSupabaseServerClient()
    const { data: targetTeacher, error: targetError } = await supabase
      .from("teachers")
      .select("id, profile_id, organization_id, is_active")
      .eq("id", input.teacherId)
      .eq("organization_id", input.organizationId)
      .maybeSingle()

    if (targetError) {
      throw new Error(
        formatSupabaseError("failed_to_fetch_studio_teacher_for_activate", targetError, {
          organizationId: input.organizationId,
          teacherId: input.teacherId
        })
      )
    }

    if (!targetTeacher) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    if (targetTeacher.profile_id) {
      throw new Error("cannot_activate_linked_teacher")
    }

    if (targetTeacher.is_active) {
      return
    }

    const { error: updateError } = await supabase
      .from("teachers")
      .update({
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.teacherId)
      .eq("organization_id", input.organizationId)
      .is("profile_id", null)

    if (updateError) {
      throw new Error(
        formatSupabaseError("failed_to_activate_studio_teacher", updateError, {
          organizationId: input.organizationId,
          teacherId: input.teacherId
        })
      )
    }
  },
  async deleteStudioTeacher(input) {
    const supabase = await getSupabaseServerClient()

    // 1) 같은 organization 소속인지부터 확인한다. 클라이언트가 보낸 teacherId 를 그대로 믿지 않는다.
    const { data: targetTeacher, error: targetError } = await supabase
      .from("teachers")
      .select("id, profile_id, organization_id")
      .eq("id", input.teacherId)
      .eq("organization_id", input.organizationId)
      .maybeSingle()

    if (targetError) {
      throw new Error(
        formatSupabaseError("failed_to_fetch_studio_teacher_for_delete", targetError, {
          organizationId: input.organizationId,
          teacherId: input.teacherId
        })
      )
    }

    if (!targetTeacher) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    // 2) 로그인 계정과 연결된 legacy/system row 는 이 경로에서 지우지 않는다.
    //    system teacher 정리는 별도 Phase 에서만 다룬다.
    if (targetTeacher.profile_id) {
      throw new Error("cannot_delete_linked_teacher")
    }

    // 3) 실사용 참조 4종을 삭제 직전에 다시 센다.
    //    schedule_blocks 는 FK 가 ON DELETE CASCADE 라 참조가 남은 채 지우면 일정 행이 함께 사라진다.
    const [classesResult, applicationsResult, scheduleBlocksResult, smsLogsResult] = await Promise.all([
      supabase.from("classes").select("id", { count: "exact", head: true }).eq("teacher_id", input.teacherId),
      supabase
        .from("trial_applications")
        .select("id", { count: "exact", head: true })
        .eq("assigned_teacher_id", input.teacherId),
      supabase
        .from("schedule_blocks")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", input.teacherId),
      supabase.from("sms_logs").select("id", { count: "exact", head: true }).eq("teacher_id", input.teacherId)
    ])

    for (const result of [classesResult, applicationsResult, scheduleBlocksResult, smsLogsResult]) {
      if (result.error) {
        throw new Error(
          formatSupabaseError("failed_to_count_studio_teacher_references", result.error, {
            organizationId: input.organizationId,
            teacherId: input.teacherId
          })
        )
      }
    }

    const references: StudioTeacherReferenceCounts = {
      classes: classesResult.count ?? 0,
      trialApplications: applicationsResult.count ?? 0,
      scheduleBlocks: scheduleBlocksResult.count ?? 0,
      smsLogs: smsLogsResult.count ?? 0
    }

    const totalReferences =
      references.classes + references.trialApplications + references.scheduleBlocks + references.smsLogs

    if (totalReferences > 0) {
      throw new Error(`teacher_has_references:${JSON.stringify(references)}`)
    }

    // 4) 조건을 다시 WHERE 에 실어 보내 경합 시 조건이 깨진 row 를 지우지 않게 한다.
    const { data: deletedRows, error: deleteError } = await supabase
      .from("teachers")
      .delete()
      .eq("id", input.teacherId)
      .eq("organization_id", input.organizationId)
      .is("profile_id", null)
      .select("id")

    if (deleteError) {
      throw new Error(
        formatSupabaseError("failed_to_delete_studio_teacher", deleteError, {
          organizationId: input.organizationId,
          teacherId: input.teacherId
        })
      )
    }

    if ((deletedRows ?? []).length === 0) {
      throw new Error("teacher_not_found_or_forbidden")
    }
  },
  async upsertStudioClass(input) {
    const normalizedClassId = normalizeStudioClassId(input.classId)
    if (input.mode === "update" && !normalizedClassId) {
      throw new Error("invalid_class_id_for_update")
    }

    if (input.teacherId) {
      await assertTeacherBelongsToOrganization(input.teacherId, input.organizationId)
    }
    const teacherNames = input.teacherId ? await getTeacherNamesByIds([input.teacherId]) : new Map()
    const teacherDisplayName = input.teacherId
      ? (teacherNames.get(input.teacherId) ?? input.teacherDisplayName ?? null)
      : null

    const supabase = await getSupabaseServerClient()
    const [masterCategory, masterSubject] = await Promise.all([
      input.subjectCategoryId
        ? getActiveSubjectCategoryForWriteWithClient(supabase, input.subjectCategoryId)
        : null,
      input.subjectId
        ? getActiveSubjectForWriteWithClient(supabase, input.subjectId)
        : null
    ])
    if (input.subjectCategoryId && !masterCategory) {
      throw new Error("invalid_or_inactive_subject_category_id")
    }
    if (input.subjectId && !masterSubject) {
      throw new Error("invalid_or_inactive_subject_id")
    }
    if (masterSubject && !masterCategory) {
      throw new Error("subject_category_required")
    }
    if (masterSubject && masterSubject.categoryId !== masterCategory?.id) {
      throw new Error("subject_category_mismatch")
    }

    let legacySubjectCategoryId: string | null | undefined
    let legacySubjectId: string | null | undefined
    if (input.mode === "update" && !input.subjectCategoryId) {
      const { data: existingSubjectData, error: existingSubjectError } = await supabase
        .from("classes")
        .select("subject, subject_category_id, subject_id")
        .eq("id", normalizedClassId)
        .eq("organization_id", input.organizationId)
        .maybeSingle()

      if (existingSubjectError) {
        throw new Error(
          formatSupabaseError("failed_to_fetch_existing_class_subject", existingSubjectError, {
            classId: normalizedClassId,
            organizationId: input.organizationId
          })
        )
      }

      if (!existingSubjectData) {
        throw new Error("studio_class_not_found_or_forbidden")
      }

      const legacySubjectChange = resolveLegacySubjectChange({
        existingSubject: String(existingSubjectData.subject ?? ""),
        nextSubject: input.subject
      })

      if (legacySubjectChange.action === "map") {
        const mappedSubject = await getActiveSubjectForWriteByCodeWithClient(
          supabase,
          legacySubjectChange.subjectCode
        )
        if (!mappedSubject) {
          throw new Error("legacy_subject_master_mapping_not_found")
        }
        legacySubjectCategoryId = mappedSubject.categoryId
        legacySubjectId = mappedSubject.id
      } else if (legacySubjectChange.action === "clear") {
        legacySubjectCategoryId = null
        legacySubjectId = null
      }
    }

    const subjectWritePayload = buildClassSubjectWritePayload({
      legacySubject: input.subject,
      masterCategory,
      masterSubject,
      legacySubjectCategoryId,
      legacySubjectId
    })
    const persistedSubject = subjectWritePayload.subject

    const schedulePayloadForLog = summarizeStudioClassScheduleSlots(input.scheduleSlots)
    const basePayload = {
      organization_id: input.organizationId,
      program_type: input.programType,
      assignment_mode: input.assignmentMode,
      title: input.title,
      ...subjectWritePayload,
      target_age: input.targetAge,
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
          subject: persistedSubject,
          targetAge: input.targetAge,
          trialPrice: input.trialPrice
          }
        )
      )
    }

    let savedClassRow: ClassRow | null = (data as ClassRow | null) ?? null

    if (!savedClassRow) {
      if (input.mode === "create") {
        let fallbackQuery = supabase
          .from("classes")
          .select(CLASS_BASE_SELECT_FIELDS)
          .eq("organization_id", input.organizationId)
          .eq("title", input.title)
          .eq("subject", persistedSubject)
          .eq("target_age", input.targetAge)
          .eq("trial_price", input.trialPrice)
          .order("created_at", { ascending: false })
          .limit(1)

        fallbackQuery = input.teacherId
          ? fallbackQuery.eq("teacher_id", input.teacherId)
          : fallbackQuery.is("teacher_id", null)

        const { data: fallbackRow, error: fallbackError } = await fallbackQuery.maybeSingle()

        if (fallbackError) {
          throw new Error(
            formatSupabaseError("create_studio_class_fallback_lookup_failed", fallbackError, {
              mode: input.mode,
              classId: normalizedClassId,
              organizationId: input.organizationId,
              teacherId: input.teacherId,
              title: input.title,
              subject: persistedSubject,
              targetAge: input.targetAge,
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
              subject: persistedSubject,
              targetAge: input.targetAge,
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
      if (input.mode === "create") {
        await cleanupCreatedStudioClass(supabase, savedClassRow.id, input.organizationId)
      }
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
    const existingScheduleIds = existingSchedules.map((slot) => slot.id)
    const protectedScheduleIdSet = new Set<string>()

    if (existingScheduleIds.length > 0) {
      const { data: protectedScheduleData, error: protectedScheduleError } = await supabase
        .from("trial_applications")
        .select("class_schedule_id")
        .in("class_schedule_id", existingScheduleIds)

      if (protectedScheduleError) {
        throw new Error(
          formatSupabaseError("class_schedule_usage_fetch_failed", protectedScheduleError, {
            mode: input.mode,
            classId: savedClassRow.id,
            organizationId: input.organizationId
          })
        )
      }

      for (const row of (protectedScheduleData ?? []) as Array<{ class_schedule_id: string | null }>) {
        if (row.class_schedule_id) {
          protectedScheduleIdSet.add(row.class_schedule_id)
        }
      }
    }

    const normalizedSchedulePayload: Array<DbClassSchedulePayload | DbClassScheduleInsertPayload> =
      toDbClassSchedulePayload(savedClassRow.id, input.scheduleSlots).map((slot) => {
        if (slot.id && existingScheduleIdSet.has(slot.id)) {
          const existingSchedule = existingSchedules.find((item) => item.id === slot.id)
          return existingSchedule ? mergeExistingClassScheduleMeta(slot, existingSchedule) : slot
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

    const removedProtectedScheduleIds = removedScheduleIds.filter((scheduleId) =>
      protectedScheduleIdSet.has(scheduleId)
    )

    if (removedProtectedScheduleIds.length > 0) {
      if (input.mode === "create") {
        await cleanupCreatedStudioClass(supabase, savedClassRow.id, input.organizationId)
      }
      throw new Error(
        `protected_class_schedule_delete_blocked | payload=${JSON.stringify({
          classId: savedClassRow.id,
          protectedScheduleIds: removedProtectedScheduleIds
        })}`
      )
    }

    for (const slot of persistedSchedulePayload) {
      if (!protectedScheduleIdSet.has(slot.id)) {
        continue
      }

      const existingSchedule = existingSchedules.find((item) => item.id === slot.id)
      if (!existingSchedule) {
        continue
      }

      if (isProtectedClassScheduleChanged(existingSchedule, slot)) {
        if (input.mode === "create") {
          await cleanupCreatedStudioClass(supabase, savedClassRow.id, input.organizationId)
        }
        throw new Error(
          `protected_class_schedule_update_blocked | payload=${JSON.stringify({
            classId: savedClassRow.id,
            protectedScheduleId: slot.id
          })}`
        )
      }
    }

    if (persistedSchedulePayload.length > 0) {
      const { error: updateScheduleError } = await supabase
        .from("class_schedules")
        .upsert(persistedSchedulePayload, { onConflict: "id" })

      if (updateScheduleError) {
        if (input.mode === "create") {
          await cleanupCreatedStudioClass(supabase, savedClassRow.id, input.organizationId)
        }
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
        if (input.mode === "create") {
          await cleanupCreatedStudioClass(supabase, savedClassRow.id, input.organizationId)
        }
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
        if (input.mode === "create") {
          await cleanupCreatedStudioClass(supabase, savedClassRow.id, input.organizationId)
        }
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
      if (input.mode === "create") {
        await cleanupCreatedStudioClass(supabase, savedClassRow.id, input.organizationId)
      }
      throw new Error(
        formatSupabaseError("class_schedule_fetch_failed", refreshedScheduleError, {
          mode: input.mode,
          classId: savedClassRow.id,
          organizationId: input.organizationId
        })
      )
    }

    const savedTeacherIds = savedClassRow.teacher_id ? [savedClassRow.teacher_id] : []
    // Studio 는 공개 view 가 아니라 내부 명부의 display_name 을 쓴다.
    const teacherNameMap = await getStudioTeacherDisplayNameMap(savedTeacherIds)
    const [savedClassWithSubject] = await attachSubjectMasterToRows(supabase, [savedClassRow])
    const classWithSchedules = {
      ...savedClassWithSubject,
      class_schedules: (refreshedScheduleData ?? []) as ClassScheduleRow[]
    }

    return mapClass(
      classWithSchedules as ClassRow,
      savedClassRow.teacher_id ? (teacherNameMap.get(savedClassRow.teacher_id) ?? null) : null
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
  async createStudioClassSchedule(input) {
    const classRow = await getClassOwnershipRow(input.classId, input.organizationId)
    const effectiveTeacherId = input.teacherId ?? classRow.teacher_id ?? null
    if (effectiveTeacherId) {
      await assertTeacherBelongsToOrganization(effectiveTeacherId, input.organizationId)
    }

    if (!isValidDateString(input.specificDate)) {
      throw new Error("invalid_schedule_date")
    }

    const startTime = normalizeTimeValue(input.startTime)
    const endTime = normalizeTimeValue(input.endTime)
    if (!startTime || !endTime || compareTimeValues(startTime, endTime) >= 0) {
      throw new Error("invalid_schedule_time_range")
    }

    if (!Number.isInteger(input.capacity) || input.capacity < 1) {
      throw new Error("invalid_schedule_capacity")
    }

    const previewInput: BulkCreateClassSchedulesInput = {
      organizationId: input.organizationId,
      classId: input.classId,
      teacherId: effectiveTeacherId,
      startDate: input.specificDate,
      endDate: input.specificDate,
      repeatMode: "custom",
      weekdays: [dateStringToWeekday(input.specificDate) ?? -1],
      timeSlots: [{ startTime, endTime, capacity: input.capacity }]
    }

    const { preview, creatableRows } = await buildBulkPreviewItems(previewInput)
    if (preview.duplicateCount > 0) {
      throw new Error("duplicate_class_schedule")
    }

    const payload = creatableRows[0]
    if (!payload) {
      throw new Error("failed_to_prepare_class_schedule")
    }

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("class_schedules")
      .insert(payload)
      .select(CLASS_SCHEDULE_SELECT_FIELDS)
      .single()

    if (error || !data) {
      throw new Error(
        formatSupabaseError("failed_to_create_class_schedule", error ?? {}, {
          organizationId: input.organizationId,
          classId: input.classId,
          specificDate: input.specificDate,
          startTime,
          endTime
        })
      )
    }

    return mapClassSchedule(data as ClassScheduleRow)
  },
  async updateStudioClassSchedule(input) {
    const scheduleRow = await getClassScheduleById(input.classScheduleId, input.organizationId)
    const activeReservationCountByScheduleId = await getActiveReservationCountByClassScheduleIds([scheduleRow.id])
    const activeReservationCount = activeReservationCountByScheduleId.get(scheduleRow.id) ?? 0

    if (scheduleRow.schedule_type !== "one_time") {
      throw new Error("weekly_class_schedule_must_be_updated_from_class_management")
    }

    const nextCapacityValue =
      typeof input.capacity === "number" ? Math.max(1, Math.trunc(input.capacity)) : scheduleRow.capacity ?? 1

    if (nextCapacityValue < activeReservationCount) {
      throw new Error("class_schedule_capacity_below_active_reservations")
    }

    const nextDisplayLabel =
      input.displayLabel === undefined ? scheduleRow.display_label ?? null : input.displayLabel
    const nextBookingStatus = input.bookingStatus ?? scheduleRow.booking_status ?? "open"

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("class_schedules")
      .update({
        capacity: nextCapacityValue,
        booking_status: nextBookingStatus,
        display_label: nextDisplayLabel,
        updated_at: new Date().toISOString()
      })
      .eq("id", scheduleRow.id)
      .select(CLASS_SCHEDULE_SELECT_FIELDS)
      .single()

    if (error || !data) {
      throw new Error(
        formatSupabaseError("failed_to_update_class_schedule", error ?? {}, {
          organizationId: input.organizationId,
          classScheduleId: input.classScheduleId
        })
      )
    }

    return mapClassSchedule(data as ClassScheduleRow)
  },
  async updateStudioClassSchedulesForDate(input) {
    await getClassOwnershipRow(input.classId, input.organizationId)

    if (!isValidDateString(input.specificDate)) {
      throw new Error("invalid_schedule_date")
    }

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("class_schedules")
      .update({
        booking_status: input.bookingStatus,
        updated_at: new Date().toISOString()
      })
      .eq("class_id", input.classId)
      .eq("schedule_type", "one_time")
      .eq("specific_date", input.specificDate)
      .select("id")

    if (error) {
      throw new Error(
        formatSupabaseError("failed_to_update_class_schedules_for_date", error, {
          organizationId: input.organizationId,
          classId: input.classId,
          specificDate: input.specificDate
        })
      )
    }

    return Array.isArray(data) ? data.length : 0
  },
  async deleteStudioClassSchedule(input) {
    const scheduleRow = await getClassScheduleById(input.classScheduleId, input.organizationId)
    const activeReservationCountByScheduleId = await getActiveReservationCountByClassScheduleIds([scheduleRow.id])
    const activeReservationCount = activeReservationCountByScheduleId.get(scheduleRow.id) ?? 0

    if (activeReservationCount > 0) {
      throw new Error("class_schedule_with_active_reservations_cannot_be_deleted")
    }

    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.from("class_schedules").delete().eq("id", scheduleRow.id)

    if (error) {
      throw new Error(
        formatSupabaseError("failed_to_delete_class_schedule", error, {
          organizationId: input.organizationId,
          classScheduleId: input.classScheduleId
        })
      )
    }
  },
  async previewBulkCreateClassSchedules(input) {
    return (await buildBulkPreviewItems(input)).preview
  },
  async bulkCreateClassSchedules(input) {
    const { preview, creatableRows } = await buildBulkPreviewItems(input)
    if (creatableRows.length === 0) {
      return {
        insertedCount: 0,
        skippedDuplicateCount: preview.duplicateCount,
        teacherConflictCount: preview.teacherConflictCount,
        seriesId: null,
        insertedScheduleIds: []
      }
    }

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("class_schedules")
      .insert(creatableRows)
      .select("id, series_id")

    if (error) {
      throw new Error(
        formatSupabaseError("failed_to_bulk_create_class_schedules", error, {
          organizationId: input.organizationId,
          classId: input.classId,
          startDate: input.startDate,
          endDate: input.endDate,
          insertCount: creatableRows.length
        })
      )
    }

    const insertedRows = (data ?? []) as Array<{ id: string; series_id?: string | null }>

    return {
      insertedCount: insertedRows.length,
      skippedDuplicateCount: preview.duplicateCount,
      teacherConflictCount: preview.teacherConflictCount,
      seriesId: insertedRows[0]?.series_id ?? creatableRows[0]?.series_id ?? null,
      insertedScheduleIds: insertedRows.map((row) => row.id)
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
    return listAvailableScheduleSlotsByClassIdWithClient({ classId, supabase })
  },
  async listMyApplications(parentId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("trial_applications")
      .select(
        "id, class_id, parent_id, child_name, child_grade, parent_name, parent_phone, class_schedule_id, requested_schedule_block_id, selected_schedule_label, requested_slot_at, confirmed_slot_at, registration_status, goal_type, status, created_at, updated_at, classes(title, program_type, organization_id, teacher_display_name)"
      )
      .eq("parent_id", parentId)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_my_trial_applications")
    }

    const rows = (data ?? []) as TrialApplicationRow[]
    const organizationLocationMap = await getOrganizationLocationMap(
      rows
        .map((row) => getEmbeddedClass(row)?.organization_id ?? null)
        .filter((organizationId): organizationId is string => Boolean(organizationId))
    )

    return rows.map((row) => {
      const embeddedClass = getEmbeddedClass(row)
      const base = mapApplication(row)
      const organizationRow =
        embeddedClass?.organization_id
          ? organizationLocationMap.get(embeddedClass.organization_id) ?? null
          : null
      const organization = organizationRow ? mapOrganizationLocation(organizationRow) : null

      return {
        ...base,
        academyName: organization
          ? [organization.name, organization.branchName].filter(Boolean).join(" ").trim() || null
          : null,
        organizationAddress: organization?.address ?? null,
        organizationAddressDetail: organization?.addressDetail ?? null
      }
    })
  },
  async listStudioApplications(organizationId, options: StudioApplicationListOptions = {}) {
    const supabase = await getSupabaseServerClient()

    // range 마다 같은 조건/정렬로 다시 만든다. Supabase query builder 는 재사용하면
    // 이전 range 가 남으므로 페이지마다 새로 빌드해야 한다.
    const buildQuery = () => {
      let query = supabase
        .from("trial_applications")
        .select(
          "id, class_id, parent_id, child_name, child_grade, parent_name, parent_phone, class_schedule_id, requested_schedule_block_id, selected_schedule_label, requested_slot_at, confirmed_slot_at, assigned_teacher_id, contacted_at, scheduled_at, completed_at, enrolled_at, canceled_at, no_show_at, goal_type, registration_status, unregistered_reason, status, created_at, updated_at, classes!inner(title, subject, organization_id, program_type, organizations(sido, sigungu, bname)), class_schedules(start_time, end_time), confirmed_block:schedule_blocks!trial_applications_confirmed_schedule_block_id_fkey(start_at, end_at)",
          // 총 개수를 알아야 서버가 page 를 잘라도 끝을 정확히 안다.
          // 같은 request 에 실려 오므로 query 가 늘지 않는다(getStudioCases 와 같은 방식).
          { count: "exact" }
        )
        // trial_applications 에는 organization_id 가 없다. 조직 스코프는 이 inner join 이 유일하다.
        .eq("classes.organization_id", organizationId)

      if (options.teacherId) {
        query = query.eq("assigned_teacher_id", options.teacherId)
      }

      if (options.createdAtFrom) {
        query = query.gte("created_at", options.createdAtFrom)
      }

      if (options.createdAtTo) {
        query = query.lte("created_at", options.createdAtTo)
      }

      // created_at 만으로는 동률 row 의 순서가 정해지지 않아 페이지 경계에서
      // 같은 row 가 두 번 오거나 아예 빠질 수 있다. id 로 tie-break 한다.
      // "최근 신청 먼저" 라는 기존 의미는 그대로다.
      return query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
    }

    // 전체를 반환하는 계약이라 page 를 끝까지 이어 붙인다.
    //
    // 종료 조건을 "page 가 가득 차지 않으면 끝" 으로 두면 안 된다.
    // PostgREST 는 요청한 range 보다 db max_rows 가 작으면 말없이 잘라서 주므로,
    // 잘린 페이지를 마지막 페이지로 오해해 그대로 truncation 이 재현된다.
    // 그래서 첫 페이지의 exact count 를 기준으로 삼고, 커서는 실제로 받은
    // row 수만큼만 전진시킨다. 서버가 얼마를 잘라 주든 정확히 이어 붙는다.
    const rows: TrialApplicationRow[] = []
    let totalCount: number | null = null

    for (;;) {
      const { data, error, count } = await buildQuery().range(
        rows.length,
        rows.length + STUDIO_APPLICATION_PAGE_SIZE - 1
      )

      if (error) {
        throw new Error("failed_to_fetch_studio_applications")
      }

      if (totalCount === null) {
        totalCount = count ?? 0
      }

      const page = (data ?? []) as TrialApplicationRow[]
      rows.push(...page)

      // 다 받았거나(정상 종료), 서버가 더 줄 게 없으면(방어) 끝낸다.
      // 두 조건 중 하나는 반드시 성립하므로 무한 loop 이 되지 않는다.
      if (rows.length >= totalCount || page.length === 0) {
        break
      }
    }

    // teacher 이름은 페이지마다가 아니라 전체 row 를 모은 뒤 한 번만 조회한다(N+1 방지).
    const teacherNameById = await getStudioTeacherDisplayNameMap(
      rows
        .map((row) => row.assigned_teacher_id)
        .filter((teacherId): teacherId is string => Boolean(teacherId))
    )

    return rows.map((row) => mapStudioApplication(row, teacherNameById))
  },
  async listStudioUnregisteredApplications(
    organizationId,
    options: StudioUnregisteredListOptions = {}
  ) {
    const supabase = await getSupabaseServerClient()
    let query = supabase
      .from("trial_applications")
      .select(
        "id, child_name, child_grade, parent_name, parent_phone, assigned_teacher_id, completed_at, consultation_note, follow_up_note, registration_status, updated_at, classes!inner(title, subject, organization_id)"
      )
      .eq("classes.organization_id", organizationId)
      .eq("status", "completed")
      .or("registration_status.is.null,registration_status.eq.not_enrolled,registration_status.eq.pending,registration_status.eq.undecided")

    if (options.teacherId) {
      query = query.eq("assigned_teacher_id", options.teacherId)
    }

    if (options.completedAtFrom) {
      query = query.gte("completed_at", options.completedAtFrom)
    }

    if (options.completedAtTo) {
      query = query.lte("completed_at", options.completedAtTo)
    }

    const { data, error } = await query.order("completed_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_studio_unregistered_applications")
    }

    const rows = (data ?? []) as TrialApplicationRow[]
    const teacherNameById = await getStudioTeacherDisplayNameMap(
      rows
        .map((row) => row.assigned_teacher_id)
        .filter((teacherId): teacherId is string => Boolean(teacherId))
    )
    const applicationIds = rows.map((row) => row.id)
    const latestLogNoteByApplicationId = new Map<string, string>()

    if (applicationIds.length > 0) {
      const { data: logData, error: logError } = await supabase
        .from("application_logs")
        .select("application_id, note, created_at")
        .in("application_id", applicationIds)
        .order("created_at", { ascending: false })

      if (logError) {
        throw new Error("failed_to_fetch_studio_unregistered_application_logs")
      }

      for (const row of (logData ?? []) as Array<{
        application_id: string
        note: string | null
        created_at: string
      }>) {
        const trimmedNote = row.note?.trim()
        if (!trimmedNote || latestLogNoteByApplicationId.has(row.application_id)) {
          continue
        }

        latestLogNoteByApplicationId.set(row.application_id, trimmedNote)
      }
    }

    return rows.map((row): StudioUnregisteredApplicationItem => {
      const embeddedClass = getEmbeddedClass(row)
      const completedAt = row.completed_at ?? row.updated_at

      return {
        id: row.id,
        childName: row.child_name,
        childGrade: row.child_grade,
        parentName: row.parent_name ?? null,
        parentPhone: row.parent_phone ?? null,
        classTitle: embeddedClass?.title ?? null,
        classSubject: embeddedClass?.subject ?? null,
        assignedTeacherId: row.assigned_teacher_id ?? null,
        assignedTeacherName: row.assigned_teacher_id
          ? teacherNameById.get(row.assigned_teacher_id) ?? null
          : null,
        completedAt,
        registrationStatus: row.registration_status ?? null,
        consultationNote: row.consultation_note?.trim() ? row.consultation_note.trim() : null,
        followUpNote: row.follow_up_note?.trim() ? row.follow_up_note.trim() : null,
        latestApplicationLogNote: latestLogNoteByApplicationId.get(row.id) ?? null
      }
    })
  },
  async getStudioUnregisteredActionRequiredCount(organizationId) {
    const supabase = await getSupabaseServerClient()
    const { count, error } = await supabase
      .from("trial_applications")
      .select("id, classes!inner(id)", { count: "exact", head: true })
      .eq("classes.organization_id", organizationId)
      .eq("status", "completed")
      .or("registration_status.is.null,registration_status.eq.pending,registration_status.eq.undecided")

    if (error) {
      throw new Error("failed_to_fetch_studio_unregistered_action_required_count")
    }

    return count ?? 0
  },
  async listStudioConsultationPipelineApplications(organizationId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("trial_applications")
      .select(
        "id, child_name, child_grade, parent_name, parent_phone, assigned_teacher_id, completed_at, next_contact_at, last_activity_at, enrolled_at, lost_at, registration_status, unregistered_reason, unregistered_reason_note, updated_at, classes!inner(title, subject, organization_id)"
      )
      .eq("classes.organization_id", organizationId)
      .eq("status", "completed")
      .in("registration_status", ["undecided", "pending", "enrolled", "not_enrolled"])
      .order("completed_at", { ascending: false })

    if (error) {
      throw new Error("failed_to_fetch_studio_consultation_pipeline_applications")
    }

    const rows = (data ?? []) as TrialApplicationRow[]
    const applicationIds = rows.map((row) => row.id)

    const consultationCountByApplicationId = new Map<string, number>()
    const hasAnyConsultationHistoryByApplicationId = new Map<string, boolean>()
    const legacyImportExistsByApplicationId = new Map<string, boolean>()
    const latestConsultationByApplicationId = new Map<string, ConsultationLogRow>()
    const trialResultApplicationIds = new Set<string>()

    // teacher 이름과 consultation_logs/trial_results 는 rows 만 있으면 서로 독립이다.
    // 같은 wave 에서 시작해 직렬 await 를 줄인다. 결과 해석 순서는 그대로 둔다.
    const [teacherNameById, consultationLogResult, trialResultResult] = await Promise.all([
      getStudioTeacherDisplayNameMap(
        rows
          .map((row) => row.assigned_teacher_id)
          .filter((teacherId): teacherId is string => Boolean(teacherId))
      ),
      applicationIds.length > 0
        ? supabase
            .from("consultation_logs")
            .select(
              "id, application_id, occurred_at, activity_type, channel, sentiment, registration_status_snapshot, regular_schedule_preference_snapshot, regular_schedule_preference_note_snapshot, unregistered_reason_snapshot, unregistered_reason_note_snapshot, next_action, next_contact_at, note, created_by, created_at, updated_at"
            )
            .in("application_id", applicationIds)
            .order("occurred_at", { ascending: false })
        : null,
      applicationIds.length > 0
        ? supabase.from("trial_results").select("application_id").in("application_id", applicationIds)
        : null
    ])

    if (applicationIds.length > 0) {
      const { data: consultationLogData, error: consultationLogError } = consultationLogResult ?? {
        data: null,
        error: null
      }
      const { data: trialResultData, error: trialResultError } = trialResultResult ?? {
        data: null,
        error: null
      }

      if (consultationLogError) {
        throw new Error("failed_to_fetch_studio_consultation_pipeline_logs")
      }

      if (trialResultError) {
        throw new Error("failed_to_fetch_studio_consultation_pipeline_trial_results")
      }

      for (const row of (trialResultData ?? []) as Pick<TrialResultRow, "application_id">[]) {
        trialResultApplicationIds.add(row.application_id)
      }

      for (const row of (consultationLogData ?? []) as ConsultationLogRow[]) {
        if (row.activity_type !== "CONSULTATION" && row.activity_type !== "LEGACY_IMPORT") {
          continue
        }

        hasAnyConsultationHistoryByApplicationId.set(row.application_id, true)

        if (row.activity_type === "LEGACY_IMPORT") {
          legacyImportExistsByApplicationId.set(row.application_id, true)
          continue
        }

        consultationCountByApplicationId.set(
          row.application_id,
          (consultationCountByApplicationId.get(row.application_id) ?? 0) + 1
        )

        if (!latestConsultationByApplicationId.has(row.application_id)) {
          latestConsultationByApplicationId.set(row.application_id, row)
        }
      }
    }

    const latestConsultationCreatedByName = await getProfileNameMap(
      Array.from(
        new Set(
          Array.from(latestConsultationByApplicationId.values())
            .map((row) => row.created_by)
            .filter((createdBy): createdBy is string => Boolean(createdBy))
        )
      )
    )

    return rows.map((row): StudioConsultationPipelineApplicationItem => {
      const embeddedClass = getEmbeddedClass(row)
      const completedAt = row.completed_at ?? row.updated_at
      const latestConsultationRow = latestConsultationByApplicationId.get(row.id)
      const latestConsultation = latestConsultationRow
        ? mapStudioConsultationLog(latestConsultationRow)
        : null
      const hasAnyConsultationHistory = hasAnyConsultationHistoryByApplicationId.get(row.id) ?? false

      const item: StudioConsultationPipelineApplicationItem = {
        id: row.id,
        childName: row.child_name,
        childGrade: row.child_grade,
        parentName: row.parent_name ?? null,
        parentPhone: row.parent_phone ?? null,
        classTitle: embeddedClass?.title ?? null,
        classSubject: embeddedClass?.subject ?? null,
        registrationStatus: row.registration_status as ApplicationRegistrationStatus,
        completedAt,
        nextContactAt: row.next_contact_at ?? null,
        lastActivityAt: row.last_activity_at ?? null,
        enrolledAt: row.enrolled_at ?? null,
        lostAt: row.lost_at ?? null,
        unregisteredReason: row.unregistered_reason ?? null,
        unregisteredReasonNote: row.unregistered_reason_note?.trim()
          ? row.unregistered_reason_note.trim()
          : null,
        assignedTeacherId: row.assigned_teacher_id ?? null,
        assignedTeacherName: row.assigned_teacher_id
          ? teacherNameById.get(row.assigned_teacher_id) ?? null
          : null,
        trialResultExists: trialResultApplicationIds.has(row.id),
        consultationCount: consultationCountByApplicationId.get(row.id) ?? 0,
        hasAnyConsultationHistory,
        legacyImportExists: legacyImportExistsByApplicationId.get(row.id) ?? false,
        latestConsultationOccurredAt: latestConsultation?.occurredAt ?? null,
        latestConsultationChannel: latestConsultation?.channel ?? null,
        latestConsultationSentiment: latestConsultation?.sentiment ?? null,
        latestConsultationNote: latestConsultation?.note ?? null,
        latestConsultationCreatedBy: latestConsultation?.createdBy ?? null,
        latestConsultationCreatedByName:
          latestConsultation?.createdBy != null
            ? latestConsultationCreatedByName.get(latestConsultation.createdBy) ?? null
            : null,
        pipelineGroup: "NEEDS_CONSULTATION"
      }

      return {
        ...item,
        pipelineGroup: getConsultationPipelineGroup(item)
      }
    })
  },
  async getStudioConsultationPipelineActiveCount(organizationId) {
    const supabase = await getSupabaseServerClient()
    const { count, error } = await supabase
      .from("trial_applications")
      .select("id, classes!inner(id)", { count: "exact", head: true })
      .eq("classes.organization_id", organizationId)
      .eq("status", "completed")
      .in("registration_status", ["undecided", "pending"])

    if (error) {
      throw new Error("failed_to_fetch_studio_consultation_pipeline_active_count")
    }

    return count ?? 0
  },
  async getStudioApplicationDetail(applicationId, organizationId) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("trial_applications")
      .select(
        "id, class_id, parent_id, child_name, child_grade, parent_name, parent_phone, child_school, child_notes, subject_experience_yn, subject_experience_duration, current_level, preferred_regular_schedule, goal_type, goal_note, class_schedule_id, requested_slot_at, requested_schedule_block_id, selected_schedule_label, confirmed_slot_at, confirmed_schedule_block_id, assigned_teacher_id, contacted_at, scheduled_at, completed_at, enrolled_at, canceled_at, no_show_at, consultation_note, trial_feedback, final_level, final_schedule, registration_status, registered_course, unregistered_reason, unregistered_reason_note, lost_at, follow_up_note, next_contact_at, last_activity_at, regular_schedule_preference, regular_schedule_preference_note, regular_schedule_preference_updated_at, memo, status, created_at, updated_at, class_schedules(start_time, end_time), confirmed_block:schedule_blocks!trial_applications_confirmed_schedule_block_id_fkey(start_at, end_at), classes!inner(title, subject, organization_id, program_type, assignment_mode, organizations(name, sido, sigungu, bname))"
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

    const { data: trialResultData, error: trialResultError } = await supabase
      .from("trial_results")
      .select(
        "id, application_id, observations, parent_reaction, recommended_course, recommended_level, recommended_schedule, next_action, note, created_by, created_at, updated_at"
      )
      .eq("application_id", applicationId)
      .maybeSingle()

    if (trialResultError) {
      throw new Error("failed_to_fetch_trial_result")
    }

    const { data: consultationLogData, error: consultationLogError } = await supabase
      .from("consultation_logs")
      .select(
        "id, application_id, occurred_at, activity_type, channel, sentiment, registration_status_snapshot, regular_schedule_preference_snapshot, regular_schedule_preference_note_snapshot, unregistered_reason_snapshot, unregistered_reason_note_snapshot, next_action, next_contact_at, note, created_by, created_at, updated_at"
      )
      .eq("application_id", applicationId)
      .order("occurred_at", { ascending: false })

    if (consultationLogError) {
      throw new Error("failed_to_fetch_consultation_logs")
    }

    const embeddedOrganization = getEmbeddedClassOrganization(
      getEmbeddedClass(data as TrialApplicationRow)
    )
    const detail: StudioApplicationDetail = {
      ...mapStudioApplication(data as TrialApplicationRow, teacherNameById),
      academyName: embeddedOrganization?.name.trim() || null,
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
      unregisteredReasonNote:
        (data as TrialApplicationRow).unregistered_reason_note ?? null,
      lostAt: (data as TrialApplicationRow).lost_at ?? null,
      // 원본 그대로. preferredRegularSchedule(신청 시 자유 입력)과 다른 값이다.
      regularSchedulePreference: (data as TrialApplicationRow).regular_schedule_preference ?? null,
      regularSchedulePreferenceNote:
        (data as TrialApplicationRow).regular_schedule_preference_note ?? null,
      regularSchedulePreferenceUpdatedAt:
        (data as TrialApplicationRow).regular_schedule_preference_updated_at ?? null,
      followUpNote: (data as TrialApplicationRow).follow_up_note ?? null,
      nextContactAt: (data as TrialApplicationRow).next_contact_at ?? null,
      lastActivityAt: (data as TrialApplicationRow).last_activity_at ?? null,
      memo: (data as TrialApplicationRow).memo ?? null,
      trialResult: trialResultData ? mapStudioTrialResult(trialResultData as TrialResultRow) : null,
      consultationLogs: ((consultationLogData ?? []) as ConsultationLogRow[]).map(mapStudioConsultationLog),
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
      if (input.currentStatus === "new") {
        updatePayload.contacted_at = nowIso
      }
      const { data: currentRow, error: currentError } = await supabase
        .from("trial_applications")
        .select("class_id, requested_slot_at, requested_schedule_block_id, class_schedule_id, assigned_teacher_id")
        .eq("id", input.applicationId)
        .maybeSingle()

      if (currentError || !currentRow) {
        throw new Error("failed_to_prepare_application_status_update")
      }

      const assignedTeacherId = currentRow.assigned_teacher_id ?? null

      if (currentRow.requested_schedule_block_id) {
        updatePayload.confirmed_slot_at = currentRow.requested_slot_at
        if (!assignedTeacherId) {
          updatePayload.confirmed_schedule_block_id = null
        } else {
          const { data: requestedBlockData, error: requestedBlockError } = await supabase
            .from("schedule_blocks")
            .select("id, teacher_id, class_id, start_at, end_at, capacity, type")
            .eq("id", currentRow.requested_schedule_block_id)
            .maybeSingle()

          if (requestedBlockError || !requestedBlockData) {
            throw new Error("failed_to_prepare_application_status_update")
          }

          const requestedBlock = requestedBlockData as ScheduleBlockRow
          const { data: existingBlockData, error: existingBlockError } = await supabase
            .from("schedule_blocks")
            .select("id, teacher_id, class_id, start_at, end_at, capacity, type")
            .eq("class_id", currentRow.class_id)
            .eq("teacher_id", assignedTeacherId)
            .eq("start_at", requestedBlock.start_at)
            .eq("end_at", requestedBlock.end_at)

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
            const { data: createdBlock, error: createBlockError } = await supabase
              .from("schedule_blocks")
              .insert({
                teacher_id: assignedTeacherId,
                class_id: currentRow.class_id,
                type: "available",
                start_at: requestedBlock.start_at,
                end_at: requestedBlock.end_at,
                capacity: Math.max(1, Number(requestedBlock.capacity ?? 1)),
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
          updatePayload.confirmed_schedule_block_id = resolvedBlock.id
        }
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

        const occurrence = resolveRequestedClassScheduleOccurrence({
          requestedSlotAt: currentRow.requested_slot_at,
          startTime: classScheduleData.start_time,
          endTime: classScheduleData.end_time
        })

        if (!occurrence) {
          throw new Error("invalid_requested_class_schedule_occurrence")
        }

        const requestedSlotAt = occurrence.startAt
        const requestedEndAt = occurrence.endAt
        updatePayload.confirmed_slot_at = requestedSlotAt

        if (!assignedTeacherId) {
          updatePayload.confirmed_schedule_block_id = null
        } else {
          const { data: existingBlockData, error: existingBlockError } = await supabase
            .from("schedule_blocks")
            .select("id, teacher_id, class_id, start_at, end_at, capacity, type")
            .eq("class_id", currentRow.class_id)
            .eq("teacher_id", assignedTeacherId)
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
            const capacity = Math.max(1, Number(classScheduleData.capacity ?? 1))
            const { data: createdBlock, error: createBlockError } = await supabase
              .from("schedule_blocks")
              .insert({
                teacher_id: assignedTeacherId,
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
          updatePayload.confirmed_schedule_block_id = resolvedBlock.id
        }
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
    const canEditBeforeCompleted = Boolean(input.allowBeforeCompleted) && input.currentStatus !== "completed"
    const registrationFieldsTouched =
      input.registrationStatus !== "undecided" ||
      input.unregisteredReason !== null ||
      input.unregisteredReasonNote !== null ||
      input.trialFeedback !== null ||
      input.registeredCourse !== null ||
      input.finalLevel !== null ||
      input.finalSchedule !== null ||
      input.followUpNote !== null
    if (canEditBeforeCompleted && registrationFieldsTouched) {
      throw new Error("application_outcome_registration_requires_completed")
    }

    const nextValues =
      canEditBeforeCompleted
        ? {
            consultation_note: input.consultationNote,
            updated_at: nowIso
          }
        : {
            consultation_note: input.consultationNote,
            trial_feedback: input.trialFeedback,
            registered_course: input.registeredCourse,
            final_level: input.finalLevel,
            final_schedule: input.finalSchedule,
            follow_up_note: input.followUpNote,
            registration_status: input.registrationStatus,
            enrolled_at: input.registrationStatus === "enrolled" ? nowIso : null,
            unregistered_reason:
              input.registrationStatus === "not_enrolled" ? input.unregisteredReason : null,
            unregistered_reason_note:
              input.registrationStatus === "not_enrolled" && input.unregisteredReason === "other"
                ? input.unregisteredReasonNote
                : null,
            lost_at:
              input.registrationStatus === "not_enrolled"
                ? input.previousRegistrationStatus === "not_enrolled"
                  ? input.previousLostAt
                  : nowIso
                : null,
            updated_at: nowIso
          }
    const { data, error } = await supabase
      .from("trial_applications")
      .update(nextValues)
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
  async updateStudioApplicationConsultationSnapshot(
    input: UpdateStudioApplicationConsultationSnapshotInput
  ) {
    const supabase = await getSupabaseServerClient()
    // 희망 일정은 next_contact_at 과 같은 UPDATE 문에 실어 보낸다.
    // 별도 호출을 만들면 부분 저장 지점이 하나 더 생긴다.
    const { data, error } = await supabase
      .from("trial_applications")
      .update({
        next_contact_at: input.nextContactAt,
        last_activity_at: input.lastActivityAt,
        updated_at: input.lastActivityAt,
        ...buildRegularSchedulePreferenceUpdate(input.regularSchedulePreferenceWrite)
      })
      .eq("id", input.applicationId)
      .eq("status", input.currentStatus)
      .select("id")
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_update_application_consultation_snapshot")
    }

    if (!data) {
      throw new Error("application_consultation_snapshot_conflict")
    }
  },
  async updateStudioApplicationLatestConsultationSnapshot(
    input: UpdateStudioApplicationLatestConsultationSnapshotInput
  ) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("trial_applications")
      .update({
        next_contact_at: input.nextContactAt,
        ...buildRegularSchedulePreferenceUpdate(input.regularSchedulePreferenceWrite)
      })
      .eq("id", input.applicationId)
      .eq("status", input.currentStatus)
      .select("id")
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_update_application_latest_consultation_snapshot")
    }

    if (!data) {
      throw new Error("application_consultation_snapshot_conflict")
    }
  },
  async createStudioConsultationLog(input: CreateStudioConsultationLogInput) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("consultation_logs")
      .insert({
        id: input.id,
        application_id: input.applicationId,
        occurred_at: input.occurredAt,
        activity_type: input.activityType,
        channel: input.channel,
        sentiment: input.sentiment,
        registration_status_snapshot: input.registrationStatusSnapshot,
        regular_schedule_preference_snapshot: input.regularSchedulePreferenceSnapshot,
        regular_schedule_preference_note_snapshot: input.regularSchedulePreferenceNoteSnapshot,
        unregistered_reason_snapshot: input.unregisteredReasonSnapshot,
        unregistered_reason_note_snapshot: input.unregisteredReasonNoteSnapshot,
        next_action: input.nextAction,
        next_contact_at: input.nextContactAt,
        note: input.note,
        created_by: input.actorId
      })
      .select("id")
      .maybeSingle()

    if (error?.code === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("consultation_logs")
        .select("id, application_id")
        .eq("id", input.id)
        .maybeSingle()

      if (existingError || !existing || existing.application_id !== input.applicationId) {
        throw new Error("failed_to_create_consultation_log")
      }

      return "duplicate"
    }

    if (error || !data) {
      throw new Error("failed_to_create_consultation_log")
    }

    return "created"
  },
  async getOrganizationBillingSnapshot(organizationId: string) {
    const supabase = await getSupabaseServerClient()
    // 두 테이블 모두 자기 조직 SELECT 만 허용된다(RLS). 병렬로 한 번씩만 읽는다.
    const [subscriptionResult, overrideResult] = await Promise.all([
      supabase
        .from("organization_subscriptions")
        .select(
          "organization_id, plan_code, subscription_status, current_period_start, current_period_end, cancel_at_period_end"
        )
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("organization_entitlement_overrides")
        .select("organization_id, full_access, reason, expires_at")
        .eq("organization_id", organizationId)
        .maybeSingle()
    ])

    // 조회 실패는 삼키지 않는다. 유료 기능을 실수로 열어 주는 fail-open 을 만들지 않기 위해
    // 호출자(resolver)가 실패를 알아야 한다.
    if (subscriptionResult.error) {
      throw new Error("failed_to_fetch_organization_subscription")
    }

    if (overrideResult.error) {
      throw new Error("failed_to_fetch_organization_entitlement_override")
    }

    const subscriptionRow = subscriptionResult.data as {
      organization_id: string
      plan_code: OrganizationPaidPlanCode
      subscription_status: OrganizationSubscriptionStatus
      current_period_start: string | null
      current_period_end: string | null
      cancel_at_period_end: boolean
    } | null

    const overrideRow = overrideResult.data as {
      organization_id: string
      full_access: boolean
      reason: string
      expires_at: string | null
    } | null

    const subscription: OrganizationSubscription | null = subscriptionRow
      ? {
          organizationId: subscriptionRow.organization_id,
          planCode: subscriptionRow.plan_code,
          status: subscriptionRow.subscription_status,
          currentPeriodStart: subscriptionRow.current_period_start,
          currentPeriodEnd: subscriptionRow.current_period_end,
          cancelAtPeriodEnd: subscriptionRow.cancel_at_period_end
        }
      : null

    const override: OrganizationEntitlementOverride | null = overrideRow
      ? {
          organizationId: overrideRow.organization_id,
          fullAccess: overrideRow.full_access,
          reason: overrideRow.reason,
          expiresAt: overrideRow.expires_at
        }
      : null

    return { subscription, override } satisfies OrganizationBillingSnapshot
  },
  async createStudioConsultationTransaction(input: CreateStudioConsultationTransactionInput) {
    const supabase = await getSupabaseServerClient()
    // 등록 결과 / 상담 로그 / Case 스냅샷 / 감사 로그를 하나의 transaction 으로 쓴다.
    // 조직 스코프·상태 guard·멱등 판정은 전부 함수 안의 잠근 row 기준이다.
    const { data, error } = await supabase.rpc("create_studio_consultation", {
      p_submission_id: input.submissionId,
      p_application_id: input.applicationId,
      p_occurred_at: input.occurredAt,
      p_channel: input.channel,
      p_sentiment: input.sentiment,
      p_note: input.note,
      p_registration_status: input.registrationStatus,
      p_unregistered_reason: input.unregisteredReason,
      p_unregistered_reason_note: input.unregisteredReasonNote,
      p_next_action: input.nextAction,
      p_next_contact_at: input.nextContactAt,
      p_preference_provided: input.preferenceProvided,
      p_preference: input.preference,
      p_preference_note: input.preferenceNote,
      p_outcome_note: input.outcomeNote
    })

    if (error) {
      // Postgres/PGRST 원문은 UI 로 넘기지 않는다. 도메인 코드로만 번역한다.
      const domainError = [
        "not_authenticated",
        "application_not_found_or_forbidden",
        "application_not_completed",
        "application_registration_terminal",
        "consultation_submission_conflict"
      ].find((code) => error.message.includes(code))

      throw new Error(domainError ?? "failed_to_create_consultation_transaction")
    }

    const result = data as StudioConsultationTransactionResult | null
    if (!result) {
      throw new Error("failed_to_create_consultation_transaction")
    }

    return result
  },
  async updateStudioConsultationLog(input: UpdateStudioConsultationLogInput) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("consultation_logs")
      .update({
        channel: input.channel,
        sentiment: input.sentiment,
        next_contact_at: input.nextContactAt,
        note: input.note,
        // 전달되지 않으면 컬럼 자체를 payload 에서 뺀다. 기존 스냅샷을 지우면 안 된다.
        ...(input.regularSchedulePreferenceSnapshotWrite
          ? {
              regular_schedule_preference_snapshot:
                input.regularSchedulePreferenceSnapshotWrite.preference,
              regular_schedule_preference_note_snapshot:
                input.regularSchedulePreferenceSnapshotWrite.note
            }
          : {})
      })
      .eq("id", input.consultationLogId)
      .eq("application_id", input.applicationId)
      .eq("activity_type", "CONSULTATION")
      .select("id")
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_update_consultation_log")
    }

    if (!data) {
      throw new Error("consultation_log_update_conflict")
    }
  },
  async getStudioTrialResultSaveContext(applicationId: string, organizationId: string) {
    const supabase = await getSupabaseServerClient()
    // 한 번의 SELECT 로 끝낸다. trial_results.application_id 에 UNIQUE 제약이 있어
    // PostgREST 가 1:1 embed 로 돌려준다.
    // organization scope 는 trial_applications 에 컬럼이 없으므로
    // 다른 Studio 조회와 같이 classes!inner 로 건다.
    const { data, error } = await supabase
      .from("trial_applications")
      .select(
        "status, classes!inner(organization_id), trial_results(observations, parent_reaction, recommended_course, recommended_level, recommended_schedule, next_action, note)"
      )
      .eq("id", applicationId)
      .eq("classes.organization_id", organizationId)
      .maybeSingle()

    if (error) {
      throw new Error("failed_to_fetch_trial_result_save_context")
    }

    if (!data) {
      return null
    }

    const row = data as unknown as {
      status: TrialApplicationRow["status"]
      trial_results?: TrialResultFieldsRow | TrialResultFieldsRow[] | null
    }
    const embedded = Array.isArray(row.trial_results)
      ? (row.trial_results[0] ?? null)
      : (row.trial_results ?? null)

    return {
      status: row.status,
      trialResult: embedded ? mapStudioTrialResultFields(embedded) : null
    }
  },
  async upsertStudioTrialResult(input: UpsertStudioTrialResultInput) {
    const supabase = await getSupabaseServerClient()
    const nowIso = new Date().toISOString()
    const { data: existing, error: existingError } = await supabase
      .from("trial_results")
      .select("id")
      .eq("application_id", input.applicationId)
      .maybeSingle()

    if (existingError) {
      throw new Error("failed_to_check_trial_result")
    }

    const normalizedObservations = Array.from(new Set(input.observations.filter((item) => item.trim().length > 0)))
    const payload = {
      application_id: input.applicationId,
      observations: normalizedObservations,
      parent_reaction: input.parentReaction,
      recommended_course: input.recommendedCourse,
      recommended_level: input.recommendedLevel,
      recommended_schedule: input.recommendedSchedule,
      next_action: input.nextAction,
      note: input.note,
      updated_at: nowIso
    }

    if (existing) {
      const { data, error } = await supabase
        .from("trial_results")
        .update(payload)
        .eq("application_id", input.applicationId)
        .select("id")
        .maybeSingle()

      if (error || !data) {
        throw new Error("failed_to_update_trial_result")
      }

      return "updated"
    }

    const { data, error } = await supabase
      .from("trial_results")
      .insert({
        ...payload,
        created_by: input.actorId
      })
      .select("id")
      .maybeSingle()

    if (error?.code === "23505") {
      const { data: conflictedData, error: conflictedError } = await supabase
        .from("trial_results")
        .update(payload)
        .eq("application_id", input.applicationId)
        .select("id")
        .maybeSingle()

      if (conflictedError || !conflictedData) {
        throw new Error("failed_to_update_trial_result")
      }

      return "updated"
    }

    if (error || !data) {
      throw new Error("failed_to_create_trial_result")
    }

    return "created"
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

    const classQuery = await supabase
      .from("classes")
      .select("teacher_id, assignment_mode")
      .eq("id", input.classId)
      .eq("is_active", true)
      .maybeSingle()
    const classLookup = isMissingColumnError(classQuery.error)
      ? await supabase
          .from("classes")
          .select("teacher_id")
          .eq("id", input.classId)
          .eq("is_active", true)
          .maybeSingle()
      : classQuery
    const { data: classData, error: classError } = classLookup

    if (classError) {
      throw new Error("invalid_schedule_slot")
    }

    if (!classData) {
      throw new Error("invalid_schedule_slot")
    }

    const classAssignmentMode = resolveClassAssignmentMode(classData)
    if (classAssignmentMode === "preassigned" && !classData.teacher_id) {
      throw new Error("missing_preassigned_teacher_for_application")
    }

    const now = new Date()
    const nowIso = now.toISOString()
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
        matchedSlot.classId == null &&
        classData.teacher_id !== null &&
        matchedSlot.teacherId === classData.teacher_id

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

      if (!isTrialBookingBookable(matchedSlot.startAt, now)) {
        throw new Error("booking_cutoff_reached")
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
      const classScheduleBookingStatus = classScheduleRow.booking_status ?? "open"

      if (classScheduleBookingStatus === "hidden") {
        throw new Error("schedule_booking_hidden")
      }

      const occurrence = generateUpcomingClassScheduleOccurrences(classScheduleRow, now).find(
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

      if (classScheduleBookingStatus === "closed") {
        throw new Error("schedule_booking_closed")
      }

      if (matchedSlot.isClosed) {
        throw new Error("slot_capacity_reached")
      }

      if (!isTrialBookingBookable(matchedSlot.startAt, now)) {
        throw new Error("booking_cutoff_reached")
      }

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
        assigned_teacher_id:
          classAssignmentMode === "preassigned" ? (classData.teacher_id ?? null) : null,
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
      .select("id, user_id, status, teacher_name, teacher_phone, organization_name, branch_name, address, address_detail, organization_phone, request_note, created_at")
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
        address: input.address,
        address_detail: input.addressDetail,
        organization_phone: input.organizationPhone,
        request_note: input.requestNote
      })
      .select("id, user_id, status, teacher_name, teacher_phone, organization_name, branch_name, address, address_detail, organization_phone, request_note, created_at")
      .single()

    if (error || !data) {
      throw new Error("failed_to_create_teacher_signup_request")
    }

    return mapTeacherSignupRequest(data as TeacherSignupRequestRow)
  }
}
