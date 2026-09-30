// LOCAL ONLY: real Auth JWT / PostgREST / RLS. Never load project .env files.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),{randomUUID}=require('node:crypto')
const {createClient}=require('@supabase/supabase-js')
const out=process.env.PHASE1_OUTPUT_DIR || '/tmp/studio-workflow-phase1';fs.mkdirSync(out,{recursive:true})
const prior={organizationId:randomUUID(),password:'Local-Workflow-'+randomUUID()+'!'},otherOrganizationId=randomUUID()
const env=Object.fromEntries(cp.execFileSync('supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\n').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^"|"$/g,'')]}))
assert(['localhost','127.0.0.1'].includes(new URL(env.API_URL).hostname))
const client=key=>createClient(env.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}})
const service=client(env.SERVICE_ROLE_KEY),anon=client(env.ANON_KEY),accounts=[],results=[]
const ok=async q=>{const r=await q;if(r.error)throw Error(r.error.message);return r.data}
const pass=s=>{results.push(s);console.log('PASS '+s)}
const denied=async(q,label)=>{const r=await q;assert(r.error,label+' unexpectedly succeeded');pass(label)}
const sql=q=>cp.execFileSync('docker',['exec','-i','supabase_db_first-class-mvp','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:q,encoding:'utf8'})
let studio,parent,other,cls
const m={applications:{},accounts:[],password:prior.password,organizationId:prior.organizationId}
async function app(label,extra={}){const id=randomUUID();await ok(service.from('trial_applications').insert({id,parent_id:parent.id,class_id:cls,child_name:'TEST WORKFLOW '+label,child_grade:'초3',status:'completed',completed_at:new Date().toISOString(),requested_slot_at:new Date().toISOString(),...extra}));m.applications[label]=id;return id}
const finalize=(c,id,extra={})=>c.rpc('finalize_studio_trial_result',{p_application_id:id,p_content:{observations:['sustained_engagement'],publicSummary:'TEST 확정 리포트 총평',note:'WORKFLOW_PRIVATE_RECORD',...extra}})
const reg=(c,id,status,reason=[],note=null)=>c.rpc('set_studio_registration_result',{p_application_id:id,p_status:status,p_reason_ids:reason,p_note:note})
const pref={version:1,state:'specified',groups:[{dayMode:'selected',days:[2],timeMode:'range',startTime:'17:00',endTime:'19:00'},{dayMode:'selected',days:[4],timeMode:'range',startTime:'18:00',endTime:'20:00'}]}
const contact=(c,id,extra={})=>c.rpc('record_studio_contact',{p_submission_id:randomUUID(),p_application_id:id,p_occurred_at:new Date().toISOString(),p_channel:'PHONE',p_sentiment:'NEUTRAL',p_note:'TEST 연락 메모',p_next_contact_at:null,p_preference_provided:true,p_preference:pref,p_preference_note:'목요일 18시 이후',p_flexibility:'plus_minus_30',...extra})
const rows=(table,id)=>ok(service.from(table).select('*').eq('application_id',id))
const application=id=>ok(service.from('trial_applications').select('*').eq('id',id).single())
const publish=async(c,id)=>{const record=(await rows('trial_results',id))[0];return c.rpc('publish_experience_report',{p_application_id:id,p_expected_assessment_updated_at:record.updated_at})}
;(async()=>{
 await ok(service.from('organizations').insert([{id:prior.organizationId,name:'TEST 체험 워크플로 학원'},{id:otherOrganizationId,name:'TEST 다른 조직 학원'}]))
 for(const [label,role,organization] of [['parent1','parent',null],['parent2','parent',null],['parent3','parent',null],['studio','academy',prior.organizationId],['otherStudio','academy',otherOrganizationId]]) {
  const email=`workflow-${label}-${randomUUID()}@test.invalid`
  const created=await ok(service.auth.admin.createUser({email,password:prior.password,email_confirm:true,user_metadata:{name:`TEST ${label}`,role:'parent'}}))
  const a={label,id:created.user.id,email}
  await ok(service.from('profiles').upsert({id:a.id,role,name:`TEST ${label}`,organization_id:organization}))
  const c=client(env.ANON_KEY),r=await ok(c.auth.signInWithPassword({email,password:prior.password}));accounts.push({...a,client:c});m.accounts.push({...a,session:r.session})
 }

 parent=accounts.find(a=>a.label==='parent1');studio=accounts.find(a=>a.label==='studio')||accounts[3];other=accounts[4]
 cls=randomUUID();m.classId=cls;await ok(service.from('classes').insert({id:cls,organization_id:prior.organizationId,title:'TEST WORKFLOW PHASE 1',subject:'math',target_age:'elem_3',description:'로컬 검수 전용',assignment_mode:'post_assign',program_type:'trial_class'}))
 const fresh=await app('A-unwritten'),final=await app('C-finalized');await ok(finalize(studio.client,final));pass('first record finalize succeeds')
 await denied(finalize(studio.client,final),'second finalize rejected')
 await denied(studio.client.from('trial_results').update({note:'overwrite'}).eq('application_id',final),'direct finalized record UPDATE rejected')
 await denied(studio.client.from('trial_results').delete().eq('application_id',final),'direct record DELETE rejected')
 await denied(studio.client.from('trial_results').insert({application_id:fresh}),'direct record INSERT rejected')
 const race=await app('recordRace'),r=await Promise.all(Array.from({length:10},()=>finalize(studio.client,race)));assert.equal(r.filter(x=>!x.error).length,1);assert.equal((await rows('trial_results',race)).length,1);assert.equal((await rows('application_logs',race)).length,1);pass('10 concurrent finalize: exactly one row/event')
 const sent=await app('E-sent');await ok(finalize(studio.client,sent));await ok(await publish(studio.client,sent));await denied(await publish(studio.client,sent),'second report send rejected')
 await denied(studio.client.from('experience_reports').update({content:{}}).eq('application_id',sent),'sent report UPDATE rejected')
 await denied(studio.client.from('experience_reports').delete().eq('application_id',sent),'sent report DELETE rejected')
 const reportRace=await app('reportRace');await ok(finalize(studio.client,reportRace));const rr=await Promise.all(Array.from({length:10},()=>publish(studio.client,reportRace)));assert.equal(rr.filter(x=>!x.error).length,1);assert.equal((await rows('experience_reports',reportRace)).length,1);pass('10 concurrent report sends: exactly one snapshot')
 const snap=JSON.stringify(await rows('experience_reports',sent));assert.equal((await ok(parent.client.from('experience_reports').select('content').eq('application_id',sent))).length,1)
 const nc='2026-10-10T09:00:00Z',rg=await app('F-pending',{next_contact_at:nc});const before=await application(rg)
 await ok(reg(studio.client,rg,'pending',['schedule_coordination','discussing_with_child'],'WORKFLOW_PRIVATE_REGISTRATION'));let a=await application(rg);assert.deepEqual(a.registration_reason_ids,['discussing_with_child','schedule_coordination']);assert.equal(a.next_contact_at,before.next_contact_at);assert.equal((await rows('consultation_logs',rg)).length,0);pass('pending reasons + note saved without consultation or next_contact mutation')
 const nr=await app('G-not-enrolled');await ok(reg(studio.client,nr,'pending',['price_consideration']));await ok(reg(studio.client,nr,'not_enrolled',['price_burden','schedule_mismatch'],'TEST 등록 메모'));pass('pending -> not_enrolled multi reason')
 await denied(reg(studio.client,nr,'enrolled',['price_consideration']),'enrolled rejects pending-only reasons');await denied(reg(studio.client,nr,'undecided',['schedule_mismatch']),'undecided rejects not_enrolled reasons')
 const enr=await app('H-enrolled');const er=await Promise.all(Array.from({length:10},()=>reg(studio.client,enr,'enrolled')));assert(er.every(x=>!x.error));assert.equal(er.filter(x=>x.data.enrollmentTransition).length,1);assert.equal((await rows('registration_results',enr)).length,1);assert.equal((await rows('application_logs',enr)).length,1);pass('10 concurrent enrolled commands: one history/event/SMS eligibility; no network send')
 assert.equal((await ok(reg(studio.client,enr,'enrolled'))).enrollmentTransition,false);await ok(reg(studio.client,enr,'not_enrolled',['child_fit']));assert.equal((await ok(reg(studio.client,enr,'enrolled'))).enrollmentTransition,false);pass('enrolled save and re-enrollment never repeat first-enrolled SMS')
 await ok(reg(studio.client,rg,'enrolled'));await ok(reg(studio.client,rg,'undecided'));assert.deepEqual((await application(rg)).registration_reason_ids,[]);assert((await rows('application_logs',rg)).some(x=>x.note.includes('WORKFLOW_PRIVATE_REGISTRATION')));pass('state switch clears active reasons while preserving internal history')
 assert.equal((await ok(parent.client.from('application_logs').select('*').eq('application_id',rg))).length,0);pass('Parent cannot read private registration history directly')
 await ok(reg(studio.client,rg,'pending',['schedule_coordination'],'TEST 검수 메모'))
 await denied(studio.client.from('studio_trial_applications').update({registration_status:'enrolled'}).eq('id',fresh),'old direct view registration writer closed')
 await denied(studio.client.rpc('create_studio_consultation',{p_submission_id:randomUUID(),p_application_id:fresh,p_occurred_at:new Date().toISOString(),p_channel:'PHONE',p_sentiment:'NEUTRAL',p_note:'TEST',p_registration_status:'enrolled',p_unregistered_reason:null,p_unregistered_reason_note:null,p_next_action:'NONE',p_next_contact_at:null,p_preference_provided:false,p_preference:null,p_preference_note:null,p_outcome_note:null}),'old coupled consultation RPC inaccessible')
 for(const [label,c] of [['other org',other.client],['Parent',parent.client],['anon',anon]]){
  await denied(finalize(c,fresh),label+' finalize denied');await denied(reg(c,fresh,'pending'),label+' registration denied');await denied(await publish(c,final),label+' report denied');await denied(contact(c,fresh),label+' contact denied')
 }
 for(const [label,extra] of [['new',{status:'new',completed_at:null}],['canceled',{status:'canceled',canceled_at:new Date().toISOString()}],['noShow',{no_show_at:new Date().toISOString()}]]){const id=await app(label,extra);await denied(finalize(studio.client,id),label+' finalize blocked');await denied(reg(studio.client,id,'enrolled'),label+' registration blocked');await denied(contact(studio.client,id),label+' contact blocked')}
 const ct=await app('J-contact');await ok(contact(studio.client,ct));const logs=await rows('consultation_logs',ct);assert.deepEqual(logs[0].regular_schedule_preference_snapshot,pref);assert.equal(logs[0].time_flexibility,'plus_minus_30');assert.equal((await application(ct)).registration_status,'undecided');pass('Tue/Thu multiple ranges + flexibility saved; registration unchanged')
 for(const [label,extra] of [['weekday',{p_preference:{...pref,groups:[{...pref.groups[0],days:[8]}]}}],['end<=start',{p_preference:{...pref,groups:[{...pref.groups[0],endTime:'16:00'}]}}],['invalid time',{p_preference:{...pref,groups:[{...pref.groups[0],startTime:'29:00'}]}}],['flexibility',{p_flexibility:'invalid'}],['missing state',{p_preference:{version:1,groups:pref.groups}}]]) await denied(contact(studio.client,ct,extra),label+' validation')
 const legacy=await app('K-legacy');await ok(service.from('consultation_logs').insert({application_id:legacy,activity_type:'LEGACY_IMPORT',occurred_at:new Date().toISOString(),note:'TEST 이전 연락 기록'}));assert.equal((await ok(studio.client.from('consultation_logs').select('*').eq('application_id',legacy)))[0].time_flexibility,null);pass('legacy NULL structured fields remain readable')
 await ok(reg(studio.client,sent,'pending',['price_consideration']));await ok(contact(studio.client,sent));assert.equal(JSON.stringify(await rows('experience_reports',sent)),snap);pass('registration/contact edits leave published Parent snapshot unchanged')
 const rb=await app('rollback');sql(`create function public.workflow_test_fail() returns trigger language plpgsql as $$ begin if new.application_id='${rb}'::uuid then raise exception 'TEST_ROLLBACK'; end if; return new; end $$; create trigger workflow_test_fail before insert on public.application_logs for each row execute function public.workflow_test_fail();`)
 try {await denied(reg(studio.client,rb,'enrolled'),'late history failure rolls back registration');assert.equal((await application(rb)).registration_status,'undecided');assert.equal((await rows('registration_results',rb)).length,0);await denied(finalize(studio.client,rb),'late history failure rolls back finalized record');assert.equal((await rows('trial_results',rb)).length,0)} finally {sql('drop trigger workflow_test_fail on public.application_logs; drop function public.workflow_test_fail();')}
 pass('atomic rollback leaves no result/record/history partial writes')
 await denied(parent.client.from('trial_applications').select('registration_reason_ids,registration_note').eq('id',rg),'Parent cannot select private registration columns')
 await denied(anon.from('trial_applications').select('registration_note').eq('id',rg),'Public cannot select private registration note')
 const withdrawn=await app('withdrawn');await ok(finalize(studio.client,withdrawn));await ok(await publish(studio.client,withdrawn));await ok(studio.client.rpc('withdraw_experience_report',{p_application_id:withdrawn}));await denied(await publish(studio.client,withdrawn),'withdrawn report history prevents another send');pass('existing safety withdrawal preserved, never reopens publication')
 const cc=await app('contactRace'),sid=randomUUID(),cr=await Promise.all(Array.from({length:10},()=>contact(studio.client,cc,{p_submission_id:sid})));assert(cr.every(x=>!x.error));assert.equal(cr.filter(x=>x.data.mode==='created').length,1);assert.equal((await rows('consultation_logs',cc)).length,1);pass('contact retry idempotency: 10 commands create one snapshot')
 const multi={...pref,groups:[...pref.groups,{...pref.groups[0],startTime:'20:00',endTime:'21:00'}]};await ok(contact(studio.client,cc,{p_preference:multi}));pass('multiple ranges on the same weekday supported within existing 3-group contract')

 await app('B-draft');await app('I-add-contact');await app('browser-save');await app('browser-failure');await app('browser-enroll');await app('browser-contact');await app('browser-report');
 fs.writeFileSync(out+'/fixtures.json',JSON.stringify(m,null,2),{mode:0o600});fs.writeFileSync(out+'/db-results.json',JSON.stringify({passed:results.length,results},null,2));console.log('PASS '+results.length+' checks; isolated local fixtures retained')
})().catch(e=>{console.error(e);process.exitCode=1})
