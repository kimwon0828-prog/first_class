import type {
  ApplicationLogEntry,
  AvailableScheduleSlot,
  ClassDetail,
  ClassSummary,
  DataAdapter,
  StudioApplicationDetail,
  StudioApplicationSummary,
  StudioScheduleBlockSummary,
  StudioTeacherOption,
  TeacherPublicProfile,
  TeacherSignupRequest,
  TrialApplicationInput,
  TrialApplicationSummary,
  UpdateStudioApplicationStatusInput
} from "@/shared/lib/db/adapter"

type MockScheduleBlock = StudioScheduleBlockSummary & {
  classId: string | null
}

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

type GlobalMockStore = typeof globalThis & {
  __firstClassMockClasses__?: ClassSummary[]
  __firstClassMockScheduleBlocks__?: MockScheduleBlock[]
  __firstClassMockApplications__?: StudioApplicationDetail[]
  __firstClassMockApplicationLogs__?: ApplicationLogEntry[]
  __firstClassMockTeacherSignupRequests__?: TeacherSignupRequest[]
}

const defaultClasses: ClassSummary[] = [
  {
    id: "class-1",
    programType: "trial_class",
    title: "초등 저학년 창의 미술 체험",
    subject: "미술",
    region: "강남",
    targetAge: "7세~초2",
    description: "기초 드로잉과 색채 표현을 중심으로 즐겁게 배우는 체험 수업입니다.",
    trialPrice: 0,
    teacherId: "teacher-1",
    teacherDisplayName: "김지은 선생님",
    teacherName: "김지은 선생님",
    coverImageUrl: null,
    isActive: true
  },
  {
    id: "class-2",
    programType: "trial_class",
    title: "기초 과학 실험 체험",
    subject: "과학",
    region: "강남",
    targetAge: "초3~초5",
    description: "안전한 실험 키트로 관찰과 기록 습관을 키우는 체험 수업입니다.",
    trialPrice: 10000,
    teacherId: "teacher-1",
    teacherDisplayName: "김지은 선생님",
    teacherName: "김지은 선생님",
    coverImageUrl: null,
    isActive: true
  },
  {
    id: "class-3",
    programType: "trial_class",
    title: "초등 사고력 수학 게임 수업",
    subject: "수학",
    region: "서초",
    targetAge: "초2~초4",
    description: "보드게임과 퍼즐을 통해 수학적 사고력을 키우는 체험 수업입니다.",
    trialPrice: 5000,
    teacherId: "teacher-2",
    teacherDisplayName: "박서현 선생님",
    teacherName: "박서현 선생님",
    coverImageUrl: null,
    isActive: true
  },
  {
    id: "class-4",
    programType: "trial_class",
    title: "스토리텔링 영어 말하기 체험",
    subject: "영어",
    region: "송파",
    targetAge: "7세~초2",
    description: "짧은 이야기 만들기와 역할놀이로 말하기 자신감을 키워요.",
    trialPrice: 0,
    teacherId: "teacher-2",
    teacherDisplayName: "박서현 선생님",
    teacherName: "박서현 선생님",
    coverImageUrl: null,
    isActive: true
  }
]

const globalMockStore = globalThis as GlobalMockStore
const classes = globalMockStore.__firstClassMockClasses__ ?? (globalMockStore.__firstClassMockClasses__ = [...defaultClasses])
const scheduleBlocks =
  globalMockStore.__firstClassMockScheduleBlocks__ ??
  (globalMockStore.__firstClassMockScheduleBlocks__ = [
    {
      id: "slot-1",
      teacherId: "teacher-1",
      classId: "class-1",
      startAt: getFutureIso(24),
      endAt: getFutureIso(25),
      capacity: 2,
      appliedCount: 0,
      remainingCount: 2,
      isClosed: false,
      type: "available"
    },
    {
      id: "slot-2",
      teacherId: "teacher-1",
      classId: "class-2",
      startAt: getFutureIso(48),
      endAt: getFutureIso(49),
      capacity: 1,
      appliedCount: 0,
      remainingCount: 1,
      isClosed: false,
      type: "available"
    },
    {
      id: "slot-3",
      teacherId: "teacher-2",
      classId: "class-3",
      startAt: getFutureIso(30),
      endAt: getFutureIso(31),
      capacity: 1,
      appliedCount: 0,
      remainingCount: 1,
      isClosed: false,
      type: "available"
    }
  ])
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

const ACTIVE_APPLICATION_STATUSES: TrialApplicationSummary["status"][] = [
  "new",
  "reviewing",
  "confirmed"
]

function getFutureIso(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString()
}

const getTeacherOptions = (): StudioTeacherOption[] =>
  teacherProfiles.map((profile) => ({
    teacherId: profile.teacherId,
    teacherName: profile.teacherName
  }))

