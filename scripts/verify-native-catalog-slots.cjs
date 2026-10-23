// Offline checks (fixtures, no DB): home/class-list card slots, home section (this_week → upcoming → empty), within=7d,
// existing fields kept, one grouped slot read per request, and the academy class card additions.
const fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
function load(file,dependencies){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>{if(!(name in dependencies))throw Error('unmocked '+name);return dependencies[name]},m,m.exports);return m.exports}
const now=Date.now(),at=(days,h=0)=>new Date(now+days*864e5+h*36e5).toISOString();
const slot=(id,days,extra={})=>({optionId:id,startAt:at(days),endAt:at(days,1),isClosed:false,remainingCount:2,label:'x',hidden:false,...extra});
const GRADES=[{value:'elem_3',label:'초3',group:'elementary'},{value:'high_1',label:'고1',group:'high'}];
const summary=(id,targetAge='elem_3')=>({id,title:id,programType:'trial_class',subjectCategoryId:null,targetAge,trialPrice:id==='unpriced'?0:10000,trialPriceConfirmed:id==='unpriced'?false:true,coverImageUrl:null,organization:{id:'org',name:'학원'},description:'',recommendedFor:null,experiencePoints:null,curriculum:null,teacherIntro:null,classFormat:null,regularPriceType:null,regularPriceAmount:null,regularPriceNote:null});
let classes=[],slotRows={},slotCalls=[],discoveryOptions=[];
const stub={
 '@/features/academies/queries/get-public-academy-page':{getPublicAcademyPageByHandle:async()=>({organizationId:'org',slug:'s',name:'학원',branchName:null,address:null,latitude:37.65,longitude:127.06,phone:null,regionLabel:null,logoImageUrl:null,coverImageUrl:null,shortDescription:null,description:null,operatingHours:null,parkingInfo:null,directions:null})},
 '@/features/academies/queries/get-public-academy-classes':{getPublicAcademyClasses:async()=>['graded','nograde','gone'].map(id=>({id,title:id,subjectLabel:'수학',targetAgeLabel:'초3',programTypeLabel:'체험수업',periodLabel:'상시 운영',periodTone:'ongoing',scheduleLabel:'월 15:00-15:50'}))},
 '@/features/classes/queries/get-public-classes':{getAllPublicClasses:async()=>({data:[],error:null})},
 '@/features/feedback/queries/get-public-feedback':{getPublicAcademyFeedback:async()=>({chips:[]}),getPublicClassFeedback:async()=>({chips:[]})},
 '@/features/feedback/lib/experience-feedback':{feedbackChipLabel:id=>id},
 '@/shared/lib/regular-price':{formatRegularPrice:()=>null},
 '@/features/applications/queries/get-public-class-available-slots':{getPublicClassAvailableSlots:async()=>{throw Error('lists and cards must not read slots per class')}},
 '@/shared/constants/education-taxonomy':{LEARNER_GRADES:GRADES},
 '@/features/classes/queries/resolve-class-discovery-context':{resolveClassDiscoveryContext:async(_query,options)=>{discoveryOptions.push(options);return {classes,subjectCatalog:[],locationFilterLabel:'중계동',error:null}}},
 '@/features/classes/queries/get-public-class-detail':{getPublicClassDetail:async()=>({data:null,error:null})},
 '@/features/academies/queries/get-academies-for-list':{getAcademiesForList:async()=>[]},
 '@/features/location/lib/parent-launch-region':{PARENT_LAUNCH_REGION:{}},
 '@/shared/lib/subject-master':{formatClassSubjectDisplayLabel:()=>'수학'},
 '@/shared/constants/grade-options':{formatStoredTargetGrades:v=>v,isChildEligibleForClass:(grade,targetAge)=>String(targetAge).split(',').includes(grade)},
 '@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>({from(){const self={select:()=>self,in:()=>self,eq:()=>self,is:()=>self,then:r=>Promise.resolve({data:[{id:'graded',program_type:'trial_class',trial_price:0,cover_image_url:null,target_age:'elem_3,high_1',class_format:'그룹',trial_price_confirmed_at:null},{id:'nograde',program_type:'trial_class',trial_price:20000,cover_image_url:null,target_age:null,class_format:null,trial_price_confirmed_at:'2026-10-16T00:00:00Z'}],error:null}).then(r)};return self}})}
};
stub['@/features/native/server/academy-cards']=load('src/features/native/server/academy-cards.ts',{'@/shared/lib/db/trial-price-confirmation':load('src/shared/lib/db/trial-price-confirmation.ts',{})});
stub['@/features/native/server/catalog-slots']=load('src/features/native/server/catalog-slots.ts',{
 '@/features/applications/lib/public-class-slots':{isHiddenPublicSlot:s=>s.hidden===true},
 '@/features/applications/queries/get-public-class-available-slots':{getPublicClassesAvailableSlots:async ids=>{slotCalls.push([...ids]);return new Map(ids.map(id=>[id,id==='broken'?{data:[],error:'slots_offline'}:{data:slotRows[id]??[],error:null}]))}},
 '@/features/native/server/academy-cards':stub['@/features/native/server/academy-cards']});
