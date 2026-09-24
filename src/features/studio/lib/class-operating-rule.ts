import type { CreateClassScheduleDraft } from "./studio-operating-hours"

export type ClassOperatingRuleInput = {
  operationType: "rolling" | "fixed_period"
  startDate: string
  endDate: string | null
  slots: Array<{ weekday: number; startTime: string; endTime: string; capacity: number; seriesId: string }>
}
export type ClassOperatingRule = ClassOperatingRuleInput & {
  id: string
  revision: number
  rollingDays: 90
  isActive: boolean
}

const dateValid = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value
const timeValid = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const uuidValid = (value: unknown) => typeof value === "string" && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)
const minutes = (time: string) => Number(time.slice(0,2))*60 + Number(time.slice(3))
const timeText = (value: number) => `${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`

export function rollingPreviewDraft(draft: CreateClassScheduleDraft, today: string): CreateClassScheduleDraft {
  return draft.isAlwaysOpen ? {...draft,isAlwaysOpen:false,
    operationStartDate:draft.operationStartDate > today ? draft.operationStartDate : today,
    operationEndDate:new Date(Date.parse(`${today}T00:00:00Z`)+89*86400000).toISOString().slice(0,10)} : draft
}

// This is the only wire shape. Draft-only fields and client-generated dated slots are not trusted.
export function parseClassOperatingRule(value: unknown): ClassOperatingRuleInput {
  const r = value as ClassOperatingRuleInput
  if (!r || !["rolling","fixed_period"].includes(r.operationType) || !dateValid(r.startDate)
    || (r.operationType === "rolling" ? r.endDate !== null : !dateValid(r.endDate) || r.endDate < r.startDate
      || (Date.parse(r.endDate)-Date.parse(r.startDate))/86400000 > 730)
    || !Array.isArray(r.slots) || !r.slots.length || r.slots.length > 336) throw new Error("invalid_operating_rule")
  const seen = new Set<string>()
  const slots = r.slots.map((s) => {
    if (!s || !Number.isInteger(s.weekday) || s.weekday < 0 || s.weekday > 6 || !timeValid(s.startTime)
      || !timeValid(s.endTime) || s.endTime <= s.startTime || !Number.isSafeInteger(s.capacity) || s.capacity < 1
      || s.capacity > 2147483647 || !uuidValid(s.seriesId)) throw new Error("invalid_operating_rule_slot")
    const key = `${s.weekday}:${s.startTime}`
    if (seen.has(key)) throw new Error("duplicate_operating_rule_slot")
    seen.add(key)
    return {weekday:s.weekday,startTime:s.startTime,endTime:s.endTime,capacity:s.capacity,seriesId:s.seriesId}
  })
  const duration=minutes(slots[0].endTime)-minutes(slots[0].startTime)
  if (slots.some(s=>minutes(s.endTime)-minutes(s.startTime)!==duration)) throw new Error("mixed_operating_intervals")
  // One Form group has the same time/capacity pattern on every selected weekday.
  for (const seriesId of new Set(slots.map(s=>s.seriesId))) {
    const series=slots.filter(s=>s.seriesId===seriesId)
    const patterns=[...new Set(series.map(s=>s.weekday))].map(day=>series.filter(s=>s.weekday===day)
      .map(s=>`${s.startTime}/${s.endTime}/${s.capacity}`).sort().join(","))
    if (new Set(patterns).size!==1) throw new Error("inconsistent_operating_series")
  }
  return {operationType:r.operationType,startDate:r.startDate,endDate:r.endDate,slots}
}

export function classOperatingRuleFromDraft(draft: CreateClassScheduleDraft): ClassOperatingRuleInput {
  const slots: ClassOperatingRuleInput["slots"] = []
  const interval = Number(draft.intervalMinutes)
  if (!Number.isInteger(interval) || interval <= 0) throw new Error("invalid_operating_interval")
  for (const group of draft.groups) for (const day of group.weekdays) for (const range of group.timeRanges) {
    if (!timeValid(range.startTime) || !timeValid(range.lastStartTime)) throw new Error("invalid_operating_time")
    for (let start=minutes(range.startTime); start<=minutes(range.lastStartTime); start+=interval) {
      slots.push({weekday:day,startTime:timeText(start),endTime:timeText(start+interval),
        capacity:Number(draft.usePerTimeRangeCapacity ? range.capacity : draft.defaultCapacity),seriesId:group.id})
    }
  }
  return parseClassOperatingRule({operationType:draft.isAlwaysOpen ? "rolling" : "fixed_period",
    startDate:draft.operationStartDate,endDate:draft.isAlwaysOpen ? null : draft.operationEndDate,slots})
}

export function classOperatingRuleToDraft(rule: ClassOperatingRule): CreateClassScheduleDraft {
  const interval = minutes(rule.slots[0].endTime)-minutes(rule.slots[0].startTime)
  const groups = new Map<string,CreateClassScheduleDraft["groups"][number]>()
  for (const slot of rule.slots) {
    const key = slot.seriesId
    const group = groups.get(key) ?? {id:slot.seriesId,weekdays:[slot.weekday],timeRanges:[]}
    if (!group.weekdays.includes(slot.weekday)) group.weekdays.push(slot.weekday)
    if (!group.timeRanges.some((range)=>range.startTime===slot.startTime))
      group.timeRanges.push({id:`${slot.weekday}-${slot.startTime}`,startTime:slot.startTime,lastStartTime:slot.startTime,capacity:String(slot.capacity)})
    groups.set(key,group)
  }
  for (const group of groups.values()) {
    const compact: typeof group.timeRanges=[]
    for (const range of group.timeRanges.sort((a,b)=>a.startTime.localeCompare(b.startTime))) {
      const previous=compact.at(-1)
      if (previous && previous.capacity===range.capacity && minutes(previous.lastStartTime)+interval===minutes(range.startTime)) previous.lastStartTime=range.startTime
      else compact.push({...range})
    }
    group.timeRanges=compact
  }
  return {operationStartDate:rule.startDate,operationEndDate:rule.endDate ?? "",isAlwaysOpen:rule.operationType === "rolling",
    intervalMinutes:String(interval),defaultCapacity:String(rule.slots[0].capacity),usePerTimeRangeCapacity:true,
    operatingMode:groups.size === 1 ? "same" : "custom",groups:[...groups.values()],
    extraSlots:[],closedDates:[],closedSlotKeys:[]}
}
