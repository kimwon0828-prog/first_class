// LOCAL service queries and fake delivery sinks: no external notification providers.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),cp=require('node:child_process')
const {createClient}=require('@supabase/supabase-js')
const out='/tmp/parent-deletion-v1',m=JSON.parse(fs.readFileSync(out+'/fixtures.json','utf8'))
const env=JSON.parse(cp.execFileSync('supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));assert(['localhost','127.0.0.1'].includes(new URL(env.API_URL).hostname))
const db=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false}}),results=[]
const pass=s=>{results.push(s);console.log('PASS '+s)}
function load(file,dependencies={},globals={}){const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,console,Map,process,require:name=>{if(name==='server-only')return {};if(name in dependencies)return dependencies[name];throw Error('Unexpected dependency '+name)},...globals});return api}
;(async()=>{
 let supabaseUrl='https://production.example.test';const previousFlag=process.env.PARENT_ACCOUNT_DELETION_ENABLED;process.env.PARENT_ACCOUNT_DELETION_ENABLED='1'
 const gate=load('src/features/my/lib/parent-account-deletion-server.ts',{'@/shared/config/env':{getPublicEnv:()=>({supabaseUrl})},'@/integrations/supabase/server':{getSupabaseServerClient:()=>{throw Error('unexpected auth call')}}},{URL})
 assert.equal(gate.isParentAccountDeletionEnabled(),true);supabaseUrl='http://127.0.0.1:54321';assert.equal(gate.isParentAccountDeletionEnabled(),true);process.env.PARENT_ACCOUNT_DELETION_ENABLED='0';assert.equal(gate.isParentAccountDeletionEnabled(),false)
 if(previousFlag===undefined)delete process.env.PARENT_ACCOUNT_DELETION_ENABLED;else process.env.PARENT_ACCOUNT_DELETION_ENABLED=previousFlag
 pass('approved release enables deletion; explicit server kill switch disables it')
 const memory=new Map(),events=[]
 const storage=load('src/features/favorites/lib/storage.ts',{}, {window:{localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},dispatchEvent:e=>events.push(e.type)},Event})
 storage.bindFavoriteAccount('old-uuid');storage.setFavoriteClassIds(['class-a']);assert.equal(storage.getFavoriteClassIds().length,1)
 storage.bindFavoriteAccount('old-uuid');assert.equal(storage.getFavoriteClassIds().length,1)
 storage.clearParentFavoriteData();assert.equal(memory.size,0)
 storage.bindFavoriteAccount('old-uuid');storage.setFavoriteClassIds(['class-a']);storage.bindFavoriteAccount('rejoined-uuid');assert.equal(storage.getFavoriteClassIds().length,0)
 storage.bindFavoriteAccount(null);assert.equal(memory.size,0)
 pass('browser favorites deletion, same UUID persistence, rejoined UUID isolation and sign-out cleanup')
 const recipient=load('src/features/notifications/lib/parent-account-recipient.ts',{'@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>db}})
 const full=m.accounts.find(a=>a.label==='full'),review=m.accounts.find(a=>a.label==='review')
 assert.equal(await recipient.hasLiveParentAccountRecipient(m.applications.completed,full.id),false)
 assert.equal(await recipient.hasLiveParentAccountRecipient(m.applications.completed,null),false)
 assert.equal(await recipient.hasLiveParentAccountRecipient(m.applications.completed,review.id),false)
 assert.equal(await recipient.hasLiveParentAccountRecipient(m.applications.reviewNew,review.id),true)
 let alimtalk=0,sms=0
 const wrapper=load('src/features/notifications/alimtalk/send-parent-notification.ts',{'../lib/parent-account-recipient':recipient,'@/features/notifications/alimtalk/send-alimtalk':{sendAlimtalk:async()=>{alimtalk++;return {status:'disabled'}}},'@/features/notifications/sms/log-sms-event':{logSmsEventSafely:async()=>{sms++}}})
 for(const parentId of [full.id,null,review.id])assert.equal(await wrapper.sendParentNotificationSafely({trialApplicationId:m.applications.completed,parentId}),null)
 assert.equal(alimtalk,0);assert.equal(sms,0)
 await wrapper.sendParentNotificationSafely({trialApplicationId:m.applications.reviewNew,parentId:review.id});assert.equal(alimtalk,1);assert.equal(sms,1)
 const smsModule=load('src/features/notifications/sms/log-sms-event.ts',{'../lib/parent-account-recipient':recipient,'@/features/notifications/sms/sender':{sendSms:async()=>{sms++;return {}}},'@/features/notifications/sms/templates':{renderSmsTemplate:()=>({messagePreview:'fixture',templateKey:'trial_reminder'})},'@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>db}})
 await smsModule.logSmsEventSafely({organizationId:m.organizationId,application:{id:m.applications.completed,parentId:full.id},recipientType:'parent',eventType:'trial_reminder'});assert.equal(sms,1)
 pass('stale/null/wrong parent ID cannot reach Alimtalk or SMS sink; live Parent still follows fallback')
 // Run actual reminder orchestration with isolated candidate/log reads and fake senders.
 let teacherCalls=0
 const candidate={id:m.applications.ongoing,class_id:m.classId,parent_id:null,child_name:'fixture',parent_name:'fixture',parent_phone:'01012345678',requested_slot_at:'2026-10-10T06:00:00Z',confirmed_slot_at:'2026-10-10T06:00:00Z',assigned_teacher_id:null,classes:{title:'fixture',organization_id:m.organizationId}}
 const mockDb={rpc:async(name)=>({data:name==='claim_parent_feedback_reminders'?[]:0,error:null}),from:table=>{const data=table==='trial_applications'?[candidate]:table==='organizations'?[{id:m.organizationId,name:'fixture'}]:[];const chain={select:()=>chain,eq:()=>chain,in:()=>chain,gte:()=>chain,lt:()=>chain,order:()=>chain,then:resolve=>resolve({data,error:null})};return chain}}
 const job=load('src/features/notifications/reminders/run-trial-reminders.ts',{'@/shared/config/site-origins':{toParentUrl:p=>'https://example.test'+p},'@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>mockDb},'@/features/notifications/alimtalk/send-parent-notification':wrapper,'@/features/notifications/sms/send-studio-notification':{sendStudioNotification:async()=>{teacherCalls++;return {teacher:{status:'skipped',errorMessage:'teacher_not_assigned'},admin:{status:'dry_run'}}}}})
 const result=await job.runTrialReminders('public_dev');assert.equal(result.parentSkippedDetached,1);assert.equal(result.parentSent,0);assert.equal(result.parentFailed,0);assert.equal(teacherCalls,1);assert.equal(result.adminSent,1);assert.equal(result.teacherSkippedUnassigned,1);assert.equal(alimtalk,1)
 pass('actual reminder job skips detached Parent, keeps Studio/admin flow and succeeds with unassigned teacher')
 fs.writeFileSync(out+'/support-results.json',JSON.stringify(results,null,2))
})().catch(e=>{console.error(e);process.exitCode=1})
