// Executes production orchestration with inert DB/provider boundaries; never sends externally.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const env={PARENT_EVENT_PUSH_ENABLED:'true'},id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,clone=x=>JSON.parse(JSON.stringify(x));
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(n==='server-only')return {};if(n in deps)return deps[n];throw Error('unmocked '+n)},process:{env},console:{warn(){},error(){}},crypto:require('node:crypto').webcrypto,FormData,fetch:request,AbortSignal,Date,URL,Response,JSON});return exports;}
let jobs,devices,sendMode,receiptMode,legacyMode,sendCalls,legacyCalls,sent,completionCalls,failCompletion,failSave,queueEnabled;
function reset(event='report_published'){
 jobs=[{id:id(50),event_type:event,notification_key:event+':'+id(40),application_id:id(30),parent_id:id(1),state:'pending',attempts:[],suppress_legacy:false,feedback_completed:false,created_at:new Date().toISOString(),next_check_at:new Date(0).toISOString()}];
 devices=[{id:id(20),parent_id:id(1),enabled:true,permission_status:'granted',platform:'ios',expo_push_token:'ExpoPushToken[fixtureToken20]'},{id:id(21),parent_id:id(2),enabled:true,permission_status:'granted',platform:'ios',expo_push_token:'ExpoPushToken[foreignToken21]'}];
 sendMode='ok';receiptMode='ok';legacyMode='sent';sendCalls=legacyCalls=completionCalls=0;sent=[];failCompletion=failSave=false;queueEnabled=true;env.PARENT_EVENT_PUSH_ENABLED='true';
}
async function request(url,options){const body=JSON.parse(options.body);
 if(url.endsWith('/send')){sendCalls++;sent.push(body);assert(body.every(x=>x.to!=='ExpoPushToken[foreignToken21]'));if(sendMode==='timeout')throw Error('timeout');if(sendMode==='500')return new Response('',{status:500});if(sendMode==='malformed')return Response.json({data:[]});return Response.json({data:body.map((_,i)=>sendMode==='reject'?{status:'error',details:{error:'DeviceNotRegistered'}}:{status:'ok',id:'ticket-'+i})});}
 assert(url.endsWith('/getReceipts'));return Response.json({data:Object.fromEntries(body.ids.flatMap(x=>receiptMode==='pending'?[]:[[x,receiptMode==='error'?{status:'error',details:{error:'DeviceNotRegistered'}}:{status:'ok'}]]))});
}
const db={rpc:async(name,args)=>{
 if(name==='enqueue_parent_event_push')return {data:jobs[0]?.id??(queueEnabled?id(50):null)};
 const j=jobs.find(x=>x.id===args.p_id);if(name==='complete_parent_push_feedback'){completionCalls++;if(failCompletion)return {error:{message:'inert failure'}};if(j)j.feedback_completed=true;return {data:true};}
 assert.equal(name,'claim_parent_event_push');if(!j)return {data:[]};
 if(args.p_operation==='send'&&j.state==='pending'){j.state='sending';j.attempts=devices.filter(d=>d.parent_id===j.parent_id&&d.enabled&&d.permission_status==='granted').map(d=>({deviceId:d.id,platform:d.platform,token:d.expo_push_token,sendStatus:'reserved'}));return {data:[clone(j)]};}
 if(args.p_operation==='receipts'&&j.state==='receipts'){j.state='checking';return {data:[clone(j)]};}
 if(args.p_operation==='fallback'&&j.state==='fallback_ready'){j.state='fallback_sending';return {data:[clone(j)]};}return {data:[]};
 },from(name){let filters=[],operation='select',values,single=false,limit=100;const q={select(){return q},update(v){operation='update';values=v;return q},eq(k,v){filters.push(x=>x[k]===v);return q},in(k,v){filters.push(x=>v.includes(x[k]));return q},lte(k,v){filters.push(x=>x[k]<=v);return q},order(){return q},limit(n){limit=n;return q},maybeSingle(){single=true;return q},then(resolve,reject){let rows=name==='parent_event_push_deliveries'?jobs:name==='parent_push_devices'?devices:name==='trial_applications'?[{id:id(30),parent_id:id(1),classes:{organization_id:id(5),title:'private',organizations:{name:'private'}}}]:[];rows=rows.filter(x=>filters.every(f=>f(x))).slice(0,limit);if(operation==='update'&&failSave&&name==='parent_event_push_deliveries')return Promise.resolve({error:{message:'save failed'}}).then(resolve,reject);if(operation==='update')rows.forEach(x=>Object.assign(x,clone(values)));return Promise.resolve({data:clone(single?rows[0]??null:rows),error:null}).then(resolve,reject);}};return q;}};
