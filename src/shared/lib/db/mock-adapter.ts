import type {
  ActivateStudioTeacherInput,
  DeleteStudioTeacherInput,
  ApplicationLogEntry,
  RegularSchedulePreferenceWrite,
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  AvailableScheduleSlot,
  BulkCreateClassSchedulesInput,
  BulkCreateClassSchedulesPreview,
  BulkCreateClassSchedulesResult,
  ChildProfile,
  ChildProfileInput,
  CreateStudioConsultationLogInput,
  CreateStudioConsultationTransactionInput,
  UpdateStudioConsultationLogInput,
  CreateStudioTeacherInput,
  CreateStudioClassScheduleInput,
  DeactivateStudioTeacherInput,
  ClassDetail,
  ClassSummary,
  DataAdapter,
  DeleteStudioClassScheduleInput,
  MyDashboardData,
  StudioApplicationDetail,
  StudioApplicationListOptions,
  StudioConsultationPipelineApplicationItem,
  StudioConsultationLog,
  StudioTrialResult,
  StudioApplicationSummary,
  StudioClassListItem,
  StudioClassScheduleItem,
  StudioScheduleCalendarDay,
  StudioScheduleCalendarItem,
  StudioUnregisteredApplicationItem,
  StudioUnregisteredListOptions,
  StudioScheduleBlockSummary,
  StudioDashboardTeacherFilterOption,
  StudioTeacherAssignmentSummary,
  StudioTeacherSummary,
  StudioTeacherOption,
  TeacherSignupRequest,
  OrganizationLocationInfo,
  UpdateChildProfileInput,
  UpdateStudioTeacherInput,
  TrialApplicationInput,
  TrialApplicationSummary,
  UpsertStudioTrialResultInput,
  UpdateStudioApplicationAssigneeInput,
  UpdateStudioApplicationConsultationSnapshotInput,
  UpdateStudioApplicationLatestConsultationSnapshotInput,
  UpdateStudioApplicationOutcomeInput,
  UpdateStudioApplicationStatusInput,
  UpdateStudioClassScheduleInput
} from "@/shared/lib/db/adapter"
import { getConsultationPipelineGroup } from "@/shared/lib/consultation-pipeline"
import { resolveLegacySubjectChange } from "@/shared/lib/class-subject-write"
import {
  buildSeoulOccurrenceRange,
  formatSeoulDateKey,
  formatSeoulOccurrenceLabel,
  resolveRequestedClassScheduleOccurrence
} from "@/shared/lib/seoul-datetime"
import { normalizeSubjectCategory } from "@/shared/constants/education-taxonomy"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { summarizeStudioClassSchedules } from "@/features/studio/lib/class-schedule-summary"
import {
  buildClassSubjectReadModel,
  formatClassSubjectDisplayLabel,
  resolveClassSubjectDisplay,
  type ClassSubjectReadModel,
  type Subject,
  type SubjectCategory
} from "@/shared/lib/subject-master"

type MockScheduleBlock = StudioScheduleBlockSummary & {
  classId: string | null
}

type MockApplicationRecord = Omit<
  StudioApplicationDetail,
  "scheduleStartTime" | "scheduleEndTime" | "confirmedBlockStartAt" | "confirmedBlockEndAt"
> & {
  childId: string | null
}

/**
 * 희망 일정 write 를 적용한다. write 가 없으면 아무것도 바꾸지 않는다.
 * supabase adapter 의 buildRegularSchedulePreferenceUpdate 와 같은 규칙이다.
 */
const applyRegularSchedulePreferenceWrite = (
  target: MockApplicationRecord,
  write: RegularSchedulePreferenceWrite | undefined
) => {
  if (!write) {
    return
  }

  target.regularSchedulePreference = write.preference
  target.regularSchedulePreferenceNote = write.note
  target.regularSchedulePreferenceUpdatedAt = write.updatedAt
}

const mockOrganizationId = "org-1"
// 상태 변경 로그의 actor 이름 표시에만 쓰는 로그인 운영 멤버 profile fixture 다.
// teachers 명부 row 와는 연결하지 않는다(production 도 profile_id 전부 NULL).
const mockStudioActorProfileId = "studio-actor-profile-1"
const mockMasterCategories: SubjectCategory[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    code: "math",
    name: "수학",
    sortOrder: 2
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    code: "english",
    name: "영어",
    sortOrder: 3
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    code: "music",
    name: "음악",
    sortOrder: 8
  }
]
const mockMasterSubjects: Subject[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    code: "thinking_math",
    name: "사고력수학",
    categoryId: "00000000-0000-4000-8000-000000000001",
    categoryCode: "math",
    categoryName: "수학",
    sortOrder: 2
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    code: "english",
    name: "영어",
    categoryId: "00000000-0000-4000-8000-000000000002",
    categoryCode: "english",
    categoryName: "영어",
    sortOrder: 1
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    code: "piano",
    name: "피아노",
    categoryId: "00000000-0000-4000-8000-000000000003",
    categoryCode: "music",
    categoryName: "음악",
    sortOrder: 1
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    code: "violin",
    name: "바이올린",
    categoryId: "00000000-0000-4000-8000-000000000003",
    categoryCode: "music",
    categoryName: "음악",
    sortOrder: 2
  }
]
const mockMasterCategoryById = new Map(
  mockMasterCategories.map((category) => [category.id, category])
)
const mockMasterSubjectById = new Map(mockMasterSubjects.map((subject) => [subject.id, subject]))
const mockMasterSubjectByCode = new Map(mockMasterSubjects.map((subject) => [subject.code, subject]))
const mockOrganizationLocation: OrganizationLocationInfo = {
  name: "첫수업 강남학원",
  branchName: "강남점",
  address: "경기도 고양시 일산서구 중앙로 1234",
  addressDetail: "5층 501호",
  sido: "경기",
  sigungu: "고양시 일산서구",
  bname: null
}

const teacherSummaries: StudioTeacherSummary[] = [
  {
    id: "teacher-1",
    profileId: null,
    organizationId: mockOrganizationId,
    displayName: "김지은 선생님",
    phone: "010-1234-5678",
    smsEnabled: true,
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
    isActive: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString()
  }
]


type GlobalMockStore = typeof globalThis & {
  __firstClassMockClasses__?: ClassSummary[]
  __firstClassMockScheduleBlocks__?: MockScheduleBlock[]
  __firstClassMockApplications__?: MockApplicationRecord[]
  __firstClassMockApplicationLogs__?: ApplicationLogEntry[]
  __firstClassMockConsultationLogs__?: StudioConsultationLog[]
  __firstClassMockTrialResults__?: StudioTrialResult[]
  __firstClassMockChildren__?: ChildProfile[]
  __firstClassMockTeacherSignupRequests__?: TeacherSignupRequest[]
}

