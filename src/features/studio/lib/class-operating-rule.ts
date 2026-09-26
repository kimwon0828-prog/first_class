import {
  buildOperatingTimeRangeSlots,
  type CreateClassScheduleDraft,
  type OperatingHoursTimeRangeDraft
} from "./studio-operating-hours"

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
  const duration = Number(draft.intervalMinutes)
  if (!Number.isInteger(duration) || duration <= 0) throw new Error("invalid_operating_interval")
  for (const group of draft.groups) for (const day of group.weekdays) for (const range of group.timeRanges) {
    const generated = buildOperatingTimeRangeSlots(range,duration,draft.timeInputMode)
    if (generated.length === 0) throw new Error("invalid_operating_time")
    for (const slot of generated) {
      slots.push({weekday:day,startTime:slot.startTime,endTime:slot.endTime,
        capacity:Number(draft.usePerTimeRangeCapacity ? range.capacity : draft.defaultCapacity),seriesId:group.id})
    }
  }
  return parseClassOperatingRule({operationType:draft.isAlwaysOpen ? "rolling" : "fixed_period",
    startDate:draft.operationStartDate,endDate:draft.isAlwaysOpen ? null : draft.operationEndDate,slots})
}

export function classOperatingRuleToDraft(rule: ClassOperatingRule): CreateClassScheduleDraft {
  const duration = minutes(rule.slots[0].endTime)-minutes(rule.slots[0].startTime)
  const seriesIds = [...new Set(rule.slots.map((slot) => slot.seriesId))]
  const series = seriesIds.map((seriesId) => {
    const allSlots = rule.slots.filter((slot) => slot.seriesId === seriesId)
    const weekdays = [...new Set(allSlots.map((slot) => slot.weekday))].sort((a,b)=>a-b)
    const firstDaySlots = allSlots.filter((slot) => slot.weekday === weekdays[0])
      .sort((left,right)=>left.startTime.localeCompare(right.startTime))
    const firstStart = minutes(firstDaySlots[0].startTime)
    const regular = new Set(firstDaySlots.map((slot) => slot.capacity)).size === 1
      && firstDaySlots.every((slot) => (minutes(slot.startTime)-firstStart)%duration===0)
    return {seriesId,weekdays,slots:firstDaySlots,regular}
  })
  const timeInputMode: NonNullable<CreateClassScheduleDraft["timeInputMode"]> =
    series.every((item)=>item.regular) ? "range" : "individual"
  const groups = series.map((item) => {
    const individual = item.slots.map<OperatingHoursTimeRangeDraft>((slot) => ({
      id:`${item.seriesId}-${slot.startTime}`,startTime:slot.startTime,operationEndTime:slot.endTime,
      lastStartTime:slot.startTime,capacity:String(slot.capacity)
    }))
    if (timeInputMode === "individual") {
      return {id:item.seriesId,weekdays:item.weekdays,timeRanges:individual}
    }
    const compact: OperatingHoursTimeRangeDraft[]=[]
    for (const range of individual) {
      const previous=compact.at(-1)
      if (previous && minutes(previous.lastStartTime)+duration===minutes(range.startTime)) {
        previous.lastStartTime=range.startTime
        previous.operationEndTime=range.operationEndTime
      } else compact.push({...range})
    }
    return {id:item.seriesId,weekdays:item.weekdays,timeRanges:compact}
  })
  return {operationStartDate:rule.startDate,operationEndDate:rule.endDate ?? "",isAlwaysOpen:rule.operationType === "rolling",
    intervalMinutes:String(duration),timeInputMode,defaultCapacity:String(rule.slots[0].capacity),usePerTimeRangeCapacity:true,
    operatingMode:groups.length === 1 ? "same" : "custom",groups,
    extraSlots:[],closedDates:[],closedSlotKeys:[]}
}
