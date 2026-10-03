// Execute the actual adapter against an inert transport: ownership and query ceilings.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const source = fs.readFileSync('src/shared/lib/db/supabase-adapter.ts', 'utf8')
async function check(source, covers) {
  for (const size of [0, 1, 50]) {
    let queries = [], filters = []
    const rows = Array.from({length:size}, (_,i) => ({id:'a'+i, class_id:'c'+i, class_organization_id:'org', child_name:'김민준', child_grade:'초3', classes:i===2?null:i===1?[{cover_image_url:'cover'+i}]:{cover_image_url:'cover'+i}}))
    const client = {from(table) {
      queries.push(table)
      const q = { select(fields) { if(table==='my_trial_applications')assert.equal(fields.includes('classes(cover_image_url)'),covers); return q }, eq(k,v){filters.push([k,v]);return q}, order(){return q}, in(){return q}, then(resolve){return Promise.resolve({data:table==='my_trial_applications'?rows:[{id:'org',name:'학원'}],error:null}).then(resolve)} };return q
    }}
    const exports = {}
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
      exports,Map,Set,Date,URL,console,process,require(n){
        if(n.endsWith('supabase/server'))return {getSupabaseServerClient:async()=>client}
        if(n.endsWith('supabase/service-role'))return {getSupabaseServiceRoleClient:()=>client}
        if(n.endsWith('parent-decision'))return {canCollectParentDecision:()=>false}
        return {}
      }
    })
    const data = await exports.supabaseDataAdapter.listMyApplications('owned-parent')
    assert.equal(data.length,size);assert.deepEqual(filters,[['parent_id','owned-parent']])
    assert.deepEqual(queries,size?['my_trial_applications','organizations']:['my_trial_applications'])
    if(covers)for(let i=0;i<size;i++)assert.equal(data[i].classCoverImageUrl,i===2?null:'cover'+i)
    console.log(`PASS ${covers?'after':'before'} ${size} applications: ${queries.length} queries; owner predicate preserved`)
  }
}
;(async()=>{
  // Same actual implementation with only the previous projection/mapping restored.
  const previous = source.replace(', classes(cover_image_url)','').replace(/  classCoverImageUrl:.*\n/,'')
  await check(previous,false);await check(source,true)
  const component=fs.readFileSync('src/features/classes/ui/parent-experience-thumbnail.tsx','utf8')
  assert(component.includes('next/image')&&component.includes('canOptimizeParentImage(src)')&&component.includes('onError'))
  assert(!/priority=|unoptimized=/.test(component));assert(component.includes('sizes='))
  console.log('PASS existing cover source / no N+1 / no new RPC / optimized lazy images / fallback')
})().catch(e=>{console.error(e);process.exitCode=1})