const defaultClasses: ClassSummary[] = [
  {
    id: "class-1",
    programType: "trial_class",
    assignmentMode: "preassigned",
    title: "초등 저학년 창의 미술 체험",
    subjectCategoryId: null,
    subjectId: null,
    subjectCode: null,
    subjectName: null,
    subjectCategoryCode: null,
    subjectCategoryName: null,
    subject: "미술",
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
    assignmentMode: "preassigned",
    title: "기초 과학 실험 체험",
    subjectCategoryId: null,
    subjectId: null,
    subjectCode: null,
    subjectName: null,
    subjectCategoryCode: null,
    subjectCategoryName: null,
    subject: "과학",
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
    assignmentMode: "preassigned",
    title: "초등 사고력 수학 게임 수업",
    subjectCategoryId: null,
    subjectId: null,
    subjectCode: null,
    subjectName: null,
    subjectCategoryCode: null,
    subjectCategoryName: null,
    subject: "수학",
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
    assignmentMode: "preassigned",
    title: "스토리텔링 영어 말하기 체험",
    subjectCategoryId: null,
    subjectId: null,
    subjectCode: null,
    subjectName: null,
    subjectCategoryCode: null,
    subjectCategoryName: null,
    subject: "영어",
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
const consultationLogs =
  globalMockStore.__firstClassMockConsultationLogs__ ??
  (globalMockStore.__firstClassMockConsultationLogs__ = [])
const trialResults =
  globalMockStore.__firstClassMockTrialResults__ ??
  (globalMockStore.__firstClassMockTrialResults__ = [])
const children =
  globalMockStore.__firstClassMockChildren__ ?? (globalMockStore.__firstClassMockChildren__ = [])
const teacherSignupRequests =
  globalMockStore.__firstClassMockTeacherSignupRequests__ ??
  (globalMockStore.__firstClassMockTeacherSignupRequests__ = [])

const cloneClassSummary = (item: ClassSummary): ClassSummary => ({
  ...item,
  schedules: item.schedules?.map((schedule) => ({ ...schedule }))
})

const filterPublicVisibleSchedules = (schedules: StudioClassScheduleItem[] | undefined) =>
  schedules?.filter((schedule) => (schedule.bookingStatus ?? "open") !== "hidden")

const toPublicVisibleClassSummary = (item: ClassSummary): ClassSummary => ({
  ...cloneClassSummary(item),
  schedules: filterPublicVisibleSchedules(item.schedules)
})

const toStudioClassListItem = (item: ClassSummary): StudioClassListItem => ({
  id: item.id,
  programType: item.programType,
  assignmentMode: item.assignmentMode,
  title: item.title,
  subjectCategoryId: item.subjectCategoryId,
  subjectId: item.subjectId,
  subjectCode: item.subjectCode,
  subjectName: item.subjectName,
  subjectCategoryCode: item.subjectCategoryCode,
  subjectCategoryName: item.subjectCategoryName,
  subject: item.subject,
  targetAge: item.targetAge,
  trialPrice: item.trialPrice,
  teacherId: item.teacherId,
  teacherDisplayName: item.teacherDisplayName,
  teacherName: item.teacherName,
  coverImageUrl: item.coverImageUrl,
  isActive: item.isActive,
  scheduleSummary: summarizeStudioClassSchedules(
    (item.schedules ?? []).map((schedule) => ({
      scheduleType: schedule.scheduleType,
      dayOfWeek: schedule.dayOfWeek,
      specificDate: schedule.specificDate,
      startTime: schedule.startTime
    }))
  )
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
        bookingStatus?: unknown
        dayOfWeek?: unknown
        specificDate?: unknown
        seriesId?: unknown
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
        bookingStatus:
          candidate.bookingStatus === "closed" || candidate.bookingStatus === "hidden"
            ? candidate.bookingStatus
            : "open",
        dayOfWeek: typeof candidate.dayOfWeek === "number" ? candidate.dayOfWeek : null,
        specificDate: typeof candidate.specificDate === "string" ? candidate.specificDate : null,
        seriesId: typeof candidate.seriesId === "string" ? candidate.seriesId : null,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        capacity: typeof candidate.capacity === "number" ? candidate.capacity : null,
        displayLabel: typeof candidate.displayLabel === "string" ? candidate.displayLabel : null,
        sortOrder: typeof candidate.sortOrder === "number" ? candidate.sortOrder : index
      } satisfies StudioClassScheduleItem
    })
    .filter((schedule): schedule is NonNullable<typeof schedule> => schedule !== null)
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
    .map((teacher) => ({
      teacherId: teacher.id,
      teacherName: teacher.displayName
    }))

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

const WEEKLY_OCCURRENCE_COUNT = 4

const formatTimeText = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed
}

const formatConcreteOccurrenceLabel = (startAt: string, endAt: string) =>
  formatSeoulOccurrenceLabel(startAt, endAt) ?? startAt

