// Actual TS orchestration/transport/actions; all external HTTP, SMS and DB calls are inert fixtures.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const env={PARENT_SCHEDULE_CONFIRMED_PUSH_ENABLED:'true'};
function load(file,deps={}) { const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,require:n=>{if(n==='server-only')return {};if(n in deps)return deps[n];throw Error('unmocked '+n)},process:{env},console:{warn(){},info(){},error(){}},fetch:request,AbortSignal,Date,URL,Response,JSON,structuredClone});return exports; }
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clone=x=>JSON.parse(JSON.stringify(x));
let jobs,devices,httpCalls,alimtalkCalls,smsCalls,sentBatches,sendMode,receiptMode,legacyStatus,testScope;
const context={eventType:'trial_schedule_confirmed',trialApplicationId:uuid(30),parentId:uuid(1),organizationId:uuid(5)};
function reset(){jobs=[{id:uuid(50),notification_key:'status:'+uuid(50),application_id:uuid(30),parent_id:uuid(1),state:'pending',attempts:[],suppress_legacy:false,created_at:new Date().toISOString(),next_check_at:new Date(0).toISOString()}];devices=[{id:uuid(20),parent_id:uuid(1),platform:'ios',enabled:true,permission_status:'granted',expo_push_token:'ExpoPushToken[fixtureToken20]'},{id:uuid(21),parent_id:uuid(1),platform:'android',enabled:true,permission_status:'granted',expo_push_token:'ExpoPushToken[fixtureToken21]'},{id:uuid(22),parent_id:uuid(2),platform:'ios',enabled:true,permission_status:'granted',expo_push_token:'ExpoPushToken[foreignToken22]'}];httpCalls=0;alimtalkCalls=0;smsCalls=0;sentBatches=[];sendMode='accepted';receiptMode='ok';legacyStatus='sent';testScope=false;}
async function request(url,options){
 const body=JSON.parse(options.body);
 if(url.endsWith('/send')){
  httpCalls++;sentBatches.push(body);
  assert(body.every(x=>x.data.type==='schedule_confirmed'&&x.data.path==='/notifications'&&x.data.notificationId==='status:'+uuid(50)));
  assert(!JSON.stringify(body).includes('foreignToken22'));
  if(sendMode==='timeout')throw Error('timeout');
  if(sendMode==='500')return new Response('',{status:500});
  if(sendMode==='malformed')return Response.json({data:[]});
  return Response.json({data:body.map((x,i)=>sendMode==='reject'?{status:'error',details:{error:'DeviceNotRegistered'}}:{status:'ok',id:'ticket-'+i})});
 }
 assert(url.endsWith('/getReceipts'));
 if(receiptMode==='timeout')throw Error('timeout');
 return Response.json({data:Object.fromEntries(body.ids.flatMap((id,i)=>receiptMode==='pending'?[]:[[id,receiptMode==='error'||receiptMode==='mixed'&&i===1?{status:'error',details:{error:'DeviceNotRegistered'}}:{status:'ok'}]]))});
}
const db={
 rpc:async(name,args)=>{assert.equal(name,'claim_confirmed_push');const j=jobs.find(x=>x.id===args.p_id);if(!j)return {data:[]};
  if(args.p_operation==='send'&&j.state==='pending'){j.state='sending';j.attempts=devices.filter(d=>d.parent_id===j.parent_id&&d.enabled&&d.permission_status==='granted').map(d=>({deviceId:d.id,platform:d.platform,token:d.expo_push_token,sendStatus:'reserved'}));return {data:[clone(j)]};}
  if(args.p_operation==='receipts'&&j.state==='receipts'){j.state='checking';return {data:[clone(j)]};}
  if(args.p_operation==='fallback'&&j.state==='fallback_ready'){j.state='fallback_sending';return {data:[clone(j)]};}
  return {data:[]};},
 from(name){let operation='select',values,filters=[],single=false,limit=100;
  const q={select(){return q},update(v){operation='update';values=v;return q},eq(k,v){filters.push(x=>x[k]===v);return q},in(k,v){filters.push(x=>v.includes(x[k]));return q},lte(k,v){filters.push(x=>x[k]<=v);return q},order(){return q},limit(n){limit=n;return q},maybeSingle(){single=true;return q},
   then(resolve,reject){try{let rows=name==='parent_confirmed_push_deliveries'?jobs:name==='parent_push_devices'?devices:name==='trial_applications'?[{id:uuid(30),parent_id:uuid(1),status:'confirmed',classes:{title:'private title',organization_id:uuid(5),organizations:{name:'private academy'}}}]:[];rows=rows.filter(x=>filters.every(f=>f(x))).slice(0,limit);if(operation==='update')rows.forEach(x=>Object.assign(x,clone(values)));return Promise.resolve({data:clone(single?rows[0]??null:rows),error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;}
};
const transport=load('src/features/notifications/push/confirmed-transport.ts');
const legacy=load('src/features/notifications/alimtalk/send-parent-notification.ts',{
 '../lib/parent-account-recipient':{hasLiveParentAccountRecipient:async()=>true},
 '@/features/notifications/alimtalk/send-alimtalk':{sendAlimtalk:async()=>{alimtalkCalls++;return {status:legacyStatus};}},
 '@/features/notifications/sms/log-sms-event':{logSmsEventSafely:async()=>{smsCalls++;return {status:'sent'};}}
});
const policy={confirmedPushEnabled:()=>env.PARENT_SCHEDULE_CONFIRMED_PUSH_ENABLED==='true',isConfirmedPushTestApplication:async()=>testScope};
const service=load('src/features/notifications/push/confirmed-delivery.ts',{'@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>db},'../alimtalk/send-parent-notification':legacy,'./confirmed-policy':policy,'./confirmed-transport':transport});
let checks=0;const pass=s=>{checks++;console.log('PASS '+s)};
const poll=async()=>{jobs[0].next_check_at=new Date(0).toISOString();await service.runConfirmedPushWork();};
(async()=>{
 reset();await Promise.all([service.sendConfirmedApplicationSafely(context),service.sendConfirmedApplicationSafely(context)]);
 assert.equal(httpCalls,1);assert.equal(sentBatches[0].length,2);assert.equal(alimtalkCalls,0);assert.equal(jobs[0].state,'receipts');await poll();assert.equal(jobs[0].state,'delivered');assert.equal(smsCalls,0);pass('normal confirmation routes only its Parent iOS/Android once; accepted != receipt; no parallel legacy');
 reset();receiptMode='mixed';await service.sendConfirmedApplicationSafely(context);await poll();assert.equal(jobs[0].state,'delivered');assert.equal(alimtalkCalls,0);assert.equal(devices.find(d=>d.id===uuid(21)).enabled,false);pass('one successful device suppresses Parent fallback; only failed token disabled');
 reset();receiptMode='error';legacyStatus='failed';await service.sendConfirmedApplicationSafely(context);await poll();await poll();assert.equal(alimtalkCalls,1);assert.equal(smsCalls,1);assert.equal(jobs[0].state,'fallback_done');assert.equal(httpCalls,1);pass('all accepted tickets later fail -> existing Alimtalk then SMS exactly once');
 reset();devices=devices.filter(d=>d.parent_id!==uuid(1));await service.sendConfirmedApplicationSafely(context);assert.equal(httpCalls,0);assert.equal(alimtalkCalls,1);pass('no eligible device -> legacy fallback');
 reset();devices.filter(d=>d.parent_id===uuid(1)).forEach(d=>{d.enabled=false;d.permission_status='denied'});await service.sendConfirmedApplicationSafely(context);assert.equal(httpCalls,0);assert.equal(alimtalkCalls,1);pass('disabled/denied registrations excluded');
 reset();sendMode='reject';await service.sendConfirmedApplicationSafely(context);assert.equal(alimtalkCalls,1);assert(devices.filter(d=>d.parent_id===uuid(1)).every(d=>!d.enabled));pass('explicit rejection -> legacy once and invalid token disabled');
 for(const mode of ['timeout','500','malformed']){reset();sendMode=mode;await service.sendConfirmedApplicationSafely(context);await service.sendConfirmedApplicationSafely(context);await poll();assert.equal(httpCalls,1);assert.equal(alimtalkCalls,0);assert.equal(jobs[0].state,'unknown');}pass('ambiguous send is durable unknown: no automatic resend/fallback');
 reset();receiptMode='pending';await service.sendConfirmedApplicationSafely(context);await poll();assert.equal(jobs[0].state,'receipts');assert.equal(alimtalkCalls,0);jobs[0].created_at=new Date(Date.now()-25*3600000).toISOString();await poll();assert.equal(jobs[0].state,'unknown');assert.equal(alimtalkCalls,0);pass('missing/expired receipt never treated as confirmed failure or user read');
 reset();receiptMode='error';await service.sendConfirmedApplicationSafely(context);devices[0].expo_push_token='ExpoPushToken[rotatedToken20]';await poll();assert.equal(devices[0].enabled,true);pass('late invalid receipt cannot disable a rotated token');
 reset();jobs[0].suppress_legacy=true;sendMode='reject';await service.sendConfirmedApplicationSafely(context);assert.equal(jobs[0].state,'test_suppressed');assert.equal(alimtalkCalls+smsCalls,0);pass('specific E2E fixture never calls real legacy transport');
 reset();for(const eventType of ['trial_report_published','trial_feedback_reminder','schedule_changed'])await service.sendConfirmedApplicationSafely({...context,eventType});assert.equal(httpCalls+alimtalkCalls,0);pass('other event types never enter the confirmed sender');
 reset();env.PARENT_SCHEDULE_CONFIRMED_PUSH_ENABLED='false';await service.sendConfirmedApplicationSafely(context);assert.equal(alimtalkCalls,1);assert.equal(httpCalls,0);env.PARENT_SCHEDULE_CONFIRMED_PUSH_ENABLED='true';pass('event deployment gate OFF preserves legacy');
 // Actual server action with inert adapter proves only successful RPC schedules side effects.
 let status='new',logs=[],callbacks=[],failMutation=false,afterThrows=false;
 const action=load('src/features/studio/actions/update-application-status.ts',{
  'next/cache':{revalidatePath(){}},'next/server':{after:cb=>{if(afterThrows)throw Error('scheduler');callbacks.push(cb)}},
  '@/features/notifications/push/confirmed-delivery':service,
  '@/features/notifications/alimtalk/send-parent-notification':legacy,
  '@/features/notifications/sms/send-studio-notification':{sendStudioNotificationSafely:async()=>null},
  '@/features/studio/lib/require-teacher-studio-access':{requireTeacherStudioAccess:async()=>({id:uuid(3),organizationId:uuid(5)})},
  '@/shared/lib/db':{dataAdapter:{getStudioApplicationDetail:async()=>({id:uuid(30),parentId:uuid(1),status,assignedTeacherId:null,updatedAt:'version'}),updateStudioApplicationStatus:async()=>{if(failMutation)throw Error('application_status_conflict');status='confirmed';logs.push({id:uuid(50),toStatus:'confirmed'})}}}
 });
 const form=new FormData();form.set('actionType','move_to_confirmed');reset();sendMode='timeout';
 assert.equal((await action.updateApplicationStatusAction(uuid(30),undefined,form)).status,'success');assert.equal(httpCalls,0);assert.equal(logs.length,1);await callbacks.shift()();assert.equal(status,'confirmed');assert.equal(logs.length,1);assert.equal(httpCalls,1);
 assert.equal((await action.updateApplicationStatusAction(uuid(30),undefined,form)).status,'error');assert.equal(callbacks.length,0);pass('actual confirmation action commits inbox fact before deferred Push; failure/re-request cannot undo or duplicate');
 status='new';failMutation=true;assert.equal((await action.updateApplicationStatusAction(uuid(30),undefined,form)).status,'error');assert.equal(callbacks.length,0);failMutation=false;afterThrows=true;
 assert.equal((await action.updateApplicationStatusAction(uuid(30),undefined,form)).status,'success');pass('failed confirmation sends nothing; deferred-scheduler failure cannot report committed schedule as failed');
 const cron=load('app/api/cron/schedule-confirmed-push/route.ts',{'next/server':{NextResponse:Response},'@/features/notifications/push/confirmed-delivery':{runConfirmedPushWork:async()=>({processed:0})}});
 assert.equal((await cron.GET(new Request('https://firstsuup.com/api/cron/schedule-confirmed-push'))).status,401);env.CRON_SECRET='fixture-secret';assert.equal((await cron.GET(new Request('https://firstsuup.com/api/cron/schedule-confirmed-push',{headers:{authorization:'Bearer fixture-secret'}}))).status,200);pass('worker has no anonymous/public send route');
 // Actual scope policy protects the test exception from becoming a global SMS switch.
 let cfg={mode:'test',test_parent_id:uuid(1),test_class_id:uuid(5),test_application_id:null,test_started_at:'2026-10-01'};
 let app={id:uuid(30),parent_id:uuid(1),class_id:uuid(5),created_at:'2026-10-05'};
 const scopeDb={from(name){let filters=[];const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},gte(k,v){filters.push(x=>x[k]>=v);return q},single(){return Promise.resolve({data:cfg})},maybeSingle(){return Promise.resolve({data:filters.every(f=>f(app))?app:null})}};return q}};
 const realPolicy=load('src/features/notifications/push/confirmed-policy.ts',{'@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>scopeDb}});
 assert.equal(await realPolicy.isConfirmedPushTestApplication(uuid(30),uuid(1)),true);
 assert.equal(await realPolicy.isConfirmedPushTestApplication(uuid(30),uuid(2)),false);
 app.created_at='2026-09-01';assert.equal(await realPolicy.isConfirmedPushTestApplication(uuid(30),uuid(1)),false);
 cfg.test_application_id=uuid(30);cfg.mode='all';assert.equal(await realPolicy.isConfirmedPushTestApplication(uuid(30),uuid(1)),true);
 assert.equal(await realPolicy.isConfirmedPushTestApplication(uuid(31),uuid(1)),false);
 const studio=load('src/features/notifications/sms/send-studio-notification.ts',{
  '@/features/notifications/push/confirmed-policy':realPolicy,
  '@/features/notifications/sms/sender':{sendSms:()=>{throw Error('unexpected real send')}},
  '@/features/notifications/sms/templates':{},'@/features/notifications/sms/phone':{},
  '@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>{throw Error('unexpected provider preparation')}}
 });
 for(const teacherEventType of ['teacher_trial_requested','teacher_trial_schedule_confirmed'])assert.equal(await studio.sendStudioNotificationSafely({teacherEventType,application:{id:uuid(30),parentId:uuid(1)}}),null);
 pass('test SMS guard is restricted to exact Parent/new class scope then frozen application, including all-mode retention');
 console.log('ALL PASS '+checks+' confirmed-push runtime suites; external sends=0');
})().catch(e=>{console.error(e);process.exitCode=1});
