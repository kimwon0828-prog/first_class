// Offline (in-memory fake PostgREST, no DB): the grouped slot read returns exactly what the single-class read returns
// on every path — weekly/one-time class schedules (hidden, closed, block capacity, occurrence counts), class blocks,
// teacher fallback blocks, inactive/unknown classes, date closures — and stays equal when pages are capped at 3 rows.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
const DAY=864e5,now=Date.now(),iso=ms=>new Date(ms).toISOString().replace('.000Z','+00:00');
const seoulDate=ms=>new Date(ms).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
const ids={weekly:'c-weekly',hidden:'c-hidden',block:'c-block',fallback:'c-fallback',inactive:'c-inactive',empty:'c-empty',other:'c-other-teacher'};
const day=(n)=>seoulDate(now+n*DAY);
const tables={
 classes:[{id:ids.weekly,teacher_id:'t1',is_active:true,archived_at:null},{id:ids.hidden,teacher_id:'t1',is_active:true,archived_at:null},{id:ids.block,teacher_id:'t1',is_active:true,archived_at:null},
  {id:ids.fallback,teacher_id:'t2',is_active:true,archived_at:null},{id:ids.other,teacher_id:'t2',is_active:true,archived_at:null},{id:ids.inactive,teacher_id:'t1',is_active:false,archived_at:null},{id:ids.empty,teacher_id:null,is_active:true,archived_at:null}],
 class_schedules:[
  {id:'s-w',class_id:ids.weekly,schedule_type:'weekly',booking_status:'open',day_of_week:new Date(now+3*DAY).getDay(),specific_date:null,series_id:null,start_time:'15:00:00',end_time:'15:50:00',capacity:2,display_label:null,sort_order:1,created_at:'2026-01-01'},
  {id:'s-o',class_id:ids.weekly,schedule_type:'one_time',booking_status:'closed',day_of_week:null,specific_date:day(4),series_id:null,start_time:'10:00:00',end_time:'11:00:00',capacity:1,display_label:null,sort_order:2,created_at:'2026-01-01'},
  {id:'s-o2',class_id:ids.weekly,schedule_type:'one_time',booking_status:'open',day_of_week:null,specific_date:day(5),series_id:null,start_time:'09:00:00',end_time:'09:40:00',capacity:3,display_label:null,sort_order:3,created_at:'2026-01-02'},
  {id:'s-x',class_id:ids.weekly,schedule_type:'one_time',booking_status:'hidden',day_of_week:null,specific_date:day(6),series_id:null,start_time:'09:00:00',end_time:'09:40:00',capacity:3,display_label:null,sort_order:4,created_at:'2026-01-03'},
  {id:'s-h',class_id:ids.hidden,schedule_type:'one_time',booking_status:'hidden',day_of_week:null,specific_date:day(3),series_id:null,start_time:'09:00:00',end_time:'10:00:00',capacity:1,display_label:null,sort_order:1,created_at:'2026-01-01'}],
 schedule_blocks:[],trial_applications:[]
};
// One-time 09:00 KST on day 5 = 00:00 UTC; a matching available block gives it a capacity of 1 that one application fills.
const kstAt=(n,hh,mm)=>{const d=day(n);return iso(Date.parse(`${d}T${hh}:${mm}:00+09:00`))};
tables.schedule_blocks.push({id:'b-match',teacher_id:'t1',class_id:ids.weekly,start_at:kstAt(5,'09','00'),end_at:kstAt(5,'09','40'),capacity:1,type:'available'});
for(let n=2;n<9;n++)tables.schedule_blocks.push({id:'b-'+n,teacher_id:'t1',class_id:ids.block,start_at:iso(now+n*DAY),end_at:iso(now+n*DAY+3600e3),capacity:n%3?2:1,type:n===4?'blocked':'available'});
tables.schedule_blocks.push({id:'b-past',teacher_id:'t1',class_id:ids.block,start_at:iso(now+0.5*DAY),end_at:iso(now+0.5*DAY+3600e3),capacity:1,type:'available'});
for(let n=2;n<6;n++)tables.schedule_blocks.push({id:'tb-'+n,teacher_id:'t2',class_id:null,start_at:iso(now+n*DAY+7200e3),end_at:iso(now+n*DAY+9000e3),capacity:1,type:'available'});
const app=(id,class_id,extra)=>({id,class_id,status:'confirmed',requested_schedule_block_id:null,requested_slot_at:null,class_schedule_id:null,...extra});
tables.trial_applications.push(app('a1',ids.weekly,{requested_schedule_block_id:'b-match'}),app('a2',ids.weekly,{class_schedule_id:'s-w',requested_slot_at:null}),
 app('a3',ids.block,{requested_schedule_block_id:'b-2'}),app('a4',ids.block,{requested_slot_at:tables.schedule_blocks.find(b=>b.id==='b-3').start_at}),app('a5',ids.block,{requested_schedule_block_id:'b-5',status:'cancelled'}),
 app('a6',ids.other,{requested_schedule_block_id:'tb-2'}),app('a7',ids.fallback,{requested_slot_at:tables.schedule_blocks.find(b=>b.id==='tb-3').start_at}));
