/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS regression runner. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,deps={}) {const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>{if(!(name in deps))throw Error('unmocked '+name);return deps[name]},m,m.exports);return m.exports;}
const projection=load('src/features/native/server/catalog-projection.ts',{
 '@/shared/lib/regular-price':{formatRegularPrice:()=>null},'@/shared/constants/education-taxonomy':{LEARNER_GRADES:[]},
 '@/shared/lib/subject-master':{formatClassSubjectDisplayLabel:()=>''},'@/shared/constants/grade-options':{formatStoredTargetGrades:()=>'',isChildEligibleForClass:()=>false}
});
const {projectNativeMapLocation,projectNativeCatalogClass}=projection;
for(const [lat,lng] of [[null,127],[37,undefined],['37',127],[NaN,127],[37,Infinity],[91,127],[37,-181],[0,0]]) assert.equal(projectNativeMapLocation(lat,lng),null);
assert.deepEqual(projectNativeMapLocation(37.65,127.06),{latitude:37.65,longitude:127.06});
const projected=projectNativeCatalogClass({id:'public',title:'수업',organization:{name:'학원',latitude:37.65,longitude:127.06,address:'서울',addressDetail:'4층',privateSecret:'never return'}});
assert.deepEqual(projected.mapLocation,{latitude:37.65,longitude:127.06});assert.equal(projected.address,'서울 4층');assert.ok(!JSON.stringify(projected).includes('privateSecret'));
const selections=[];
const db={from(table){return {select(v){selections.push([table,v]);return this},eq(){return this},async maybeSingle(){return {data:table==='organizations'?{id:'11111111-1111-4111-8111-111111111111',name:'학원',address:'서울',latitude:37.65,longitude:127.06}:null,error:null}}}},storage:{from(){return {getPublicUrl(){throw Error('no asset requested')}}}}};
const academy=load('src/features/academies/queries/get-public-academy-page.ts',{'server-only':{},'@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>db}});
(async()=>{const page=await academy.getPublicAcademyPageByHandle('11111111-1111-4111-8111-111111111111');assert.equal(page.latitude,37.65);assert.equal(page.longitude,127.06);assert.ok(selections.find(([t,s])=>t==='organizations'&&s.includes('latitude')&&s.includes('longitude')));console.log('PASS map coordinates: validation, class projection, public academy read; no DB writes');})().catch(e=>{console.error(e);process.exitCode=1});
