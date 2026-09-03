import type { RegularSchedulePreference } from "@/features/studio/lib/regular-schedule-preference"
import type { ClassSubjectReadModel } from "@/shared/lib/subject-master"

export type UserRole = "parent" | "teacher"

export type ClassProgramType = "trial_class" | "level_test"
export type ClassAssignmentMode = "post_assign" | "preassigned"

export type ApplicationStatus =
  | "new"
  | "reviewing"
  | "confirmed"
  | "completed"
  | "canceled"

export type ApplicationRegistrationStatus =
  | "undecided"
  | "enrolled"
  | "not_enrolled"
  | "pending"

export type ApplicationUnregisteredReason =
  | "schedule_mismatch"
  | "cost_burden"
  | "distance"
  | "child_reaction"
  | "comparing_other_academies"
  | "no_response"
  | "class_level_mismatch"
  | "other"

export type ConsultationLogActivityType = "CONSULTATION" | "LEGACY_IMPORT" | "CALL_ATTEMPT"

export type ConsultationLogChannel = "PHONE" | "KAKAO" | "SMS" | "VISIT" | "OTHER"

export type ConsultationSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE"

export type ConsultationLogNextAction = "REGISTER" | "LOST" | "FOLLOW_UP" | "NONE"

export type StudioConsultationLog = {
  id: string
  applicationId: string
  occurredAt: string
  activityType: ConsultationLogActivityType
  channel: ConsultationLogChannel | null
  sentiment: ConsultationSentiment | null
  registrationStatusSnapshot: ApplicationRegistrationStatus | null
  nextAction: ConsultationLogNextAction | null
  nextContactAt: string | null
  note: string | null
  /**
   * 그 상담 시점의 정규수업 희망 일정 스냅샷(raw jsonb).
   *
   * 파싱하지 않은 원본을 그대로 넘긴다. adapter 가 조용히 null 로 바꾸면
   * 미래 버전이나 깨진 값을 화면이 구분할 수 없게 된다.
   * 해석은 regular-schedule-preference 의 parser 가 한다.
   */
  regularSchedulePreferenceSnapshot: unknown
  regularSchedulePreferenceNoteSnapshot: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}


export type StudioClassScheduleType = "weekly" | "one_time"
export type StudioClassScheduleBookingStatus = "open" | "closed" | "hidden"

export type StudioClassScheduleItem = {
  id: string
  scheduleType: StudioClassScheduleType
  bookingStatus?: StudioClassScheduleBookingStatus
  dayOfWeek: number | null
  specificDate: string | null
  seriesId?: string | null
  startTime: string
  endTime: string
  capacity: number | null
  displayLabel: string | null
  sortOrder: number
  applicationCount?: number
  isReferencedByApplications?: boolean
}

export type ClassSummary = ClassSubjectReadModel & {
  id: string
  programType: ClassProgramType
  assignmentMode: ClassAssignmentMode
  title: string
  subject: string
  targetAge: string
  classFormat: string | null
  description: string
  recommendedFor: string | null
  experiencePoints: string | null
  curriculum: string | null
  teacherIntro: string | null
  trialPrice: number
  teacherId: string | null
  teacherDisplayName: string | null
  teacherName: string | null
  coverImageUrl: string | null
  isActive: boolean
  organization?: OrganizationLocationInfo | null
  schedules?: StudioClassScheduleItem[]
  distanceKm?: number
}

/**
 * Studio Classes List 의 "예약 일정" 표시 모델.
 * class_schedules row 개수가 아니라 운영자가 읽는 일정 요약이다.
 * 계산은 features/studio/lib/class-schedule-summary.ts 가 한다.
 */
export type StudioClassScheduleSummaryKind = "none" | "weekly" | "single" | "multiple"

export type StudioClassScheduleSummary = {
  kind: StudioClassScheduleSummaryKind
  primary: string
  secondary: string | null
}

export type StudioClassListItem = ClassSubjectReadModel & {
  id: string
  programType: ClassProgramType
  assignmentMode: ClassAssignmentMode
  title: string
  subject: string
  targetAge: string
  trialPrice: number
  teacherId: string | null
  teacherDisplayName: string | null
  teacherName: string | null
  coverImageUrl: string | null
  isActive: boolean
  scheduleSummary: StudioClassScheduleSummary
}

