// LOCAL ONLY: real Auth JWTs + PostgREST/RPC/RLS. Retains TEST fixtures for visual review.
// node scripts/verify-parent-experience-feedback-db.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(execFileSync('npx', ['supabase','status','-o','env'], {encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\n').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1).replace(/^"|"$/g,'')]}))
assert(['127.0.0.1','localhost'].includes(new URL(env.API_URL).hostname), 'LOCAL DATABASE ONLY')
const makeClient=key=>createClient(env.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}})
const service=makeClient(env.SERVICE_ROLE_KEY), anon=makeClient(env.ANON_KEY)
const out='/tmp/parent-feedback-v1'; mkdirSync(out,{recursive:true})
const results=[]
const pass=name=>{results.push(name);console.log(`PASS ${name}`)}
async function ok(request,label){const r=await request;if(r.error)throw new Error(`${label}: ${r.error.code} ${r.error.message}`);return r.data}
async function blocked(request,label){const r=await request;assert(r.error,`${label} unexpectedly allowed`);pass(label)}
const suffix=randomBytes(4).toString('hex'), password=`Local-Feedback-${randomBytes(12).toString('hex')}!`
const org=randomUUID(), otherOrg=randomUUID()
await ok(service.from('organizations').insert([{id:org,name:'TEST 학부모 피드백 학원'},{id:otherOrg,name:'TEST 피드백 다른 학원'}]),'organizations')
const accounts=[]
for(const [label,role,organization] of [['parent1','parent',null],['parent2','parent',null],['parent3','parent',null],['studio','academy',org],['otherStudio','academy',otherOrg]]){
 const email=`feedback-${label}-${suffix}@test.invalid`
 const created=await ok(service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:`TEST ${label}`,role:'parent'}}),'auth user')
 const id=created.user.id
 await ok(service.from('profiles').upsert({id,role,name:`TEST ${label}`,phone:null,organization_id:organization}),'profile')
 const client=makeClient(env.ANON_KEY)
 const auth=await ok(client.auth.signInWithPassword({email,password}),'sign in')
 accounts.push({label,id,email,client,session:auth.session})
}
const [p1,p2,p3,studio,otherStudio]=accounts
await blocked(p1.client.from('profiles').update({role:'academy',organization_id:org}).eq('id',p1.id),'parent cannot escalate profile role/org')
await blocked(otherStudio.client.from('profiles').update({organization_id:org}).eq('id',otherStudio.id),'Studio cannot transfer own authority to another organization')
await ok(p1.client.from('profiles').update({name:'TEST parent1',parent_birth_date:'1990-01-01'}).eq('id',p1.id),'legitimate profile update');pass('normal Parent profile update preserved')
await ok(service.from('academy_public_profiles').upsert({organization_id:org,description:'체험 후 학부모 피드백을 확인하는 로컬 검수 학원입니다.'}),'academy public profile')
const classes={}
async function createClass(label,extra={}){
 const id=randomUUID(); await ok(service.from('classes').insert({id,organization_id:org,title:`TEST 피드백 ${label}`,subject:'math',target_age:'초등',description:'직접 참여하고 생각을 나누는 체험입니다.',assignment_mode:'post_assign',program_type:'trial_class',...extra}),'class');classes[label]=id;return id
}
const main=await createClass('체험수업'),level=await createClass('레벨테스트',{program_type:'level_test'}),low=await createClass('응답 부족'),same=await createClass('동일 학부모'),empty=await createClass('미제출'),archived=await createClass('지난 수업',{is_active:false})
const teacher=randomUUID();await ok(service.from('teachers').insert({id:teacher,organization_id:org,display_name:'TEST 피드백 선생님'}),'teacher')
const preassigned=await createClass('선배정',{assignment_mode:'preassigned',teacher_id:teacher})
const schedule=randomUUID();const day=new Date(Date.now()+86400000*14).toISOString().slice(0,10)
await ok(service.from('class_schedules').insert({id:schedule,class_id:main,schedule_type:'one_time',specific_date:day,start_time:'15:00',end_time:'16:00',capacity:100}),'schedule')
const requested=`${day}T06:00:00Z`
const manifest={organizationId:org,classes,applications:{},scheduleId:schedule,password,accounts:accounts.map(({client,session,...a})=>({...a,session}))}
writeFileSync(`${out}/fixtures.json`,JSON.stringify(manifest,null,2),{mode:0o600})
const appBase=(parentId,classId=main)=>({id:randomUUID(),parent_id:parentId,class_id:classId,child_name:'TEST_CHILD_FEEDBACK_PRIVATE',child_grade:'초3',requested_slot_at:requested,status:'new'})
const normal=appBase(p1.id)
await ok(p1.client.from('trial_applications').insert(normal),'normal parent new');pass('parent normal new INSERT')
await ok(p1.client.from('trial_applications').insert({...appBase(p1.id,preassigned),assigned_teacher_id:teacher}),'preassigned');pass('parent preassigned legitimate teacher INSERT')
for(const status of ['completed','confirmed','canceled','reviewing','no_show'])await blocked(p1.client.from('trial_applications').insert({...appBase(p1.id),status}),`parent spoof status ${status}`)
for(const field of ['completed_at','canceled_at','no_show_at','contacted_at','scheduled_at','enrolled_at','lost_at','next_contact_at','last_activity_at','confirmed_slot_at','created_at','updated_at'])await blocked(p1.client.from('trial_applications').insert({...appBase(p1.id),[field]:new Date().toISOString()}),`parent spoof ${field}`)
for(const [field,value] of [['registration_status','enrolled'],['consultation_note','spoof'],['trial_feedback','spoof'],['follow_up_note','spoof'],['final_level','spoof'],['regular_schedule_preference_note','spoof'],['import_batch_id',randomUUID()],['confirmed_schedule_block_id',randomUUID()]])await blocked(p1.client.from('trial_applications').insert({...appBase(p1.id),[field]:value}),`parent spoof ${field}`)
await blocked(p1.client.from('trial_applications').insert({...appBase(p1.id),assigned_teacher_id:teacher}),'parent arbitrary assignment on post_assign')
await blocked(p1.client.from('trial_applications').insert(appBase(p2.id)),'parent owner spoof')
await blocked(p1.client.from('trial_applications').select('id'),'parent base SELECT still denied')
assert((await ok(p1.client.from('my_trial_applications').select('id').eq('id',normal.id),'parent safe view')).length===1);pass('parent safe view still readable')
const save=(p,id,ids=['child_enjoyed'],note=null)=>p.client.rpc('save_parent_experience_feedback',{p_application_id:id,p_selected_chip_ids:ids,p_private_note:note})
async function app(label,p=p1,classId=main,extra={}){
 const row={...appBase(p?.id??null,classId),status:'completed',completed_at:new Date().toISOString(),...extra};await ok(service.from('trial_applications').insert(row),'service fixture');manifest.applications[label]=row.id;return row.id
}
const a=await app('chipAndNote');const secret='FEEDBACK_PRIVATE_CANARY_<script>alert("PRIVATE")</script>_학원에만 전달';
await ok(save(p1,a,['child_enjoyed','kind_teacher','kind_consultation'],secret),'parent save');pass('parent own completed save (no child, assignee, report)')
const own=await ok(p1.client.from('experience_feedback').select('*').eq('application_id',a),'own read');assert.equal(own.length,1);assert.equal(own[0].private_note,secret);pass('parent own raw read')
assert.equal((await ok(p2.client.from('experience_feedback').select('*').eq('application_id',a),'other parent')).length,0);pass('other parent read denied by RLS')
await blocked(save(p2,a),'other parent save denied')
await blocked(anon.rpc('save_parent_experience_feedback',{p_application_id:a,p_selected_chip_ids:['child_enjoyed']}),'anon save denied')
await blocked(save(studio,a),'studio save denied')
for(const actor of [p1,studio]){
 await blocked(actor.client.from('experience_feedback').insert({application_id:a,parent_id:p1.id,class_id:main,organization_id:org,program_type:'trial_class',selected_chip_ids:['child_enjoyed']}),`${actor.label} direct insert denied`)
 await blocked(actor.client.from('experience_feedback').update({private_note:'spoof'}).eq('application_id',a),`${actor.label} direct update denied`)
 await blocked(actor.client.from('experience_feedback').delete().eq('application_id',a),`${actor.label} direct delete denied`)
}
assert.equal((await ok(studio.client.from('experience_feedback').select('private_note').eq('application_id',a),'studio read'))[0].private_note,secret);pass('same organization Studio private read')
assert.equal((await ok(otherStudio.client.from('experience_feedback').select('*').eq('application_id',a),'other studio')).length,0);pass('cross organization Studio read denied')
await blocked(anon.from('experience_feedback').select('*'),'anon raw SELECT denied')
for(const status of ['new','reviewing','confirmed','canceled']){const id=await app(status,p1,main,{status,completed_at:null});await blocked(save(p1,id),`feedback ${status} denied`)}
for(const field of ['no_show_at','canceled_at']){const id=await app(field,p1,main,{[field]:new Date().toISOString()});await blocked(save(p1,id),`completed with ${field} denied`)}
const legacy=await app('legacy',null);await blocked(save(p1,legacy),'legacy parent NULL denied')
for(const [ids,note,label] of [[[],null,'empty'],[[],' \t\n ','whitespace'],[[],'\u00a0\u3000\ufeff','unicode whitespace'],[['unknown'],null,'unknown chip'],[['child_enjoyed','child_enjoyed'],null,'duplicate'],[[null],null,'NULL element'],[null,null,'NULL array'],[['child_enjoyed','good_child_fit','good_level_fit','kind_teacher','kind_consultation','clean_facilities'],null,'over five'],[[],'가'.repeat(1001),'over 1000']])await blocked(save(p1,a,ids,note),`input ${label} denied`)
const noteOnly=await app('noteOnly',p1,low);await ok(save(p1,noteOnly,[],'  NOTE_ONLY_PRIVATE_CANARY  '),'note only');
assert.equal((await ok(p1.client.from('experience_feedback').select('private_note').eq('application_id',noteOnly),'trim'))[0].private_note,'NOTE_ONLY_PRIVATE_CANARY');pass('note-only save and trim')
await ok(save(p1,a,['child_enjoyed'],' \t\n '),'blank to null');assert.equal((await ok(p1.client.from('experience_feedback').select('private_note').eq('application_id',a),'null note'))[0].private_note,null);pass('blank note becomes NULL')
await ok(save(p1,a,['child_enjoyed','kind_teacher','kind_consultation'],secret),'restore')
await Promise.all(Array.from({length:10},()=>ok(save(p1,a,['child_enjoyed','kind_teacher','kind_consultation'],secret),'concurrent retry')))
assert.equal((await ok(service.from('experience_feedback').select('id').eq('application_id',a),'concurrent count')).length,1);pass('10 concurrent saves = one row')
const l=await app('levelTest',p1,level)
for(const id of ['child_focused','structured_lesson','interesting_activities','good_hands_on'])await blocked(save(p1,l,[id]),`level_test ${id} denied`)
await ok(save(p1,l,['specific_feedback']),'level allowed');pass('level_test permitted selection')
manifest.applications.levelTestUnsubmitted=await app('levelTestUnsubmitted',p1,level)
const classSummary=id=>ok(anon.rpc('get_public_class_feedback_summary',{p_class_id:id}),'class summary')
const academySummary=()=>ok(anon.rpc('get_public_academy_feedback_summary',{p_organization_id:org}),'academy summary')
const b=await app('chipOnly',p2),c=await app('thirdParent',p3)
await ok(save(p2,b,['child_enjoyed','kind_teacher','kind_consultation']),'second');assert.deepEqual(await classSummary(main),{chips:[]});pass('2 applications / 2 parents hidden')
await ok(save(p3,c,['child_enjoyed','kind_teacher','kind_consultation']),'third')
assert.deepEqual((await classSummary(main)).chips.map(x=>x.id),['child_enjoyed','kind_teacher']);pass('3 parents visible, class scope excludes academy-only')
assert.deepEqual((await academySummary()).chips.map(x=>x.id),['kind_teacher','kind_consultation']);pass('academy scope excludes class-only')
const extra=await app('sameParentExtra');await ok(save(p1,extra,['child_enjoyed']),'extra');assert.equal((await classSummary(main)).chips[0].count,4);pass('same parent extra application increments count')
await ok(save(p1,extra,['good_child_fit']),'edit replace');assert.equal((await classSummary(main)).chips[0].count,3);assert(!(await classSummary(main)).chips.some(x=>x.id==='good_child_fit'));pass('edit replaces old count; chip with <3 parents hidden')
await ok(save(p2,b,['child_enjoyed','kind_teacher','kind_consultation','good_child_fit']),'fit two');assert(!(await classSummary(main)).chips.some(x=>x.id==='good_child_fit'));pass('individual chip 2 parents hidden')
await ok(save(p3,c,['child_enjoyed','kind_teacher','kind_consultation','good_child_fit']),'fit three');assert((await classSummary(main)).chips.some(x=>x.id==='good_child_fit'));pass('individual chip 3 parents visible')
for(let i=0;i<3;i++){const x=await app(`same-${i}`,p1,same);await ok(save(p1,x),'same parent')}
assert.deepEqual(await classSummary(same),{chips:[]});pass('3 applications / 1 parent hidden')
for(const p of [p2,p3]){const x=await app(`note-${p.label}`,p,low);await ok(save(p,x,[],'PRIVATE_NOTE_ONLY'),'note')}
assert.deepEqual(await classSummary(low),{chips:[]});pass('3 note-only submissions not public sample')
for(const p of [p1,p2,p3]){const x=await app(`archived-${p.label}`,p,archived);await ok(save(p,x,['clean_facilities']),'archive')}
assert((await academySummary()).chips.some(x=>x.id==='clean_facilities'&&x.count===3));assert.deepEqual(await classSummary(archived),{chips:[]});pass('archived class remains in academy aggregate; inactive class public summary hidden')
const savedBefore=own[0];await ok(service.from('classes').update({program_type:'level_test'}).eq('id',main),'program changed');
await ok(save(p1,a,['child_focused'],secret),'original program snapshot');assert.equal((await ok(p1.client.from('experience_feedback').select('program_type').eq('application_id',a),'snapshot'))[0].program_type,'trial_class');pass('program snapshot immutable across class edits')
await ok(service.from('classes').update({program_type:'trial_class'}).eq('id',main),'restore program');await ok(save(p1,a,['child_enjoyed','kind_teacher','kind_consultation'],secret),'restore')
await blocked(service.from('experience_feedback').update({parent_id:p2.id}).eq('id',savedBefore.id),'snapshot immutable trigger')
await ok(service.from('trial_applications').update({parent_id:p2.id}).eq('id',a),'transfer test')
await blocked(save(p2,a),'ownership transfer cannot overwrite prior author')
assert.equal((await ok(studio.client.from('experience_feedback').select('id').eq('application_id',a),'transfer hidden')).length,0);pass('ownership transfer private note fails closed')
await ok(service.from('trial_applications').update({parent_id:p1.id}).eq('id',a),'restore owner')
// Studio workflows use their current view/RPC, unaffected by Parent INSERT column grants.
await ok(studio.client.from('studio_trial_applications').update({class_schedule_id:schedule}).eq('id',normal.id),'link schedule')
let version=(await ok(studio.client.from('studio_trial_applications').select('updated_at').eq('id',normal.id).single(),'version')).updated_at
await ok(studio.client.rpc('set_studio_application_schedule',{p_application_id:normal.id,p_operation:'confirm',p_teacher_id:null,p_expected_updated_at:version}),'confirm')
await ok(studio.client.from('studio_trial_applications').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',normal.id),'complete');pass('Studio unassigned confirm -> complete still works')
await ok(save(p1,normal.id),'real workflow feedback');manifest.applications.workflowCompleted=normal.id
const unsubmitted=await app('unsubmitted',p1,empty);manifest.applications.unsubmitted=unsubmitted
const publicJson=JSON.stringify([await classSummary(main),await academySummary()])
for(const token of ['private_note','privateNote','parent_id','application_id','child_id','TEST_CHILD_FEEDBACK_PRIVATE','FEEDBACK_PRIVATE_CANARY',p1.id,a,'phone','email'])assert(!publicJson.includes(token),`public leakage ${token}`)
pass('public RPC strict aggregate DTO; no PII/canaries')
writeFileSync(`${out}/fixtures.json`,JSON.stringify(manifest,null,2),{mode:0o600})
writeFileSync(`${out}/db-results.json`,JSON.stringify({passed:results.length,results},null,2))
console.log(`ALL ${results.length} DATABASE CHECKS PASS; LOCAL fixture manifest: ${out}/fixtures.json`)
