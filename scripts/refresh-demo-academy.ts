// 영업 시연용 "첫수업 데모학원 본원" 데이터를 기준일(KST) 기준으로 다시 만든다.
//
// 기본은 dry-run 이다(계획만 출력). DEMO_REFRESH_CONFIRM=YES 일 때만 쓴다.
//   npx tsx scripts/refresh-demo-academy.ts
//   DEMO_REFRESH_DATE=2026-10-27 DEMO_REFRESH_CONFIRM=YES npx tsx scripts/refresh-demo-academy.ts
//
// 두 층으로 나눈다.
//   오늘 층 — 기록 · 리포트가 없는 데모 학부모 신청. 실행할 때마다 지우고 기준일 기준으로 다시 만든다.
//             지난 6개월 이력도 여기다. 4칸 분류와 전환율은 등록 결과만 보므로 기록이 필요 없다.
//   이력 층 — 기록(trial_results) · 리포트(experience_reports)가 붙은 신청. DB 트리거
//             (lock_final_trial_result · report_send_once)가 삭제를 막으므로 지우지 않는다.
//             처음 한 번만 만들고, 다시 실행하면 이미 있는 것은 빠진 단계만 이어서 한다
//             (학부모 + 수업 + 학생 이름으로 식별).
//
// 쓰는 범위: 데모 학원 조직 + DEMO_PARENT_EMAILS 학부모 계정의 행만. 다른 학부모 행이 계획에
// 하나라도 섞이면 쓰기 전에 멈춘다. 문자 · 알림톡 발송 함수는 부르지 않는다.
// 학원 · 학부모 동작은 실제 Studio/학부모 RPC 를 그대로 부른다. 세션은 관리자 magic link 토큰으로
// 만든다 — 메일을 보내지 않고 비밀번호를 읽거나 바꾸지 않는다.
//
// 확정 · 리포트 발행 RPC 는 트리거로 학부모 푸시 작업을 만든다. 데모 학부모는 기기가 없어서
// 푸시 워커(pg_cron 5분 주기)가 그 작업을 문자로 대신 보낸다. 그래서 RPC 직후 그 신청의 대기 작업을
// 바로 지우고, 끝날 때 데모 학부모의 대기 작업을 한 번 더 지운다.
//
// 리마인더 크론(매일 KST 10:00)은 "다음 날" 확정 체험에 문자를 보낸다. 그래서 확정 일정은
// 기준일 당일(오늘 체험)과 기준일 + 6일 이후에만 둔다. 기준일 + 1일에는 확정 일정을 두지 않는다.
//
// 시연 전날 다시 실행: 그날 KST 10:00 이 지난 뒤
//   DEMO_REFRESH_DATE=<시연일> DEMO_REFRESH_CONFIRM=YES npx tsx scripts/refresh-demo-academy.ts

import { randomUUID } from "node:crypto"

import { loadEnvConfig } from "@next/env"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// ── seed-demo-academy.ts 의 정의 ──────────────────────────────────────────────
// 그 파일은 import 하면 main() 이 바로 실행되므로 고치지 않고 값만 옮겨 온다.
const DEMO_ACADEMY_EMAIL = "demo@firstsuup.com"
const DEMO_PARENT_EMAILS = [
  "demo-parent1@firstsuup.com",
  "demo-parent2@firstsuup.com"
] as const
const DEMO_ORGANIZATION_NAME = "첫수업 데모학원"
const DEMO_BRANCH_NAME = "본원"

type ParentKey = "parent-1" | "parent-2"
type TeacherName = "김민지" | "박지훈" | "이서연"
type ClassKey = "thinking-math" | "python-coding" | "english-level-test" | "robot-project"

const DEMO_PARENTS: Array<{ key: ParentKey; email: (typeof DEMO_PARENT_EMAILS)[number]; phone: string }> = [
  { key: "parent-1", email: DEMO_PARENT_EMAILS[0], phone: "010-0000-0001" },
  { key: "parent-2", email: DEMO_PARENT_EMAILS[1], phone: "010-0000-0002" }
]

const DEMO_TEACHER_PHONES: Record<TeacherName, string> = {
  김민지: "010-0000-1001",
  박지훈: "010-0000-1002",
  이서연: "010-0000-1003"
}

type DemoClassPlan = {
  key: ClassKey
  title: string
  teacher: TeacherName
  durationMinutes: number
  capacity: number
  weekdays: number[]
  times: string[]
  grades: string[]
  report: {
    observations: string[]
    course: string
    level: string
    schedule: string
    summary: (name: string) => string
  }
}

const DEMO_CLASSES: DemoClassPlan[] = [
  {
    key: "thinking-math",
    title: "초등 사고력수학 체험수업",
    teacher: "김민지",
    durationMinutes: 60,
    capacity: 2,
    weekdays: [1, 2, 4, 5],
    times: ["15:00", "16:00", "17:00"],
    grades: ["elem_1", "elem_2", "elem_3", "elem_4"],
    report: {
      observations: ["math_attempted_new_problem", "math_expressed_with_visuals", "math_applied_concept"],
      course: "사고력수학 정규반",
      level: "기본 과정",
      schedule: "화·목 16:00",
      summary: (name) =>
        `${name} 학생은 처음 보는 규칙 찾기 문제에도 먼저 손을 들고 도전했어요. 교구로 도형을 직접 옮겨 본 뒤에는 자기 풀이를 차근차근 설명했고, 앞에서 찾은 규칙을 다음 문제에 바로 적용했어요. 정규반에서는 풀이를 말로 정리하는 연습을 이어 가면 자신감이 더 붙을 거예요.`
    }
  },
  {
    key: "python-coding",
    title: "파이썬 코딩 입문 체험수업",
    teacher: "박지훈",
    durationMinutes: 90,
    capacity: 3,
    weekdays: [2, 3, 5],
    times: ["16:30", "18:00"],
    grades: ["elem_3", "elem_4", "elem_5", "elem_6"],
    report: {
      observations: [
        "coding_it_robotics_explored_task",
        "coding_it_robotics_implemented_steps",
        "coding_it_robotics_located_error",
        "coding_it_robotics_checked_changed_result"
      ],
      course: "파이썬 입문반",
      level: "텍스트 코딩 1단계",
      schedule: "수·금 16:30",
      summary: (name) =>
        `${name} 학생은 이름표 프로그램 과제를 받자마자 화면을 살펴보며 바로 코드를 써 내려갔어요. 결과가 예상과 다르게 나오자 어느 줄이 문제인지 스스로 찾아보았고, 조건을 바꾼 뒤 결과가 달라졌는지 다시 확인했어요. 입력과 조건문 감각이 좋아 입문반에서 작은 프로젝트로 넘어가기 좋겠어요.`
    }
  },
  {
    key: "english-level-test",
    title: "초등 영어 레벨테스트",
    teacher: "이서연",
    durationMinutes: 40,
    capacity: 1,
    weekdays: [2, 3, 4, 6],
    times: ["14:00", "15:00", "16:00", "17:00", "18:00"],
    grades: ["elem_1", "elem_2", "elem_3", "elem_4", "elem_5"],
    report: {
      observations: [
        "english_responded_familiar_expression",
        "english_found_reading_content",
        "english_retried_after_model"
      ],
      course: "초등 리딩 정규반",
      level: "Reading 2",
      schedule: "월·수·금 17:00",
      summary: (name) =>
        `${name} 학생은 익숙한 표현이 나오면 바로 따라 말하며 편하게 테스트를 시작했어요. 짧은 글에서 질문에 필요한 내용을 정확히 찾아냈고, 말하기에서 막힌 문장은 시범을 한 번 들은 뒤 다시 시도해 완성했어요. 리딩 2단계에서 시작해 말하기 비중을 조금씩 늘리는 것을 권해 드려요.`
    }
  },
  {
    key: "robot-project",
    title: "로봇·과학 프로젝트 체험수업",
    teacher: "박지훈",
    durationMinutes: 90,
    capacity: 3,
    weekdays: [0, 3, 6],
    times: ["10:00", "14:00"],
    grades: ["elem_3", "elem_4", "elem_5", "elem_6"],
    report: {
      observations: [
        "coding_it_robotics_explored_task",
        "coding_it_robotics_located_error",
        "coding_it_robotics_checked_changed_result"
      ],
      course: "로봇 프로젝트반",
      level: "센서 기초",
      schedule: "토 10:00",
      summary: (name) =>
        `${name} 학생은 센서를 연결하는 순서를 먼저 꼼꼼히 살펴본 뒤 조립을 시작했어요. 로봇이 생각대로 멈추지 않자 센서 거리 값을 의심하고 직접 바꿔 보았고, 바꾼 뒤 다시 달려 보며 결과를 확인했어요. 만들기 몰입도가 높아 프로젝트반에서 센서 활용을 넓혀 가면 좋겠어요.`
    }
  }
]
// ──────────────────────────────────────────────────────────────────────────

const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL"
const SERVICE_ROLE_ENV = "SUPABASE_SERVICE_ROLE_KEY"
const PUBLISHABLE_KEY_ENV = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
const CONFIRM_ENV = "DEMO_REFRESH_CONFIRM"
const DATE_ENV = "DEMO_REFRESH_DATE"

