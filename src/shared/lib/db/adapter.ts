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
  status: ApplicationStatus
  createdAt: string
}

export interface DataAdapter {
  listClasses(): Promise<ClassSummary[]>
  getClassById(classId: string): Promise<ClassDetail | null>
  listAvailableScheduleSlotsByClassId(classId: string): Promise<AvailableScheduleSlot[]>
  listMyApplications(parentId: string): Promise<TrialApplicationSummary[]>
  createTrialApplication(
    input: TrialApplicationInput
  ): Promise<TrialApplicationSummary>
}
