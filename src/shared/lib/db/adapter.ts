import type { AcademyArea } from "@/shared/config/academy-areas"

export type UserRole = "parent" | "teacher"

export type ClassProgramType = "trial_class" | "level_test"

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
  | "other"

export type TeacherPublicProfile = {
  teacherId: string
  teacherName: string
  intro: string | null
  specialty: string | null
  careerYears: number
}

export type StudioClassScheduleType = "weekly" | "one_time"

export type StudioClassScheduleItem = {
  id: string
  scheduleType: StudioClassScheduleType
  dayOfWeek: number | null
  specificDate: string | null
  startTime: string
  endTime: string
  capacity: number | null
  displayLabel: string | null
  sortOrder: number
}

export type ClassSummary = {
  id: string
  programType: ClassProgramType
  title: string
  subject: string
  region: AcademyArea
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
  schedules?: StudioClassScheduleItem[]
}

export type OrganizationLocationInfo = {
  name: string
  branchName: string | null
  address: string | null
  addressDetail: string | null
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
  teacherId: string
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
  newApplicationCount: number
  activeApplicationCount: number
  todayScheduledCount: number
  pendingConfirmationCount: number
  needsOutcomeCount: number
  registeredCount: number
  enrollmentRate: number
  monthlyApplicationCount: number
  monthlyCompletedCount: number
  monthlyEnrolledCount: number
  monthlyEnrollmentRate: number
}

export type StudioTeacherOption = {
  teacherId: string
  teacherName: string
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
  specialty: string | null
  intro: string | null
  careerYears: number
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
}

export type UpdateStudioTeacherInput = {
  teacherId: string
  organizationId: string
  displayName: string
}

export type DeactivateStudioTeacherInput = {
  teacherId: string
  organizationId: string
  actorProfileId: string
}

export type StudioClassInput = {
  mode: "create" | "update"
  classId?: string
  organizationId: string
  programType: ClassProgramType
  title: string
  subject: string
  targetAge: string
  region: AcademyArea
  description: string
  classFormat: string | null
  recommendedFor: string | null
  experiencePoints: string | null
  curriculum: string | null
  teacherIntro: string | null
  trialPrice: number
  teacherId: string
  teacherDisplayName: string
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
  startAt: string
  endAt: string
  capacity: number
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
  status: ApplicationStatus
  goalType: string | null
  createdAt: string
  updatedAt: string
}

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
  assignedTeacherId: string | null
  registrationStatus: ApplicationRegistrationStatus
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
  followUpNote: string | null
  memo: string | null
  logs: ApplicationLogEntry[]
}

export type UpdateStudioApplicationStatusInput = {
  applicationId: string
  currentStatus: ApplicationStatus
  nextStatus: ApplicationStatus
  actorId: string
  note: string
}

export type UpdateStudioApplicationOutcomeInput = {
  applicationId: string
  actorId: string
  currentStatus: ApplicationStatus
  consultationNote: string | null
  trialFeedback: string | null
  registeredCourse: string | null
  finalLevel: string | null
  finalSchedule: string | null
  followUpNote: string | null
  registrationStatus: ApplicationRegistrationStatus
  unregisteredReason: ApplicationUnregisteredReason | null
  note: string
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
  region?: AcademyArea
  query?: string
  subject?: string
}

export interface DataAdapter {
  listClasses(options?: ListClassesOptions): Promise<ClassSummary[]>
  getClassById(classId: string): Promise<ClassDetail | null>
  listAvailableScheduleSlotsByClassId(classId: string): Promise<AvailableScheduleSlot[]>
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
  upsertStudioClass(input: StudioClassInput): Promise<ClassSummary>
  updateStudioClassActive(
    classId: string,
    organizationId: string,
    isActive: boolean
  ): Promise<void>
  listTeacherScheduleBlocks(teacherId: string): Promise<StudioScheduleBlockSummary[]>
  createStudioScheduleBlock(input: CreateStudioScheduleBlockInput): Promise<StudioScheduleBlockSummary>
  updateStudioScheduleBlockType(input: UpdateStudioScheduleBlockTypeInput): Promise<void>
  listMyChildren(parentId: string): Promise<ChildProfile[]>
  createChildProfile(input: ChildProfileInput): Promise<ChildProfile>
  updateChildProfile(input: UpdateChildProfileInput): Promise<ChildProfile>
  getMyDashboard(parentId: string): Promise<MyDashboardData>
  listMyApplications(parentId: string): Promise<TrialApplicationSummary[]>
  listStudioApplications(
    organizationId: string,
    options?: { teacherId?: string | null }
  ): Promise<StudioApplicationSummary[]>
  getStudioApplicationDetail(
    applicationId: string,
    organizationId: string
  ): Promise<StudioApplicationDetail | null>
  updateStudioApplicationStatus(input: UpdateStudioApplicationStatusInput): Promise<void>
  updateStudioApplicationOutcome(input: UpdateStudioApplicationOutcomeInput): Promise<void>
  createTrialApplication(
    input: TrialApplicationInput
  ): Promise<TrialApplicationSummary>
  getPendingTeacherSignupRequest(userId: string): Promise<TeacherSignupRequest | null>
  createTeacherSignupRequest(input: CreateTeacherSignupRequestInput): Promise<TeacherSignupRequest>
}
