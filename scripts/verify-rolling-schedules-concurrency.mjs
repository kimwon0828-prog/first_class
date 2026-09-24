// Real isolated PostgreSQL sessions. Never reads application credentials or .env files.
import {spawn} from 'node:child_process'
import assert from 'node:assert/strict'
const container=process.env.ROLLING_TEST_CONTAINER ?? 'firstclass-rolling-v1-test'
if (!/^firstclass-rolling-[a-z0-9-]+-test$/.test(container)) throw new Error('isolated_test_container_required')
function sql(input,onOutput=()=>{}) {
  return new Promise((resolve,reject)=>{
    const p=spawn('docker',['exec','-e',`PGPASSWORD=${process.env.ROLLING_TEST_PASSWORD ?? 'isolated-rolling-test'}`,'-i',container,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'])
    let out='',err=''
    p.stdout.on('data',d=>{out+=d;onOutput(String(d))});p.stderr.on('data',d=>err+=d)
    p.on('error',reject);p.on('close',code=>code===0?resolve(out.trim()):reject(new Error(err)))
    p.stdin.end(input)
  })
}
const org='30000000-0000-4000-8000-000000000001',user='30000000-0000-4000-8000-000000000010'
const auth=`select set_config('request.jwt.claim.sub','${user}',false);`
const cid=await sql(`
insert into public.organizations(id,name) values('${org}','Concurrency fixture') on conflict do nothing;
insert into auth.users(id,email) values('${user}','rolling-concurrency@example.invalid') on conflict do nothing;
insert into public.profiles(id,role,name,organization_id) values('${user}','academy','Fixture','${org}') on conflict(id) do update set role='academy',organization_id='${org}';
with c as (insert into public.classes(organization_id,title,subject,target_age,description,is_active)
values('${org}','Concurrent fixture','piano','elem_1','Isolated fixture',true) returning id)
insert into public.class_operating_rules(class_id,operation_type,start_date,slots)
select id,'rolling',(now() at time zone 'Asia/Seoul')::date,
(select jsonb_agg(jsonb_build_object('weekday',i,'startTime','15:00','endTime','16:00','capacity',3,'seriesId','30000000-0000-4000-8000-000000000050')) from generate_series(0,6)i) from c returning class_id;`)
await Promise.all(Array.from({length:4},()=>sql(`select public.extend_rolling_class_schedule('${cid}');`)))
assert.equal(await sql(`select count(*)=count(distinct (specific_date,start_time)) from public.class_schedules where class_id='${cid}';`),'t')
const sid=await sql(`select id from public.class_schedules where class_id='${cid}' and specific_date=(now() at time zone 'Asia/Seoul')::date+1;`)
let lockedResolve
const locked=new Promise(resolve=>lockedResolve=resolve)
const booking=sql(`begin; insert into public.trial_applications(class_id,class_schedule_id,child_name,child_grade,requested_slot_at)
values('${cid}','${sid}','Concurrent child','elem_1',now()+interval '1 day'); select 'BOOKING_LOCKED'; select pg_sleep(1); commit;`,out=>{if(out.includes('BOOKING_LOCKED'))lockedResolve()})
await locked
const change=sql(`${auth} select id from public.save_studio_class_operating_rule('${cid}',
jsonb_build_object('organization_id','${org}','title','Changed'),
jsonb_build_object('operationType','rolling','startDate',(now() at time zone 'Asia/Seoul')::date,'endDate',null,
'slots',(select jsonb_agg(jsonb_build_object('weekday',i,'startTime','17:00','endTime','18:00','capacity',4,'seriesId','30000000-0000-4000-8000-000000000051')) from generate_series(0,6)i)),1);`)
await Promise.all([booking,change])
assert.equal(await sql(`select count(*)=1 from public.trial_applications a join public.class_schedules s on s.id=a.class_schedule_id where s.id='${sid}' and s.start_time='15:00';`),'t')

// Concurrent individual manual changes must not overwrite each other's fields.
const manual=await sql(`select id from public.class_schedules where class_id='${cid}' and specific_date=(now() at time zone 'Asia/Seoul')::date+2 and start_time='17:00';`)
await Promise.all([
 sql(`${auth} select id from public.mutate_studio_class_schedule('${manual}','{"capacity":9}');`),
 sql(`${auth} select id from public.mutate_studio_class_schedule('${manual}','{"booking_status":"hidden"}');`),
 sql(`select public.extend_rolling_class_schedule('${cid}');`)
])
assert.equal(await sql(`select capacity=9 and booking_status='hidden' and is_manual_override from public.class_schedules where id='${manual}';`),'t')
console.log('PASS: four concurrent jobs, booking versus rule change, concurrent capacity/visibility operations, stable FK/IDs')