const NOT_ENROLLED_REASONS = [
  "schedule_mismatch",
  "price_burden",
  "distance_or_transport",
  "child_fit",
  "no_suitable_program",
  "chose_other_academy",
  "schedule_changed",
  "no_current_enrollment_plan",
  "other"
] as const
const PENDING_REASONS = ["schedule_coordination", "price_consideration", "discussing_with_family", "comparing_academies"] as const

const STATUS_NOTES = {
  confirmed: "teacher가 체험 신청 일정을 확정했습니다.",
  completed: "teacher가 체험 진행 완료 처리했습니다."
} as const

// 지난 달들의 목표. total 은 그 달 체험 완료 수(이미 있는 행 포함), rate 는 등록 비율.
const PAST_MONTH_TARGETS: Record<number, { total: number; rate: number; pending: number }> = {
  5: { total: 8, rate: 0.38, pending: 0 },
  4: { total: 9, rate: 0.44, pending: 0 },
  3: { total: 10, rate: 0.5, pending: 0 },
  2: { total: 9, rate: 0.33, pending: 1 },
  1: { total: 11, rate: 0.45, pending: 2 }
}
const CURRENT_MONTH_HISTORY = 12
const CURRENT_MONTH_RATE = 0.4

const CHILD_NAME_POOL = [
  "하린", "도현", "지안", "시우", "유나", "은호", "채아", "건우", "소율", "태윤",
  "다인", "로하", "주원", "서아", "이안", "윤호", "나은", "현우", "예린", "준서",
  "하람", "지유", "시현", "다율", "민준", "수빈", "태오", "아윤", "도하", "세아",
  "재윤", "하엘", "규리", "선우", "라온", "이현", "보민", "채윤", "우진", "다빈",
  "승아", "지후", "리아", "해솔", "민호", "서율", "단우", "유진", "나윤", "범준",
  "소은", "정우", "하유", "시아", "강민", "유하", "도원", "가은", "태린", "효주",
  "주하", "은채", "승민", "윤아", "지성", "다현", "로운", "하빈", "세윤", "준혁"
]
const GUARDIAN_NAME_POOL = [
  "김지현", "이수정", "박민영", "최은경", "정혜원", "강선영", "조미진", "윤서희", "장유리", "임하나",
  "한정아", "오세라", "서윤정", "신혜진", "권나래", "황보영", "안지은", "송현주", "류다영", "전소라"
]

type Layer = "today" | "permanent" | "history"
type RegistrationStatus = "undecided" | "enrolled" | "not_enrolled" | "pending"
type StoryKind = "new" | "confirm" | "completed"

type ContactPreference = {
  version: 1
  state: "specified"
  groups: Array<{ dayMode: "selected"; days: number[]; timeMode: "after" | "range"; startTime: string; endTime: string | null }>
}

type Story = {
  key: string
  layer: Layer
  section: string
  classKey: ClassKey
  parentKey: ParentKey
  childName: string
  childGrade: string
  guardianName: string
  createdAt: string
  slotDate: string
  slotTime: string
  assignTeacher: boolean
  kind: StoryKind
  childNotes: string | null
  goalNote: string | null
  registration: { status: RegistrationStatus; reasonIds: string[]; at: string | null; note: string | null }
  record: boolean
  report: boolean
  // 학부모 화면의 "체험 의견 보내기" — 의견과 의향을 한 번에 낸다. 리포트가 발행된 신청에만 낼 수 있다.
  parentSubmission: { chips: string[]; note: string | null; decision: "planned" | "considering" } | null
  contact: { occurredAt: string; note: string; preference: ContactPreference | null; preferenceNote: string | null } | null
  nextContact: { on: string; note: string } | null
}

type DemoClassRow = { id: string; title: string; teacher_id: string | null; is_active: boolean; archived_at: string | null }
type TeacherRow = { id: string; display_name: string; phone: string | null }
type ApplicationRow = {
  id: string
  parent_id: string | null
  class_id: string
  child_name: string | null
  status: string
  registration_status: string
  created_at: string
  confirmed_slot_at: string | null
  requested_schedule_block_id: string | null
  confirmed_schedule_block_id: string | null
  no_show_at: string | null
  canceled_at: string | null
  classes: { organization_id: string; title: string }
}
type ApplicationFlags = ApplicationRow & { hasResult: boolean; hasReport: boolean }

type Context = {
  organizationId: string
  academyUserId: string
  parentIds: Record<ParentKey, string>
  classes: Record<ClassKey, DemoClassRow>
  teachers: Record<TeacherName, TeacherRow>
}

type DeletionPlan = {
  applications: ApplicationFlags[]
  dependents: Record<string, number>
  blockIds: string[]
}

type Counter = Record<string, number>

// ── 공통 ──────────────────────────────────────────────────────────────────

const readRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`)
  }
  return value
}

// asserts 반환형은 화살표 함수로 선언하면 호출부에서 쓸 수 없다(TS2775).
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const bump = (counter: Counter, key: string, by = 1) => {
  counter[key] = (counter[key] ?? 0) + by
}

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const todayKst = () => new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10)
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
const kstIso = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`).toISOString()
const kstDateOf = (iso: string) => new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString().slice(0, 10)
const addMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60 * 1000).toISOString()
const addTime = (time: string, minutes: number) => {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}
const monthOf = (date: string) => date.slice(0, 7)
const shiftMonth = (month: string, delta: number) => {
  const [year, mon] = month.split("-").map(Number)
  const index = year * 12 + (mon - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}
const daysInMonth = (month: string) => {
  const [year, mon] = month.split("-").map(Number)
  return new Date(Date.UTC(year, mon, 0)).getUTCDate()
}
const scheduleLabel = (date: string, start: string, end: string) => `${date.replace(/-/g, ".")} ${start}~${end}`

const resolveAnchorDate = () => {
  const raw = process.env[DATE_ENV]?.trim()
  if (!raw) {
    return todayKst()
  }
  assert(/^\d{4}-\d{2}-\d{2}$/.test(raw) && addDays(raw, 0) === raw, `${DATE_ENV} 는 YYYY-MM-DD 형식이어야 합니다.`)
  return raw
}

const classPlan = (key: ClassKey) => {
  const plan = DEMO_CLASSES.find((item) => item.key === key)
  assert(plan, `수업 정의가 없습니다: ${key}`)
  return plan
}

const createServiceClient = () =>
  createClient(readRequiredEnv(SUPABASE_URL_ENV), readRequiredEnv(SERVICE_ROLE_ENV), {
    auth: { persistSession: false, autoRefreshToken: false }
  })

// 비밀번호 없이 그 계정의 세션을 만든다. generateLink 는 메일을 보내지 않는다.
// 끝날 때 scope=local 로 이 세션만 닫는다(같은 계정의 다른 로그인은 그대로 둔다).
const signInAs = async (admin: SupabaseClient, email: string) => {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  if (error) {
    throw new Error(`${email} 세션 토큰 생성 실패: ${error.message}`)
  }
  const client = createClient(readRequiredEnv(SUPABASE_URL_ENV), readRequiredEnv(PUBLISHABLE_KEY_ENV), {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const verified = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" })
  if (verified.error || !verified.data.session) {
    throw new Error(`${email} 세션 확인 실패: ${verified.error?.message ?? "no_session"}`)
  }
  return client
}

const callRpc = async <T = unknown>(client: SupabaseClient, name: string, args: Record<string, unknown>) => {
  const { data, error } = await client.rpc(name, args)
  if (error) {
    throw new Error(`${name} 실패: ${error.message}`)
  }
  return data as T
}

const must = <T>(result: { data: T | null; error: { message: string } | null }, label: string): T => {
  if (result.error) {
    throw new Error(`${label} 실패: ${result.error.message}`)
  }
  return result.data as T
}

const listUserIdByEmail = async (admin: SupabaseClient) => {
  const ids = new Map<string, string>()
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      throw new Error(`Auth 사용자 조회 실패: ${error.message}`)
    }
    for (const user of data.users) {
      if (user.email) {
        ids.set(user.email, user.id)
      }
    }
    if (data.users.length < 200) {
      return ids
    }
  }
}

// ── 1. 읽기: 대상 확인 ─────────────────────────────────────────────────────

const loadContext = async (admin: SupabaseClient): Promise<Context> => {
  const userIds = await listUserIdByEmail(admin)
  const academyUserId = userIds.get(DEMO_ACADEMY_EMAIL)
  assert(academyUserId, `${DEMO_ACADEMY_EMAIL} 계정이 없습니다.`)

  const profile = must(
    await admin.from("profiles").select("id, role, organization_id").eq("id", academyUserId).maybeSingle(),
    "학원 프로필 조회"
  ) as { role: string; organization_id: string | null } | null
  assert(profile?.role === "academy" && profile.organization_id, "데모 학원 계정이 academy 조직 계정이 아닙니다.")

  const organization = must(
    await admin.from("organizations").select("id, name, branch_name").eq("id", profile.organization_id).single(),
    "조직 조회"
  ) as { id: string; name: string; branch_name: string | null }
  assert(
    organization.name === DEMO_ORGANIZATION_NAME && organization.branch_name === DEMO_BRANCH_NAME,
    `데모 학원 계정의 조직이 ${DEMO_ORGANIZATION_NAME} ${DEMO_BRANCH_NAME} 이 아닙니다: ${organization.name}`
  )

  const parentIds = {} as Record<ParentKey, string>
  for (const parent of DEMO_PARENTS) {
    const id = userIds.get(parent.email)
    assert(id, `${parent.email} 계정이 없습니다.`)
    const row = must(await admin.from("profiles").select("role").eq("id", id).single(), "학부모 프로필 조회") as {
      role: string
    }
    assert(row.role === "parent", `${parent.email} 이 parent 계정이 아닙니다.`)
    parentIds[parent.key] = id
  }

  const classRows = must(
    await admin
      .from("classes")
      .select("id, title, teacher_id, is_active, archived_at")
      .eq("organization_id", organization.id)
      .in("title", DEMO_CLASSES.map((item) => item.title)),
    "수업 조회"
  ) as DemoClassRow[]
  const classes = {} as Record<ClassKey, DemoClassRow>
  for (const plan of DEMO_CLASSES) {
    const matches = classRows.filter((row) => row.title === plan.title)
    assert(matches.length === 1, `수업 "${plan.title}" 이 정확히 1개여야 합니다. actual=${matches.length}`)
    assert(!matches[0].archived_at, `수업 "${plan.title}" 이 보관 상태입니다.`)
    classes[plan.key] = matches[0]
  }

  const teacherRows = must(
    await admin
      .from("teachers")
      .select("id, display_name, phone")
      .eq("organization_id", organization.id)
      .in("display_name", Object.keys(DEMO_TEACHER_PHONES)),
    "선생님 조회"
  ) as TeacherRow[]
  const teachers = {} as Record<TeacherName, TeacherRow>
  for (const name of Object.keys(DEMO_TEACHER_PHONES) as TeacherName[]) {
    const matches = teacherRows.filter((row) => row.display_name === name)
    assert(matches.length === 1, `선생님 "${name}" 이 정확히 1명이어야 합니다. actual=${matches.length}`)
    teachers[name] = matches[0]
  }

  return { organizationId: organization.id, academyUserId, parentIds, classes, teachers }
}

const loadApplications = async (admin: SupabaseClient, ctx: Context): Promise<ApplicationFlags[]> => {
  const rows = must(
    await admin
      .from("trial_applications")
      .select(
        "id, parent_id, class_id, child_name, status, registration_status, created_at, confirmed_slot_at, requested_schedule_block_id, confirmed_schedule_block_id, no_show_at, canceled_at, classes!inner(organization_id, title)"
      )
      .eq("classes.organization_id", ctx.organizationId),
    "신청 조회"
  ) as unknown as ApplicationRow[]
  const ids = rows.map((row) => row.id)
  const resultIds = new Set(
    (must(await admin.from("trial_results").select("application_id").in("application_id", ids), "기록 조회") as Array<{
      application_id: string
    }>).map((row) => row.application_id)
  )
  const reportIds = new Set(
    (must(
      await admin.from("experience_reports").select("application_id").in("application_id", ids),
      "리포트 조회"
    ) as Array<{ application_id: string }>).map((row) => row.application_id)
  )
  return rows.map((row) => ({ ...row, hasResult: resultIds.has(row.id), hasReport: reportIds.has(row.id) }))
}

const isDemoParent = (ctx: Context, parentId: string | null) =>
  parentId != null && Object.values(ctx.parentIds).includes(parentId)

const countIn = async (admin: SupabaseClient, table: string, column: string, ids: string[]) => {
  if (ids.length === 0) {
    return 0
  }
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).in(column, ids)
  if (error) {
    throw new Error(`${table} 집계 실패: ${error.message}`)
  }
  return count ?? 0
}

