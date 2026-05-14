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
  TrialApplicationInput,
  TrialApplicationSummary,
  UpdateStudioApplicationStatusInput
} from "@/shared/lib/db/adapter"

const teacherProfiles: TeacherPublicProfile[] = [
  {
    teacherId: "teacher-1",
    teacherName: "김지은 선생님",
    intro: "아이 눈높이에 맞춘 체험형 수업을 진행합니다.",
    specialty: "초등 창의 미술",
    careerYears: 6
  },
  {
    teacherId: "teacher-2",
    teacherName: "박서현 선생님",
    intro: "실험과 토론 중심으로 과학 개념을 쉽게 전달합니다.",
    specialty: "초등 과학 탐구",
    careerYears: 8
  }
]

const classes: ClassSummary[] = [
  {
    id: "class-1",
    title: "초등 저학년 창의 미술 체험",
    subject: "미술",
    region: "강남",
    targetAge: "7-9",
    description: "기초 드로잉과 색채 표현을 중심으로 즐겁게 배우는 체험 수업입니다.",
    trialPrice: 0,
    teacherId: "teacher-1",
    teacherName: "김지은 선생님",
    isActive: true
  },
  {
    id: "class-2",
    title: "기초 과학 실험 체험",
    subject: "과학",
    region: "강남",
    targetAge: "9-11",
    description: "안전한 실험 키트로 관찰과 기록 습관을 키우는 체험 수업입니다.",
    trialPrice: 10000,
    teacherId: "teacher-1",
    teacherName: "김지은 선생님",
    isActive: true
  },
  {
    id: "class-3",
    title: "초등 사고력 수학 게임 수업",
    subject: "수학",
    region: "서초",
    targetAge: "8-10",
    description: "보드게임과 퍼즐을 통해 수학적 사고력을 키우는 체험 수업입니다.",
    trialPrice: 5000,
    teacherId: "teacher-2",
    teacherName: "박서현 선생님",
    isActive: true
  },
  {
    id: "class-4",
    title: "스토리텔링 영어 말하기 체험",
    subject: "영어",
    region: "송파",
    targetAge: "7-9",
    description: "짧은 이야기 만들기와 역할놀이로 말하기 자신감을 키워요.",
    trialPrice: 0,
    teacherId: "teacher-2",
    teacherName: "박서현 선생님",
    isActive: true
  }
]

type GlobalMockStore = typeof globalThis & {
  __firstClassMockApplications__?: TrialApplicationSummary[]
  __firstClassMockApplicationLogs__?: ApplicationLogEntry[]
  __firstClassMockTeacherSignupRequests__?: TeacherSignupRequest[]
}

const globalMockStore = globalThis as GlobalMockStore
const applications =
  globalMockStore.__firstClassMockApplications__ ??
  (globalMockStore.__firstClassMockApplications__ = [])
const applicationLogs =
  globalMockStore.__firstClassMockApplicationLogs__ ??
  (globalMockStore.__firstClassMockApplicationLogs__ = [])
const teacherSignupRequests =
  globalMockStore.__firstClassMockTeacherSignupRequests__ ??
  (globalMockStore.__firstClassMockTeacherSignupRequests__ = [])
const mockOrganizationId = "org-1"
const mockTeacherProfileId = "teacher-profile-1"

const getFutureIso = (hoursFromNow: number) => {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString()
}

const availableSlots: AvailableScheduleSlot[] = [
  {
    id: "slot-1",
    teacherId: "teacher-1",
    startAt: getFutureIso(24),
    endAt: getFutureIso(25),
    capacity: 2,
    appliedCount: 0,
    remainingCount: 2,
    isClosed: false
  },
  {
    id: "slot-2",
    teacherId: "teacher-1",
    startAt: getFutureIso(48),
    endAt: getFutureIso(49),
    capacity: 1,
    appliedCount: 0,
    remainingCount: 1,
    isClosed: false
  },
  {
    id: "slot-3",
    teacherId: "teacher-2",
    startAt: getFutureIso(30),
    endAt: getFutureIso(31),
    capacity: 1,
    appliedCount: 0,
    remainingCount: 1,
    isClosed: false
  }
]

const ACTIVE_APPLICATION_STATUSES: TrialApplicationSummary["status"][] = [
  "new",
  "reviewing",
  "confirmed"
]

