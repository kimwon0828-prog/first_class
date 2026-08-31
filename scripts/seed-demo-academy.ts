import { randomUUID } from "node:crypto"

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"

import { GRADE_BANDS, SUBJECT_CATEGORIES, type GradeBandValue } from "../src/shared/constants/education-taxonomy"
import { DEFAULT_TEACHER_PUBLIC_VISIBILITY, toTeacherPublicVisibilityJson } from "../src/shared/lib/teacher-public-visibility"

type DemoRole = "academy" | "parent"
type DemoSubject = (typeof SUBJECT_CATEGORIES)[number]["value"]
type DemoProgramType = "trial_class" | "level_test"
type DemoAssignmentMode = "preassigned" | "post_assign"
type DemoApplicationStatus = "new" | "reviewing" | "confirmed" | "completed" | "canceled"
type DemoRegistrationStatus = "undecided" | "enrolled" | "not_enrolled" | "pending"
type DemoUnregisteredReason =
  | "schedule_mismatch"
  | "cost_burden"
  | "distance"
  | "child_reaction"
  | "comparing_other_academies"
  | "no_response"
  | "other"

type DemoFlags = {
  dryRun: boolean
  resumeApplications: boolean
  cleanupPartialApplications: boolean
}

type DemoTeacherKey = "kim-minji" | "park-jihoon" | "lee-seoyeon"
type DemoClassKey = "thinking-math" | "python-coding" | "english-level-test" | "robot-project"
type DemoParentKey = "parent-1" | "parent-2"

type DemoTeacherPlan = {
  key: DemoTeacherKey
  displayName: string
  phone: string
  subjects: string
  targetStudents: string
  specialties: string
  shortIntro: string
  teachingStyle: string
  intro: string
  linkedProfile: boolean
}

type DemoClassPlan = {
  key: DemoClassKey
  title: string
  teacherKey: DemoTeacherKey
  subject: DemoSubject
  programType: DemoProgramType
  assignmentMode: DemoAssignmentMode
  targetAge: string
  classFormat: string
  trialPrice: number
  description: string
  recommendedFor: string
  experiencePoints: string
  curriculum: string
  coverImageUrl: string
}

type DemoSchedulePlan = {
  classKey: DemoClassKey
  date: string
  startTime: string
  endTime: string
  capacity: number
  displayLabel: string
  sortOrder: number
  seriesId: string
}

type DemoApplicationPlan = {
  key: string
  classKey: DemoClassKey
  parentKey: DemoParentKey
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
  memo: string | null
  scheduleIndex: number
  status: DemoApplicationStatus
  registrationStatus: DemoRegistrationStatus
  wasReviewed: boolean
  wasConfirmed: boolean
  noShow: boolean
  consultationNote: string | null
  trialFeedback: string | null
  finalLevel: string | null
  finalSchedule: string | null
  registeredCourse: string | null
  unregisteredReason: DemoUnregisteredReason | null
  followUpNote: string | null
}

type DemoParentPlan = {
  key: DemoParentKey
  email: (typeof DEMO_PARENT_EMAILS)[number]
  name: string
  phone: string
}

type DemoAuthUserSeed = {
  email: string
  password: string
  role: DemoRole
  name: string
  phone: string | null
  userMetadata?: Record<string, string>
}

type DemoDatabaseIds = {
  organizationId: string
  academyUserId: string
  academyProfileId: string
  academyTeacherId: string
  teacherIds: Record<DemoTeacherKey, string>
  parentUserIds: Record<DemoParentKey, string>
  classIds: Record<DemoClassKey, string>
}

type DemoExistingState = {
  academyAuthUser: User | null
  parentAuthUsers: User[]
  organizationExists: boolean
  teacherSignupRequestExists: boolean
}

type DemoProfileRow = {
  id: string
  role: string
  organization_id: string | null
}

type DemoOrganizationRow = {
  id: string
  name: string
}

type DemoTeacherRow = {
  id: string
  profile_id: string | null
  organization_id: string
  display_name: string
}

type DemoClassRow = {
  id: string
  organization_id: string
  teacher_id: string | null
  title: string
}

type DemoResumeState = DemoDatabaseIds & {
  schedulesByClass: Map<DemoClassKey, InsertedClassScheduleRow[]>
  existingApplicationsCount: number
  existingLogsCount: number
}

type DemoCleanupApplicationRow = {
  id: string
  parent_id: string
  class_id: string
  child_name: string
  status: DemoApplicationStatus
  created_at: string
}

type DemoCleanupScheduleBlockRow = {
  id: string
  class_id: string | null
  teacher_id: string | null
  type: string
  start_at: string
  end_at: string
  related_application_id: string | null
}

type DemoCleanupState = {
  organizationId: string
  classIds: string[]
  applications: Array<
    DemoCleanupApplicationRow & {
      classTitle: string
    }
  >
  applicationLogsCount: number
  scheduleBlocks: DemoCleanupScheduleBlockRow[]
  scheduleBlocksLinkedToApplications: DemoCleanupScheduleBlockRow[]
  statusCounts: Record<DemoApplicationStatus, number>
}

type DemoApplicationDraft = {
  index: number
  plan: DemoApplicationPlan
  classId: string
  teacherId: string
  parentId: string
  matchedSchedule: InsertedClassScheduleRow
  selectedScheduleLabel: string
  requestedSlotAt: string
  requestedEndAt: string
  confirmedSlotAt: string | null
  createdAt: string
  contactedAt: string | null
  scheduledAt: string | null
  completedAt: string | null
  canceledAt: string | null
  noShowAt: string | null
  enrolledAt: string | null
}

type TeacherSignupRequestRow = {
  id: string
  user_id: string
  status: "pending" | "approved" | "rejected"
  approved_organization_id?: string | null
  approved_teacher_id?: string | null
}

type ClassScheduleInsertRow = {
  class_id: string
  schedule_type: "one_time"
  booking_status: "open"
  day_of_week: null
  specific_date: string
  start_time: string
  end_time: string
  capacity: number
  display_label: string
  sort_order: number
  series_id: string
}

type InsertedClassScheduleRow = {
  id: string
  class_id: string
  specific_date: string
  start_time: string
  end_time: string
  display_label: string | null
  capacity: number | null
}

type CreatedScheduleBlockRow = {
  id: string
  class_id: string | null
  teacher_id: string | null
  start_at: string
  end_at: string
}

type CreatedApplicationRow = {
  id: string
  parent_id: string
  class_id: string
  class_schedule_id: string | null
  requested_slot_at: string
  status: DemoApplicationStatus
}

const DEMO_ACADEMY_EMAIL = "demo@firstsuup.com"
const DEMO_PARENT_EMAILS = [
  "demo-parent1@firstsuup.com",
  "demo-parent2@firstsuup.com"
] as const
const DEMO_PARENTS: DemoParentPlan[] = [
  {
    key: "parent-1",
    email: DEMO_PARENT_EMAILS[0],
    name: "데모 보호자 1",
    phone: "010-9100-0001"
  },
  {
    key: "parent-2",
    email: DEMO_PARENT_EMAILS[1],
    name: "데모 보호자 2",
    phone: "010-9100-0002"
  }
]
const DEMO_ORGANIZATION_NAME = "첫수업 데모학원"
const DEMO_BRANCH_NAME = "본원"
const DEMO_ORGANIZATION_PHONE = "02-555-1100"
const DEMO_ORGANIZATION_ADDRESS = "경기도 고양시 일산동구 정발산로 24"
const DEMO_ORGANIZATION_ADDRESS_DETAIL = "데모빌딩 5층"

const DEMO_CLASS_COVER_IMAGE_URLS = [
  "/images/partner/classes.jpg",
  "/images/partner/dashboard.jpg",
  "/images/partner/teachers.jpg",
  "/images/partner/schedule.jpg"
] as const

const DEMO_CLASS_FORMATS = [
  "1:1 개별수업",
  "개별진도 수업",
  "소수정예 수업",
  "그룹수업"
] as const

const STATUS_ACTION_NOTES = {
  reviewing: "teacher가 신청을 상담/확인 중 상태로 변경했습니다.",
  confirmed: "teacher가 체험 신청 일정을 확정했습니다.",
  completed: "teacher가 체험 진행 완료 처리했습니다.",
  canceled: "teacher가 신청을 취소 처리했습니다.",
  no_show: "teacher가 신청을 노쇼 처리했습니다."
} as const
const VALID_APPLICATION_STATUSES: DemoApplicationStatus[] = [
  "new",
  "reviewing",
  "confirmed",
  "completed",
  "canceled"
]
const VALID_REGISTRATION_STATUSES: DemoRegistrationStatus[] = [
  "undecided",
  "enrolled",
  "not_enrolled",
  "pending"
]
const DEMO_APPLICATION_LOG_DELETE_BEHAVIOR = "cascade" as const

const ACADEMY_PASSWORD_ENV = "DEMO_ACADEMY_PASSWORD"
const PARENT_PASSWORD_ENV = "DEMO_PARENT_PASSWORD"
const SERVICE_ROLE_ENV = "SUPABASE_SERVICE_ROLE_KEY"
const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL"
const CONFIRM_ENV = "DEMO_SEED_CONFIRM"
const DEMO_TEACHER_NAME_TO_KEY: Record<string, DemoTeacherKey> = {
  김민지: "kim-minji",
  박지훈: "park-jihoon",
  이서연: "lee-seoyeon"
}
const DEMO_CLASS_TITLE_TO_KEY: Record<string, DemoClassKey> = {
  "초등 사고력수학 체험수업": "thinking-math",
  "파이썬 코딩 입문 체험수업": "python-coding",
  "초등 영어 레벨테스트": "english-level-test",
  "로봇·과학 프로젝트 체험수업": "robot-project"
}

const gradeBandValue = (index: number): GradeBandValue => GRADE_BANDS[index].value

