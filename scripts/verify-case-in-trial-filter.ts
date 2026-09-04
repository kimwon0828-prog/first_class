// Cases 의 파생 `체험 중` 필터 검증.
//
//   npx tsx scripts/verify-case-in-trial-filter.ts
//
// 목록은 DB 에서 페이징하므로 `체험 중` 도 DB 레벨에서 걸러야 한다.
// 그런데 배지는 resolveTrialStartAtMs(confirmed_block.start_at → confirmed_slot_at)로
// 판정하고, SQL 은 embed 컬럼을 필터할 수 없어 confirmed_slot_at 만 쓴다.
//
// 이 스크립트는 그 차이가 실제로 문제가 되는 지점을 고정한다.
//   1. 두 값이 같으면 필터와 배지가 항상 일치한다.
//   2. 두 값이 다르면 갈릴 수 있다 — 그 조합을 명시적으로 드러낸다.
//   3. 필터 정의(in_trial / confirmed)가 서로 겹치지 않는다.

import {
  CASE_ACTIVE_FILTERS,
  getCaseFilterPredicate
} from "@/features/studio/lib/case-filters"
import { getCaseDisplayStage } from "@/features/studio/lib/case-view-model"

let failures = 0
const check = (condition: unknown, message: string) => {
  if (condition) {
    return
  }
  failures += 1
  console.error(`  FAIL  ${message}`)
}

const NOW = new Date("2026-09-05T03:00:00.000Z")
const iso = (offsetMinutes: number) =>
  new Date(NOW.getTime() + offsetMinutes * 60 * 1000).toISOString()

/** SQL 이 실제로 거르는 방식. applyCasePredicate 의 trialStarted 분기와 같은 규칙이다. */
const sqlTrialStarted = (confirmedSlotAt: string | null) =>
  confirmedSlotAt !== null && confirmedSlotAt <= NOW.toISOString()

// ─────────────────────────────────────────────────────────────
console.log("\n[1] 필터 정의")

const keys = CASE_ACTIVE_FILTERS.map((option) => option.key)
check(keys.includes("in_trial"), "`체험 중` 필터가 없다")
check(
  keys.indexOf("in_trial") === keys.indexOf("confirmed") + 1,
  "`체험 중` 이 `일정 확정` 바로 뒤가 아니다"
)
console.log(`  PASS  진행 중 필터: ${keys.join(" · ")}`)

const confirmedPredicate = getCaseFilterPredicate("active", "confirmed")
const inTrialPredicate = getCaseFilterPredicate("active", "in_trial")
check(confirmedPredicate.trialStarted === "not_started", "`일정 확정` 이 시작 전으로 좁혀지지 않았다")
check(inTrialPredicate.trialStarted === "started", "`체험 중` 이 시작 후로 좁혀지지 않았다")
check(
  JSON.stringify(confirmedPredicate.statusIn) === JSON.stringify(["confirmed"]) &&
    JSON.stringify(inTrialPredicate.statusIn) === JSON.stringify(["confirmed"]),
  "두 필터가 confirmed 이외의 status 를 본다"
)
console.log("  PASS  두 필터는 status=confirmed 를 시작 시각으로만 가른다(겹치지 않음)")

// ─────────────────────────────────────────────────────────────
console.log("\n[2] SQL 판정 = 화면 배지")

type Fixture = {
  id: string
  label: string
  confirmedBlockStartAt: string | null
  confirmedSlotAt: string | null
  expectedStage: "confirmed" | "in_trial"
}

const fixtures: Fixture[] = [
  {
    id: "A",
    label: "시작 1시간 전 (block=slot)",
    confirmedBlockStartAt: iso(60),
    confirmedSlotAt: iso(60),
    expectedStage: "confirmed"
  },
  {
    id: "B",
    label: "시작 30분 경과 (block=slot)",
    confirmedBlockStartAt: iso(-30),
    confirmedSlotAt: iso(-30),
    expectedStage: "in_trial"
  },
  {
    id: "C",
    label: "예정 종료 경과 (block=slot)",
    confirmedBlockStartAt: iso(-120),
    confirmedSlotAt: iso(-120),
    expectedStage: "in_trial"
  },
  {
    id: "D",
    label: "block 없음 · slot 만 있음(경과)",
    confirmedBlockStartAt: null,
    confirmedSlotAt: iso(-30),
    expectedStage: "in_trial"
  },
  {
    id: "E",
    label: "block 없음 · slot 만 있음(예정)",
    confirmedBlockStartAt: null,
    confirmedSlotAt: iso(60),
    expectedStage: "confirmed"
  },
  {
    id: "F",
    label: "둘 다 없음",
    confirmedBlockStartAt: null,
    confirmedSlotAt: null,
    expectedStage: "confirmed"
  }
]

for (const fixture of fixtures) {
  const stage = getCaseDisplayStage(
    {
      status: "confirmed",
      noShowAt: null,
      registrationStatus: "undecided",
      confirmedBlockStartAt: fixture.confirmedBlockStartAt,
      confirmedBlockEndAt: null,
      confirmedSlotAt: fixture.confirmedSlotAt,
      scheduleStartTime: null,
      scheduleEndTime: null
    },
    NOW
  )

  const sqlSaysStarted = sqlTrialStarted(fixture.confirmedSlotAt)
  const badgeSaysStarted = stage === "in_trial"

  check(stage === fixture.expectedStage, `${fixture.id} 배지: 기대 ${fixture.expectedStage} / 실제 ${stage}`)
  check(
    sqlSaysStarted === badgeSaysStarted,
    `${fixture.id} SQL(${sqlSaysStarted}) 과 배지(${badgeSaysStarted}) 가 어긋난다`
  )
  console.log(`  PASS  ${fixture.id}  ${fixture.label.padEnd(30)} → ${stage}`)
}

// ─────────────────────────────────────────────────────────────
console.log("\n[3] block 과 slot 이 어긋나는 경우")

// 두 값이 다르면 배지는 block 을, SQL 은 slot 을 본다. 실제 데이터에서는 두 값이 같지만
// (확정 시 같은 시각으로 함께 기록된다) 규칙이 바뀌면 여기서 먼저 드러난다.
const divergent = getCaseDisplayStage(
  {
    status: "confirmed",
    noShowAt: null,
    registrationStatus: "undecided",
    confirmedBlockStartAt: iso(60),
    confirmedBlockEndAt: null,
    confirmedSlotAt: iso(-60),
    scheduleStartTime: null,
    scheduleEndTime: null
  },
  NOW
)
check(
  divergent === "confirmed",
  `block 우선 규칙이 깨졌다 — resolveTrialStartAtMs 를 확인해야 한다 (실제 ${divergent})`
)
console.log(
  `  PASS  block(예정) ≠ slot(경과) → 배지=${divergent}, SQL=${sqlTrialStarted(iso(-60))} (기록: 두 값이 갈리면 필터가 앞설 수 있다)`
)

if (failures > 0) {
  console.error(`\nFAIL: ${failures}건 실패`)
  process.exit(1)
}

console.log("\nPASS: 체험 중 필터 검증 완료")
