// Actual Cases query with an in-memory, read-only PostgREST boundary. No DB/network.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const esbuild = require(process.env.ESBUILD_MODULE_PATH || 'esbuild')
const out = process.env.CASES_QA_OUTPUT || fs.mkdtempSync('/tmp/cases-qc2-query-')
fs.mkdirSync(out, {recursive:true})
const base = { child_name:'TEST',child_grade:'초3',parent_name:'TEST guardian',parent_phone:'000',assigned_teacher_id:null,
  class_id:'class-a',classes:{id:'class-a',title:'TEST class',subject:'math',organization_id:'org-a'},class_schedules:null,
  status:'completed',registration_status:'undecided',registration_reason_ids:[],created_at:'2026-01-01T00:00:00Z',
  requested_slot_at:null,confirmed_slot_at:null,confirmed_block:null,completed_at:'2026-02-01T00:00:00Z',
  enrolled_at:null,lost_at:null,canceled_at:null,no_show_at:null,next_contact_at:null,record:null,report:[] }
const day = n => new Date(Date.UTC(2026,6,1+n)).toISOString()
const rows = [
  ...Array.from({length:31},(_,i)=>({...base,id:'new-'+String(i).padStart(2,'0'),child_name:'receipt '+i,status:'new',requested_slot_at:day(31-i),completed_at:null})),
  {...base,id:'new-null',child_name:'receipt missing time',status:'new',completed_at:null},
  {...base,id:'confirmed',status:'confirmed',confirmed_slot_at:day(0)},
  ...Array.from({length:31},(_,i)=>({...base,id:'lost-'+String(i).padStart(2,'0'),child_name:'outcome '+i,registration_status:'not_enrolled',lost_at:day(i),completed_at:day(31-i)})),
  {...base,id:'pending-due',registration_status:'pending',next_contact_at:'2020-01-01T00:00:00Z'},
  {...base,id:'pending-future',registration_status:'pending',next_contact_at:'2035-01-01T00:00:00Z'},
  {...base,id:'pending-null',registration_status:'pending',completed_at:'2025-01-01T00:00:00Z'},
  {...base,id:'undecided'}, {...base,id:'null-result',registration_status:null},
  {...base,id:'report-preview',record:{application_id:'report-preview',created_at:day(1)},report:[]},
  {...base,id:'reviewing',status:'reviewing',completed_at:null},
  {...base,id:'confirmed-future',status:'confirmed',completed_at:null,confirmed_slot_at:'2035-01-01T00:00:00Z'},
  {...base,id:'confirmed-in-trial',status:'confirmed',completed_at:null,confirmed_slot_at:new Date(Date.now()-600000).toISOString(),confirmed_block:{start_at:new Date(Date.now()-600000).toISOString(),end_at:new Date(Date.now()+3000000).toISOString()}},
  {...base,id:'confirmed-ended',status:'confirmed',completed_at:null,confirmed_slot_at:new Date(Date.now()-7200000).toISOString(),confirmed_block:{start_at:new Date(Date.now()-7200000).toISOString(),end_at:new Date(Date.now()-3600000).toISOString()}}, {...base,id:'new-pending',status:'new',registration_status:'pending'},
  {...base,id:'cancel',status:'canceled',canceled_at:day(2)},
  {...base,id:'no-show',status:'canceled',canceled_at:day(3),no_show_at:day(3)},
  {...base,id:'foreign',status:'new',classes:{...base.classes,organization_id:'org-b'}}
]
const tables = {studio_trial_applications:rows,classes:[{id:'class-a',title:'TEST class',organization_id:'org-a'}],teachers:[],consultation_logs:[],
  registration_results:rows.filter(x=>x.id.startsWith('lost-')).map(x=>({id:'result-'+x.id,application_id:x.id,result:'not_enrolled',resolved_at:x.lost_at,superseded_at:null})),
  application_logs:[{id:'pending-transition',application_id:'pending-due',from_status:'completed',to_status:'completed',created_at:day(5),note:JSON.stringify({event:'registration_result_saved',before:{status:'undecided'},after:{status:'pending'}})}]}
