// Read-only fixtures execute the actual queries and canonical route. No DB writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const root=process.cwd()
function load(file,mocks={}) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,console,process,URL,URLSearchParams,require(name){if(name==='server-only')return {};if(name in mocks)return mocks[name];if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts',mocks);return require(name)}},{filename:file});return exports
}
const scope=load('src/features/location/lib/parent-launch-region.ts').PARENT_LAUNCH_REGION
const subjectMocks={'@/features/subjects/queries/get-subject-master':{loadSubjectMasterMapsByIdsWithClient:async()=>({categoryById:new Map(),subjectById:new Map()}),getSelectableSubjectCatalog:async()=>[]}}
function fixture(size,failTable=null){
 const organizations=Array.from({length:size},(_,i)=>({id:'org-'+i,name:'검수학원'+i,branch_name:'중계센터',sido:i%3===0?'경기':i%3===1?'서울':'서울특별시',sigungu:i%3===0?'고양시 일산서구':'노원구',address:'주소',academy_public_profiles:i%2?[{logo_image_path:'logo-'+i+'.png'}]:null}))
 const classes=organizations.map((o,i)=>({id:'class-'+i,organization_id:o.id,title:'수업'+i,subject:'math',subject_category_id:'cat-'+i%2,subject_id:'subject-'+i%2,target_age:i%2?'초3':'초1',is_active:true,archived_at:null,program_type:'trial_class'}))
 const calls=[],urls=[];const client={storage:{from(bucket){return{getPublicUrl(p){urls.push(p);return {data:{publicUrl:'https://assets.example.test/storage/v1/object/public/'+bucket+'/'+p}}}}}},from(table){
 const call={table,select:null,filters:[],limit:null};const q={select(v){call.select=v;return q},eq(k,v){call.filters.push([k,x=>x===v]);return q},is(k,v){call.filters.push([k,x=>x===v]);return q},in(k,v){call.filters.push([k,x=>v.includes(x)]);return q},order(){return q},limit(v){call.limit=v;return q},then(ok,bad){calls.push(call);let rows=table==='classes'?classes:organizations;rows=rows.filter(row=>call.filters.every(([key,f])=>f(key.startsWith('launch_organization.')?organizations.find(o=>o.id===row.organization_id)?.[key.split('.')[1]]:row[key])));if(call.limit)rows=rows.slice(0,call.limit);return Promise.resolve({data:rows,error:table===failTable?{message:'forced failure'}:null}).then(ok,bad)}};return q}}
 const mocks={...subjectMocks,'@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>client}};return{client,calls,urls,organizations,classes,mocks}
}
async function main(){
 for(const size of [0,1,2,50]){
  const f=fixture(size),api=load('src/features/academies/queries/get-academies-for-list.ts',f.mocks)
  await api.getAcademiesForList({launchRegion:scope});const baseline=f.calls.length;f.calls.length=0;
  const result=await api.getAcademiesForList({launchRegion:scope,includeLogos:true});assert.equal(f.calls.length,baseline,'logo has no additional query at '+size+' academies');assert(f.calls.every(x=>x.table!=='academy_public_profiles'));assert.equal(result.length,f.organizations.filter(o=>o.sigungu==='노원구').length)
  for(const academy of result){assert.equal(academy.sigungu,'노원구');assert.equal(!!academy.logoImageUrl,Boolean(Number(academy.id.split('-')[1])%2))}
  if(result.length)assert(f.calls.find(c=>c.table==='organizations').select.includes('academy_public_profiles(logo_image_path)'))
 }
 const f=fixture(50),api=load('src/features/academies/queries/get-academies-for-list.ts',f.mocks)
 assert.equal((await api.getAcademiesForList({launchRegion:scope,query:'검수학원0'})).length,0,'outside academy cannot match search')
 assert((await api.getAcademiesForList({launchRegion:scope,query:'중계센터'})).length>0)
 const grade=await api.getAcademiesForList({launchRegion:scope,grade:'초3',subjectCategoryId:'cat-1',subjectId:'subject-1',sort:'name'});assert(grade.length>0);assert(grade.every(r=>r.representativeClasses.every(c=>c.targetAge==='초3')));assert(grade.every((r,i)=>!i||grade[i-1].displayName.localeCompare(r.displayName,'ko')<=0))
 for(const table of ['classes','organizations']){const failed=fixture(2,table);await assert.rejects(load('src/features/academies/queries/get-academies-for-list.ts',failed.mocks).getAcademiesForList({launchRegion:scope,includeLogos:true}))}
 const projection=load('src/features/classes/queries/public-class-safe-projection.ts',f.mocks);f.calls.length=0;const preview=await projection.listPublicClassesWithSafeProjection({launchRegion:scope,limit:6});assert.equal(preview.length,6);assert(preview.every(c=>c.organization.sigungu==='노원구'));assert.equal(f.calls.filter(c=>c.table==='classes').length,1)
 const captured=[];const resolver=load('src/features/classes/queries/resolve-class-discovery-context.ts',{...subjectMocks,'@/features/classes/queries/get-public-classes':{getPublicClasses:async opts=>{captured.push(opts);return{data:[],error:null}}}})
 for(const params of [{},{sido:'경기',sigungu:'고양시 일산서구',radius:'5',child:'c1'},{q:'일산'}]){const context=await resolver.resolveClassDiscoveryContext(params,{discoveryFetchLimit:6});assert.equal(captured.at(-1).launchRegion.sigungu,'노원구');assert.equal(context.shouldCanonicalize,!!params.sido);assert.equal(context.canonicalParams.sido,null);assert.equal(captured.at(-1).limit,params.q?undefined:6)}
 const route=load('app/academies/page.tsx',{...subjectMocks,'@/features/academies/queries/get-academies-for-list':api,'@/features/academies/ui/academies-frame':{},'@/features/academies/ui/academies-explorer':{},'next/navigation':{redirect(href){throw Object.assign(Error('redirect'),{href})}}})
 try{await route.default({searchParams:Promise.resolve({sido:'경기',sigungu:'고양시 일산서구',radius:'5',q:'중계',grade:'초3',sort:'name',child:'child-a',returnTo:'/classes?child=child-a'})});assert.fail('redirect required')}catch(e){assert(e.href);const url=new URL(e.href,'http://localhost');assert.equal(url.pathname,'/academies');assert.equal(url.searchParams.get('q'),'중계');assert.equal(url.searchParams.get('grade'),'초3');assert.equal(url.searchParams.get('sort'),'name');assert.equal(url.searchParams.get('child'),'child-a');assert.equal(url.searchParams.get('returnTo'),'/classes?child=child-a');for(const key of ['sido','sigungu','radius'])assert(!url.searchParams.has(key))}
 console.log('PASS academy logos: 0/1/2/50 fixtures, no extra query; Nowon scope, name/branch, subject/grade/sort, query errors, scoped Home limit, canonical child/returnTo preservation')
}
main().catch(e=>{console.error(e);process.exitCode=1})
