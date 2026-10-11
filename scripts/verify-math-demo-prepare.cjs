// Isolated, disposable Postgres only. Never reads app env or connects to Production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const out=process.env.DEMO_QA_OUTPUT,base=process.env.DEMO_SCHEMA_PATH,contract=process.env.DEMO_LIVE_CONTRACT;
assert(out&&base&&contract,'Explicit schema-only baseline, read-only contract and artifact directory required');
const container='firstsuup-report-edit-db',db='math_demo_prepare_'+Date.now();
const sql=s=>execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const file=process.env.DEMO_PREPARE_PATH||'docs/sql/manual/20261011_prepare_math_report_demo.sql',prepared=fs.readFileSync(file,'utf8'),live=JSON.parse(fs.readFileSync(contract,'utf8'));
const ids=Object.fromEntries([['class','klass'],['schedule','slot'],['application','application']].map(([key,name])=>[key,prepared.match(new RegExp(name+" constant uuid := '([^']+)'"))[1]]));
const music=Boolean(process.env.MUSIC_MIGRATION_PATH);
const q=s=>"'"+s.replaceAll("'","''")+"'";
function fail(s,reason){let error='';try{sql(s)}catch(e){error=e.stderr?.toString()||e.message}assert(error.includes(reason),reason+' expected: '+error)}
function dataSnapshot(excludeNew=false){
 const tables=JSON.parse(sql("select json_agg(schemaname||'.'||tablename order by schemaname,tablename) from pg_tables where schemaname in ('public','app')"));
 return Object.fromEntries(tables.map(table=>[table,sql(`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from ${table} t ${excludeNew&&{'public.classes':ids.class,'public.class_schedules':ids.schedule,'public.trial_applications':ids.application}[table]?`where id<>${q({'public.classes':ids.class,'public.class_schedules':ids.schedule,'public.trial_applications':ids.application}[table])}`:''}`)]));
}
const permissions=()=>sql("select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by to_jsonb(p)::text),'')) from pg_policies p where schemaname in ('public','app')")+'|'+sql("select md5(string_agg(relname||relrowsecurity::text||coalesce(relacl::text,''),'' order by relname)) from pg_class where relnamespace in ('public'::regnamespace,'app'::regnamespace) and relkind='r'");
try{
 execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit',container,'createdb','-U','supabase_admin',db]);
 sql(fs.readFileSync(base,'utf8').replace('CREATE SCHEMA public;',''));
 const migrations=['20261004100000_apple_parent_phone_verification.sql','20261004120000_apple_parent_phone_verification_hardening.sql','20261004130000_parent_push_foundation.sql','20261005000000_schedule_confirmed_push.sql','20261006120000_date_booking_closures_compat.sql','20261006160000_public_booking_closure_scope_compat.sql','20261006161000_public_booking_closure_scope_app_ready.sql','20261007120000_report_edit_before_publication.sql','20261009120000_studio_academy_memo.sql','20261011140000_math_report_observations.sql'];
 for(const name of migrations)sql(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 if(music)sql(fs.readFileSync(process.env.MUSIC_MIGRATION_PATH,'utf8'));
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
 if(music)sql(`insert into public.subject_categories(id,code,name,is_active,sort_order) values('1cbe0216-02d0-4b64-81ff-83e7d70ac1de','music','음악',true,3);insert into public.subjects(id,category_id,code,name,is_active,sort_order) values('110b6774-0742-4cb9-9fe7-e333b89db01b','1cbe0216-02d0-4b64-81ff-83e7d70ac1de','piano','피아노',true,1)`);
 const before=dataSnapshot(),policyBefore=permissions();
 fail(prepared.replace("'14:00','15:00'","'14:30','15:00'"),'invalid_schedule_slot');assert.deepEqual(dataSnapshot(),before,'invalid-slot rollback');
 fail(prepared.replace("1,'open',","1,'hidden',"),'schedule_booking_closed');assert.deepEqual(dataSnapshot(),before,'closed-slot rollback');
 fail(prepared.replace("and name='첫수업 데모학원'","and name='WRONG_ORG'"),'demo_organization_mismatch');
 fail(prepared.replace("u.email='demo-parent1@firstsuup.com'","u.email='wrong@local.invalid'"),'demo_parent_mismatch');
 fail(prepared.replace(music?"code='piano' and category_id":"code='school_math' and category_id","code='wrong_subject' and category_id"),music?'demo_piano_classification_mismatch':'demo_math_classification_mismatch');
 sql(prepared);
 assert.deepEqual(dataSnapshot(true),before,'all existing public/app data unchanged');assert.equal(permissions(),policyBefore,'RLS/ACL unchanged');
 const after=dataSnapshot();const delta=Object.keys(before).filter(t=>after[t]!==before[t]);assert.deepEqual(delta,['public.class_schedules','public.classes','public.trial_applications']);
 for(const table of delta)assert.equal(Number(after[table].split(':')[0])-Number(before[table].split(':')[0]),1);
 const actual=JSON.parse(sql(`select json_build_object('class',to_jsonb(c),'schedule',to_jsonb(s),'application',to_jsonb(a),'isMath',public.trial_observations_match_subject(c.id,array['${music?'music_followed_rhythm_or_sound':'math_applied_concept'}'],'{}')) from public.classes c join public.class_schedules s on s.class_id=c.id join public.trial_applications a on a.class_id=c.id where a.id='${ids.application}'`));
 assert.equal(actual.class.is_active,false);assert.equal(actual.application.status,'completed');assert.equal(actual.application.parent_id,'b30a0732-5e20-4969-97d1-a8c51210f715');assert.equal(actual.application.parent_phone,null);assert.equal(actual.isMath,true);
 assert.equal(sql(`select count(*) from public.experience_reports where application_id='${ids.application}'`),'0');assert.equal(sql(`select count(*) from public.trial_results where application_id='${ids.application}'`),'0');
 fail(prepared,'demo_target_already_exists');assert.deepEqual(dataSnapshot(),after,'retry creates no duplicate');
 fs.writeFileSync(path.join(out,'isolated-created.json'),JSON.stringify(actual,null,2));
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,fixtureOnly:true,sha256:crypto.createHash('sha256').update(prepared).digest('hex'),addedRows:{classes:1,class_schedules:1,trial_applications:1},allOtherDataPreserved:true,liveConstraintsAndTriggersMatch:true,policiesAndACLUnchanged:true,invalidAndRetryAtomicity:true,jwtOrRoleManipulation:false,notificationsAndReportWrites:0},null,2));
 console.log('PASS exact SQL: 1 private subject-specific class + 1 past slot + 1 completed application; live constraints/triggers matched; all other rows, policies and ACLs preserved; invalid input and repeat rollback; no auth/JWT manipulation, report/log/notification writes.');
}catch(e){console.error(e.stderr?.toString()||e.stack);process.exitCode=1}finally{try{execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit',container,'dropdb','-U','supabase_admin',db])}catch{}}