export type OrganizationLocationInfo = {
  name: string
  branchName: string | null
  address: string | null
  addressDetail: string | null
  // 공개 UI 의 지역 표시는 legacy academy_area 가 아니라 이 행정지역 metadata 로만 만든다.
  sido: string | null
  sigungu: string | null
  bname: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  latitude?: number | null
  longitude?: number | null
}

export type ClassDetail = ClassSummary & {
  organization: OrganizationLocationInfo | null
}

export type AvailableScheduleSlot = {
  id: string
  source: "class_schedule" | "schedule_block"
  optionId: string
  classScheduleId: string | null
  scheduleBlockId: string | null
  scheduleType?: StudioClassScheduleType
  bookingStatus?: StudioClassScheduleBookingStatus
  teacherId: string | null
  classId: string | null
  label: string
  startAt: string
  endAt: string
  capacity: number
  appliedCount: number
  remainingCount: number
  isClosed: boolean
}

export type StudioDashboardSummary = {
  actionableCount: number
  totalApplicationCount: number
  newApplicationCount: number
  needsRegistrationConfirmationCount: number
  confirmedCount: number
  canceledOrNoShowCount: number
  registeredCount: number
  completedCount: number
  enrollmentRate: number | null
  enrollmentRateNumerator: number
  enrollmentRateDenominator: number
}

export type StudioTeacherOption = {
  teacherId: string
  teacherName: string
}

export type StudioScheduleCalendarStatus = "open" | "closed" | "hidden"

export type StudioScheduleCalendarItem = {
  classScheduleId: string
  classId: string
  classTitle: string
  teacherId: string | null
  teacherName: string | null
  scheduleType: StudioClassScheduleType
  bookingStatus: StudioClassScheduleBookingStatus
  dayOfWeek: number | null
  specificDate: string
  startTime: string
  endTime: string
  capacity: number
  activeReservationCount: number
  remainingCapacity: number
  status: StudioScheduleCalendarStatus
  seriesId: string | null
}

export type StudioScheduleCalendarDay = {
  date: string
  items: StudioScheduleCalendarItem[]
  totalCapacity: number
  totalActiveReservationCount: number
  totalRemainingCapacity: number
  closedCount: number
  hiddenCount: number
}

export type StudioScheduleCalendarFilterOptions = {
  classId?: string | null
  teacherId?: string | null
}

export type StudioScheduleCalendarQuery = StudioScheduleCalendarFilterOptions & {
  organizationId: string
  month: string
}

export type CreateStudioClassScheduleInput = {
  organizationId: string
  classId: string
  teacherId: string | null
  specificDate: string
  startTime: string
  endTime: string
  capacity: number
}

export type UpdateStudioClassScheduleInput = {
  organizationId: string
  classScheduleId: string
  capacity?: number
  displayLabel?: string | null
  bookingStatus?: StudioClassScheduleBookingStatus
}

export type UpdateStudioClassSchedulesForDateInput = {
  organizationId: string
  classId: string
  specificDate: string
  bookingStatus: StudioClassScheduleBookingStatus
}

export type DeleteStudioClassScheduleInput = {
  organizationId: string
  classScheduleId: string
}

export type BulkCreateClassSchedulesTimeSlotInput = {
  startTime: string
  endTime: string
  capacity: number
}

export type BulkCreateClassSchedulesRepeatMode = "daily" | "weekdays" | "weekends" | "custom"

export type BulkCreateClassSchedulesInput = {
  organizationId: string
  classId: string
  teacherId: string | null
  startDate: string
  endDate: string
  repeatMode: BulkCreateClassSchedulesRepeatMode
  weekdays: number[]
  timeSlots: BulkCreateClassSchedulesTimeSlotInput[]
}

export type BulkCreateClassSchedulesPreviewConflict = {
  kind: "duplicate" | "teacher_conflict" | "validation"
  specificDate: string
  startTime: string
  endTime: string
  capacity: number
  classScheduleId?: string | null
  message: string
}

export type BulkCreateClassSchedulesPreviewItem = {
  specificDate: string
  startTime: string
  endTime: string
  capacity: number
  classId: string
  teacherId: string | null
  classTitle: string
  teacherName: string | null
  isDuplicate: boolean
  hasTeacherConflict: boolean
}

