// LOCAL ONLY: real Auth JWT + PostgREST/RLS; adds isolated TEST fixtures, no Production.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),{randomUUID}=require('node:crypto')
const {createClient}=require('@supabase/supabase-js')
const {publishFixtureReport}=require('./fixtures/parent-report.cjs')
const out='/tmp/parent-feedback-final';fs.mkdirSync(out,{recursive:true})
const prior=JSON.parse(fs.readFileSync('/tmp/parent-feedback-v1/fixtures.json'))
const env=Object.fromEntries(cp.execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\n').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^"|"$/g,'')]}))
assert(['localhost','127.0.0.1'].includes(new URL(env.API_URL).hostname))
const client=key=>createClient(env.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}})
const service=client(env.SERVICE_ROLE_KEY),anon=client(env.ANON_KEY),accounts=[],results=[]
const pass=s=>{results.push(s);console.log('PASS '+s)}
const ok=async q=>{const r=await q;if(r.error)throw Error(r.error.message);return r.data}
const denied=async(q,label,code)=>{const r=await q;assert(r.error,label+' unexpectedly succeeded');if(code)assert(r.error.message.includes(code),r.error.message);pass(label)}
const m={organizationId:prior.organizationId,classes:{},applications:{},password:prior.password,accounts:[]}
let p1,p2,p3,studio,otherStudio
async function app(label,extra={}){const id=randomUUID();await ok(service.from('trial_applications').insert({id,parent_id:p1.id,class_id:m.classes.trial,child_name:'TEST 최종 피드백',child_grade:'초3',requested_slot_at:new Date().toISOString(),status:'completed',completed_at:new Date().toISOString(),...extra}));m.applications[label]=id;await publishFixtureReport(service,id);return id}
const submit=(c,id,extra={})=>c.rpc('submit_parent_experience',{p_application_id:id,p_selected_chip_ids:['kind_teacher'],p_private_note:'FINAL_PRIVATE_CANARY 학원 전용 의견',p_decision:'planned',...extra})
const rows=(table,id)=>ok(service.from(table).select('*').eq('application_id',id))
async function empty(id){assert.equal((await rows('experience_feedback',id)).length,0);assert.equal((await rows('parent_decisions',id)).length,0)}
async function feedback(id){await ok(service.from('experience_feedback').insert({application_id:id,parent_id:p1.id,class_id:m.classes.trial,organization_id:m.organizationId,program_type:'trial_class',selected_chip_ids:['child_enjoyed'],private_note:'FINAL_LEGACY_PRIVATE_CANARY'}))}
async function decision(id,extra={}){await ok(service.from('parent_decisions').insert({application_id:id,parent_id:p1.id,decision:'considering',...extra}))}
;(async()=>{
 for(const a of prior.accounts){const c=client(env.ANON_KEY);const auth=await ok(c.auth.signInWithPassword({email:a.email,password:prior.password}));accounts.push({...a,client:c,session:auth.session});m.accounts.push({...a,session:auth.session})}
 ;[p1,p2,p3,studio,otherStudio]=accounts
 for(const [label,type] of [['trial','trial_class'],['level','level_test']]){const id=randomUUID();await ok(service.from('classes').insert({id,organization_id:m.organizationId,title:`TEST 최종 피드백 ${label}`,subject:'math',target_age:'elem_3',description:'최종 제출 로컬 검수 수업',assignment_mode:'post_assign',program_type:type}));m.classes[label]=id}
 const normal=await app('normal');await ok(submit(p1.client,normal));assert.equal((await rows('experience_feedback',normal)).length,1);assert.equal((await rows('parent_decisions',normal)).length,1);pass('atomic normal submission creates one Feedback and one Decision')
 await denied(submit(p1.client,normal),'resubmission rejected','feedback_already_submitted')
 const race=await app('race');const rs=await Promise.all(Array.from({length:10},()=>submit(p1.client,race)));assert.equal(rs.filter(r=>!r.error).length,1);assert(rs.filter(r=>r.error).every(r=>r.error.message==='feedback_already_submitted'));assert.equal((await rows('experience_feedback',race)).length,1);assert.equal((await rows('parent_decisions',race)).length,1);pass('10 concurrent JWT requests: exactly one success')
 const rollback=await app('rollback');await denied(submit(p1.client,rollback,{p_decision:'declined',p_decline_reason:'schedule_mismatch'}),'late Decision validation rolls back prior Feedback INSERT','preferred_days_required');await empty(rollback)
 const wrong=await app('wrongOwner');await denied(submit(p2.client,wrong),'other Parent forbidden');await empty(wrong)
 await denied(submit(studio.client,wrong),'Academy cannot submit');await denied(submit(anon,wrong),'anonymous cannot submit')
 for(const [label,extra] of [['new',{status:'new',completed_at:null}],['reviewing',{status:'reviewing',completed_at:null}],['confirmed',{status:'confirmed',completed_at:null,confirmed_slot_at:new Date().toISOString()}],['canceled',{status:'canceled',canceled_at:new Date().toISOString()}],['no_show',{no_show_at:new Date().toISOString()}],['cancel_marked',{canceled_at:new Date().toISOString()}]]){
  if(label==='confirmed')continue // Use an existing valid confirmed fixture below; avoid schedule-contract fabrication.
  const id=await app(label,extra);await denied(submit(p1.client,id),`${label} ineligible`,'feedback_not_eligible');await empty(id)
 }
 await denied(submit(p1.client,prior.applications.confirmed),'confirmed ineligible','feedback_not_eligible')
 const legacy=await app('legacyCompleted');await decision(legacy,{decision:'declined',decline_reason:'schedule_mismatch',preferred_date:'2026-10-03',preferred_time_note:'오후',created_at:'2026-09-01T00:00:00Z'});const before=await rows('parent_decisions',legacy)
 await denied(submit(p1.client,legacy),'existing Decision overwrite rejected','feedback_existing_decision_readonly')
 await ok(submit(p1.client,legacy,{p_decision:null}));assert.deepEqual(await rows('parent_decisions',legacy),before);pass('legacy Decision date/author/id/timestamps preserved; only Feedback inserted')
 const fonly=await app('feedbackOnlyCompleted');await feedback(fonly);const fbefore=await rows('experience_feedback',fonly)
 await denied(submit(p1.client,fonly),'existing Feedback overwrite rejected','feedback_existing_feedback_readonly')
 await ok(submit(p1.client,fonly,{p_selected_chip_ids:null,p_private_note:null}));assert.deepEqual(await rows('experience_feedback',fonly),fbefore);pass('Feedback-only partial state: only missing Decision inserted')
 const reasonless=await app('legacyReasonless');await decision(reasonless,{decision:'declined'});await ok(submit(p1.client,reasonless,{p_decision:null}));pass('legacy declined without reason remains valid, no invented metadata')
 for(const args of [{p_application_id:wrong,p_decision:'planned'},{p_application_id:wrong,p_decision:'planned',p_decline_reason:null,p_preferred_date:null,p_preferred_time_note:null},{p_application_id:wrong,p_decision:'planned',p_decline_reason:null,p_preferred_days:null,p_preferred_start_time:null,p_preferred_end_time:null,p_preferred_time_mode:null}])await denied(p1.client.rpc('set_parent_decision',args),'old Decision RPC overload revoked')
 await denied(p1.client.rpc('set_parent_decision_internal',{p_application_id:wrong,p_decision:'planned',p_decline_reason:null,p_preferred_date:null,p_preferred_time_note:null,p_preferred_days:null,p_preferred_start_time:null,p_preferred_end_time:null,p_preferred_time_mode:null,p_allow_missing_reason:true}),'internal Decision RPC inaccessible')
 await denied(p1.client.rpc('save_parent_experience_feedback',{p_application_id:wrong,p_selected_chip_ids:['kind_teacher'],p_private_note:null}),'old Feedback upsert RPC revoked')
 for(const [label,c] of [['Parent',p1.client],['Academy',studio.client],['Public',anon]]){
  await denied(c.from('experience_feedback').update({private_note:'overwrite'}).eq('application_id',normal),label+' cannot update Feedback')
  await denied(c.from('experience_feedback').delete().eq('application_id',normal),label+' cannot delete Feedback')
  await denied(c.from('parent_decisions').update({superseded_at:new Date().toISOString()}).eq('application_id',normal),label+' cannot supersede Decision')
  await denied(c.from('parent_decisions').insert({application_id:wrong,parent_id:p1.id,decision:'planned'}),label+' cannot directly insert Decision')
 }
 const privateRow=await ok(p1.client.from('experience_feedback').select('private_note').eq('application_id',normal));assert.equal(privateRow.length,1)
 assert.equal((await ok(p2.client.from('experience_feedback').select('*').eq('application_id',normal))).length,0)
 assert.equal((await ok(studio.client.from('experience_feedback').select('*').eq('application_id',normal))).length,1)
 assert.equal((await ok(otherStudio.client.from('experience_feedback').select('*').eq('application_id',normal))).length,0);pass('real JWT RLS: owner/org read, other Parent/org hidden')
 const level=await app('level',{class_id:m.classes.level});await denied(submit(p1.client,level,{p_selected_chip_ids:['child_focused']}),'level_test taxonomy unchanged');await empty(level)
 const note=await app('noteOnly');await ok(submit(p1.client,note,{p_selected_chip_ids:[]}));assert.deepEqual((await rows('experience_feedback',note))[0].selected_chip_ids,[]);pass('note-only Feedback with Decision supported')
 for(const p of [p2,p3]){const id=await app('public-'+p.label,{parent_id:p.id});await ok(submit(p.client,id))}
 const pub=await ok(anon.rpc('get_public_class_feedback_summary',{p_class_id:m.classes.trial}));assert(pub.chips.some(c=>c.id==='kind_teacher'&&c.count>=3));assert(!JSON.stringify(pub).includes('PRIVATE'));assert(!JSON.stringify(pub).includes(p1.id));assert.deepEqual(Object.keys(pub),['chips']);pass('public aggregate threshold/scope and private DTO unchanged')
 const maintenance=await app('maintenance');await ok(submit(p1.client,maintenance));await ok(service.from('experience_feedback').update({private_note:'SERVICE_TEST'}).eq('application_id',maintenance));await ok(service.from('parent_decisions').update({superseded_at:new Date().toISOString()}).eq('application_id',maintenance));pass('existing service maintenance stays available; snapshot/domain triggers retained')
 await denied(submit(p1.client,maintenance,{p_selected_chip_ids:null,p_private_note:null}),'historical-only Decision not recreated','feedback_context_changed')
 const history=await app('legacyHistory');await decision(history,{decision:'planned',superseded_at:'2026-09-10T00:00:00Z',created_at:'2026-09-01T00:00:00Z'});await decision(history);const hb=await rows('parent_decisions',history);await ok(submit(p1.client,history,{p_decision:null}));assert.deepEqual(await rows('parent_decisions',history),hb);pass('legacy current + history preserved without backfill')
 await app('browser');await app('review');await app('browserFailure');await app('browserDuplicate');await decision(await app('browserDecisionOnly'));await feedback(await app('browserFeedbackOnly'))
 fs.writeFileSync(`${out}/fixtures.json`,JSON.stringify(m,null,2),{mode:0o600});fs.writeFileSync(`${out}/db-results.json`,JSON.stringify({passed:results.length,results},null,2));pass('local visual fixtures ready')
})().catch(e=>{console.error(e);process.exitCode=1})
