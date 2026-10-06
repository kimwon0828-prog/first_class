// Runs the real adapter with a paginated, read-only PostgREST fixture. No network/DB writes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = process.cwd(), originalLoad = Module._load
Module._load = function(name, parent, main) {
  if (/integrations\/supabase\/(server|service-role)$/.test(name)) return {
    getSupabaseServerClient: async()=>client, getSupabaseServiceRoleClient:()=>client
  }
  if (name === 'server-only') return {}
  if (name === 'next/cache') return {unstable_cache: fn=>fn}
  if (name.startsWith('@/')) name = path.join(root, 'src', name.slice(2))
  return originalLoad.call(this, name, parent, main)
}
Module._extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,filename)
const {supabaseDataAdapter: adapter} = require('../src/shared/lib/db/supabase-adapter.ts')
const {getStudioScheduleRange} = require('../src/features/studio/lib/studio-schedule-range.ts')
const classes = Array.from({length:8},(_,i)=>({id:`c${i}`,title:`Class ${i}`,organization_id:i===7?'other':'org',teacher_id:`t${i%3}`,program_type:'trial_class',is_active:true,archived_at:null}))
const teachers = Array.from({length:3},(_,i)=>({id:`t${i}`,display_name:`Teacher ${i}`,organization_id:'org',profile_id:null}))
const date = n=>new Date(Date.UTC(2026,0,1+n)).toISOString().slice(0,10)
const schedules = Array.from({length:2500},(_,i)=>({id:`s${i}`,class_id:classes[i%8].id,classes:classes[i%8],schedule_type:'one_time',specific_date:date(Math.floor(i/6)),start_time:'15:00:00',end_time:'16:00:00',capacity:3,booking_status:'open',created_at:'2026-01-01T00:00:00Z'}))
const apps = Array.from({length:1600},(_,i)=>{
 const s=schedules[Math.floor(i * 2500 / 1600)], at=`${s.specific_date}T06:00:00+00:00`, status=['new','reviewing','confirmed','completed','canceled'][i%5]
 return {id:`a${String(i).padStart(5,'0')}`,class_id:s.class_id,classes:s.classes,class_schedule_id:s.id,class_schedules:s,child_name:'Synthetic',child_grade:'초6',assigned_teacher_id:i%4===0?null:`t${i%3}`,
 requested_slot_at:at,confirmed_slot_at:['confirmed','completed'].includes(status)?at:null,confirmed_schedule_block_id:null,confirmed_block:null,
 completed_at:status==='completed'?at:null,canceled_at:status==='canceled'&&i%2===0?at:null,no_show_at:status==='canceled'&&i%2?at:null,status,
 created_at:at,updated_at:at}
})
// One retained confirmed block with no slot timestamp, and one genuinely undated record.
apps.push({...apps[2],id:'block-only',confirmed_slot_at:null,confirmed_schedule_block_id:'block',confirmed_block:{start_at:'2026-09-28T06:00:00Z',end_at:'2026-09-28T07:00:00Z'}})
apps.push({...apps[4],id:'unknown',canceled_at:null,no_show_at:null})
// Repeating schedule: canonical keys must not merge separate weeks; any history protects deletion.
schedules.push({ ...schedules[0],id:'weekly',specific_date:null,schedule_type:'weekly',day_of_week:1 })
for (const [id,at,status] of [['week1','2026-09-07T06:00:00+00:00','new'],['week2','2026-09-14T06:00:00.000Z','confirmed'],['history','2026-09-21T06:00:00Z','completed']]) {
 apps.push({...apps[0],id,class_id:'c0',class_schedule_id:'weekly',requested_slot_at:at,status})
}
schedules.push({ ...schedules[0], id: 'full-one-time', specific_date: '2026-09-28' })
for (const [i,status] of ['new','reviewing','confirmed','completed','canceled'].entries()) {
 apps.push({...apps[0],id:`capacity-${i}`,class_schedule_id:'full-one-time',requested_slot_at:i%2?'2026-09-28T06:00:00.000Z':'2026-09-28T06:00:00+00:00',status})
}
const calls=[]; let fail=false
const split = value=>{let depth=0,start=0,out=[]; for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===','&&depth===0){out.push(value.slice(start,i));start=i+1}}out.push(value.slice(start));return out}
const get=(row,field)=>field.split('.').reduce((value,key)=>value?.[key],row)??null
const compare=(row,field,op,value)=>{
 const actual=get(row,field)
 if(op==='is')return actual===(value==='null'?null:value)
 if(op==='in')return value.includes(actual)
 if(actual===null)return false
 const left=/(_at|start_at)$/.test(field)?Date.parse(actual):actual
 const right=/(_at|start_at)$/.test(field)?Date.parse(value):value
 return op==='eq'?actual===value:op==='gte'?left>=right:op==='lte'?left<=right:op==='lt'?left<right:op==='gt'?left>right:false
}
const logic=(row,expr)=>{
 if(expr.startsWith('and('))return split(expr.slice(4,-1)).every(term=>logic(row,term))
 if(expr.startsWith('or('))return split(expr.slice(3,-1)).some(term=>logic(row,term))
 const m=expr.match(/^(.*?)\.(eq|is|in|gte|lte|lt|gt)\.(.*)$/);assert.ok(m,expr)
 return compare(row,m[1],m[2],m[2]==='in'?split(m[3].slice(1,-1)):m[3])
}
const client={from(table){
 const conditions=[],orders=[];let start=0,end=999,fields=''
 const q={select(value){fields=value;return q},eq(k,v){conditions.push(r=>compare(r,k,'eq',v));return q},in(k,v){conditions.push(r=>compare(r,k,'in',v));return q},is(k,v){conditions.push(r=>get(r,k)===v);return q},gte(k,v){conditions.push(r=>compare(r,k,'gte',v));return q},lt(k,v){conditions.push(r=>compare(r,k,'lt',v));return q},or(expr){conditions.push(r=>split(expr).some(term=>logic(r,term)));return q},order(k,o={}){orders.push([k,o.ascending!==false]);return q},range(a,b){start=a;end=b;return q},then(resolve,reject){
  let rows=({classes,teachers,class_schedules:schedules,studio_trial_applications:apps,trial_applications:apps,profiles:[]})[table];assert.ok(rows,table)
  rows=rows.filter(r=>conditions.every(fn=>fn(r)))
  if(fields.includes('_fkey!inner'))rows=rows.filter(r=>r.confirmed_block)
  rows=rows.toSorted((a,b)=>{for(const[k,asc]of orders){const av=get(a,k),bv=get(b,k);if(av!==bv)return(av>bv?1:-1)*(asc?1:-1)}return 0})
  const count=rows.length, data=rows.slice(start,Math.min(end+1,start+37)) // small API row cap exercises pagination
  calls.push({table,matched:count,returned:data.length,start,fields})
  return Promise.resolve({data,error:fail?{message:'fixture failure'}:null,count}).then(resolve,reject)
 }};return q
}}
;(async()=>{
 for(const view of ['day','week','month']){
  calls.length=0;const range=getStudioScheduleRange(view,'2026-09-28')
  const result=await adapter.listStudioApplications('org',{scheduleRange:range})
  const expected=apps.filter(a=>a.classes.organization_id==='org').filter(a=>{
    const at=['new','reviewing'].includes(a.status)?a.requested_slot_at:a.confirmed_slot_at??a.confirmed_block?.start_at??(a.status==='canceled'?a.no_show_at??a.canceled_at:a.completed_at)
    return at?Date.parse(at)>=Date.parse(range.from)&&Date.parse(at)<Date.parse(range.to):['completed','canceled'].includes(a.status)
  })
  assert.deepEqual(result.map(a=>a.id).sort(),expected.map(a=>a.id).sort(),view)
  assert.equal(new Set(result.map(a=>a.id)).size,result.length)
  assert.ok(result.filter(a=>!apps.find(raw=>raw.id===a.id).assigned_teacher_id).every(a=>a.assignedTeacherId===null))
  assert.ok(calls.filter(c=>c.table==='teachers').length<=1,'no per-application teacher reads')
  assert.ok(calls.filter(c=>c.table==='studio_trial_applications').every(c=>c.matched<1600))
  console.log(`PASS ${view}: ${result.length}/${apps.length} applications; ${calls.length} paged queries (API cap 37)`)
 }
 calls.length=0
 const calendar=await adapter.getStudioScheduleCalendar({organizationId:'org',month:'2026-09'})
 const returnedSchedules=calls.filter(c=>c.table==='class_schedules').reduce((sum,c)=>sum+c.returned,0)
 assert.ok(returnedSchedules<2500/4)
 assert.ok(calendar.items.every(item=>item.specificDate.startsWith('2026-09')))
 const full=calendar.items.find(item=>item.classScheduleId==='full-one-time')
 assert.equal(full.activeReservationCount,3);assert.equal(full.minimumCapacity,3);assert.equal(full.remainingCapacity,0);assert.equal(full.status,'closed');assert.ok(full.hasApplicationHistory)
 const weekly=calendar.items.filter(item=>item.classScheduleId==='weekly')
 assert.equal(weekly.find(item=>item.specificDate==='2026-09-07').activeReservationCount,1)
 assert.equal(weekly.find(item=>item.specificDate==='2026-09-14').activeReservationCount,1)
 assert.equal(weekly.find(item=>item.specificDate==='2026-09-21').activeReservationCount,0)
 assert.ok(weekly.every(item=>item.hasApplicationHistory))
 const completedOnly=calendar.items.find(item=>apps.some(a=>a.class_schedule_id===item.classScheduleId&&a.status==='completed') && !apps.some(a=>a.class_schedule_id===item.classScheduleId&&['new','reviewing','confirmed'].includes(a.status)))
 assert.ok(completedOnly.hasApplicationHistory);assert.equal(completedOnly.activeReservationCount,0)
 console.log(`PASS calendar: ${returnedSchedules}/${schedules.length} schedule rows; ${calls.length} paged/batched queries; canonical weekly counts + historical protection`)
 const options=await adapter.getStudioScheduleFilterOptions('org')
 assert.equal(options.classes.length,8);assert.equal(options.teachers.length,5)
 assert.ok(options.classes.some(c=>c.value==='c6'))
 fail=true
 await assert.rejects(()=>adapter.listStudioApplications('org',{scheduleRange:getStudioScheduleRange('day','2026-09-28')}),/failed_to_fetch/)
 await assert.rejects(()=>adapter.getStudioScheduleCalendar({organizationId:'org',month:'2026-09'}),/failed_to_fetch/)
 console.log('PASS stable filters, organization scope, explicit query failures; no network/DB writes')
})().catch(error=>{console.error(error);process.exitCode=1})