const DEPENDENT_TABLES: Array<{ table: string; column: string; note: string }> = [
  { table: "application_logs", column: "application_id", note: "cascade" },
  { table: "consultation_logs", column: "application_id", note: "cascade" },
  { table: "experience_feedback", column: "application_id", note: "cascade" },
  { table: "parent_confirmed_push_deliveries", column: "application_id", note: "cascade" },
  { table: "parent_event_push_deliveries", column: "application_id", note: "cascade" },
  { table: "recontact_recipients", column: "application_id", note: "cascade" },
  { table: "parent_decisions", column: "application_id", note: "먼저 삭제" },
  { table: "registration_results", column: "application_id", note: "먼저 삭제" },
  { table: "studio_academy_memos", column: "application_id", note: "먼저 삭제" },
  { table: "parent_report_engagement", column: "application_id", note: "먼저 삭제" },
  { table: "report_attachment_files", column: "application_id", note: "있으면 중단" },
  { table: "sms_logs", column: "trial_application_id", note: "먼저 삭제" },
  { table: "schedule_blocks", column: "related_application_id", note: "먼저 삭제" },
  { table: "studio_import_rows", column: "application_id", note: "있으면 중단" }
]

const planDeletion = async (admin: SupabaseClient, ctx: Context, applications: ApplicationFlags[]): Promise<DeletionPlan> => {
  const targets = applications.filter(
    (row) => isDemoParent(ctx, row.parent_id) && !row.hasResult && !row.hasReport
  )
  // 지울 행이 전부 데모 학원 + 데모 학부모 것인지 한 번 더 본다.
  for (const row of targets) {
    assert(row.classes.organization_id === ctx.organizationId, `데모 학원 밖의 신청이 섞였습니다: ${row.id}`)
    assert(isDemoParent(ctx, row.parent_id), `데모 학부모 밖의 신청이 섞였습니다: ${row.id}`)
  }
  const ids = targets.map((row) => row.id)
  const dependents: Record<string, number> = { trial_applications: ids.length }
  for (const item of DEPENDENT_TABLES) {
    dependents[item.table] = await countIn(admin, item.table, item.column, ids)
  }
  assert(dependents.report_attachment_files === 0, "지울 신청에 리포트 사진이 있습니다. 저장소 정리가 필요해 멈춥니다.")
  assert(dependents.studio_import_rows === 0, "지울 신청에 예약 가져오기 행이 있습니다. 멈춥니다.")

  // 지울 신청이 잡고 있던 선생님 시간 블록. 지운 뒤 아무도 참조하지 않으면 함께 지운다.
  const blockIds = [
    ...new Set(
      targets.flatMap((row) => [row.confirmed_schedule_block_id, row.requested_schedule_block_id]).filter(
        (id): id is string => Boolean(id)
      )
    )
  ]
  const keptBlockRefs = new Set(
    applications
      .filter((row) => !ids.includes(row.id))
      .flatMap((row) => [row.confirmed_schedule_block_id, row.requested_schedule_block_id])
      .filter((id): id is string => Boolean(id))
  )
  const orphanBlockIds = blockIds.filter((id) => !keptBlockRefs.has(id))
  dependents["schedule_blocks(신청이 잡던 시간)"] = orphanBlockIds.length

  return { applications: targets, dependents, blockIds: orphanBlockIds }
}

// ── 2. 계획: 신청 이야기 ───────────────────────────────────────────────────

const baseStory = (input: Partial<Story> & Pick<Story, "key" | "layer" | "section" | "classKey" | "parentKey" | "childName" | "createdAt" | "slotDate" | "slotTime" | "kind">): Story => ({
  childGrade: classPlan(input.classKey).grades[0],
  guardianName: GUARDIAN_NAME_POOL[0],
  assignTeacher: true,
  childNotes: null,
  goalNote: null,
  registration: { status: "undecided", reasonIds: [], at: null, note: null },
  record: false,
  report: false,
  parentSubmission: null,
  contact: null,
  nextContact: null,
  ...input
})

type NamePicker = { child: () => string; guardian: () => string; grade: (classKey: ClassKey) => string }

const createNamePicker = (reserved: Set<string>): NamePicker => {
  const children = CHILD_NAME_POOL.filter((name) => !reserved.has(name))
  let childIndex = 0
  let guardianIndex = 0
  const gradeIndex: Partial<Record<ClassKey, number>> = {}
  return {
    child: () => {
      assert(childIndex < children.length, "학생 이름 목록이 모자랍니다.")
      return children[childIndex++]
    },
    guardian: () => GUARDIAN_NAME_POOL[guardianIndex++ % GUARDIAN_NAME_POOL.length],
    grade: (classKey) => {
      const grades = classPlan(classKey).grades
      const index = gradeIndex[classKey] ?? 0
      gradeIndex[classKey] = index + 1
      return grades[index % grades.length]
    }
  }
}

// 이력 층 — 처음 한 번만 만든다. 이름은 이 목록에서만 쓴다.
const PERMANENT_NAMES = {
  reportA: "윤슬",
  reportB: "새봄",
  registrationA: "이든",
  registrationB: "온유",
  consideringA: "보람",
  consideringB: "누리"
} as const

