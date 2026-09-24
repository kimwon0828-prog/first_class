import type { ClassSummary, StudioClassScheduleItem } from "@/shared/lib/db/adapter"

export type ScheduleException = {classId:string;date:string;startTime:string|null;status:"open"|"closed"|"hidden"|"deleted"}
export const mockScheduleExceptions: ScheduleException[] = []

// Mock parity only. Production reconciliation is transactional SQL, not a fetch/write replay.
export function reconcileMockOperatingRule(item: ClassSummary, today: string, reconcile: boolean) {
  const rule = item.operatingRule
  if (!rule?.isActive) return
  const now = Date.now()
  const isFuture = (s:StudioClassScheduleItem)=>s.specificDate && s.specificDate>=today && Date.parse(`${s.specificDate}T${s.startTime.slice(0,5)}:00+09:00`)>now
  const exceptions = mockScheduleExceptions.filter(e=>e.classId===item.id)
  const exception = (date:string,time:string)=>exceptions.find(e=>e.date===date && (e.startTime===null || e.startTime===time))
  const matching = (s:StudioClassScheduleItem)=>rule.slots.find(x=>x.weekday===new Date(`${s.specificDate}T00:00:00Z`).getUTCDay()
    && x.startTime===s.startTime.slice(0,5) && x.endTime===s.endTime.slice(0,5))
  if (reconcile) item.schedules=(item.schedules ?? []).filter(s=>{
    if (s.generatedByRuleId!==rule.id || s.isManualOverride || !isFuture(s) || s.isReferencedByApplications || (s.applicationCount ?? 0)>0
      || exception(s.specificDate!,s.startTime.slice(0,5))) return true
    const match=matching(s)
    if (!match || s.specificDate!<rule.startDate || rule.endDate && s.specificDate!>rule.endDate) return false
    s.capacity=match.capacity
    return true
  })
  if (!item.isActive && rule.operationType==='rolling') return
  const end=rule.endDate ?? new Date(Date.parse(`${today}T00:00:00Z`)+89*86400000).toISOString().slice(0,10)
  const schedules=item.schedules ?? []
  for (let day=rule.startDate>today ? rule.startDate : today;day<=end;day=new Date(Date.parse(`${day}T00:00:00Z`)+86400000).toISOString().slice(0,10)) {
    for (const slot of rule.slots.filter(s=>s.weekday===new Date(`${day}T00:00:00Z`).getUTCDay())) {
      const ex=exception(day,slot.startTime)
      if (ex?.startTime || ex?.status==='deleted' || Date.parse(`${day}T${slot.startTime}:00+09:00`)<=now
        || schedules.some(s=>s.specificDate===day && s.startTime.slice(0,5)===slot.startTime)) continue
      schedules.push({id:crypto.randomUUID(),scheduleType:'one_time',specificDate:day,dayOfWeek:null,startTime:slot.startTime,
        endTime:slot.endTime,capacity:slot.capacity,seriesId:slot.seriesId,bookingStatus:ex?.status ?? 'open',displayLabel:null,
        sortOrder:0,generatedByRuleId:rule.id,isManualOverride:false})
    }
  }
  item.schedules=schedules
}
