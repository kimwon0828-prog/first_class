import type {
  ApplicationLogEntry,
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  AvailableScheduleSlot,
  ChildProfile,
  ChildProfileInput,
  CreateStudioTeacherInput,
  DeactivateStudioTeacherInput,
  ClassDetail,
  ClassSummary,
  DataAdapter,
  MyDashboardData,
  StudioApplicationDetail,
  StudioApplicationSummary,
  StudioClassScheduleItem,
  StudioScheduleBlockSummary,
  StudioDashboardTeacherFilterOption,
  StudioTeacherSeatSummary,
  StudioTeacherSummary,
  StudioTeacherOption,
  TeacherPublicProfile,
  TeacherSignupRequest,
  OrganizationLocationInfo,
  UpdateChildProfileInput,
  UpdateStudioTeacherInput,
  TrialApplicationInput,
  TrialApplicationSummary,
  UpdateStudioApplicationAssigneeInput,
  UpdateStudioApplicationOutcomeInput,
  UpdateStudioApplicationStatusInput
} from "@/shared/lib/db/adapter"

type MockScheduleBlock = StudioScheduleBlockSummary & {
  classId: string | null
}

type MockApplicationRecord = StudioApplicationDetail & {
  childId: string | null
}

const mockOrganizationId = "org-1"
const mockTeacherProfileId = "teacher-profile-1"
const mockOrganizationLocation: OrganizationLocationInfo = {
  name: "첫수업 강남학원",
  branchName: "강남점",
  address: "경기도 고양시 일산서구 중앙로 1234",
  addressDetail: "5층 501호"
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

const teacherSummaries: StudioTeacherSummary[] = [
  {
    id: "teacher-1",
    profileId: mockTeacherProfileId,
    organizationId: mockOrganizationId,
    displayName: "김지은 선생님",
    phone: "010-1234-5678",
    smsEnabled: true,
    specialty: "초등 창의 미술",
    intro: "아이 눈높이에 맞춘 체험형 수업을 진행합니다.",
    careerYears: 6,
    isActive: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
  },
  {
    id: "teacher-2",
    profileId: null,
    organizationId: mockOrganizationId,
    displayName: "박서현 선생님",
    phone: null,
    smsEnabled: false,
    specialty: "초등 과학 탐구",
    intro: "실험과 토론 중심으로 과학 개념을 쉽게 전달합니다.",
    careerYears: 8,
    isActive: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString()
  }
]

type GlobalMockStore = typeof globalThis & {
  __firstClassMockClasses__?: ClassSummary[]
  __firstClassMockScheduleBlocks__?: MockScheduleBlock[]
  __firstClassMockApplications__?: MockApplicationRecord[]
  __firstClassMockApplicationLogs__?: ApplicationLogEntry[]
  __firstClassMockChildren__?: ChildProfile[]
  __firstClassMockTeacherSignupRequests__?: TeacherSignupRequest[]
}

const defaultClasses: ClassSummary[] = [
  {
    id: "class-1",
    programType: "trial_class",
    title: "초등 저학년 창의 미술 체험",
    subject: "미술",
    region: "후곡학원가",
    targetAge: "7세~초2",
    classFormat: null,
    description: "기초 드로잉과 색채 표현을 중심으로 즐겁게 배우는 체험 수업입니다.",
    recommendedFor: null,
    experiencePoints: null,
    curriculum: null,
    teacherIntro: null,
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
    region: "백마학원가",
    targetAge: "초3~초5",
    classFormat: null,
    description: "안전한 실험 키트로 관찰과 기록 습관을 키우는 체험 수업입니다.",
    recommendedFor: null,
    experiencePoints: null,
    curriculum: null,
    teacherIntro: null,
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
    region: "은행사거리학원가",
    targetAge: "초2~초4",
    classFormat: null,
    description: "보드게임과 퍼즐을 통해 수학적 사고력을 키우는 체험 수업입니다.",
    recommendedFor: null,
    experiencePoints: null,
    curriculum: null,
    teacherIntro: null,
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
    region: "후곡학원가",
    targetAge: "7세~초2",
    classFormat: null,
    description: "짧은 이야기 만들기와 역할놀이로 말하기 자신감을 키워요.",
    recommendedFor: null,
    experiencePoints: null,
    curriculum: null,
    teacherIntro: null,
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
const children =
  globalMockStore.__firstClassMockChildren__ ?? (globalMockStore.__firstClassMockChildren__ = [])
const teacherSignupRequests =
  globalMockStore.__firstClassMockTeacherSignupRequests__ ??
  (globalMockStore.__firstClassMockTeacherSignupRequests__ = [])

const cloneClassSummary = (item: ClassSummary): ClassSummary => ({
  ...item,
  schedules: item.schedules?.map((schedule) => ({ ...schedule }))
})

const toMockClassSchedules = (input: {
  classId: string
  scheduleSlots?: unknown[]
}): StudioClassScheduleItem[] => {
  return (input.scheduleSlots ?? [])
    .map((slot, index) => {
      if (!slot || typeof slot !== "object") {
        return null
      }

      const candidate = slot as {
        id?: unknown
        scheduleType?: unknown
        dayOfWeek?: unknown
        specificDate?: unknown
        startTime?: unknown
        endTime?: unknown
        capacity?: unknown
        displayLabel?: unknown
        sortOrder?: unknown
      }

      if (candidate.scheduleType !== "weekly" && candidate.scheduleType !== "one_time") {
        return null
      }

      if (typeof candidate.startTime !== "string" || typeof candidate.endTime !== "string") {
        return null
      }

      return {
        id:
          typeof candidate.id === "string" && candidate.id
            ? candidate.id
            : `${input.classId}-schedule-${index + 1}`,
        scheduleType: candidate.scheduleType,
        dayOfWeek: typeof candidate.dayOfWeek === "number" ? candidate.dayOfWeek : null,
        specificDate: typeof candidate.specificDate === "string" ? candidate.specificDate : null,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        capacity: typeof candidate.capacity === "number" ? candidate.capacity : null,
        displayLabel: typeof candidate.displayLabel === "string" ? candidate.displayLabel : null,
        sortOrder: typeof candidate.sortOrder === "number" ? candidate.sortOrder : index
      } satisfies StudioClassScheduleItem
    })
    .filter((schedule): schedule is StudioClassScheduleItem => Boolean(schedule))
}

const ACTIVE_APPLICATION_STATUSES: TrialApplicationSummary["status"][] = [
  "new",
  "reviewing",
  "confirmed"
]

function getFutureIso(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString()
}

const getTeacherOptions = (): StudioTeacherOption[] =>
  teacherSummaries
    .filter((teacher) => teacher.isActive)
    .filter((teacher) => teacher.profileId == null)
    .map((teacher) => ({
      teacherId: teacher.id,
      teacherName: teacher.displayName
    }))

const getTeacherSeatSummary = (): StudioTeacherSeatSummary => {
  const teacherSeatLimit = 3
  const activeTeacherCount = teacherSummaries.filter((teacher) => teacher.isActive && teacher.profileId == null).length

  return {
    organizationId: mockOrganizationId,
    teacherSeatLimit,
    activeTeacherCount,
    remainingTeacherSeats: Math.max(0, teacherSeatLimit - activeTeacherCount)
  }
}

const toAvailableScheduleSlot = (
  slot: MockScheduleBlock,
  appliedCount: number
): AvailableScheduleSlot => {
  const remainingCount = Math.max(0, slot.capacity - appliedCount)

  return {
    id: slot.id,
    source: "schedule_block",
    optionId: `schedule_block:${slot.id}`,
    classScheduleId: null,
    scheduleBlockId: slot.id,
    teacherId: slot.teacherId,
    classId: slot.classId,
    label: formatConcreteOccurrenceLabel(slot.startAt, slot.endAt),
    startAt: slot.startAt,
    endAt: slot.endAt,
    capacity: slot.capacity,
    appliedCount,
    remainingCount,
    isClosed: remainingCount <= 0
  }
}

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

  return `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(2, "0")}.${String(
    startDate.getDate()
  ).padStart(2, "0")} ${WEEKDAY_LABELS[startDate.getDay()]} ${String(startDate.getHours()).padStart(
    2,
    "0"
  )}:${String(startDate.getMinutes()).padStart(2, "0")}~${String(endDate.getHours()).padStart(2, "0")}:${String(
    endDate.getMinutes()
  ).padStart(2, "0")}`
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

const generateUpcomingClassScheduleOccurrences = (
  schedule: StudioClassScheduleItem,
  now: Date = new Date()
): Array<{ startAt: string; endAt: string; label: string }> => {
  const startTime = formatTimeText(schedule.startTime)
  const endTime = formatTimeText(schedule.endTime)

  if (schedule.scheduleType === "one_time") {
    if (!schedule.specificDate) {
      return []
    }

    const occurrence = buildOccurrenceRange(schedule.specificDate, startTime, endTime)
    if (!occurrence || new Date(occurrence.startAt) <= now) {
      return []
    }

    return [{ ...occurrence, label: schedule.displayLabel?.trim() || formatConcreteOccurrenceLabel(occurrence.startAt, occurrence.endAt) }]
  }

  if (schedule.dayOfWeek == null || schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6) {
    return []
  }

  const occurrences: Array<{ startAt: string; endAt: string; label: string }> = []
  const baseDate = new Date(now)
  baseDate.setHours(0, 0, 0, 0)

  for (let dayOffset = 0; dayOffset < 56 && occurrences.length < WEEKLY_OCCURRENCE_COUNT; dayOffset += 1) {
    const candidate = new Date(baseDate)
    candidate.setDate(baseDate.getDate() + dayOffset)

    if (candidate.getDay() !== schedule.dayOfWeek) {
      continue
    }

    const dateText = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(
      candidate.getDate()
    ).padStart(2, "0")}`
    const occurrence = buildOccurrenceRange(dateText, startTime, endTime)

    if (!occurrence || new Date(occurrence.startAt) <= now) {
      continue
    }

    occurrences.push({
      ...occurrence,
      label: schedule.displayLabel?.trim() || formatConcreteOccurrenceLabel(occurrence.startAt, occurrence.endAt)
    })
  }

  return occurrences
}

const toAvailableClassScheduleSlot = (input: {
  schedule: StudioClassScheduleItem
  teacherId: string
  classId: string
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
    id: `class_schedule:${input.schedule.id}:${input.startAt}`,
    source: "class_schedule",
    optionId: `class_schedule:${input.schedule.id}:${input.startAt}`,
    classScheduleId: input.schedule.id,
    scheduleBlockId: input.scheduleBlockId,
    teacherId: input.teacherId,
    classId: input.classId,
    label: input.label,
    startAt: input.startAt,
    endAt: input.endAt,
    capacity: input.capacity,
    appliedCount: input.appliedCount,
    remainingCount,
    isClosed: input.isClosed ?? remainingCount <= 0
  }
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
  schedule: Pick<StudioClassScheduleItem, "startTime" | "endTime">
) => {
  const startDate = new Date(requestedSlotAt)
  if (Number.isNaN(startDate.getTime())) {
    return null
  }

  const startTimeText = formatTimeText(schedule.startTime)
  const endTimeText = formatTimeText(schedule.endTime)
  const startHour = Number(startTimeText.slice(0, 2))
  const startMinute = Number(startTimeText.slice(3, 5))
  const endHour = Number(endTimeText.slice(0, 2))
  const endMinute = Number(endTimeText.slice(3, 5))

  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
    return null
  }

  if (startDate.getHours() !== startHour || startDate.getMinutes() !== startMinute) {
    return null
  }

  const endDate = new Date(startDate)
  endDate.setHours(endHour, endMinute, 0, 0)
  if (endDate <= startDate) {
    return null
  }

  return endDate.toISOString()
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

const getTeacherDisplayNameById = (teacherId: string | null | undefined) => {
  if (!teacherId) {
    return null
  }

  const teacher = teacherSummaries.find((item) => item.id === teacherId) ?? null
  return teacher?.displayName ?? null
}

export const mockDataAdapter: DataAdapter = {
  async listClasses(options) {
    const debugEnabled = process.env.NEXT_PUBLIC_DEBUG_DB === "1"
    const searchTerm = options?.query?.trim() ? options.query.trim() : ""
    const subject = options?.subject?.trim() ? options.subject.trim() : ""
    if (debugEnabled) {
      console.info(
        `[listClasses] ${JSON.stringify({
          called: true,
          adapter: "mock",
          region: options?.region ?? null,
          subject: subject || null,
          query: searchTerm || null
        })}`
      )
    }

    const normalizeText = (value: string | null | undefined) =>
      (value ?? "").toString().trim().toLowerCase()
    const needle = normalizeText(searchTerm)
    const shouldFilterByQuery = Boolean(needle)

    const mapped = classes.filter((item) => {
      if (!item.isActive) {
        return false
      }

      if (options?.region && item.region !== options.region) {
        return false
      }

      if (subject && item.subject !== subject) {
        return false
      }

      if (shouldFilterByQuery) {
        const haystacks = [
          item.title,
          item.description,
          item.subject,
          item.teacherDisplayName ?? null,
          item.teacherName ?? null
        ].map(normalizeText)

        if (!haystacks.some((value) => value.includes(needle))) {
          return false
        }
      }

      return true
    })

    if (debugEnabled) {
      console.info(`[listClasses] ${JSON.stringify({ classesRows: mapped.length })}`)
      console.info(
        `[listClasses] ${JSON.stringify({ teacherIds: 0, teacherProfiles: 0 })}`
      )
      console.info(`[listClasses] ${JSON.stringify({ returned: mapped.length })}`)
    }

    return mapped
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
      teacherProfile,
      organization: mockOrganizationLocation
    }

    return detail
  },
  async listStudioClasses(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return [...classes].map(cloneClassSummary).sort((a, b) => (a.title > b.title ? 1 : -1))
  },
  async listStudioTeacherOptions(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return getTeacherOptions()
  },
  async listStudioDashboardTeacherFilterOptions(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return teacherSummaries
      .filter((teacher) => teacher.isActive)
      .filter((teacher) => teacher.profileId == null)
      .map(
        (teacher): StudioDashboardTeacherFilterOption => ({
          teacherId: teacher.id,
          teacherName: teacher.displayName
        })
      )
  },
  async listStudioTeachers(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return teacherSummaries
      .filter((teacher) => teacher.profileId == null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  async getStudioTeacherSeatSummary(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return {
        organizationId,
        teacherSeatLimit: 3,
        activeTeacherCount: 0,
        remainingTeacherSeats: 3
      }
    }

    return getTeacherSeatSummary()
  },
  async createStudioTeacher(input: CreateStudioTeacherInput) {
    if (input.organizationId !== mockOrganizationId) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    const seatSummary = getTeacherSeatSummary()
    if (seatSummary.activeTeacherCount >= seatSummary.teacherSeatLimit) {
      throw new Error("teacher_seat_limit_reached")
    }

    const created: StudioTeacherSummary = {
      id: `teacher-${teacherSummaries.length + 1}`,
      profileId: null,
      organizationId: input.organizationId,
      displayName: input.displayName,
      phone: input.phone,
      smsEnabled: input.smsEnabled,
      specialty: null,
      intro: null,
      careerYears: 0,
      isActive: true,
      createdAt: new Date().toISOString()
    }

    teacherSummaries.unshift(created)
    teacherProfiles.push({
      teacherId: created.id,
      teacherName: created.displayName,
      intro: created.intro,
      specialty: created.specialty,
      careerYears: created.careerYears
    })

    return created
  },
  async updateStudioTeacher(input: UpdateStudioTeacherInput) {
    if (input.organizationId !== mockOrganizationId) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    const target = teacherSummaries.find(
      (teacher) => teacher.id === input.teacherId && teacher.organizationId === input.organizationId
    )

    if (!target) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    if (target.profileId) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    target.displayName = input.displayName
    target.phone = input.phone
    target.smsEnabled = input.smsEnabled

    const classItems = classes.filter((item) => item.teacherId === target.id)
    for (const classItem of classItems) {
      classItem.teacherDisplayName = input.displayName
      classItem.teacherName = input.displayName
    }

    const teacherProfile = teacherProfiles.find((profile) => profile.teacherId === target.id)
    if (teacherProfile) {
      teacherProfile.teacherName = input.displayName
    }

    return target
  },
  async deactivateStudioTeacher(input: DeactivateStudioTeacherInput) {
    if (input.organizationId !== mockOrganizationId) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    const target = teacherSummaries.find(
      (teacher) => teacher.id === input.teacherId && teacher.organizationId === input.organizationId
    )

    if (!target) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    if (target.profileId) {
      throw new Error("cannot_deactivate_linked_teacher")
    }

    target.isActive = false
  },
  async upsertStudioClass(input) {
    if (input.organizationId !== mockOrganizationId) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    const teacherSummary = teacherSummaries.find(
      (item) => item.id === input.teacherId && item.organizationId === input.organizationId
    )
    if (!teacherSummary) {
      throw new Error("invalid_teacher_for_organization")
    }

    if (!teacherSummary.isActive) {
      throw new Error("inactive_teacher_for_class")
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
      classFormat: input.classFormat,
      recommendedFor: input.recommendedFor,
      experiencePoints: input.experiencePoints,
      curriculum: input.curriculum,
      teacherIntro: input.teacherIntro,
      trialPrice: input.trialPrice,
      teacherId: input.teacherId,
      teacherDisplayName: teacherSummary.displayName,
      teacherName: teacherSummary.displayName,
      coverImageUrl: input.coverImageUrl,
      isActive: input.isActive,
      schedules: toMockClassSchedules({
        classId: input.classId ?? `class-${classes.length + 1}`,
        scheduleSlots: input.scheduleSlots as unknown[]
      })
    }

    const existingIndex = input.classId ? classes.findIndex((item) => item.id === input.classId) : -1
    if (input.mode === "update" && existingIndex < 0) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    if (input.mode === "update") {
      classes[existingIndex] = nextValue
    } else {
      classes.unshift(nextValue)
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
  async listMyChildren(parentId) {
    return children
      .filter((item) => item.parentId === parentId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  async createChildProfile(input: ChildProfileInput) {
    const created: ChildProfile = {
      id: `child-${children.length + 1}`,
      parentId: input.parentId,
      name: input.name,
      grade: input.grade,
      schoolName: input.schoolName,
      notes: input.notes,
      currentLevel: input.currentLevel,
      interestSubjects: input.interestSubjects,
      goalNote: input.goalNote,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    children.unshift(created)
    return created
  },
  async updateChildProfile(input: UpdateChildProfileInput) {
    const target = children.find(
      (item) => item.id === input.childId && item.parentId === input.parentId
    )

    if (!target) {
      throw new Error("child_profile_not_found_or_forbidden")
    }

    target.name = input.name
    target.grade = input.grade
    target.schoolName = input.schoolName
    target.notes = input.notes
    target.currentLevel = input.currentLevel
    target.interestSubjects = input.interestSubjects
    target.goalNote = input.goalNote
    target.updatedAt = new Date().toISOString()

    return target
  },
  async getMyDashboard(parentId) {
    const applications = await this.listMyApplications(parentId)
    const summary: MyDashboardData = {
      childrenCount: children.filter((item) => item.parentId === parentId).length,
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
    const classItem = classes.find((item) => item.id === classId)
    if (!classItem?.teacherId) {
      return []
    }
    const teacherId = classItem.teacherId

    const nowMs = Date.now()
    if (classItem.schedules && classItem.schedules.length > 0) {
      const existingBlocks = scheduleBlocks.filter((slot) => slot.classId === classId)

      return classItem.schedules
        .flatMap((schedule) =>
          generateUpcomingClassScheduleOccurrences(schedule).map((occurrence) => {
            const matchedBlock =
              existingBlocks.find(
                (slot) => slot.startAt === occurrence.startAt && slot.endAt === occurrence.endAt && slot.type === "available"
              ) ??
              existingBlocks.find((slot) => slot.startAt === occurrence.startAt && slot.endAt === occurrence.endAt) ??
              null
            const appliedCount =
              matchedBlock && matchedBlock.type === "available"
                ? applications.filter(
                    (application) =>
                      application.classId === classId &&
                      application.requestedScheduleBlockId === matchedBlock.id &&
                      ACTIVE_APPLICATION_STATUSES.includes(application.status)
                  ).length
                : 0
            const capacity = matchedBlock?.capacity ?? Math.max(1, schedule.capacity ?? 1)

            return toAvailableClassScheduleSlot({
              schedule,
              teacherId,
              classId,
              startAt: occurrence.startAt,
              endAt: occurrence.endAt,
              label: occurrence.label,
              capacity,
              appliedCount,
              scheduleBlockId: matchedBlock?.type === "available" ? matchedBlock.id : null,
              isClosed: matchedBlock != null && matchedBlock.type !== "available" ? true : undefined
            })
          })
        )
        .sort((a, b) => (a.startAt > b.startAt ? 1 : -1))
    }

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
        classProgramType: item.classProgramType,
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
  async listStudioApplications(organizationId, options) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return applications
      .filter((item) => {
        if (!options?.teacherId) {
          return true
        }

        return item.assignedTeacherId === options.teacherId
      })
      .map((item) => {
        const classItem = classes.find((classRow) => classRow.id === item.classId)
        const mapped: StudioApplicationSummary = {
          ...item,
          classSubject: classItem?.subject ?? null,
          classRegion: classItem?.region ?? null,
          assignedTeacherId: item.assignedTeacherId ?? null,
          assignedTeacherName: getTeacherDisplayNameById(item.assignedTeacherId),
          registrationStatus:
            "registrationStatus" in item ? item.registrationStatus ?? "undecided" : "undecided"
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
      assignedTeacherId: "assignedTeacherId" in application ? application.assignedTeacherId : null,
      assignedTeacherName:
        application.assignedTeacherName ?? getTeacherDisplayNameById(application.assignedTeacherId),
      contactedAt: "contactedAt" in application ? application.contactedAt ?? null : null,
      scheduledAt: "scheduledAt" in application ? application.scheduledAt ?? null : null,
      completedAt: "completedAt" in application ? application.completedAt ?? null : null,
      canceledAt: "canceledAt" in application ? application.canceledAt ?? null : null,
      noShowAt: "noShowAt" in application ? application.noShowAt ?? null : null,
      enrolledAt: "enrolledAt" in application ? application.enrolledAt ?? null : null,
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
      registrationStatus:
        "registrationStatus" in application ? application.registrationStatus : "undecided",
      registeredCourse:
        "registeredCourse" in application ? application.registeredCourse ?? null : null,
      unregisteredReason:
        "unregisteredReason" in application ? application.unregisteredReason ?? null : null,
      followUpNote: "followUpNote" in application ? application.followUpNote ?? null : null,
      memo: "memo" in application ? application.memo ?? null : null,
      logs
    }

    return detail
  },
  async updateStudioApplicationAssignee(input: UpdateStudioApplicationAssigneeInput) {
    if (input.organizationId !== mockOrganizationId) {
      throw new Error("application_not_found_or_forbidden")
    }

    const target = applications.find((item) => item.id === input.applicationId)
    if (!target) {
      throw new Error("application_not_found_or_forbidden")
    }

    if (input.assignedTeacherId) {
      const matchedTeacher = teacherSummaries.find(
        (teacher) =>
          teacher.id === input.assignedTeacherId &&
          teacher.organizationId === input.organizationId &&
          teacher.isActive &&
          teacher.profileId == null
      )

      if (!matchedTeacher) {
        throw new Error("invalid_teacher_for_application_organization")
      }
    }

    target.assignedTeacherId = input.assignedTeacherId
    target.assignedTeacherName = getTeacherDisplayNameById(input.assignedTeacherId)
    target.updatedAt = new Date().toISOString()
  },
  async updateStudioApplicationStatus(input: UpdateStudioApplicationStatusInput) {
    const target = applications.find(
      (item) => item.id === input.applicationId && item.status === input.currentStatus
    )

    if (!target) {
      throw new Error("application_status_conflict")
    }

    const nowIso = new Date().toISOString()
    if (input.actionType === "move_to_reviewing") {
      target.contactedAt = nowIso
    }

    if (input.actionType === "move_to_confirmed") {
      target.scheduledAt = nowIso
      if (target.requestedScheduleBlockId) {
        target.confirmedSlotAt = target.requestedSlotAt
        target.confirmedScheduleBlockId = target.requestedScheduleBlockId
      } else if (target.classScheduleId) {
        const classItem = classes.find((item) => item.id === target.classId)
        const schedule = classItem?.schedules?.find((item) => item.id === target.classScheduleId) ?? null

        if (!classItem?.teacherId || !schedule) {
          throw new Error("failed_to_prepare_application_status_update")
        }

        const requestedEndAt = buildRequestedOccurrenceEndAt(target.requestedSlotAt, schedule)
        if (!requestedEndAt) {
          throw new Error("invalid_requested_class_schedule_occurrence")
        }

        const existingBlocks = scheduleBlocks.filter(
          (slot) =>
            slot.classId === target.classId &&
            slot.startAt === target.requestedSlotAt &&
            slot.endAt === requestedEndAt
        )
        const availableBlock = existingBlocks.find((slot) => slot.type === "available") ?? null

        if (!availableBlock && existingBlocks.length > 0) {
          throw new Error("schedule_block_conflict_for_requested_occurrence")
        }

        let resolvedBlock = availableBlock
        if (!resolvedBlock) {
          resolvedBlock = {
            id: `slot-${scheduleBlocks.length + 1}`,
            teacherId: classItem.teacherId,
            classId: target.classId,
            type: "available",
            startAt: target.requestedSlotAt,
            endAt: requestedEndAt,
            capacity: Math.max(1, schedule.capacity ?? 1),
            appliedCount: 0,
            remainingCount: Math.max(1, schedule.capacity ?? 1),
            isClosed: false
          }
          scheduleBlocks.push(resolvedBlock)
        }

        target.requestedScheduleBlockId = resolvedBlock.id
        target.confirmedSlotAt = target.requestedSlotAt
        target.confirmedScheduleBlockId = resolvedBlock.id
      } else {
        throw new Error("missing_requested_schedule_block")
      }
    }

    if (input.actionType === "move_to_completed") {
      target.completedAt = nowIso
    }

    if (input.actionType === "cancel") {
      target.confirmedSlotAt = null
      target.confirmedScheduleBlockId = null
      target.canceledAt = nowIso
    }

    if (input.actionType === "no_show") {
      target.confirmedSlotAt = null
      target.confirmedScheduleBlockId = null
      target.noShowAt = nowIso
    }

    target.status = input.nextStatus
    target.updatedAt = nowIso

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
  async updateStudioApplicationOutcome(input: UpdateStudioApplicationOutcomeInput) {
    const target = applications.find((item) => item.id === input.applicationId)

    if (!target) {
      throw new Error("application_not_found_or_forbidden")
    }

    target.consultationNote = input.consultationNote
    target.trialFeedback = input.trialFeedback
    target.registeredCourse = input.registeredCourse
    target.finalLevel = input.finalLevel
    target.finalSchedule = input.finalSchedule
    target.followUpNote = input.followUpNote
    target.registrationStatus = input.registrationStatus
    target.enrolledAt = input.registrationStatus === "enrolled" ? new Date().toISOString() : null
    target.unregisteredReason = input.unregisteredReason
    target.updatedAt = new Date().toISOString()

    applicationLogs.unshift({
      id: `log-${applicationLogs.length + 1}`,
      applicationId: input.applicationId,
      fromStatus: input.currentStatus,
      toStatus: input.currentStatus,
      actorId: input.actorId,
      actorName: input.actorId === mockTeacherProfileId ? "테스트 선생님" : null,
      note: input.note,
      createdAt: new Date().toISOString()
    })
  },
  async createTrialApplication(input: TrialApplicationInput) {
    const parsedScheduleOption = parseSelectedScheduleOptionId(
      input.selectedScheduleOptionId ??
        (input.selectedScheduleBlockId ? `schedule_block:${input.selectedScheduleBlockId}` : undefined)
    )

    if (!parsedScheduleOption) {
      throw new Error("invalid_schedule_slot")
    }

    const available = await this.listAvailableScheduleSlotsByClassId(input.classId)
    const matchedSlot = available.find((slot) => slot.optionId === input.selectedScheduleOptionId) ??
      (parsedScheduleOption.source === "schedule_block"
        ? available.find((slot) => slot.scheduleBlockId === parsedScheduleOption.scheduleBlockId)
        : available.find((slot) => slot.optionId === `class_schedule:${parsedScheduleOption.classScheduleId}:${parsedScheduleOption.occurrenceStartAt}`))

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
      classProgramType: classItem?.programType ?? null,
      parentId: input.parentId,
      childName: input.childName,
      childGrade: input.childGrade,
      parentName: input.parentName,
      parentPhone: input.parentPhone,
      classScheduleId: matchedSlot.classScheduleId,
      requestedScheduleBlockId:
        matchedSlot.source === "schedule_block" ? matchedSlot.scheduleBlockId ?? null : null,
      selectedScheduleLabel: matchedSlot.label,
      requestedSlotAt: matchedSlot.startAt,
      confirmedSlotAt: null,
      status: "new",
      goalType: input.goalType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    applications.push({
      ...created,
      childId: input.childId ?? null,
      classSubject: classItem?.subject ?? null,
      classRegion: classItem?.region ?? null,
      assignedTeacherId: classItem?.teacherId ?? null,
      assignedTeacherName: classItem?.teacherDisplayName ?? classItem?.teacherName ?? null,
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
      registrationStatus: "undecided" as ApplicationRegistrationStatus,
      registeredCourse: null,
      unregisteredReason: null as ApplicationUnregisteredReason | null,
      followUpNote: null,
      contactedAt: null,
      scheduledAt: null,
      completedAt: null,
      canceledAt: null,
      noShowAt: null,
      enrolledAt: null,
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
      academyArea: input.academyArea,
      branchName: input.branchName,
      address: input.address,
      addressDetail: input.addressDetail,
      organizationPhone: input.organizationPhone,
      requestNote: input.requestNote,
      createdAt: new Date().toISOString()
    }

    teacherSignupRequests.push(created)
    return created
  }
}