export const mockDataAdapter: DataAdapter = {
  async listClasses() {
    return classes.filter((item) => item.isActive)
  },
  async getClassById(classId) {
    const found = classes.find((item) => item.id === classId) ?? null
    if (!found || !found.isActive) {
      return null
    }

    const teacherProfile =
      teacherProfiles.find((profile) => profile.teacherId === found.teacherId) ?? null

    const detail: ClassDetail = {
      ...found,
      teacherProfile
    }

    return detail
  },
  async listAvailableScheduleSlotsByClassId(classId) {
    const classItem = classes.find((item) => item.id === classId)
    if (!classItem?.teacherId) {
      return []
    }

    const nowMs = Date.now()
    return availableSlots
      .filter((slot) => slot.teacherId === classItem.teacherId)
      .filter((slot) => new Date(slot.startAt).getTime() > nowMs)
      .map((slot) => {
        // TODO: migrate aggregation key from (classId + requestedSlotAt) to selectedScheduleBlockId when the schema is expanded.
        const appliedCount = applications.filter(
          (application) =>
            application.classId === classId &&
            application.requestedSlotAt === slot.startAt &&
            ACTIVE_APPLICATION_STATUSES.includes(application.status)
        ).length
        const remainingCount = Math.max(0, slot.capacity - appliedCount)

        return {
          ...slot,
          appliedCount,
          remainingCount,
          isClosed: remainingCount <= 0
        }
      })
      .sort((a, b) => (a.startAt > b.startAt ? 1 : -1))
  },
  async listMyApplications(parentId) {
    return applications
      .filter((item) => item.parentId === parentId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  async listStudioApplications(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return applications
      .map((item) => {
        const classItem = classes.find((classRow) => classRow.id === item.classId)
        const mapped: StudioApplicationSummary = {
          ...item,
          classSubject: classItem?.subject ?? null,
          classRegion: classItem?.region ?? null,
          assignedTeacherId: classItem?.teacherId ?? null
        }

        return mapped
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  async getStudioApplicationDetail(applicationId, organizationId) {
    if (organizationId !== mockOrganizationId) {
      return null
    }

    const application = applications.find((item) => item.id === applicationId)
    if (!application) {
      return null
    }

    const classItem = classes.find((item) => item.id === application.classId)
    const logs = applicationLogs
      .filter((item) => item.applicationId === applicationId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    const detail: StudioApplicationDetail = {
      ...application,
      classSubject: classItem?.subject ?? null,
      classRegion: classItem?.region ?? null,
      assignedTeacherId: classItem?.teacherId ?? null,
      confirmedScheduleBlockId: null,
      memo: null,
      logs
    }

    return detail
  },
  async updateStudioApplicationStatus(input: UpdateStudioApplicationStatusInput) {
    const target = applications.find(
      (item) => item.id === input.applicationId && item.status === input.currentStatus
    )

    if (!target) {
      throw new Error("application_status_conflict")
    }

    target.status = input.nextStatus
    target.updatedAt = new Date().toISOString()

    if (input.nextStatus === "confirmed") {
      target.confirmedSlotAt = target.requestedSlotAt
    }

    applicationLogs.unshift({
      id: `log-${applicationLogs.length + 1}`,
      applicationId: input.applicationId,
      fromStatus: input.currentStatus,
      toStatus: input.nextStatus,
      actorId: input.actorId,
      actorName: input.actorId === mockTeacherProfileId ? "테스트 선생님" : null,
      note: input.note,
      createdAt: new Date().toISOString()
    })
  },
  async createTrialApplication(input: TrialApplicationInput) {
    if (!input.selectedScheduleBlockId) {
      throw new Error("invalid_schedule_slot")
    }

    const available = await this.listAvailableScheduleSlotsByClassId(input.classId)
    const matchedSlot = available.find((slot) => slot.id === input.selectedScheduleBlockId)

    if (!matchedSlot) {
      throw new Error("invalid_schedule_slot")
    }

    if (matchedSlot.isClosed || matchedSlot.appliedCount >= matchedSlot.capacity) {
      throw new Error("slot_capacity_reached")
    }

    const existing = applications.find(
      (item) =>
        item.parentId === input.parentId &&
        item.classId === input.classId &&
        item.childName === input.childName &&
        item.requestedSlotAt === matchedSlot.startAt &&
        ACTIVE_APPLICATION_STATUSES.includes(item.status)
    )

    if (existing) {
      throw new Error("duplicate_trial_application")
    }

    const created: TrialApplicationSummary = {
      id: `app-${applications.length + 1}`,
      classId: input.classId,
      classTitle: classes.find((item) => item.id === input.classId)?.title ?? null,
      parentId: input.parentId,
      childName: input.childName,
      childGrade: input.childGrade,
      requestedSlotAt: matchedSlot.startAt,
      confirmedSlotAt: null,
      status: "new",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    applications.push(created)

    applicationLogs.unshift({
      id: `log-${applicationLogs.length + 1}`,
      applicationId: created.id,
      fromStatus: null,
      toStatus: "new",
      actorId: input.parentId,
      actorName: null,
      note: "학부모 체험 신청 생성",
      createdAt: new Date().toISOString()
    })

    return created
  },
  async getPendingTeacherSignupRequest(userId) {
    const found = teacherSignupRequests.find(
      (req) => req.userId === userId && req.status === "pending"
    )
    return found ?? null
  },
  async createTeacherSignupRequest(input) {
    const existing = teacherSignupRequests.find(
      (req) => req.userId === input.userId && (req.status === "pending" || req.status === "approved")
    )

    if (existing) {
      throw new Error("already_requested_or_approved")
    }

    const created: TeacherSignupRequest = {
      id: `tsr-${teacherSignupRequests.length + 1}`,
      userId: input.userId,
      status: "pending",
      teacherName: input.teacherName,
      teacherPhone: input.teacherPhone,
      organizationName: input.organizationName,
      branchName: input.branchName,
      organizationPhone: input.organizationPhone,
      requestNote: input.requestNote,
      createdAt: new Date().toISOString()
    }

    teacherSignupRequests.push(created)
    return created
  }
}