const buildPermanentStories = (anchor: string, reportStoriesNeeded: number): Story[] => {
  const d = (offset: number) => addDays(anchor, offset)
  const stories: Story[] = []
  const reportStories: Story[] = [
    baseStory({
      key: "permanent-report-a",
      layer: "permanent",
      section: "리포트 보내기",
      classKey: "python-coding",
      parentKey: "parent-1",
      childName: PERMANENT_NAMES.reportA,
      childGrade: "elem_4",
      guardianName: "문하영",
      createdAt: kstIso(d(-6), "21:10"),
      slotDate: d(-1),
      slotTime: "11:00",
      kind: "completed",
      childNotes: "블록코딩을 1년 정도 했어요.",
      goalNote: "텍스트 코딩으로 넘어갈 수 있는지 궁금해요.",
      record: true
    }),
    baseStory({
      key: "permanent-report-b",
      layer: "permanent",
      section: "리포트 보내기",
      classKey: "english-level-test",
      parentKey: "parent-2",
      childName: PERMANENT_NAMES.reportB,
      childGrade: "elem_3",
      guardianName: "배수민",
      createdAt: kstIso(d(-7), "09:30"),
      slotDate: d(-2),
      slotTime: "15:00",
      kind: "completed",
      record: true
    })
  ]
  stories.push(...reportStories.slice(0, reportStoriesNeeded))
  stories.push(
    baseStory({
      key: "permanent-registration-a",
      layer: "permanent",
      section: "등록 결과(학부모 의견 있음)",
      classKey: "thinking-math",
      parentKey: "parent-1",
      childName: PERMANENT_NAMES.registrationA,
      childGrade: "elem_2",
      guardianName: "홍채원",
      createdAt: kstIso(d(-9), "20:15"),
      slotDate: d(-4),
      slotTime: "16:00",
      kind: "completed",
      childNotes: "연산은 빠른데 서술형 문제를 어려워해요.",
      goalNote: "생각을 말로 설명하는 힘을 기르고 싶어요.",
      record: true,
      report: true,
      parentSubmission: {
        chips: ["child_enjoyed", "kind_teacher", "specific_feedback"],
        note: "아이가 집에 와서도 도형 문제 이야기를 계속했어요. 리포트에 적어 주신 부분이 평소 모습과 똑같아서 믿음이 갔습니다.",
        decision: "planned"
      }
    }),
    baseStory({
      key: "permanent-registration-b",
      layer: "permanent",
      section: "등록 결과",
      classKey: "robot-project",
      parentKey: "parent-2",
      childName: PERMANENT_NAMES.registrationB,
      childGrade: "elem_5",
      guardianName: "남궁연",
      createdAt: kstIso(d(-11), "12:40"),
      slotDate: d(-6),
      slotTime: "14:00",
      kind: "completed",
      record: true,
      report: true
    }),
    baseStory({
      key: "permanent-considering-a",
      layer: "permanent",
      section: "다시 연락(고민 중 + 희망 요일)",
      classKey: "thinking-math",
      parentKey: "parent-2",
      childName: PERMANENT_NAMES.consideringA,
      childGrade: "elem_3",
      guardianName: "진아름",
      createdAt: kstIso(d(-14), "19:05"),
      slotDate: d(-9),
      slotTime: "17:00",
      kind: "completed",
      registration: { status: "pending", reasonIds: ["schedule_coordination"], at: null, note: "화·목 저녁반이 열리면 바로 시작하고 싶어 하셨어요." },
      record: true,
      report: true,
      parentSubmission: { chips: ["child_participated", "clear_instruction"], note: "아이는 재미있어했는데 요일이 맞을지 조금 더 볼게요.", decision: "considering" },
      contact: {
        occurredAt: kstIso(d(-7), "17:30"),
        note: "리포트 보시고 전화 주셨어요. 수업은 마음에 드는데 지금 반 시간이 학교 방과후와 겹친다고 하셨어요.",
        preference: {
          version: 1,
          state: "specified",
          groups: [{ dayMode: "selected", days: [2, 4], timeMode: "after", startTime: "17:00", endTime: null }]
        },
        preferenceNote: "화·목 5시 이후"
      }
    }),
    baseStory({
      key: "permanent-considering-b",
      layer: "permanent",
      section: "다시 연락(고민 중 + 희망 요일)",
      classKey: "english-level-test",
      parentKey: "parent-1",
      childName: PERMANENT_NAMES.consideringB,
      childGrade: "elem_4",
      guardianName: "표은서",
      createdAt: kstIso(d(-16), "08:20"),
      slotDate: d(-12),
      slotTime: "15:00",
      kind: "completed",
      registration: { status: "pending", reasonIds: ["price_consideration"], at: null, note: "형제 할인 여부를 다시 안내드리기로 했어요." },
      record: true,
      report: true,
      parentSubmission: { chips: ["good_level_fit", "kind_consultation"], note: null, decision: "considering" },
      contact: {
        occurredAt: kstIso(d(-10), "11:00"),
        note: "레벨테스트 결과에 만족하셨고, 토요일 오전반이면 형제가 같이 다닐 수 있을지 고민 중이세요.",
        preference: {
          version: 1,
          state: "specified",
          groups: [{ dayMode: "selected", days: [6], timeMode: "range", startTime: "10:00", endTime: "12:00" }]
        },
        preferenceNote: "토요일 오전"
      }
    })
  )
  return stories
}

const buildTodayStories = (anchor: string, names: NamePicker): Story[] => {
  const d = (offset: number) => addDays(anchor, offset)
  const story = (input: Parameters<typeof baseStory>[0]) =>
    baseStory({ childGrade: names.grade(input.classKey), guardianName: names.guardian(), ...input })
  return [
    // 홈 "가장 먼저" · 4칸 "일정 확정" — 새 신청 2건. 희망 시간은 리마인더와 무관하게 멀리 둔다.
    story({
      key: "today-new-a",
      layer: "today",
      section: "새 신청(2일째 대기)",
      classKey: "thinking-math",
      parentKey: "parent-1",
      childName: names.child(),
      createdAt: kstIso(d(-2), "21:40"),
      slotDate: d(9),
      slotTime: "16:00",
      kind: "new",
      assignTeacher: false,
      childNotes: "수학은 좋아하는데 문제를 끝까지 읽지 않을 때가 있어요.",
      goalNote: "사고력 수업이 아이에게 맞는지 보고 싶어요."
    }),
    story({
      key: "today-new-b",
      layer: "today",
      section: "새 신청(오늘)",
      classKey: "robot-project",
      parentKey: "parent-2",
      childName: names.child(),
      createdAt: kstIso(d(0), "07:50"),
      slotDate: d(8),
      slotTime: "14:00",
      kind: "new",
      assignTeacher: false,
      goalNote: "만들기를 좋아해서 로봇 수업을 경험해 보고 싶어요."
    }),
    // 오늘 체험 3건 — 기준일 오후. 선생님 배정 2 · 미배정 1.
    story({
      key: "today-trial-a",
      layer: "today",
      section: "오늘 체험(배정)",
      classKey: "thinking-math",
      parentKey: "parent-2",
      childName: names.child(),
      createdAt: kstIso(d(-6), "10:15"),
      slotDate: d(0),
      slotTime: "15:00",
      kind: "confirm"
    }),
    story({
      key: "today-trial-b",
      layer: "today",
      section: "오늘 체험(미배정)",
      classKey: "python-coding",
      parentKey: "parent-1",
      childName: names.child(),
      createdAt: kstIso(d(-4), "22:05"),
      slotDate: d(0),
      slotTime: "16:30",
      kind: "confirm",
      assignTeacher: false
    }),
    story({
      key: "today-trial-c",
      layer: "today",
      section: "오늘 체험(배정)",
      classKey: "english-level-test",
      parentKey: "parent-2",
      childName: names.child(),
      createdAt: kstIso(d(-3), "13:20"),
      slotDate: d(0),
      slotTime: "18:00",
      kind: "confirm"
    }),
    // 다가오는 체험 2건 — 기준일 + 6 · + 7일.
    story({
      key: "today-upcoming-a",
      layer: "today",
      section: "다가오는 확정",
      classKey: "thinking-math",
      parentKey: "parent-1",
      childName: names.child(),
      createdAt: kstIso(d(-1), "18:30"),
      slotDate: d(6),
      slotTime: "16:00",
      kind: "confirm"
    }),
    story({
      key: "today-upcoming-b",
      layer: "today",
      section: "다가오는 확정",
      classKey: "python-coding",
      parentKey: "parent-2",
      childName: names.child(),
      createdAt: kstIso(d(-2), "11:45"),
      slotDate: d(7),
      slotTime: "18:00",
      kind: "confirm"
    }),
    // 4칸 "기록 작성" — 체험은 끝났는데 완료 확인 전 1, 완료했지만 기록 전 1.
    story({
      key: "today-needs-completion",
      layer: "today",
      section: "기록 작성(완료 확인 필요)",
      classKey: "robot-project",
      parentKey: "parent-1",
      childName: names.child(),
      createdAt: kstIso(d(-5), "20:00"),
      slotDate: d(-1),
      slotTime: "14:00",
      kind: "confirm"
    }),
    story({
      key: "today-needs-record",
      layer: "today",
      section: "기록 작성",
      classKey: "english-level-test",
      parentKey: "parent-2",
      childName: names.child(),
      createdAt: kstIso(d(-6), "16:40"),
      slotDate: d(-2),
      slotTime: "11:00",
      kind: "completed"
    }),
    // 다시 연락할 학생 — 다음 연락이 기준일인 미등록 학생.
    story({
      key: "today-next-contact",
      layer: "today",
      section: "다시 연락(다음 연락 오늘)",
      classKey: "python-coding",
      parentKey: "parent-2",
      childName: names.child(),
      createdAt: kstIso(d(-15), "09:10"),
      slotDate: d(-11),
      slotTime: "18:00",
      kind: "completed",
      registration: {
        status: "not_enrolled",
        reasonIds: ["schedule_mismatch"],
        at: kstIso(d(-8), "19:00"),
        note: "평일 저녁반 시간이 학원 일정과 겹쳤어요."
      },
      contact: {
        occurredAt: kstIso(d(-8), "18:40"),
        note: "평일반은 어렵고 토요일 오전반이 생기면 다시 연락 달라고 하셨어요.",
        preference: {
          version: 1,
          state: "specified",
          groups: [{ dayMode: "selected", days: [6], timeMode: "after", startTime: "10:00", endTime: null }]
        },
        preferenceNote: "토요일 오전"
      },
      nextContact: { on: d(0), note: "토요일 오전반 개설 소식 전하기" }
    })
  ]
}

