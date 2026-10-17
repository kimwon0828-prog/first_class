// Runtime checks of independent public fragments, hidden-class boundaries and the existing full response.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,deps){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>{if(!(name in deps))throw Error('unmocked '+name);return deps[name]},m,m.exports);return m.exports;}
const pending=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
const id='11111111-1111-4111-8111-111111111111';
const item={id,title:'class',targetAge:'elem_3',trialPrice:0,trialPriceConfirmed:false,organization:{id:'org',name:'academy'},assignmentMode:'preassigned'};
let calls=[],visible=true,visibilityError=null,detail=async()=>({data:item,error:null}),slots=async()=>({data:[{optionId:'open',startAt:'2030-01-01',endAt:'2030-01-02',isClosed:false,remainingCount:1},{optionId:'secret',hidden:true}],error:null});
let context=async()=>({classes:[item],subjectCatalog:[],error:null}),academies=async()=>[];
const feedback={chips:[{id:'clear',count:2}]};
const stub={
 '@/features/academies/queries/get-public-academy-page':{getPublicAcademyPageByHandle:async()=>null},
 '@/features/academies/queries/get-public-academy-classes':{getPublicAcademyClasses:async()=>[]},
 '@/features/classes/queries/get-public-classes':{getAllPublicClasses:async()=>({data:[],error:null})},
 '@/features/feedback/queries/get-public-feedback':{getPublicAcademyFeedback:async()=>feedback,getPublicClassFeedback:async()=>{calls.push('feedback');return feedback}},
 '@/features/feedback/lib/experience-feedback':{feedbackChipLabel:id=>id},
 '@/shared/lib/regular-price':{formatRegularPrice:()=>null},
 '@/features/applications/queries/get-public-class-available-slots':{getPublicClassAvailableSlots:async()=>{calls.push('slots');return slots()}},
 '@/features/applications/lib/public-class-slots':{isHiddenPublicSlot:s=>s.hidden},
 '@/shared/constants/education-taxonomy':{LEARNER_GRADES:[]},
 '@/features/classes/queries/resolve-class-discovery-context':{resolveClassDiscoveryContext:async()=>{calls.push('context');return context()}},
 '@/features/classes/queries/get-public-class-detail':{getPublicClassDetail:async()=>{calls.push('detail');return detail()}},
 '@/features/academies/queries/get-academies-for-list':{getAcademiesForList:async()=>{calls.push('academies');return academies()}},
 '@/features/location/lib/parent-launch-region':{PARENT_LAUNCH_REGION:{}},
 '@/shared/lib/subject-master':{formatClassSubjectDisplayLabel:()=>''},
 '@/shared/constants/grade-options':{formatStoredTargetGrades:v=>v,isChildEligibleForClass:()=>true},
 '@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>({from(){const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:visible?{id}:null,error:visibilityError})};return q;}})},
 '@/features/native/server/academy-cards':{cardSlots:()=>[],isCardBookable:()=>true,loadAcademyCardDetails:async()=>new Map()}
};
stub['@/features/native/server/catalog-slots']=load('src/features/native/server/catalog-slots.ts',{
 '@/features/applications/lib/public-class-slots':stub['@/features/applications/lib/public-class-slots'],
 '@/features/applications/queries/get-public-class-available-slots':{getPublicClassesAvailableSlots:async ids=>new Map(await Promise.all(ids.map(async id=>[id,await slots()])))},
 '@/features/native/server/academy-cards':stub['@/features/native/server/academy-cards']});
const {GET}=load('app/api/native/catalog/[...path]/route.ts',stub);
const get=(view)=>GET(new Request('https://example.invalid/api/native/catalog/classes/'+id+(view?'?view='+view:'')),{params:Promise.resolve({path:['classes',id]})});
(async()=>{
 const summary=await get('summary');assert.equal(summary.status,200);const body=await summary.json();assert.equal(body.title,'class');assert.equal(body.trialPriceConfirmed,false);assert.ok(!('slots' in body));assert.deepEqual(calls,['detail'],'summary never waits for slots/feedback');
 calls=[];const live=await get('availability');assert.equal(live.status,200);const liveBody=await live.json();assert.deepEqual(liveBody.slots.map(s=>s.optionId),['open']);assert.equal(liveBody.slots[0].remainingCount,1);assert.ok(!calls.includes('detail'));assert.ok(!('title' in liveBody));
 visible=false;assert.equal((await get('availability')).status,404);visible=true;visibilityError={message:'permission'};assert.equal((await get('availability')).status,503);visibilityError=null;
 calls=[];const delayed=pending();detail=()=>delayed.promise;const full=get();await new Promise(r=>setImmediate(r));assert.ok(calls.includes('slots'));assert.ok(calls.includes('feedback'),'legacy independent reads start before detail resolves');delayed.resolve({data:item,error:null});const old=await full;assert.equal(old.status,200);const oldBody=await old.json();assert.equal(oldBody.title,'class');assert.equal(oldBody.slots.length,1);assert.equal(oldBody.feedback.chips[0].count,2);
 assert.equal((await get('unexpected')).status,400);
 const held=pending();context=()=>held.promise;calls=[];const home=GET(new Request('https://example.invalid/api/native/catalog/home'),{params:Promise.resolve({path:['home']})});await new Promise(r=>setImmediate(r));assert.ok(calls.includes('academies'),'home academy list starts without waiting for class discovery');held.resolve({classes:[item],subjectCatalog:[],error:null});assert.equal((await home).status,200);
 console.log('PASS progressive catalog: independent summary/live data, visibility/errors, hidden slots, legacy parallel response, parallel home reads');
})().catch(e=>{console.error(e);process.exitCode=1});
