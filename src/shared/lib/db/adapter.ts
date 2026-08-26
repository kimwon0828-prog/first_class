import type { AcademyArea } from "@/shared/config/academy-areas"
import type { TeacherPublicVisibility } from "@/shared/lib/teacher-public-visibility"
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
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type TeacherPublicProfile = {
  teacherId: string
  teacherName: string | null
  intro: string | null
  specialty: string | null
  careerYears: number
  subjects: string | null
  targetStudents: string | null
  specialties: string | null
  shortIntro: string | null
  teachingStyle: string | null
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
  scheduleCount: number
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
  teacherProfile: TeacherPublicProfile | null
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

export type StudioTeacherSummary = {
  id: string
  profileId: string | null
  organizationId: string
  displayName: string
  phone: string | null
  smsEnabled: boolean
  specialty: string | null
  intro: string | null
  careerYears: number
  subjects: string | null
  targetStudents: string | null
  specialties: string | null
  shortIntro: string | null
  teachingStyle: string | null
  publicVisibility: TeacherPublicVisibility
  isActive: boolean
  createdAt: string
}

export type StudioTeacherSeatSummary = {
  organizationId: string
  teacherSeatLimit: number
  activeTeacherCount: number
  remainingTeacherSeats: number
}

export type CreateStudioTeacherInput = {
  organizationId: string
  displayName: string
  phone: string | null
  smsEnabled: boolean
  intro: string | null
  subjects: string | null
  targetStudents: string | null
  specialties: string | null
  shortIntro: string | null
  teachingStyle: string | null
  publicVisibility: TeacherPublicVisibility
}

export type UpdateStudioTeacherInput = {
  teacherId: string
  organizationId: string
  displayName: string
  phone: string | null
  smsEnabled: boolean
  intro: string | null
  subjects: string | null
  targetStudents: string | null
  specialties: string | null
  shortIntro: string | null
  teachingStyle: string | null
  publicVisibility: TeacherPublicVisibility
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

export type UpdateStudioApplicationConsultationSnapshotInput = {
  applicationId: string
  currentStatus: ApplicationStatus
  nextContactAt: string | null
  lastActivityAt: string
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
}

export type UpdateStudioConsultationLogInput = {
  applicationId: string
  consultationLogId: string
  actorId: string
  channel: ConsultationLogChannel
  sentiment: ConsultationSentiment
  nextContactAt: string | null
  note: string
}

export type UpdateStudioApplicationLatestConsultationSnapshotInput = {
  applicationId: string
  currentStatus: ApplicationStatus
  nextContactAt: string | null
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
  academyArea: AcademyArea
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
  academyArea: AcademyArea
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
  getStudioTeacherSeatSummary(organizationId: string): Promise<StudioTeacherSeatSummary>
  createStudioTeacher(input: CreateStudioTeacherInput): Promise<StudioTeacherSummary>
  updateStudioTeacher(input: UpdateStudioTeacherInput): Promise<StudioTeacherSummary>
  deactivateStudioTeacher(input: DeactivateStudioTeacherInput): Promise<void>
  activateStudioTeacher(input: ActivateStudioTeacherInput): Promise<void>
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