const toAvailableScheduleSlot = (
  slot: MockScheduleBlock,
  appliedCount: number
): AvailableScheduleSlot => {
  const remainingCount = Math.max(0, slot.capacity - appliedCount)

  return {
    id: slot.id,
    teacherId: slot.teacherId,
    classId: slot.classId,
    startAt: slot.startAt,
    endAt: slot.endAt,
    capacity: slot.capacity,
    appliedCount,
    remainingCount,
    isClosed: remainingCount <= 0
  }
}

const getAppliedCountForSlot = (slotId: string, slotStartAt: string, teacherId?: string) => {
  return applications.filter((application) => {
    const classItem = classes.find((item) => item.id === application.classId)
    if (!classItem) {
      return false
    }

    if (teacherId && classItem.teacherId !== teacherId) {
      return false
    }

    return (
      (application.requestedScheduleBlockId === slotId ||
        application.requestedSlotAt === slotStartAt) &&
      ACTIVE_APPLICATION_STATUSES.includes(application.status)
    )
  }).length
}

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
  async listStudioClasses(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return [...classes].sort((a, b) => (a.title > b.title ? 1 : -1))
  },
  async listStudioTeacherOptions(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return getTeacherOptions()
  },
  async upsertStudioClass(input) {
    if (input.organizationId !== mockOrganizationId) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    const teacherOption = getTeacherOptions().find((item) => item.teacherId === input.teacherId)
    if (!teacherOption) {
      throw new Error("invalid_teacher_for_organization")
    }

    if (input.mode === "update" && !input.classId) {
      throw new Error("invalid_class_id_for_update")
    }

    const nextValue: ClassSummary = {
      id: input.classId ?? `class-${classes.length + 1}`,
      programType: input.programType,
      title: input.title,
      subject: input.subject,
      region: input.region,
      targetAge: input.targetAge,
      description: input.description,
      trialPrice: input.trialPrice,
      teacherId: input.teacherId,
      teacherDisplayName: input.teacherDisplayName,
      teacherName: input.teacherDisplayName || teacherOption.teacherName,
      coverImageUrl: input.coverImageUrl,
      isActive: input.isActive
    }

    const existingIndex = input.classId ? classes.findIndex((item) => item.id === input.classId) : -1
    if (input.mode === "update" && existingIndex < 0) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    if (input.mode === "update") {
      classes[existingIndex] = nextValue
    } else {
      classes.unshift(nextValue)

      for (const slot of input.scheduleSlots ?? []) {
        scheduleBlocks.unshift({
          id: `slot-${scheduleBlocks.length + 1}`,
          teacherId: input.teacherId,
          classId: nextValue.id,
          type: "available",
          startAt: slot.startAt,
          endAt: slot.endAt,
          capacity: slot.capacity,
          appliedCount: 0,
          remainingCount: slot.capacity,
          isClosed: false
        })
      }
    }

    return nextValue
  },
  async updateStudioClassActive(classId, organizationId, isActive) {
    if (organizationId !== mockOrganizationId) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    const target = classes.find((item) => item.id === classId)
    if (!target) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    target.isActive = isActive
  },
  async listTeacherScheduleBlocks(teacherId) {
    const nowMs = Date.now()
    return scheduleBlocks
      .filter((slot) => slot.teacherId === teacherId)
      .filter((slot) => new Date(slot.endAt).getTime() >= nowMs)
      .map((slot) => {
        const appliedCount = getAppliedCountForSlot(slot.id, slot.startAt, teacherId)
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
  async createStudioScheduleBlock(input) {
    const created: MockScheduleBlock = {
      id: `slot-${scheduleBlocks.length + 1}`,
      teacherId: input.teacherId,
      classId: input.classId ?? null,
      type: "available",
      startAt: input.startAt,
      endAt: input.endAt,
      capacity: input.capacity,
      appliedCount: 0,
      remainingCount: input.capacity,
      isClosed: false
    }

    scheduleBlocks.push(created)
    return created
  },
  async updateStudioScheduleBlockType(input) {
    const target = scheduleBlocks.find(
      (slot) => slot.id === input.scheduleBlockId && slot.teacherId === input.teacherId
    )

    if (!target) {
      throw new Error("studio_schedule_block_not_found_or_forbidden")
    }

    target.type = input.nextType
  },
  async listAvailableScheduleSlotsByClassId(classId) {
    const classItem = classes.find((item) => item.id === classId)
    if (!classItem?.teacherId) {
      return []
    }
    const teacherId = classItem.teacherId

    const nowMs = Date.now()
    const primarySlots = scheduleBlocks
      .filter((slot) => slot.classId === classId)
      .filter((slot) => slot.type === "available")
      .filter((slot) => new Date(slot.startAt).getTime() > nowMs)

    const fallbackSlots =
      primarySlots.length === 0
        ? scheduleBlocks
            .filter((slot) => slot.classId == null)
            .filter((slot) => slot.teacherId === classItem.teacherId)
            .filter((slot) => slot.type === "available")
            .filter((slot) => new Date(slot.startAt).getTime() > nowMs)
        : []
    const usesFallback = primarySlots.length === 0 && fallbackSlots.length > 0

    return [...primarySlots, ...fallbackSlots]
      .filter((slot) => slot.type === "available")
      .map((slot) => {
        const appliedCount = usesFallback
          ? getAppliedCountForSlot(slot.id, slot.startAt, teacherId)
          : applications.filter(
              (application) =>
                application.classId === classId &&
                (application.requestedScheduleBlockId === slot.id ||
                  application.requestedSlotAt === slot.startAt) &&
                ACTIVE_APPLICATION_STATUSES.includes(application.status)
            ).length

        return toAvailableScheduleSlot(slot, appliedCount)
      })
      .sort((a, b) => (a.startAt > b.startAt ? 1 : -1))
  },
  async listMyApplications(parentId) {
    return applications
      .filter((item) => item.parentId === parentId)
      .map((item) => ({
        id: item.id,
        classId: item.classId,
        classTitle: item.classTitle,
        parentId: item.parentId,
        childName: item.childName,
        childGrade: item.childGrade,
        parentName: item.parentName,
        parentPhone: item.parentPhone,
        requestedScheduleBlockId: item.requestedScheduleBlockId,
        requestedSlotAt: item.requestedSlotAt,
        confirmedSlotAt: item.confirmedSlotAt,
        status: item.status,
        goalType: item.goalType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
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
      classSubject: "classSubject" in application ? application.classSubject : classItem?.subject ?? null,
      classRegion: "classRegion" in application ? application.classRegion : classItem?.region ?? null,
      assignedTeacherId:
        "assignedTeacherId" in application ? application.assignedTeacherId : classItem?.teacherId ?? null,
      confirmedScheduleBlockId:
        "confirmedScheduleBlockId" in application ? application.confirmedScheduleBlockId : null,
      childSchool: "childSchool" in application ? application.childSchool ?? null : null,
      childNotes: "childNotes" in application ? application.childNotes ?? null : null,
      subjectExperienceYn:
        "subjectExperienceYn" in application ? application.subjectExperienceYn ?? null : null,
      subjectExperienceDuration:
        "subjectExperienceDuration" in application
          ? application.subjectExperienceDuration ?? null
          : null,
      currentLevel: "currentLevel" in application ? application.currentLevel ?? null : null,
      preferredRegularSchedule:
        "preferredRegularSchedule" in application ? application.preferredRegularSchedule ?? null : null,
      goalNote: "goalNote" in application ? application.goalNote ?? null : null,
      consultationNote: "consultationNote" in application ? application.consultationNote ?? null : null,
      trialFeedback: "trialFeedback" in application ? application.trialFeedback ?? null : null,
      finalLevel: "finalLevel" in application ? application.finalLevel ?? null : null,
      finalSchedule: "finalSchedule" in application ? application.finalSchedule ?? null : null,
      memo: "memo" in application ? application.memo ?? null : null,
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

    const classItem = classes.find((item) => item.id === input.classId)
    const created: TrialApplicationSummary = {
      id: `app-${applications.length + 1}`,
      classId: input.classId,
      classTitle: classItem?.title ?? null,
      parentId: input.parentId,
      childName: input.childName,
      childGrade: input.childGrade,
      parentName: input.parentName,
      parentPhone: input.parentPhone,
      requestedScheduleBlockId: matchedSlot.id,
      requestedSlotAt: matchedSlot.startAt,
      confirmedSlotAt: null,
      status: "new",
      goalType: input.goalType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    applications.push({
      ...created,
      classSubject: classItem?.subject ?? null,
      classRegion: classItem?.region ?? null,
      assignedTeacherId: classItem?.teacherId ?? null,
      childSchool: input.childSchool,
      childNotes: input.childNotes,
      subjectExperienceYn: input.subjectExperienceYn,
      subjectExperienceDuration: input.subjectExperienceDuration,
      currentLevel: input.currentLevel,
      preferredRegularSchedule: input.preferredRegularSchedule,
      goalNote: input.goalNote,
      consultationNote: null,
      trialFeedback: null,
      finalLevel: null,
      finalSchedule: null,
      confirmedScheduleBlockId: null,
      memo: input.memo,
      logs: []
    })

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
