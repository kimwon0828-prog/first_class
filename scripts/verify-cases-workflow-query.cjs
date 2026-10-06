// LOCAL ONLY. Actual Cases query + authenticated PostgREST/RLS, isolated new applications.
// Usage: PHASE1_FIXTURES=/path/to/local/fixtures.json node scripts/verify-cases-workflow-query.cjs
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict'),{randomUUID}=require('crypto')
const {createClient}=require('@supabase/supabase-js'),esbuild=require(process.env.ESBUILD_MODULE_PATH||'esbuild')
const out=process.env.CASES_QA_OUTPUT||fs.mkdtempSync('/tmp/cases-query-');fs.mkdirSync(out,{recursive:true})
const env=Object.fromEntries(cp.execFileSync('supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\n').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^"|"$/g,'')]}))
assert(['localhost','127.0.0.1'].includes(new URL(env.API_URL).hostname),'Local only')
const m=JSON.parse(fs.readFileSync(process.env.PHASE1_FIXTURES,'utf8')),studio=m.accounts.find(a=>a.label==='studio'),other=m.accounts.find(a=>a.label==='otherStudio')
const make=key=>createClient(env.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),service=make(env.SERVICE_ROLE_KEY),client=make(env.ANON_KEY)
const ok=async q=>{const r=await q;if(r.error)throw Error(r.error.message);return r.data}
const ids=Array.from({length:31},()=>randomUUID()),token='CASES-QA-'+randomUUID().slice(0,8)
fs.writeFileSync(path.join(out,'temporary-application-ids.json'),JSON.stringify(ids))
;(async()=>{
 await ok(client.auth.signInWithPassword({email:studio.email,password:m.password}));global.__casesClient=client
 await esbuild.build({stdin:{contents:`export {getStudioCases} from './src/features/studio/queries/get-studio-cases';export {deriveCasesWorkflow} from './src/features/studio/lib/cases-workflow';`,resolveDir:process.cwd(),loader:'ts'},outfile:path.join(out,'query.cjs'),bundle:true,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'query-boundary',setup(b){b.onResolve({filter:/^(server-only|@\/integrations\/supabase\/server)$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='server-only'?'':`export const getSupabaseServerClient=async()=>global.__casesClient`,loader:'js'}))}}]})
 const {getStudioCases,deriveCasesWorkflow}=require(path.resolve(out,'query.cjs'))
 // Only this run’s new applications are mutated; no original fixture or finalized record/report mutation.
 await ok(service.from('trial_applications').insert(ids.map((id,index)=>({id,class_id:m.classId,parent_id:m.accounts.find(a=>a.label==='parent1').id,child_name:token+' '+index,child_grade:'초3',parent_name:token+' guardian',parent_phone:'01011112222',status:'new',requested_slot_at:new Date().toISOString()}))))
 const raw=await ok(client.from('studio_trial_applications').select('id,status,registration_status,registration_reason_ids,canceled_at,no_show_at,confirmed_slot_at,confirmed_block:schedule_blocks!trial_applications_confirmed_schedule_block_id_fkey(start_at,end_at),record:trial_results(application_id),report:experience_reports(application_id),classes!inner(organization_id)').eq('classes.organization_id',m.organizationId))
 const expected=raw.map(r=>({id:r.id,registration:r.registration_status,status:r.status,terminal:!!r.canceled_at||!!r.no_show_at||r.status==='canceled',w:deriveCasesWorkflow({status:r.status,registrationStatus:r.registration_status,canceledAt:r.canceled_at,noShowAt:r.no_show_at,confirmedSlotAt:r.confirmed_slot_at,confirmedBlockStartAt:r.confirmed_block?.start_at??null,confirmedBlockEndAt:r.confirmed_block?.end_at??null,scheduleStartTime:null,scheduleEndTime:null,recordFinalized:Array.isArray(r.record)?r.record.length>0:!!r.record,reportSent:r.report.length>0})}))
 for(const [view,filters] of [['active',['all','schedule_needed','confirmed']],['closed',['all','pending','enrolled','not_enrolled','canceled','no_show']]]){
  const partition=[]
  for(const filter of filters){const matches=expected.filter(r=>r.w.closed===(view==='closed')&&(filter==='all'||r.w.filter===filter));let actual=[]
   for(let page=1;page<=Math.max(1,Math.ceil(matches.length/25));page++){const r=await getStudioCases(m.organizationId,{view,filter,page});assert.equal(r.error,null,view+'/'+filter);assert.equal(r.data.totalCount,matches.length);assert(r.data.items.length<=25);for(const item of r.data.items)assert.deepEqual(item.registrationReasonIds,raw.find(row=>row.id===item.id).registration_reason_ids??[]);actual.push(...r.data.items.map(i=>i.id))}
   assert.deepEqual([...actual].sort(),matches.map(r=>r.id).sort(),view+'/'+filter);if(filter!=='all')partition.push(...actual)
  }
  assert.equal(new Set(partition).size,partition.length);if(view==='active')assert.equal(partition.length,expected.filter(r=>!r.w.closed).length)
 }
 const search=await getStudioCases(m.organizationId,{view:'active',filter:'schedule_needed',query:token,page:1}),second=await getStudioCases(m.organizationId,{view:'active',filter:'schedule_needed',query:token,page:2});assert.equal(search.error,null);assert.equal(second.error,null);assert.equal(search.data.totalCount,31);assert.equal(search.data.items.length,25);assert.equal(second.data.items.length,6);assert.equal(new Set([...search.data.items,...second.data.items].map(i=>i.id)).size,31)
 for(const query of [token+' guardian','01011112222','TEST WORKFLOW PHASE 1']){const r=await getStudioCases(m.organizationId,{view:'active',filter:'schedule_needed',query});assert.equal(r.error,null);assert(r.data.totalCount>=31)}
 const beyond=await getStudioCases(m.organizationId,{view:'active',filter:'schedule_needed',query:token,page:3});assert.equal(beyond.data.items.length,0);assert.equal(beyond.data.totalCount,31)
 // Reuse the same 31 temporary rows for result-axis pagination with unfinished work.
 for(const status of ['not_enrolled','enrolled']){
  await ok(service.from('trial_applications').update({status:'completed',completed_at:new Date().toISOString(),registration_status:status,registration_reason_ids:status==='not_enrolled'?['schedule_mismatch']:[]}).in('id',ids))
  const pages=await Promise.all([1,2].map(page=>getStudioCases(m.organizationId,{view:'closed',filter:status,query:token,page})))
  for(const r of pages){assert.equal(r.error,null);assert.equal(r.data.totalCount,31)}
  assert.deepEqual(pages.map(r=>r.data.items.length),[25,6]);assert.equal(new Set(pages.flatMap(r=>r.data.items.map(i=>i.id))).size,31)
  assert(pages.flatMap(r=>r.data.items).every(i=>i.workflow.action==='record'&&i.workflow.closed))
  const work=await getStudioCases(m.organizationId,{view:'active',filter:'all',query:token});assert.equal(work.data.totalCount,0)
  const closedAll=await getStudioCases(m.organizationId,{view:'closed',filter:'all',query:token});assert.equal(closedAll.data.totalCount,31)
  const beyondResult=await getStudioCases(m.organizationId,{view:'closed',filter:status,query:token,page:3});assert.equal(beyondResult.error,null);assert.equal(beyondResult.data.totalCount,31);assert.equal(beyondResult.data.items.length,0)
 }
 const oc=make(env.ANON_KEY);await ok(oc.auth.signInWithPassword({email:other.email,password:m.password}));global.__casesClient=oc;assert.equal((await getStudioCases(m.organizationId,{view:'active',filter:'all'})).data.totalCount,0)
 fs.writeFileSync(path.join(out,'query-results.json'),JSON.stringify({passed:true,fixtures:raw.length,filters:9,searchFields:4,pagination:'new + not_enrolled + enrolled: 25 + 6 / exact total 31',topTabsDisjoint:true,otherOrgHidden:true},null,2));console.log('PASS actual Cases query: 9 filters/counts, trial-based disjoint membership, 31-row new/not-enrolled/enrolled search + 25/6 pagination, 4 search fields, out-of-range, other organization RLS')
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await ok(service.from('registration_results').delete().in('application_id',ids));await ok(service.from('trial_applications').delete().in('id',ids));console.log('Removed only this verifier’s 31 new Local fixtures')})
