// Isolated, disposable Postgres only. Never reads app env or connects to Production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const out=process.env.DEMO_QA_OUTPUT,base=process.env.DEMO_SCHEMA_PATH,contract=process.env.DEMO_LIVE_CONTRACT;
assert(out&&base&&contract,'Explicit schema-only baseline, read-only contract and artifact directory required');
const container='firstsuup-report-edit-db',db='math_demo_prepare_'+Date.now();
const sql=s=>execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const file=process.env.DEMO_PREPARE_PATH||'docs/sql/manual/20261011_prepare_report_subject_demos.sql',prepared=fs.readFileSync(file,'utf8'),live=JSON.parse(fs.readFileSync(contract,'utf8'));
const ids=Object.fromEntries([['class','klass'],['schedule','slot'],['application','application']].map(([key,name])=>[key,[...prepared.matchAll(new RegExp(name+" constant uuid := '([^']+)'",'g'))].map(m=>m[1])]));
assert(Object.values(ids).every(v=>v.length===7&&new Set(v).size===7));
const master=JSON.parse(fs.readFileSync(process.env.SUBJECT_MASTER_PATH,'utf8'));
const q=s=>"'"+s.replaceAll("'","''")+"'";
function fail(s,reason){let error='';try{sql(s)}catch(e){error=e.stderr?.toString()||e.message}assert(error.includes(reason),reason+' expected: '+error)}
function dataSnapshot(excludeNew=false){
 const tables=JSON.parse(sql("select json_agg(schemaname||'.'||tablename order by schemaname,tablename) from pg_tables where schemaname in ('public','app')"));
 return Object.fromEntries(tables.map(table=>[table,sql(`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from ${table} t ${excludeNew&&{'public.classes':ids.class,'public.class_schedules':ids.schedule,'public.trial_applications':ids.application}[table]?`where id not in (${({'public.classes':ids.class,'public.class_schedules':ids.schedule,'public.trial_applications':ids.application}[table]).map(q).join(',')})`:''}`)]));
}
const permissions=()=>sql("select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by to_jsonb(p)::text),'')) from pg_policies p where schemaname in ('public','app')")+'|'+sql("select md5(string_agg(relname||relrowsecurity::text||coalesce(relacl::text,''),'' order by relname)) from pg_class where relnamespace in ('public'::regnamespace,'app'::regnamespace) and relkind='r'");
try{
 execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit',container,'createdb','-U','supabase_admin',db]);
 sql(fs.readFileSync(base,'utf8').replace('CREATE SCHEMA public;',''));
 const migrations=['20261004100000_apple_parent_phone_verification.sql','20261004120000_apple_parent_phone_verification_hardening.sql','20261004130000_parent_push_foundation.sql','20261005000000_schedule_confirmed_push.sql','20261006120000_date_booking_closures_compat.sql','20261006160000_public_booking_closure_scope_compat.sql','20261006161000_public_booking_closure_scope_app_ready.sql','20261007120000_report_edit_before_publication.sql','20261009120000_studio_academy_memo.sql','20261011140000_math_report_observations.sql'];
 for(const name of migrations)sql(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 sql(fs.readFileSync('supabase/migrations/20261011180000_music_report_observations.sql','utf8'));
 sql(fs.readFileSync('supabase/migrations/20261011200000_report_subject_observations.sql','utf8'));
 // Verify the schema being tested has the actual live table constraints/INSERT triggers.
 for(const c of live.constraints)assert.equal(sql(`select pg_get_constraintdef(oid) from pg_constraint where conrelid=${q('public.'+c.table)}::regclass and conname=${q(c.name)}`),c.definition,'constraint '+c.name);
 for(const t of live.triggers){assert.equal(sql(`select pg_get_triggerdef(oid) from pg_trigger where tgrelid=${q('public.'+t.table)}::regclass and tgname=${q(t.name)}`),t.trigger,'trigger '+t.name);assert.equal(sql(`select pg_get_functiondef(tgfoid) from pg_trigger where tgrelid=${q('public.'+t.table)}::regclass and tgname=${q(t.name)}`).trim(),t.function.trim(),'trigger function '+t.name)}
 // Only synthetic baseline fixtures in disposable DB; no JWTs or SET ROLE.
 sql(`insert into public.organizations(id,name) values('29e8c477-dabb-404c-bac4-ba96ffd1e999','첫수업 데모학원'),('79000000-0000-4000-8000-000000000002','ISOLATED unrelated');
 insert into auth.users(id,email) values('accedc61-4a49-4679-ad5c-392499c21ccd','demo@firstsuup.com'),('b30a0732-5e20-4969-97d1-a8c51210f715','demo-parent1@firstsuup.com');
 insert into public.profiles(id,role,name,organization_id) values('accedc61-4a49-4679-ad5c-392499c21ccd','academy','ISOLATED teacher','29e8c477-dabb-404c-bac4-ba96ffd1e999'),('b30a0732-5e20-4969-97d1-a8c51210f715','parent','데모 보호자 1',null);
 insert into public.subject_categories(id,code,name,is_active,sort_order) values('c0985fd7-bebd-4a0b-8a35-1d78bdf8392e','math','수학',true,2);
 insert into public.subjects(id,category_id,code,name,is_active,sort_order) values('393cec97-251d-4d1c-b2f7-c8b0a3506f02','c0985fd7-bebd-4a0b-8a35-1d78bdf8392e','school_math','교과수학',true,1);
 insert into public.classes(id,organization_id,title,subject,target_age,description,is_active) values('79000000-0000-4000-8000-000000000003','79000000-0000-4000-8000-000000000002','KEEP_EXISTING','piano','elem_3','KEEP',false);
 insert into public.parent_confirmed_push_settings(singleton,mode) values(true,'off') on conflict(singleton) do nothing;`);
 const missing=['korean_language','science','social_history','foreign_language','art_design','sports_dance','creative_mind'];
 for(const code of missing){const c=master.categories.find(c=>c.code===code);const sub=master.subjects.find(s=>s.category_id===c.id&&s.is_active);
  sql(`insert into public.subject_categories(id,code,name,is_active,sort_order) values('${c.id}',${q(c.code)},${q(c.name)},true,${c.sort_order});insert into public.subjects(id,category_id,code,name,is_active,sort_order) values('${sub.id}','${c.id}',${q(sub.code)},${q(sub.name)},true,1)`);
 }
 const before=dataSnapshot(),policyBefore=permissions();
 fail(prepared.replace("'14:00','15:00'","'14:30','15:00'"),'invalid_schedule_slot');assert.deepEqual(dataSnapshot(),before,'invalid-slot rollback');
 fail(prepared.replace("1,'open',","1,'hidden',"),'schedule_booking_closed');assert.deepEqual(dataSnapshot(),before,'closed-slot rollback');
 fail(prepared.replace("and name='첫수업 데모학원'","and name='WRONG_ORG'"),'demo_organization_mismatch');
 fail(prepared.replace("u.email='demo-parent1@firstsuup.com'","u.email='wrong@local.invalid'"),'demo_parent_mismatch');
 fail(prepared.replace("code='korean_language' and is_active","code='wrong_subject' and is_active"),'demo_subject_classification_mismatch');
 sql(prepared);
 assert.deepEqual(dataSnapshot(true),before,'all existing public/app data unchanged');assert.equal(permissions(),policyBefore,'RLS/ACL unchanged');
 const after=dataSnapshot();const delta=Object.keys(before).filter(t=>after[t]!==before[t]);assert.deepEqual(delta,['public.class_schedules','public.classes','public.trial_applications']);
 for(const table of delta)assert.equal(Number(after[table].split(':')[0])-Number(before[table].split(':')[0]),7);
 const actual=[];
 for(const [i,app] of ids.application.entries()){
  const row=JSON.parse(sql(`select json_build_object('class',to_jsonb(c),'schedule',to_jsonb(s),'application',to_jsonb(a),'category',sc.code) from public.classes c join public.class_schedules s on s.class_id=c.id join public.trial_applications a on a.class_id=c.id join public.subject_categories sc on sc.id=c.subject_category_id where a.id='${app}'`));
  assert.equal(row.class.id,ids.class[i]);assert.equal(row.schedule.id,ids.schedule[i]);assert.equal(row.category,missing[i]);assert.equal(row.class.is_active,false);assert.equal(row.application.status,'completed');assert.equal(row.application.parent_id,'b30a0732-5e20-4969-97d1-a8c51210f715');assert.equal(row.application.parent_phone,null);actual.push(row);
  for(const table of ['trial_results','experience_reports','application_logs'])assert.equal(sql(`select count(*) from public.${table} where application_id='${app}'`),'0');
 }
 fail(prepared,'demo_target_already_exists');assert.deepEqual(dataSnapshot(),after,'retry creates no duplicate');
 fs.writeFileSync(path.join(out,'isolated-created.json'),JSON.stringify(actual,null,2));
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,fixtureOnly:true,sha256:crypto.createHash('sha256').update(prepared).digest('hex'),addedRows:{classes:7,class_schedules:7,trial_applications:7},allOtherDataPreserved:true,liveConstraintsAndTriggersMatch:true,policiesAndACLUnchanged:true,invalidAndRetryAtomicity:true,jwtOrRoleManipulation:false,notificationsAndReportWrites:0},null,2));
 console.log('PASS exact SQL: 7 private category classes + 7 past slots + 7 completed applications; live constraints/triggers matched; all other rows, policies and ACLs preserved; invalid input and repeat rollback; no auth/JWT manipulation, report/log/notification writes.');
}catch(e){console.error(e.stderr?.toString()||e.stack);process.exitCode=1}finally{try{execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit',container,'dropdb','-U','supabase_admin',db])}catch{}}
