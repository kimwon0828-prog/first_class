// In-memory synthetic database only; no env files, network, real users or files.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE_PATH||'/private/tmp/firstsuup-review-db-tools/node_modules/@electric-sql/pglite');
const repo=process.env.ERASURE_SOURCE_ROOT||path.resolve(__dirname,'..');
const db=new PGlite(),checks=[];
const ts=require(path.join(repo,'node_modules/typescript')),vm=require('node:vm');
function loadTs(file){const source=fs.readFileSync(path.join(process.env.ERASURE_IMPLEMENTATION_ROOT||repo,file),'utf8');const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Map,Set,Array,Error,require:()=>{throw Error('Unexpected runtime dependency');}});return exports;}
const workflow=loadTs('src/features/my/lib/parent-account-deletion-workflow.ts').deleteParentAccountWorkflow;
const readFlags=loadTs('src/shared/lib/db/erased-report-flags.ts').readErasedReportFlags;

const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=async(s,a)=>(await db.query(s,a)).rows;
const auth=async(n,role='authenticated')=>{await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[n?uid(n):'',role]);};
const one=async(s,a)=>(await q(s,a))[0];
const count=async(t,w='true')=>Number((await one(`select count(*) n from ${t} where ${w}`)).n);
async function test(name,fn){await fn();checks.push({name,result:'PASS'});console.log('PASS '+name);}
function fn(file,name){const s=fs.readFileSync(path.join(repo,'supabase/migrations',file),'utf8');const start=s.search(new RegExp('create (?:or replace )?function '+name.replace(/[.]/g,'\\.')+'\\('));assert(start>=0);const tail=s.slice(start),end=tail.indexOf('$$;',tail.indexOf('as $$')+5);assert(end>=0);return tail.slice(0,end+3);}
async function seed(n,{published=true,uploading=false}={}){
 const parent=uid(n),child=uid(n+10000),app=uid(n+20000),report=uid(n+30000),file=uid(n+40000);
 await db.query('insert into auth.users values($1)',[parent]);await db.query("insert into public.profiles values($1,'parent',null)",[parent]);
 await db.query('insert into public.children values($1,$2,$3)',[child,parent,'PRIVATE_CHILD']);
 await db.query(`insert into public.trial_applications(id,class_id,parent_id,child_id,child_name,child_grade,parent_name,parent_phone,child_school,child_notes,consultation_note,registration_note,registration_reason_ids,status,requested_slot_at,confirmed_slot_at,completed_at,registration_status) values($1,$2,$3,$4,'PRIVATE_CHILD','초3','PRIVATE_PARENT','01000000000','PRIVATE_SCHOOL','PRIVATE_HEALTH','PRIVATE_COUNSEL','PRIVATE_REGNOTE',array['cost'],'completed',now()-interval '2 days',now()-interval '2 days',now()-interval '1 day','enrolled')`,[app,uid(2),parent,child]);
 await db.query('insert into public.trial_results(id,application_id,created_by,updated_by,public_summary,note) values($1,$2,$3,$3,$4,$4)',[uid(n+50000),app,uid(900),'PRIVATE_RESULT']);
 await db.query('insert into public.report_attachment_files(id,application_id,object_path,state,created_by) values($1,$2,$3,$4,$5)',[file,app,`academy/${file}.jpg`,uploading?'uploading':'ready',uid(900)]);
 if(published) await db.query(`insert into public.experience_reports(id,application_id,status,content,published_by) values($1,$2,'published',$3,$4)`,[report,app,JSON.stringify({summary:'PRIVATE_SNAPSHOT',attachments:[{id:file,url:'PRIVATE_SIGNED_URL'}]}),uid(900)]);
 for(const t of ['experience_feedback','parent_decisions','parent_report_engagement'])await db.query(`insert into public.${t}(application_id,parent_id) values($1,$2)`,[app,parent]);
 await db.query('insert into public.parent_notification_reads values($1)',[parent]);
 for(const t of ['studio_academy_memos','consultation_logs'])await db.query(`insert into public.${t} values($1,'PRIVATE_NOTE')`,[app]);
 await db.query("insert into public.application_logs(application_id,actor_id,note,to_status) values($1,$2,'PRIVATE_LOG','completed')",[app,parent]);
 await db.query("insert into public.registration_results(application_id,recorded_by,result) values($1,$2,'enrolled')",[app,uid(900)]);
 await db.query("insert into public.sms_logs values($1,'parent','PRIVATE_PARENT','010-****-0000','PRIVATE_SMS','PRIVATE_PROVIDER_ID','PRIVATE_ERROR')",[app]);
 await db.query("insert into public.studio_import_rows values($1,'PRIVATE_FINGERPRINT')",[app]);
 await db.query("insert into public.parent_event_push_deliveries values($1,$2,'PRIVATE_TOKEN')",[app,parent]);
 await db.query("insert into storage.objects values('report-attachments',$1,$2::text,$2::text::uuid),('parent-assets',$3,$4::text,$4::text::uuid)",[`academy/${file}.jpg`,uid(900),`parent/${parent}.jpg`,parent]);
 return {parent,child,app,report,file};
}
const prep=async()=> (await one('select public.prepare_my_parent_account_deletion() value')).value;
const pending=async()=>q('select * from public.get_my_parent_deletion_storage_objects() order by bucket_id,object_name');
async function ack(rows){return (await one('select public.ack_my_parent_erasure_files($1::jsonb) value',[JSON.stringify(rows)])).value;}
(async()=>{try{
 await db.exec(`create schema auth;create schema app;create schema storage;
 create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema auth to anon,authenticated,service_role;
 create table auth.users(id uuid primary key);
 create table public.profiles(id uuid primary key references auth.users on delete cascade,role text,organization_id uuid);
 create table public.classes(id uuid primary key,organization_id uuid not null);
 create table public.children(id uuid primary key,parent_id uuid references public.profiles,name text);
 create table public.trial_applications(id uuid primary key,class_id uuid not null references public.classes,parent_id uuid references public.profiles,child_id uuid references public.children,child_name text not null,child_grade text not null,parent_name text,parent_phone text,child_school text,child_notes text,consultation_note text,registration_note text,registration_reason_ids text[] not null default '{}',status text not null,requested_slot_at timestamptz not null,confirmed_slot_at timestamptz,completed_at timestamptz,canceled_at timestamptz,no_show_at timestamptz,registration_status text not null default 'undecided',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
 create table public.teachers(profile_id uuid);
 create table public.academy_update_requests(requester_profile_id uuid);
 create table public.trial_results(id uuid primary key,application_id uuid unique references public.trial_applications,created_by uuid,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),public_summary text,note text,attachments jsonb default '[]');
 create table public.experience_reports(id uuid primary key,application_id uuid references public.trial_applications,status text,content jsonb,published_by uuid,withdrawn_by uuid,superseded_by uuid);
 create table public.experience_feedback(application_id uuid references public.trial_applications,parent_id uuid references public.profiles);
 create table public.parent_decisions(application_id uuid references public.trial_applications,parent_id uuid references public.profiles);
 create table public.parent_report_engagement(application_id uuid references public.trial_applications,parent_id uuid references public.profiles);
 create table public.parent_notification_reads(parent_id uuid references public.profiles);
 create table public.studio_academy_memos(application_id uuid references public.trial_applications,note text);
 create table public.consultation_logs(application_id uuid references public.trial_applications,note text);
 create table public.application_logs(application_id uuid references public.trial_applications,actor_id uuid not null references public.profiles,note text,to_status text);
 create table public.registration_results(application_id uuid references public.trial_applications,recorded_by uuid references public.profiles,result text,superseded_at timestamptz);
 create table public.report_attachment_files(id uuid primary key,application_id uuid references public.trial_applications,object_path text unique,state text,created_at timestamptz default now(),created_by uuid references auth.users);
 create table public.sms_logs(trial_application_id uuid references public.trial_applications,recipient_type text,recipient_name text,recipient_phone_masked text,message_preview text,provider_message_id text,error_message text);
 create table public.studio_import_rows(application_id uuid references public.trial_applications,fingerprint text);
 create table public.parent_event_push_deliveries(application_id uuid references public.trial_applications,parent_id uuid references public.profiles on delete cascade,attempts text);
 create table storage.objects(bucket_id text,name text,owner_id text,owner uuid,primary key(bucket_id,name));
 insert into auth.users values('${uid(900)}');insert into public.profiles values('${uid(900)}','academy','${uid(1)}');insert into public.classes values('${uid(2)}','${uid(1)}');`);
 await db.exec(fs.readFileSync(path.join(repo,'supabase/migrations/20261001150000_parent_account_deletion_v1.sql'),'utf8'));
 await db.exec(`create table app.app_store_review_classes(class_id uuid);create table app.app_store_review_parents(parent_id uuid);create table app.app_store_review_grants(parent_id uuid,class_id uuid);
 create function app.is_app_store_review_parent(p_id uuid) returns boolean language sql as $$select exists(select 1 from app.app_store_review_parents where parent_id=p_id)$$;
 create function app.can_book_app_store_review_class(p_id uuid,c_id uuid) returns boolean language sql as $$select exists(select 1 from app.app_store_review_grants where parent_id=p_id and class_id=c_id)$$;`);
 await db.exec("create table public.class_schedules(id uuid primary key);create table public.schedule_blocks(id uuid primary key,related_application_id uuid references public.trial_applications on delete set null,type text,check((type='trial_booked')=(related_application_id is not null)));alter table public.trial_applications add column requested_schedule_block_id uuid references public.schedule_blocks on delete set null;alter table public.trial_applications add column confirmed_schedule_block_id uuid references public.schedule_blocks on delete set null");
 await db.exec(fn('20261020120000_app_store_review_isolation.sql','app.enforce_date_booking_application'));
 await db.exec(fn('20261020120000_app_store_review_isolation.sql','app.guard_app_store_review_application'));
 await db.exec(`create trigger aaa_guard_app_store_review_application before insert or update of parent_id,class_id,child_id on public.trial_applications for each row execute function app.guard_app_store_review_application();`);
 await db.exec(fn('20261007120000_report_edit_before_publication.sql','public.lock_final_trial_result'));
 await db.exec(fn('20260930111000_studio_experience_workflow_phase1_harden.sql','public.report_send_once'));
 await db.exec(`create trigger trial_result_final before update or delete on public.trial_results for each row execute function public.lock_final_trial_result();create trigger experience_report_send_once before insert or update or delete on public.experience_reports for each row execute function public.report_send_once();create trigger feedback_immutable before update or delete on public.experience_feedback for each row execute function app.reject_parent_experience_revision();`);
 const implementationRoot=process.env.ERASURE_IMPLEMENTATION_ROOT||repo;
 const migration=fs.readFileSync(path.join(implementationRoot,'docs/sql/manual/20261022_parent_personal_data_erasure_draft.sql'),'utf8');
 await test('legacy pending deletion blocks the whole migration, including retention tables',async()=>{
  await db.query('insert into auth.users values($1)',[uid(999)]);await db.query("insert into app.parent_account_deletions(parent_id,state) values($1,'db_cleaned')",[uid(999)]);
  await assert.rejects(db.exec(migration),/privacy_pending_deletion_review_required/);await db.exec('rollback');
  assert.equal((await one("select to_regclass('app.trial_privacy_policy') value")).value,null);
  assert.equal(await count('information_schema.columns',"table_schema='public' and table_name='trial_applications' and column_name='privacy_erased_at'"),0);
  await db.query('delete from auth.users where id=$1',[uid(999)]);
 });
 await db.exec(migration);
 const a=await seed(10),b=await seed(11),foreignBefore=await one('select row_to_json(a) data from public.trial_applications a where id=$1',[b.app]);await auth(10);
 await test('ordinary published report/result DELETE guards still reject',async()=>{
  await assert.rejects(db.query('delete from public.trial_results where application_id=$1',[a.app]),/trial_result_already_finalized/);
  await assert.rejects(db.query('delete from public.experience_reports where application_id=$1',[a.app]),/report_already_sent/);
 });
 await test('only self authenticated parent can prepare, private helpers/tables have no client grants',async()=>{
  for(const claim of ['anon','service_role','']){await auth(10,claim);await assert.rejects(prep(),/parent_auth_required/);}await auth(10);
  await db.exec('set role authenticated');await assert.rejects(db.query('select app.erase_parent_trial_content($1,$2)',[b.app,a.parent]),/permission denied/);await assert.rejects(db.query('select * from app.privacy_erasure_context'),/permission denied/);await db.exec('reset role');
 });
 await test('self erasure clears content, private fields and live parent/child links',async()=>{
  assert.equal(await prep(),'db_cleaned');const row=await one('select * from public.trial_applications where id=$1',[a.app]);
  for(const key of ['child_name','child_grade','parent_name','parent_phone','child_school','child_notes','consultation_note','registration_note','parent_id','child_id'])assert.equal(row[key],null,key);
  assert.deepEqual(row.registration_reason_ids,[]);assert(row.privacy_erased_at);
  for(const table of ['trial_results','experience_reports','experience_feedback','parent_decisions','parent_report_engagement','studio_academy_memos','consultation_logs','report_attachment_files','studio_import_rows','parent_event_push_deliveries'])assert.equal(await count('public.'+table,`application_id='${a.app}'`),0,table);
  assert.equal(await count('public.profiles',`id='${a.parent}'`),0);assert.equal(await count('public.children',`parent_id='${a.parent}'`),0);
  assert.equal((await one('select note from public.application_logs where application_id=$1',[a.app])).note,null);
  for(const [k,v] of Object.entries(await one('select * from public.sms_logs where trial_application_id=$1',[a.app])))if(!['trial_application_id','recipient_type'].includes(k))assert.equal(v,null,k);
 });
 await test('real status, booked times, registration results and publication count preserved',async()=>{
  const row=await one('select * from public.trial_applications where id=$1',[a.app]);assert.equal(row.status,'completed');assert.equal(row.registration_status,'enrolled');assert(row.confirmed_slot_at);assert(row.completed_at);
  assert.equal((await one('select result from public.registration_results where application_id=$1',[a.app])).result,'enrolled');assert.equal((await one('select had_published_report from app.erased_trial_metrics where application_id=$1',[a.app])).had_published_report,true);
 });
 await test('other parent application and snapshots byte-for-byte preserved',async()=>{
  assert.deepEqual(await one('select row_to_json(a) data from public.trial_applications a where id=$1',[b.app]),foreignBefore);assert.equal(await count('public.experience_reports',`application_id='${b.app}'`),1);await assert.rejects(db.query('delete from public.experience_reports where application_id=$1',[b.app]),/report_already_sent/);
 });
 await test('ledger includes academy-owned report files and parent-owned files only',async()=>{
  assert.deepEqual((await pending()).map(x=>x.object_name).sort(),[`academy/${a.file}.jpg`,`parent/${a.parent}.jpg`].sort());
 });
 await test('Storage failure blocks Auth deletion; false acknowledgement rejected',async()=>{
  await assert.rejects(db.query('delete from auth.users where id=$1',[a.parent]),/privacy_storage_pending/);await assert.rejects(ack(await pending()),/privacy_storage_not_removed/);
  await assert.rejects(ack([{bucket_id:'report-attachments',object_name:`academy/${b.file}.jpg`}]),/privacy_file_scope_forbidden/);
 });
 await test('partial Storage removal retries without prematurely deleting Auth',async()=>{
  const rows=await pending();await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[rows[0].bucket_id,rows[0].object_name]);assert.equal(await ack([rows[0]]),true);
  await assert.rejects(db.query('delete from auth.users where id=$1',[a.parent]),/privacy_storage_pending/);assert.equal(await prep(),'db_cleaned');assert.equal((await pending()).length,1);
  const rest=await pending();await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[rest[0].bucket_id,rest[0].object_name]);assert.equal(await ack(rest),true);assert.deepEqual(await pending(),[]);
 });
 await test('late parent-owned Storage object blocks Auth deletion even after ledger acknowledged',async()=>{
  await db.query("insert into storage.objects values('parent-assets','late',$1::text,$1::text::uuid)",[a.parent]);await assert.rejects(db.query('delete from auth.users where id=$1',[a.parent]),/privacy_storage_pending/);await db.exec("delete from storage.objects where name='late'");
  await db.query('delete from auth.users where id=$1',[a.parent]);assert.equal(await count('auth.users',`id='${a.parent}'`),0);assert.equal(await count('app.parent_erasure_files',`parent_id='${a.parent}'`),0);
 });
 await test('erased content cannot be recreated, marker forged or cleared',async()=>{
  await assert.rejects(db.query("update public.trial_applications set child_name='REIDENTIFIED' where id=$1",[a.app]),/privacy_content_erased/);
  await assert.rejects(db.query('update public.trial_applications set privacy_erased_at=null where id=$1',[a.app]),/privacy_content_erased/);
  await assert.rejects(db.query('update public.trial_applications set privacy_erased_at=now() where id=$1',[b.app]),/privacy_content_erased/);
  await assert.rejects(db.query("insert into public.studio_academy_memos values($1,'NEW_PRIVATE_NOTE')",[a.app]),/privacy_content_erased/);
  await db.query("select set_config('app.privacy_erasure','true',false)");await assert.rejects(db.query("insert into public.consultation_logs values($1,'NEW_PRIVATE_NOTE')",[a.app]),/privacy_content_erased/);
 });
 await test('erasure does not freeze later attendance/status facts or clean status logs',async()=>{
  await db.query("update public.trial_applications set status='canceled',canceled_at=now() where id=$1",[a.app]);assert.equal((await one('select status from public.trial_applications where id=$1',[a.app])).status,'canceled');
  await db.query("insert into public.application_logs(application_id,actor_id,note,to_status) values($1,$2,null,'canceled')",[a.app,uid(900)]);
  await assert.rejects(db.query("insert into public.application_logs(application_id,actor_id,note,to_status) values($1,$2,'PRIVATE','canceled')",[a.app,uid(900)]),/privacy_content_erased/);
 });
 await test('Studio publication flag is organization scoped, parent cannot read it',async()=>{
  await auth(900);assert.deepEqual(await q('select * from public.get_studio_erased_report_flags($1)',[[a.app,b.app]]),[{application_id:a.app}]);await auth(11);assert.deepEqual(await q('select * from public.get_studio_erased_report_flags($1)',[[a.app]]),[]);
 });
 for(const kind of ['upload','hold','mixed-role','schema-drift','late-fk','cross-parent-child','shared-photo'])await test(kind+' aborts whole erasure transaction and preserves original profile/content',async()=>{
  const n=checks.length+100, row=await seed(n,{uploading:kind==='upload'});await auth(n);
  if(kind==='hold')await db.query("insert into app.trial_privacy_holds values($1,'active_dispute','SYNTHETIC_CASE',now()+interval '1 day',$2,now())",[row.app,uid(900)]);
  if(kind==='mixed-role')await db.query('insert into public.teachers values($1)',[row.parent]);
  if(kind==='schema-drift')await db.exec("alter table public.trial_applications add column unknown_private text not null default 'PRIVATE_NEW_FIELD'");
  if(kind==='late-fk'){await db.exec('create table public.synthetic_private_fk(parent_id uuid references public.profiles)');await db.query('insert into public.synthetic_private_fk values($1)',[row.parent]);}
  if(kind==='cross-parent-child')await db.query('update public.trial_applications set parent_id=$1 where id=$2',[b.parent,row.app]);
  if(kind==='shared-photo')await db.query('update public.experience_reports set content=$1 where id=$2',[JSON.stringify({attachments:[{id:row.file}]}),b.report]);
  await assert.rejects(prep());assert.equal(await count('public.profiles',`id='${row.parent}'`),1);assert.equal((await one('select child_name from public.trial_applications where id=$1',[row.app])).child_name,'PRIVATE_CHILD');assert.equal(await count('app.parent_account_deletions',`parent_id='${row.parent}'`),0);assert.equal(await count('app.privacy_erasure_context'),0);
  if(kind==='schema-drift')await db.exec('alter table public.trial_applications drop column unknown_private');
  if(kind==='late-fk')await db.exec('drop table public.synthetic_private_fk');
 });
 await test('null-parent legacy child reference is erased within its actual owner scope',async()=>{
  const row=await seed(500,{published:false});await db.query('update public.trial_applications set parent_id=null where id=$1',[row.app]);await auth(500);assert.equal(await prep(),'db_cleaned');assert.equal((await one('select child_name from public.trial_applications where id=$1',[row.app])).child_name,null);
 });
 await test('review-account isolation survives self erasure including a legacy detached child',async()=>{
  const row=await seed(510,{published:false});await db.query('update public.trial_applications set parent_id=null where id=$1',[row.app]);
  await db.query('insert into app.app_store_review_classes values($1)',[uid(2)]);await auth(510);assert.equal(await prep(),'db_cleaned');
  assert.equal((await one('select child_id from public.trial_applications where id=$1',[row.app])).child_id,null);
  await assert.rejects(db.query('update public.trial_applications set parent_id=$1 where id=$2',[uid(900),b.app]),/app_review_application_scope_forbidden/);
  await db.exec('delete from app.app_store_review_classes');
 });
 await test('service/anon cannot invoke new public self or Studio routines',async()=>{
  for(const role of ['service_role','anon'])for(const sig of ['public.get_my_parent_erasure_contract()','public.ack_my_parent_erasure_files(jsonb)','public.get_studio_erased_report_flags(uuid[])'])assert.equal((await one('select has_function_privilege($1,$2,\'EXECUTE\') value',[role,sig])).value,false);
 });
 await test('real backend: provider failure retains Auth; retry ACKs removed files before Auth',async()=>{
  const row=await seed(1000);await auth(1000);let fail=true,authAttempts=0;const events=[];
  const userClient={auth:{getUser:async()=>({data:{user:{id:row.parent}},error:null})},rpc:async(name,args)=>{
   events.push(name);try{let value;
   if(name==='ack_my_parent_erasure_files')value=await ack(args.p_objects);
   else if(name==='get_my_parent_deletion_storage_objects')value=await pending();
   else value=(await one(`select public.${name}() value`)).value;
   return {data:value,error:null};}catch(e){return {data:null,error:{message:e.message}};}
  }};
  const admin={storage:{from:bucket=>({remove:async paths=>{events.push('storage');if(fail)return {error:{message:'synthetic provider failure'}};for(const name of paths)await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[bucket,name]);return {error:null};}})},auth:{admin:{deleteUser:async id=>{events.push('auth');authAttempts++;try{await db.query('delete from auth.users where id=$1',[id]);return {error:null};}catch(e){return {error:{message:e.message}};}}}}};
  assert.equal((await workflow(userClient,admin)).status,'error');assert.equal(authAttempts,0);assert.equal(await count('auth.users',`id='${row.parent}'`),1);
  fail=false;assert.equal((await workflow(userClient,admin)).status,'success');assert.equal(authAttempts,1);assert(events.lastIndexOf('ack_my_parent_erasure_files')<events.lastIndexOf('auth'));assert.equal(await count('auth.users',`id='${row.parent}'`),0);
 });
 await test('real backend: misleading provider success cannot erase Auth while bytes metadata remains',async()=>{
  const row=await seed(1001);await auth(1001);let authCalls=0;const client={auth:{getUser:async()=>({data:{user:{id:row.parent}},error:null})},rpc:async(name,args)=>{
   try{const data=name==='ack_my_parent_erasure_files'?await ack(args.p_objects):name==='get_my_parent_deletion_storage_objects'?await pending():(await one(`select public.${name}() value`)).value;return {data,error:null};}catch(e){return {error:{message:e.message}};}
  }};const admin={storage:{from:()=>({remove:async()=>({error:null})})},auth:{admin:{deleteUser:async()=>{authCalls++;return {error:null};}}}};
  const result=await workflow(client,admin);assert.equal(result.status,'error');assert.equal(result.cleanupStarted,true);assert.equal(authCalls,0);assert.equal(await count('auth.users',`id='${row.parent}'`),1);
 });
 await test('117 files are batched safely; Auth failure retries after completed file cleanup',async()=>{
  const row=await seed(1002);await auth(1002);await db.query("insert into storage.objects select 'parent-assets','bulk/'||n::text,$1::text,$1::text::uuid from generate_series(1,115)n",[row.parent]);
  const batches=[];let authCalls=0;const client={auth:{getUser:async()=>({data:{user:{id:row.parent}}})},rpc:async(name,args)=>{
   try{return {data:name==='ack_my_parent_erasure_files'?await ack(args.p_objects):name==='get_my_parent_deletion_storage_objects'?await pending():(await one(`select public.${name}() value`)).value,error:null};}catch(e){return {error:{message:e.message}};}
  }};const admin={storage:{from:bucket=>({remove:async paths=>{batches.push(paths.length);for(const name of paths)await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[bucket,name]);return {error:null};}})},auth:{admin:{deleteUser:async id=>{if(++authCalls===1)return {error:{status:500}};await db.query('delete from auth.users where id=$1',[id]);return {error:null};}}}};
  assert.equal((await workflow(client,admin)).status,'error');assert.deepEqual(batches.sort((a,b)=>a-b),[1,16,100]);assert.equal((await pending()).length,0);assert.equal(await count('auth.users',`id='${row.parent}'`),1);
  assert.equal((await workflow(client,admin)).status,'success');assert.equal(authCalls,2);assert.equal(batches.length,3);
 });
 await test('backend rejects unrelated capability errors/malformed enumeration; legacy missing function compatible',async()=>{
  for(const response of [{error:{code:'42501',message:'denied'}},{error:{code:'PGRST202',message:'unrelated function'}},{data:1,error:null}]){
   let writes=0;const result=await workflow({auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async()=>{writes++;return response;}},{});assert.equal(result.status,'error');assert.equal(writes,1);
  }
  let called=false;const client={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async name=>name==='get_my_parent_erasure_contract'?{data:null,error:{code:'PGRST202',message:'Could not find get_my_parent_erasure_contract'}}:name==='prepare_my_parent_account_deletion'?{data:'db_cleaned'}:{data:[]}};
  assert.equal((await workflow(client,{auth:{admin:{deleteUser:async()=>{called=true;return {error:null};}}}})).status,'success');assert(called);
  client.rpc=async name=>name==='get_my_parent_erasure_contract'?{data:2}:name==='prepare_my_parent_account_deletion'?{data:'db_cleaned'}:{data:[{object_name:'no_bucket'}]};
  called=false;assert.equal((await workflow(client,{auth:{admin:{deleteUser:async()=>{called=true;}}}})).status,'error');assert(!called);
 });
 await test('erased publication reads batch all IDs; errors fail closed and missing old RPC alone falls back',async()=>{
  const ids=Array.from({length:2001},(_,i)=>uid(900000+i)),batches=[];
  const flags=await readFlags({rpc:async(_name,{p_ids})=>{batches.push(p_ids.length);return {data:p_ids.map(application_id=>({application_id})),error:null};}},ids);
  assert.deepEqual(batches,[1000,1000,1]);assert.equal(flags.length,ids.length);
  for(const response of [{error:{code:'42501'}},{data:[{application_id:'foreign'}]},{data:null}])await assert.rejects(readFlags({rpc:async()=>response},ids));
  assert.equal((await readFlags({rpc:async()=>({error:{code:'PGRST202',message:'Could not find get_studio_erased_report_flags'}})},ids)).length,0);
 });
 await test('future confirmed booking and exact timestamps survive withdrawal; no auto cancellation',async()=>{
  const row=await seed(600,{published:false});await db.query("update public.trial_applications set status='confirmed',requested_slot_at='2027-01-01T04:00Z',confirmed_slot_at='2027-01-01T04:00Z',completed_at=null,registration_status='undecided' where id=$1",[row.app]);await auth(600);assert.equal(await prep(),'db_cleaned');
  const value=await one('select status,confirmed_slot_at,completed_at from public.trial_applications where id=$1',[row.app]);assert.equal(value.status,'confirmed');assert.equal(value.confirmed_slot_at.toISOString(),'2027-01-01T04:00:00.000Z');assert.equal(value.completed_at,null);
 });
 await test('retention preview excludes pending withdrawal/recent records; scheduler stays unavailable',async()=>{
  await auth(900,'service_role');const value=(await one('select public.preview_trial_privacy_retention($1,100) value',[uid(1)])).value;
  assert.equal(value.automaticExecutionAvailable,false);const erased=(await q('select id from public.trial_applications where privacy_erased_at is not null')).map(x=>x.id);assert(value.candidates.every(x=>!erased.includes(x.applicationId)));
 });
 await require(path.join(__dirname,'fixtures/trial-retention-cases.cjs'))({db,q,one,count,uid,auth,seed,test,workflow,repo});
 const output={syntheticOnly:true,productionApplied:false,checks,pass:checks.length,fail:0,limitations:['Synthetic schema with real immutable function bodies; not a production schema clone.','Storage provider failure/retry modeled via metadata; no actual cloud file removal.','No separate concurrent Postgres connections or live UI/account deletion verified.','Retention executor exists but all real activation scopes and schedule remain disabled.']};
 if(process.env.ERASURE_TEST_OUTPUT)fs.writeFileSync(process.env.ERASURE_TEST_OUTPUT,JSON.stringify(output,null,2)+'\n');console.log('ALL PASS '+checks.length);
}finally{await db.close();}})().catch(e=>{console.error(e.message,e.query||'');process.exitCode=1;});
