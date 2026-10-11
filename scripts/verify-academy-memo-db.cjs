// Schema-only copy + synthetic fixtures in a named isolated DB. Never loads app env.
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process')
const db='studio_memo_rehearsal_'+Date.now(),container='firstsuup-report-edit-db'
const sql=s=>execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
const id=n=>'79000000-0000-4000-8000-'+String(n).padStart(12,'0'),q=s=>"'"+String(s).replaceAll("'","''")+"'",org=id(1),otherOrg=id(2),teacher=id(10),parent=id(11),other=id(12),klass=id(20),schedule=id(30)
const auth=actor=>`set request.jwt.claim.sub='${actor}';set role authenticated;`
const fail=(s,reason)=>{let error='';try{sql(s)}catch(e){error=e.stderr?.toString()||e.message}assert(error.includes(reason),reason+' was not blocked: '+error)}
const get=(app,actor=teacher,organization=org)=>JSON.parse(sql(`${auth(actor)}select public.get_studio_academy_memo('${app}','${organization}')`))
const save=(app,note,revision=get(app).revision,actor=teacher)=>JSON.parse(sql(`${auth(actor)}select public.save_studio_academy_memo('${app}',${note===null?'null':q(note)},${q(revision)})`))
const fingerprint=table=>sql(`select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public."${table}" t`)
try {
 assert(process.env.MEMO_SCHEMA_PATH,'A schema-only isolated baseline is required')
 execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit',container,'createdb','-U','supabase_admin',db])
 sql(fs.readFileSync(process.env.MEMO_SCHEMA_PATH,'utf8').replace('CREATE SCHEMA public;',''))
 sql(fs.readFileSync('supabase/migrations/20261007120000_report_edit_before_publication.sql','utf8'))
 sql(`insert into public.organizations(id,name) values('${org}','ISOLATED 메모 학원'),('${otherOrg}','ISOLATED 다른 학원');
 insert into auth.users(id,email) values('${teacher}','memo-teacher@local.invalid'),('${parent}','memo-parent@local.invalid'),('${other}','memo-other@local.invalid');
 insert into public.profiles(id,role,name,organization_id,phone) values('${teacher}','academy','테스트 선생님','${org}',null),('${other}','academy','다른 선생님','${otherOrg}',null),('${parent}','parent','테스트 부모',null,'01000000000');
 insert into public.classes(id,organization_id,title,subject,target_age,description,is_active,assignment_mode,program_type) values('${klass}','${org}','ISOLATED 수학','math','elem_3','격리 검사',true,'post_assign','trial_class');
 insert into public.class_schedules(id,class_id,schedule_type,specific_date,start_time,end_time,capacity,booking_status) values('${schedule}','${klass}','one_time','2026-10-05','10:00','11:00',5,'open');
 insert into public.organization_subscriptions(organization_id,plan_code,subscription_status,current_period_start,current_period_end) values('${org}','standard','active',now(),now()+interval '30 days');`)
 const create=(n,status='completed')=>{const app=id(n);sql(`insert into public.trial_applications(id,parent_id,class_id,class_schedule_id,child_name,child_grade,requested_slot_at,confirmed_slot_at,status,completed_at) values('${app}','${parent}','${klass}','${schedule}','ISOLATED ${n}','초3','2026-10-05T10:00:00+09:00','2026-10-05T10:00:00+09:00','${status}',${status==='completed'?"'2026-10-05T11:00:00+09:00'":'null'})`);return app}
 const draft=create(100),sent=create(101),v1=create(102),blank=create(103),beforeTrial=create(104,'confirmed'),withoutContact=create(105)
 const content={observations:['active_participation'],recommendedCourse:'기초',publicSummary:'공개 총평',note:'LEGACY_PRIVATE_CANARY'}
 for(const app of [draft,sent,v1])sql(`${auth(teacher)}select public.save_studio_trial_result('${app}',${q(JSON.stringify(content))}::jsonb,null)`)
 sql(`${auth(teacher)}select public.publish_experience_report('${sent}',(select updated_at from public.trial_results where application_id='${sent}'))`)
 sql(`insert into public.experience_reports(application_id,version,status,content_version,content,published_at,published_by) values('${v1}',1,'published',1,'{"legacy":"V1_PRESERVE"}',now(),'${teacher}')`)
 sql(`${auth(teacher)}select public.record_studio_contact('${id(700)}','${draft}',now(),'PHONE','NEUTRAL','OLD_CONTACT_CANARY',null,false,null,null,null)`)
 const tables=JSON.parse(sql("select json_agg(tablename) from pg_tables where schemaname='public'"))
 const before=Object.fromEntries(tables.map(t=>[t,fingerprint(t)]))
 const funcs=sql("select md5(string_agg(pg_get_functiondef(oid),'' order by oid)) from pg_proc where oid in ('public.lock_final_trial_result()'::regprocedure,'public.save_studio_trial_result(uuid,jsonb,timestamptz)'::regprocedure,'public.publish_experience_report(uuid,timestamptz)'::regprocedure)")
 sql(fs.readFileSync('supabase/migrations/20261009120000_studio_academy_memo.sql','utf8'))
 assert.deepEqual(Object.fromEntries(tables.map(t=>[t,fingerprint(t)])),before,'migration never rewrites existing rows')
 assert.equal(sql("select md5(string_agg(pg_get_functiondef(oid),'' order by oid)) from pg_proc where oid in ('public.lock_final_trial_result()'::regprocedure,'public.save_studio_trial_result(uuid,jsonb,timestamptz)'::regprocedure,'public.publish_experience_report(uuid,timestamptz)'::regprocedure)"),funcs)
 for(const app of [draft,sent,v1]){
  const old=get(app);assert.equal(old.note,'LEGACY_PRIVATE_CANARY');assert(old.revision.startsWith('legacy:'))
  const saved=save(app,'NEW_PRIVATE_CANARY');assert.equal(get(app).note,'NEW_PRIVATE_CANARY');assert.equal(get(app).revision,saved.revision)
  assert.equal(save(app,'NEW_PRIVATE_CANARY').revision,saved.revision,'unchanged save idempotent')
  fail(`${auth(teacher)}select public.save_studio_academy_memo('${app}','stale',${q(old.revision)})`,'academy_memo_changed')
  save(app,'');assert.equal(get(app).note,null,'explicit clear never resurrects legacy note')
  save(app,'AFTER_CLEAR_PRIVATE_CANARY');assert.equal(get(app).note,'AFTER_CLEAR_PRIVATE_CANARY')
 }
 assert.equal(get(blank).note,null);save(blank,'메모만 먼저 저장');assert.equal(sql(`select count(*) from public.trial_results where application_id='${blank}'`),'0','memo does not create a report source')
 assert.deepEqual(Object.fromEntries(tables.map(t=>[t,fingerprint(t)])),before,'memo saves leave ALL pre-existing tables, clocks, logs, snapshots unchanged')
 for(const actor of [parent,other]){
  fail(`${auth(actor)}select public.get_studio_academy_memo('${sent}','${org}')`,'application_not_found_or_forbidden')
  fail(`${auth(actor)}select public.save_studio_academy_memo('${sent}','bad',${q(get(sent).revision)})`,'application_not_found_or_forbidden')
  assert.equal(sql(`${auth(actor)}select count(*) from public.studio_academy_memos`),'0')
 }
 fail(`${auth(teacher)}select public.get_studio_academy_memo('${sent}','${otherOrg}')`,'application_not_found_or_forbidden')
 fail(`set role anon;select public.get_studio_academy_memo('${sent}','${org}')`,'permission denied')
 fail(`set role anon;select public.save_studio_academy_memo('${sent}','bad','x')`,'permission denied')
 fail(`${auth(teacher)}update public.studio_academy_memos set note='direct'`,'permission denied')
 fail(`${auth(teacher)}insert into public.studio_academy_memos(application_id,note,updated_by) values('${beforeTrial}','direct','${teacher}')`,'permission denied')
 fail(`${auth(teacher)}delete from public.studio_academy_memos`,'permission denied')
 fail(`${auth(teacher)}select public.save_studio_academy_memo('${beforeTrial}','bad',${q(get(beforeTrial).revision)})`,'application_not_completed')
 fail(`${auth(teacher)}select public.save_studio_academy_memo('${sent}',repeat('x',10001),${q(get(sent).revision)})`,'academy_memo_too_long')
 for(const app of [sent,v1]){
  fail(`${auth(teacher)}select public.save_studio_trial_result('${app}',${q(JSON.stringify(content))}::jsonb,null)`,'report_content_locked')
  fail(`update public.trial_results set public_summary='bypass' where application_id='${app}'`,'report_content_locked')
  fail(`update public.experience_reports set content='{}' where application_id='${app}'`,'experience_report_is_immutable')
 }
 const revision=sql(`select updated_at from public.trial_results where application_id='${draft}'`)
 sql(`${auth(teacher)}select public.publish_experience_report('${draft}',${q(revision)}::timestamptz)`)
 const parentReports=sql(`${auth(parent)}select content from public.experience_reports where application_id in ('${draft}','${sent}','${v1}')`)
 assert(!parentReports.includes('PRIVATE_CANARY'));assert(parentReports.includes('V1_PRESERVE'));assert.equal(sql(`${auth(parent)}select count(*) from public.trial_results`),'0')
 // No contact or report is required for independent registration results.
 sql(`${auth(teacher)}select public.set_studio_registration_result('${withoutContact}','pending',array['price_consideration'],null);select public.set_studio_registration_result('${withoutContact}','enrolled','{}',null)`)
 assert.equal(sql(`select registration_status from public.trial_applications where id='${withoutContact}'`),'enrolled')
 assert.equal(sql(`select count(*) from public.consultation_logs where application_id='${withoutContact}'`),'0')
 sql(`${auth(teacher)}select public.withdraw_experience_report('${sent}')`);save(sent,'철회 후에도 메모만 수정');fail(`${auth(teacher)}select public.save_studio_trial_result('${sent}','{}',null)`,'report_content_locked')
 console.log('PASS isolated memo DB: COMPAT no row rewrite, legacy/V1/V2 preserved, draft/sent/withdrawn memo persistence and clear, CAS, Parent/other-org/anon/direct-DML denial, before-trial denial, immutable source/snapshot, Parent snapshot excludes memo, independent registration, unchanged application/log/result clocks and ordering inputs')
 fs.writeFileSync(process.env.MEMO_QA_OUTPUT+'/db-results.json',JSON.stringify({passed:true,fixtureOnly:true,db,preservedTables:tables.length},null,2))
} catch(e){console.error(e.stderr?.toString()||e.stack);process.exitCode=1}