const DEMO_TEACHERS: DemoTeacherPlan[] = [
  {
    key: "kim-minji",
    displayName: "김민지",
    phone: "010-9000-1001",
    subjects: "사고력수학",
    targetStudents: "초1~4 학생",
    specialties: "연산보다 사고과정 설명, 교구 기반 문제해결",
    shortIntro: "질문으로 사고 과정을 끌어내는 사고력수학 전문 선생님",
    teachingStyle: "학생이 풀이 과정을 직접 설명하도록 이끌고 작은 성취를 바로 피드백합니다.",
    intro:
      "초등 저학년과 중학년 학생이 수학을 어렵지 않게 시작하도록 돕는 사고력수학 전문 선생님입니다. 교구와 게임형 문제를 활용해 학생이 스스로 원리를 설명하도록 수업을 운영합니다.",
    linkedProfile: true
  },
  {
    key: "park-jihoon",
    displayName: "박지훈",
    phone: "010-9000-1002",
    subjects: "코딩·로봇·과학",
    targetStudents: "초3~6 학생",
    specialties: "파이썬 입문, 센서/로봇 프로젝트, 메이킹 활동",
    shortIntro: "프로젝트로 몰입도를 높이는 코딩·로봇 수업 담당 선생님",
    teachingStyle: "완성 결과물을 빠르게 만들고, 이후 개념을 단계적으로 연결하는 실습 중심 수업을 진행합니다.",
    intro:
      "코딩이 처음인 학생도 결과물을 만들며 자신감을 얻을 수 있도록 지도합니다. 파이썬 기초부터 로봇 센서 제어, 간단한 과학 프로젝트까지 실습 중심으로 진행합니다.",
    linkedProfile: false
  },
  {
    key: "lee-seoyeon",
    displayName: "이서연",
    phone: "010-9000-1003",
    subjects: "영어",
    targetStudents: "초1~6 학생",
    specialties: "레벨 진단, 파닉스-리딩 브릿지, 말하기 루틴 설계",
    shortIntro: "현재 실력을 빠르게 진단하고 다음 학습 방향을 제안하는 영어 선생님",
    teachingStyle: "학생의 반응을 세밀하게 관찰해 레벨을 진단하고, 다음 학습 루트를 구체적으로 안내합니다.",
    intro:
      "영어 레벨테스트와 초기 학습 상담을 주로 담당합니다. 학생의 읽기, 듣기, 말하기 반응을 함께 살피며 이후 추천 과정과 학습 계획을 제안합니다.",
    linkedProfile: false
  }
]

const DEMO_CLASSES: DemoClassPlan[] = [
  {
    key: "thinking-math",
    title: "초등 사고력수학 체험수업",
    teacherKey: "kim-minji",
    subject: "thinking_math",
    programType: "trial_class",
    assignmentMode: "preassigned",
    targetAge: [gradeBandValue(0), gradeBandValue(1)].join(","),
    classFormat: DEMO_CLASS_FORMATS[2],
    trialPrice: 10000,
    description:
      "도형, 규칙, 수 감각 활동을 통해 사고 과정을 말로 설명하는 힘을 길러보는 초등 사고력수학 체험수업입니다. 문제를 빨리 푸는 것보다 왜 그렇게 생각했는지 차근차근 말해보는 경험에 집중합니다.",
    recommendedFor:
      "수학을 싫어하지는 않지만 문제풀이에 자신감이 부족한 학생, 선행보다 사고력 기반 수업을 먼저 경험해보고 싶은 학부모님께 추천합니다.",
    experiencePoints:
      "교구를 활용해 규칙을 찾고, 친구들 앞에서 내 풀이를 설명하고, 선생님의 질문을 따라 생각을 확장하는 경험을 합니다.",
    curriculum:
      "1. 간단한 진단 문제로 현재 사고 과정을 확인합니다.\n2. 규칙 찾기와 도형 조작 활동으로 핵심 개념을 체험합니다.\n3. 풀이 설명 활동을 통해 사고력과 표현력을 함께 점검합니다.",
    coverImageUrl: DEMO_CLASS_COVER_IMAGE_URLS[0]
  },
  {
    key: "python-coding",
    title: "파이썬 코딩 입문 체험수업",
    teacherKey: "park-jihoon",
    subject: "coding_robot_science",
    programType: "trial_class",
    assignmentMode: "preassigned",
    targetAge: [gradeBandValue(1), gradeBandValue(2)].join(","),
    classFormat: DEMO_CLASS_FORMATS[1],
    trialPrice: 15000,
    description:
      "파이썬이 처음인 학생이 직접 화면에 결과를 띄워보며 코딩의 재미를 느껴보는 입문 체험수업입니다. 복잡한 이론보다 입력, 반복, 조건문을 작은 프로젝트 안에서 자연스럽게 익힙니다.",
    recommendedFor:
      "코딩 학원을 처음 알아보는 초등 3~6학년, 블록코딩 이후 텍스트 코딩으로 넘어갈 준비가 된 학생에게 적합합니다.",
    experiencePoints:
      "직접 코드를 작성해 이름표 프로그램을 만들고, 간단한 미션을 해결하며 코딩이 어떻게 동작하는지 체감합니다.",
    curriculum:
      "1. 파이썬 화면과 기본 문법을 익힙니다.\n2. 입력과 출력, 조건문을 이용한 미니 프로그램을 만듭니다.\n3. 학생 수준에 맞는 다음 학습 루트를 제안합니다.",
    coverImageUrl: DEMO_CLASS_COVER_IMAGE_URLS[1]
  },
  {
    key: "english-level-test",
    title: "초등 영어 레벨테스트",
    teacherKey: "lee-seoyeon",
    subject: "english",
    programType: "level_test",
    assignmentMode: "preassigned",
    targetAge: [gradeBandValue(0), gradeBandValue(1), gradeBandValue(2)].join(","),
    classFormat: DEMO_CLASS_FORMATS[0],
    trialPrice: 0,
    description:
      "학생의 현재 읽기, 듣기, 말하기 반응을 빠르게 확인해 가장 적합한 시작 레벨을 제안하는 초등 영어 레벨테스트입니다. 테스트 결과는 이후 추천 과정과 함께 안내됩니다.",
    recommendedFor:
      "영어 학원을 처음 시작하려는 학생, 현재 실력에 맞는 반을 정확하게 배정받고 싶은 학부모님께 추천합니다.",
    experiencePoints:
      "간단한 파닉스, 단어 읽기, 문장 이해, 짧은 말하기 활동을 통해 현재 강점과 보완점을 확인합니다.",
    curriculum:
      "1. 파닉스와 기초 리딩 반응을 확인합니다.\n2. 간단한 듣기와 말하기 질문으로 실사용 능력을 점검합니다.\n3. 추천 반, 시작 교재, 학습 포인트를 정리해 안내합니다.",
    coverImageUrl: DEMO_CLASS_COVER_IMAGE_URLS[2]
  },
  {
    key: "robot-project",
    title: "로봇·과학 프로젝트 체험수업",
    teacherKey: "park-jihoon",
    subject: "coding_robot_science",
    programType: "trial_class",
    assignmentMode: "preassigned",
    targetAge: [gradeBandValue(1), gradeBandValue(2)].join(","),
    classFormat: DEMO_CLASS_FORMATS[3],
    trialPrice: 20000,
    description:
      "센서와 간단한 코드를 연결해 움직이는 결과물을 만들어보는 로봇·과학 프로젝트 체험수업입니다. 실험과 제작을 좋아하는 학생이 몰입하기 좋은 프로그램입니다.",
    recommendedFor:
      "만들기와 실험을 좋아하는 학생, 코딩과 과학을 함께 경험해보고 싶은 초등 고학년에게 추천합니다.",
    experiencePoints:
      "센서를 연결하고, 로봇의 반응을 조절하고, 완성된 결과물을 친구들과 함께 테스트하는 과정을 경험합니다.",
    curriculum:
      "1. 오늘 만들 프로젝트와 장비를 소개합니다.\n2. 센서/모터를 연결하고 기본 동작을 테스트합니다.\n3. 학생 수준에 맞춰 다음 프로젝트 수업을 안내합니다.",
    coverImageUrl: DEMO_CLASS_COVER_IMAGE_URLS[3]
  }
]