type MonthTally = { completed: number; enrolled: number }

const buildHistoryStories = (
  anchor: string,
  names: NamePicker,
  tallies: Map<string, MonthTally>,
  log: string[]
): Story[] => {
  const stories: Story[] = []
  const anchorMonth = monthOf(anchor)
  const classKeys: ClassKey[] = ["thinking-math", "python-coding", "english-level-test", "robot-project"]
  let reasonCursor = 0
  let pendingCursor = 0
  let classCursor = 0
  let parentCursor = 0

  // 등록 · 고민 중 · 미등록을 달 안에서 고르게 섞는다. 매번 목표 비율에서 가장 모자란 쪽을 고른다.
  const spreadStatuses = (count: number, enrolled: number, pending: number): RegistrationStatus[] => {
    const targets: Array<[RegistrationStatus, number]> = [
      ["enrolled", enrolled],
      ["pending", pending],
      ["not_enrolled", count - enrolled - pending]
    ]
    const assigned = new Map<RegistrationStatus, number>()
    return Array.from({ length: count }, (_, index) => {
      const [status] = targets
        .filter(([key, total]) => (assigned.get(key) ?? 0) < total)
        .sort(
          (left, right) =>
            (right[1] * (index + 1)) / count - (assigned.get(right[0]) ?? 0) -
            ((left[1] * (index + 1)) / count - (assigned.get(left[0]) ?? 0))
        )[0]
      assigned.set(status, (assigned.get(status) ?? 0) + 1)
      return status
    })
  }

  const pushMonth = (month: string, count: number, enrolled: number, pending: number, lastCreatedDay: number) => {
    const notEnrolled = count - enrolled - pending
    const span = Math.max(1, lastCreatedDay - 1)
    const statuses = spreadStatuses(count, enrolled, pending)
    for (let index = 0; index < count; index += 1) {
      const day = 1 + Math.floor((index * span) / Math.max(count, 1))
      const createdDate = `${month}-${String(day).padStart(2, "0")}`
      const slotDate = addDays(createdDate, 3 + (index % 2))
      const classKey = classKeys[classCursor++ % classKeys.length]
      const plan = classPlan(classKey)
      const slotTime = plan.times[index % plan.times.length]
      const resolvedAt = kstIso(addDays(slotDate, 2 + (index % 3)), "19:00")
      const status = statuses[index]
      const registration =
        status === "enrolled"
          ? { status, reasonIds: [], at: resolvedAt, note: null }
          : status === "pending"
            ? { status, reasonIds: [PENDING_REASONS[pendingCursor++ % PENDING_REASONS.length]], at: null, note: null }
            : { status, reasonIds: [NOT_ENROLLED_REASONS[reasonCursor++ % NOT_ENROLLED_REASONS.length]], at: resolvedAt, note: null }
      stories.push(
        baseStory({
          key: `history-${month}-${index + 1}`,
          layer: "history",
          section: `이력 ${month}`,
          classKey,
          parentKey: parentCursor++ % 2 === 0 ? "parent-1" : "parent-2",
          childName: names.child(),
          childGrade: names.grade(classKey),
          guardianName: names.guardian(),
          createdAt: kstIso(createdDate, ["09:20", "13:40", "20:10", "22:30"][index % 4]),
          slotDate,
          slotTime,
          kind: "completed",
          registration
        })
      )
    }
    log.push(`  ${month}: 새 이력 ${count}건 (등록 ${enrolled} · 고민 중 ${pending} · 미등록 ${notEnrolled})`)
  }

  for (const offset of [5, 4, 3, 2, 1]) {
    const month = shiftMonth(anchorMonth, -offset)
    const target = PAST_MONTH_TARGETS[offset]
    const existing = tallies.get(month) ?? { completed: 0, enrolled: 0 }
    const count = Math.min(12, Math.max(0, target.total - existing.completed))
    const enrolled = Math.min(count, Math.max(0, Math.round(target.rate * (existing.completed + count)) - existing.enrolled))
    const pending = Math.min(target.pending, count - enrolled)
    pushMonth(month, count, enrolled, pending, daysInMonth(month) - 5)
  }

  // 이번 달 — 다른 행(이미 있는 행 + 위 이야기)을 포함해 전환율이 40% 안팎이 되도록 등록 수를 고른다.
  // 이력 체험은 기준일 11일 전까지만 둔다(오늘 층 이야기와 날짜가 겹치지 않게).
  const anchorDay = Number(anchor.slice(8, 10))
  const lastCreatedDay = anchorDay - 15
  const count = Math.max(0, Math.min(CURRENT_MONTH_HISTORY, lastCreatedDay))
  const existing = tallies.get(anchorMonth) ?? { completed: 0, enrolled: 0 }
  const enrolled = Math.min(count, Math.max(0, Math.round(CURRENT_MONTH_RATE * (existing.completed + count)) - existing.enrolled))
  if (count === 0) {
    log.push(`  ${anchorMonth}: 기준일이 월초라 이번 달 이력을 만들지 않습니다.`)
  } else {
    pushMonth(anchorMonth, count, enrolled, 0, lastCreatedDay)
  }

  return stories
}

// ── 3. 쓰기 ────────────────────────────────────────────────────────────────

const deleteIn = async (admin: SupabaseClient, table: string, column: string, ids: string[], counter: Counter) => {
  if (ids.length === 0) {
    return
  }
  const { data, error } = await admin.from(table).delete().in(column, ids).select("*")
  if (error) {
    throw new Error(`${table} 삭제 실패: ${error.message}`)
  }
  bump(counter, table, data?.length ?? 0)
}

const executeDeletion = async (admin: SupabaseClient, ctx: Context, plan: DeletionPlan, counter: Counter) => {
  const ids = plan.applications.map((row) => row.id)
  if (ids.length === 0) {
    return
  }
  // RESTRICT/NO ACTION FK 와 trial_booked 블록 check 때문에 신청보다 먼저 지운다.
  for (const table of ["parent_decisions", "registration_results", "studio_academy_memos", "parent_report_engagement"]) {
    await deleteIn(admin, table, "application_id", ids, counter)
  }
  await deleteIn(admin, "sms_logs", "trial_application_id", ids, counter)
  await deleteIn(admin, "schedule_blocks", "related_application_id", ids, counter)
  await deleteIn(admin, "trial_applications", "id", ids, counter)

  // 다른 조직 · 다른 신청이 아직 참조하는 블록은 남긴다.
  const stillReferenced = new Set<string>()
  if (plan.blockIds.length > 0) {
    for (const column of ["confirmed_schedule_block_id", "requested_schedule_block_id"]) {
      const rows = must(
        await admin.from("trial_applications").select(column).in(column, plan.blockIds),
        "블록 참조 확인"
      ) as unknown as Array<Record<string, string>>
      for (const row of rows) {
        stillReferenced.add(row[column])
      }
    }
  }
  const orphanBlockIds = plan.blockIds.filter((id) => !stillReferenced.has(id))
  if (orphanBlockIds.length > 0) {
    const teacherIds = Object.values(ctx.teachers).map((row) => row.id)
    const { data, error } = await admin
      .from("schedule_blocks")
      .delete()
      .in("id", orphanBlockIds)
      .in("teacher_id", teacherIds)
      .in("type", ["available", "trial_booked"])
      .select("id")
    if (error) {
      throw new Error(`신청이 잡던 시간 블록 삭제 실패: ${error.message}`)
    }
    bump(counter, "schedule_blocks", data?.length ?? 0)
  }
}

const updatePhones = async (admin: SupabaseClient, ctx: Context, counter: Counter) => {
  for (const parent of DEMO_PARENTS) {
    must(await admin.from("profiles").update({ phone: parent.phone }).eq("id", ctx.parentIds[parent.key]).select("id"), "학부모 번호 변경")
    bump(counter, "profiles.phone")
  }
  for (const [name, phone] of Object.entries(DEMO_TEACHER_PHONES) as Array<[TeacherName, string]>) {
    must(await admin.from("teachers").update({ phone }).eq("id", ctx.teachers[name].id).select("id"), "선생님 번호 변경")
    bump(counter, "teachers.phone")
  }
}