export type BulkCreateClassSchedulesPreview = {
  totalCalculatedCount: number
  creatableCount: number
  duplicateCount: number
  teacherConflictCount: number
  excludedItems: BulkCreateClassSchedulesPreviewConflict[]
  items: BulkCreateClassSchedulesPreviewItem[]
}

export type BulkCreateClassSchedulesResult = {
  insertedCount: number
  skippedDuplicateCount: number
  teacherConflictCount: number
  seriesId: string | null
  insertedScheduleIds: string[]
}

export type StudioDashboardTeacherFilterOption = {
  teacherId: string
  teacherName: string
}

// teachers 는 학원 내부 명부다. 학부모 공개 기능이 폐기되어 소개/과목 같은 공개 프로필 필드는
// 앱에서 다루지 않는다. 담당 과목은 teachers 컬럼이 아니라 실제 classes 배정에서 계산한다.
// profileId 는 향후 "선생님에게 파트너센터 로그인 권한 부여" 를 위한 optional link 라 남긴다.
export type StudioTeacherSummary = {
  id: string
  profileId: string | null
  organizationId: string
  displayName: string
  phone: string | null
  smsEnabled: boolean
  isActive: boolean
  createdAt: string
}

// 선생님별 담당 정보는 teachers.subjects/target_students 가 아니라 classes.teacher_id 에서 파생한다.
// (legacy 컬럼은 공개 프로필 용도로만 남겨 둔다.)
export type StudioTeacherAssignmentSummary = {
  teacherId: string
  classCount: number
  classTitles: string[]
  subjectLabels: string[]
}

export type CreateStudioTeacherInput = {
  organizationId: string
  displayName: string
  phone: string | null
  smsEnabled: boolean
}

// isActive 는 activate/deactivate action 이 따로 담당하므로 여기에 넣지 않는다.
// profileId 도 일반 입력으로 받지 않는다(자동 연결 금지).
export type UpdateStudioTeacherInput = {
  teacherId: string
  organizationId: string
  displayName: string
  phone: string | null
  smsEnabled: boolean
}

export type DeactivateStudioTeacherInput = {
  teacherId: string
  organizationId: string
  actorProfileId: string
}

export type ActivateStudioTeacherInput = {
  teacherId: string
  organizationId: string
  actorProfileId: string
}

export type DeleteStudioTeacherInput = {
  teacherId: string
  organizationId: string
  actorProfileId: string
}

// 삭제를 막은 실사용 참조 건수. UI 에 숫자를 노출하지는 않고 로그/디버깅용으로만 쓴다.
export type StudioTeacherReferenceCounts = {
  classes: number
  trialApplications: number
  scheduleBlocks: number
  smsLogs: number
}

export type StudioClassInput = {
  mode: "create" | "update"
  classId?: string
  organizationId: string
  programType: ClassProgramType
  assignmentMode: ClassAssignmentMode
  title: string
  subjectCategoryId: string | null
  subjectId?: string | null
  subject: string
  targetAge: string
  description: string
  classFormat: string | null
  recommendedFor: string | null
  experiencePoints: string | null
  curriculum: string | null
  teacherIntro: string | null
  trialPrice: number
  teacherId: string | null
  teacherDisplayName: string | null
  coverImageUrl: string | null
  isActive: boolean
  scheduleSlots?: StudioClassScheduleSlotInput[]
}

export type StudioScheduleBlockType = "regular" | "available" | "blocked" | "trial_booked"

export type StudioScheduleBlockSummary = {
  id: string
  teacherId: string
  classId: string | null
  type: StudioScheduleBlockType
  startAt: string
  endAt: string
  capacity: number
  appliedCount: number
  remainingCount: number
  isClosed: boolean
}

export type CreateStudioScheduleBlockInput = {
  teacherId: string
  classId?: string | null
  startAt: string
  endAt: string
  capacity: number
}

export type StudioClassScheduleSlotInput = {
  id?: string
  scheduleType: StudioClassScheduleType
  bookingStatus?: StudioClassScheduleBookingStatus
  dayOfWeek: number | null
  specificDate: string | null
  seriesId?: string | null
  startTime: string
  endTime: string
  capacity: number | null
  displayLabel: string | null
  sortOrder: number
}

