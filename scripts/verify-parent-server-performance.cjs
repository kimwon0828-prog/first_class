// Read-only fixtures: execute the real loaders with inert DB/auth dependencies.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')
const root = process.cwd()
function load(file, mocks = {}, extra = '') {
  const exports = {}
  const source = fs.readFileSync(path.join(root, file), 'utf8') + '\n' + extra
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText, { exports, Date, Map, Set, URL, Promise, console, process, require(name) {
    if (name in mocks) return mocks[name]
    if (name === 'server-only') return {}
    if (name.endsWith('.css')) return { default: {} }
    if (name === 'react/jsx-runtime') return require(name)
    if (name.startsWith('node:')) return require(name)
    return {}
  } })
  return exports
}
const pass = message => console.log('PASS ' + message)
const key = load('src/shared/lib/schedule-reservation-key.ts').buildScheduleOccurrenceReservationKey

async function slots() {
  const a = '2030-01-02T01:00:00.000Z', sameA = '2030-01-02T10:00:00+09:00', b = '2030-01-09T01:00:00.000Z'
  let calls = 0, pageCap = 1000, fail = false, noCount = false
  let reservations = [
    { id: 'a', class_id: 'class', class_schedule_id: 'weekly', requested_schedule_block_id: 'block', requested_slot_at: a, status: 'new' },
    { id: 'b', class_id: 'class', class_schedule_id: 'weekly', requested_schedule_block_id: null, requested_slot_at: a, status: 'reviewing' },
    { id: 'c', class_id: 'class', class_schedule_id: 'weekly', requested_schedule_block_id: null, requested_slot_at: sameA, status: 'confirmed' },
    { id: 'd', class_id: 'class', class_schedule_id: 'weekly', requested_schedule_block_id: null, requested_slot_at: b, status: 'confirmed' },
    ...['completed', 'canceled', 'no_show'].map((status, i) => ({ id: 'excluded'+i, class_id: 'class', class_schedule_id: 'weekly', requested_slot_at: a, status })),
    { id: 'other', class_id: 'other', class_schedule_id: 'other', requested_slot_at: a, status: 'new' }
  ]
  const client = { from(table) {
    assert.equal(table, 'trial_applications')
    const filters = [], q = {
      select(fields, options) { assert.equal(options.count, 'exact'); assert(!/phone|name|note|parent_id/.test(fields)); return q },
      eq(k, v) { filters.push(r => r[k] === v); return q },
      in(k, v) { filters.push(r => v.includes(r[k])); return q },
      order(k) { assert.equal(k, 'id'); return q },
      range(from, to) { calls++; const rows = reservations.filter(r => filters.every(f => f(r))); return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + pageCap)), count: noCount ? null : rows.length, error: fail ? { message: 'fixture error' } : null }) }
    }; return q
  } }
  const { counts } = load('src/shared/lib/db/supabase-adapter.ts', {
    '@/integrations/supabase/service-role': { getSupabaseServiceRoleClient: () => client },
    '@/shared/lib/schedule-reservation-key': { buildScheduleOccurrenceReservationKey: key }
  }, 'export const counts = getParentSlotReservationCounts')
  const blocks = [{ id: 'block', start_at: a }], ids = ['weekly', ...Array.from({length:759}, (_,i) => 'schedule'+i)]
  let result = await counts('class', blocks, ids)
  assert.equal(calls, 1, '760 schedules must not become eight sequential ID batches')
  assert.equal(result.byBlock.get('block'), 2, 'preserve exact block fallback matching')
  assert.equal(result.byOccurrence.get(key('weekly', a)), 3, 'same KST/UTC instant combines')
  assert.equal(result.byOccurrence.get(key('weekly', b)), 1, 'weekly dates remain distinct')
  assert.equal(result.byOccurrence.size, 2)
  calls=0;pageCap=2;result=await counts('class', blocks, ids)
  assert.equal(calls,2);assert.equal(result.byOccurrence.get(key('weekly',a)),3)
  calls=0;noCount=true;result=await counts('class',blocks,ids)
  assert.equal(calls,3);assert.equal(result.byOccurrence.get(key('weekly',a)),3)
  fail=true;await assert.rejects(()=>counts('class',blocks,ids),/failed_to_fetch_available_schedule_slots/)
  fail=false;reservations=[];calls=0;result=await counts('class',blocks,ids);assert.equal(result.byBlock.size,0);assert.equal(calls,1)
  pass('slot aggregate: 760 schedules → one query, pagination/caps, active-only, class scope, KST occurrence, empty/error')
}

