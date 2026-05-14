export type UserRole = "parent" | "teacher"

export type ApplicationStatus =
  | "new"
  | "reviewing"
  | "confirmed"
  | "completed"
  | "canceled"

export type TeacherPublicProfile = {
  teacherId: string
  teacherName: string
  intro: string | null
  specialty: string | null
  careerYears: number
}

export type ClassSummary = {
  id: string
  title: string
  subject: string
  region: string
  targetAge: string
  description: string
  trialPrice: number
  teacherId: string | null
  teacherName: string | null
  isActive: boolean
}

export type ClassDetail = ClassSummary & {
  teacherProfile: TeacherPublicProfile | null
}

export type AvailableScheduleSlot = {
  id: string
  teacherId: string
  startAt: string
  endAt: string
  capacity: number
  appliedCount: number
  remainingCount: number
  isClosed: boolean
}

export type TrialApplicationInput = {
  parentId: string
  classId: string
  childName: string
  childGrade: string
  requestedSlotAt?: string
  selectedScheduleBlockId?: string
  memo: string | null
}

export type TrialApplicationSummary = {
  id: string
  classId: string
  classTitle: string | null
  parentId: string
  childName: string
  childGrade: string
  requestedSlotAt: string
  confirmedSlotAt: string | null
  status: ApplicationStatus
  createdAt: string
  updatedAt: string
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
}

export type StudioApplicationDetail = StudioApplicationSummary & {
  confirmedScheduleBlockId: string | null
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

export type TeacherSignupRequestStatus = "pending" | "approved" | "rejected"

export type TeacherSignupRequest = {
  id: string
  userId: string
  status: TeacherSignupRequestStatus
  teacherName: string
  teacherPhone: string | null
  organizationName: string
  branchName: string | null
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
  organizationPhone: string | null
  requestNote: string | null
}

export interface DataAdapter {
  listClasses(): Promise<ClassSummary[]>
  getClassById(classId: string): Promise<ClassDetail | null>
  listAvailableScheduleSlotsByClassId(classId: string): Promise<AvailableScheduleSlot[]>
  listMyApplications(parentId: string): Promise<TrialApplicationSummary[]>
  listStudioApplications(organizationId: string): Promise<StudioApplicationSummary[]>
  getStudioApplicationDetail(
    applicationId: string,
    organizationId: string
  ): Promise<StudioApplicationDetail | null>
  updateStudioApplicationStatus(input: UpdateStudioApplicationStatusInput): Promise<void>
  createTrialApplication(
    input: TrialApplicationInput
  ): Promise<TrialApplicationSummary>
  getPendingTeacherSignupRequest(userId: string): Promise<TeacherSignupRequest | null>
  createTeacherSignupRequest(input: CreateTeacherSignupRequestInput): Promise<TeacherSignupRequest>
}
