// 상담 저장 경로의 정규수업 희망 일정 동작 검증.
//
//   npx tsx scripts/verify-consultation-preference-write.ts
//
// CONSULT-4 §27~§29 fixture(A~L)를 담는다.
//   [1] resolver 의미론 — 미전달/전달/변경감지/undecided
//   [2] mock adapter 를 통한 실제 write 경로 — 스냅샷, 최신/과거 수정
//   [3] 등록 상태와의 독립성
//
// cross-org / RLS / constraint / rollback 은 SQL 로 별도 검증한다(순수 로직이 아니다).

import {
  resolveRegularSchedulePreferenceWrite,
  readRegularSchedulePreferenceInput
} from "@/features/studio/lib/regular-schedule-preference-input"
import { parseRegularSchedulePreference } from "@/features/studio/lib/regular-schedule-preference"
import { mockDataAdapter } from "@/shared/lib/db/mock-adapter"
import type { RegularSchedulePreference } from "@/features/studio/lib/regular-schedule-preference"
import type {
  ApplicationRegistrationStatus,
  StudioApplicationDetail,
  StudioConsultationLog
} from "@/shared/lib/db/adapter"

type GlobalMockStore = typeof globalThis & {
  __firstClassMockApplications__?: Array<unknown>
  __firstClassMockConsultationLogs__?: Array<unknown>
}

const store = globalThis as GlobalMockStore

let failures = 0
const check = (condition: unknown, message: string) => {
  if (condition) {
    return
  }
  failures += 1
  console.error(`  FAIL  ${message}`)
}

const TUE_THU_AFTER_17: RegularSchedulePreference = {
  version: 1,
  state: "specified",
  groups: [
    {
      dayMode: "selected",
      days: [2, 4],
      timeMode: "after",
      startTime: "17:00",
      endTime: null
    }
  ]
}

const UNDECIDED: RegularSchedulePreference = { version: 1, state: "undecided", groups: [] }

const NOW = "2026-09-03T10:00:00.000Z"
const EARLIER = "2026-09-01T10:00:00.000Z"

const makeCurrent = (over: Partial<StudioApplicationDetail> = {}) =>
  ({
    id: "app-1",
    status: "completed",
    registrationStatus: "undecided" as ApplicationRegistrationStatus,
    regularSchedulePreference: null,
    regularSchedulePreferenceNote: null,
    regularSchedulePreferenceUpdatedAt: null,
    consultationLogs: [],
    ...over
  }) as unknown as StudioApplicationDetail

const form = (entries: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value)
  }
  return data
}

// ─────────────────────────────────────────────────────────────
console.log("\n[1] 미전달 / 전달 구분")

{
  // A. Case NULL + 미전달 → Case 불변, 스냅샷 NULL
  const result = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(form({ note: "메모" })),
    current: makeCurrent(),
    now: NOW
  })
  check(result.caseWrite === undefined, "A: 미전달인데 Case write 가 생겼다")
  check(result.snapshot === null, "A: 스냅샷이 null 이 아니다")
  check(result.snapshotNote === null, "A: 스냅샷 note 가 null 이 아니다")
  console.log("  PASS  A  Case NULL + 미전달 → Case 불변, 스냅샷 NULL")
}

{
  // B. Case NULL + 화/목 17시 이후 전달 → 저장 + updated_at 생성
  const result = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(
      form({ regularSchedulePreference: JSON.stringify(TUE_THU_AFTER_17) })
    ),
    current: makeCurrent(),
    now: NOW
  })
  check(result.caseWrite !== undefined, "B: Case write 가 없다")
  check(
    JSON.stringify(result.caseWrite?.preference) === JSON.stringify(TUE_THU_AFTER_17),
    "B: 저장값이 다르다"
  )
  check(result.caseWrite?.updatedAt === NOW, "B: updated_at 이 생성되지 않았다")
  check(
    JSON.stringify(result.snapshot) === JSON.stringify(TUE_THU_AFTER_17),
    "B: 스냅샷이 Case 값과 다르다"
  )
  console.log("  PASS  B  전달 → Case 저장 + 동일 스냅샷 + updated_at 생성")
}

