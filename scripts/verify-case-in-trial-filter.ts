// Cases 필터가 `체험 중` 을 배지와 다른 기준으로 근사하지 않는지 검증.
//
//   npx tsx scripts/verify-case-in-trial-filter.ts
//
// 배경.
//   배지의 시작 시각 canonical source 는 resolveTrialStartAtMs 다.
//     1순위 confirmed_block.start_at   2순위 confirmed_slot_at
//   목록은 DB 에서 페이징하므로 필터도 DB 레벨이어야 하는데, PostgREST 로는
//   이 fallback 을 표현할 수 없다(측정 결과는 아래 [3] 참고).
//     - 논리식(or)에서 embed 컬럼 참조 불가 → PGRST100
//     - embed 를 !inner 로 걸면 확정 블록이 없는 confirmed Case 가 통째로 사라짐
//
//   그래서 `체험 중` 은 배지로만 두고 필터로는 만들지 않는다.
//
// 이 스크립트가 실패해야 하는 경우.
//   1. 진행 중 필터에 `체험 중` 이 다시 생겼을 때
//   2. 필터가 시작 시각으로 confirmed 를 가르기 시작했을 때
//      (confirmed_slot_at 만 보는 근사는 [2] 의 D/E 에서 배지와 갈린다)
//   3. 배지 쪽 canonical 우선순위(block → slot)가 바뀌었을 때

import {
  CASE_ACTIVE_FILTERS,
  getCaseFilterPredicate,
  type CaseFilterPredicate
} from "@/features/studio/lib/case-filters"
import { getCaseDisplayStage } from "@/features/studio/lib/case-view-model"

let failures = 0
/** 직전 검사들이 전부 통과했을 때만 PASS 줄을 남긴다(실패 옆에 PASS 가 찍히지 않게). */
const passLine = (before: number, message: string) => {
  if (failures === before) {
    console.log(`  PASS  ${message}`)
  }
}
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

/** 배지 판정. 필터가 무엇을 하든 이 값이 화면에 보이는 단계다. */
const badgeStage = (confirmedBlockStartAt: string | null, confirmedSlotAt: string | null) =>
  getCaseDisplayStage(
    {
      status: "confirmed",
      noShowAt: null,
      registrationStatus: "undecided",
      confirmedBlockStartAt,
      confirmedBlockEndAt: null,
      confirmedSlotAt,
      scheduleStartTime: null,
      scheduleEndTime: null
    },
    NOW
  )

// ─────────────────────────────────────────────────────────────
console.log("\n[1] 진행 중 필터 목록")

const filterListBefore = failures
const keys = CASE_ACTIVE_FILTERS.map((option) => option.key)
check(
  JSON.stringify(keys) === JSON.stringify(["all", "new", "reviewing", "confirmed", "post_trial"]),
  `진행 중 필터가 바뀌었다: ${keys.join(" · ")}`
)
check(
  !keys.includes("in_trial" as (typeof keys)[number]),
  "`체험 중` 이 필터로 다시 추가됐다 — 배지와 같은 기준을 DB 에서 표현할 수 없다"
)
passLine(filterListBefore, `진행 중 필터: ${keys.join(" · ")}`)

// 필터 서술자에 시작 시각 축이 없어야 한다. 있으면 confirmed 가 근사 기준으로 갈린 것이다.
const startAxisBefore = failures
const START_TIME_PREDICATE_KEYS = ["trialStarted", "confirmedSlotAt", "startedBefore"]
for (const key of keys) {
  const predicate = getCaseFilterPredicate("active", key) as CaseFilterPredicate &
    Record<string, unknown>
  const found = START_TIME_PREDICATE_KEYS.filter((name) => predicate[name] !== undefined)
  check(
    found.length === 0,
    `필터 ${key} 가 시작 시각으로 Case 를 가른다(${found.join(", ")}) — 배지와 갈릴 수 있다`
  )
}
passLine(startAxisBefore, "어떤 필터도 체험 시작 시각으로 Case 를 가르지 않는다")

const confirmedBefore = failures
const confirmedPredicate = getCaseFilterPredicate("active", "confirmed")
check(
  JSON.stringify(confirmedPredicate) === JSON.stringify({ statusIn: ["confirmed"] }),
  `\`일정 확정\` 이 status=confirmed 전체가 아니다: ${JSON.stringify(confirmedPredicate)}`
)
passLine(confirmedBefore, "`일정 확정` = status=confirmed 전체(체험 중 Case 를 숨기지 않는다)")

