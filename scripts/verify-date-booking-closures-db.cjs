// Isolated PostgreSQL only. Never connects to Production or reads application env.
const {spawn,execFileSync}=require('node:child_process'),assert=require('node:assert/strict'),fs=require('node:fs')
const container='firstsuup-closures-isolated',database=process.env.CLOSURES_TEST_DB||'closures_test_v2'
assert(/^closures_test(?:_v\d+)?$/.test(database))
const args=['exec','-e','PGPASSWORD=isolated-closures-test','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1']
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
const org='60000000-0000-4000-8000-000000000001',other='60000000-0000-4000-8000-000000000002',studio='60000000-0000-4000-8000-000000000010',parent='60000000-0000-4000-8000-000000000011',outsider='60000000-0000-4000-8000-000000000012'
const a='60000000-0000-4000-8000-000000000020',b='60000000-0000-4000-8000-000000000021',foreign='60000000-0000-4000-8000-000000000022'
const auth=id=>`set request.jwt.claim.sub='${id}';set role authenticated;`
const day=sql(`select ((now() at time zone 'Asia/Seoul')::date+3)::text`)
const next=sql(`select ('${day}'::date+1)::text`),raceDay=sql(`select ('${day}'::date+2)::text`)
const quoted=x=>"'"+String(x).replaceAll("'","''")+"'"
const array=xs=>`array[${xs.map(quoted).join(',')}]::text[]`
const uuidArray=xs=>`array[${xs.map(quoted).join(',')}]::uuid[]`
const getDay=(date=day,actor=studio)=>JSON.parse(sql(`${auth(actor)} select public.get_studio_booking_day('${date}','${actor===outsider?other:org}');`))
const keys=(rows)=>rows.map(x=>x.key)
const overlap=(x,y)=>Date.parse(x.startAt)<Date.parse(y.endAt)&&Date.parse(x.endAt)>Date.parse(y.startAt)
function request(mode,scope,selected,closureIds=[],date=day,actor=studio,expected){
 const d=getDay(date,actor),windows=mode==='close'?selected:d.closures.filter(c=>closureIds.includes(c.id));
 const targets=expected??keys(d.occurrences.filter(o=>(!scope||o.classId===scope)&&windows.some(w=>overlap(o,w))))
 return `${auth(actor)}select public.mutate_studio_booking_closures('${date}',${scope?quoted(scope):'null'},'${mode}',${array(keys(selected))},${array(targets)},${uuidArray(closureIds)},'INTERNAL_REASON_MUST_NOT_ESCAPE');`
}
function fail(s,code){let stderr='';try{sql(s)}catch(e){stderr=e.stderr?.toString()||e.message}assert(stderr.includes(code),code+' was not blocked')}
function insert(o,name='Synthetic child',id){return `insert into public.trial_applications(id,parent_id,class_id,class_schedule_id,child_name,child_grade,requested_slot_at,status) values(${id?quoted(id):'gen_random_uuid()'},'${parent}','${o.classId}','${o.id}',${quoted(name)},'elem_1','${o.startAt}','new');`}
function asyncSql(s,onOutput=()=>{}){return new Promise((resolve,reject)=>{const p=spawn('docker',args);let out='',err='';p.stdout.on('data',d=>{out+=d;onOutput(String(d))});p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));p.stdin.end(s)})}
;(async()=>{
 sql(`insert into public.organizations(id,name) values('${org}','Isolated closures'),('${other}','Foreign fixture');
 insert into auth.users(id,email) values('${studio}','closures-studio@example.invalid'),('${parent}','closures-parent@example.invalid'),('${outsider}','closures-other@example.invalid');
 insert into public.profiles(id,role,name,organization_id,phone) values('${studio}','academy','Test studio','${org}',null),('${parent}','parent','Test parent',null,'01011112222'),('${outsider}','academy','Test other','${other}',null);
 insert into public.classes(id,organization_id,title,subject,target_age,description,is_active,assignment_mode) values('${a}','${org}','Course A','piano','elem_1','Isolated',true,'post_assign'),('${b}','${org}','Course B','piano','elem_1','Isolated',true,'post_assign'),('${foreign}','${other}','Foreign','piano','elem_1','Isolated',true,'post_assign');
 insert into public.class_schedules(class_id,schedule_type,specific_date,start_time,end_time,capacity,booking_status)
 select '${a}','one_time',d,h*interval '1 hour',(h+1)*interval '1 hour',3,'open' from unnest(array['${day}'::date,'${next}'::date,'${raceDay}'::date])d cross join generate_series(12,20)h;
 insert into public.class_schedules(class_id,schedule_type,specific_date,start_time,end_time,capacity,booking_status) values('${b}','one_time','${day}','13:30','15:30',3,'open'),('${b}','one_time','${day}','15:00','16:00',3,'open'),('${foreign}','one_time','${day}','13:00','14:00',3,'open');`)
 const d=getDay(),at=(hour,rows=d.occurrences)=>rows.find(o=>o.classId===a&&new Date(o.startAt).getUTCHours()===(hour-9+24)%24)
 assert.equal(d.occurrences.length,11);assert(!d.occurrences.some(o=>o.classId===foreign))
 fail(`${auth(outsider)}select public.get_studio_booking_day('${day}','${org}');`,'booking_scope_forbidden')
 const original='60000000-0000-4000-8000-000000000080';sql(`${auth(parent)}${insert(at(13),'Existing reservation',original)}`)
 const before=sql(`select md5(to_jsonb(x)::text) from public.trial_applications x where id='${original}'`)
 const selected=[at(13),at(14)];assert.equal(JSON.parse(sql(request('close',a,selected))).changed,2)
 assert.equal(JSON.parse(sql(request('close',a,selected))).changed,0)
 assert.equal(before,sql(`select md5(to_jsonb(x)::text) from public.trial_applications x where id='${original}'`))
 assert.equal(sql(`select bool_and(booking_status='open') from public.class_schedules where class_id='${a}'`),'t')
 fail(`${auth(parent)}${insert(at(13),'Stale screen')}`,'schedule_date_booking_closed')
 fail(`${auth(parent)}${insert(at(14),'Direct request')}`,'schedule_date_booking_closed')
 sql(`${auth(parent)}${insert(at(12),'Boundary 12')}${insert(at(15),'Boundary 15')}`)
 sql(`${auth(parent)}${insert(at(13,getDay(next).occurrences),'Next date')}`)
 const mask=JSON.parse(sql(`set role anon;select to_jsonb(public.get_closed_booking_slot_indexes('${a}',${array(d.occurrences.filter(o=>o.classId===a).map(o=>o.startAt)).replace('text[]','timestamptz[]')},${array(d.occurrences.filter(o=>o.classId===a).map(o=>o.endAt)).replace('text[]','timestamptz[]')}));`));assert.deepEqual(mask,[2,3])
 fail(`set role anon;select reason from public.date_booking_closures;`,'permission denied')
 assert.equal(sql(`${auth(parent)}select count(*) from public.date_booking_closures;`),'0') // SELECT RLS yields 0, check separately below if column grant exists.
 const broad=[at(13)];const broadTargets=keys(d.occurrences.filter(o=>broad.some(w=>overlap(o,w))))
 assert.equal(broadTargets.length,2);sql(request('close',null,broad))
 const both=getDay();assert(both.occurrences.find(o=>o.classId===b&&o.startAt.includes('04:30')).closureIds.length>0)
 const own=both.closures.filter(c=>c.classId===a).map(c=>c.id);const releaseSql=request('release',a,selected,own);sql(releaseSql);assert.equal(JSON.parse(sql(releaseSql)).changed,0)
 fail(`${auth(parent)}${insert(at(13),'Other overlay remains')}`,'schedule_date_booking_closed')
 const broadIds=getDay().closures.filter(c=>!c.classId).map(c=>c.id);sql(request('release',null,broad,broadIds))
 assert.equal(getDay().closures.length,0)
 fail(request('close',foreign,selected),'booking_scope_forbidden')
 fail(request('close',a,[{...at(13),key:foreign+'/class_schedule/'+at(13).id}]),'booking_slots_changed')
 fail(request('close',null,broad,[],day,studio,[]),'booking_slots_changed');assert.equal(getDay().closures.length,0)
 sql(`update public.class_schedules set booking_status='closed' where id='${at(14).id}';`)
 sql(request('close',a,[at(14)]));const held=getDay().closures.map(c=>c.id);sql(request('release',a,[at(14)],held));fail(`${auth(parent)}${insert(at(14),'Base limit remains')}`,'schedule_booking_closed')
 // Race 1: application commits first; closure waits and preserves that reservation.
 const race=getDay(raceDay).occurrences,slot16=at(16,race);let signal;const locked=new Promise(r=>signal=r)
 const booking=asyncSql(`begin;${auth(parent)}${insert(slot16,'Race saved first')}select 'LOCKED';select pg_sleep(0.8);commit;`,out=>{if(out.includes('LOCKED'))signal()});await locked
 const closing=asyncSql(request('close',a,[slot16],[],raceDay));await Promise.all([booking,closing]);assert.equal(sql(`select count(*) from public.trial_applications where class_id='${a}' and requested_slot_at='${slot16.startAt}'`),'1')
 // Race 2: closure commits first; a waiting INSERT sees it after acquiring the class lock.
 const slot17=at(17,race);let signal2;const locked2=new Promise(r=>signal2=r)
 const closeFirst=asyncSql(`begin;${request('close',a,[slot17],[],raceDay)}select 'LOCKED';select pg_sleep(0.8);commit;`,out=>{if(out.includes('LOCKED'))signal2()});await locked2
 const late=asyncSql(`${auth(parent)}${insert(slot17,'Race stale request')}`).then(()=>false,e=>e.message.includes('schedule_date_booking_closed'));await closeFirst;assert.equal(await late,true)
 assert.equal(sql(`select count(*) from public.trial_applications where class_id='${a}' and requested_slot_at='${slot17.startAt}'`),'0')
 // Rolling regeneration does not touch the independent overlay or existing IDs.
 const idsBefore=sql(`select string_agg(id::text,',' order by id) from public.class_schedules where class_id='${a}' and specific_date='${raceDay}'`)
 sql(`insert into public.class_operating_rules(class_id,operation_type,start_date,slots) values('${a}','rolling',(now() at time zone 'Asia/Seoul')::date,(select jsonb_agg(jsonb_build_object('weekday',d,'startTime',to_char(h*interval '1 hour','HH24:MI'),'endTime',to_char((h+1)*interval '1 hour','HH24:MI'),'capacity',3,'seriesId','60000000-0000-4000-8000-000000000099')) from generate_series(0,6)d cross join generate_series(12,20)h));select public.extend_rolling_class_schedule('${a}');`)
 assert.equal(idsBefore,sql(`select string_agg(id::text,',' order by id) from public.class_schedules where class_id='${a}' and specific_date='${raceDay}'`));assert.equal(getDay(raceDay).closures.length,2)
 console.log('PASS isolated PostgreSQL: 13–15 only, 12/15/next date preserved, specific/all scopes and mixed lengths, unchanged existing reservations, independent release, stale/direct request rejection, RLS/forged IDs, atomic preview failure, idempotency, both lock orders, rolling persistence')
 if(process.env.CLOSURES_QA_OUTPUT)fs.writeFileSync(process.env.CLOSURES_QA_OUTPUT+'/db-results.json',JSON.stringify({passed:true,day,org,a,b,parent,studio,other,foreign,database,concurrentOrders:2}))
})().catch(e=>{console.error(e.stderr?.toString()||e.stack);process.exitCode=1})