const ensureClassesPublic = async (
  admin: SupabaseClient,
  academy: SupabaseClient,
  ctx: Context,
  counter: Counter
) => {
  for (const plan of DEMO_CLASSES) {
    const row = ctx.classes[plan.key]
    const rule = must(
      await admin.from("class_operating_rules").select("revision, operation_type, is_active").eq("class_id", row.id).maybeSingle(),
      "운영 규칙 조회"
    ) as { revision: number; operation_type: string; is_active: boolean } | null
    if (row.is_active && rule?.operation_type === "rolling" && rule.is_active) {
      continue
    }
    const seriesId = randomUUID()
    const slots = plan.weekdays.flatMap((weekday) =>
      plan.times.map((startTime) => ({
        weekday,
        startTime,
        endTime: addTime(startTime, plan.durationMinutes),
        capacity: plan.capacity,
        seriesId
      }))
    )
    // Studio 수업 저장과 같은 RPC. 상시 운영(rolling)은 오늘부터 90일치 예약 시간을 만든다.
    await callRpc(academy, "save_studio_class_operating_rule", {
      p_class_id: row.id,
      p_fields: { organization_id: ctx.organizationId, is_active: true, trial_price_confirmed_at: new Date().toISOString() },
      p_rule: { operationType: "rolling", startDate: todayKst(), endDate: null, slots },
      p_expected_revision: rule?.revision ?? 0,
      p_manual_slots: []
    })
    bump(counter, "classes(공개 + 상시 운영)")
  }
}

const PUSH_JOB_TABLES = ["parent_confirmed_push_deliveries", "parent_event_push_deliveries"] as const

// 워커가 집기 전에 지운다. 이미 집어 간(pending 이 아닌) 작업은 건드리지 않는다.
const dropPendingPushJobs = async (admin: SupabaseClient, column: "application_id" | "parent_id", ids: string[], counter: Counter) => {
  for (const table of PUSH_JOB_TABLES) {
    const { data, error } = await admin.from(table).delete().in(column, ids).eq("state", "pending").select("id")
    if (error) {
      throw new Error(`${table} 대기 작업 삭제 실패: ${error.message}`)
    }
    bump(counter, `${table}(발송 전 삭제)`, data?.length ?? 0)
  }
}

const ensureClassSchedule = async (admin: SupabaseClient, classId: string, plan: DemoClassPlan, date: string, start: string, counter: Counter) => {
  const existing = must(
    await admin
      .from("class_schedules")
      .select("id, booking_status, end_time")
      .eq("class_id", classId)
      .eq("specific_date", date)
      .eq("start_time", `${start}:00`)
      .maybeSingle(),
    "예약 시간 조회"
  ) as { id: string; booking_status: string; end_time: string } | null
  if (existing) {
    assert(existing.booking_status === "open", `예약 시간이 열려 있지 않습니다: ${date} ${start}`)
    return existing.id
  }
  // 규칙이 만들지 않은 요일 · 시각이면 그 시각만 직접 연다.
  const inserted = must(
    await admin
      .from("class_schedules")
      .insert({
        class_id: classId,
        schedule_type: "one_time",
        specific_date: date,
        start_time: start,
        end_time: addTime(start, plan.durationMinutes),
        capacity: plan.capacity,
        booking_status: "open",
        display_label: scheduleLabel(date, start, addTime(start, plan.durationMinutes))
      })
      .select("id")
      .single(),
    "예약 시간 추가"
  ) as { id: string }
  bump(counter, "class_schedules")
  return inserted.id
}

const createStory = async (
  admin: SupabaseClient,
  academy: SupabaseClient,
  parents: Record<ParentKey, SupabaseClient>,
  ctx: Context,
  story: Story,
  counter: Counter
) => {
  const plan = classPlan(story.classKey)
  const classRow = ctx.classes[story.classKey]
  const teacher = ctx.teachers[plan.teacher]
  const parent = DEMO_PARENTS.find((item) => item.key === story.parentKey)
  assert(parent, `학부모 정의가 없습니다: ${story.parentKey}`)
  const startAt = kstIso(story.slotDate, story.slotTime)
  const endTime = addTime(story.slotTime, plan.durationMinutes)
  const endAt = kstIso(story.slotDate, endTime)
  const label = scheduleLabel(story.slotDate, story.slotTime, endTime)

  const base = {
    parent_id: ctx.parentIds[story.parentKey],
    class_id: classRow.id,
    child_name: story.childName,
    child_grade: story.childGrade,
    parent_name: story.guardianName,
    parent_phone: parent.phone,
    child_notes: story.childNotes,
    goal_note: story.goalNote,
    requested_slot_at: startAt,
    selected_schedule_label: label,
    created_at: story.createdAt,
    last_activity_at: story.createdAt
  }

  let applicationId: string
  if (story.kind === "completed") {
    // 지난 체험은 실제 진행 기록처럼 선생님 시간 블록 + 확정 · 완료 로그를 함께 남긴다.
    const block = must(
      await admin
        .from("schedule_blocks")
        .insert({ teacher_id: teacher.id, class_id: classRow.id, type: "available", start_at: startAt, end_at: endAt, capacity: 1 })
        .select("id")
        .single(),
      "선생님 시간 블록 추가"
    ) as { id: string }
    bump(counter, "schedule_blocks")
    const scheduledAt = addMinutes(story.createdAt, 95)
    const completedAt = addMinutes(endAt, 10)
    const registration = story.registration
    const inserted = must(
      await admin
        .from("trial_applications")
        .insert({
          ...base,
          status: "completed",
          requested_schedule_block_id: block.id,
          confirmed_schedule_block_id: block.id,
          confirmed_slot_at: startAt,
          assigned_teacher_id: teacher.id,
          contacted_at: scheduledAt,
          scheduled_at: scheduledAt,
          completed_at: completedAt,
          registration_status: registration.status,
          registration_reason_ids: registration.reasonIds,
          registration_note: registration.note,
          enrolled_at: registration.status === "enrolled" ? registration.at : null,
          lost_at: registration.status === "not_enrolled" ? registration.at : null,
          registered_course: registration.status === "enrolled" ? plan.report.course : null,
          last_activity_at: registration.at ?? completedAt
        })
        .select("id")
        .single(),
      `신청 추가(${story.key})`
    ) as { id: string }
    applicationId = inserted.id
    bump(counter, "trial_applications")
    if (registration.status === "enrolled" || registration.status === "not_enrolled") {
      bump(counter, "registration_results(트리거)")
    }
    must(
      await admin.from("application_logs").insert([
        { application_id: applicationId, from_status: "new", to_status: "confirmed", actor_id: ctx.academyUserId, note: STATUS_NOTES.confirmed, created_at: scheduledAt },
        { application_id: applicationId, from_status: "confirmed", to_status: "completed", actor_id: ctx.academyUserId, note: STATUS_NOTES.completed, created_at: completedAt }
      ]),
      "상태 로그 추가"
    )
    bump(counter, "application_logs", 2)
  } else {
    const scheduleId = await ensureClassSchedule(admin, classRow.id, plan, story.slotDate, story.slotTime, counter)
    const inserted = must(
      await admin
        .from("trial_applications")
        .insert({ ...base, status: "new", class_schedule_id: scheduleId })
        .select("id, updated_at")
        .single(),
      `신청 추가(${story.key})`
    ) as { id: string; updated_at: string }
    applicationId = inserted.id
    bump(counter, "trial_applications")
    if (story.kind === "confirm") {
      // Studio "일정 확정" 과 같은 RPC. 확정 로그 · 선생님 시간 블록은 RPC 가 만든다.
      await callRpc(academy, "set_studio_application_schedule", {
        p_application_id: applicationId,
        p_operation: "confirm",
        p_teacher_id: story.assignTeacher ? teacher.id : null,
        p_expected_updated_at: inserted.updated_at
      })
      bump(counter, "application_logs")
      await dropPendingPushJobs(admin, "application_id", [applicationId], counter)
    }
  }

  await completeStorySteps(admin, academy, parents, story, applicationId, counter)
  return applicationId
}