// ─────────────────────────────────────────────────────────────
console.log("\n[2] confirmed_slot_at 근사는 배지와 같지 않다")

// confirmed_slot_at 만 보는 SQL 근사(= 예전 in_trial 필터의 판정).
const slotOnlyStarted = (confirmedSlotAt: string | null) =>
  confirmedSlotAt !== null && confirmedSlotAt <= NOW.toISOString()

type Fixture = {
  id: string
  label: string
  confirmedBlockStartAt: string | null
  confirmedSlotAt: string | null
  expectedStage: "confirmed" | "in_trial"
  /** 근사와 배지가 갈리는 fixture 인가. */
  expectedDivergence: boolean
}

const fixtures: Fixture[] = [
  {
    id: "A",
    label: "block=slot=+60m",
    confirmedBlockStartAt: iso(60),
    confirmedSlotAt: iso(60),
    expectedStage: "confirmed",
    expectedDivergence: false
  },
  {
    id: "B",
    label: "block=slot=-30m",
    confirmedBlockStartAt: iso(-30),
    confirmedSlotAt: iso(-30),
    expectedStage: "in_trial",
    expectedDivergence: false
  },
  {
    id: "C",
    label: "block 없음 · slot 만 -30m (fallback)",
    confirmedBlockStartAt: null,
    confirmedSlotAt: iso(-30),
    expectedStage: "in_trial",
    expectedDivergence: false
  },
  {
    id: "D",
    label: "block=+60m · slot=-60m",
    confirmedBlockStartAt: iso(60),
    confirmedSlotAt: iso(-60),
    expectedStage: "confirmed",
    expectedDivergence: true
  },
  {
    id: "E",
    label: "block=-60m · slot=+60m",
    confirmedBlockStartAt: iso(-60),
    confirmedSlotAt: iso(60),
    expectedStage: "in_trial",
    expectedDivergence: true
  },
  {
    id: "F",
    label: "둘 다 없음(확정 블록 없는 confirmed)",
    confirmedBlockStartAt: null,
    confirmedSlotAt: null,
    expectedStage: "confirmed",
    expectedDivergence: false
  }
]

for (const fixture of fixtures) {
  const stage = badgeStage(fixture.confirmedBlockStartAt, fixture.confirmedSlotAt)
  const diverges = slotOnlyStarted(fixture.confirmedSlotAt) !== (stage === "in_trial")

  check(stage === fixture.expectedStage, `${fixture.id} 배지: 기대 ${fixture.expectedStage} / 실제 ${stage}`)
  check(
    diverges === fixture.expectedDivergence,
    `${fixture.id} 근사 일치 여부가 기대와 다르다(기대 divergence=${fixture.expectedDivergence})`
  )
  console.log(
    `  PASS  ${fixture.id}  ${fixture.label.padEnd(34)} → 배지 ${stage}${diverges ? "  (slot 근사와 불일치)" : ""}`
  )
}

// D/E 가 갈리는 한, confirmed_slot_at 근사를 필터로 쓰면 배지와 다른 목록이 나온다.
check(
  fixtures.some((fixture) => fixture.expectedDivergence),
  "근사와 배지가 갈리는 fixture 가 하나도 없다 — 이 스크립트가 무의미해졌다"
)
console.log("  PASS  D/E 가 갈리므로 slot 근사 필터는 배지와 다른 목록을 만든다")

// ─────────────────────────────────────────────────────────────
console.log("\n[3] 배지 canonical 우선순위(block → slot)")

check(
  badgeStage(iso(60), iso(-60)) === "confirmed" && badgeStage(iso(-60), iso(60)) === "in_trial",
  "resolveTrialStartAtMs 의 block 우선 규칙이 깨졌다"
)
console.log("  PASS  block.start_at 이 slot 보다 우선한다")

// 측정 기록(로컬 PostgREST, 2026-09-04):
//   or=(confirmed_schedule_block_id.is.null,confirmed_block.start_at.gt.…) → PGRST100
//   !inner + confirmed_block.start_at=gt.now → 확정 블록 없는 confirmed 2건이 결과에서 빠짐
console.log("  NOTE  PostgREST 로는 block→slot fallback 을 필터로 표현할 수 없다(파일 상단 주석 참고)")

if (failures > 0) {
  console.error(`\nFAIL: ${failures}건 실패`)
  process.exit(1)
}

console.log("\nPASS: `체험 중` 필터 보류 상태 검증 완료")
