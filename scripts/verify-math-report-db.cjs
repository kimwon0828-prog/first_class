// Schema-only copy + synthetic fixtures in a named isolated DB. Never loads app env.
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process')
const db='studio_math_report_rehearsal_'+Date.now(),container='firstsuup-report-edit-db'
const sql=s=>execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
const id=n=>'79000000-0000-4000-8000-'+String(n).padStart(12,'0'),q=s=>"'"+String(s).replaceAll("'","''")+"'",org=id(1),otherOrg=id(2),teacher=id(10),parent=id(11),other=id(12),klass=id(20),schedule=id(30)
let publishRpc='publish_experience_report'
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
 sql(`${auth(teacher)}select public.${publishRpc}('${sent}',(select updated_at from public.trial_results where application_id='${sent}'))`)
 sql(`insert into public.experience_reports(application_id,version,status,content_version,content,published_at,published_by) values('${v1}',1,'published',1,'{"legacy":"V1_PRESERVE"}',now(),'${teacher}')`)
 sql(`${auth(teacher)}select public.record_studio_contact('${id(700)}','${draft}',now(),'PHONE','NEUTRAL','OLD_CONTACT_CANARY',null,false,null,null,null)`)
 const tables=JSON.parse(sql("select json_agg(tablename) from pg_tables where schemaname='public'"))
 const before=Object.fromEntries(tables.map(t=>[t,fingerprint(t)]))
 const funcs=sql("select md5(string_agg(pg_get_functiondef(oid),'' order by oid)) from pg_proc where oid in ('public.lock_final_trial_result()'::regprocedure,'public.save_studio_trial_result(uuid,jsonb,timestamptz)'::regprocedure,'public.publish_experience_report(uuid,timestamptz)'::regprocedure)")
 sql(fs.readFileSync('supabase/migrations/20261009120000_studio_academy_memo.sql','utf8'))
 assert.deepEqual(Object.fromEntries(tables.map(t=>[t,fingerprint(t)])),before,'migration never rewrites existing rows')
 assert.equal(sql("select md5(string_agg(pg_get_functiondef(oid),'' order by oid)) from pg_proc where oid in ('public.lock_final_trial_result()'::regprocedure,'public.save_studio_trial_result(uuid,jsonb,timestamptz)'::regprocedure,'public.publish_experience_report(uuid,timestamptz)'::regprocedure)"),funcs)
 // The COMPAT report expansion changes no existing row or lock/permission policy.
 const permissions=sql("select md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) from (select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public') t")
 const locks=sql("select md5(pg_get_functiondef('public.lock_final_trial_result()'::regprocedure))")
 sql(fs.readFileSync('supabase/migrations/20261011140000_math_report_observations.sql','utf8'))
 publishRpc='publish_experience_report_v3'
 assert.deepEqual(Object.fromEntries(tables.map(t=>[t,fingerprint(t)])),before)
 assert.equal(sql("select md5(pg_get_functiondef('public.lock_final_trial_result()'::regprocedure))"),locks)
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
 sql(`${auth(teacher)}select public.${publishRpc}('${draft}',${q(revision)}::timestamptz)`)
 const parentReports=sql(`${auth(parent)}select content from public.experience_reports where application_id in ('${draft}','${sent}','${v1}')`)
 assert(!parentReports.includes('PRIVATE_CANARY'));assert(parentReports.includes('V1_PRESERVE'));assert.equal(sql(`${auth(parent)}select count(*) from public.trial_results`),'0')
 if(process.env.MUSIC_MIGRATION_PATH){
  const musicBefore=Object.fromEntries(tables.map(t=>[t,fingerprint(t)]));
  const functionAcl=sql("select md5(string_agg(oid::text||coalesce(proacl::text,''),'' order by oid)) from pg_proc where pronamespace in ('public'::regnamespace,'app'::regnamespace)");
  sql(fs.readFileSync(process.env.MUSIC_MIGRATION_PATH,'utf8'));
  assert.deepEqual(Object.fromEntries(tables.map(t=>[t,fingerprint(t)])),musicBefore,'music COMPAT preserves existing V1/V2/V3 and source rows');
  assert.equal(sql("select md5(string_agg(oid::text||coalesce(proacl::text,''),'' order by oid)) from pg_proc where pronamespace in ('public'::regnamespace,'app'::regnamespace)"),functionAcl,'music creates no RPC or expanded ACL');
 }
 if(process.env.SUBJECT_MIGRATION_PATH){
  const beforeExpansion=Object.fromEntries(tables.map(t=>[t,fingerprint(t)]));
  const acl=sql("select md5(string_agg(oid::text||coalesce(proacl::text,''),'' order by oid)) from pg_proc where pronamespace in ('public'::regnamespace,'app'::regnamespace)");
  sql(fs.readFileSync(process.env.SUBJECT_MIGRATION_PATH,'utf8'));
  assert.deepEqual(Object.fromEntries(tables.map(t=>[t,fingerprint(t)])),beforeExpansion,'subject expansion rewrites no V1/V2/V3 or source rows');
  assert.equal(sql("select md5(string_agg(oid::text||coalesce(proacl::text,''),'' order by oid)) from pg_proc where pronamespace in ('public'::regnamespace,'app'::regnamespace)"),acl);
 }
 // No contact or report is required for independent registration results.
 sql(`${auth(teacher)}select public.set_studio_registration_result('${withoutContact}','pending',array['price_consideration'],null);select public.set_studio_registration_result('${withoutContact}','enrolled','{}',null)`)
 assert.equal(sql(`select registration_status from public.trial_applications where id='${withoutContact}'`),'enrolled')
 assert.equal(sql(`select count(*) from public.consultation_logs where application_id='${withoutContact}'`),'0')
 sql(`${auth(teacher)}select public.withdraw_experience_report('${sent}')`);save(sent,'철회 후에도 메모만 수정');fail(`${auth(teacher)}select public.save_studio_trial_result('${sent}','{}',null)`,'report_content_locked')
 assert.equal(sql("select md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) from (select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public') t"),permissions)
 for(const actor of [parent,other])fail(`${auth(actor)}select public.save_studio_trial_result('${blank}','{"observations":["math_applied_concept"]}'::jsonb,null)`,'application_not_found_or_forbidden')
 fail(`set role anon;select public.save_studio_trial_result('${blank}','{}',null)`,'permission denied')
 fail(`${auth(teacher)}select public.save_studio_trial_result('${beforeTrial}','{"observations":[]}'::jsonb,null)`,'application_not_completed')
 const mathApp=create(110), nonMath=create(111), legacy=create(112), summaryOnly=create(113)
 const mathCodes=['math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives','math_applied_concept','math_needed_step_guidance','math_reviewed_foundations','math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice']
 const writeRecord=(app,observations,summary='짧은 선생님 이야기')=>sql(`${auth(teacher)}select public.save_studio_trial_result('${app}',${q(JSON.stringify({observations,publicSummary:summary,note:null}))}::jsonb,(select updated_at from public.trial_results where application_id='${app}'))`)
 const initialMath=create(120), initialGeneral=create(121), initialDenied=create(122)
 const initialWrite=(app,observations,actor=teacher)=>sql(`${auth(actor)}select public.finalize_studio_trial_result('${app}',${q(JSON.stringify({observations,publicSummary:'최초 작성 경로 확인'}))}::jsonb)`)
 initialWrite(initialMath,mathCodes)
 assert.deepEqual(JSON.parse(sql(`select to_json(observations) from public.trial_results where application_id='${initialMath}'`)),mathCodes)
 fail(`${auth(teacher)}select public.finalize_studio_trial_result('${initialMath}','{"observations":[]}'::jsonb)`,'trial_result_already_finalized')
 for(const actor of [parent,other])fail(`${auth(actor)}select public.finalize_studio_trial_result('${initialDenied}','{"observations":["math_applied_concept"]}'::jsonb)`,'application_not_found_or_forbidden')
 fail(`set role anon;select public.finalize_studio_trial_result('${initialDenied}','{"observations":[]}'::jsonb)`,'permission denied')
 fail(`${auth(teacher)}select public.trial_observations_match_subject('${klass}','{}','{}')`,'permission denied')
 fail(`${auth(teacher)}select public.finalize_studio_trial_result('${beforeTrial}','{"observations":[]}'::jsonb)`,'application_not_completed')
 writeRecord(mathApp,mathCodes)
 assert.deepEqual(JSON.parse(sql(`select to_json(observations) from public.trial_results where application_id='${mathApp}'`)),mathCodes)
 writeRecord(mathApp,['active_participation',...mathCodes]);assert.equal(sql(`select cardinality(observations) from public.trial_results where application_id='${mathApp}'`),'10')
 // Saved master category overrides even a misleading legacy subject code/title.
 sql(`insert into public.subject_categories(id,code,name,sort_order) values('${id(910)}','math','수학',1),('${id(911)}','music','음악',2);
 update public.classes set subject_category_id='${id(911)}' where id='${klass}'`)
 fail(`${auth(teacher)}select public.finalize_studio_trial_result('${initialDenied}',${q(JSON.stringify({observations:mathCodes}))}::jsonb)`,'observation_subject_mismatch')
 assert.equal(sql(`select count(*) from public.trial_results where application_id='${initialDenied}'`),'0')
 initialWrite(initialGeneral,['active_participation'])
 fail(`${auth(teacher)}select public.save_studio_trial_result('${nonMath}',${q(JSON.stringify({observations:mathCodes}))}::jsonb,null)`,'observation_subject_mismatch')
 writeRecord(mathApp,mathCodes.slice(0,1));writeRecord(nonMath,['active_participation'])
 fail(`${auth(teacher)}select public.save_studio_trial_result('${mathApp}',${q(JSON.stringify({observations:mathCodes}))}::jsonb,(select updated_at from public.trial_results where application_id='${mathApp}'))`,'observation_subject_mismatch')
 sql(`update public.classes set subject_category_id='${id(910)}' where id='${klass}'`)
 initialWrite(initialDenied,mathCodes)
 console.log('PASS initial finalize + save RPC share persisted-subject validation; math 9 accepted, nonmath denied, generic compatibility, own-org/Parent/anon/completion and private-helper ACL preserved')
 writeRecord(mathApp,mathCodes)
 sql(`insert into public.trial_results(application_id,observations,note,created_by,updated_by) values('${legacy}',array['집중을 잘했어요'],'OLD_LEGACY','${teacher}','${teacher}')`)
 writeRecord(legacy,['집중을 잘했어요']);assert.equal(sql(`select observations[1] from public.trial_results where application_id='${legacy}'`),'집중을 잘했어요')
 fail(`${auth(teacher)}select public.${publishRpc}('${legacy}',(select updated_at from public.trial_results where application_id='${legacy}'))`,'legacy_observations_require_review')
 writeRecord(legacy,['math_applied_concept']);writeRecord(summaryOnly,[])
 // Old Production clients continue producing readable V2 generic reports.
 const oldClient=create(114);writeRecord(oldClient,['active_participation']);
 sql(`${auth(teacher)}select public.publish_experience_report('${oldClient}',(select updated_at from public.trial_results where application_id='${oldClient}'))`)
 assert.equal(sql(`select content_version from public.experience_reports where application_id='${oldClient}'`),'2')
 fail(`${auth(teacher)}select public.publish_experience_report('${mathApp}',(select updated_at from public.trial_results where application_id='${mathApp}'))`,'report_format_requires_updated_client')
 for(const actor of [parent,other])fail(`${auth(actor)}select public.publish_experience_report_v3('${mathApp}',(select now()))`,'application_not_found_or_forbidden')
 fail(`set role anon;select public.publish_experience_report_v3('${mathApp}',now())`,'permission denied')
 for(const app of [mathApp,summaryOnly])sql(`${auth(teacher)}select public.${publishRpc}('${app}',(select updated_at from public.trial_results where application_id='${app}'))`)
 const snapshot=JSON.parse(sql(`${auth(parent)}select content from public.experience_reports where application_id='${mathApp}'`))
 assert.equal(sql(`select content_version from public.experience_reports where application_id='${mathApp}'`),'3')
 assert.deepEqual([...new Set(snapshot.observations.map(o=>o.group.label))],['관심과 참여','오늘 내용의 이해','안내 후 반응'])
 assert.equal(snapshot.observations.length,9);assert(!JSON.stringify(snapshot).includes('note'))
 fs.writeFileSync(process.env.MEMO_QA_OUTPUT+'/math-snapshot.json',JSON.stringify(snapshot,null,2))
 const frozen=sql(`select md5(content::text) from public.experience_reports where application_id='${mathApp}'`)
 sql(`update public.classes set subject_category_id='${id(911)}' where id='${klass}'`)
 assert.equal(sql(`select md5(content::text) from public.experience_reports where application_id='${mathApp}'`),frozen)
 fail(`${auth(teacher)}select public.${publishRpc}('${mathApp}',(select updated_at from public.trial_results where application_id='${mathApp}'))`,'report_already_sent')
 fail(`${auth(teacher)}select public.save_studio_trial_result('${mathApp}','{}',null)`,'report_content_locked')
 save(mathApp,'전달 후 독립 메모');assert.equal(sql(`select md5(content::text) from public.experience_reports where application_id='${mathApp}'`),frozen)
 assert.equal(sql(`select content_version from public.experience_reports where application_id='${sent}'`),'2')
 if(process.env.MUSIC_MIGRATION_PATH){
  const musicCodes=['music_interested_in_sound','music_started_familiar_activity','music_attempted_new_activity','music_followed_rhythm_or_sound','music_applied_learning','music_reviewed_activity_steps','music_retried_after_guidance','music_continued_with_smaller_steps','music_needs_further_practice'];
  const music=create(130),wrongSubject=create(132),oldChoices=create(133);
  const subjects=['piano','violin','cello','flute','guitar','drums','vocal','composition'];
  for(const [i,subject] of subjects.entries()){
   sql(`insert into public.subjects(id,category_id,code,name,sort_order) values('${id(920+i)}','${id(911)}','${subject}','ISOLATED ${subject}',${i+1});
    update public.classes set subject_category_id='${id(911)}',subject_id='${id(920+i)}',subject='misleading',title='수학 제목 무시' where id='${klass}'`);
   const updateApp=create(140+i),initialApp=create(150+i);
   writeRecord(updateApp,musicCodes);initialWrite(initialApp,musicCodes);
   for(const app of [updateApp,initialApp])assert.deepEqual(JSON.parse(sql(`select to_json(observations) from public.trial_results where application_id='${app}'`)),musicCodes,subject+' same music observations');
   writeRecord(updateApp,musicCodes.slice(3,6));
   assert.deepEqual(JSON.parse(sql(`select to_json(observations) from public.trial_results where application_id='${updateApp}'`)),musicCodes.slice(3,6));
  }
  writeRecord(music,musicCodes);writeRecord(oldChoices,['active_participation']);writeRecord(oldChoices,['active_participation','music_followed_rhythm_or_sound']);
  fail(`${auth(teacher)}select public.save_studio_trial_result('${wrongSubject}','{"observations":["math_applied_concept"]}',null)`,'observation_subject_mismatch');
  for(const actor of [parent,other]){fail(`${auth(actor)}select public.finalize_studio_trial_result('${wrongSubject}','{"observations":["music_followed_rhythm_or_sound"]}')`,'application_not_found_or_forbidden');fail(`${auth(actor)}select public.save_studio_trial_result('${wrongSubject}','{"observations":["music_followed_rhythm_or_sound"]}',null)`,'application_not_found_or_forbidden')}
  // Music category alone suffices, but neither a title nor legacy subject string does.
  sql(`update public.classes set subject_id=null where id='${klass}'`);
  const categoryOnly=create(160);initialWrite(categoryOnly,musicCodes);writeRecord(categoryOnly,musicCodes.slice(0,1));
  sql(`update public.classes set subject_category_id=null,subject='music',title='피아노 음악 제목 무시' where id='${klass}'`);
  for(const rpc of ['finalize_studio_trial_result','save_studio_trial_result'])fail(`${auth(teacher)}select public.${rpc}('${wrongSubject}','{"observations":["music_followed_rhythm_or_sound"]}'${rpc==='save_studio_trial_result'?',null':''})`,'observation_subject_mismatch');
  writeRecord(music,musicCodes);writeRecord(music,musicCodes.slice(0,1));
  fail(`${auth(teacher)}select public.save_studio_trial_result('${music}',${q(JSON.stringify({observations:musicCodes}))},(select updated_at from public.trial_results where application_id='${music}'))`,'observation_subject_mismatch');
  // An explicit non-music master overrides a music child; no cross-subject injection.
  sql(`update public.classes set subject_id='${id(920)}',subject_category_id='${id(910)}' where id='${klass}'`);
  for(const rpc of ['finalize_studio_trial_result','save_studio_trial_result'])fail(`${auth(teacher)}select public.${rpc}('${wrongSubject}','{"observations":["music_followed_rhythm_or_sound"]}'${rpc==='save_studio_trial_result'?',null':''})`,'observation_subject_mismatch');
  // Otherwise the persisted child FK's music parent is the classification source.
  sql(`update public.classes set subject_category_id=null where id='${klass}'`);
  initialWrite(wrongSubject,musicCodes);writeRecord(wrongSubject,musicCodes.slice(6));
  writeRecord(music,['music_followed_rhythm_or_sound','music_retried_after_guidance']);
  fail(`${auth(teacher)}select public.publish_experience_report('${music}',(select updated_at from public.trial_results where application_id='${music}'))`,'report_format_requires_updated_client');
  sql(`${auth(teacher)}select public.publish_experience_report_v3('${music}',(select updated_at from public.trial_results where application_id='${music}'))`);
  const snap=JSON.parse(sql(`${auth(parent)}select content from public.experience_reports where application_id='${music}'`));
  assert.deepEqual(snap.observations.map(o=>o.group.label),['오늘 활동의 수행','안내 후 반응']);assert(!JSON.stringify(snap).includes('note'));
  const frozenMusic=sql(`select md5(content::text) from public.experience_reports where application_id='${music}'`);
  sql(`update public.classes set subject_category_id='${id(910)}' where id='${klass}'`);
  fail(`${auth(teacher)}select public.save_studio_trial_result('${music}','{}',null)`,'report_content_locked');
  fail(`${auth(teacher)}select public.publish_experience_report_v3('${music}',now())`,'report_already_sent');
  fail(`update public.experience_reports set content='{}' where application_id='${music}'`,'experience_report_is_immutable');
  save(music,'음악 전달 후 독립 메모');assert.equal(sql(`select md5(content::text) from public.experience_reports where application_id='${music}'`),frozenMusic);
  fs.writeFileSync(process.env.MEMO_QA_OUTPUT+'/music-snapshot.json',JSON.stringify(snap,null,2));
  console.log('PASS all 8 music subsubjects share 9 codes: initial + update + reentry, master-only/fallback classification, old choices retained, cross-category/Parent/other-org denial, V1/V2/V3 preserved, snapshot lock and independent memo');
 }
 if(process.env.SUBJECT_MIGRATION_PATH){
  const catalog=JSON.parse(fs.readFileSync(process.env.SUBJECT_CATALOG_PATH,'utf8'));
  const masters=JSON.parse(fs.readFileSync(process.env.SUBJECT_MASTER_PATH,'utf8'));
  const keys=Object.keys(catalog.groups).filter(k=>!['math','music'].includes(k)),snapshots={};
  assert.equal(keys.length,9);assert.equal(catalog.options.length,106);
  for(const [i,key] of keys.entries())sql(`insert into public.subject_categories(id,code,name,sort_order) values('${id(2000+i)}',${q(key)},${q(key)},${i+3})`);
  for(const [i,key] of keys.entries()){
   const groups=catalog.groups[key],codes=groups.flatMap(g=>g.options.map(o=>o.value));
   assert.equal(codes.length,9);
   const cat=id(2000+i),initial=create(3000+i),draftSubject=create(3100+i),reclassified=create(3200+i),denied=create(3300+i);
   sql(`update public.classes set subject_category_id='${cat}',subject_id=null,subject='misleading',title='수학 피아노 제목 무시' where id='${klass}'`);
   initialWrite(initial,codes);writeRecord(draftSubject,codes);writeRecord(draftSubject,[codes[0]]);writeRecord(draftSubject,codes);
   for(const app of [initial,draftSubject])assert.deepEqual(JSON.parse(sql(`select to_json(observations) from public.trial_results where application_id='${app}'`)),codes);
   for(const [otherKey,otherGroups] of Object.entries(catalog.groups))if(otherKey!==key){
    const bad=JSON.stringify({observations:[otherGroups[0].options[0].value]});
    for(const rpc of ['finalize_studio_trial_result','save_studio_trial_result'])fail(`${auth(teacher)}select public.${rpc}('${denied}',${q(bad)}${rpc==='save_studio_trial_result'?',null':''})`,'observation_subject_mismatch');
   }
   assert.equal(sql(`select count(*) from public.trial_results where application_id='${denied}'`),'0');
   // Every actual child of this master resolves through the same category; no child whitelist.
   const master=masters.categories.find(c=>c.code===key),children=masters.subjects.filter(s=>s.category_id===master.id);
   for(const [j,child] of children.entries()){
    const childId=id(4000+i*20+j);
    sql(`insert into public.subjects(id,category_id,code,name,sort_order) values('${childId}','${cat}',${q(child.code)},${q(child.name)},${j+1});update public.classes set subject_id='${childId}',subject_category_id=null where id='${klass}'`);
    assert.equal(sql(`select public.trial_observations_match_subject('${klass}',${q('{'+codes.join(',')+'}')}::text[],'{}')`),'t');
   }
   writeRecord(reclassified,codes);
   sql(`update public.classes set subject_category_id='${id(910)}' where id='${klass}'`);
   writeRecord(reclassified,codes);writeRecord(reclassified,[codes[0]]);
   fail(`${auth(teacher)}select public.save_studio_trial_result('${reclassified}',${q(JSON.stringify({observations:codes}))},(select updated_at from public.trial_results where application_id='${reclassified}'))`,'observation_subject_mismatch');
   sql(`update public.classes set subject_category_id=null,subject_id=null,subject=${q(key)},title=${q(key)} where id='${klass}'`);
   fail(`${auth(teacher)}select public.finalize_studio_trial_result('${denied}',${q(JSON.stringify({observations:[codes[0]]}))})`,'observation_subject_mismatch');
   sql(`update public.classes set subject_category_id='${cat}' where id='${klass}'`);
   // Two populated domains only: omitted interest domain stays absent from V3.
   writeRecord(draftSubject,[codes[3],codes[6]]);
   fail(`${auth(teacher)}select public.publish_experience_report('${draftSubject}',(select updated_at from public.trial_results where application_id='${draftSubject}'))`,'report_format_requires_updated_client');
   sql(`${auth(teacher)}select public.publish_experience_report_v3('${draftSubject}',(select updated_at from public.trial_results where application_id='${draftSubject}'))`);
   const snap=JSON.parse(sql(`${auth(parent)}select content from public.experience_reports where application_id='${draftSubject}'`));
   assert.deepEqual(snap.observations.map(o=>o.group.label),[groups[1].label,groups[2].label]);
   assert.deepEqual(snap.observations.map(o=>o.label),[groups[1].options[0].label,groups[2].options[0].label]);
   assert(!JSON.stringify(snap).includes('note'));snapshots[key]=snap;
   const frozen=fingerprint('experience_reports');
   sql(`update public.classes set subject_category_id='${id(910)}' where id='${klass}'`);
   fail(`${auth(teacher)}select public.save_studio_trial_result('${draftSubject}','{}',null)`,'report_content_locked');
   fail(`${auth(teacher)}select public.publish_experience_report_v3('${draftSubject}',now())`,'report_already_sent');
   save(draftSubject,'전달 후 독립 메모');assert.equal(fingerprint('experience_reports'),frozen);
  }
  const combined=create(3500),allCodes=catalog.options.map(o=>o.value);
  sql(`insert into public.trial_results(application_id,observations,created_by,updated_by) values('${combined}',${q('{'+allCodes.join(',')+'}')}::text[],'${teacher}','${teacher}')`);
  writeRecord(combined,allCodes);assert.equal(sql(`select cardinality(observations) from public.trial_results where application_id='${combined}'`),'106');
  fail(`update public.trial_results set observations=array_append(observations,observations[1]) where application_id='${combined}'`,'trial_results_observations_cardinality_check');
  fail(`update public.trial_results set observations=array['unknown_code'] where application_id='${combined}'`,'trial_results_observations_allowed_check');
  fs.writeFileSync(process.env.MEMO_QA_OUTPUT+'/subject-snapshots.json',JSON.stringify(snapshots,null,2));
  console.log('PASS 9 categories initial/update/reentry, every master child FK, 180 cross-category RPC denials, unchanged old choices and explicit removal, 106-code ceiling, V3 text/domains and omitted groups, old-client denial, locks and independent memo');
 }
 console.log('PASS math codes, optional domains/summary-only, persisted master classification, reentry/preservation, explicit legacy replacement, V1/V2 unchanged, V3 frozen domains, own-org/Parent boundary and independent post-send memo')
 console.log('PASS isolated memo DB: COMPAT no row rewrite, legacy/V1/V2 preserved, draft/sent/withdrawn memo persistence and clear, CAS, Parent/other-org/anon/direct-DML denial, before-trial denial, immutable source/snapshot, Parent snapshot excludes memo, independent registration, unchanged application/log/result clocks and ordering inputs')
 fs.writeFileSync(process.env.MEMO_QA_OUTPUT+'/db-results.json',JSON.stringify({passed:true,fixtureOnly:true,db,preservedTables:tables.length},null,2))
} catch(e){console.error(e.stderr?.toString()||e.stack);process.exitCode=1} finally { execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit',container,'dropdb','-U','supabase_admin','--if-exists',db]) }