{
  // C. 기존값 있음 + 미전달 → Case 유지, 스냅샷은 현재값, updated_at 불변
  const result = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(form({ note: "상담 메모만 작성" })),
    current: makeCurrent({
      regularSchedulePreference: TUE_THU_AFTER_17,
      regularSchedulePreferenceNote: "목요일 우선",
      regularSchedulePreferenceUpdatedAt: EARLIER
    }),
    now: NOW
  })
  check(result.caseWrite === undefined, "C: Case 를 건드렸다")
  check(
    JSON.stringify(result.snapshot) === JSON.stringify(TUE_THU_AFTER_17),
    "C: 스냅샷에 현재 Case 값이 담기지 않았다"
  )
  check(result.snapshotNote === "목요일 우선", "C: 스냅샷 note 가 현재값이 아니다")
  console.log("  PASS  C  기존값 + 미전달 → Case 유지, 스냅샷=현재값, updated_at 불변")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[2] 변경 감지 (canonical 비교)")

{
  // D. 같은 값 재저장 → updated_at 불변
  const result = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(
      form({ regularSchedulePreference: JSON.stringify(TUE_THU_AFTER_17) })
    ),
    current: makeCurrent({
      regularSchedulePreference: TUE_THU_AFTER_17,
      regularSchedulePreferenceUpdatedAt: EARLIER
    }),
    now: NOW
  })
  check(result.caseWrite?.updatedAt === EARLIER, "D: 같은 값인데 updated_at 이 갱신됐다")
  console.log("  PASS  D  같은 값 재저장 → updated_at 불변")
}

{
  // D-2. 요일 순서만 다름 → 같은 값으로 취급
  const reordered = {
    version: 1,
    state: "specified",
    groups: [
      { dayMode: "selected", days: [4, 2], timeMode: "after", startTime: "17:00", endTime: null }
    ]
  }
  const result = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(
      form({ regularSchedulePreference: JSON.stringify(reordered) })
    ),
    current: makeCurrent({
      regularSchedulePreference: TUE_THU_AFTER_17,
      regularSchedulePreferenceUpdatedAt: EARLIER
    }),
    now: NOW
  })
  check(result.caseWrite?.updatedAt === EARLIER, "D-2: [4,2] vs [2,4] 를 다른 값으로 봤다")
  check(
    JSON.stringify(result.caseWrite?.preference?.groups?.[0]?.days) === "[2,4]",
    "D-2: canonical 정렬이 적용되지 않았다"
  )
  console.log("  PASS  D-2 [4,2] vs [2,4] → 같은 값, canonical 저장")
}

{
  // E. note 만 변경 → updated_at 갱신
  const result = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(
      form({
        regularSchedulePreference: JSON.stringify(TUE_THU_AFTER_17),
        regularSchedulePreferenceNote: "6월까지는 화요일 어려움"
      })
    ),
    current: makeCurrent({
      regularSchedulePreference: TUE_THU_AFTER_17,
      regularSchedulePreferenceNote: null,
      regularSchedulePreferenceUpdatedAt: EARLIER
    }),
    now: NOW
  })
  check(result.caseWrite?.note === "6월까지는 화요일 어려움", "E: note 가 저장되지 않았다")
  check(result.caseWrite?.updatedAt === NOW, "E: note 변경인데 updated_at 이 갱신되지 않았다")
  console.log("  PASS  E  note 만 변경 → note 저장 + updated_at 갱신")
}

{
  // F. undecided 는 NULL 과 구분된다
  const result = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(
      form({ regularSchedulePreference: JSON.stringify(UNDECIDED) })
    ),
    current: makeCurrent(),
    now: NOW
  })
  check(result.caseWrite?.preference !== null, "F: undecided 가 null 로 저장됐다")
  check(result.caseWrite?.preference?.state === "undecided", "F: state 가 undecided 가 아니다")
  check(result.caseWrite?.updatedAt === NOW, "F: undecided 저장인데 updated_at 이 없다")

  const absent = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(form({})),
    current: makeCurrent(),
    now: NOW
  })
  check(absent.caseWrite === undefined, "F: 미전달이 undecided 처럼 처리됐다")
  console.log("  PASS  F  undecided(명시적) ≠ NULL(미전달)")
}