// Generic predicate evaluator, independent of Cases membership/sort helpers.
function parts(text) {let depth=0,start=0,out=[];for(let i=0;i<text.length;i++){if(text[i]==='(')depth++;if(text[i]===')')depth--;if(text[i]===','&&!depth){out.push(text.slice(start,i));start=i+1}}return [...out,text.slice(start)]}
const value = (row,key) => key.split('.').reduce((v,k)=>v?.[k],row)
function match(row,text) {
  if(text.startsWith('and('))return parts(text.slice(4,-1)).every(x=>match(row,x))
  if(text.startsWith('or('))return parts(text.slice(3,-1)).some(x=>match(row,x))
  const m=text.match(/^(.+?)\.(not\.is|is|neq|eq|in|ilike|like)\.(.*)$/);assert(m,'unknown predicate '+text)
  const [,key,op,target]=m;let v=value(row,key);if(Array.isArray(v)&&!v.length)v=null
  if(op==='is'||op==='not.is')return (v==null)===(op==='is')
  if(op==='in')return target.slice(1,-1).split(',').includes(v)
  if(op==='eq')return v===target
  if(op==='neq')return v!=null&&v!==target
  return String(v||'').toLowerCase().includes(target.replace(/[%*]/g,'').toLowerCase())
}
let failHistory=false, omitCount=false
const reads=[]
const client={from(table){assert(table in tables);const filters=[],orders=[];let from=0,to=Infinity,wantsCount=false
  const query={select(_fields,options){wantsCount=!!options?.count;return query},
    eq(k,v){filters.push(r=>value(r,k)===v);return query},in(k,vs){filters.push(r=>vs.includes(value(r,k)));return query},
    is(k,v){filters.push(r=>value(r,k)===v);return query},or(s){filters.push(r=>parts(s).some(x=>match(r,x)));return query},
    ilike(k,v){filters.push(r=>String(value(r,k)||'').toLowerCase().includes(v.replace(/%/g,'').toLowerCase()));return query},
    order(k,o={}){orders.push([k,o.ascending!==false]);return query},range(a,b){from=a;to=b;return query},
    then(resolve,reject){return Promise.resolve().then(()=>{reads.push({table,from,to});if(failHistory&&table==='application_logs')return{data:null,count:null,error:{code:'denied'}}
      let matched=tables[table].filter(r=>filters.every(f=>f(r)));matched.sort((a,b)=>{for(const [k,asc]of orders){const av=value(a,k),bv=value(b,k);if(av!==bv)return (av<bv?-1:1)*(asc?1:-1)}return 0})
      return {data:matched.slice(from,Math.min(to+1,from+7)),count:wantsCount&&!omitCount?matched.length:null,error:null}
    }).then(resolve,reject)}};return query}}