const buildOccurrenceRange = (dateText: string, startTime: string, endTime: string) =>
  buildSeoulOccurrenceRange(dateText, startTime, endTime)

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
  const baseDateText = formatSeoulDateKey(now)
  if (!baseDateText) {
    return []
  }
  const baseDate = new Date(`${baseDateText}T00:00:00Z`)

  for (let dayOffset = 0; dayOffset < 56 && occurrences.length < WEEKLY_OCCURRENCE_COUNT; dayOffset += 1) {
    const candidate = new Date(baseDate)
    candidate.setUTCDate(baseDate.getUTCDate() + dayOffset)

    if (candidate.getUTCDay() !== schedule.dayOfWeek) {
      continue
    }

    const dateText = `${candidate.getUTCFullYear()}-${String(candidate.getUTCMonth() + 1).padStart(2, "0")}-${String(
      candidate.getUTCDate()
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
  teacherId: string | null
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
    scheduleType: input.schedule.scheduleType,
    bookingStatus: input.schedule.bookingStatus ?? "open",
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

const getProfileDisplayNameById = (profileId: string | null | undefined) => {
  if (!profileId) {
    return null
  }

  const teacher = teacherSummaries.find((item) => item.profileId === profileId) ?? null
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
          subject: subject || null,
          subjectCategoryId: options?.subjectCategoryId ?? null,
          subjectId: options?.subjectId ?? null,
          query: searchTerm || null
        })}`
      )
    }

    const normalizeText = (value: string | null | undefined) =>
      (value ?? "").toString().trim().toLowerCase()
    const needle = normalizeText(searchTerm)
    const shouldFilterByQuery = Boolean(needle)

    const mapped = classes
      .filter((item) => {
      if (!item.isActive) {
        return false
      }

      if (
        options?.subjectCategoryId &&
        item.subjectCategoryId !== options.subjectCategoryId
      ) {
        return false
      }

      if (options?.subjectId && item.subjectId !== options.subjectId) {
        return false
      }

      if (subject && normalizeSubjectCategory(item.subject) !== normalizeSubjectCategory(subject)) {
        return false
      }

      if (shouldFilterByQuery) {
        // 학부모 목록/상세에는 선생님 정보를 노출하지 않는다(supabase adapter 와 동일).
        const haystacks = [
          item.title,
          item.description,
          item.subject,
          formatClassSubjectDisplayLabel(item),
          item.subjectCategoryName,
          item.subjectName
        ].map(normalizeText)

        if (!haystacks.some((value) => value.includes(needle))) {
          return false
        }
      }

        return true
      })
      .map((item) => {
        return {
          ...toPublicVisibleClassSummary(item),
          teacherDisplayName: null,
          teacherName: null
        }
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

    const publicTeacherName = null

    const detail: ClassDetail = {
      ...toPublicVisibleClassSummary(found),
      teacherDisplayName: publicTeacherName,
      teacherName: publicTeacherName,
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
  async listStudioClassListItems(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return [...classes].map(toStudioClassListItem).sort((a, b) => (a.title > b.title ? 1 : -1))
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
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  async listStudioTeacherAssignments(organizationId): Promise<StudioTeacherAssignmentSummary[]> {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    const byTeacherId = new Map<string, { titles: string[]; subjects: string[] }>()
    for (const item of classes) {
      if (!item.teacherId || !item.isActive) {
        continue
      }

      const bucket = byTeacherId.get(item.teacherId) ?? { titles: [], subjects: [] }
      bucket.titles.push(item.title)
      const display = resolveClassSubjectDisplay(item)
      const label = (display.subjectLabel ?? display.categoryLabel ?? "").trim()
      if (label && !bucket.subjects.includes(label)) {
        bucket.subjects.push(label)
      }
      byTeacherId.set(item.teacherId, bucket)
    }

    return Array.from(byTeacherId.entries()).map(([teacherId, bucket]) => ({
      teacherId,
      classCount: bucket.titles.length,
      classTitles: bucket.titles,
      subjectLabels: bucket.subjects
    }))
  },
  async createStudioTeacher(input: CreateStudioTeacherInput) {
    if (input.organizationId !== mockOrganizationId) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    const created: StudioTeacherSummary = {
      id: `teacher-${teacherSummaries.length + 1}`,
      profileId: null,
      organizationId: input.organizationId,
      displayName: input.displayName,
      phone: input.phone,
      smsEnabled: input.smsEnabled,
      isActive: true,
      createdAt: new Date().toISOString()
    }

    teacherSummaries.unshift(created)

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
  async deleteStudioTeacher(input: DeleteStudioTeacherInput) {
    if (input.organizationId !== mockOrganizationId) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    const index = teacherSummaries.findIndex(
      (teacher) => teacher.id === input.teacherId && teacher.organizationId === input.organizationId
    )

    if (index === -1) {
      throw new Error("teacher_not_found_or_forbidden")
    }

    const target = teacherSummaries[index]

    if (target.profileId) {
      throw new Error("cannot_delete_linked_teacher")
    }

    // mock 은 classes 참조만 추적할 수 있다. 실제 4종 참조 검사는 supabase adapter 가 담당한다.
    const classCount = classes.filter((item) => item.teacherId === input.teacherId).length
    if (classCount > 0) {
      throw new Error(
        `teacher_has_references:${JSON.stringify({
          classes: classCount,
          trialApplications: 0,
          scheduleBlocks: 0,
          smsLogs: 0
        })}`
      )
    }

    teacherSummaries.splice(index, 1)
  },
  async activateStudioTeacher(input: ActivateStudioTeacherInput) {
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
      throw new Error("cannot_activate_linked_teacher")
    }

    target.isActive = true
  },
  async upsertStudioClass(input) {
    if (input.organizationId !== mockOrganizationId) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    const teacherSummary = input.teacherId
      ? teacherSummaries.find(
          (item) => item.id === input.teacherId && item.organizationId === input.organizationId
        ) ?? null
      : null
    if (input.teacherId && !teacherSummary) {
      throw new Error("invalid_teacher_for_organization")
    }

    if (teacherSummary && !teacherSummary.isActive) {
      throw new Error("inactive_teacher_for_class")
    }

    if (input.mode === "update" && !input.classId) {
      throw new Error("invalid_class_id_for_update")
    }

    const existingIndex = input.classId ? classes.findIndex((item) => item.id === input.classId) : -1
    if (input.mode === "update" && existingIndex < 0) {
      throw new Error("studio_class_not_found_or_forbidden")
    }
    const existingClass = existingIndex >= 0 ? classes[existingIndex] : null
    const explicitMasterCategory = input.subjectCategoryId
      ? mockMasterCategoryById.get(input.subjectCategoryId) ?? null
      : null
    const explicitMasterSubject = input.subjectId
      ? mockMasterSubjectById.get(input.subjectId) ?? null
      : null
    if (input.subjectCategoryId && !explicitMasterCategory) {
      throw new Error("invalid_or_inactive_subject_category_id")
    }
    if (input.subjectId && !explicitMasterSubject) {
      throw new Error("invalid_or_inactive_subject_id")
    }
    if (explicitMasterSubject && !explicitMasterCategory) {
      throw new Error("subject_category_required")
    }
    if (
      explicitMasterSubject &&
      explicitMasterSubject.categoryId !== explicitMasterCategory?.id
    ) {
      throw new Error("subject_category_mismatch")
    }

    let nextSubject =
      explicitMasterSubject?.code ?? explicitMasterCategory?.code ?? input.subject
    let nextSubjectReadModel: ClassSubjectReadModel = buildClassSubjectReadModel({
      subjectCategoryId: explicitMasterCategory?.id,
      masterCategory: explicitMasterCategory,
      subjectId: explicitMasterSubject?.id,
      masterSubject: explicitMasterSubject
    })

    if (!explicitMasterCategory && existingClass) {
      const legacySubjectChange = resolveLegacySubjectChange({
        existingSubject: existingClass.subject,
        nextSubject: input.subject
      })

      if (legacySubjectChange.action === "preserve") {
        nextSubjectReadModel = {
          subjectCategoryId: existingClass.subjectCategoryId,
          subjectId: existingClass.subjectId,
          subjectCode: existingClass.subjectCode,
          subjectName: existingClass.subjectName,
          subjectCategoryCode: existingClass.subjectCategoryCode,
          subjectCategoryName: existingClass.subjectCategoryName
        }
      } else if (legacySubjectChange.action === "map") {
        const mappedSubject = mockMasterSubjectByCode.get(legacySubjectChange.subjectCode)
        if (!mappedSubject) {
          throw new Error("legacy_subject_master_mapping_not_found")
        }
        const mappedCategory = mockMasterCategoryById.get(mappedSubject.categoryId) ?? null
        nextSubjectReadModel = buildClassSubjectReadModel({
          subjectCategoryId: mappedCategory?.id,
          masterCategory: mappedCategory,
          subjectId: mappedSubject.id,
          masterSubject: mappedSubject
        })
      } else if (legacySubjectChange.action === "clear") {
        nextSubject = input.subject
      }
    }

    const nextValue: ClassSummary = {
      id: input.classId ?? `class-${classes.length + 1}`,
      programType: input.programType,
      assignmentMode: input.assignmentMode,
      title: input.title,
      ...nextSubjectReadModel,
      subject: nextSubject,
      targetAge: input.targetAge,
      description: input.description,
      classFormat: input.classFormat,
      recommendedFor: input.recommendedFor,
      experiencePoints: input.experiencePoints,
      curriculum: input.curriculum,
      teacherIntro: input.teacherIntro,
      trialPrice: input.trialPrice,
      teacherId: input.teacherId,
      teacherDisplayName: teacherSummary?.displayName ?? input.teacherDisplayName ?? null,
      teacherName: teacherSummary?.displayName ?? input.teacherDisplayName ?? null,
      coverImageUrl: input.coverImageUrl,
      isActive: input.isActive,
      schedules: toMockClassSchedules({
        classId: input.classId ?? `class-${classes.length + 1}`,
        scheduleSlots: input.scheduleSlots as unknown[]
      })
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
    if (!classItem) {
      return []
    }
    const teacherId = classItem.teacherId

    const nowMs = Date.now()
    if (classItem.schedules && classItem.schedules.length > 0) {
      const existingBlocks = scheduleBlocks.filter((slot) => slot.classId === classId)
      const visibleSchedules = classItem.schedules.filter((schedule) => (schedule.bookingStatus ?? "open") !== "hidden")

      if (visibleSchedules.length === 0) {
        return []
      }

      return visibleSchedules
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
      primarySlots.length === 0 && teacherId
        ? scheduleBlocks
            .filter((slot) => slot.classId == null)
            .filter((slot) => slot.teacherId === teacherId)
            .filter((slot) => slot.type === "available")
            .filter((slot) => new Date(slot.startAt).getTime() > nowMs)
        : []
    const usesFallback = primarySlots.length === 0 && fallbackSlots.length > 0

    return [...primarySlots, ...fallbackSlots]
      .filter((slot) => slot.type === "available")
      .map((slot) => {
        const appliedCount = usesFallback
          ? getAppliedCountForSlot(slot.id, slot.startAt, teacherId ?? undefined)
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
  async getStudioScheduleCalendar(input) {
    if (input.organizationId !== mockOrganizationId) {
      return { items: [], days: [] }
    }

    const items: StudioScheduleCalendarItem[] = classes
      .filter((item) => !input.classId || item.id === input.classId)
      .filter((item) => !input.teacherId || item.teacherId === input.teacherId)
      .flatMap((classItem) =>
        (classItem.schedules ?? [])
          .filter((schedule) => schedule.scheduleType === "one_time" && schedule.specificDate?.startsWith(input.month))
          .map((schedule) => {
            const activeReservationCount = applications.filter(
              (application) =>
                application.classId === classItem.id &&
                application.classScheduleId === schedule.id &&
                ACTIVE_APPLICATION_STATUSES.includes(application.status)
            ).length
            const capacity = Math.max(1, schedule.capacity ?? 1)
            const remainingCapacity = Math.max(capacity - activeReservationCount, 0)
            const bookingStatus = schedule.bookingStatus ?? "open"
            const status =
              bookingStatus === "hidden"
                ? "hidden"
                : bookingStatus === "closed" || remainingCapacity <= 0
                  ? "closed"
                  : "open"

            return {
              classScheduleId: schedule.id,
              classId: classItem.id,
              classTitle: classItem.title,
              teacherId: classItem.teacherId ?? null,
              teacherName: classItem.teacherDisplayName ?? classItem.teacherName ?? null,
              scheduleType: schedule.scheduleType,
              bookingStatus: schedule.bookingStatus ?? "open",
              dayOfWeek: schedule.dayOfWeek ?? null,
              specificDate: schedule.specificDate ?? "",
              startTime: schedule.startTime.slice(0, 5),
              endTime: schedule.endTime.slice(0, 5),
              capacity,
              activeReservationCount,
              remainingCapacity,
              status,
              seriesId: schedule.seriesId ?? null
            } satisfies StudioScheduleCalendarItem
          })
      )
      .sort((a, b) => (a.specificDate === b.specificDate ? (a.startTime > b.startTime ? 1 : -1) : a.specificDate > b.specificDate ? 1 : -1))

    const daysMap = new Map<string, StudioScheduleCalendarItem[]>()
    for (const item of items) {
      const current = daysMap.get(item.specificDate) ?? []
      current.push(item)
      daysMap.set(item.specificDate, current)
    }

    const days: StudioScheduleCalendarDay[] = Array.from(daysMap.entries()).map(([date, dateItems]) => ({
      date,
      items: dateItems,
      totalCapacity: dateItems.reduce((sum, item) => sum + item.capacity, 0),
      totalActiveReservationCount: dateItems.reduce((sum, item) => sum + item.activeReservationCount, 0),
      totalRemainingCapacity: dateItems.reduce((sum, item) => sum + item.remainingCapacity, 0),
      closedCount: dateItems.filter((item) => item.status === "closed").length,
      hiddenCount: dateItems.filter((item) => item.status === "hidden").length
    }))

    return { items, days }
  },
  async createStudioClassSchedule(input: CreateStudioClassScheduleInput) {
    const target = classes.find((item) => item.id === input.classId)
    if (!target || input.organizationId !== mockOrganizationId) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    const created: StudioClassScheduleItem = {
      id: `class-schedule-${Date.now()}`,
      scheduleType: "one_time",
      bookingStatus: "open",
      dayOfWeek: null,
      specificDate: input.specificDate,
      seriesId: null,
      startTime: input.startTime,
      endTime: input.endTime,
      capacity: input.capacity,
      displayLabel: null,
      sortOrder: (target.schedules?.length ?? 0) + 1,
      applicationCount: 0,
      isReferencedByApplications: false
    }

    target.schedules = [...(target.schedules ?? []), created]
    return created
  },
  async updateStudioClassSchedule(input: UpdateStudioClassScheduleInput) {
    const targetClass = classes.find((item) =>
      (item.schedules ?? []).some((schedule) => schedule.id === input.classScheduleId)
    )
    if (!targetClass || input.organizationId !== mockOrganizationId) {
      throw new Error("class_schedule_not_found_or_forbidden")
    }

    const targetSchedule = (targetClass.schedules ?? []).find((schedule) => schedule.id === input.classScheduleId)
    if (!targetSchedule) {
      throw new Error("class_schedule_not_found_or_forbidden")
    }

    const activeReservationCount = applications.filter(
      (application) =>
        application.classScheduleId === targetSchedule.id && ACTIVE_APPLICATION_STATUSES.includes(application.status)
    ).length

    if (typeof input.capacity === "number" && input.capacity < activeReservationCount) {
      throw new Error("class_schedule_capacity_below_active_reservations")
    }

    targetSchedule.capacity =
      typeof input.capacity === "number" ? input.capacity : targetSchedule.capacity
    if (input.bookingStatus) {
      targetSchedule.bookingStatus = input.bookingStatus
    }
    if (input.displayLabel !== undefined) {
      targetSchedule.displayLabel = input.displayLabel
    }
    targetSchedule.applicationCount = activeReservationCount
    targetSchedule.isReferencedByApplications = activeReservationCount > 0

    return targetSchedule
  },
  async updateStudioClassSchedulesForDate(input) {
    const targetClass = classes.find((item) => item.id === input.classId)
    if (!targetClass || input.organizationId !== mockOrganizationId) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    const targetSchedules = (targetClass.schedules ?? []).filter(
      (schedule) => schedule.scheduleType === "one_time" && schedule.specificDate === input.specificDate
    )

    for (const schedule of targetSchedules) {
      schedule.bookingStatus = input.bookingStatus
    }

    return targetSchedules.length
  },
  async deleteStudioClassSchedule(input: DeleteStudioClassScheduleInput) {
    const targetClass = classes.find((item) =>
      (item.schedules ?? []).some((schedule) => schedule.id === input.classScheduleId)
    )
    if (!targetClass || input.organizationId !== mockOrganizationId) {
      throw new Error("class_schedule_not_found_or_forbidden")
    }

    const activeReservationCount = applications.filter(
      (application) =>
        application.classScheduleId === input.classScheduleId && ACTIVE_APPLICATION_STATUSES.includes(application.status)
    ).length
    if (activeReservationCount > 0) {
      throw new Error("class_schedule_with_active_reservations_cannot_be_deleted")
    }

    targetClass.schedules = (targetClass.schedules ?? []).filter((schedule) => schedule.id !== input.classScheduleId)
  },
  async previewBulkCreateClassSchedules(input: BulkCreateClassSchedulesInput) {
    if (input.organizationId !== mockOrganizationId) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    const target = classes.find((item) => item.id === input.classId)
    if (!target) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    const weekdays =
      input.repeatMode === "daily"
        ? [0, 1, 2, 3, 4, 5, 6]
        : input.repeatMode === "weekdays"
          ? [1, 2, 3, 4, 5]
          : input.repeatMode === "weekends"
            ? [0, 6]
            : input.weekdays

    const items: BulkCreateClassSchedulesPreview["items"] = []
    const excludedItems: BulkCreateClassSchedulesPreview["excludedItems"] = []
    const cursor = new Date(`${input.startDate}T00:00:00`)
    const endDate = new Date(`${input.endDate}T00:00:00`)

    while (cursor <= endDate) {
      if (weekdays.includes(cursor.getDay())) {
        const dateText = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
        for (const slot of input.timeSlots) {
          const duplicate = (target.schedules ?? []).some(
            (schedule) =>
              schedule.scheduleType === "one_time" &&
              schedule.specificDate === dateText &&
              schedule.startTime.slice(0, 5) === slot.startTime
          )
          items.push({
            specificDate: dateText,
            startTime: slot.startTime,
            endTime: slot.endTime,
            capacity: slot.capacity,
            classId: input.classId,
            teacherId: input.teacherId,
            classTitle: target.title,
            teacherName: target.teacherDisplayName ?? target.teacherName ?? null,
            isDuplicate: duplicate,
            hasTeacherConflict: false
          })
          if (duplicate) {
            excludedItems.push({
              kind: "duplicate",
              specificDate: dateText,
              startTime: slot.startTime,
              endTime: slot.endTime,
              capacity: slot.capacity,
              message: "같은 수업, 날짜, 시작 시간의 기존 일정이 있어 생성에서 제외됩니다."
            })
          }
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    return {
      totalCalculatedCount: items.length,
      creatableCount: items.filter((item) => !item.isDuplicate).length,
      duplicateCount: items.filter((item) => item.isDuplicate).length,
      teacherConflictCount: 0,
      excludedItems,
      items
    } satisfies BulkCreateClassSchedulesPreview
  },
  async bulkCreateClassSchedules(input: BulkCreateClassSchedulesInput) {
    const preview = await this.previewBulkCreateClassSchedules(input)
    const target = classes.find((item) => item.id === input.classId)
    if (!target) {
      throw new Error("studio_class_not_found_or_forbidden")
    }

    const seriesId = `series-${Date.now()}`
    const insertedScheduleIds: string[] = []
    preview.items
      .filter((item) => !item.isDuplicate)
      .forEach((item, index) => {
        const id = `class-schedule-${Date.now()}-${index}`
        insertedScheduleIds.push(id)
        target.schedules = [
          ...(target.schedules ?? []),
          {
            id,
            scheduleType: "one_time",
            bookingStatus: "open",
            dayOfWeek: null,
            specificDate: item.specificDate,
            seriesId,
            startTime: item.startTime,
            endTime: item.endTime,
            capacity: item.capacity,
            displayLabel: null,
            sortOrder: (target.schedules?.length ?? 0) + index,
            applicationCount: 0,
            isReferencedByApplications: false
          }
        ]
      })

    return {
      insertedCount: insertedScheduleIds.length,
      skippedDuplicateCount: preview.duplicateCount,
      teacherConflictCount: preview.teacherConflictCount,
      seriesId,
      insertedScheduleIds
    } satisfies BulkCreateClassSchedulesResult
  },
  async listMyApplications(parentId) {
    return applications
      .filter((item) => item.parentId === parentId)
      .map((item) => {
        const classItem = classes.find((classRow) => classRow.id === item.classId) ?? null

        return {
          id: item.id,
          classId: item.classId,
          classTitle: item.classTitle,
          classProgramType: item.classProgramType,
          academyName:
            [mockOrganizationLocation.name, mockOrganizationLocation.branchName]
              .filter(Boolean)
              .join(" ")
              .trim() || null,
          teacherDisplayName:
            classItem?.teacherDisplayName ?? classItem?.teacherName ?? item.assignedTeacherName ?? null,
          organizationAddress: mockOrganizationLocation.address ?? null,
          organizationAddressDetail: mockOrganizationLocation.addressDetail ?? null,
          parentId: item.parentId,
          childName: item.childName,
          childGrade: item.childGrade,
          parentName: item.parentName,
          parentPhone: item.parentPhone,
          classScheduleId: item.classScheduleId ?? null,
          requestedScheduleBlockId: item.requestedScheduleBlockId,
          selectedScheduleLabel: item.selectedScheduleLabel ?? null,
          requestedSlotAt: item.requestedSlotAt,
          confirmedSlotAt: item.confirmedSlotAt,
          registrationStatus: item.registrationStatus ?? null,
          status: item.status,
          goalType: item.goalType,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  async listStudioApplications(organizationId, options: StudioApplicationListOptions = {}) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return applications
      .filter((item) => {
        if (options.teacherId && item.assignedTeacherId !== options.teacherId) {
          return false
        }

        if (options.createdAtFrom && item.createdAt < options.createdAtFrom) {
          return false
        }

        if (options.createdAtTo && item.createdAt > options.createdAtTo) {
          return false
        }

        return true
      })
      .map((item) => {
        const classItem = classes.find((classRow) => classRow.id === item.classId)
        const classSchedule = classItem?.schedules?.find(
          (schedule) => schedule.id === item.classScheduleId
        )
        const mapped: StudioApplicationSummary = {
          ...item,
          classSubject: classItem?.subject ?? null,
          classRegion: formatAdministrativeRegionLabel(mockOrganizationLocation),
          // mock 은 예약 블록 시각을 따로 갖지 않는다. confirmedSlotAt / 수업 길이로만 판정된다.
          confirmedBlockStartAt: null,
          confirmedBlockEndAt: null,
          scheduleStartTime: classSchedule?.startTime ?? null,
          scheduleEndTime: classSchedule?.endTime ?? null,
          assignedTeacherId: item.assignedTeacherId ?? null,
          assignedTeacherName: getTeacherDisplayNameById(item.assignedTeacherId),
          registrationStatus:
            "registrationStatus" in item ? item.registrationStatus ?? "undecided" : "undecided"
        }

        return mapped
      })
      // supabase adapter 와 같은 정렬이어야 한다: created_at desc, 동률이면 id desc.
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.id < b.id
            ? 1
            : -1
          : a.createdAt < b.createdAt
            ? 1
            : -1
      )
  },
  async listStudioUnregisteredApplications(
    organizationId,
    options: StudioUnregisteredListOptions = {}
  ) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    return applications
      .filter((item) => {
        if (item.status !== "completed") {
          return false
        }

        if (item.registrationStatus === "enrolled") {
          return false
        }

        if (options.teacherId && item.assignedTeacherId !== options.teacherId) {
          return false
        }

        const completedAt = item.completedAt ?? item.updatedAt

        if (options.completedAtFrom && completedAt < options.completedAtFrom) {
          return false
        }

        if (options.completedAtTo && completedAt > options.completedAtTo) {
          return false
        }

        return true
      })
      .map((item) => {
        const classItem = classes.find((classRow) => classRow.id === item.classId)
        const latestApplicationLogNote =
          applicationLogs
            .filter((log) => log.applicationId === item.id && log.note?.trim())
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]?.note ?? null

        const mapped: StudioUnregisteredApplicationItem = {
          id: item.id,
          childName: item.childName,
          childGrade: item.childGrade,
          parentName: item.parentName ?? null,
          parentPhone: item.parentPhone ?? null,
          classTitle: classItem?.title ?? null,
          classSubject: classItem?.subject ?? null,
          assignedTeacherId: item.assignedTeacherId ?? null,
          assignedTeacherName: getTeacherDisplayNameById(item.assignedTeacherId),
          completedAt: item.completedAt ?? item.updatedAt,
          registrationStatus: item.registrationStatus ?? null,
          consultationNote: item.consultationNote ?? null,
          followUpNote: item.followUpNote ?? null,
          latestApplicationLogNote
        }

        return mapped
      })
      .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
  },
  async getStudioUnregisteredActionRequiredCount(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return 0
    }

    return applications.filter((item) => {
      if (item.status !== "completed") {
        return false
      }

      return item.registrationStatus == null || item.registrationStatus === "pending" || item.registrationStatus === "undecided"
    }).length
  },
  async listStudioConsultationPipelineApplications(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return []
    }

    const validRegistrationStatuses: ApplicationRegistrationStatus[] = [
      "undecided",
      "pending",
      "enrolled",
      "not_enrolled"
    ]

    return applications
      .filter(
        (item) =>
          item.status === "completed" &&
          validRegistrationStatuses.includes(item.registrationStatus as ApplicationRegistrationStatus)
      )
      .map((item) => {
        const classItem = classes.find((classRow) => classRow.id === item.classId) ?? null
        const itemConsultationLogs = consultationLogs
          .filter((log) => log.applicationId === item.id)
          .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
        const consultationOnlyLogs = itemConsultationLogs.filter(
          (log) => log.activityType === "CONSULTATION"
        )
        const hasAnyConsultationHistory = itemConsultationLogs.some(
          (log) => log.activityType === "CONSULTATION" || log.activityType === "LEGACY_IMPORT"
        )
        const legacyImportExists = itemConsultationLogs.some(
          (log) => log.activityType === "LEGACY_IMPORT"
        )
        const latestConsultation = consultationOnlyLogs[0] ?? null

        const mapped: StudioConsultationPipelineApplicationItem = {
          id: item.id,
          childName: item.childName,
          childGrade: item.childGrade,
          parentName: item.parentName ?? null,
          parentPhone: item.parentPhone ?? null,
          classTitle: classItem?.title ?? null,
          classSubject: classItem?.subject ?? null,
          registrationStatus: item.registrationStatus as ApplicationRegistrationStatus,
          completedAt: item.completedAt ?? item.updatedAt,
          nextContactAt: item.nextContactAt ?? null,
          lastActivityAt: item.lastActivityAt ?? null,
          enrolledAt: item.enrolledAt ?? null,
          lostAt: item.lostAt ?? null,
          unregisteredReason: item.unregisteredReason ?? null,
          unregisteredReasonNote: item.unregisteredReasonNote ?? null,
          assignedTeacherId: item.assignedTeacherId ?? null,
          assignedTeacherName: getTeacherDisplayNameById(item.assignedTeacherId),
          trialResultExists: trialResults.some((trialResult) => trialResult.applicationId === item.id),
          consultationCount: consultationOnlyLogs.length,
          hasAnyConsultationHistory,
          legacyImportExists,
          latestConsultationOccurredAt: latestConsultation?.occurredAt ?? null,
          latestConsultationChannel: latestConsultation?.channel ?? null,
          latestConsultationSentiment: latestConsultation?.sentiment ?? null,
          latestConsultationNote: latestConsultation?.note ?? null,
          latestConsultationCreatedBy: latestConsultation?.createdBy ?? null,
          latestConsultationCreatedByName: getProfileDisplayNameById(
            latestConsultation?.createdBy ?? null
          ),
          pipelineGroup: "NEEDS_CONSULTATION"
        }

        return {
          ...mapped,
          pipelineGroup: getConsultationPipelineGroup(mapped)
        }
      })
  },
  async getStudioConsultationPipelineActiveCount(organizationId) {
    if (organizationId !== mockOrganizationId) {
      return 0
    }

    return applications.filter((item) => {
      if (item.status !== "completed") {
        return false
      }

      return item.registrationStatus === "pending" || item.registrationStatus === "undecided"
    }).length
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
    const classSchedule = classItem?.schedules?.find(
      (schedule) => schedule.id === application.classScheduleId
    )
    const logs = applicationLogs
      .filter((item) => item.applicationId === applicationId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const itemConsultationLogs = consultationLogs
      .filter((item) => item.applicationId === applicationId)
      .map((item) => ({
        ...item,
        sentiment: item.sentiment ?? null,
        registrationStatusSnapshot: item.registrationStatusSnapshot ?? null,
        updatedAt: item.updatedAt ?? item.createdAt
      }))
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    const trialResult = trialResults.find((item) => item.applicationId === applicationId) ?? null

    const detail: StudioApplicationDetail = {
      ...application,
      classSubject: "classSubject" in application ? application.classSubject : classItem?.subject ?? null,
      classRegion:
        "classRegion" in application
          ? application.classRegion
          : formatAdministrativeRegionLabel(mockOrganizationLocation),
      // mock 은 예약 블록 종료 시각을 따로 갖지 않는다. 2순위(수업 길이)로만 판정된다.
      confirmedBlockStartAt: null,
      confirmedBlockEndAt: null,
      scheduleStartTime: classSchedule?.startTime ?? null,
      scheduleEndTime: classSchedule?.endTime ?? null,
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
      nextContactAt: "nextContactAt" in application ? application.nextContactAt ?? null : null,
      lastActivityAt: "lastActivityAt" in application ? application.lastActivityAt ?? null : null,
      memo: "memo" in application ? application.memo ?? null : null,
      trialResult,
      consultationLogs: itemConsultationLogs,
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
      if (input.currentStatus === "new") {
        target.contactedAt = nowIso
      }

      const assignedTeacherId = target.assignedTeacherId ?? null

      if (target.requestedScheduleBlockId) {
        target.confirmedSlotAt = target.requestedSlotAt
        if (!assignedTeacherId) {
          target.confirmedScheduleBlockId = null
        } else {
          target.confirmedScheduleBlockId = target.requestedScheduleBlockId
        }
      } else if (target.classScheduleId) {
        const classItem = classes.find((item) => item.id === target.classId)
        const schedule = classItem?.schedules?.find((item) => item.id === target.classScheduleId) ?? null

        if (!schedule) {
          throw new Error("failed_to_prepare_application_status_update")
        }

        const occurrence = resolveRequestedClassScheduleOccurrence({
          requestedSlotAt: target.requestedSlotAt,
          startTime: schedule.startTime,
          endTime: schedule.endTime
        })
        if (!occurrence) {
          throw new Error("invalid_requested_class_schedule_occurrence")
        }

        target.confirmedSlotAt = occurrence.startAt
        if (!assignedTeacherId) {
          target.confirmedScheduleBlockId = null
        } else {
          const existingBlocks = scheduleBlocks.filter(
            (slot) =>
              slot.classId === target.classId &&
              slot.teacherId === assignedTeacherId &&
              slot.startAt === occurrence.startAt &&
              slot.endAt === occurrence.endAt
          )
          const availableBlock = existingBlocks.find((slot) => slot.type === "available") ?? null

          if (!availableBlock && existingBlocks.length > 0) {
            throw new Error("schedule_block_conflict_for_requested_occurrence")
          }

          let resolvedBlock = availableBlock
          if (!resolvedBlock) {
            resolvedBlock = {
              id: `slot-${scheduleBlocks.length + 1}`,
              teacherId: assignedTeacherId,
              classId: target.classId,
              type: "available",
              startAt: occurrence.startAt,
              endAt: occurrence.endAt,
              capacity: Math.max(1, schedule.capacity ?? 1),
              appliedCount: 0,
              remainingCount: Math.max(1, schedule.capacity ?? 1),
              isClosed: false
            }
            scheduleBlocks.push(resolvedBlock)
          }

          target.requestedScheduleBlockId = resolvedBlock.id
          target.confirmedScheduleBlockId = resolvedBlock.id
        }
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
      actorName: input.actorId === mockStudioActorProfileId ? "테스트 선생님" : null,
      note: input.note,
      createdAt: new Date().toISOString()
    })
  },
  async updateStudioApplicationOutcome(input: UpdateStudioApplicationOutcomeInput) {
    const target = applications.find((item) => item.id === input.applicationId)

    if (!target) {
      throw new Error("application_not_found_or_forbidden")
    }

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

    target.consultationNote = input.consultationNote
    if (!canEditBeforeCompleted) {
      target.trialFeedback = input.trialFeedback
      target.registeredCourse = input.registeredCourse
      target.finalLevel = input.finalLevel
      target.finalSchedule = input.finalSchedule
      target.followUpNote = input.followUpNote
      target.registrationStatus = input.registrationStatus
      target.enrolledAt = input.registrationStatus === "enrolled" ? new Date().toISOString() : null
      target.unregisteredReason =
        input.registrationStatus === "not_enrolled" ? input.unregisteredReason : null
      target.unregisteredReasonNote =
        input.registrationStatus === "not_enrolled" && input.unregisteredReason === "other"
          ? input.unregisteredReasonNote
          : null
      target.lostAt =
        input.registrationStatus === "not_enrolled"
          ? input.previousRegistrationStatus === "not_enrolled"
            ? input.previousLostAt
            : new Date().toISOString()
          : null
    }
    target.updatedAt = new Date().toISOString()

    applicationLogs.unshift({
      id: `log-${applicationLogs.length + 1}`,
      applicationId: input.applicationId,
      fromStatus: input.currentStatus,
      toStatus: input.currentStatus,
      actorId: input.actorId,
      actorName: input.actorId === mockStudioActorProfileId ? "테스트 선생님" : null,
      note: input.note,
      createdAt: new Date().toISOString()
    })
  },
  async updateStudioApplicationConsultationSnapshot(
    input: UpdateStudioApplicationConsultationSnapshotInput
  ) {
    const target = applications.find(
      (item) => item.id === input.applicationId && item.status === input.currentStatus
    )

    if (!target) {
      throw new Error("application_consultation_snapshot_conflict")
    }

    target.nextContactAt = input.nextContactAt
    target.lastActivityAt = input.lastActivityAt
    target.updatedAt = input.lastActivityAt
    applyRegularSchedulePreferenceWrite(target, input.regularSchedulePreferenceWrite)
  },
  async createStudioConsultationLog(input: CreateStudioConsultationLogInput) {
    const existing = consultationLogs.find((item) => item.id === input.id)
    if (existing) {
      if (existing.applicationId !== input.applicationId) {
        throw new Error("failed_to_create_consultation_log")
      }

      return "duplicate"
    }

    consultationLogs.unshift({
      id: input.id,
      applicationId: input.applicationId,
      occurredAt: input.occurredAt,
      activityType: input.activityType,
      channel: input.channel,
      sentiment: input.sentiment,
      registrationStatusSnapshot: input.registrationStatusSnapshot,
      regularSchedulePreferenceSnapshot: input.regularSchedulePreferenceSnapshot,
      regularSchedulePreferenceNoteSnapshot: input.regularSchedulePreferenceNoteSnapshot,
      unregisteredReasonSnapshot: input.unregisteredReasonSnapshot,
      unregisteredReasonNoteSnapshot: input.unregisteredReasonNoteSnapshot,
      nextAction: input.nextAction,
      nextContactAt: input.nextContactAt,
      note: input.note,
      createdBy: input.actorId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt
    })

    return "created"
  },
  async createStudioConsultationTransaction(input: CreateStudioConsultationTransactionInput) {
    // in-memory 라 원자성은 구조적으로 보장된다. supabase 함수와 같은 순서·같은 판정을 쓴다.
    const target = applications.find((item) => item.id === input.applicationId)
    if (!target) {
      throw new Error("application_not_found_or_forbidden")
    }

    // 멱등 확인이 상태 guard 보다 먼저다(commit 됐지만 응답이 유실된 재시도).
    const existing = consultationLogs.find((item) => item.id === input.submissionId)
    if (existing) {
      if (existing.applicationId !== input.applicationId) {
        throw new Error("consultation_submission_conflict")
      }

      return {
        mode: "duplicate" as const,
        outcomeUpdated: false,
        enrollmentTransition: false,
        registrationStatus: target.registrationStatus
      }
    }

    if (target.status !== "completed") {
      throw new Error("application_not_completed")
    }

    if (target.registrationStatus === "enrolled" || target.registrationStatus === "not_enrolled") {
      throw new Error("application_registration_terminal")
    }

    const now = new Date().toISOString()
    const reason = input.registrationStatus === "not_enrolled" ? input.unregisteredReason : null
    const reasonNote =
      input.registrationStatus === "not_enrolled" && input.unregisteredReason === "other"
        ? input.unregisteredReasonNote
        : null
    const outcomeUpdated =
      target.registrationStatus !== input.registrationStatus ||
      target.unregisteredReason !== reason ||
      target.unregisteredReasonNote !== reasonNote

    if (outcomeUpdated) {
      target.registrationStatus = input.registrationStatus
      target.enrolledAt = input.registrationStatus === "enrolled" ? now : null
      // 위 종결 guard 를 지났으므로 이전 상태는 undecided | pending 이다.
      // "이미 미등록이던 Case 의 lost_at 유지" 분기는 여기서 도달할 수 없다.
      target.lostAt = input.registrationStatus === "not_enrolled" ? now : null
      target.unregisteredReason = reason
      target.unregisteredReasonNote = reasonNote
    }

    if (input.preferenceProvided) {
      const changed =
        JSON.stringify(target.regularSchedulePreference ?? null) !==
          JSON.stringify(input.preference ?? null) ||
        target.regularSchedulePreferenceNote !== input.preferenceNote
      target.regularSchedulePreference = input.preference
      target.regularSchedulePreferenceNote = input.preferenceNote
      if (changed) {
        target.regularSchedulePreferenceUpdatedAt = now
      }
    }

    target.nextContactAt = input.nextContactAt
    target.lastActivityAt = input.occurredAt
    target.updatedAt = now

    consultationLogs.unshift({
      id: input.submissionId,
      applicationId: input.applicationId,
      occurredAt: input.occurredAt,
      activityType: "CONSULTATION",
      channel: input.channel,
      sentiment: input.sentiment,
      registrationStatusSnapshot: input.registrationStatus,
      regularSchedulePreferenceSnapshot: target.regularSchedulePreference,
      regularSchedulePreferenceNoteSnapshot: target.regularSchedulePreferenceNote,
      unregisteredReasonSnapshot: reason,
      unregisteredReasonNoteSnapshot: reasonNote,
      nextAction: input.nextAction,
      nextContactAt: input.nextContactAt,
      note: input.note,
      createdBy: mockStudioActorProfileId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt
    })

    if (outcomeUpdated) {
      applicationLogs.unshift({
        id: `log-${applicationLogs.length + 1}`,
        applicationId: input.applicationId,
        fromStatus: target.status,
        toStatus: target.status,
        actorId: mockStudioActorProfileId,
        actorName: "테스트 선생님",
        note: input.outcomeNote,
        createdAt: now
      })
    }

    return {
      mode: "created" as const,
      outcomeUpdated,
      enrollmentTransition: outcomeUpdated && input.registrationStatus === "enrolled",
      registrationStatus: target.registrationStatus
    }
  },
  async updateStudioConsultationLog(input: UpdateStudioConsultationLogInput) {
    const target = consultationLogs.find(
      (item) =>
        item.id === input.consultationLogId &&
        item.applicationId === input.applicationId &&
        item.activityType === "CONSULTATION"
    )

    if (!target) {
      throw new Error("consultation_log_update_conflict")
    }

    target.channel = input.channel
    target.sentiment = input.sentiment
    target.note = input.note
    target.nextContactAt = input.nextContactAt
    // 전달되지 않으면 기존 스냅샷을 그대로 둔다(supabase adapter 와 같은 동작).
    if (input.regularSchedulePreferenceSnapshotWrite) {
      target.regularSchedulePreferenceSnapshot =
        input.regularSchedulePreferenceSnapshotWrite.preference
      target.regularSchedulePreferenceNoteSnapshot =
        input.regularSchedulePreferenceSnapshotWrite.note
    }
    target.updatedAt = new Date().toISOString()
  },
  async updateStudioApplicationLatestConsultationSnapshot(
    input: UpdateStudioApplicationLatestConsultationSnapshotInput
  ) {
    const target = applications.find(
      (item) => item.id === input.applicationId && item.status === input.currentStatus
    )

    if (!target) {
      throw new Error("application_consultation_snapshot_conflict")
    }

    target.nextContactAt = input.nextContactAt
    applyRegularSchedulePreferenceWrite(target, input.regularSchedulePreferenceWrite)
  },
  async getStudioTrialResultSaveContext(applicationId: string, organizationId: string) {
    if (organizationId !== mockOrganizationId) {
      return null
    }

    const application = applications.find((item) => item.id === applicationId)
    if (!application) {
      return null
    }

    const trialResult = trialResults.find((item) => item.applicationId === applicationId) ?? null

    return {
      status: application.status,
      trialResult: trialResult
        ? {
            observations: trialResult.observations,
            parentReaction: trialResult.parentReaction,
            recommendedCourse: trialResult.recommendedCourse,
            recommendedLevel: trialResult.recommendedLevel,
            recommendedSchedule: trialResult.recommendedSchedule,
            nextAction: trialResult.nextAction,
            note: trialResult.note
          }
        : null
    }
  },
  async upsertStudioTrialResult(input: UpsertStudioTrialResultInput) {
    const normalizedObservations = Array.from(new Set(input.observations.filter((item) => item.trim().length > 0)))
    const existing = trialResults.find((item) => item.applicationId === input.applicationId) ?? null
    const nowIso = new Date().toISOString()

    if (existing) {
      existing.observations = normalizedObservations
      existing.parentReaction = input.parentReaction
      existing.recommendedCourse = input.recommendedCourse
      existing.recommendedLevel = input.recommendedLevel
      existing.recommendedSchedule = input.recommendedSchedule
      existing.nextAction = input.nextAction
      existing.note = input.note
      existing.updatedAt = nowIso
      return "updated"
    }

    trialResults.push({
      id: `trial-result-${trialResults.length + 1}`,
      applicationId: input.applicationId,
      observations: normalizedObservations,
      parentReaction: input.parentReaction,
      recommendedCourse: input.recommendedCourse,
      recommendedLevel: input.recommendedLevel,
      recommendedSchedule: input.recommendedSchedule,
      nextAction: input.nextAction,
      note: input.note,
      createdBy: input.actorId,
      createdAt: nowIso,
      updatedAt: nowIso
    })

    return "created"
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

    if (matchedSlot.bookingStatus === "closed") {
      throw new Error("schedule_booking_closed")
    }

    if (matchedSlot.bookingStatus === "hidden") {
      throw new Error("schedule_booking_hidden")
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
    if (!classItem) {
      throw new Error("invalid_schedule_slot")
    }
    const created: TrialApplicationSummary = {
      id: `app-${applications.length + 1}`,
      classId: input.classId,
      classTitle: classItem?.title ?? null,
      classProgramType: classItem?.programType ?? null,
      academyName:
        [mockOrganizationLocation.name, mockOrganizationLocation.branchName]
          .filter(Boolean)
          .join(" ")
          .trim() || null,
      teacherDisplayName: classItem?.teacherDisplayName ?? classItem?.teacherName ?? null,
      organizationAddress: mockOrganizationLocation.address ?? null,
      organizationAddressDetail: mockOrganizationLocation.addressDetail ?? null,
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
      registrationStatus: null,
      status: "new",
      goalType: input.goalType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    applications.push({
      ...created,
      childId: input.childId ?? null,
      classSubject: classItem?.subject ?? null,
      classRegion: formatAdministrativeRegionLabel(mockOrganizationLocation),
      classAssignmentMode: classItem.assignmentMode,
      assignedTeacherId: classItem.assignmentMode === "preassigned" ? classItem.teacherId : null,
      assignedTeacherName:
        classItem.assignmentMode === "preassigned"
          ? (classItem?.teacherDisplayName ?? classItem?.teacherName ?? null)
          : null,
      childSchool: input.childSchool,
      childNotes: input.childNotes,
      subjectExperienceYn: input.subjectExperienceYn,
      subjectExperienceDuration: input.subjectExperienceDuration,
      currentLevel: input.currentLevel,
      preferredRegularSchedule: input.preferredRegularSchedule,
      // 체험 이후 상담에서 채워지는 값이라 신청 시점에는 비어 있다.
      regularSchedulePreference: null,
      regularSchedulePreferenceNote: null,
      regularSchedulePreferenceUpdatedAt: null,
      goalNote: input.goalNote,
      consultationNote: null,
      trialFeedback: null,
      finalLevel: null,
      finalSchedule: null,
      registrationStatus: "undecided" as ApplicationRegistrationStatus,
      registeredCourse: null,
      unregisteredReason: null as ApplicationUnregisteredReason | null,
      unregisteredReasonNote: null,
      lostAt: null,
      followUpNote: null,
      nextContactAt: null,
      lastActivityAt: null,
      contactedAt: null,
      scheduledAt: null,
      completedAt: null,
      canceledAt: null,
      noShowAt: null,
      enrolledAt: null,
      confirmedScheduleBlockId: null,
      memo: input.memo,
      trialResult: null,
      consultationLogs: [],
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