stub['@/features/native/server/catalog-projection']=load('src/features/native/server/catalog-projection.ts',stub);
const {GET}=load('app/api/native/catalog/[...path]/route.ts',stub);
const call=async(pathname)=>{const url=new URL('http://localhost/api/native/catalog/'+pathname);const res=await GET(new Request(url),{params:Promise.resolve({path:url.pathname.split('/').slice(4)})});return {status:res.status,body:await res.json()}};
const ids=body=>body.items.map(item=>item.id);
(async()=>{
 // Fixtures: week slots on days 1.5–6, one only on day 10 (next bookable), closed/full/<24h/hidden never count.
 slotRows={a:[slot('a1',3),slot('a2',4),slot('a3',5)],b:[slot('b1',1.5)],c:[],d:[slot('d1',10),slot('d2',12)],e:[slot('e1',2)],
  noise:[slot('n1',0.5),slot('n2',2,{isClosed:true}),slot('n3',2,{remainingCount:0}),slot('n4',2,{hidden:true}),slot('n5',9)],
  w1:[slot('w1',6)],w2:[slot('w2',5.5)],w3:[slot('w3',5)],w4:[slot('w4',4.5)],w5:[slot('w5',1.2)],w6:[slot('w6',3.5)],broken:[]};
 classes=['a','b','c','d','e','noise'].map(id=>summary(id,id==='e'?'high_1':'elem_3'));
 // ① grade filter → ② this week, earliest first; slots trimmed to the week (cardSlots), same projection as the class detail.
 let home=await call('home?grade=elem_3');
 assert.equal(home.status,200);assert.equal(home.body.section,'this_week');assert.deepEqual(ids(home.body),['b','a']);
 assert.deepEqual(home.body.items[1].slots.map(s=>s.optionId),['a1','a2','a3']);
 assert.deepEqual(Object.keys(home.body.items[0].slots[0]).sort(),['endAt','isClosed','optionId','remainingCount','startAt']);
 assert.deepEqual(slotCalls,[['a','b','c','d','noise']],'one grouped slot read for the grade-filtered classes');
 // No grade: e (high_1 only) joins; the earlier 6-class discovery prefetch is gone so the week can be chosen from all classes.
 slotCalls=[];discoveryOptions=[];home=await call('home');
 assert.deepEqual(ids(home.body),['b','e','a']);assert.equal(discoveryOptions[0],undefined,'home no longer limits discovery before choosing the week');
 // Existing projection fields are kept as they were; only slots/slotsError (+ section on home) are added.
 for(const key of ['id','title','programType','subject','targetAge','eligibleGrades','regularPriceLabel','regularPriceNote','trialPrice','trialPriceConfirmed','coverImageUrl','academyName','organizationId','locationLabel','description','recommendedFor','experiencePoints','curriculum','teacherIntro','classFormat','address','slots','slotsError'])
  assert.ok(key in home.body.items[0],'item keeps '+key);
 for(const key of ['items','categories','locationLabel','academies','academiesError','section']) assert.ok(key in home.body,'home keeps '+key);
 // Cut to 6 after ordering: the 6 earliest week classes, never the first 6 in discovery order.
 classes=['w1','w2','w3','w4','a','b','w5','w6'].map(id=>summary(id));home=await call('home');
 assert.deepEqual(ids(home.body),['w5','b','a','w6','w4','w3']);
 // ③ no week class → all grade-eligible classes by earliest slot, classes without slots last (discovery order kept).
 classes=['c','d','noise','unpriced'].map(id=>summary(id));slotRows.unpriced=[];
 home=await call('home?grade=elem_3');assert.equal(home.body.section,'upcoming');assert.deepEqual(ids(home.body),['noise','d','c','unpriced']);
 assert.deepEqual(home.body.items[0].slots.map(s=>s.optionId),['n5'],'next bookable one only');
 const unpriced=home.body.items.find(item=>item.id==='unpriced');assert.equal(unpriced.trialPrice,0);assert.equal(unpriced.trialPriceConfirmed,false,'unconfirmed 0 is not turned into free');
 // ④ nothing eligible → empty items.
 home=await call('home?grade=high_1');assert.deepEqual(home.body.items,[]);assert.equal(home.body.section,'upcoming');
 // Slot read failure for one class is surfaced on that item only.
 classes=['a','broken'].map(id=>summary(id));const mixed=await call('classes');
 assert.equal(mixed.body.items.find(i=>i.id==='broken').slotsError,'slots_offline');assert.equal(mixed.body.items.find(i=>i.id==='a').slotsError,null);
 // Class list: same items/order as before plus slots; within=7d filters and orders the same way and is not cut.
 classes=['w1','w2','w3','w4','a','b','w5','w6','c','d'].map(id=>summary(id));
 let list=await call('classes?grade=elem_3');assert.equal(list.status,200);assert.deepEqual(ids(list.body),['w1','w2','w3','w4','a','b','w5','w6','c','d']);assert.ok(!('section' in list.body));
 assert.deepEqual(list.body.items.find(i=>i.id==='d').slots.map(s=>s.optionId),['d1']);
 list=await call('classes?grade=elem_3&within=7d');assert.deepEqual(ids(list.body),['w5','b','a','w6','w4','w3','w2','w1']);
 for(const bad of ['classes?within=14d','classes?within=','home?within=7d','academies?within=7d']) assert.equal((await call(bad)).status,400,bad);
 // Academy cards: grades from the class target grades, duration from the first card slot; nothing made up when absent.
 slotRows.graded=[slot('g1',2)];slotRows.nograde=[];slotCalls=[];
 const academy=await call('academies/s');const byId=Object.fromEntries(academy.body.classes.map(c=>[c.id,c]));
 assert.deepEqual(byId.graded.eligibleGrades.map(g=>g.value),['elem_3','high_1']);assert.equal(byId.graded.durationMinutes,60);assert.equal(byId.graded.classFormat,'그룹');
 assert.equal(byId.graded.trialPrice,0);assert.equal(byId.graded.trialPriceConfirmed,false);
 assert.equal(byId.nograde.eligibleGrades,null);assert.equal(byId.nograde.durationMinutes,null);assert.equal(byId.nograde.trialPrice,20000);
 assert.equal(byId.gone.trialPrice,null);assert.equal(byId.gone.eligibleGrades,null);assert.equal(byId.gone.durationMinutes,null);assert.deepEqual(byId.gone.slots,[]);
 assert.deepEqual(slotCalls,[['graded','nograde','gone']],'academy cards read slots for all classes at once');
 console.log('PASS native catalog slots: grouped slot read, this_week/upcoming/empty section before the 6 cut, within=7d, fields kept, academy grades/duration/price null');
})().catch(error=>{console.error('FAIL',error);process.exitCode=1});
