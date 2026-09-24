import assert from "node:assert/strict"
import { classOperatingRuleFromDraft, classOperatingRuleToDraft, parseClassOperatingRule, rollingPreviewDraft } from "../src/features/studio/lib/class-operating-rule"
import { buildCreateClassScheduleDraftSlots, createDefaultCreateClassScheduleDraft } from "../src/features/studio/lib/studio-operating-hours"
import { reconcileMockOperatingRule, mockScheduleExceptions } from "../src/features/studio/lib/reconcile-mock-operating-rule"
import type { ClassSummary } from "../src/shared/lib/db/adapter"

const draft={...createDefaultCreateClassScheduleDraft(),isAlwaysOpen:true,operationStartDate:"2026-01-01",defaultCapacity:"3",
  groups:[{id:"20000000-0000-4000-8000-000000000050",weekdays:[1,3,5],timeRanges:[{id:"range",startTime:"14:00",lastStartTime:"16:00",capacity:"3"}]}]}
const rule=classOperatingRuleFromDraft(draft)
assert.equal(rule.slots.length,9)
assert.equal(rule.operationType,"rolling")
assert.equal(rule.endDate,null)
const stored={...rule,id:"20000000-0000-4000-8000-000000000060",revision:1,rollingDays:90 as const,isActive:true}
assert.deepEqual(classOperatingRuleFromDraft(classOperatingRuleToDraft(stored)),rule)
const preview=rollingPreviewDraft(draft,"2026-09-24")
assert.equal(preview.operationStartDate,"2026-09-24")
assert.equal(preview.operationEndDate,"2026-12-22")
assert.ok(buildCreateClassScheduleDraftSlots(preview).every(s=>s.specificDate>="2026-09-24" && s.specificDate<="2026-12-22"))
const future=rollingPreviewDraft({...draft,operationStartDate:"2027-01-01"},"2026-09-24")
assert.equal(buildCreateClassScheduleDraftSlots(future).length,0)
for (const invalid of [null,{...rule,startDate:"2026-02-30"},{...rule,slots:[{...rule.slots[0],capacity:0}]},
  {...rule,slots:[rule.slots[0],rule.slots[0]]},{...rule,slots:[{...rule.slots[0],endTime:"14:00"}]},
  {...rule,operationType:"fixed_period",endDate:null},
  {...rule,slots:[rule.slots[0],{...rule.slots[0],weekday:2,capacity:4}]},
  {...rule,slots:[rule.slots[0],{...rule.slots[1],endTime:"15:30"}]}]) assert.throws(()=>parseClassOperatingRule(invalid))

const today=new Date(Date.now()+86400000).toISOString().slice(0,10)
const item={id:"mock",isActive:true,schedules:[],operatingRule:{...stored,startDate:today}} as unknown as ClassSummary
reconcileMockOperatingRule(item,today,false)
const ids=item.schedules!.map(s=>s.id)
reconcileMockOperatingRule(item,today,false)
assert.deepEqual(item.schedules!.map(s=>s.id),ids)
const saved=item.schedules![0]
saved.isManualOverride=true; saved.capacity=12
mockScheduleExceptions.push({classId:"mock",date:saved.specificDate!,startTime:null,status:"closed"})
item.operatingRule={...stored,startDate:today,slots:rule.slots.map(s=>({...s,startTime:"17:00",endTime:"18:00"}))}
reconcileMockOperatingRule(item,today,true)
assert.ok(item.schedules!.some(s=>s.id===saved.id && s.capacity===12))
item.isActive=false
const count=item.schedules!.length
reconcileMockOperatingRule(item,new Date(Date.parse(today)+20*86400000).toISOString().slice(0,10),false)
assert.equal(item.schedules!.length,count)
console.log("PASS: rule serialization/restore, Seoul civil 90-day preview, invalid rules, mock idempotence/protection/private pause")