{
  // 잘못된 JSON 은 저장 경로에 도달하지 않는다
  const invalid = readRegularSchedulePreferenceInput(
    form({ regularSchedulePreference: '{"version":1,"state":"specified","groups":[]}' })
  )
  check(invalid.status === "invalid", "validator 를 우회한 값이 통과했다")
  const broken = readRegularSchedulePreferenceInput(form({ regularSchedulePreference: "{{{" }))
  check(broken.status === "invalid", "깨진 JSON 이 통과했다")
  console.log("  PASS  server validator 우회 없음 (specified+[] / 깨진 JSON 거부)")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[3] 등록 상태와의 독립성")

for (const status of ["undecided", "pending", "enrolled", "not_enrolled"] as const) {
  const result = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(
      form({ regularSchedulePreference: JSON.stringify(TUE_THU_AFTER_17) })
    ),
    current: makeCurrent({ registrationStatus: status }),
    now: NOW
  })
  check(result.caseWrite?.preference !== null, `${status} 에서 preference 가 비워졌다`)
}
console.log("  PASS  G/H/I  4개 등록 상태 전부에서 preference 저장 가능")

{
  // 등록 상태만 바뀌는 경우(preference 미전달) → preference 컬럼 미변경
  const result = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(form({ registrationStatus: "not_enrolled" })),
    current: makeCurrent({
      registrationStatus: "pending",
      regularSchedulePreference: TUE_THU_AFTER_17,
      regularSchedulePreferenceUpdatedAt: EARLIER
    }),
    now: NOW
  })
  check(result.caseWrite === undefined, "등록 상태 변경이 preference 를 건드렸다")
  console.log("  PASS  등록 상태만 변경 → preference/updated_at 미변경")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[4] mock adapter write 경로 (관측 가능한 최종 상태)")