export type UpdateStudioScheduleBlockTypeInput = {
  scheduleBlockId: string
  teacherId: string
  nextType: Extract<StudioScheduleBlockType, "available" | "blocked">
}

export type TrialApplicationInput = {
  parentId: string
  classId: string
  childId?: string | null
  childName: string
  childGrade: string
  parentName: string
  parentPhone: string
  childSchool: string | null
  childNotes: string | null
  subjectExperienceYn: boolean | null
  subjectExperienceDuration: string | null
  currentLevel: string | null
  preferredRegularSchedule: string | null
  goalType: string | null
  goalNote: string | null
  requestedSlotAt?: string
  selectedScheduleOptionId?: string
  selectedScheduleBlockId?: string
  memo: string | null
}

export type ChildProfile = {
  id: string
  parentId: string
  name: string
  grade: string
  schoolName: string | null
  notes: string | null
  currentLevel: string | null
  interestSubjects: string | null
  goalNote: string | null
  createdAt: string
  updatedAt: string
}

export type ChildProfileInput = {
  parentId: string
  name: string
  grade: string
  schoolName: string | null
  notes: string | null
  currentLevel: string | null
  interestSubjects: string | null
  goalNote: string | null
}

export type UpdateChildProfileInput = ChildProfileInput & {
  childId: string
}

export type TrialApplicationSummary = {
  id: string
  classId: string
  classTitle: string | null
  classProgramType: ClassProgramType | null
  academyName: string | null
  teacherDisplayName: string | null
  organizationAddress: string | null
  organizationAddressDetail: string | null
  parentId: string
  childName: string
  childGrade: string
  parentName: string | null
  parentPhone: string | null
  classScheduleId?: string | null
  requestedScheduleBlockId: string | null
  selectedScheduleLabel?: string | null
  requestedSlotAt: string
  confirmedSlotAt: string | null
  registrationStatus: ApplicationRegistrationStatus | null
  status: ApplicationStatus
  goalType: string | null
  createdAt: string
  updatedAt: string
}

export type ApplicationStatusActionType =
  | "move_to_reviewing"
  | "move_to_confirmed"
  | "move_to_completed"
  | "cancel"
  | "no_show"

export type MyDashboardData = {
  childrenCount: number
  totalApplicationCount: number
  newApplicationCount: number
  reviewingApplicationCount: number
  confirmedApplicationCount: number
  completedApplicationCount: number
  canceledApplicationCount: number
  recentApplications: TrialApplicationSummary[]
}

export type ApplicationLogEntry = {
  id: string
  applicationId: string
  fromStatus: ApplicationStatus | null
  toStatus: ApplicationStatus
  actorId: string
  actorName: string | null
  note: string | null
  createdAt: string
}

export type StudioApplicationSummary = TrialApplicationSummary & {
  classSubject: string | null
  classRegion: string | null
  classAssignmentMode: ClassAssignmentMode
  scheduleStartTime: string | null
  scheduleEndTime: string | null
  /** 확정된 예약 블록의 종료 시각. 체험 종료 판정의 1순위 source 다. */
  confirmedBlockStartAt: string | null
  confirmedBlockEndAt: string | null
  assignedTeacherId: string | null
  assignedTeacherName: string | null
  contactedAt: string | null
  scheduledAt: string | null
  completedAt: string | null
  canceledAt: string | null
  noShowAt: string | null
  enrolledAt: string | null
  registrationStatus: ApplicationRegistrationStatus
}

export type StudioApplicationListOptions = {
  teacherId?: string | null
  createdAtFrom?: string | null
  createdAtTo?: string | null
}

export type StudioUnregisteredListOptions = {
  teacherId?: string | null
  completedAtFrom?: string | null
  completedAtTo?: string | null
}

export type StudioUnregisteredApplicationItem = {
  id: string
  childName: string
  childGrade: string
  parentName: string | null
  parentPhone: string | null
  classTitle: string | null
  classSubject: string | null
  assignedTeacherId: string | null
  assignedTeacherName: string | null
  completedAt: string
  registrationStatus: ApplicationRegistrationStatus | null
  consultationNote: string | null
  followUpNote: string | null
  latestApplicationLogNote: string | null
}

export type StudioConsultationPipelineGroup =
  | "TODAY_CONTACT"
  | "NEEDS_CONSULTATION"
  | "NO_NEXT_CONTACT"
  | "UPCOMING_CONTACT"
  | "CLOSED"