;(async()=>{
  global.__casesClient=client
  await esbuild.build({stdin:{contents:`export {getStudioCases} from './src/features/studio/queries/get-studio-cases'`,resolveDir:process.cwd(),loader:'ts'},outfile:path.join(out,'query.cjs'),bundle:true,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'boundary',setup(b){b.onResolve({filter:/^(server-only|@\/integrations\/supabase\/server)$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='server-only'?'':`export const getSupabaseServerClient=async()=>global.__casesClient`,loader:'js'}))}}]})
  const {getStudioCases}=require(path.resolve(out,'query.cjs'))
  async function get(options){const r=await getStudioCases('org-a',options);assert.equal(r.error,null);return r.data}
  const first=await get({view:'active',filter:'schedule_needed',query:'receipt',page:1}),second=await get({view:'active',filter:'schedule_needed',query:'receipt',page:2})
  assert.deepEqual([first.totalCount,first.items.length,second.items.length],[32,25,7])
  assert.deepEqual([...first.items,...second.items].map(x=>x.id),[...Array.from({length:31},(_,i)=>'new-'+String(30-i).padStart(2,'0')),'new-null'])
  const active=await get({view:'active',filter:'all'});assert.equal(active.items[0].id,'new-30')
  const lost1=await get({view:'closed',filter:'not_enrolled',query:'outcome',page:1}),lost2=await get({view:'closed',filter:'not_enrolled',query:'outcome',page:2})
  assert.deepEqual([lost1.totalCount,lost1.items.length,lost2.items.length],[31,25,6])
  assert.deepEqual([...lost1.items,...lost2.items].map(x=>x.id),Array.from({length:31},(_,i)=>'lost-'+String(30-i).padStart(2,'0')))
  const pending=await get({view:'closed',filter:'pending'});assert.equal(pending.totalCount,3)
  assert.deepEqual(pending.items.map(x=>x.id),['pending-due','pending-null','pending-future'])
  assert.equal(pending.items[0].resultRecord.at,day(5));assert.equal(pending.items[1].resultRecord.at,null)
  const all=[await get({view:'closed',filter:'all',page:1}),await get({view:'closed',filter:'all',page:2})]
  assert.equal(all[0].totalCount,39);assert.equal(new Set(all.flatMap(p=>p.items.map(x=>x.id))).size,39)
  for(const p of pending.items)assert(all.some(page=>page.items.some(x=>x.id===p.id)))
  assert(!all.some(page=>page.items.some(x=>['new-pending','foreign'].includes(x.id))))
  assert(all.some(p=>p.items.some(x=>x.id==='null-result')));const closedIds=all.flatMap(p=>p.items.map(x=>x.id));assert(closedIds.includes('undecided'));const activePages=[active,await get({view:'active',filter:'all',page:2})];const activeIds=activePages.flatMap(p=>p.items.map(x=>x.id));assert.equal(activeIds.length+closedIds.length,rows.length-1);assert.equal(new Set([...activeIds,...closedIds]).size,rows.length-1);const confirmed=await get({view:'active',filter:'confirmed'});assert.deepEqual(confirmed.items.map(x=>x.id),['confirmed','confirmed-ended','confirmed-in-trial','confirmed-future']);assert(confirmed.items.every(x=>!x.workflow.closed));const completedPreview=await get({view:'closed',filter:'all',query:'TEST'});const previewItem=all.flatMap(p=>p.items).find(x=>x.id==='report-preview');assert.equal(previewItem.workflow.action,'report');assert.equal(previewItem.workflow.closed,true);const before=lost1.items.map(x=>x.id);tables.consultation_logs.push({id:'contact',application_id:'lost-00',activity_type:'CONSULTATION',occurred_at:'2030-01-01T00:00:00Z'})
  assert.deepEqual((await get({view:'closed',filter:'not_enrolled',query:'outcome',page:1})).items.map(x=>x.id),before)
  for(const q of ['TEST guardian','000','TEST class'])assert.equal((await get({view:'closed',filter:'pending',query:q})).totalCount,3)
  assert.equal((await get({view:'closed',filter:'pending',query:'no-match'})).totalCount,0)
  const beyond=await get({view:'closed',filter:'not_enrolled',query:'outcome',page:9});assert.equal(beyond.items.length,0);assert.equal(beyond.totalCount,31)
  assert.equal((await getStudioCases('no-org',{view:'closed',filter:'all'})).data.totalCount,0)
  failHistory=true;assert((await getStudioCases('org-a',{view:'closed',filter:'all'})).error);failHistory=false
  omitCount=true;assert((await getStudioCases('org-a',{view:'active',filter:'all'})).error);omitCount=false
  assert(reads.some(r=>r.table==='studio_trial_applications'&&r.from===28));assert(reads.some(r=>r.table==='registration_results'&&r.from===28))
  fs.writeFileSync(path.join(out,'browser-fixtures.json'),JSON.stringify({first,second,lost1,lost2,pending,all:all[0]}))
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,serverRowCap:7,receiptPages:[25,7],resultPages:[25,6],pendingCount:3,closedTotal:39,historyFailureClosed:true,contactEditStable:true}))
  console.log('PASS QC2 actual query: capped full-cohort/history reads, global order before 25-row pages, closed union/counts, pending null/new exclusion, search fields, old receipts, out-of-range, organization scope, contact stability, failure states')
})().catch(e=>{console.error(e);process.exitCode=1})
