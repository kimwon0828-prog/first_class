// LOCAL ONLY. Auth/JWT, PostgREST/RLS, FK cleanup, history, retry and rejoin.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm'),ts=require('typescript'),{randomUUID}=require('node:crypto')
const {createClient}=require('@supabase/supabase-js')
const hash=v=>require('node:crypto').createHash('sha256').update(JSON.stringify(v)).digest('hex')
const {publishFixtureReport}=require('./fixtures/parent-report.cjs')
const out='/tmp/parent-deletion-v1';fs.mkdirSync(out,{recursive:true})
const env=JSON.parse(cp.execFileSync('supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
assert(['127.0.0.1','localhost'].includes(new URL(env.API_URL).hostname))
assert(['127.0.0.1','localhost'].includes(new URL(env.DB_URL).hostname))
const client=key=>createClient(env.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}})
const db=client(env.SERVICE_ROLE_KEY),anon=client(env.ANON_KEY),results=[],prefix=Date.now().toString(36)
const ok=async promise=>{const r=await promise;if(r.error)throw Error(r.error.message);return r.data}
const pass=s=>{results.push(s);console.log('PASS '+s)}
const workflow={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/my/lib/parent-account-deletion-workflow.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:workflow,Map})
const run=workflow.deleteParentAccountWorkflow
const m={accounts:[],applications:{},password:'LocalOnly-DeleteV1!',organizationId:randomUUID(),classId:randomUUID()}
const save=()=>fs.writeFileSync(out+'/fixtures.json',JSON.stringify(m,null,2),{mode:0o600})
async function account(label,role='parent'){
 const email=`deletion-${prefix}-${label}@example.test`;const a=await ok(db.auth.admin.createUser({email,password:m.password,email_confirm:true,user_metadata:{name:'로컬 탈퇴 검수',signup_intent:role==='parent'?'parent':'teacher_public'}}));const id=a.user.id
 await ok(db.from('profiles').insert({id,role,name:label==='review'?'로컬 검수 학부모':`로컬 ${label}`,phone:'01012345678',parent_birth_date:'1990-01-02',organization_id:role==='academy'?m.organizationId:null}))
 const c=client(env.ANON_KEY),login=await ok(c.auth.signInWithPassword({email,password:m.password}));const record={label,id,email,session:login.session};m.accounts.push(record);save();return {...record,client:c}
}
async function application(parent,label,extra={}){const id=randomUUID();await ok(db.from('trial_applications').insert({id,class_id:m.classId,parent_id:parent.id,child_name:'보존 학생',child_grade:'초3',parent_name:'보존 보호자',parent_phone:'01012345678',child_school:'보존 학교',interest_subjects:'수학',memo:'보존 신청 메모',requested_slot_at:new Date().toISOString(),status:'new',...extra}));m.applications[label]=id;save();return id}
const rows=(t,id)=>ok(db.from(t).select('*').eq('application_id',id).order('id'))
const scrubOwners=row=>{const {parent_id,child_id,updated_at,...rest}=row;return rest}
async function removedParent(id){for(const table of ['profiles','children','parent_decisions','experience_feedback','parent_notification_reads','parent_report_engagement']){const r=await ok(db.from(table).select('*').eq(table==='profiles'?'id':'parent_id',id));assert.equal(r.length,0,table)}}
async function deny(q,label){const r=await q;assert(r.error,label);pass(label)}
;(async()=>{
 await ok(db.from('organizations').insert({id:m.organizationId,name:'LOCAL 탈퇴 보존 검수 학원'}))
 await ok(db.from('classes').insert({id:m.classId,organization_id:m.organizationId,title:'LOCAL 탈퇴 후 보존 수업',subject:'math',target_age:'elem_3',description:'로컬 검증용',program_type:'trial_class',assignment_mode:'post_assign'}))
 const studio=await account('studio','academy'),a=await account('full'),b=await account('other'),c=await account('third'),empty=await account('empty')
 const children=await ok(db.from('children').insert([1,2].map(n=>({parent_id:a.id,name:`로컬 자녀${n}`,grade:'초3',school_name:'보존 학교'}))).select('id'))
 const schedule=await ok(db.from('class_schedules').insert({class_id:m.classId,schedule_type:'one_time',specific_date:'2026-10-10',start_time:'15:00',end_time:'16:00',capacity:10}).select('id').single())
 const ongoing=await application(a,'ongoing',{child_id:children[0].id,status:'confirmed',class_schedule_id:schedule.id,confirmed_slot_at:'2026-10-10T06:00:00Z',requested_slot_at:'2026-10-10T06:00:00Z'})
 const completed=await application(a,'completed',{child_id:children[1].id,status:'completed',completed_at:new Date().toISOString(),registration_status:'not_enrolled',unregistered_reason:'schedule_mismatch',unregistered_reason_note:'보존 사유',consultation_note:'보존 상담 요약',regular_schedule_preference:{version:1,state:'undecided',groups:[]},next_contact_at:'2026-10-20T01:00:00Z'})
 await ok(db.from('application_logs').insert({application_id:completed,from_status:'confirmed',to_status:'completed',actor_id:a.id,note:'보존 활동 이력'}))
 await ok(db.from('trial_results').insert({application_id:completed,observations:['sustained_engagement'],public_summary:'보존 체험 결과',note:'보존 선생님 메모',created_by:studio.id,updated_by:studio.id}))
 await ok(db.from('consultation_logs').insert({application_id:completed,activity_type:'consultation',channel:'phone',note:'보존 상담 내용',time_flexibility:'flexible',registration_status_snapshot:'not_enrolled',unregistered_reason_snapshot:'schedule_mismatch',unregistered_reason_note_snapshot:'보존 미등록 사유',created_by:studio.id}))
 const reportId=await publishFixtureReport(db,completed)
 await ok(db.from('parent_report_engagement').insert({application_id:completed,parent_id:a.id,first_report_id:reportId}))
 await ok(db.from('parent_notification_reads').insert({parent_id:a.id,notification_key:'status:'+completed}))
 for(const [parent,label] of [[a,'completed'],[b,'otherCompleted'],[c,'thirdCompleted']]){
  const id=label==='completed'?completed:await application(parent,label,{status:'completed',completed_at:new Date().toISOString()})
  await ok(db.from('experience_feedback').insert({application_id:id,parent_id:parent.id,class_id:m.classId,organization_id:m.organizationId,program_type:'trial_class',selected_chip_ids:['kind_teacher'],private_note:'DELETE_PRIVATE_NOTE'}))
 }
 await ok(db.from('parent_decisions').insert({application_id:completed,parent_id:a.id,decision:'considering'}))
 const aggregateBefore=await ok(anon.rpc('get_public_class_feedback_summary',{p_class_id:m.classId}));assert(JSON.stringify(aggregateBefore).includes('kind_teacher'))
 const before={applications:await ok(db.from('trial_applications').select('*').in('id',[ongoing,completed]).order('id'))}
 for(const t of ['trial_results','consultation_logs','experience_reports','registration_results','application_logs'])before[t]=await rows(t,completed)
 assert(before.registration_results.length>0)
 await deny(anon.rpc('prepare_my_parent_account_deletion'),'anon denied')
 await deny(studio.client.rpc('prepare_my_parent_account_deletion'),'Studio denied')
 await deny(b.client.rpc('prepare_my_parent_account_deletion',{p_user_id:a.id}),'Parent B cannot supply A target ID')
 await deny(a.client.rpc('prepare_my_parent_account_deletion',{user_id:b.id}),'RPC has no arbitrary user ID parameter')
 assert((await ok(db.from('profiles').select('id').eq('id',a.id))).length===1)
 const blocker='deletion_blocker_'+prefix
 const sql=text=>cp.execFileSync('docker',['exec','-i','supabase_db_first-class-mvp','psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'],{input:text,encoding:'utf8'})
 sql(`create table app.${blocker}(id uuid references public.profiles(id) on delete restrict); insert into app.${blocker} values ('${a.id}');`)
 try {
  await deny(a.client.rpc('prepare_my_parent_account_deletion'),'late FK failure rolls whole cleanup transaction back')
  assert.equal((await ok(db.from('experience_feedback').select('id').eq('parent_id',a.id))).length,1)
  assert.equal((await ok(db.from('parent_decisions').select('id').eq('parent_id',a.id))).length,1)
  assert.equal(await ok(a.client.rpc('get_my_parent_account_deletion_status')),false)
  assert.equal((await ok(db.from('trial_applications').select('parent_id').eq('id',completed).single())).parent_id,a.id)
 } finally {sql(`drop table app.${blocker}`)}
 let authDeleteCalls=0
 const brokenPrepare={auth:a.client.auth,rpc:async()=>({error:{message:'mock cleanup failure'}})}
 const countingAdmin={auth:{admin:{deleteUser:async()=>{authDeleteCalls++;return {error:null}}}}}
 assert.equal((await run(brokenPrepare,countingAdmin)).status,'error');assert.equal(authDeleteCalls,0)
 pass('DB cleanup failure never calls Auth delete')
 const failAuth={storage:db.storage,auth:{admin:{deleteUser:async()=>({error:{code:'unexpected_failure',status:500}})}}}
 const partial=await run(a.client,failAuth);assert.equal(partial.status,'error');assert.equal(partial.cleanupStarted,true)
 await removedParent(a.id);assert((await ok(db.auth.admin.getUserById(a.id))).user);assert.equal(await ok(a.client.rpc('get_my_parent_account_deletion_status')),true)
 await deny(a.client.from('profiles').insert({id:a.id,role:'parent',name:'재생성 시도'}),'pending account cannot recreate profile')
 await deny(a.client.from('children').insert({parent_id:a.id,name:'새 자녀',grade:'초3'}),'pending account cannot create children')
 const repeated=await Promise.all(Array.from({length:6},()=>a.client.rpc('prepare_my_parent_account_deletion')));assert(repeated.every(r=>!r.error&&r.data==='db_cleaned'))
 pass('Auth failure keeps retry marker and account; personal data removed; 6 concurrent cleanup retries idempotent')
 const afterApps=await ok(db.from('trial_applications').select('*').in('id',[ongoing,completed]).order('id'))
 assert.deepEqual(afterApps.map(scrubOwners),before.applications.map(scrubOwners));assert(afterApps.every(r=>r.parent_id===null&&r.child_id===null));assert.equal(afterApps.find(r=>r.id===ongoing).status,'confirmed')
 for(const t of ['trial_results','consultation_logs','experience_reports','registration_results'])assert.deepEqual(await rows(t,completed),before[t],t)
 const fingerprints={applications:{count:afterApps.length,before:hash(before.applications.map(scrubOwners)),after:hash(afterApps.map(scrubOwners))}}
 for(const t of ['trial_results','consultation_logs','experience_reports','registration_results']){const after=await rows(t,completed);fingerprints[t]={count:after.length,before:hash(before[t]),after:hash(after)}}
 fs.writeFileSync(out+'/preservation-fingerprints.json',JSON.stringify(fingerprints,null,2))
 const logs=await rows('application_logs',completed);assert.equal(logs[0].actor_id,null);assert.deepEqual(logs.map(({actor_id,...r})=>r),before.application_logs.map(({actor_id,...r})=>r))
 pass('all Academy snapshots/history byte-identical except ownership/update timestamp; reservation/next-contact/status preserved')
 const aggregateAfter=await ok(anon.rpc('get_public_class_feedback_summary',{p_class_id:m.classId}));assert(!JSON.stringify(aggregateAfter).includes('kind_teacher'))
 pass('feedback/private-note/chips and ParentDecision deleted; public aggregate falls below threshold')
 assert.equal((await run(a.client,db)).status,'success');assert((await db.auth.admin.getUserById(a.id)).error);await removedParent(a.id)
 const oldTokenClient=client(env.ANON_KEY);await oldTokenClient.auth.setSession(a.session)
 const deniedOld=await a.client.from('my_trial_applications').select('id').in('id',[ongoing,completed]);assert(deniedOld.error || deniedOld.data.length===0)
 const newAccount=await ok(db.auth.admin.createUser({email:a.email,password:m.password,email_confirm:true}));assert.notEqual(newAccount.user.id,a.id)
 await ok(db.from('profiles').insert({id:newAccount.user.id,role:'parent',name:'재가입 부모'}))
 const rejoin=client(env.ANON_KEY);await ok(rejoin.auth.signInWithPassword({email:a.email,password:m.password}));assert.equal((await ok(rejoin.from('my_trial_applications').select('id'))).length,0);assert.equal((await ok(rejoin.from('children').select('id'))).length,0);assert.equal((await ok(rejoin.from('experience_feedback').select('id'))).length,0)
 m.rejoin={id:newAccount.user.id,email:a.email};save();pass('Auth deletion last; same email rejoin gets new UUID and zero old ownership/children/feedback')
 assert.equal((await run(empty.client,db)).status,'success');pass('Parent with no applications deletes successfully')
 const studioApps=await ok(studio.client.from('studio_trial_applications').select('id,child_name,parent_name,parent_phone').in('id',[ongoing,completed]));assert.equal(studioApps.length,2)
 for(const t of ['trial_results','consultation_logs','experience_reports','registration_results'])assert.equal((await ok(studio.client.from(t).select('*').eq('application_id',completed))).length,before[t].length)
 pass('Studio JWT can still read application/result/report/consultation/registration rows')
 // Fresh accounts for browser regression and user visual review, never Production.
 const browser=await account('browser'),review=await account('review'),recovery=await account('recovery')
 await application(browser,'browserNew');await application(review,'reviewNew');await application(recovery,'recoveryNew')
 await ok(recovery.client.rpc('prepare_my_parent_account_deletion'))
 save();fs.writeFileSync(out+'/db-results.json',JSON.stringify({results,aggregateBefore,aggregateAfter},null,2));console.log('Fixture evidence: '+out)
})().catch(e=>{console.error(e);process.exitCode=1})
