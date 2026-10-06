import assert from "node:assert/strict"
import { visibleBookingOccurrences, bookingClassOptions, visibleScheduleClassOptions, withBookingClassHistory, previewBookingClosure, type BookingDay, type BookingOccurrence } from "../src/features/studio/lib/booking-closures"
import { createWorkflowApplication } from "./fixtures/application-detail-workflow"
import { buildStudioScheduleEvents, filterStudioScheduleEvents } from "../src/features/studio/lib/studio-schedule-events"
const date="2026-10-09",at=(h:number)=>`${date}T${h}:00:00+09:00`
const slot=(key:string,classId:string,h=13,status:BookingOccurrence["bookingStatus"]="open"):BookingOccurrence=>({key,source:"class_schedule",id:key,classId,classTitle:classId,startAt:at(h),endAt:at(h+1),capacity:1,bookingStatus:status,reservationIds:[],closureIds:[]})
const slots=[slot("public","pub"),slot("full","pub",14),slot("base","pub",15,"closed"),slot("schedule-hidden","pub",16,"hidden"),slot("private-empty","private"),slot("private-booked","booked",14),slot("private-history","history",15),slot("private-closed","closed",16)]
slots[1].reservationIds=["active-full"];slots[5].reservationIds=["existing"];slots[7].closureIds=["saved"]
const classes=[{id:"pub",title:"Public",isActive:true,archivedAt:null},...['private','booked','history','closed','orphan'].map(id=>({id,title:id,isActive:false,archivedAt:null})),{id:'archived',title:'Archived',isActive:true,archivedAt:'2026-10-01'}]
const saved={id:"saved",organizationId:"org",classId:"closed",dateKey:date,startAt:at(16),endAt:at(17),reason:"Internal"},orphan={...saved,id:"orphan",classId:"orphan"}
const day:BookingDay=withBookingClassHistory({occurrences:slots,closures:[saved,orphan]},classes,[{classId:"history",requestedSlotAt:at(15),confirmedSlotAt:null}])
assert.deepEqual(visibleBookingOccurrences(day).map(o=>o.key),['public','full','base','schedule-hidden','private-booked','private-history','private-closed'])
assert.deepEqual(bookingClassOptions(day).map(o=>o.value).sort(),['pub','booked','history','closed','orphan'].sort())
// Orphan scoped closure is selected through class options even without a source row.
assert(bookingClassOptions(day).some(c=>c.value===orphan.classId));assert.equal(day.closures.length,2)
// New all-public scope excludes private rows without hiding saved records.
assert.deepEqual(previewBookingClosure(day,['public'],null,'close').targets.map(o=>o.key),['public'])
assert.deepEqual(previewBookingClosure(day,['public'],'pub','close').targets.map(o=>o.key),['public'])
const before=structuredClone(day);visibleBookingOccurrences(day);bookingClassOptions(day);assert.deepEqual(day,before)
const options=[{value:'all',label:'전체'},...classes.map(c=>({...c,value:c.id,label:c.title}))]
assert.deepEqual(visibleScheduleClassOptions(options,['booked','history'],day.closures).map(c=>c.value).sort(),['all','pub','booked','history','closed','orphan'].sort())
assert.equal(visibleBookingOccurrences({...day,occurrences:[slots[4]],closures:[],applicationHistoryKeys:[]}).length,0)
assert.equal(bookingClassOptions({...day,occurrences:[],closures:[],applicationHistoryKeys:[]}).length,0)
assert(visibleBookingOccurrences({...day,classes:classes.map(c=>({...c,isActive:false})),occurrences:[slots[7]],closures:[saved]}).some(o=>o.key==='private-closed'))
const events=buildStudioScheduleEvents(['new','reviewing','confirmed','completed','canceled'].map((status,i)=>createWorkflowApplication({id:`record-${i}`,classId:'booked',classTitle:'Private with record',status:status as 'new'|'reviewing'|'confirmed'|'completed'|'canceled',requestedSlotAt:at(14),confirmedSlotAt:['new','reviewing'].includes(status)?null:at(14),completedAt:status==='completed'?at(15):null,canceledAt:status==='canceled'?at(15):null})))
assert.equal(events.length,5);assert(events.every(e=>e.detailHref===`/studio/applications/${e.id}`))
assert.equal(filterStudioScheduleEvents(events,{teacherId:'all',classId:'booked',status:'completed'}).length,1)
assert.equal(filterStudioScheduleEvents(events,{teacherId:'all',classId:'booked',status:'canceled'}).length,1)
console.log('PASS Studio visibility: Parent Lifecycle predicate, public restricted rows retained, empty private excluded, active/historical reservations and closures retained, orphan access, public impact scope, unchanged calendar details/status filters, empty lists')