async function signals() {
  let childError = false, reportError = false, started = [], releases = [], decisionCalls = 0
  const blocked = (label, value) => { started.push(label);return new Promise(resolve=>releases.push(()=>resolve(value))) }
  const { getParentExperienceSignals: read } = load('src/features/record/queries/get-parent-experience-signals.ts', {
    '@/features/children/queries/get-my-children': { getMyChildren: async()=>({data:[{id:'own-child'}],error:childError?'error':null}) },
    '@/shared/lib/db': {dataAdapter: {
      listMyPublishedReportsByChild: async()=>{if(reportError)throw Error('fixture');return blocked('child',[{experienceId:'own'},{experienceId:'not-a-candidate'}])},
      getPublishedExperienceReport: async()=>blocked('legacy',{}),
      getCurrentParentDecision: async()=>{decisionCalls++;return null}
    }}
  })
  const pending=read([{id:'own',childId:'own-child'},{id:'legacy',childId:null}])
  await new Promise(r=>setImmediate(r));assert.deepEqual(started,['child','legacy']);assert.equal(decisionCalls,0)
  releases.forEach(release=>release());const result=await pending
  assert.equal(result.error,null);assert.deepEqual([...result.reportedExperienceIds],['own','legacy']);assert.equal(decisionCalls,2)
  childError=true;assert((await read([{id:'own'}])).error);assert.equal(decisionCalls,2)
  childError=false;reportError=true;releases=[];const failed=read([{id:'own',childId:'own-child'}]);assert((await failed).error)
  assert.equal((await read([])).reportedExperienceIds.size,0)
  pass('record signals: child/legacy reads overlap; candidates, child failure, report failure and decision gates preserved')
}

async function detail() {
  let allowed=true, own=true, completed=true, starts=[], releases=[]
  const blocked=(label,value)=>{starts.push(label);return new Promise(resolve=>releases.push(()=>resolve(value)))}
  const api=load('app/record/[experienceId]/page.tsx',{
    '@/features/my/lib/require-parent-access':{requireParentAccess:async()=>{if(!allowed)throw Error('denied')}},
    '@/features/classes/lib/parent-navigation':{parentEntryHref:x=>x},
    '@/features/record/queries/get-my-experience-detail':{getMyExperienceDetailResult:async()=>({error:null,data:own?{id:'own',status:completed?'completed':'confirmed',childId:'child'}:null})},
    '@/features/record/queries/get-record-child-context':{getRecordChildContext:()=>blocked('context',null)},
    '@/features/record/queries/get-my-experience-report':{getMyExperienceReport:()=>blocked('report',{status:'unavailable'})},
    '@/features/children/queries/get-my-children':{getMyChildren:()=>blocked('children',{data:[],error:null})},
    '@/features/record/lib/record-href':{withRecordChild:x=>x},
    '@/features/record/lib/experience-view':{getExperienceTypeLabel:()=>'',resolveParentExperienceDate:()=>null,resolveExperienceStage:()=>'',getExperienceStageLabel:()=>''},
    '@/shared/lib/seoul-datetime':{getSeoulDateTimeParts:()=>null},
    'next/cache':{unstable_noStore:()=>{}},'next/navigation':{notFound:()=>{throw Error('not-found')}}
  })
  const props={params:Promise.resolve({experienceId:'own'}),searchParams:Promise.resolve({child:'child'})}
  const p=api.default(props);await new Promise(r=>setImmediate(r));assert.deepEqual(starts,['context','report','children']);releases.forEach(f=>f());await p
  starts=[];allowed=false;await assert.rejects(()=>api.default(props),/denied/);assert.equal(starts.length,0)
  allowed=true;own=false;await assert.rejects(()=>api.default(props),/not-found/);assert.equal(starts.length,0)
  own=true;completed=false;releases=[];const active=api.default(props);await new Promise(r=>setImmediate(r));assert.deepEqual(starts,['context']);releases.forEach(f=>f());await active
  pass('detail waterfall: reads overlap only after ownership; denied/foreign/active experiences keep existing gates')
}