// Weekly occurrence count of the next weekly slot from a2: match it to the first upcoming occurrence later (filled below).
const closedDates=new Set([day(7)]);
function client(pageCap){
 const classOf=id=>tables.classes.find(c=>c.id===id);
 return {from(table){
  const filters=[],orders=[];let range=null,count=false,embed=false;
  const self={select(fields,opts){count=Boolean(opts?.count);embed=String(fields).includes('classes!inner');return self},eq(c,v){filters.push(r=>value(r,c)===v);return self},in(c,v){filters.push(r=>v.includes(value(r,c)));return self},
   is(c,v){filters.push(r=>value(r,c)===v);return self},gt(c,v){filters.push(r=>Date.parse(value(r,c))>Date.parse(v));return self},order(c,o){orders.push([c,o?.ascending!==false]);return self},range(a,b){range=[a,b];return self},
   maybeSingle(){return run().then(r=>({...r,data:r.data[0]??null}))},then(ok,bad){return run().then(ok,bad)}};
  const value=(r,c)=>c.startsWith('classes.')?classOf(r.class_id)?.[c.slice(8)]:r[c];
  const run=async()=>{let rows=tables[table].filter(r=>filters.every(f=>f(r)));
   rows=[...rows].sort((a,b)=>{for(const [c,asc] of orders){const x=a[c]??'',y=b[c]??'';if(x<y)return asc?-1:1;if(x>y)return asc?1:-1}return 0});
   const total=rows.length;if(range)rows=rows.slice(range[0],Math.min(range[1]+1,range[0]+pageCap));
   if(embed)rows=rows.map(r=>({...r,classes:{teacher_id:classOf(r.class_id)?.teacher_id}}));
   return {data:rows.map(r=>({...r})),count:count?total:null,error:null}};
  return self},
  rpc(name,args){assert.equal(name,'get_closed_booking_slot_indexes');return Promise.resolve({data:args.p_starts.map((s,i)=>closedDates.has(seoulDate(Date.parse(s)))?i+1:0).filter(Boolean),error:null})}};
}
let active=client(Infinity);
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file).exports;
 const m={exports:{}};cache.set(file,m);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const resolve=name=>{
  if(name==='server-only')return {};
  if(name==='@/integrations/supabase/service-role')return {getSupabaseServiceRoleClient:()=>active};
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.join(root,'src',name.slice(2)):path.resolve(path.dirname(file),name);for(const ext of ['.ts','.tsx','/index.ts','/index.tsx'])if(fs.existsSync(base+ext))return load(base+ext)}
  return require(require.resolve(name,{paths:[root]}));
 };
 new Function('require','module','exports',code)(resolve,m,m.exports);
 return m.exports;
}
const adapter=load(path.join(root,'src/shared/lib/db/supabase-adapter.ts'));
(async()=>{
 const all=Object.values(ids);
 active=client(Infinity);const single=new Map();for(const id of all)single.set(id,await adapter.listAvailableScheduleSlotsByClassIdWithClient({classId:id,supabase:active}));
 // Sanity: each path produced what the fixture intends (so equality below is not trivially empty).
 assert.ok(single.get(ids.weekly).some(s=>s.isClosed)&&single.get(ids.weekly).some(s=>!s.isClosed),'weekly: open and closed occurrences');
 assert.ok(single.get(ids.weekly).every(s=>s.bookingStatus!=='hidden'));assert.deepEqual(single.get(ids.hidden),[]);
 assert.ok(single.get(ids.block).length>=4&&single.get(ids.block).some(s=>s.remainingCount===0));assert.ok(!single.get(ids.block).some(s=>s.scheduleBlockId==='b-past'||s.scheduleBlockId==='b-4'));
 assert.ok(single.get(ids.fallback).length>=2&&single.get(ids.fallback).some(s=>s.remainingCount===0),'teacher fallback with counts across the teacher');
 assert.deepEqual(single.get(ids.inactive),[]);assert.deepEqual(single.get(ids.empty),[]);
 assert.ok(!single.get(ids.block).some(s=>seoulDate(Date.parse(s.startAt))===day(7)),'date closure removed');
 for(const cap of [Infinity,3]){
  active=client(cap);const grouped=await adapter.listAvailableScheduleSlotsByClassIdsWithClient({classIds:[...all,ids.weekly],supabase:active});
  for(const id of all){assert.equal(grouped.get(id).error,false,id);assert.deepEqual(grouped.get(id).data,single.get(id),`${id} (page cap ${cap})`)}
 }
 // A failed closure check fails that class only; a failed grouped read fails the whole call.
 active=client(Infinity);const failing={...active,rpc:(name,args)=>args.p_class_id===ids.block?Promise.resolve({data:null,error:{message:'x'}}):active.rpc(name,args)};
 const partial=await adapter.listAvailableScheduleSlotsByClassIdsWithClient({classIds:all,supabase:failing});
 assert.equal(partial.get(ids.block).error,true);assert.deepEqual(partial.get(ids.weekly).data,single.get(ids.weekly));
 const broken={from:()=>{const q={select:()=>q,in:()=>q,eq:()=>q,is:()=>q,gt:()=>q,order:()=>q,range:()=>Promise.resolve({data:null,count:null,error:{message:'down'}})};return q},rpc:active.rpc};
 await assert.rejects(adapter.listAvailableScheduleSlotsByClassIdsWithClient({classIds:all,supabase:broken}),/failed_to_fetch_available_schedule_slots/);
 assert.deepEqual([...(await adapter.listAvailableScheduleSlotsByClassIdsWithClient({classIds:[],supabase:active}))],[]);
 console.log(`PASS grouped slot read equals single-class read on all paths (${all.length} classes, page caps ∞/3), closure failure isolated, grouped failure surfaced`);
})().catch(e=>{console.error('FAIL',e);process.exitCode=1});