export type StudioConsultationPipelineApplicationItem = {
  id: string
  childName: string
  childGrade: string
  parentName: string | null
  parentPhone: string | null
  classTitle: string | null
  classSubject: string | null
  registrationStatus: ApplicationRegistrationStatus
  completedAt: string
  nextContactAt: string | null
  lastActivityAt: string | null
  enrolledAt: string | null
  lostAt: string | null
  unregisteredReason: ApplicationUnregisteredReason | null
  unregisteredReasonNote: string | null
  assignedTeacherId: string | null
  assignedTeacherName: string | null
  trialResultExists: boolean
  consultationCount: number
  hasAnyConsultationHistory: boolean
  legacyImportExists: boolean
  latestConsultationOccurredAt: string | null
  latestConsultationChannel: ConsultationLogChannel | null
  latestConsultationSentiment: ConsultationSentiment | null
  latestConsultationNote: string | null
  latestConsultationCreatedBy: string | null
  latestConsultationCreatedByName: string | null
  pipelineGroup: StudioConsultationPipelineGroup
}

export type StudioApplicationDetail = StudioApplicationSummary & {
  confirmedScheduleBlockId: string | null
  childSchool: string | null
  childNotes: string | null
  subjectExperienceYn: boolean | null
  subjectExperienceDuration: string | null
  currentLevel: string | null
  preferredRegularSchedule: string | null
  goalNote: string | null
  consultationNote: string | null
  trialFeedback: string | null
  finalLevel: string | null
  finalSchedule: string | null
  registrationStatus: ApplicationRegistrationStatus
  registeredCourse: string | null
  unregisteredReason: ApplicationUnregisteredReason | null
  unregisteredReasonNote: string | null
  lostAt: string | null
  followUpNote: string | null
  nextContactAt: string | null
  lastActivityAt: string | null
  memo: string | null
  /**
   * 체험 이후 상담에서 확인한 정규수업 희망 일정(raw jsonb).
   *
   * ⚠️ 신청 당시 자유 입력인 preferredRegularSchedule 과 다른 값이다. 서로 복사하지 않는다.
   * parser 를 거치지 않은 원본이라 unknown 이다.
   */
  regularSchedulePreference: unknown
  regularSchedulePreferenceNote: string | null
  regularSchedulePreferenceUpdatedAt: string | null
  trialResult: StudioTrialResult | null
  consultationLogs: StudioConsultationLog[]
  logs: ApplicationLogEntry[]
}

export type StudioTrialResultParentReaction = "positive" | "considering" | "negative"

export type StudioTrialResultNextAction =
  | "consultation"
  | "follow_up"
  | "registration_discussion"
  | "undecided"