const transport=load('src/features/notifications/push/confirmed-transport.ts'),payload=load('src/features/notifications/push/event-payload.ts');
const legacy={sendParentNotificationSafely:async()=>{legacyCalls++;return {alimtalk:{status:legacyMode},fallbackStatus:legacyMode==='failed'?'sent':legacyMode};}};
const service=load('src/features/notifications/push/event-delivery.ts',{'@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>db},'../alimtalk/send-parent-notification':legacy,'./confirmed-transport':transport,'./event-payload':payload});
const context={eventType:'trial_report_published',trialApplicationId:id(30),parentId:id(1)},poll=async()=>{jobs.forEach(j=>j.next_check_at=new Date(0).toISOString());return service.runParentEventPushWork();};
let count=0;const pass=s=>{count++;console.log('PASS '+s)};
(async()=>{
 for(const event of ['report_published','feedback_reminder','schedule_changed']){reset(event);await Promise.all([service.dispatchParentEventPush(id(50)),service.dispatchParentEventPush(id(50))]);assert.equal(sendCalls,1);assert.equal(jobs[0].state,'receipts');assert.equal(legacyCalls,0);await poll();assert.equal(jobs[0].state,'delivered');assert.equal(completionCalls,event==='feedback_reminder'?1:0);assert.equal(sent[0][0].data.type,event);assert.equal(sent[0][0].data.path,event==='schedule_changed'?'/my/schedule':`/record/${id(30)}/report${event==='feedback_reminder'?'#experience-feedback':''}`);assert(!JSON.stringify(sent).includes('private'));}pass('all new events use exact safe routes, recipient isolation and one atomic send; tickets are not delivery');
 reset();await service.sendPublishedReportNotificationSafely(context);await service.sendPublishedReportNotificationSafely(context);assert.equal(sendCalls,1);assert.equal(legacyCalls,0);pass('publish wrapper and worker share ownership without duplicate legacy');
 for(const mode of ['timeout','500','malformed']){reset();sendMode=mode;await service.sendPublishedReportNotificationSafely(context);await poll();await service.sendPublishedReportNotificationSafely(context);assert.equal(sendCalls,1);assert.equal(legacyCalls,0);assert.equal(jobs[0].state,'unknown');}pass('ambiguous provider outcome never resends or falls through to SMS');
 reset('feedback_reminder');receiptMode='error';await service.enqueueParentFeedbackPush(id(30));await poll();await poll();assert.equal(legacyCalls,1);assert.equal(jobs[0].state,'fallback_done');assert.equal(jobs[0].feedback_completed,true);assert.equal(devices[0].enabled,false);assert.equal(devices[1].enabled,true);pass('definitive receipt failure uses existing fallback once and disables only matching device');
 reset();sendMode='reject';legacyMode='dry_run';await service.dispatchParentEventPush(id(50));assert.equal(jobs[0].state,'unknown');pass('dry-run is never called actual delivery');
 reset();jobs[0].suppress_legacy=true;sendMode='reject';await service.dispatchParentEventPush(id(50));assert.equal(jobs[0].state,'test_suppressed');assert.equal(legacyCalls,0);pass('test target never sends SMS or Alimtalk fallback');
 reset('schedule_changed');devices=[];await service.dispatchParentEventPush(id(50));assert.equal(sendCalls+legacyCalls,0);assert.equal(jobs[0].state,'no_device');pass('schedule-change absence of device never invents an SMS event');
 reset('feedback_reminder');failCompletion=true;await service.enqueueParentFeedbackPush(id(30));await poll();assert.equal(jobs[0].state,'delivered');assert.equal(jobs[0].feedback_completed,false);failCompletion=false;await poll();assert.equal(jobs[0].feedback_completed,true);assert.equal(sendCalls,1);assert.equal(legacyCalls,0);pass('completion persistence failure is retried without sending again');
 reset();failSave=true;await service.sendPublishedReportNotificationSafely(context);assert.equal(jobs[0].state,'sending');await poll();assert.equal(sendCalls,1);assert.equal(legacyCalls,0);pass('post-send DB failure is held for review; committed report remains successful');
 reset('feedback_reminder');sendMode='timeout';assert.equal(await service.enqueueParentFeedbackPush(id(30)),true);assert.equal(await service.enqueueParentFeedbackPush(id(30)),true);assert.equal(sendCalls,1);assert.equal(legacyCalls,0);pass('feedback queue retains delivery ownership even with unknown transport');
 reset();env.PARENT_EVENT_PUSH_ENABLED='false';await service.sendPublishedReportNotificationSafely(context);assert.equal(legacyCalls,1);assert.equal(await service.enqueueParentFeedbackPush(id(30)),false);assert.equal(sendCalls,0);pass('disabled feature preserves legacy routing without creating new sends');
 for(const key of ['test:'+id(40),'report_published:invalid'])assert.throws(()=>payload.parentEventPayload('report_published',id(30),key));assert.throws(()=>payload.parentEventPayload('report_published','https://bad.test', 'report_published:'+id(40)));pass('invalid event/source identifiers rejected');
 let firstPublication=true,publicationFails=false,published=0;
 const action=load('src/features/studio/actions/publish-experience-report.ts',{
 '@/shared/config/site-origins':{toParentUrl:p=>'https://firstsuup.com'+p},'next/cache':{revalidatePath(){}},
 '@/features/billing/lib/require-entitlement':{requireStudioEntitlement:async()=>({allowed:true})},
 '@/features/studio/lib/require-teacher-studio-access':{requireTeacherStudioAccess:async()=>({id:id(3),organizationId:id(5)})},
 '@/features/studio/queries/get-studio-trial-result-save-context':{getStudioTrialResultSaveContext:async()=>({data:{id:id(30)}})},
 '@/features/studio/queries/get-studio-application-detail':{getStudioApplicationDetail:async()=>({data:{parentId:id(1)}})},
 '@/features/notifications/push/event-delivery':service,
 '@/shared/lib/db':{dataAdapter:{publishExperienceReport:async()=>{if(publicationFails)throw Error('assessment_changed_since_preview');published++;return {isFirstPublication:firstPublication,version:1,supersededVersion:null};}}}
 });
 const form=new FormData();form.set('expectedAssessmentUpdatedAt','2026-10-13T00:00:00Z');reset();sendMode='timeout';
 assert.equal((await action.publishExperienceReportAction(id(30),undefined,form)).status,'success');assert.equal(published,1);assert.equal(sendCalls,1);
 reset();firstPublication=false;assert.equal((await action.publishExperienceReportAction(id(30),undefined,form)).status,'success');assert.equal(sendCalls+legacyCalls,0);
 publicationFails=true;firstPublication=true;assert.equal((await action.publishExperienceReportAction(id(30),undefined,form)).status,'error');assert.equal(sendCalls+legacyCalls,0);
 pass('actual publish action: first publication only; failed publication sends nothing; transport failure preserves success');
 let owns=true,feedbackLegacyCalls=0,completionArgs=[];
 const reminderDb={from(){const q={select(){return q},eq(){return q},gte(){return q},lt(){return q},order:async()=>({data:[]})};return q},rpc:async(n,args)=>{
 if(n==='claim_parent_feedback_reminders')return {data:[{application_id:id(30),organization_id:id(5),parent_id:id(1)}]};
 assert.equal(n,'complete_parent_feedback_reminder');completionArgs.push(args);return {data:true};}};
 const reminders=load('src/features/notifications/reminders/run-trial-reminders.ts',{
 '@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>reminderDb},
 '@/features/notifications/alimtalk/send-parent-notification':{sendParentNotification:async()=>{feedbackLegacyCalls++;return {channel:'alimtalk',alimtalk:{status:'sent'},fallbackStatus:null};}},
 '@/features/notifications/push/event-delivery':{enqueueParentFeedbackPush:async()=>owns},
 '@/features/notifications/sms/send-studio-notification':{sendStudioNotification:async()=>{throw Error('unexpected teacher send')}},
 '@/shared/config/site-origins':{toParentUrl:p=>'https://firstsuup.com'+p}
 });
 await reminders.runTrialReminders('shared_secret');assert.equal(feedbackLegacyCalls,0);assert.equal(completionArgs.length,0);
 owns=false;await reminders.runTrialReminders('shared_secret');assert.equal(feedbackLegacyCalls,1);assert.equal(completionArgs.length,1);assert.equal(completionArgs[0].p_delivered,true);
 pass('actual reminder runner honors push queue ownership; disabled/unscoped candidates retain existing legacy completion');
 console.log('ALL PASS '+count+' parent event runtime suites; external sends=0');
})().catch(e=>{console.error(e);process.exitCode=1;});
