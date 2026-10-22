module.exports=async function({db,q,one,count,uid,auth,seed,test,workflow,repo}){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require(path.join(repo,'node_modules/typescript'));
 const root=process.env.ERASURE_IMPLEMENTATION_ROOT||repo;
 const expired=async row=>db.query("update public.trial_applications set requested_slot_at=now()-interval '13 months',confirmed_slot_at=now()-interval '13 months',completed_at=now()-interval '13 months' where id=$1",[row.app]);
 const prepare=async(org=uid(1),limit=10)=>(await one('select public.prepare_trial_privacy_retention_batch($1,$2) value',[org,limit])).value;
 const claim=async(org=uid(1))=>(await one('select public.claim_trial_privacy_retention_files($1) value',[org])).value;
 const ack=async c=>(await one('select public.ack_trial_privacy_retention_files($1,$2,$3,$4::jsonb) value',[uid(1),c.applicationId,c.leaseId,JSON.stringify(c.files)])).value;
 const remove=async files=>{for(const f of files)await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[f.bucket_id,f.object_name]);};
 const job=async row=>one('select * from app.trial_retention_jobs where application_id=$1',[row.app]);
 const docrow=async row=>one('select * from public.trial_applications where id=$1',[row.app]);
 let rpcCalls=[],storageCalls=0,failStorage=false;
 const allowed={list_trial_privacy_execution_scopes:[],prepare_trial_privacy_retention_batch:['p_org','p_limit'],claim_trial_privacy_retention_files:['p_org'],ack_trial_privacy_retention_files:['p_org','p_id','p_lease','p_objects'],release_trial_privacy_retention_lease:['p_org','p_id','p_lease']};
 const client={rpc:async(name,args={})=>{assert(name in allowed);rpcCalls.push(name);try{const keys=allowed[name],params=keys.map(k=>k==='p_objects'?JSON.stringify(args[k]):args[k]);const placeholders=keys.map((k,i)=>'$'+(i+1)+(k==='p_objects'?'::jsonb':'')).join(',');const rows=await q(`select ${name==='list_trial_privacy_execution_scopes'?'* from':'public.'}${name==='list_trial_privacy_execution_scopes'?' public.':''}${name}(${placeholders})${name==='list_trial_privacy_execution_scopes'?'':' value'}`,params);return {data:name==='list_trial_privacy_execution_scopes'?rows:rows[0].value,error:null};}catch(e){return {data:null,error:{message:e.message}};}},storage:{from:bucket=>({remove:async paths=>{storageCalls++;if(failStorage)return {error:{message:'SYNTHETIC PROVIDER DETAIL NOT FOR RESPONSE'}};await remove(paths.map(object_name=>({bucket_id:bucket,object_name})));return {error:null};}})}};
 const moduleLoad=(file,overrides={})=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Map,Set,Array,Number,Error,Date,Buffer,JSON,Request,Response,process:{env:{}},console:{error:()=>{}},require:name=>{if(name in overrides)return overrides[name];if(name==='server-only')return {};if(name==='node:crypto')return require('node:crypto');if(name==='@/integrations/supabase/service-role')return {getSupabaseServiceRoleClient:()=>{throw Error('No real client allowed');}};throw Error('Unexpected import '+name);}});return exports;};
 const run=moduleLoad('src/features/my/server/trial-privacy-retention.ts').runTrialPrivacyRetention;
 await auth(null,'service_role');
 await test('TTL defaults: no execution scopes; private queue tables remain inaccessible to service role',async()=>{
  assert.deepEqual(await q('select * from public.list_trial_privacy_execution_scopes()'),[]);
  await assert.rejects(prepare(),/privacy_execution_disabled/);await db.exec('set role service_role');await assert.rejects(db.query('select * from app.trial_retention_jobs'),/permission denied/);await db.exec('reset role');
 });
 await test('TTL worker OFF creates no DB/Storage/Auth clients or calls',async()=>{
  const result=await run();assert.equal(result.enabled,false);assert.equal(rpcCalls.length,0);assert.equal(storageCalls,0);
 });
 await db.query('insert into app.trial_privacy_execution_scopes(organization_id,enabled) values($1,true)',[uid(1)]);
 await db.query('insert into public.classes values($1,$2)',[uid(3),uid(4)]);
 await db.exec('alter table public.sms_logs add column created_by uuid references public.profiles(id) on delete set null');
 const a=await seed(2000),b=await seed(2001),other=await seed(2002);await expired(a);await db.query('update public.sms_logs set created_by=$1 where trial_application_id=$2',[a.parent,a.app]);await expired(other);await db.query('update public.trial_applications set class_id=$1 where id=$2',[uid(3),other.app]);
 await test('TTL only expired in enabled organization; recent and other-tenant content unchanged',async()=>{
  const beforeOther=await docrow(other),result=await prepare();assert.equal(result.prepared,1);assert.equal(result.blocked,0);assert.equal((await docrow(a)).child_name,null);assert.equal((await docrow(b)).child_name,'PRIVATE_CHILD');assert.deepEqual(await docrow(other),beforeOther);
  assert.equal(await count('public.experience_reports',`application_id='${a.app}'`),0);assert.equal(await count('public.consultation_logs',`application_id='${a.app}'`),0);
 });
 await test('TTL retains active account, child profile, own avatar, real booking and registration facts',async()=>{
  assert.equal(await count('auth.users',`id='${a.parent}'`),1);assert.equal(await count('public.profiles',`id='${a.parent}'`),1);assert.equal(await count('public.children',`id='${a.child}'`),1);
  assert.equal(await count('storage.objects',`name='parent/${a.parent}.jpg'`),1);assert.equal((await docrow(a)).registration_status,'enrolled');assert.equal((await docrow(a)).status,'completed');assert.equal((await one('select result from public.registration_results where application_id=$1',[a.app])).result,'enrolled');assert.equal((await job(a)).state,'db_cleaned');assert.equal((await one('select created_by from public.sms_logs where trial_application_id=$1',[a.app])).created_by,null);
 });
 let first;
 await test('TTL lease is exclusive; live Storage forbids ACK and Auth deletion',async()=>{
  first=await claim();assert.equal(first.applicationId,a.app);assert.equal((await claim()),null);await assert.rejects(ack(first),/privacy_storage_not_removed/);await assert.rejects(db.query('delete from auth.users where id=$1',[a.parent]),/privacy_storage_pending/);
 });
 await test('TTL foreign organization, forged/expired lease and unrelated path ACK rejected',async()=>{
  await assert.rejects(db.query('select public.ack_trial_privacy_retention_files($1,$2,$3,$4::jsonb)',[uid(1),a.app,uid(99999),JSON.stringify(first.files)]),/privacy_lease_invalid/);
  await assert.rejects(ack({...first,files:[{bucket_id:'report-attachments',object_name:'foreign'}]}),/privacy_file_scope_forbidden/);
  await db.query('insert into app.trial_privacy_execution_scopes(organization_id,enabled) values($1,true)',[uid(4)]);
  await assert.rejects(db.query('select public.ack_trial_privacy_retention_files($1,$2,$3,$4::jsonb)',[uid(4),a.app,first.leaseId,JSON.stringify(first.files)]),/privacy_lease_invalid/);
 });
 await test('TTL acknowledged completion clears parent link/file paths; never deletes Auth',async()=>{
  await remove(first.files);assert.equal(await ack(first),true);assert.equal(await job(a),undefined);assert.equal(await docrow(a),undefined);assert.equal(await count('app.trial_retention_files',`application_id='${a.app}'`),0);assert.equal(await count('auth.users',`id='${a.parent}'`),1);await assert.rejects(ack(first),/privacy_lease_invalid/);
 });
 await db.query('update app.trial_privacy_execution_scopes set enabled=false where organization_id=$1',[uid(4)]);
 const hold=await seed(2010),pending=await seed(2011),future=await seed(2012),open=await seed(2013);
 for(const r of [hold,pending,future,open])await expired(r);
 await db.query("insert into app.trial_privacy_holds values($1,'statutory_record','SPECIFIC_BASIS',now()+interval '1 day',$2,now())",[hold.app,uid(900)]);
 await db.query("insert into app.parent_account_deletions(parent_id,state) values($1,'processing')",[pending.parent]);
 await db.query("update public.trial_applications set confirmed_slot_at=now()+interval '1 day' where id=$1",[future.app]);await db.query("update public.trial_applications set status='new' where id=$1",[open.app]);
 await test('TTL excludes legal hold, pending withdrawal, future booking and old open application',async()=>{
  assert.equal((await prepare()).prepared,0);for(const r of [hold,pending,future,open]){assert.equal((await docrow(r)).child_name,'PRIVATE_CHILD');assert.equal(await job(r),undefined);}
 });
 const upload=await seed(2020,{uploading:true}),healthy=await seed(2021);await expired(upload);await expired(healthy);
 await test('TTL per-record savepoint rolls back blocked upload while another eligible record completes DB cleanup',async()=>{
  const result=await prepare();assert.equal(result.prepared,1);assert.equal(result.blocked,1);assert.equal((await job(upload)).state,'blocked');assert.equal((await job(upload)).last_error,'upload_in_progress');assert.equal((await docrow(upload)).child_name,'PRIVATE_CHILD');assert.equal((await docrow(healthy)).child_name,null);assert.equal(await count('app.privacy_erasure_context'),0);
 });
 await test('TTL provider failure leaves lease retry/queue intact; next successful run completes files',async()=>{
  failStorage=true;const result=await run({enabled:true,client});assert(result.errors>=1);assert.equal((await job(healthy)).state,'db_cleaned');assert.equal((await job(healthy)).last_error,'storage_retry');assert.equal((await job(healthy)).parent_id,healthy.parent);
  failStorage=false;await db.query("update app.trial_retention_jobs set retry_after=now()-interval '1 minute' where application_id=$1",[healthy.app]);const retry=await run({enabled:true,client});assert.equal(retry.errors,0);assert.equal(await job(healthy),undefined);assert.equal(await docrow(healthy),undefined);
 });
 const takeover=await seed(2030);await expired(takeover);await prepare();
 await test('TTL pending photos transfer into self-withdrawal and finish before Auth deletion',async()=>{
  await auth(2030);assert.equal((await one('select public.prepare_my_parent_account_deletion() value')).value,'db_cleaned');const files=await q('select * from public.get_my_parent_deletion_storage_objects()');assert(files.some(f=>f.object_name===`academy/${takeover.file}.jpg`));assert(files.some(f=>f.object_name===`parent/${takeover.parent}.jpg`));
  await assert.rejects(db.query('delete from auth.users where id=$1',[takeover.parent]),/privacy_storage_pending/);await remove(files);assert.equal((await one('select public.ack_my_parent_erasure_files($1::jsonb) value',[JSON.stringify(files)])).value,true);assert.equal(await job(takeover),undefined);assert.equal(await docrow(takeover),undefined);await db.query('delete from auth.users where id=$1',[takeover.parent]);assert.equal(await count('auth.users',`id='${takeover.parent}'`),0);
 });
 await auth(null,'service_role');const stale=await seed(2040);await expired(stale);await prepare();let lease=await claim();assert.equal(lease.applicationId,stale.app);
 await test('TTL crashed lease expires, new claim rejects old ACK without losing file tasks',async()=>{
  await db.query("update app.trial_retention_jobs set lease_until=now()-interval '1 minute' where application_id=$1",[stale.app]);const next=await claim();assert.notEqual(next.leaseId,lease.leaseId);await assert.rejects(ack(lease),/privacy_lease_invalid/);await remove(next.files);assert.equal(await ack(next),true);
 });
 const detached=await seed(2050);await expired(detached);await db.query('update public.trial_applications set parent_id=null,child_id=null where id=$1',[detached.app]);
 await test('TTL historical detached record is scoped by expiry, not guessed parent identity',async()=>{
  await prepare();assert.equal((await docrow(detached)).child_name,null);assert.equal((await job(detached)).parent_id,null);assert.equal((await one('select actor_id from public.application_logs where application_id=$1',[detached.app])).actor_id,null);const c=await claim();await remove(c.files);await ack(c);
 });
 await test('TTL missing terminal timestamp/unknown state never becomes a destructive candidate',async()=>{
  const missing=await seed(2060);await db.query('update public.trial_applications set completed_at=null where id=$1',[missing.app]);await prepare();assert.equal((await docrow(missing)).child_name,'PRIVATE_CHILD');assert.equal(await job(missing),undefined);assert((await prepare()).needsReview>=1);
 });
 const bulk=await seed(2070);await expired(bulk);
 for(let i=0;i<105;i++){const file=uid(700000+i),name=`bulk/${file}`;await db.query("insert into public.report_attachment_files(id,application_id,object_path,state,created_by) values($1,$2,$3,'failed',$4)",[file,bulk.app,name,uid(900)]);await db.query("insert into storage.objects values('report-attachments',$1,$2::text,$2::text::uuid)",[name,uid(900)]);}
 await test('TTL 106 report/orphan files span bounded leases without dropping remaining tasks',async()=>{
  await prepare();const first=await claim();assert.equal(first.files.length,100);await remove(first.files);assert.equal(await ack(first),false);assert.equal((await job(bulk)).state,'db_cleaned');const second=await claim();assert.equal(second.files.length,6);await remove(second.files);assert.equal(await ack(second),true);assert.equal(await job(bulk),undefined);assert.equal(await docrow(bulk),undefined);
 });
 await test('TTL permanent schema exception remains visible as needsReview on later batches',async()=>{
  const row=await seed(2080);await expired(row);await db.exec("alter table public.trial_applications add column unsupported_private text not null default 'PRIVATE_UNKNOWN'");
  const result=await prepare();assert.equal(result.blocked,1);assert(result.needsReview>=1);assert.equal((await docrow(row)).child_name,'PRIVATE_CHILD');assert.equal((await job(row)).parent_id,null);assert.equal((await job(row)).retry_after,null);
  const again=await prepare();assert.equal(again.blocked,0);assert(again.needsReview>=1);assert((await run({enabled:true,client})).needsReview>=1);await db.exec('alter table public.trial_applications drop column unsupported_private');
 });
 await test('TTL completion removes per-application rows and stores only organization/month counters',async()=>{
  for(const t of ['public.trial_applications','public.registration_results','public.application_logs','public.sms_logs','app.erased_trial_metrics','app.trial_retention_jobs','app.parent_erasure_trials'])
   assert.equal(await count(t,`${t==='public.trial_applications'?'id':t==='public.sms_logs'?'trial_application_id':'application_id'}='${a.app}'`),0,t);
  const columns=(await q("select column_name from information_schema.columns where table_schema='app' and table_name='trial_monthly_retention_totals' order by ordinal_position")).map(r=>r.column_name);
  assert.deepEqual(columns,['organization_id','terminal_month','applications','completed','canceled','no_show','enrolled','not_enrolled','unresolved','published_reports']);
  const before=await q('select * from app.trial_monthly_retention_totals order by organization_id,terminal_month');
  await assert.rejects(ack(first),/privacy_lease_invalid/);await prepare();assert.deepEqual(await q('select * from app.trial_monthly_retention_totals order by organization_id,terminal_month'),before);
 });
 await test('TTL cannot alter status or introduce a hold after destructive processing starts',async()=>{
  const row=await seed(2090);await expired(row);await prepare();
  await assert.rejects(db.query("update public.trial_applications set status='confirmed',confirmed_slot_at=now()+interval '1 day' where id=$1",[row.app]),/privacy_retention_in_progress/);
  await assert.rejects(db.query("insert into app.trial_privacy_holds values($1,'active_dispute','SPECIFIC_BASIS',now()+interval '1 day',$2,now())",[row.app,uid(900)]),/privacy_erasure_already_started/);
  const c=await claim();await remove(c.files);await ack(c);
 });
 await test('TTL unknown cascading FK blocks all preparation before erasure',async()=>{
  const row=await seed(2100);await expired(row);
  await db.exec('create table public.unreviewed_private_reference(application_id uuid references public.trial_applications on delete cascade,private_note text)');
  await db.query("insert into public.unreviewed_private_reference values($1,'PRIVATE_UNKNOWN')",[row.app]);
  const result=await prepare();assert.equal(result.blocked,1);assert.equal((await docrow(row)).child_name,'PRIVATE_CHILD');assert.equal(await count('public.experience_reports',`application_id='${row.app}'`),1);
  await db.exec('drop table public.unreviewed_private_reference');
 });
 await test('TTL aggregate rolls back with a late deletion failure; retry counts exactly once',async()=>{
  const row=await seed(2110);await expired(row);await prepare();const c=await claim();await remove(c.files);
  await db.exec("create function public.synthetic_stop_delete() returns trigger language plpgsql as $$begin raise exception 'synthetic_delete_failed';end$$;create trigger z_synthetic_stop_delete before delete on public.trial_applications for each row execute function public.synthetic_stop_delete()");
  const before=Number((await one('select coalesce(sum(applications),0) n from app.trial_monthly_retention_totals')).n);
  await assert.rejects(ack(c),/synthetic_delete_failed/);assert(await docrow(row));assert.equal((await job(row)).state,'db_cleaned');assert.equal(Number((await one('select coalesce(sum(applications),0) n from app.trial_monthly_retention_totals')).n),before);
  assert.equal(await count('app.privacy_erasure_context'),0);
  await db.exec('drop trigger z_synthetic_stop_delete on public.trial_applications;drop function public.synthetic_stop_delete()');
  assert.equal(await ack(c),true);assert.equal(Number((await one('select sum(applications) n from app.trial_monthly_retention_totals')).n),before+1);
 });
 await test('withdrawn expired records wait for self file/Auth cleanup, then purge normally',async()=>{
  const row=await seed(2120);await expired(row);await auth(2120);await one('select public.prepare_my_parent_account_deletion()');
  await auth(null,'service_role');const result=await prepare();assert.equal(result.prepared,0);assert(await docrow(row));
  await auth(2120);const files=await q('select * from public.get_my_parent_deletion_storage_objects()');await remove(files);await one('select public.ack_my_parent_erasure_files($1::jsonb)',[JSON.stringify(files)]);await db.query('delete from auth.users where id=$1',[row.parent]);
  await auth(null,'service_role');const preview=(await one('select public.preview_trial_privacy_retention($1,1000) value',[uid(1)])).value;assert(preview.candidates.some(c=>c.applicationId===row.app));
  assert.equal((await prepare()).prepared,1);assert.equal(await docrow(row),undefined);assert.equal(await job(row),undefined);
 });
 await test('monthly aggregate uses current actual registration result, not parent intent or stale history',async()=>{
  const before=(await one('select coalesce(sum(applications),0)::int n,coalesce(sum(enrolled),0)::int enrolled,coalesce(sum(not_enrolled),0)::int declined,coalesce(sum(unresolved),0)::int unresolved from app.trial_monthly_retention_totals'));
  const row=await seed(2130);await expired(row);
  await db.query("update public.registration_results set superseded_at=now() where application_id=$1",[row.app]);
  await db.query("insert into public.registration_results(application_id,result) values($1,'not_enrolled')",[row.app]);
  const undecided=await seed(2131,{published:false});await expired(undecided);await db.query('delete from public.registration_results where application_id=$1',[undecided.app]);
  await prepare();for(let i=0;i<2;i++){const c=await claim();await remove(c.files);await ack(c);}
  const after=await one('select sum(applications)::int n,sum(enrolled)::int enrolled,sum(not_enrolled)::int declined,sum(unresolved)::int unresolved from app.trial_monthly_retention_totals');
  assert.equal(after.n,before.n+2);assert.equal(after.enrolled,before.enrolled);assert.equal(after.declined,before.declined+1);assert.equal(after.unresolved,before.unresolved+1);
 });
 await test('aggregate month is terminal Seoul month and tenant is isolated',async()=>{
  const row=await seed(2140,{published:false});await db.query("update public.trial_applications set class_id=$1,status='canceled',canceled_at='2020-01-31T15:30Z' where id=$2",[uid(3),row.app]);await db.query('update app.trial_privacy_execution_scopes set enabled=true where organization_id=$1',[uid(4)]);
  await prepare(uid(4));let c;while(c=await claim(uid(4))){await remove(c.files);await one('select public.ack_trial_privacy_retention_files($1,$2,$3,$4::jsonb)',[uid(4),c.applicationId,c.leaseId,JSON.stringify(c.files)]);}
  const total=await one("select * from app.trial_monthly_retention_totals where organization_id=$1 and terminal_month='2020-02-01'",[uid(4)]);assert.equal(Number(total.applications),1);assert.equal(Number(total.canceled),1);assert.equal(Number(total.published_reports),0);
  assert.equal(await count('app.trial_monthly_retention_totals',`organization_id='${uid(1)}' and terminal_month='2020-02-01'`),0);
  await db.query('update app.trial_privacy_execution_scopes set enabled=false where organization_id=$1',[uid(4)]);
 });
 await test('final purge deletes historical booking block, preserves reusable class schedule and unrelated booking',async()=>{
  const row=await seed(2150);await expired(row);await db.query("insert into public.schedule_blocks values($1,$2,'trial_booked'),($3,null,'available')",[uid(900001),row.app,uid(900002)]);await db.query('update public.trial_applications set confirmed_schedule_block_id=$1 where id=$2',[uid(900001),row.app]);
  await prepare();const c=await claim();await remove(c.files);await ack(c);assert.equal(await count('public.schedule_blocks',`id='${uid(900001)}'`),0);assert.equal(await count('public.schedule_blocks',`id='${uid(900002)}'`),1);
 });
 await test('source-linked notification reads and confirmed push attempts are erased, unrelated reads survive',async()=>{
  await db.exec(`alter table public.application_logs add column id uuid default gen_random_uuid();alter table public.parent_notification_reads add column notification_key text;alter table public.parent_event_push_deliveries add column notification_key text;create table public.parent_confirmed_push_deliveries(application_id uuid references public.trial_applications on delete cascade,attempts jsonb);`);
  const row=await seed(2160);await expired(row);
  const log=await one('select id from public.application_logs where application_id=$1',[row.app]);
  await db.query("insert into public.parent_notification_reads values($1,$2),($1,$3),($1,'UNRELATED_KEY')",[row.parent,'status:'+log.id,'report_published:'+row.report]);
  await db.query("insert into public.parent_confirmed_push_deliveries values($1,'[{\"token\":\"PRIVATE_TOKEN\"}]')",[row.app]);
  await prepare();assert.equal(await count('public.parent_notification_reads',`notification_key in ('status:${log.id}','report_published:${row.report}')`),0);assert.equal(await count('public.parent_notification_reads',"notification_key='UNRELATED_KEY'"),1);assert.equal(await count('public.parent_confirmed_push_deliveries',`application_id='${row.app}'`),0);
  const c=await claim();await remove(c.files);await ack(c);assert.equal(await docrow(row),undefined);
 });
 await test('unknown downstream report FK blocks preparation before any cascade',async()=>{
  const row=await seed(2170);await expired(row);await db.exec('create table public.unreviewed_report_link(report_id uuid references public.experience_reports on delete cascade)');await db.query('insert into public.unreviewed_report_link values($1)',[row.report]);
  const result=await prepare();assert.equal(result.blocked,1);assert.equal((await docrow(row)).child_name,'PRIVATE_CHILD');assert.equal(await count('public.unreviewed_report_link'),1);await db.exec('drop table public.unreviewed_report_link');
 });
 await test('production confirmed-state constraint and booking guard permit only the final purge detach',async()=>{
  await db.exec('alter table public.trial_applications add column assigned_teacher_id uuid;alter table public.trial_applications add column class_schedule_id uuid');
  const row=await seed(2180);await expired(row);await db.query("insert into public.schedule_blocks values($1,$2,'trial_booked')",[uid(900003),row.app]);await db.query('update public.trial_applications set confirmed_schedule_block_id=$1,assigned_teacher_id=$2 where id=$3',[uid(900003),uid(900),row.app]);
  await db.exec("alter table public.trial_applications add constraint trial_applications_confirmed_state_check CHECK ((((confirmed_slot_at IS NULL) AND (confirmed_schedule_block_id IS NULL)) OR ((confirmed_slot_at IS NOT NULL) AND (confirmed_schedule_block_id IS NOT NULL) AND (status = ANY (ARRAY['confirmed'::text, 'completed'::text]))) OR ((confirmed_slot_at IS NOT NULL) AND (confirmed_schedule_block_id IS NULL) AND (assigned_teacher_id IS NULL) AND (class_schedule_id IS NOT NULL) AND (status = ANY (ARRAY['confirmed'::text, 'completed'::text]))))) not valid");
  await prepare();const c=await claim();assert.equal(c.applicationId,row.app);
  // The prior detach statement violates the REAL production CHECK. No writes survive.
  await db.exec('begin');await db.query("insert into app.privacy_erasure_context(application_id,transaction_id,mode) values($1,txid_current(),'purge')",[row.app]);
  await assert.rejects(db.query('update public.trial_applications set requested_schedule_block_id=null,confirmed_schedule_block_id=null where id=$1',[row.app]),/trial_applications_confirmed_state_check/);await db.exec('rollback');
  // Attach the actual production function, patched only for the private purge context.
  await db.exec('create trigger zz_real_booking_guard before update on public.trial_applications for each row execute function app.enforce_date_booking_application()');
  await remove(c.files);assert.equal(await ack(c),true);assert.equal(await docrow(row),undefined);assert.equal(await count('public.schedule_blocks',`id='${uid(900003)}'`),0);assert.equal(await count('app.privacy_erasure_context'),0);
  await db.exec('drop trigger zz_real_booking_guard on public.trial_applications');
 });
 await test('aggregate tables never grant parent/academy raw access or allow caller writes',async()=>{
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from app.trial_monthly_retention_totals'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');await assert.rejects(db.query('delete from app.trial_monthly_retention_totals'),/permission denied/);await db.exec('reset role');
 });
 await test('TTL calendar-month expiry keeps exact boundary, leap year and service timezone',async()=>{
  const classify=async(clock)=>(await one("select app.classify_trial_privacy_retention('completed','2024-02-29T15:10:00Z',null,null,null,null,$1) value",[clock])).value;
  const before=await classify('2025-02-28T15:09:59Z'),at=await classify('2025-02-28T15:10:00Z');assert.equal(before.eligible,false);assert.equal(at.eligible,true);
  await db.exec("set timezone='America/New_York'");const other=await classify('2025-02-28T15:10:00Z');assert.equal(Date.parse(at.dueAt),Date.parse(other.dueAt));await db.exec("set timezone='UTC'");
 });
 await test('TTL worker deadline and malformed claims stop work without deleting unvalidated objects',async()=>{
  let calls=0;await run({enabled:true,client,now:()=>calls++===0?0:50000});assert.equal(calls,2);
  let removes=0;const fake={rpc:async name=>name==='list_trial_privacy_execution_scopes'?{data:[{organization_id:uid(1)}]}:name==='prepare_trial_privacy_retention_batch'?{data:{prepared:0,blocked:0,needsReview:0,busy:false}}:{data:{applicationId:uid(1),leaseId:uid(2),files:[{object_name:'no-bucket'}]}},storage:{from:()=>({remove:async()=>{removes++;return {};}})}};
  assert.equal((await run({enabled:true,client:fake})).errors,1);assert.equal(removes,0);
 });
 await test('TTL RPC grants prevent authenticated/anon callers even with a forged service claim',async()=>{
  for(const role of ['authenticated','anon']){await db.exec('set role '+role);await assert.rejects(db.query('select public.prepare_trial_privacy_retention_batch($1,10)',[uid(1)]),/permission denied/);await db.exec('reset role');}
  await auth(2001);await assert.rejects(prepare(),/privacy_service_required/);await auth(null,'service_role');
 });
 await test('TTL cron route requires its secret before OFF handling and never returns provider details',async()=>{
  const globals={env:{CRON_SECRET:'SYNTHETIC_CRON'}};let called=0;const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'app/api/cron/trial-privacy-retention/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,process:globals,console:{error:()=>{},info:()=>{}},require:name=>name==='node:crypto'?require('node:crypto'):name==='next/server'?{NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),init)}}:name.includes('trial-privacy-retention-monitor')?{retentionRunReport:()=>({status:'attention'}),sendRetentionAttention:async()=>'disabled'}:{runTrialPrivacyRetention:async()=>{called++;throw Error('PRIVATE_PROVIDER_INFO');}}});
  assert.equal((await exports.GET(new Request('https://example.test/api/cron/trial-privacy-retention'))).status,401);assert.equal(called,0);
  const response=await exports.GET(new Request('https://example.test/api/cron/trial-privacy-retention',{headers:{authorization:'Bearer SYNTHETIC_CRON'}}));assert.equal(response.status,503);assert(!JSON.stringify(await response.json()).includes('PRIVATE_PROVIDER_INFO'));
 });
};
