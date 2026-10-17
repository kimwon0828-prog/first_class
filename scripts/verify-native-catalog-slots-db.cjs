// Read-only equivalence check against the configured DB (.env.local): for every active class, the grouped read
// (listAvailableScheduleSlotsByClassIdsWithClient) returns exactly what the existing single-class read returns.
// Only SELECTs and the read-only closure RPC run. Prints counts and class ids of mismatches only — never slot or person data.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
require('@next/env').loadEnvConfig(root,true,{info(){},error(){}});
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file).exports;
 const m={exports:{}};cache.set(file,m);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const resolve=name=>{
  if(name==='server-only')return {};
  if(name.startsWith('@/')||name.startsWith('.')){
   const base=name.startsWith('@/')?path.join(root,'src',name.slice(2)):path.resolve(path.dirname(file),name);
   for(const ext of ['.ts','.tsx','/index.ts','/index.tsx'])if(fs.existsSync(base+ext))return load(base+ext);
  }
  return require(require.resolve(name,{paths:[root]}));
 };
 new Function('require','module','exports','__filename','__dirname',code)(resolve,m,m.exports,file,path.dirname(file));
 return m.exports;
}
const adapter=load(path.join(root,'src/shared/lib/db/supabase-adapter.ts'));
const {getSupabaseServiceRoleClient}=load(path.join(root,'src/integrations/supabase/service-role.ts'));
(async()=>{
 const supabase=getSupabaseServiceRoleClient();
 const {data,error}=await supabase.from('classes').select('id').eq('is_active',true).is('archived_at',null).order('id');
 if(error)throw new Error('class list read failed');
 const ids=data.map(row=>row.id);
 const single=new Map();
 for(let i=0;i<ids.length;i+=5)await Promise.all(ids.slice(i,i+5).map(async id=>single.set(id,await adapter.listAvailableScheduleSlotsByClassIdWithClient({classId:id,supabase}))));
 const startedAt=Date.now();
 const grouped=await adapter.listAvailableScheduleSlotsByClassIdsWithClient({classIds:ids,supabase});
 const groupedMs=Date.now()-startedAt;
 const mismatches=ids.filter(id=>{const g=grouped.get(id);return !g||g.error||JSON.stringify(g.data)!==JSON.stringify(single.get(id))});
 const withSlots=ids.filter(id=>single.get(id).length).length,total=ids.reduce((sum,id)=>sum+single.get(id).length,0);
 console.log(`classes=${ids.length} withSlots=${withSlots} slots=${total} groupedReadMs=${groupedMs} mismatches=${mismatches.length}${mismatches.length?' ['+mismatches.join(',')+']':''}`);
 assert.equal(mismatches.length,0,'grouped read must equal the single-class read for every class');
 console.log('PASS grouped slot read equals the single-class read for every active class (read-only)');
})().catch(e=>{console.error('FAIL',e instanceof Error?e.message:e);process.exitCode=1});