const DEMO_APPLICATIONS: DemoApplicationPlan[] = [
  {
    key: "app-01",
    classKey: "thinking-math",
    parentKey: "parent-1",
    childName: "한결",
    childGrade: "elem_2",
    parentName: "데모 보호자 1",
    parentPhone: "010-9100-0001",
    childSchool: "첫수업초",
    childNotes: "수학은 좋아하지만 풀이를 설명하는 데 어려움이 있어요.",
    subjectExperienceYn: true,
    subjectExperienceDuration: "6개월",
    currentLevel: "기본 연산은 가능",
    preferredRegularSchedule: "평일 오후 4시 이후",
    goalType: "흥미 형성",
    goalNote: "수학 자신감을 키우는 것이 우선입니다.",
    memo: "상담 전 기본 메모",
    scheduleIndex: 0,
    status: "new",
    registrationStatus: "undecided",
    wasReviewed: false,
    wasConfirmed: false,
    noShow: false,
    consultationNote: null,
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-02",
    classKey: "python-coding",
    parentKey: "parent-2",
    childName: "수아",
    childGrade: "elem_4",
    parentName: "데모 보호자 2",
    parentPhone: "010-9100-0002",
    childSchool: "미래초",
    childNotes: "블록코딩 경험이 조금 있어요.",
    subjectExperienceYn: true,
    subjectExperienceDuration: "3개월",
    currentLevel: "스크래치 경험 있음",
    preferredRegularSchedule: "토요일 오전",
    goalType: "진로 탐색",
    goalNote: "코딩 흥미를 이어갈 수 있는지 확인하고 싶습니다.",
    memo: null,
    scheduleIndex: 0,
    status: "new",
    registrationStatus: "undecided",
    wasReviewed: false,
    wasConfirmed: false,
    noShow: false,
    consultationNote: null,
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-03",
    classKey: "robot-project",
    parentKey: "parent-1",
    childName: "다온",
    childGrade: "elem_5",
    parentName: "데모 보호자 1",
    parentPhone: "010-9100-0001",
    childSchool: "창의초",
    childNotes: null,
    subjectExperienceYn: false,
    subjectExperienceDuration: null,
    currentLevel: null,
    preferredRegularSchedule: "주말 오후",
    goalType: "체험",
    goalNote: "과학 프로젝트 수업 반응을 보고 싶습니다.",
    memo: "형제가 함께 체험 예정",
    scheduleIndex: 1,
    status: "new",
    registrationStatus: "undecided",
    wasReviewed: false,
    wasConfirmed: false,
    noShow: false,
    consultationNote: null,
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-04",
    classKey: "thinking-math",
    parentKey: "parent-2",
    childName: "민서",
    childGrade: "elem_3",
    parentName: "데모 보호자 2",
    parentPhone: "010-9100-0002",
    childSchool: "데모초",
    childNotes: "학교 수학은 무난하지만 서술형이 약합니다.",
    subjectExperienceYn: true,
    subjectExperienceDuration: "1년",
    currentLevel: "초3 심화 시작",
    preferredRegularSchedule: "화/목 5시 이후",
    goalType: "보완",
    goalNote: "사고력 수학이 맞는지 확인하고 싶습니다.",
    memo: null,
    scheduleIndex: 1,
    status: "reviewing",
    registrationStatus: "undecided",
    wasReviewed: true,
    wasConfirmed: false,
    noShow: false,
    consultationNote: "현재는 연산보다 문제 해석 훈련이 더 필요해 보입니다.",
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-05",
    classKey: "english-level-test",
    parentKey: "parent-1",
    childName: "하율",
    childGrade: "elem_2",
    parentName: "데모 보호자 1",
    parentPhone: "010-9100-0001",
    childSchool: "한빛초",
    childNotes: "영어 학원은 처음입니다.",
    subjectExperienceYn: false,
    subjectExperienceDuration: null,
    currentLevel: "파닉스 시작",
    preferredRegularSchedule: "평일 저녁",
    goalType: "레벨 진단",
    goalNote: "적합한 반 배정을 원합니다.",
    memo: null,
    scheduleIndex: 0,
    status: "reviewing",
    registrationStatus: "undecided",
    wasReviewed: true,
    wasConfirmed: false,
    noShow: false,
    consultationNote: "기초 파닉스부터 리딩 연결이 필요해 보입니다.",
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-06",
    classKey: "python-coding",
    parentKey: "parent-1",
    childName: "준우",
    childGrade: "elem_5",
    parentName: "데모 보호자 1",
    parentPhone: "010-9100-0001",
    childSchool: "새빛초",
    childNotes: null,
    subjectExperienceYn: true,
    subjectExperienceDuration: "6개월",
    currentLevel: "엔트리 경험 있음",
    preferredRegularSchedule: "수요일 6시",
    goalType: "전환",
    goalNote: "텍스트 코딩 적응 가능성 확인",
    memo: null,
    scheduleIndex: 2,
    status: "confirmed",
    registrationStatus: "undecided",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: false,
    consultationNote: null,
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-07",
    classKey: "thinking-math",
    parentKey: "parent-2",
    childName: "지호",
    childGrade: "elem_2",
    parentName: "데모 보호자 2",
    parentPhone: "010-9100-0002",
    childSchool: "푸른초",
    childNotes: null,
    subjectExperienceYn: false,
    subjectExperienceDuration: null,
    currentLevel: null,
    preferredRegularSchedule: "평일 4시",
    goalType: "적응",
    goalNote: "처음 학원 수업이라 반응 확인 필요",
    memo: null,
    scheduleIndex: 2,
    status: "confirmed",
    registrationStatus: "undecided",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: false,
    consultationNote: null,
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-08",
    classKey: "english-level-test",
    parentKey: "parent-2",
    childName: "도윤",
    childGrade: "elem_4",
    parentName: "데모 보호자 2",
    parentPhone: "010-9100-0002",
    childSchool: "샘물초",
    childNotes: "영어 리딩은 가능하지만 말하기는 자신이 없습니다.",
    subjectExperienceYn: true,
    subjectExperienceDuration: "2년",
    currentLevel: "리딩 초급",
    preferredRegularSchedule: "토요일 오전",
    goalType: "레벨 진단",
    goalNote: "중급반 가능 여부 확인",
    memo: "테스트 후 상담 요청 예정",
    scheduleIndex: 1,
    status: "confirmed",
    registrationStatus: "undecided",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: false,
    consultationNote: null,
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-09",
    classKey: "robot-project",
    parentKey: "parent-1",
    childName: "유진",
    childGrade: "elem_6",
    parentName: "데모 보호자 1",
    parentPhone: "010-9100-0001",
    childSchool: "늘봄초",
    childNotes: "만들기 활동을 좋아합니다.",
    subjectExperienceYn: true,
    subjectExperienceDuration: "1개월",
    currentLevel: "기초 메이킹 경험",
    preferredRegularSchedule: "주말 오후",
    goalType: "흥미 확장",
    goalNote: "코딩과 과학을 함께 해보고 싶어합니다.",
    memo: null,
    scheduleIndex: 2,
    status: "confirmed",
    registrationStatus: "undecided",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: false,
    consultationNote: null,
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-10",
    classKey: "thinking-math",
    parentKey: "parent-1",
    childName: "서준",
    childGrade: "elem_3",
    parentName: "데모 보호자 1",
    parentPhone: "010-9100-0001",
    childSchool: "해솔초",
    childNotes: null,
    subjectExperienceYn: true,
    subjectExperienceDuration: "8개월",
    currentLevel: "응용 문제 풀이 가능",
    preferredRegularSchedule: "월/수 5시",
    goalType: "심화",
    goalNote: "사고력 심화반 진입 여부 확인",
    memo: null,
    scheduleIndex: 3,
    status: "completed",
    registrationStatus: "enrolled",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: false,
    consultationNote: "질문에 적극적으로 반응했고 사고 과정 설명이 좋았습니다.",
    trialFeedback: "체험 집중도가 높고 심화반 적응 가능성이 높습니다.",
    finalLevel: "사고력 중급",
    finalSchedule: "월/수 17:00",
    registeredCourse: "사고력수학 심화반",
    unregisteredReason: null,
    followUpNote: "다음 주부터 정규 등록 예정"
  },
  {
    key: "app-11",
    classKey: "python-coding",
    parentKey: "parent-2",
    childName: "예준",
    childGrade: "elem_5",
    parentName: "데모 보호자 2",
    parentPhone: "010-9100-0002",
    childSchool: "별빛초",
    childNotes: null,
    subjectExperienceYn: true,
    subjectExperienceDuration: "4개월",
    currentLevel: "기본 블록코딩 가능",
    preferredRegularSchedule: "금요일 6시",
    goalType: "전환",
    goalNote: "파이썬 반으로 넘어갈 수 있는지 확인",
    memo: null,
    scheduleIndex: 3,
    status: "completed",
    registrationStatus: "enrolled",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: false,
    consultationNote: "텍스트 코딩 전환에 대한 거부감이 적었습니다.",
    trialFeedback: "기본 문법 이해가 빠르고 과제 수행 속도가 좋았습니다.",
    finalLevel: "파이썬 입문 A",
    finalSchedule: "금요일 18:00",
    registeredCourse: "파이썬 입문 정규반",
    unregisteredReason: null,
    followUpNote: "결제 링크 안내 완료"
  },
  {
    key: "app-12",
    classKey: "english-level-test",
    parentKey: "parent-1",
    childName: "연우",
    childGrade: "elem_4",
    parentName: "데모 보호자 1",
    parentPhone: "010-9100-0001",
    childSchool: "한강초",
    childNotes: "단어 암기는 잘하지만 말하기 경험이 적습니다.",
    subjectExperienceYn: true,
    subjectExperienceDuration: "1년",
    currentLevel: "리딩 기초",
    preferredRegularSchedule: "토요일 오전",
    goalType: "반 배정",
    goalNote: "레벨테스트 후 반 추천 희망",
    memo: null,
    scheduleIndex: 2,
    status: "completed",
    registrationStatus: "enrolled",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: false,
    consultationNote: "리스닝보다 말하기에서 긴장하는 편입니다.",
    trialFeedback: "파닉스는 안정적이고 리딩 브릿지반이 적합합니다.",
    finalLevel: "리딩 브릿지",
    finalSchedule: "토요일 10:00",
    registeredCourse: "초등 리딩 브릿지반",
    unregisteredReason: null,
    followUpNote: "교재 안내 후 등록 완료"
  },
  {
    key: "app-13",
    classKey: "robot-project",
    parentKey: "parent-2",
    childName: "아린",
    childGrade: "elem_4",
    parentName: "데모 보호자 2",
    parentPhone: "010-9100-0002",
    childSchool: "라온초",
    childNotes: null,
    subjectExperienceYn: false,
    subjectExperienceDuration: null,
    currentLevel: null,
    preferredRegularSchedule: "토요일 오후",
    goalType: "흥미 확인",
    goalNote: "프로젝트형 수업 집중도 확인",
    memo: null,
    scheduleIndex: 3,
    status: "completed",
    registrationStatus: "pending",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: false,
    consultationNote: "수업 몰입도는 높았고 발표도 잘했습니다.",
    trialFeedback: "정규반 등록 의사는 있으나 다른 학원 일정도 비교 중입니다.",
    finalLevel: "프로젝트 입문",
    finalSchedule: "토요일 14:00",
    registeredCourse: "로봇 프로젝트 정규반",
    unregisteredReason: null,
    followUpNote: "다음 주 재상담 예정"
  },
  {
    key: "app-14",
    classKey: "thinking-math",
    parentKey: "parent-2",
    childName: "시윤",
    childGrade: "elem_1",
    parentName: "데모 보호자 2",
    parentPhone: "010-9100-0002",
    childSchool: "한결초",
    childNotes: "낯가림이 조금 있습니다.",
    subjectExperienceYn: false,
    subjectExperienceDuration: null,
    currentLevel: null,
    preferredRegularSchedule: "화요일 4시",
    goalType: "적응",
    goalNote: "수업 참여가 가능한지 먼저 확인",
    memo: null,
    scheduleIndex: 4,
    status: "completed",
    registrationStatus: "not_enrolled",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: false,
    consultationNote: "초반에는 긴장했지만 후반에는 참여도가 좋아졌습니다.",
    trialFeedback: "수업은 잘 들었으나 현재는 다른 방과후 일정과 시간이 겹칩니다.",
    finalLevel: "사고력 기초",
    finalSchedule: "화요일 16:00",
    registeredCourse: null,
    unregisteredReason: "schedule_mismatch",
    followUpNote: "겨울방학 특강 오픈 시 재안내"
  },
  {
    key: "app-15",
    classKey: "python-coding",
    parentKey: "parent-1",
    childName: "가온",
    childGrade: "elem_6",
    parentName: "데모 보호자 1",
    parentPhone: "010-9100-0001",
    childSchool: "은하초",
    childNotes: null,
    subjectExperienceYn: true,
    subjectExperienceDuration: "1년",
    currentLevel: "스크래치 심화 가능",
    preferredRegularSchedule: "주말 오전",
    goalType: "심화 전환",
    goalNote: "학기 중에는 바로 등록하지 않을 수도 있습니다.",
    memo: null,
    scheduleIndex: 4,
    status: "completed",
    registrationStatus: "undecided",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: false,
    consultationNote: "문제 해결 속도는 빠르지만 과제 지속성 확인이 더 필요합니다.",
    trialFeedback: "정규반 추천은 가능하지만 가족 논의 후 결정 예정입니다.",
    finalLevel: "파이썬 입문 A",
    finalSchedule: "토요일 11:00",
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: "3일 후 재연락 예정"
  },
  {
    key: "app-16",
    classKey: "english-level-test",
    parentKey: "parent-2",
    childName: "태린",
    childGrade: "elem_3",
    parentName: "데모 보호자 2",
    parentPhone: "010-9100-0002",
    childSchool: "가람초",
    childNotes: null,
    subjectExperienceYn: true,
    subjectExperienceDuration: "8개월",
    currentLevel: "파닉스 안정",
    preferredRegularSchedule: "수요일 5시",
    goalType: "레벨 진단",
    goalNote: "테스트 결과에 따라 정규반 여부 결정",
    memo: null,
    scheduleIndex: 3,
    status: "canceled",
    registrationStatus: "undecided",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: true,
    consultationNote: null,
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-17",
    classKey: "robot-project",
    parentKey: "parent-1",
    childName: "주원",
    childGrade: "elem_5",
    parentName: "데모 보호자 1",
    parentPhone: "010-9100-0001",
    childSchool: "예담초",
    childNotes: null,
    subjectExperienceYn: false,
    subjectExperienceDuration: null,
    currentLevel: null,
    preferredRegularSchedule: "토요일 오후",
    goalType: "프로젝트 체험",
    goalNote: "주말 일정 조정 후 다시 참여 가능 여부 확인",
    memo: null,
    scheduleIndex: 4,
    status: "canceled",
    registrationStatus: "undecided",
    wasReviewed: true,
    wasConfirmed: true,
    noShow: true,
    consultationNote: null,
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  },
  {
    key: "app-18",
    classKey: "thinking-math",
    parentKey: "parent-2",
    childName: "도하",
    childGrade: "elem_4",
    parentName: "데모 보호자 2",
    parentPhone: "010-9100-0002",
    childSchool: "시온초",
    childNotes: null,
    subjectExperienceYn: true,
    subjectExperienceDuration: "4개월",
    currentLevel: "응용 문제 적응 중",
    preferredRegularSchedule: "평일 저녁",
    goalType: "보완",
    goalNote: "학원 일정이 맞지 않으면 이번에는 보류 예정",
    memo: "상담 후 취소 가능성 높음",
    scheduleIndex: 5,
    status: "canceled",
    registrationStatus: "undecided",
    wasReviewed: true,
    wasConfirmed: false,
    noShow: false,
    consultationNote: null,
    trialFeedback: null,
    finalLevel: null,
    finalSchedule: null,
    registeredCourse: null,
    unregisteredReason: null,
    followUpNote: null
  }
]

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const parseFlags = (): DemoFlags => {
  const args = new Set(process.argv.slice(2))
  return {
    dryRun: args.has("--dry-run"),
    resumeApplications: args.has("--resume-applications"),
    cleanupPartialApplications: args.has("--cleanup-partial-applications")
  }
}

const readRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`)
  }
  return value ?? ""
}

const getServiceRoleClient = (): SupabaseClient => {
  const supabaseUrl = readRequiredEnv(SUPABASE_URL_ENV)
  const serviceRoleKey = readRequiredEnv(SERVICE_ROLE_ENV)

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

const formatDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const nextWeekdayFromToday = (weekday: number, weekOffset = 0) => {
  const today = new Date()
  const currentWeekday = today.getDay()
  const delta = (weekday - currentWeekday + 7) % 7
  const baseOffset = delta === 0 ? 7 : delta
  return addDays(today, baseOffset + weekOffset * 7)
}

const normalizeTimeForIso = (time: string) => {
  const parts = time.split(":")

  if (parts.length === 2) {
    return `${time}:00`
  }

  if (parts.length === 3) {
    return time
  }

  throw new Error(`지원하지 않는 시간 형식입니다: ${time}`)
}

const toKstIso = (date: string, time: string) => `${date}T${normalizeTimeForIso(time)}+09:00`

const addMinutesToTime = (time: string, minutesToAdd: number) => {
  const [hourRaw, minuteRaw] = time.split(":")
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const total = hour * 60 + minute + minutesToAdd
  const nextHour = Math.floor(total / 60)
  const nextMinute = total % 60
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`
}

const buildScheduleLabel = (date: string, startTime: string, endTime: string) =>
  `${date.replace(/-/g, ".")} ${startTime}~${endTime}`

const buildSchedulesByClassMap = (
  scheduleRows: InsertedClassScheduleRow[],
  classIds: Record<DemoClassKey, string>
) => {
  const scheduleMap = new Map<DemoClassKey, InsertedClassScheduleRow[]>()
  for (const key of DEMO_CLASSES.map((item) => item.key)) {
    scheduleMap.set(key, [])
  }

  for (const row of scheduleRows) {
    const classKey = DEMO_CLASSES.find((item) => classIds[item.key] === row.class_id)?.key
    if (!classKey) {
      continue
    }

    scheduleMap.get(classKey)?.push(row)
  }

  for (const item of scheduleMap.values()) {
    item.sort((left, right) => {
      const leftKey = `${left.specific_date ?? ""}-${left.start_time}`
      const rightKey = `${right.specific_date ?? ""}-${right.start_time}`
      return leftKey.localeCompare(rightKey)
    })
  }

  return scheduleMap
}

const buildSchedulePlans = (): DemoSchedulePlan[] => {
  const scheduleTemplates: Array<{
    classKey: DemoClassKey
    weekdays: [number, number]
    startTime: string
    durationMinutes: number
    capacity: number
  }> = [
    {
      classKey: "thinking-math",
      weekdays: [1, 4],
      startTime: "16:00",
      durationMinutes: 60,
      capacity: 2
    },
    {
      classKey: "python-coding",
      weekdays: [2, 5],
      startTime: "17:00",
      durationMinutes: 90,
      capacity: 3
    },
    {
      classKey: "english-level-test",
      weekdays: [3, 6],
      startTime: "10:00",
      durationMinutes: 40,
      capacity: 1
    },
    {
      classKey: "robot-project",
      weekdays: [6, 0],
      startTime: "14:00",
      durationMinutes: 90,
      capacity: 3
    }
  ]

  return scheduleTemplates.flatMap((template) => {
    const seriesId = randomUUID()
    return template.weekdays.flatMap((weekday, weekdayIndex) => {
      return Array.from({ length: 3 }, (_, weekOffset) => {
        const date = formatDate(nextWeekdayFromToday(weekday, weekOffset))
        const endTime = addMinutesToTime(template.startTime, template.durationMinutes)
        const sortOrder = weekdayIndex * 3 + weekOffset

        return {
          classKey: template.classKey,
          date,
          startTime: template.startTime,
          endTime,
          capacity: template.capacity,
          displayLabel: buildScheduleLabel(date, template.startTime, endTime),
          sortOrder,
          seriesId
        } satisfies DemoSchedulePlan
      })
    })
  })
}

const findUserByEmail = async (supabase: SupabaseClient, email: string) => {
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    })

    if (error) {
      throw new Error(`auth user 조회 실패: ${error.message}`)
    }

    const matched = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null
    if (matched) {
      return matched
    }

    if (data.users.length < perPage) {
      return null
    }

    page += 1
  }
}

const checkExistingDemoState = async (supabase: SupabaseClient): Promise<DemoExistingState> => {
  const academyAuthUser = await findUserByEmail(supabase, DEMO_ACADEMY_EMAIL)
  const parentAuthUsers = (
    await Promise.all(DEMO_PARENT_EMAILS.map((email) => findUserByEmail(supabase, email)))
  ).filter((user): user is User => user !== null)

  const [{ data: organizationRow, error: organizationError }, { data: requestRow, error: requestError }] =
    await Promise.all([
      supabase.from("organizations").select("id").eq("name", DEMO_ORGANIZATION_NAME).maybeSingle(),
      supabase
        .from("teacher_signup_requests")
        .select("id")
        .eq("signup_email", DEMO_ACADEMY_EMAIL)
        .maybeSingle()
    ])

  if (organizationError) {
    throw new Error(`organization 조회 실패: ${organizationError.message}`)
  }

  if (requestError) {
    throw new Error(`teacher_signup_requests 조회 실패: ${requestError.message}`)
  }

  return {
    academyAuthUser,
    parentAuthUsers,
    organizationExists: Boolean(organizationRow),
    teacherSignupRequestExists: Boolean(requestRow)
  }
}

const assertExactCount = (label: string, actual: number, expected: number) => {
  if (actual !== expected) {
    throw new Error(`${label} 개수가 예상과 다릅니다. expected=${expected}, actual=${actual}`)
  }
}

const assertExactStringSet = (label: string, actual: string[], expected: string[]) => {
  const actualSorted = [...actual].sort()
  const expectedSorted = [...expected].sort()

  if (actualSorted.length !== expectedSorted.length) {
    throw new Error(`${label} 개수가 예상과 다릅니다. expected=${expectedSorted.length}, actual=${actualSorted.length}`)
  }

  for (const [index, value] of expectedSorted.entries()) {
    if (actualSorted[index] !== value) {
      throw new Error(
        `${label} 값이 예상과 다릅니다. expected=${expectedSorted.join(", ")}, actual=${actualSorted.join(", ")}`
      )
    }
  }
}