// 이력 층은 다시 실행할 때 빠진 단계만 이어서 한다. 각 단계는 이미 됐는지 먼저 본다.
const completeStorySteps = async (
  admin: SupabaseClient,
  academy: SupabaseClient,
  parents: Record<ParentKey, SupabaseClient>,
  story: Story,
  applicationId: string,
  counter: Counter
) => {
  const plan = classPlan(story.classKey)
  if (story.record) {
    const existing = must(
      await admin.from("trial_results").select("id").eq("application_id", applicationId).maybeSingle(),
      "기록 조회"
    )
    if (!existing) {
      await callRpc(academy, "save_studio_trial_result_with_attachments", {
        p_expected_updated_at: null,
        p_application_id: applicationId,
        p_content: {
          observations: plan.report.observations,
          recommendedCourse: plan.report.course,
          recommendedLevel: plan.report.level,
          recommendedSchedule: plan.report.schedule,
          publicSummary: plan.report.summary(story.childName),
          note: "체험 후 보호자 상담 때 정규반 시간표를 함께 안내",
          attachments: []
        }
      })
      bump(counter, "trial_results")
    }
  }
  if (story.report) {
    const existing = must(
      await admin.from("experience_reports").select("id").eq("application_id", applicationId).limit(1),
      "리포트 조회"
    ) as Array<{ id: string }>
    if (existing.length === 0) {
      const result = must(
        await admin.from("trial_results").select("updated_at").eq("application_id", applicationId).single(),
        "기록 수정 시각 조회"
      ) as { updated_at: string }
      // Studio "리포트 보내기" 와 같은 RPC. 트리거가 만든 학부모 푸시 작업은 바로 지운다.
      await callRpc(academy, "publish_experience_report_v4", {
        p_application_id: applicationId,
        p_expected_assessment_updated_at: result.updated_at
      })
      bump(counter, "experience_reports")
      await dropPendingPushJobs(admin, "application_id", [applicationId], counter)
    }
  }
  if (story.contact) {
    const existing = must(
      await admin.from("consultation_logs").select("id").eq("application_id", applicationId).limit(1),
      "상담 조회"
    ) as Array<{ id: string }>
    if (existing.length === 0) {
      await callRpc(academy, "record_studio_contact", {
        p_submission_id: randomUUID(),
        p_application_id: applicationId,
        p_occurred_at: story.contact.occurredAt,
        p_channel: "PHONE",
        p_sentiment: "NEUTRAL",
        p_note: story.contact.note,
        p_next_contact_at: null,
        p_preference_provided: story.contact.preference != null,
        p_preference: story.contact.preference,
        p_preference_note: story.contact.preferenceNote,
        p_flexibility: null
      })
      bump(counter, "consultation_logs")
    }
  }
  if (story.parentSubmission) {
    const feedback = must(
      await admin.from("experience_feedback").select("id").eq("application_id", applicationId).maybeSingle(),
      "학부모 의견 조회"
    )
    const decision = must(
      await admin.from("parent_decisions").select("id").eq("application_id", applicationId).is("superseded_at", null).maybeSingle(),
      "학부모 의향 조회"
    )
    if (!feedback || !decision) {
      // 학부모 앱의 submitParentExperience 와 같은 RPC. 이미 낸 쪽은 null 로 둔다(RPC 가 덮어쓰기를 막는다).
      await callRpc(parents[story.parentKey], "submit_parent_experience", {
        p_application_id: applicationId,
        p_selected_chip_ids: feedback ? null : story.parentSubmission.chips,
        p_private_note: feedback ? null : story.parentSubmission.note,
        p_decision: decision ? null : story.parentSubmission.decision,
        p_decline_reason: null,
        p_preferred_days: null,
        p_preferred_start_time: null,
        p_preferred_end_time: null,
        p_preferred_time_mode: null
      })
      bump(counter, "experience_feedback", feedback ? 0 : 1)
      bump(counter, "parent_decisions", decision ? 0 : 1)
    }
  }
  if (story.nextContact) {
    await callRpc(academy, "set_studio_next_contact", {
      p_application_id: applicationId,
      p_next_contact_on: story.nextContact.on,
      p_note: story.nextContact.note
    })
    bump(counter, "next_contact")
  }
}

// ── 4. 요약 ────────────────────────────────────────────────────────────────

type SummaryRow = {
  id: string
  parent_id: string | null
  child_id: string | null
  child_name: string | null
  status: string
  registration_status: string
  created_at: string
  confirmed_slot_at: string | null
  no_show_at: string | null
  canceled_at: string | null
  next_contact_at: string | null
  follow_up_note: string | null
  class_schedules: { start_time: string; end_time: string } | null
  schedule_blocks: { start_at: string; end_at: string } | null
}

const timeToMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

