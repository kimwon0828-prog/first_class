// Extra source/permission/legacy cases in the same explicitly isolated fixture DB.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process')
const f=JSON.parse(fs.readFileSync(process.env.CLOSURES_DB_FIXTURE,'utf8'));assert(/^closures_test_v\d+$/.test(f.database))
const args=['exec','-e','PGPASSWORD=isolated-closures-test','-i','firstsuup-closures-isolated','psql','-X','-qAt','-U','supabase_admin','-d',f.database,'-v','ON_ERROR_STOP=1']
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim(),q=s=>"'"+String(s).replaceAll("'","''")+"'",arr=(xs,type='text')=>`array[${xs.map(q).join(',')}]::${type}[]`
const auth=id=>`set request.jwt.claim.sub='${id}';set role authenticated;`,teacher=auth(f.studio)
const get=date=>JSON.parse(sql(`${teacher}select public.get_studio_booking_day('${date}','${f.org}')`))
const stamp=(d,h)=>sql(`select (('${d}'::date+time '${h}:00') at time zone 'Asia/Seoul')::text`)
function close(date,scope,selected){const d=get(date),targets=d.occurrences.filter(o=>(!scope||scope===o.classId)&&selected.some(s=>Date.parse(s.startAt)<Date.parse(o.endAt)&&Date.parse(s.endAt)>Date.parse(o.startAt))).map(o=>o.key);return JSON.parse(sql(`${teacher}select public.mutate_studio_booking_closures('${date}','${scope}','close',${arr(selected.map(o=>o.key))},${arr(targets)},'{}','Synthetic closure')`))}
function release(date,scope,ids){const d=get(date),windows=d.closures.filter(c=>ids.includes(c.id)),targets=d.occurrences.filter(o=>(!scope||scope===o.classId)&&windows.some(c=>Date.parse(c.startAt)<Date.parse(o.endAt)&&Date.parse(c.endAt)>Date.parse(o.startAt))).map(o=>o.key);return sql(`${teacher}select public.mutate_studio_booking_closures('${date}','${scope}','release','{}',${arr(targets)},${arr(ids,'uuid')},null)`)}
function fail(s,code){let error='';try{sql(s)}catch(e){error=e.stderr?.toString()||e.message}assert(error.includes(code),code)}
const at=(day,hour)=>day.occurrences.find(o=>o.classId===f.a&&new Date(o.startAt).getUTCHours()===hour-9)
;(async()=>{
 const d=get(f.day),slot13=at(d,13),slot14=at(d,14),slot12=at(d,12),app='60000000-0000-4000-8000-000000000080',teacherId='60000000-0000-4000-8000-000000000030'
 sql(`insert into public.teachers(id,organization_id,display_name,is_active) values('${teacherId}','${f.org}','Isolated teacher',true) on conflict do nothing;`)
 close(f.day,f.a,[slot13])
 // The actual current Production confirmation function: same-time existing booking survives.
 if(sql(`select status from public.trial_applications where id='${app}'`)==='new')sql(`${teacher}select public.set_studio_application_schedule('${app}','confirm','${teacherId}',(select updated_at from public.studio_trial_applications where id='${app}'))`)
 assert.equal(sql(`select status from public.trial_applications where id='${app}'`),'confirmed')
 const block13=sql(`select confirmed_schedule_block_id from public.trial_applications where id='${app}'`),slot15=at(d,15)
 fail(`${auth(f.parent)}insert into public.trial_applications(id,parent_id,class_id,class_schedule_id,requested_schedule_block_id,requested_slot_at,child_name,child_grade,status) values(gen_random_uuid(),'${f.parent}','${f.a}','${slot15.id}','${block13}','${slot15.startAt}','Forged shorter source','elem_1','new');`,'invalid_schedule_slot')
 fail(`${auth(f.parent)}insert into public.trial_applications(id,parent_id,class_id,requested_schedule_block_id,requested_slot_at,child_name,child_grade,status) values(gen_random_uuid(),'${f.parent}','${f.a}','${block13}','${slot13.startAt}','Closed block source','elem_1','new');`,'schedule_date_booking_closed')
 fail(`${teacher}update public.date_booking_closures set released_at=now();`,'permission denied')
 release(f.day,f.a,get(f.day).closures.filter(c=>c.classId===f.a).map(c=>c.id))
 // Base closed stays closed; full stays full after overlay release.
 sql(`${auth(f.parent)}insert into public.trial_applications(id,parent_id,class_id,class_schedule_id,requested_slot_at,child_name,child_grade,status) values(gen_random_uuid(),'${f.parent}','${f.a}','${slot12.id}','${slot12.startAt}','Full 2','elem_1','new'),(gen_random_uuid(),'${f.parent}','${f.a}','${slot12.id}','${slot12.startAt}','Full 3','elem_1','new');`)
 close(f.day,f.a,[slot12]);release(f.day,f.a,get(f.day).closures.filter(c=>c.classId===f.a).map(c=>c.id))
 fail(`${auth(f.parent)}insert into public.trial_applications(id,parent_id,class_id,class_schedule_id,requested_slot_at,child_name,child_grade,status) values(gen_random_uuid(),'${f.parent}','${f.a}','${slot12.id}','${slot12.startAt}','Full 4','elem_1','new');`,'slot_capacity_reached')
 fail(`${auth(f.parent)}insert into public.trial_applications(id,parent_id,class_id,class_schedule_id,requested_slot_at,child_name,child_grade,status) values(gen_random_uuid(),'${f.parent}','${f.a}','${slot14.id}','${slot14.startAt}','Base closed','elem_1','new');`,'schedule_booking_closed')
 const cutoff=JSON.parse(sql(`select jsonb_build_object('date',d::date,'start',(d at time zone 'Asia/Seoul'),'end',((d+interval '1 hour') at time zone 'Asia/Seoul')) from (select case when (now() at time zone 'Asia/Seoul')::time<'09:00' then (now() at time zone 'Asia/Seoul')::date+time '15:00' else (now() at time zone 'Asia/Seoul')::date+1+time '09:00' end as d)t`))
 const sid=sql(`insert into public.class_schedules(class_id,schedule_type,specific_date,start_time,end_time,capacity,booking_status,is_manual_override) values('${f.b}','one_time','${cutoff.date}',('${cutoff.start}'::timestamptz at time zone 'Asia/Seoul')::time,('${cutoff.end}'::timestamptz at time zone 'Asia/Seoul')::time,3,'open',true) returning id`)
 fail(`${auth(f.parent)}insert into public.trial_applications(id,parent_id,class_id,class_schedule_id,requested_slot_at,child_name,child_grade,status) values(gen_random_uuid(),'${f.parent}','${f.b}','${sid}','${cutoff.start}','Cutoff stale request','elem_1','new');`,'booking_cutoff_reached')
 const weekday=sql(`select extract(dow from '${f.day}'::date)::text`),weekly=sql(`insert into public.class_schedules(class_id,schedule_type,day_of_week,start_time,end_time,capacity,booking_status) values('${f.b}','weekly',${weekday},'12:30','14:00',3,'open') returning id`)
 const weeklyRow=get(f.day).occurrences.find(o=>o.id===weekly);close(f.day,f.b,[weeklyRow])
 fail(`${auth(f.parent)}insert into public.trial_applications(id,parent_id,class_id,class_schedule_id,requested_slot_at,child_name,child_grade,status) values(gen_random_uuid(),'${f.parent}','${f.b}','${weekly}','${weeklyRow.startAt}','Closed weekly occurrence','elem_1','new');`,'schedule_date_booking_closed')
 const nextWeek=sql(`select ('${f.day}'::date+7)::text`),nextStart=stamp(nextWeek,'12:30')
 sql(`${auth(f.parent)}insert into public.trial_applications(id,parent_id,class_id,class_schedule_id,requested_slot_at,child_name,child_grade,status) values(gen_random_uuid(),'${f.parent}','${f.b}','${weekly}','${nextStart}','Other week survives','elem_1','new');`)
 release(f.day,f.b,get(f.day).closures.filter(c=>c.classId===f.b).map(c=>c.id))
 // New time assignment cannot use a closed destination, even through the Studio view.
 const moveDate=sql(`select ('${f.day}'::date+2)::text`),move=get(moveDate),slot18=at(move,18),slot19=at(move,19)
 close(moveDate,f.a,[slot19]);const moveId=sql(`select gen_random_uuid()`)
 sql(`${auth(f.parent)}insert into public.trial_applications(id,parent_id,class_id,class_schedule_id,requested_slot_at,child_name,child_grade,status) values('${moveId}','${f.parent}','${f.a}','${slot18.id}','${slot18.startAt}','Move fixture','elem_1','new');`)
 fail(`${teacher}update public.studio_trial_applications set class_schedule_id='${slot19.id}',requested_slot_at='${slot19.startAt}' where id='${moveId}';`,'schedule_date_booking_closed')
 assert.equal(sql(`select requested_slot_at='${slot18.startAt}'::timestamptz from public.trial_applications where id='${moveId}'`),'t')
 // A removed future occurrence leaves a releasable closure, never a phantom slot.
 const orphanDate=sql(`select ('${f.day}'::date+5)::text`),orphan=at(get(orphanDate),20);close(orphanDate,f.a,[orphan]);const orphanIds=get(orphanDate).closures.map(c=>c.id)
 sql(`delete from public.class_schedules where id='${orphan.id}'`);assert(!get(orphanDate).occurrences.some(o=>o.id===orphan.id));assert.equal(get(orphanDate).closures.length,1);release(orphanDate,f.a,orphanIds);assert.equal(get(orphanDate).closures.length,0)
 console.log('PASS isolated edge cases: actual existing confirmation, block/weekly sources, private reason and direct-write denial, full/base/cutoff preservation, closed new time reassignment rollback, orphan closure release')
})().catch(e=>{console.error(e.stderr?.toString()||e.stack);process.exitCode=1})