const checkResumeApplicationsPreflight = async (supabase: SupabaseClient): Promise<DemoResumeState> => {
  const academyAuthUser = await findUserByEmail(supabase, DEMO_ACADEMY_EMAIL)
  const parentAuthUsers = await Promise.all(DEMO_PARENTS.map((parent) => findUserByEmail(supabase, parent.email)))

  assertExactCount("demo academy Auth", academyAuthUser ? 1 : 0, 1)
  assertExactCount(
    "demo parent Auth",
    parentAuthUsers.filter((user): user is User => user !== null).length,
    DEMO_PARENTS.length
  )
  assert(academyAuthUser, "academy auth user를 찾지 못했습니다.")

  const parentUserIds: Record<DemoParentKey, string> = {
    "parent-1": "",
    "parent-2": ""
  }

  for (const [index, parent] of DEMO_PARENTS.entries()) {
    const user = parentAuthUsers[index]
    assert(user, `parent auth user를 찾지 못했습니다: ${parent.email}`)
    parentUserIds[parent.key] = user.id
  }

  const { data: organizations, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("name", DEMO_ORGANIZATION_NAME)

  if (organizationError) {
    throw new Error(`organization 조회 실패: ${organizationError.message}`)
  }

  assertExactCount("demo organization", organizations?.length ?? 0, 1)
  const organization = (organizations ?? [])[0] as DemoOrganizationRow | undefined
  assert(organization, "demo organization을 찾지 못했습니다.")

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, organization_id")
    .in("id", [academyAuthUser.id, ...Object.values(parentUserIds)])

  if (profileError) {
    throw new Error(`profiles 조회 실패: ${profileError.message}`)
  }

  const profileRows = (profiles ?? []) as DemoProfileRow[]
  assertExactCount("academy+parent profiles", profileRows.length, 3)

  const academyProfile = profileRows.find((profile) => profile.id === academyAuthUser.id)
  assert(academyProfile, "academy profile을 찾지 못했습니다.")
  if (academyProfile.role !== "academy" || academyProfile.organization_id !== organization.id) {
    throw new Error("academy profile 조건이 맞지 않습니다. role=academy, organization_id=demo organization 이어야 합니다.")
  }

  const parentProfileRows = profileRows.filter((profile) => Object.values(parentUserIds).includes(profile.id))
  assertExactCount("demo parent profiles", parentProfileRows.length, DEMO_PARENTS.length)
  for (const parentProfile of parentProfileRows) {
    if (parentProfile.role !== "parent" || parentProfile.organization_id !== null) {
      throw new Error("parent profile 조건이 맞지 않습니다. role=parent, organization_id=null 이어야 합니다.")
    }
  }

  const { data: teachers, error: teacherError } = await supabase
    .from("teachers")
    .select("id, profile_id, organization_id, display_name")
    .eq("organization_id", organization.id)

  if (teacherError) {
    throw new Error(`teachers 조회 실패: ${teacherError.message}`)
  }

  const teacherRows = (teachers ?? []) as DemoTeacherRow[]
  assertExactCount("demo teachers", teacherRows.length, DEMO_TEACHERS.length)
  assertExactStringSet(
    "teacher 이름",
    teacherRows.map((teacher) => teacher.display_name),
    DEMO_TEACHERS.map((teacher) => teacher.displayName)
  )

  const teacherIds: Record<DemoTeacherKey, string> = {
    "kim-minji": "",
    "park-jihoon": "",
    "lee-seoyeon": ""
  }

  for (const teacher of teacherRows) {
    const teacherKey = DEMO_TEACHER_NAME_TO_KEY[teacher.display_name]
    assert(teacherKey, `예상하지 못한 teacher 이름입니다: ${teacher.display_name}`)
    teacherIds[teacherKey] = teacher.id
  }

  assert(Object.values(teacherIds).every(Boolean), "demo teacher id 매핑에 실패했습니다.")

  const { data: classes, error: classError } = await supabase
    .from("classes")
    .select("id, organization_id, teacher_id, title")
    .eq("organization_id", organization.id)

  if (classError) {
    throw new Error(`classes 조회 실패: ${classError.message}`)
  }

  const classRows = (classes ?? []) as DemoClassRow[]
  assertExactCount("demo classes", classRows.length, DEMO_CLASSES.length)
  assertExactStringSet(
    "class title",
    classRows.map((item) => item.title),
    DEMO_CLASSES.map((item) => item.title)
  )

  const classIds: Record<DemoClassKey, string> = {
    "thinking-math": "",
    "python-coding": "",
    "english-level-test": "",
    "robot-project": ""
  }

  for (const item of classRows) {
    const classKey = DEMO_CLASS_TITLE_TO_KEY[item.title]
    assert(classKey, `예상하지 못한 class title입니다: ${item.title}`)
    classIds[classKey] = item.id
  }

  assert(Object.values(classIds).every(Boolean), "demo class id 매핑에 실패했습니다.")

  const { data: schedules, error: scheduleError } = await supabase
    .from("class_schedules")
    .select("id, class_id, specific_date, start_time, end_time, display_label, capacity")
    .in("class_id", Object.values(classIds))

  if (scheduleError) {
    throw new Error(`class_schedules 조회 실패: ${scheduleError.message}`)
  }

  const scheduleRows = (schedules ?? []) as InsertedClassScheduleRow[]
  assertExactCount("demo class_schedules", scheduleRows.length, 24)
  const schedulesByClass = buildSchedulesByClassMap(scheduleRows, classIds)

  const { data: applications, error: applicationError } = await supabase
    .from("trial_applications")
    .select("id")
    .in("class_id", Object.values(classIds))

  if (applicationError) {
    throw new Error(`trial_applications 조회 실패: ${applicationError.message}`)
  }

  const existingApplicationsCount = applications?.length ?? 0
  if (existingApplicationsCount > 0) {
    throw new Error(`resume preflight 중단: 기존 trial_applications가 이미 ${existingApplicationsCount}건 존재합니다.`)
  }

  const existingLogsCount = 0

  const { data: signupRequests, error: signupRequestError } = await supabase
    .from("teacher_signup_requests")
    .select("id, user_id, status, approved_organization_id, approved_teacher_id")
    .eq("signup_email", DEMO_ACADEMY_EMAIL)

  if (signupRequestError) {
    throw new Error(`teacher_signup_requests 조회 실패: ${signupRequestError.message}`)
  }

  assertExactCount("demo teacher_signup_requests", signupRequests?.length ?? 0, 1)
  const signupRequest = (signupRequests ?? [])[0] as TeacherSignupRequestRow | undefined
  assert(signupRequest, "teacher_signup_request를 찾지 못했습니다.")
  if (
    signupRequest.status !== "approved" ||
    signupRequest.approved_organization_id !== organization.id ||
    signupRequest.user_id !== academyAuthUser.id
  ) {
    throw new Error("teacher_signup_request 조건이 맞지 않습니다. status=approved, approved_organization_id=demo org 이어야 합니다.")
  }

  return {
    organizationId: organization.id,
    academyUserId: academyAuthUser.id,
    academyProfileId: academyProfile.id,
    academyTeacherId: teacherIds["kim-minji"],
    teacherIds,
    parentUserIds,
    classIds,
    schedulesByClass,
    existingApplicationsCount,
    existingLogsCount
  }
}

const checkCleanupPartialApplicationsPreflight = async (
  supabase: SupabaseClient
): Promise<DemoCleanupState> => {
  const { data: organizations, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("name", DEMO_ORGANIZATION_NAME)

  if (organizationError) {
    throw new Error(`organization 조회 실패: ${organizationError.message}`)
  }

  assertExactCount("demo organization", organizations?.length ?? 0, 1)
  const organization = (organizations ?? [])[0] as DemoOrganizationRow | undefined
  assert(organization, "demo organization을 찾지 못했습니다.")

  const { data: classes, error: classError } = await supabase
    .from("classes")
    .select("id, organization_id, teacher_id, title")
    .eq("organization_id", organization.id)

  if (classError) {
    throw new Error(`classes 조회 실패: ${classError.message}`)
  }

  const classRows = (classes ?? []) as DemoClassRow[]
  assertExactCount("demo classes", classRows.length, DEMO_CLASSES.length)
  assertExactStringSet(
    "class title",
    classRows.map((item) => item.title),
    DEMO_CLASSES.map((item) => item.title)
  )

  const classTitleMap = new Map(classRows.map((item) => [item.id, item.title]))
  const classIds = classRows.map((item) => item.id)

  const { data: applications, error: applicationError } = await supabase
    .from("trial_applications")
    .select("id, parent_id, class_id, child_name, status, created_at")
    .in("class_id", classIds)
    .order("created_at", { ascending: true })

  if (applicationError) {
    throw new Error(`trial_applications 조회 실패: ${applicationError.message}`)
  }

  const applicationRows = (applications ?? []) as DemoCleanupApplicationRow[]
  const mappedApplications = applicationRows.map((application) => ({
    ...application,
    classTitle: classTitleMap.get(application.class_id) ?? "알 수 없는 수업"
  }))

  const statusCounts: Record<DemoApplicationStatus, number> = {
    new: 0,
    reviewing: 0,
    confirmed: 0,
    completed: 0,
    canceled: 0
  }

  for (const application of mappedApplications) {
    statusCounts[application.status] += 1
  }

  assertExactCount("demo trial_applications", mappedApplications.length, 5)
  assertExactCount("demo new applications", statusCounts.new, 3)
  assertExactCount("demo reviewing applications", statusCounts.reviewing, 2)
  assertExactCount("demo confirmed applications", statusCounts.confirmed, 0)
  assertExactCount("demo completed applications", statusCounts.completed, 0)
  assertExactCount("demo canceled applications", statusCounts.canceled, 0)

  const applicationIds = mappedApplications.map((application) => application.id)
  let applicationLogsCount = 0

  if (applicationIds.length > 0) {
    const { count, error: logError } = await supabase
      .from("application_logs")
      .select("id", {
        count: "exact",
        head: true
      })
      .in("application_id", applicationIds)

    if (logError) {
      throw new Error(`application_logs 조회 실패: ${logError.message}`)
    }

    applicationLogsCount = count ?? 0
  }

  assertExactCount("demo application_logs", applicationLogsCount, 0)

  const { data: scheduleBlocks, error: scheduleBlockError } = await supabase
    .from("schedule_blocks")
    .select("id, class_id, teacher_id, type, start_at, end_at, related_application_id")
    .in("class_id", classIds)

  if (scheduleBlockError) {
    throw new Error(`schedule_blocks 조회 실패: ${scheduleBlockError.message}`)
  }

  const scheduleBlockRows = (scheduleBlocks ?? []) as DemoCleanupScheduleBlockRow[]
  const scheduleBlocksLinkedToApplications = scheduleBlockRows.filter((block) =>
    block.related_application_id ? applicationIds.includes(block.related_application_id) : false
  )

  if (scheduleBlocksLinkedToApplications.length > 0) {
    throw new Error(
      `cleanup 중단: demo applications에 연결된 schedule_blocks가 ${scheduleBlocksLinkedToApplications.length}건 존재합니다.`
    )
  }

  return {
    organizationId: organization.id,
    classIds,
    applications: mappedApplications,
    applicationLogsCount,
    scheduleBlocks: scheduleBlockRows,
    scheduleBlocksLinkedToApplications,
    statusCounts
  }
}

const ensureNoExistingDemoState = (existing: DemoExistingState) => {
  const conflicts: string[] = []

  if (existing.academyAuthUser) {
    conflicts.push(`Auth user already exists: ${DEMO_ACADEMY_EMAIL}`)
  }

  if (existing.parentAuthUsers.length > 0) {
    conflicts.push(
      `Parent auth users already exist: ${existing.parentAuthUsers.map((user) => user.email).join(", ")}`
    )
  }

  if (existing.organizationExists) {
    conflicts.push(`Organization already exists: ${DEMO_ORGANIZATION_NAME}`)
  }

  if (existing.teacherSignupRequestExists) {
    conflicts.push(`Teacher signup request already exists: ${DEMO_ACADEMY_EMAIL}`)
  }

  if (conflicts.length > 0) {
    throw new Error(
      ["기존 demo 데이터 흔적이 감지되어 중단합니다.", ...conflicts.map((item) => `- ${item}`)].join("\n")
    )
  }
}

const createAuthUser = async (
  supabase: SupabaseClient,
  input: DemoAuthUserSeed
) => {
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: input.userMetadata ?? {
      name: input.name
    }
  })

  if (error || !data.user) {
    throw new Error(`Auth user 생성 실패 (${input.email}): ${error?.message ?? "unknown_error"}`)
  }

  return data.user
}