const summarize = async (admin: SupabaseClient, ctx: Context, anchor: string, title: string) => {
  const rows = must(
    await admin
      .from("trial_applications")
      .select(
        "id, parent_id, child_id, child_name, status, registration_status, created_at, confirmed_slot_at, no_show_at, canceled_at, next_contact_at, follow_up_note, class_schedules(start_time, end_time), schedule_blocks!trial_applications_confirmed_schedule_block_id_fkey(start_at, end_at), classes!inner(organization_id)"
      )
      .eq("classes.organization_id", ctx.organizationId),
    "요약 조회"
  ) as unknown as SummaryRow[]
  const ids = rows.map((row) => row.id)
  const resultIds = new Set(
    (must(await admin.from("trial_results").select("application_id").in("application_id", ids), "기록 조회") as Array<{ application_id: string }>).map((row) => row.application_id)
  )
  const reportIds = new Set(
    (must(await admin.from("experience_reports").select("application_id").in("application_id", ids), "리포트 조회") as Array<{ application_id: string }>).map((row) => row.application_id)
  )
  const considering = new Set(
    (must(
      await admin.from("parent_decisions").select("application_id, decision").in("application_id", ids).is("superseded_at", null),
      "의향 조회"
    ) as Array<{ application_id: string; decision: string }>)
      .filter((row) => row.decision === "considering")
      .map((row) => row.application_id)
  )
  const feedbackRecent = must(
    await admin
      .from("experience_feedback")
      .select("id", { count: "exact" })
      .eq("organization_id", ctx.organizationId)
      .gte("created_at", new Date(Date.now() - 7 * DAY_MS).toISOString()),
    "학부모 의견 조회"
  ) as Array<{ id: string }>

  // 시연 기준 시각: 기준일 13:00 KST(오늘 체험 시작 전). 이미 지났으면 지금.
  const referenceMs = Math.max(Date.now(), Date.parse(kstIso(anchor, "13:00")))
  const startOf = (row: SummaryRow) => row.schedule_blocks?.start_at ?? row.confirmed_slot_at
  const endOf = (row: SummaryRow) => {
    if (row.schedule_blocks?.end_at) {
      return Date.parse(row.schedule_blocks.end_at)
    }
    const start = startOf(row)
    if (!start || !row.class_schedules) {
      return null
    }
    return Date.parse(start) + (timeToMinutes(row.class_schedules.end_time) - timeToMinutes(row.class_schedules.start_time)) * 60000
  }
  const live = (row: SummaryRow) => !row.no_show_at && !row.canceled_at && row.status !== "canceled"

  const statusCounts: Record<string, number> = {}
  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1
  }

  const board = { schedule: 0, record: 0, report: 0, registration: 0 }
  for (const row of rows) {
    if (!live(row) || !row.child_name) {
      continue
    }
    const start = startOf(row)
    if (row.status === "new" || row.status === "reviewing" || (row.status === "confirmed" && !start)) {
      board.schedule += 1
    } else if (row.status === "confirmed") {
      const end = endOf(row)
      if (end != null && end <= referenceMs) {
        board.record += 1
      }
    } else if (row.status === "completed" && row.registration_status === "undecided") {
      if (!resultIds.has(row.id)) {
        board.record += 1
      } else if (!reportIds.has(row.id)) {
        board.report += 1
      } else {
        board.registration += 1
      }
    }
  }

  const todayTrials = rows.filter((row) => {
    const start = startOf(row)
    return (row.status === "confirmed" || row.status === "completed") && start != null && kstDateOf(start) === anchor
  })

  const month = monthOf(anchor)
  const monthRows = rows.filter((row) => {
    const created = kstDateOf(row.created_at)
    return monthOf(created) === month && created <= anchor && row.status === "completed"
  })
  const enrolled = monthRows.filter((row) => row.registration_status === "enrolled").length
  const rate = monthRows.length === 0 ? null : Math.round((enrolled / monthRows.length) * 1000) / 10

  // 학생 묶음: child_id, 없으면 학부모 + 이름. 대표는 취소 · 불참이 아닌 가장 최근 신청.
  const groups = new Map<string, SummaryRow[]>()
  for (const row of rows) {
    if (!row.child_name) {
      continue
    }
    const key = row.child_id ?? `${row.parent_id}:${row.child_name.replace(/\s/g, "").toLowerCase()}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  let recontact = 0
  let consideringStudents = 0
  for (const members of groups.values()) {
    const representative = members
      .filter((row) => row.status !== "canceled" && !row.no_show_at)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))[0]
    if (!representative || representative.status !== "completed") {
      continue
    }
    if (representative.registration_status === "not_enrolled") {
      recontact += 1
    } else if (representative.registration_status === "pending" || considering.has(representative.id)) {
      recontact += 1
      consideringStudents += considering.has(representative.id) ? 1 : 0
    }
  }

  const tasks = { CONFIRM_SCHEDULE: 0, NEEDS_COMPLETION: 0, NEXT_CONTACT: 0, NEEDS_REGISTRATION: 0 }
  for (const row of rows) {
    const closed = row.status === "canceled" || (row.status === "completed" && ["enrolled", "not_enrolled"].includes(row.registration_status))
    if (!closed) {
      const start = startOf(row)
      if (row.status === "new" || row.status === "reviewing") {
        tasks.CONFIRM_SCHEDULE += 1
      } else if (row.status === "confirmed" && start && Date.parse(start) <= referenceMs) {
        tasks.NEEDS_COMPLETION += 1
      } else if (row.status === "completed" && ["undecided", "pending"].includes(row.registration_status)) {
        tasks.NEEDS_REGISTRATION += 1
      }
    }
    if (row.follow_up_note?.trim() && row.next_contact_at && row.child_name && kstDateOf(row.next_contact_at) <= anchor) {
      tasks.NEXT_CONTACT += 1
    }
  }

  console.log(`\n[${title}] 기준일 ${anchor} · 화면 기준 시각 ${new Date(referenceMs + KST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ")} KST`)
  console.log(`  상태별 신청(데모 학원 전체): ${JSON.stringify(statusCounts)}`)
  console.log(`  이번 달(${month}) 전환율: ${rate ?? "-"}% (체험 완료 ${monthRows.length} · 등록 ${enrolled})`)
  console.log(`  오늘 체험: ${todayTrials.length}건`)
  console.log(`  체험에서 등록까지: 일정 확정 ${board.schedule} · 기록 작성 ${board.record} · 리포트 보내기 ${board.report} · 등록 결과 ${board.registration}`)
  console.log(`  홈 오늘 할 일: ${Object.values(tasks).reduce((sum, value) => sum + value, 0)}개 ${JSON.stringify(tasks)}`)
  console.log(`  다시 연락할 학생: ${recontact}명 (그중 학부모 의향 고민 중 ${consideringStudents}명)`)
  console.log(`  학부모 의견(최근 7일): ${feedbackRecent.length}건`)
}

// ── main ────────────────────────────────────────────────────────────────

const printStories = (title: string, stories: Story[]) => {
  console.log(`\n${title} (${stories.length}건)`)
  for (const story of stories) {
    const plan = classPlan(story.classKey)
    const extra = [
      story.kind === "completed" ? `완료 · ${story.registration.status}` : story.kind === "confirm" ? "확정" : "새 신청",
      story.assignTeacher && story.kind !== "new" ? plan.teacher : story.kind === "new" ? "" : "미배정",
      story.record ? "기록" : "",
      story.report ? "리포트" : "",
      story.parentSubmission ? `학부모 의견 · 의향 ${story.parentSubmission.decision === "planned" ? "등록 예정" : "고민 중"}` : "",
      story.contact ? "상담" : "",
      story.nextContact ? `다음 연락 ${story.nextContact.on}` : ""
    ].filter(Boolean)
    console.log(
      `  - [${story.section}] ${story.childName} · ${plan.title} · ${story.slotDate} ${story.slotTime} · 신청 ${kstDateOf(story.createdAt)} · ${extra.join(" · ")}`
    )
  }
}

const main = async () => {
  loadEnvConfig(process.cwd())
  readRequiredEnv(PUBLISHABLE_KEY_ENV)
  const confirmed = process.env[CONFIRM_ENV] === "YES"
  const anchor = resolveAnchorDate()
  const admin = createServiceClient()

  console.log(`[demo-refresh] 기준일 ${anchor} (오늘 KST ${todayKst()}) · ${confirmed ? "실행" : "dry-run"}`)

  const ctx = await loadContext(admin)
  console.log(`  조직 ${ctx.organizationId} · 학원 계정 ${DEMO_ACADEMY_EMAIL}`)

  const applications = await loadApplications(admin, ctx)
  const deletion = await planDeletion(admin, ctx, applications)
  const deletionIds = new Set(deletion.applications.map((row) => row.id))
  const kept = applications.filter((row) => !deletionIds.has(row.id))
  const otherParentInDeletion = deletion.applications.filter((row) => !isDemoParent(ctx, row.parent_id)).length

  console.log(`\n[지우기] 데모 학부모 신청 중 기록 · 리포트가 없는 것 ${deletion.applications.length}건`)
  for (const [table, count] of Object.entries(deletion.dependents)) {
    console.log(`  ${table}: ${count}`)
  }
  console.log(`  다른 학부모 행: ${otherParentInDeletion}`)
  const keptDemo = kept.filter((row) => isDemoParent(ctx, row.parent_id))
  console.log(`[유지] 데모 학부모 신청(기록 · 리포트 있음) ${keptDemo.length}건 · 다른 계정 신청 ${kept.length - keptDemo.length}건`)

  // 이력 층: 이미 있는 것은 학부모 + 수업 + 이름으로 찾는다.
  const findKept = (story: Story) =>
    keptDemo.find(
      (row) =>
        row.parent_id === ctx.parentIds[story.parentKey] &&
        row.class_id === ctx.classes[story.classKey].id &&
        row.child_name === story.childName
    )
  const reservedNames = new Set(kept.map((row) => row.child_name).filter((name): name is string => Boolean(name)))
  for (const name of Object.values(PERMANENT_NAMES)) {
    reservedNames.add(name)
  }

  // "리포트 보내기" 칸은 2건이 되도록 한다. 이 스크립트 밖의 남은 행을 먼저 센다.
  const permanentNames = new Set<string>(Object.values(PERMANENT_NAMES))
  const reportColumnOthers = kept.filter(
    (row) =>
      row.status === "completed" &&
      row.registration_status === "undecided" &&
      !row.no_show_at &&
      !row.canceled_at &&
      row.hasResult &&
      !row.hasReport &&
      !(isDemoParent(ctx, row.parent_id) && row.child_name && permanentNames.has(row.child_name))
  ).length
  const reportStoriesNeeded = Math.max(1, 2 - reportColumnOthers)
  const permanentStories = buildPermanentStories(anchor, reportStoriesNeeded)
  const permanentNew = permanentStories.filter((story) => !findKept(story))
  const permanentResume = permanentStories.filter((story) => findKept(story))

  const names = createNamePicker(reservedNames)
  const todayStories = buildTodayStories(anchor, names)

  // 달별 이미 있는 체험 완료(유지 행 + 이번에 만드는 오늘 · 이력 층 이야기).
  const tallies = new Map<string, MonthTally>()
  const tally = (createdAt: string, status: string, registration: string) => {
    if (status !== "completed") {
      return
    }
    const month = monthOf(kstDateOf(createdAt))
    const current = tallies.get(month) ?? { completed: 0, enrolled: 0 }
    current.completed += 1
    current.enrolled += registration === "enrolled" ? 1 : 0
    tallies.set(month, current)
  }
  for (const row of kept) {
    tally(row.created_at, row.status, row.registration_status)
  }
  for (const story of [...permanentNew, ...todayStories]) {
    tally(story.createdAt, story.kind === "completed" ? "completed" : story.kind, story.registration.status)
  }
  const historyLog: string[] = []
  const historyStories = buildHistoryStories(anchor, names, tallies, historyLog)

  const allNew = [...permanentNew, ...todayStories, ...historyStories]
  const nonDemoParents = allNew.filter((story) => !ctx.parentIds[story.parentKey]).length
  assert(nonDemoParents === 0, "계획에 데모 학부모가 아닌 학부모가 있습니다.")
  for (const story of allNew) {
    if (story.kind === "confirm" && story.slotDate === addDays(anchor, 1)) {
      throw new Error(`기준일 다음 날 확정 일정은 리마인더 대상이라 만들지 않습니다: ${story.key}`)
    }
  }

  console.log(`\n[수업] ${DEMO_CLASSES.map((item) => item.title).join(", ")} → 공개 + 상시 운영(오늘부터 90일 예약 시간)`)
  console.log(`[번호] 데모 학부모 ${DEMO_PARENTS.map((item) => item.phone).join(", ")} · 선생님 ${Object.values(DEMO_TEACHER_PHONES).join(", ")}`)
  printStories("[만들기 · 이력 층(새로)]", permanentNew)
  printStories("[이어서 · 이력 층(이미 있음 — 빠진 단계만)]", permanentResume)
  printStories("[만들기 · 오늘 층]", todayStories)
  console.log(`\n[만들기 · 지난 이력] ${historyStories.length}건`)
  for (const line of historyLog) {
    console.log(line)
  }
  console.log(`\n  만들 신청 합계 ${allNew.length}건 · 모두 데모 학부모(다른 학부모 ${nonDemoParents}건)`)

  if (!confirmed) {
    console.log(`\n[demo-refresh] dry-run 입니다. 쓰려면 ${CONFIRM_ENV}=YES 를 붙여 다시 실행하세요.`)
    await summarize(admin, ctx, anchor, "현재 DB 요약(쓰기 전)")
    return
  }

  const deleted: Counter = {}
  const created: Counter = {}
  await executeDeletion(admin, ctx, deletion, deleted)
  await updatePhones(admin, ctx, created)

  const academy = await signInAs(admin, DEMO_ACADEMY_EMAIL)
  const parents = {} as Record<ParentKey, SupabaseClient>
  for (const parent of DEMO_PARENTS) {
    parents[parent.key] = await signInAs(admin, parent.email)
  }

  try {
    await ensureClassesPublic(admin, academy, ctx, created)
    for (const story of permanentResume) {
      const row = findKept(story)
      assert(row, `이어서 할 신청을 찾지 못했습니다: ${story.key}`)
      await completeStorySteps(admin, academy, parents, story, row.id, created)
    }
    for (const story of allNew) {
      await createStory(admin, academy, parents, ctx, story, created)
    }
  } finally {
    await dropPendingPushJobs(admin, "parent_id", Object.values(ctx.parentIds), created)
    await academy.auth.signOut({ scope: "local" })
    for (const client of Object.values(parents)) {
      await client.auth.signOut({ scope: "local" })
    }
  }

  console.log(`\n[지운 행] ${JSON.stringify(deleted)}`)
  console.log(`[만든 행] ${JSON.stringify(created)}`)
  await summarize(admin, ctx, anchor, "실행 요약")
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."
  console.error(`[demo-refresh] ${message}`)
  process.exitCode = 1
})
