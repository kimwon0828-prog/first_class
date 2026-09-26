import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  presentClassOperatingRuleState,
  presentOperatingDraft
} from "../src/features/studio/lib/class-operation-presentation"
import {
  createDefaultCreateClassScheduleDraft,
  expandOperatingHoursTimeRanges
} from "../src/features/studio/lib/studio-operating-hours"
import type { ClassOperatingRule } from "../src/features/studio/lib/class-operating-rule"

const rollingRule: ClassOperatingRule = {
  id: "10000000-0000-4000-8000-000000000001",
  operationType: "rolling",
  startDate: "2026-09-01",
  endDate: null,
  rollingDays: 90,
  revision: 1,
  isActive: true,
  slots: [1, 3].map((weekday) => ({
    weekday,
    startTime: "15:00",
    endTime: "16:00",
    capacity: 4,
    seriesId: "11000000-0000-4000-8000-000000000001"
  }))
}

assert.deepEqual(presentClassOperatingRuleState({ status: "loaded", rule: rollingRule }), {
  kind: "configured",
  title: "상시 운영",
  detail: "월·수 · 15:00"
})
assert.deepEqual(
  presentClassOperatingRuleState({
    status: "loaded",
    rule: { ...rollingRule, operationType: "fixed_period", endDate: "2026-11-30" }
  }),
  { kind: "configured", title: "기간 지정", detail: "2026.09.01 ~ 2026.11.30" }
)
assert.deepEqual(presentClassOperatingRuleState({ status: "loaded", rule: null }), {
  kind: "legacy",
  title: "운영 방식 확인 필요",
  detail: "기존 일정은 유지됩니다."
})
assert.equal(
  presentClassOperatingRuleState({ status: "error", rule: null }).title,
  "운영 정보 확인 불가"
)

const blankDraft = createDefaultCreateClassScheduleDraft()
assert.equal(presentOperatingDraft(blankDraft, false), null)
assert.equal(blankDraft.groups.length, 0)
assert.equal(
  presentOperatingDraft(
    {
      ...blankDraft,
      isAlwaysOpen: true,
      operationStartDate: "2026-09-25",
      defaultCapacity: "4",
      groups: [{
        id: "11000000-0000-4000-8000-000000000001",
        weekdays: [1, 3],
        timeRanges: [{ id: "range", startTime: "15:00", lastStartTime: "15:00", capacity: "4" }]
      }]
    },
    true
  )?.detail,
  "월·수 · 15:00 ~ 16:00"
)
assert.deepEqual(
  expandOperatingHoursTimeRanges({
    ...blankDraft,
    intervalMinutes: "60",
    groups: [{
      id: "group",
      weekdays: [1],
      timeRanges: [{ id: "range", startTime: "15:00", lastStartTime: "17:00", capacity: "4" }]
    }]
  }).groups[0]?.timeRanges.map((range) => [range.startTime, range.lastStartTime]),
  [["15:00", "15:00"], ["16:00", "16:00"], ["17:00", "17:00"]]
)

const form = readFileSync("src/features/studio/ui/studio-class-form.tsx", "utf8")
const modal = readFileSync("src/features/studio/ui/studio-operating-hours-modal.tsx", "utf8")
const editor = readFileSync("src/features/studio/ui/studio-class-operation-editor.tsx", "utf8")
const manager = readFileSync("src/features/studio/ui/studio-classes-manager.tsx", "utf8")
const adapter = readFileSync("src/shared/lib/db/supabase-adapter.ts", "utf8")
const action = readFileSync("src/features/studio/actions/upsert-studio-class.ts", "utf8")
const editRoute = readFileSync("app/studio/(dashboard)/classes/[id]/edit/page.tsx", "utf8")