const buildAcademySignupMetadata = () => ({
  signup_intent: "teacher_public",
  teacher_name: DEMO_TEACHERS[0].displayName,
  teacher_phone: DEMO_TEACHERS[0].phone,
  organization_name: DEMO_ORGANIZATION_NAME,
  branch_name: DEMO_BRANCH_NAME,
  organization_phone: DEMO_ORGANIZATION_PHONE,
  request_note: "첫수업 영업 데모용 seed script",
  address: DEMO_ORGANIZATION_ADDRESS,
  address_detail: DEMO_ORGANIZATION_ADDRESS_DETAIL
})

const ensureTeacherSignupRequest = async (supabase: SupabaseClient, academyUserId: string) => {
  const { data: existing, error: existingError } = await supabase
    .from("teacher_signup_requests")
    .select("id, user_id, status")
    .eq("user_id", academyUserId)
    .maybeSingle()

  if (existingError) {
    throw new Error(`teacher_signup_requests 조회 실패: ${existingError.message}`)
  }

  if (existing) {
    return existing as TeacherSignupRequestRow
  }

  const { data, error } = await supabase
    .from("teacher_signup_requests")
    .insert({
      user_id: academyUserId,
      signup_email: DEMO_ACADEMY_EMAIL,
      status: "pending",
      teacher_name: DEMO_TEACHERS[0].displayName,
      teacher_phone: DEMO_TEACHERS[0].phone,
      organization_name: DEMO_ORGANIZATION_NAME,
      branch_name: DEMO_BRANCH_NAME,
      address: DEMO_ORGANIZATION_ADDRESS,
      address_detail: DEMO_ORGANIZATION_ADDRESS_DETAIL,
      organization_phone: DEMO_ORGANIZATION_PHONE,
      request_note: "첫수업 영업 데모용 seed script"
    })
    .select("id, user_id, status")
    .single()

  if (error || !data) {
    throw new Error(`teacher_signup_requests 생성 실패: ${error?.message ?? "unknown_error"}`)
  }

  return data as TeacherSignupRequestRow
}

const insertOrganization = async (supabase: SupabaseClient) => {
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      name: DEMO_ORGANIZATION_NAME,
      branch_name: DEMO_BRANCH_NAME,
      address: DEMO_ORGANIZATION_ADDRESS,
      address_detail: DEMO_ORGANIZATION_ADDRESS_DETAIL,
      updated_at: new Date().toISOString()
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`organization 생성 실패: ${error?.message ?? "unknown_error"}`)
  }

  return data.id as string
}

const upsertProfile = async (
  supabase: SupabaseClient,
  input: {
    id: string
    role: DemoRole
    name: string
    phone: string | null
    organizationId: string | null
  }
) => {
  const { error } = await supabase.from("profiles").upsert({
    id: input.id,
    role: input.role,
    name: input.name,
    phone: input.phone,
    organization_id: input.organizationId,
    updated_at: new Date().toISOString()
  })

  if (error) {
    throw new Error(`profile upsert 실패 (${input.id}): ${error.message}`)
  }
}

// 강사 명부(teachers)와 로그인 계정(profiles)은 별개 개념이라 데모에서도 연결하지 않는다.
// profile_id 를 채우면 Studio 명부/담당 옵션에서 빠지는 legacy system row 가 다시 생긴다.
const insertTeacher = async (
  supabase: SupabaseClient,
  organizationId: string,
  teacher: DemoTeacherPlan
) => {
  const { data, error } = await supabase
    .from("teachers")
    .insert({
      profile_id: null,
      organization_id: organizationId,
      display_name: teacher.displayName,
      phone: teacher.phone,
      sms_enabled: false,
      specialty: null,
      intro: teacher.intro,
      career_years: 0,
      subjects: teacher.subjects,
      target_students: teacher.targetStudents,
      specialties: teacher.specialties,
      short_intro: teacher.shortIntro,
      teaching_style: teacher.teachingStyle,
      public_visibility: toTeacherPublicVisibilityJson(DEFAULT_TEACHER_PUBLIC_VISIBILITY),
      is_active: true
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`teacher 생성 실패 (${teacher.displayName}): ${error?.message ?? "unknown_error"}`)
  }

  return data.id as string
}

