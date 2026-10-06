import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { bookingIntervalsOverlap,previewBookingClosure,groupBookingOccurrences,mergeBookingClosureRanges,type BookingOccurrence,type BookingDay,type BookingClosure } from "@/features/studio/lib/booking-closures"
const date="2026-10-09",at=(hour:number,minute=0)=>new Date(`${date}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00+09:00`).toISOString()
const slot=(id:string,c:string,start:number,end:number,minute=0):BookingOccurrence=>({key:`${c}/class_schedule/${id}`,id,source:"class_schedule",classId:c,classTitle:c,startAt:at(start,minute),endAt:at(end,minute),bookingStatus:"open",capacity:3,reservationIds:[],closureIds:[]})
const rows=[slot("12","A",12,13),slot("13","A",13,14),slot("14","A",14,15),slot("15","A",15,16),slot("offset","B",13,15,30),slot("b15","B",15,16)]
rows[2].reservationIds=["existing"]
const day:BookingDay={occurrences:rows,closures:[]},keys=[rows[1].key,rows[2].key]
assert.deepEqual(previewBookingClosure(day,keys,"A","close").targets.map(x=>x.id),["13","14"])
assert.deepEqual(previewBookingClosure(day,keys,null,"close").targets.map(x=>x.id),["13","14","offset"])
assert.equal(previewBookingClosure(day,keys,null,"close").reservationCount,1)
assert(!bookingIntervalsOverlap(rows[1],rows[0]));assert(!bookingIntervalsOverlap(rows[2],rows[3]))
const closure=(id:string,classId:string|null,start:number,end:number):BookingClosure=>({id,organizationId:"org",classId,dateKey:date,startAt:at(start),endAt:at(end),reason:"INTERNAL"})
day.closures=[closure("a13","A",13,14),closure("a14","A",14,15),closure("global",null,13,14)]
assert.equal(previewBookingClosure(day,keys,"A","close").canApply,false)
assert.deepEqual(previewBookingClosure(day,keys,"A","release").closureIds,["a13","a14"])
assert.deepEqual(previewBookingClosure(day,keys,null,"release").closureIds,["global"])
const merged=mergeBookingClosureRanges(day.closures);assert.equal(merged.length,2);assert(merged.some(c=>c.classId==="A"&&c.endAt===at(15)))
assert.equal(groupBookingOccurrences([rows[1],{...rows[1],id:"b",classId:"B",key:"B/class_schedule/b"}]).length,1)
assert.equal(rows[1].id,"13");assert.equal(day.closures[0].endAt,at(14)) // Helpers don't rewrite input.
assert.equal(previewBookingClosure(day,[],null,"close").canApply,false)
const migration=readFileSync("supabase/migrations/20261006120000_date_booking_closures_compat.sql","utf8")
assert(!/\bdrop\b/i.test(migration));assert(!/update public\.(class_schedules|trial_applications|classes)\b/i.test(migration))
assert(migration.includes("for no key update"));assert(migration.includes("zz_enforce_date_booking_application"));assert(migration.includes("starts<now()+interval '24 hours'"))
const adapter=readFileSync("src/shared/lib/db/supabase-adapter.ts","utf8")
assert(adapter.includes('get_closed_booking_slot_indexes'));assert(adapter.includes('"schedule_date_booking_closed"'))
assert(!migration.slice(migration.indexOf("create function public.get_closed_booking_slot_indexes"),migration.indexOf("create function public.mutate_studio_booking_closures")).includes("reason"))
console.log("PASS date booking closure helpers: half-open KST ranges, different lengths, scope preview/unique reservation count, independent release, partial groups, non-mutating merge, additive migration, private reason boundary")