export type StudioTrialResult = {
  id: string
  applicationId: string
  observations: string[]
  parentReaction: StudioTrialResultParentReaction | null
  recommendedCourse: string | null
  recommendedLevel: string | null
  recommendedSchedule: string | null
  nextAction: StudioTrialResultNextAction | null
  note: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type UpdateStudioApplicationStatusInput = {
  applicationId: string
  currentStatus: ApplicationStatus
  actionType: ApplicationStatusActionType
  nextStatus: ApplicationStatus
  actorId: string
  note: string
}

export type UpdateStudioApplicationOutcomeInput = {
  applicationId: string
  actorId: string
  currentStatus: ApplicationStatus
  previousRegistrationStatus: ApplicationRegistrationStatus
  previousLostAt: string | null
  allowBeforeCompleted?: boolean
  consultationNote: string | null
  trialFeedback: string | null
  registeredCourse: string | null
  finalLevel: string | null
  finalSchedule: string | null
  followUpNote: string | null
  registrationStatus: ApplicationRegistrationStatus
  unregisteredReason: ApplicationUnregisteredReason | null
  unregisteredReasonNote: string | null
  note: string
}

export type UpsertStudioTrialResultInput = {
  applicationId: string
  actorId: string
  observations: string[]
  parentReaction: StudioTrialResultParentReaction | null
  recommendedCourse: string | null
  recommendedLevel: string | null
  recommendedSchedule: string | null
  nextAction: StudioTrialResultNextAction | null
  note: string | null
}

/**
 * 희망 일정 컬럼 3개를 함께 쓴다.
 *
 * 이 필드가 아예 없으면(undefined) 컬럼을 건드리지 않는다.
 * "전달되지 않음"과 "undecided" 는 다른 사실이라 undefined 로만 구분한다.
 */
export type RegularSchedulePreferenceWrite = {
  /** canonical 값. null 이면 "기록 없음"으로 되돌린다. */
  preference: RegularSchedulePreference | null
  note: string | null
  /** 실제로 값이 바뀐 경우에만 새 시각. 그대로면 기존 값을 넘겨 유지한다. */
  updatedAt: string | null
}

export type UpdateStudioApplicationConsultationSnapshotInput = {
  applicationId: string
  currentStatus: ApplicationStatus
  nextContactAt: string | null
  lastActivityAt: string
  regularSchedulePreferenceWrite?: RegularSchedulePreferenceWrite
}

export type CreateStudioConsultationLogInput = {
  id: string
  applicationId: string
  actorId: string
  occurredAt: string
  activityType: ConsultationLogActivityType
  channel: ConsultationLogChannel | null
  sentiment: ConsultationSentiment | null
  registrationStatusSnapshot: ApplicationRegistrationStatus | null
  nextAction: ConsultationLogNextAction | null
  nextContactAt: string | null
  note: string | null
  /** 그 상담 시점의 Case 상태. registrationStatusSnapshot 과 같은 의미다. */
  regularSchedulePreferenceSnapshot: RegularSchedulePreference | null
  regularSchedulePreferenceNoteSnapshot: string | null
}

export type UpdateStudioConsultationLogInput = {
  applicationId: string
  consultationLogId: string
  actorId: string
  channel: ConsultationLogChannel
  sentiment: ConsultationSentiment
  nextContactAt: string | null
  note: string
  /** 없으면 기존 스냅샷을 그대로 둔다. 지금 UI 에는 희망 일정 입력이 없다. */
  regularSchedulePreferenceSnapshotWrite?: {
    preference: RegularSchedulePreference | null
    note: string | null
  }
}

export type UpdateStudioApplicationLatestConsultationSnapshotInput = {
  applicationId: string
  currentStatus: ApplicationStatus
  nextContactAt: string | null
  regularSchedulePreferenceWrite?: RegularSchedulePreferenceWrite
}

export type UpdateStudioApplicationAssigneeInput = {
  applicationId: string
  organizationId: string
  actorId: string
  assignedTeacherId: string | null
}

export type TeacherSignupRequestStatus = "pending" | "approved" | "rejected"

export type TeacherSignupRequest = {
  id: string
  userId: string
  status: TeacherSignupRequestStatus
  teacherName: string
  teacherPhone: string | null
  organizationName: string
  branchName: string | null
  address: string | null
  addressDetail: string | null
  organizationPhone: string | null
  requestNote: string | null
  createdAt: string
}

export type CreateTeacherSignupRequestInput = {
  userId: string
  teacherName: string
  teacherPhone: string | null
  organizationName: string
  branchName: string | null
  address: string
  addressDetail: string | null
  organizationPhone: string | null
  requestNote: string | null
}

export type ListClassesOptions = {
  query?: string
  subject?: string
  subjectCategoryId?: string
  subjectId?: string
}

export interface DataAdapter {
  listClasses(options?: ListClassesOptions): Promise<ClassSummary[]>
  getClassById(classId: string): Promise<ClassDetail | null>
  listAvailableScheduleSlotsByClassId(classId: string): Promise<AvailableScheduleSlot[]>
  getStudioScheduleCalendar(
    input: StudioScheduleCalendarQuery
  ): Promise<{
    items: StudioScheduleCalendarItem[]
    days: StudioScheduleCalendarDay[]
  }>
  listStudioClassListItems(organizationId: string): Promise<StudioClassListItem[]>
  listStudioClasses(organizationId: string): Promise<ClassSummary[]>
  listStudioTeacherOptions(organizationId: string): Promise<StudioTeacherOption[]>
  listStudioDashboardTeacherFilterOptions(
    organizationId: string
  ): Promise<StudioDashboardTeacherFilterOption[]>
  listStudioTeachers(organizationId: string): Promise<StudioTeacherSummary[]>
  listStudioTeacherAssignments(organizationId: string): Promise<StudioTeacherAssignmentSummary[]>
  createStudioTeacher(input: CreateStudioTeacherInput): Promise<StudioTeacherSummary>
  updateStudioTeacher(input: UpdateStudioTeacherInput): Promise<StudioTeacherSummary>
  deactivateStudioTeacher(input: DeactivateStudioTeacherInput): Promise<void>
  activateStudioTeacher(input: ActivateStudioTeacherInput): Promise<void>
  deleteStudioTeacher(input: DeleteStudioTeacherInput): Promise<void>
  upsertStudioClass(input: StudioClassInput): Promise<ClassSummary>
  updateStudioClassActive(
    classId: string,
    organizationId: string,
    isActive: boolean
  ): Promise<void>
  listTeacherScheduleBlocks(teacherId: string): Promise<StudioScheduleBlockSummary[]>
  createStudioScheduleBlock(input: CreateStudioScheduleBlockInput): Promise<StudioScheduleBlockSummary>
  updateStudioScheduleBlockType(input: UpdateStudioScheduleBlockTypeInput): Promise<void>
  createStudioClassSchedule(input: CreateStudioClassScheduleInput): Promise<StudioClassScheduleItem>
  updateStudioClassSchedule(input: UpdateStudioClassScheduleInput): Promise<StudioClassScheduleItem>
  updateStudioClassSchedulesForDate(input: UpdateStudioClassSchedulesForDateInput): Promise<number>
  deleteStudioClassSchedule(input: DeleteStudioClassScheduleInput): Promise<void>
  previewBulkCreateClassSchedules(
    input: BulkCreateClassSchedulesInput
  ): Promise<BulkCreateClassSchedulesPreview>
  bulkCreateClassSchedules(
    input: BulkCreateClassSchedulesInput
  ): Promise<BulkCreateClassSchedulesResult>
  listMyChildren(parentId: string): Promise<ChildProfile[]>
  createChildProfile(input: ChildProfileInput): Promise<ChildProfile>
  updateChildProfile(input: UpdateChildProfileInput): Promise<ChildProfile>
  getMyDashboard(parentId: string): Promise<MyDashboardData>
  listMyApplications(parentId: string): Promise<TrialApplicationSummary[]>
  listStudioApplications(
    organizationId: string,
    options?: StudioApplicationListOptions
  ): Promise<StudioApplicationSummary[]>
  listStudioUnregisteredApplications(
    organizationId: string,
    options?: StudioUnregisteredListOptions
  ): Promise<StudioUnregisteredApplicationItem[]>
  getStudioUnregisteredActionRequiredCount(organizationId: string): Promise<number>
  listStudioConsultationPipelineApplications(
    organizationId: string
  ): Promise<StudioConsultationPipelineApplicationItem[]>
  getStudioConsultationPipelineActiveCount(organizationId: string): Promise<number>
  getStudioApplicationDetail(
    applicationId: string,
    organizationId: string
  ): Promise<StudioApplicationDetail | null>
  updateStudioApplicationAssignee(input: UpdateStudioApplicationAssigneeInput): Promise<void>
  updateStudioApplicationStatus(input: UpdateStudioApplicationStatusInput): Promise<void>
  updateStudioApplicationOutcome(input: UpdateStudioApplicationOutcomeInput): Promise<void>
  updateStudioApplicationConsultationSnapshot(
    input: UpdateStudioApplicationConsultationSnapshotInput
  ): Promise<void>
  updateStudioApplicationLatestConsultationSnapshot(
    input: UpdateStudioApplicationLatestConsultationSnapshotInput
  ): Promise<void>
  createStudioConsultationLog(input: CreateStudioConsultationLogInput): Promise<"created" | "duplicate">
  updateStudioConsultationLog(input: UpdateStudioConsultationLogInput): Promise<void>
  upsertStudioTrialResult(input: UpsertStudioTrialResultInput): Promise<"created" | "updated">
  createTrialApplication(
    input: TrialApplicationInput
  ): Promise<TrialApplicationSummary>
  getPendingTeacherSignupRequest(userId: string): Promise<TeacherSignupRequest | null>
  createTeacherSignupRequest(input: CreateTeacherSignupRequestInput): Promise<TeacherSignupRequest>
}