async function reportOwnership() {
  let detail = { data: null, error: null }, reads = 0
  const { getMyExperienceReport: read } = load('src/features/record/queries/get-my-experience-report.ts', {
    react: { cache: fn => fn },
    '@/features/record/queries/get-my-experience-detail': { getMyExperienceDetailResult: async () => detail },
    '@/shared/lib/db': { dataAdapter: { getPublishedExperienceReport: async () => { reads++; return null } } }
  })
  assert.equal((await read('foreign')).status, 'not_found'); assert.equal(reads, 0)
  detail = { data: null, error: 'failed' }; assert.equal((await read('own')).status, 'error'); assert.equal(reads, 0)
  detail = { data: { id: 'own' }, error: null }; assert.equal((await read('own')).status, 'unavailable'); assert.equal(reads, 1)
  pass('real report loader: foreign experience and ownership failure never reach report read')
}

function runtimeAudit() {
  const file = process.env.PARENT_PERF_FETCH_LOG
  if (!file) return
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const samples = new Map()
  for (const row of rows) {
    if (!/:[0-2]:[0-5]$/.test(row.sample || '') || !row.key) continue
    if (!samples.has(row.sample)) samples.set(row.sample, [])
    samples.get(row.sample).push(row)
  }
  for (const queries of samples.values()) {
    assert.equal(new Set(queries.map(q => q.key)).size, queries.length, 'duplicate network query in one render')
    const count = operation => queries.filter(q => q.operation === operation).length
    if (['/my','/my/schedule','/record','/record/[id]'].includes(queries[0].route)) {
      assert(count('db.profiles') <= (queries[0].route === '/my' ? 2 : 1))
      assert(count('db.children') <= 1)
    }
    if (queries[0].route === '/classes/[id]') assert.equal(count('db.trial_applications'), 1)
  }
  assert(samples.size > 0)
  pass('measured renders: no duplicate query; auth profile/children ceilings; detail reservation query = 1')
}

function bundleAudit() {
  const dir=process.env.PARENT_PERF_BUILD_DIR
  if(!dir)return pass('bundle audit available with PARENT_PERF_BUILD_DIR (no dependency installs)')
  const m=JSON.parse(fs.readFileSync(path.join(dir,'app-build-manifest.json')))
  const files=new Set([...m.pages['/layout'],...m.pages['/my/page']].filter(x=>x.endsWith('.js')))
  const gzip=require('node:zlib').gzipSync
  const size=[...files].reduce((n,p)=>n+gzip(fs.readFileSync(path.join(dir,p))).length,0)
  const ceiling=Number(process.env.PARENT_PERF_MY_GZIP_CEILING || 185000)
  assert(size<=ceiling,`My initial union gzip ${size} exceeds ${ceiling}`)
  pass(`My shared+route unique JS gzip ${size} bytes ≤ ${ceiling}`)
}
;(async()=>{await slots();await signals();await detail();await reportOwnership();runtimeAudit();bundleAudit()})().catch(error=>{console.error(error);process.exitCode=1})