const run = async () => {
  // ⚠️ 배열을 재할당하면 mock-adapter 가 import 시점에 잡아 둔 참조와 끊어진다.
  // 반드시 같은 배열을 제자리에서 비운다.
  const applications = (store.__firstClassMockApplications__ ??= []) as unknown[]
  const logs = (store.__firstClassMockConsultationLogs__ ??= []) as StudioConsultationLog[]
  applications.length = 0
  logs.length = 0

  applications.push(
    makeCurrent({
      id: "app-1",
      status: "completed",
      registrationStatus: "undecided"
    }) as unknown
  )

  // J-준비. 상담 2건 생성 — 두 번째가 최신이다.
  await mockDataAdapter.createStudioConsultationLog({
    id: "log-old",
    applicationId: "app-1",
    actorId: "teacher-1",
    occurredAt: "2026-09-01T00:00:00.000Z",
    activityType: "CONSULTATION",
    channel: "PHONE",
    sentiment: "NEUTRAL",
    registrationStatusSnapshot: "undecided",
    nextAction: "NONE",
    nextContactAt: null,
    note: "1차 상담",
    regularSchedulePreferenceSnapshot: null,
    regularSchedulePreferenceNoteSnapshot: null
  })

  await mockDataAdapter.createStudioConsultationLog({
    id: "log-latest",
    applicationId: "app-1",
    actorId: "teacher-1",
    occurredAt: "2026-09-02T00:00:00.000Z",
    activityType: "CONSULTATION",
    channel: "KAKAO",
    sentiment: "POSITIVE",
    registrationStatusSnapshot: "undecided",
    nextAction: "NONE",
    nextContactAt: null,
    note: "2차 상담",
    regularSchedulePreferenceSnapshot: TUE_THU_AFTER_17,
    regularSchedulePreferenceNoteSnapshot: "목요일 우선"
  })

  const findLog = (id: string) => logs.find((item) => item.id === id)

  check(
    findLog("log-old")?.regularSchedulePreferenceSnapshot === null,
    "1차 상담 스냅샷이 null 이 아니다"
  )
  check(
    JSON.stringify(findLog("log-latest")?.regularSchedulePreferenceSnapshot) ===
      JSON.stringify(TUE_THU_AFTER_17),
    "2차 상담 스냅샷이 저장되지 않았다"
  )
  console.log("  PASS  상담 log 에 스냅샷 저장 (null 과 값 모두)")

  // L. preference 미전달로 note/next_contact_at 만 수정 → 스냅샷 보존
  await mockDataAdapter.updateStudioConsultationLog({
    applicationId: "app-1",
    consultationLogId: "log-latest",
    actorId: "teacher-1",
    channel: "SMS",
    sentiment: "NEUTRAL",
    nextContactAt: "2026-09-10T00:00:00.000Z",
    note: "수정된 메모"
  })
  check(
    JSON.stringify(findLog("log-latest")?.regularSchedulePreferenceSnapshot) ===
      JSON.stringify(TUE_THU_AFTER_17),
    "L: preference 미전달 수정이 스냅샷을 지웠다"
  )
  check(
    findLog("log-latest")?.regularSchedulePreferenceNoteSnapshot === "목요일 우선",
    "L: preference note 스냅샷이 지워졌다"
  )
  check(findLog("log-latest")?.note === "수정된 메모", "L: 일반 메모 수정이 반영되지 않았다")
  console.log("  PASS  L  preference 미전달 수정 → 스냅샷 보존 (backward compatible)")

  // J. 과거 log 수정 → 과거 스냅샷만 변경, Case 불변
  const application = applications[0] as StudioApplicationDetail
  await mockDataAdapter.updateStudioConsultationLog({
    applicationId: "app-1",
    consultationLogId: "log-old",
    actorId: "teacher-1",
    channel: "PHONE",
    sentiment: "NEUTRAL",
    nextContactAt: null,
    note: "1차 상담",
    regularSchedulePreferenceSnapshotWrite: { preference: UNDECIDED, note: null }
  })
  check(
    findLog("log-old")?.regularSchedulePreferenceSnapshot !== null,
    "J: 과거 스냅샷이 수정되지 않았다"
  )
  check(
    application.regularSchedulePreference === null,
    "J: 과거 log 수정이 Case current 를 바꿨다"
  )
  console.log("  PASS  J  과거 log 수정 → 해당 스냅샷만 변경, Case 불변")

  // K. 최신 log 수정 → 스냅샷 + Case 동기화
  await mockDataAdapter.updateStudioApplicationLatestConsultationSnapshot({
    applicationId: "app-1",
    currentStatus: "completed",
    nextContactAt: null,
    regularSchedulePreferenceWrite: {
      preference: TUE_THU_AFTER_17,
      note: "목요일 우선",
      updatedAt: NOW
    }
  })
  check(
    JSON.stringify(application.regularSchedulePreference) === JSON.stringify(TUE_THU_AFTER_17),
    "K: Case current 가 동기화되지 않았다"
  )
  check(application.regularSchedulePreferenceUpdatedAt === NOW, "K: updated_at 이 갱신되지 않았다")
  console.log("  PASS  K  최신 log 수정 → 스냅샷 + Case current 동기화")

  // 미전달 sync 는 Case 를 건드리지 않는다
  await mockDataAdapter.updateStudioApplicationLatestConsultationSnapshot({
    applicationId: "app-1",
    currentStatus: "completed",
    nextContactAt: "2026-09-20T00:00:00.000Z"
  })
  check(
    JSON.stringify(application.regularSchedulePreference) === JSON.stringify(TUE_THU_AFTER_17),
    "미전달 sync 가 Case preference 를 지웠다"
  )
  console.log("  PASS  미전달 sync → Case preference 보존")

  // ───────────────────────────────────────────────────────────
  console.log("\n[5] parse 실패 안전성")

  const future = parseRegularSchedulePreference({ version: 2, state: "specified", groups: [] })
  check(future.status === "unreadable_version", "미래 버전이 unreadable_version 이 아니다")

  // 읽을 수 없는 값이 Case 에 있어도 미전달 저장은 그 값을 지우지 않는다.
  const corrupted = resolveRegularSchedulePreferenceWrite({
    input: readRegularSchedulePreferenceInput(form({})),
    current: makeCurrent({ regularSchedulePreference: { version: 2 } }),
    now: NOW
  })
  check(corrupted.caseWrite === undefined, "읽을 수 없는 값이 미전달 저장으로 지워졌다")
  console.log("  PASS  미래/깨진 값 → throw 없음, 미전달 저장이 원본을 지우지 않음")

  if (failures > 0) {
    console.error(`\nFAIL: ${failures}건 실패`)
    process.exit(1)
  }

  console.log("\nPASS: 상담 희망 일정 write 경로 검증 완료")
}

run().catch((error) => {
  console.error("FAIL:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})