// approve_teacher_signup_request RPC 와 동일하게 approved_teacher_id 는 비워 둔다.
const markTeacherSignupApproved = async (
  supabase: SupabaseClient,
  requestId: string,
  organizationId: string
) => {
  const { error } = await supabase
    .from("teacher_signup_requests")
    .update({
      status: "approved",
      approved_organization_id: organizationId,
      approved_teacher_id: null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", requestId)

  if (error) {
    throw new Error(`teacher_signup_requests 승인 반영 실패: ${error.message}`)
  }
}

const insertClasses = async (
  supabase: SupabaseClient,
  ids: Pick<DemoDatabaseIds, "organizationId" | "teacherIds">
) => {
  const classIds: Record<DemoClassKey, string> = {
    "thinking-math": "",
    "python-coding": "",
    "english-level-test": "",
    "robot-project": ""
  }

  for (const [index, classPlan] of DEMO_CLASSES.entries()) {
    const teacherId = ids.teacherIds[classPlan.teacherKey]
    const teacherDisplayName = DEMO_TEACHERS.find((teacher) => teacher.key === classPlan.teacherKey)?.displayName ?? null
    const { data, error } = await supabase
      .from("classes")
      .insert({
        organization_id: ids.organizationId,
        program_type: classPlan.programType,
        assignment_mode: classPlan.assignmentMode,
        title: classPlan.title,
        subject: classPlan.subject,
        target_age: classPlan.targetAge,
        description: classPlan.description,
        class_format: classPlan.classFormat,
        recommended_for: classPlan.recommendedFor,
        experience_points: classPlan.experiencePoints,
        curriculum: classPlan.curriculum,
        teacher_intro: null,
        trial_price: classPlan.trialPrice,
        teacher_id: teacherId,
        teacher_display_name: teacherDisplayName,
        cover_image_url: DEMO_CLASS_COVER_IMAGE_URLS[index],
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .select("id")
      .single()

    if (error || !data) {
      throw new Error(`class 생성 실패 (${classPlan.title}): ${error?.message ?? "unknown_error"}`)
    }

    classIds[classPlan.key] = data.id as string
  }

  return classIds
}

const insertSchedules = async (
  supabase: SupabaseClient,
  classIds: Record<DemoClassKey, string>
) => {
  const schedulePlans = buildSchedulePlans()
  const rows: ClassScheduleInsertRow[] = schedulePlans.map((plan) => ({
    class_id: classIds[plan.classKey],
    schedule_type: "one_time",
    booking_status: "open",
    day_of_week: null,
    specific_date: plan.date,
    start_time: plan.startTime,
    end_time: plan.endTime,
    capacity: plan.capacity,
    display_label: plan.displayLabel,
    sort_order: plan.sortOrder,
    series_id: plan.seriesId
  }))

  const { data, error } = await supabase
    .from("class_schedules")
    .insert(rows)
    .select("id, class_id, specific_date, start_time, end_time, display_label, capacity")

  if (error || !data) {
    throw new Error(`class_schedules 생성 실패: ${error?.message ?? "unknown_error"}`)
  }

  return buildSchedulesByClassMap(data as InsertedClassScheduleRow[], classIds)
}

const createdAtForApplicationIndex = (index: number) => addDays(new Date(), -(21 - index))

const shiftIso = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString()

const createScheduleBlockForApplication = async (
  supabase: SupabaseClient,
  input: {
    classId: string
    teacherId: string
    requestedSlotAt: string
    endAt: string
    capacity: number
  }
) => {
  const { data, error } = await supabase
    .from("schedule_blocks")
    .insert({
      teacher_id: input.teacherId,
      class_id: input.classId,
      type: "available",
      start_at: input.requestedSlotAt,
      end_at: input.endAt,
      capacity: input.capacity,
      updated_at: new Date().toISOString()
    })
    .select("id, class_id, teacher_id, start_at, end_at")
    .single()

  if (error || !data) {
    throw new Error(`schedule_block 생성 실패: ${error?.message ?? "unknown_error"}`)
  }

  return data as CreatedScheduleBlockRow
}

const buildApplicationDrafts = (
  ids: DemoDatabaseIds,
  schedulesByClass: Map<DemoClassKey, InsertedClassScheduleRow[]>
) => {
  return DEMO_APPLICATIONS.map((plan, index) => {
    const classId = ids.classIds[plan.classKey]
    const teacherId = ids.teacherIds[DEMO_CLASSES.find((item) => item.key === plan.classKey)?.teacherKey ?? "kim-minji"]
    const parentId = ids.parentUserIds[plan.parentKey]
    const classSchedules = schedulesByClass.get(plan.classKey) ?? []
    const matchedSchedule = classSchedules[plan.scheduleIndex]

    assert(matchedSchedule, `schedule 매칭 실패: ${plan.key}`)

    const requestedSlotAt = toKstIso(matchedSchedule.specific_date, matchedSchedule.start_time)
    const requestedEndAt = toKstIso(matchedSchedule.specific_date, matchedSchedule.end_time)
    const createdAt = createdAtForApplicationIndex(index).toISOString()
    const contactedAt = plan.wasReviewed ? shiftIso(createdAt, 120) : null
    const scheduledAt = plan.wasConfirmed ? shiftIso(contactedAt ?? createdAt, 120) : null
    const completedAt = plan.status === "completed" ? shiftIso(scheduledAt ?? createdAt, 240) : null
    const canceledAt = plan.status === "canceled" && !plan.noShow ? shiftIso(contactedAt ?? createdAt, 180) : null
    const noShowAt = plan.noShow ? shiftIso(scheduledAt ?? createdAt, 240) : null
    const enrolledAt = plan.registrationStatus === "enrolled" && completedAt ? shiftIso(completedAt, 120) : null
    const confirmedSlotAt = plan.wasConfirmed && (plan.status === "confirmed" || plan.status === "completed")
      ? requestedSlotAt
      : null

    return {
      index,
      plan,
      classId,
      teacherId,
      parentId,
      matchedSchedule,
      selectedScheduleLabel:
        matchedSchedule.display_label ??
        buildScheduleLabel(matchedSchedule.specific_date, matchedSchedule.start_time, matchedSchedule.end_time),
      requestedSlotAt,
      requestedEndAt,
      confirmedSlotAt,
      createdAt,
      contactedAt,
      scheduledAt,
      completedAt,
      canceledAt,
      noShowAt,
      enrolledAt
    } satisfies DemoApplicationDraft
  })
}

const validateTimestamptz = (label: string, value: string | null) => {
  if (!value) {
    return
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`timestamp validation 실패 (${label}): ${value}`)
  }
}

const validateApplicationDraftTimestamps = (drafts: DemoApplicationDraft[]) => {
  for (const draft of drafts) {
    validateTimestamptz(`${draft.plan.key}.requested_slot_at`, draft.requestedSlotAt)
    validateTimestamptz(`${draft.plan.key}.confirmed_slot_at`, draft.confirmedSlotAt)
    validateTimestamptz(`${draft.plan.key}.contacted_at`, draft.contactedAt)
    validateTimestamptz(`${draft.plan.key}.scheduled_at`, draft.scheduledAt)
    validateTimestamptz(`${draft.plan.key}.completed_at`, draft.completedAt)
    validateTimestamptz(`${draft.plan.key}.enrolled_at`, draft.enrolledAt)
    validateTimestamptz(`${draft.plan.key}.canceled_at`, draft.canceledAt)
    validateTimestamptz(`${draft.plan.key}.no_show_at`, draft.noShowAt)
    validateTimestamptz(`${draft.plan.key}.created_at`, draft.createdAt)
  }
}

const validateTrialApplicationInsertPayload = (
  label: string,
  payload: {
    status: DemoApplicationStatus
    registration_status: DemoRegistrationStatus
    unregistered_reason: DemoUnregisteredReason | null
    requested_schedule_block_id: string | null
    confirmed_slot_at: string | null
    confirmed_schedule_block_id: string | null
  }
) => {
  if (!VALID_APPLICATION_STATUSES.includes(payload.status)) {
    throw new Error(`application payload validation 실패 (${label}): 허용되지 않은 status=${payload.status}`)
  }

  if (!VALID_REGISTRATION_STATUSES.includes(payload.registration_status)) {
    throw new Error(
      `application payload validation 실패 (${label}): 허용되지 않은 registration_status=${payload.registration_status}`
    )
  }

  const confirmedStateValid =
    (payload.confirmed_slot_at === null && payload.confirmed_schedule_block_id === null) ||
    (payload.confirmed_slot_at !== null &&
      payload.confirmed_schedule_block_id !== null &&
      (payload.status === "confirmed" || payload.status === "completed"))

  if (!confirmedStateValid) {
    throw new Error(
      `application payload validation 실패 (${label}): trial_applications_confirmed_state_check 위반 가능성이 있습니다.`
    )
  }

  if (payload.unregistered_reason !== null && payload.registration_status !== "not_enrolled") {
    throw new Error(
      `application payload validation 실패 (${label}): unregistered_reason은 registration_status=not_enrolled일 때만 허용됩니다.`
    )
  }

  if (
    (payload.status === "confirmed" || payload.status === "completed") &&
    (payload.requested_schedule_block_id === null || payload.confirmed_schedule_block_id === null)
  ) {
    throw new Error(
      `application payload validation 실패 (${label}): confirmed/completed 상태는 requested_schedule_block_id와 confirmed_schedule_block_id가 모두 필요합니다.`
    )
  }
}

const createApplications = async (
  supabase: SupabaseClient,
  ids: DemoDatabaseIds,
  schedulesByClass: Map<DemoClassKey, InsertedClassScheduleRow[]>,
  options?: {
    createScheduleBlocks?: boolean
    drafts?: DemoApplicationDraft[]
  }
) => {
  const drafts = options?.drafts ?? buildApplicationDrafts(ids, schedulesByClass)
  validateApplicationDraftTimestamps(drafts)

  const createdApplications: CreatedApplicationRow[] = []
  const allLogs: Array<{
    application_id: string
    from_status: DemoApplicationStatus | null
    to_status: DemoApplicationStatus
    actor_id: string
    note: string
    created_at: string
  }> = []
  const shouldCreateScheduleBlocks = options?.createScheduleBlocks !== false

  for (const draft of drafts) {
    const {
      plan,
      classId,
      teacherId,
      parentId,
      matchedSchedule,
      selectedScheduleLabel,
      requestedSlotAt,
      requestedEndAt,
      confirmedSlotAt,
      createdAt,
      contactedAt,
      scheduledAt,
      completedAt,
      canceledAt,
      noShowAt,
      enrolledAt
    } = draft

    let requestedScheduleBlockId: string | null = null
    let confirmedScheduleBlockId: string | null = null

    if (plan.wasConfirmed && shouldCreateScheduleBlocks) {
      const block = await createScheduleBlockForApplication(supabase, {
        classId,
        teacherId,
        requestedSlotAt,
        endAt: requestedEndAt,
        capacity: Math.max(1, matchedSchedule.capacity ?? 1)
      })

      requestedScheduleBlockId = block.id

      if (confirmedSlotAt) {
        confirmedScheduleBlockId = block.id
      }
    }

    const insertPayload = {
      parent_id: parentId,
      class_id: classId,
      assigned_teacher_id: teacherId,
      child_id: null,
      child_name: plan.childName,
      child_grade: plan.childGrade,
      parent_name: plan.parentName,
      parent_phone: plan.parentPhone,
      child_school: plan.childSchool,
      child_notes: plan.childNotes,
      subject_experience_yn: plan.subjectExperienceYn,
      subject_experience_duration: plan.subjectExperienceDuration,
      current_level: plan.currentLevel,
      preferred_regular_schedule: plan.preferredRegularSchedule,
      goal_type: plan.goalType,
      goal_note: plan.goalNote,
      class_schedule_id: matchedSchedule.id,
      requested_schedule_block_id: requestedScheduleBlockId,
      requested_slot_at: requestedSlotAt,
      selected_schedule_label: selectedScheduleLabel,
      confirmed_slot_at: confirmedSlotAt,
      confirmed_schedule_block_id: confirmedScheduleBlockId,
      contacted_at: contactedAt,
      scheduled_at: scheduledAt,
      completed_at: completedAt,
      canceled_at: canceledAt,
      no_show_at: noShowAt,
      consultation_note: plan.consultationNote,
      trial_feedback: plan.trialFeedback,
      final_level: plan.finalLevel,
      final_schedule: plan.finalSchedule,
      registration_status: plan.registrationStatus,
      registered_course: plan.registeredCourse,
      enrolled_at: enrolledAt,
      unregistered_reason: plan.unregisteredReason,
      follow_up_note: plan.followUpNote,
      memo: plan.memo,
      status: plan.status,
      created_at: createdAt,
      updated_at:
        completedAt ??
        canceledAt ??
        noShowAt ??
        scheduledAt ??
        contactedAt ??
        createdAt
    }

    validateTrialApplicationInsertPayload(plan.key, insertPayload)

    const { data, error } = await supabase
      .from("trial_applications")
      .insert(insertPayload)
      .select("id, parent_id, class_id, class_schedule_id, requested_slot_at, status")
      .single()

    if (error || !data) {
      throw new Error(
        `trial_application 생성 실패 (${draft.index + 1}/${drafts.length}, ${plan.key}): ${error?.message ?? "unknown_error"}`
      )
    }

    const inserted = data as CreatedApplicationRow
    createdApplications.push(inserted)

    allLogs.push({
      application_id: inserted.id,
      from_status: null,
      to_status: "new",
      actor_id: parentId,
      note: "학부모 체험 신청 생성",
        created_at: createdAt
    })

    if (plan.wasReviewed && contactedAt) {
      allLogs.push({
        application_id: inserted.id,
        from_status: "new",
        to_status: "reviewing",
        actor_id: ids.academyProfileId,
        note: STATUS_ACTION_NOTES.reviewing,
        created_at: contactedAt
      })
    }

    if (plan.wasConfirmed && scheduledAt) {
      allLogs.push({
        application_id: inserted.id,
        from_status: plan.wasReviewed ? "reviewing" : "new",
        to_status: "confirmed",
        actor_id: ids.academyProfileId,
        note: STATUS_ACTION_NOTES.confirmed,
        created_at: scheduledAt
      })
    }

    if (plan.status === "completed" && completedAt) {
      allLogs.push({
        application_id: inserted.id,
        from_status: "confirmed",
        to_status: "completed",
        actor_id: ids.academyProfileId,
        note: STATUS_ACTION_NOTES.completed,
        created_at: completedAt
      })

      const outcomeFields = [
        plan.consultationNote ? "상담 메모" : null,
        plan.trialFeedback ? "체험/레벨테스트 결과 메모" : null,
        plan.registeredCourse ? "추천 과정" : null,
        plan.finalLevel ? "확정 레벨" : null,
        plan.finalSchedule ? "확정 수업 시간" : null,
        plan.followUpNote ? "후속 조치 메모" : null,
        "등록 상태"
      ].filter((value): value is string => Boolean(value))

      allLogs.push({
        application_id: inserted.id,
        from_status: "completed",
        to_status: "completed",
        actor_id: ids.academyProfileId,
        note: `운영 기록 저장: ${Array.from(new Set(outcomeFields)).join(", ")}`,
        created_at: shiftIso(completedAt, 45)
      })
    }

    if (plan.status === "canceled") {
      const canceledLogTime = noShowAt ?? canceledAt ?? shiftIso(contactedAt ?? createdAt, 180)
      allLogs.push({
        application_id: inserted.id,
        from_status: plan.wasConfirmed ? "confirmed" : plan.wasReviewed ? "reviewing" : "new",
        to_status: "canceled",
        actor_id: ids.academyProfileId,
        note: plan.noShow ? STATUS_ACTION_NOTES.no_show : STATUS_ACTION_NOTES.canceled,
        created_at: canceledLogTime
      })
    }

    if (plan.status === "reviewing" && plan.consultationNote && contactedAt) {
      allLogs.push({
        application_id: inserted.id,
        from_status: "reviewing",
        to_status: "reviewing",
        actor_id: ids.academyProfileId,
        note: "상담 기록 저장: 상담 메모",
        created_at: shiftIso(contactedAt, 30)
      })
    }
  }

  const { error: logError } = await supabase.from("application_logs").insert(allLogs)
  if (logError) {
    throw new Error(`application_logs 생성 실패: ${logError.message}`)
  }

  return createdApplications
}

const printPlanSummary = (schedulePlans: DemoSchedulePlan[]) => {
  console.log("[demo-seed] 계획 요약")
  console.log(`Academy Auth: 1`)
  console.log(`Parent Auth: ${DEMO_PARENT_EMAILS.length}`)
  console.log(`Organization: 1`)
  console.log(`Teachers: ${DEMO_TEACHERS.length}`)
  console.log(`Classes: ${DEMO_CLASSES.length}`)
  console.log(`Schedules: ${schedulePlans.length}`)
  console.log(`Applications: ${DEMO_APPLICATIONS.length}`)
  console.log(`Class Titles: ${DEMO_CLASSES.map((item) => item.title).join(" | ")}`)
}

const printResumePreflightSummary = (state: DemoResumeState, drafts: DemoApplicationDraft[]) => {
  console.log("[demo-seed] resume preflight")
  console.log("Academy Profile: OK")
  console.log(`Parent Profiles: ${Object.keys(state.parentUserIds).length} / ${DEMO_PARENTS.length}`)
  console.log(`Teachers: ${Object.keys(state.teacherIds).length} / ${DEMO_TEACHERS.length}`)
  console.log(`Classes: ${Object.keys(state.classIds).length} / ${DEMO_CLASSES.length}`)
  console.log(`Schedules: ${Array.from(state.schedulesByClass.values()).flat().length} / 24`)
  console.log(`Existing Applications: ${state.existingApplicationsCount}`)
  console.log(`Existing Logs: ${state.existingLogsCount}`)
  console.log(`Applications to create: ${drafts.length}`)
  console.log("Timestamp validation: OK")
  console.log("Resume possible: YES")
}

const printCleanupPreflightSummary = (state: DemoCleanupState) => {
  console.log("[demo-seed] cleanup partial applications preflight")
  console.log("Demo Organization: OK")
  console.log(`Demo Classes: ${state.classIds.length}`)
  console.log(`Applications found: ${state.applications.length}`)
  console.log("")
  console.log("status:")
  console.log(`new: ${state.statusCounts.new}`)
  console.log(`reviewing: ${state.statusCounts.reviewing}`)
  console.log(`confirmed: ${state.statusCounts.confirmed}`)
  console.log(`completed: ${state.statusCounts.completed}`)
  console.log(`canceled: ${state.statusCounts.canceled}`)
  console.log("")
  console.log(`Application Logs: ${state.applicationLogsCount}`)
  console.log(`Schedule Blocks: ${state.scheduleBlocks.length}`)
  console.log("Applications to delete:")
  for (const application of state.applications) {
    console.log(`- ${application.id} | ${application.status} | ${application.classTitle} | ${application.child_name}`)
  }
  console.log("")
  console.log("Cleanup possible: YES")
}

const cleanupPartialApplications = async (supabase: SupabaseClient, state: DemoCleanupState) => {
  if (state.applications.length === 0) {
    return
  }

  if (
    DEMO_APPLICATION_LOG_DELETE_BEHAVIOR !== "cascade" &&
    state.applicationLogsCount > 0
  ) {
    const { error: logDeleteError } = await supabase
      .from("application_logs")
      .delete()
      .in(
        "application_id",
        state.applications.map((application) => application.id)
      )

    if (logDeleteError) {
      throw new Error(`application_logs 삭제 실패: ${logDeleteError.message}`)
    }
  }

  const { error: applicationDeleteError } = await supabase
    .from("trial_applications")
    .delete()
    .in(
      "id",
      state.applications.map((application) => application.id)
    )

  if (applicationDeleteError) {
    throw new Error(`trial_applications 삭제 실패: ${applicationDeleteError.message}`)
  }
}

const ensureExecutionAllowed = () => {
  if (process.env[CONFIRM_ENV] !== "YES") {
    throw new Error(`${CONFIRM_ENV}=YES 가 없어서 실제 생성 모드를 중단합니다.`)
  }
}

const main = async () => {
  const flags = parseFlags()
  const schedulePlans = buildSchedulePlans()
  const selectedModeCount = [flags.resumeApplications, flags.cleanupPartialApplications].filter(Boolean).length

  if (selectedModeCount > 1) {
    throw new Error("동시에 여러 demo seed 모드를 실행할 수 없습니다.")
  }

  if (flags.cleanupPartialApplications) {
    readRequiredEnv(SUPABASE_URL_ENV)
    readRequiredEnv(SERVICE_ROLE_ENV)

    const supabase = getServiceRoleClient()
    const cleanupState = await checkCleanupPartialApplicationsPreflight(supabase)

    printCleanupPreflightSummary(cleanupState)

    if (flags.dryRun) {
      console.log("dry-run: no writes performed")
      return
    }

    ensureExecutionAllowed()
    await cleanupPartialApplications(supabase, cleanupState)
    console.log("[demo-seed] 완료: demo partial trial_applications cleanup을 마쳤습니다.")
    return
  }

  if (flags.resumeApplications) {
    readRequiredEnv(SUPABASE_URL_ENV)
    readRequiredEnv(SERVICE_ROLE_ENV)

    const supabase = getServiceRoleClient()
    const resumeState = await checkResumeApplicationsPreflight(supabase)
    const drafts = buildApplicationDrafts(resumeState, resumeState.schedulesByClass)
    validateApplicationDraftTimestamps(drafts)

    printResumePreflightSummary(resumeState, drafts)

    if (flags.dryRun) {
      console.log("dry-run: no writes performed")
      return
    }

    ensureExecutionAllowed()
    await createApplications(supabase, resumeState, resumeState.schedulesByClass, {
      createScheduleBlocks: true,
      drafts
    })
    console.log("[demo-seed] 완료: resume-applications 모드로 application/application_logs 생성을 마쳤습니다.")
    return
  }

  if (flags.dryRun) {
    printPlanSummary(schedulePlans)
    console.log("[demo-seed] dry-run 모드: 실제 Auth/DB 생성은 수행하지 않았습니다.")
    return
  }

  ensureExecutionAllowed()
  readRequiredEnv(SUPABASE_URL_ENV)
  readRequiredEnv(SERVICE_ROLE_ENV)
  readRequiredEnv(ACADEMY_PASSWORD_ENV)
  readRequiredEnv(PARENT_PASSWORD_ENV)

  const supabase = getServiceRoleClient()
  const existing = await checkExistingDemoState(supabase)
  ensureNoExistingDemoState(existing)

  printPlanSummary(schedulePlans)

  const academyPassword = readRequiredEnv(ACADEMY_PASSWORD_ENV)
  const parentPassword = readRequiredEnv(PARENT_PASSWORD_ENV)

  const academyUser = await createAuthUser(supabase, {
    email: DEMO_ACADEMY_EMAIL,
    password: academyPassword,
    role: "academy",
    name: DEMO_TEACHERS[0].displayName,
    phone: DEMO_TEACHERS[0].phone,
    userMetadata: buildAcademySignupMetadata()
  })

  const request = await ensureTeacherSignupRequest(supabase, academyUser.id)
  const organizationId = await insertOrganization(supabase)
  await upsertProfile(supabase, {
    id: academyUser.id,
    role: "academy",
    name: DEMO_TEACHERS[0].displayName,
    phone: DEMO_TEACHERS[0].phone,
    organizationId
  })

  const academyTeacherId = await insertTeacher(supabase, organizationId, DEMO_TEACHERS[0])
  await markTeacherSignupApproved(supabase, request.id, organizationId)

  const teacherIds: Record<DemoTeacherKey, string> = {
    "kim-minji": academyTeacherId,
    "park-jihoon": "",
    "lee-seoyeon": ""
  }

  for (const teacher of DEMO_TEACHERS.filter((item) => !item.linkedProfile)) {
    teacherIds[teacher.key] = await insertTeacher(supabase, organizationId, teacher)
  }

  const parentUserIds: Record<DemoParentKey, string> = {
    "parent-1": "",
    "parent-2": ""
  }

  for (const parent of DEMO_PARENTS) {
    const user = await createAuthUser(supabase, {
      email: parent.email,
      password: parentPassword,
      role: "parent",
      name: parent.name,
      phone: parent.phone
    })

    await upsertProfile(supabase, {
      id: user.id,
      role: "parent",
      name: parent.name,
      phone: parent.phone,
      organizationId: null
    })

    parentUserIds[parent.key] = user.id
  }

  const classIds = await insertClasses(supabase, {
    organizationId,
    teacherIds
  })
  const schedulesByClass = await insertSchedules(supabase, classIds)

  await createApplications(
    supabase,
    {
      organizationId,
      academyUserId: academyUser.id,
      academyProfileId: academyUser.id,
      academyTeacherId,
      teacherIds,
      parentUserIds,
      classIds
    },
    schedulesByClass,
    {
      createScheduleBlocks: true
    }
  )

  console.log("[demo-seed] 완료: demo academy seed 데이터 생성을 마쳤습니다.")
}

main().catch((error) => {
  console.error("[demo-seed] 실패:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})