for (const source of [form, modal, editor]) {
  assert.doesNotMatch(source, /90일|자동 연장|Rolling|Cron/)
}
assert.ok(!form.includes("deriveOperatingDraftFromScheduleSlots"))
assert.ok(form.includes("앞으로의 운영 일정을 설정해 주세요."))
assert.ok(form.includes("기존 일정과 예약은 그대로 유지됩니다."))
assert.ok(form.includes("기존에 등록된 일정과 예약은 그대로 유지돼요."))
assert.ok(form.includes("특정 날짜만 변경하기"))
assert.ok(form.includes("휴무일이나 특별 운영일의 시간을 변경할 수 있어요."))
assert.ok(form.includes("StudioClassOperationEditor"))
assert.ok(form.includes("useState(initialItem?.isActive ?? true)"))
assert.ok(form.includes("setIsActivePreview(initialItem?.isActive ?? true)"))
assert.ok(form.includes("useState(Boolean(initialItem?.operatingRule))"))
assert.match(form, /const operationType = hasOperatingRuleSelection[\s\S]*?: null\n/)
assert.ok(form.includes("hasOperatingRuleSelection ? teacherAssignmentField"))
assert.ok(form.includes('mode === "update" && hasOperatingRuleSelection ? <button'))
assert.ok(!form.includes("StudioOperatingHoursModal"))
assert.ok(!form.includes("StudioOperatingHoursSummary"))
assert.ok(!form.includes("현재 예약시간"))
assert.ok(!form.includes("기존 신청이 연결된 일정"))
assert.ok(!form.includes("담당자 배정 방식"))
assert.ok(form.includes('<option value="">신청 후 배정</option>'))
assert.ok(form.includes("운영 방식</dt>"))
assert.ok(form.includes('aria-label="기본 수업 정보"'))
assert.ok(form.includes("const ClassPreviewBasicInfo"))
assert.ok(form.includes("<div><dt>방식</dt><dd>{classFormat}</dd></div>"))
assert.ok(form.includes('classFormat={resolvedClassFormat || "선택 안 함"}'))
assert.ok(form.indexOf("<ClassPreviewBasicInfo") < form.indexOf("{operatingPresentation ?"))
assert.ok(form.includes("체험수업 시간</dt>"))
assert.ok(form.includes("운영 시간</dt>"))
assert.ok(form.includes("회차당 정원</dt>"))
assert.ok(form.includes("담당 선생님</dt>"))
assert.ok(form.includes('`${group.weekdayLabel} · ${group.timeLabel}`'))
assert.ok(form.includes("styles.visibilitySetting"))
assert.ok(!form.includes("operatingPeriodSummary"))
assert.ok(editor.includes("종료일 없이 계속 운영해요."))
assert.ok(editor.includes("운영 기간을 정해요."))
assert.ok(editor.includes("{operationType ? <>"))
assert.ok(editor.includes("+ 시간 추가"))
assert.ok(editor.includes("예약 가능 시간"))
assert.ok(editor.includes("같은 요일에 다른 시간 범위를 추가해요."))
assert.ok(editor.includes("다른 요일에 다른 운영시간을 설정해요."))
assert.ok(modal.includes("상시 운영"))
assert.ok(modal.includes("기간 지정 운영"))
assert.ok(manager.includes("운영 일정"))
assert.ok(manager.includes("?section=operations"))
assert.ok(editRoute.includes('section?: string'))
assert.ok(editRoute.includes('initialSection={resolvedSearchParams?.section === "operations"'))

assert.ok(adapter.includes("getOperatingRuleStateByClassId"))
assert.ok(adapter.includes('return { status: "error", rules: new Map() }'))
assert.ok(adapter.includes('operatingRules.status === "error"'))
assert.ok(action.includes('if (mode === "create" && !operatingRule)'))
assert.ok(action.includes('mode === "update" && existingClass && !operatingRule && !existingClass.operatingRule'))

console.log(
  "PASS: operation labels, legacy/error separation, no schedule inference, direct operations entry, create-only rule requirement, legacy update preservation, and user-facing perpetual copy"
)
