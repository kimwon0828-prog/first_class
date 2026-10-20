const fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
let scenario={},writes=[],notifications=0;
function load(file,dependencies){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>{if(!(name in dependencies))throw Error('unexpected import '+name);return dependencies[name];},m,m.exports);return m.exports;}
const taxonomy=load('src/shared/constants/education-taxonomy.ts',{});
const grades=load('src/shared/constants/grade-options.ts',{'@/shared/constants/education-taxonomy':taxonomy});
const validation=load('src/features/applications/lib/validate-trial-application.ts',{});
const {nativeApplication}=load('src/features/native/server/application.ts',{
 '@/features/classes/queries/public-class-safe-projection':{getAppReviewClassDetailWithSafeProjection:async(db,id)=>{assert.equal(db,caller);return id===base.classId?{targetAge:'초1~초6',title:'가상 검수',organization:{id:'org'},assignmentMode:'post_assign'}:null;}},
 '@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>({service:'inert'})},
 '@/features/classes/queries/get-public-class-detail':{getPublicClassDetail:async()=>({data:scenario.private?null:{targetAge:'초1~초6',title:'데모',organization:{id:'org'},assignmentMode:'post_assign'},error:null})},
 '@/features/applications/queries/get-public-class-available-slots':{getPublicClassAvailableSlots:async()=>({data:[{optionId:'slot',remainingCount:scenario.closed?0:1,isClosed:!!scenario.closed}],error:scenario.slotsError?'offline':null})},
 '@/features/applications/lib/validate-trial-application':validation,
 '@/shared/constants/grade-options':grades,
 '@/shared/lib/db/supabase-adapter':{listAvailableScheduleSlotsByClassIdWithClient:async({reviewClient})=>{assert.equal(reviewClient,caller);return [{optionId:'slot',remainingCount:scenario.closed?0:1,isClosed:!!scenario.closed}];},createTrialApplicationWithClient:async(db,input,options)=>{assert.equal(db,caller);assert.equal(options?.privateReviewClassId,scenario.review?input.classId:undefined);if(scenario.writeError)throw Error(scenario.writeError);writes.push(input);return {id:'application',...input};}},
 '@/features/notifications/sms/send-studio-notification':{sendStudioNotificationSafely:async()=>{notifications++;if(scenario.notificationError)throw Error('offline');}}
});
const caller={from(table){const q={select(){return q},eq(key,value){if(table==='children')assert.equal(value,'parent');return q},order:async()=>({data:[{id:'owned-child',name:'기존학생',grade:scenario.ineligible?'high_1':'초3',school_name:'기존학교',interest_subjects:'수학'}],error:null}),maybeSingle:async()=>({data:{name:'실제보호자',phone:'01000000000'},error:null})};return q;}};
const base={classId:'11111111-1111-1111-1111-111111111111',childId:'owned-child',childName:'위조이름',childGrade:'elem_1',selectedScheduleOptionId:'slot',privacyAgreed:'yes',thirdPartyAgreed:'yes',guardianAgreed:'yes',parentId:'foreign-parent',parentPhone:'forged'};
async function run(changes={},options={}){scenario=options;writes=[];notifications=0;const response=await nativeApplication(new Request('http://localhost/api/native/parent/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...base,...changes})}),['applications'],caller,'parent',scenario.review?{id:'parent',app_metadata:{app_store_review:true}}:undefined);return {...await response.json(),status:response.status};}
(async()=>{
 for(const field of ['privacyAgreed','thirdPartyAgreed','guardianAgreed']){assert.equal((await run({[field]:'no'})).status,400);assert.equal(writes.length,0);}
 assert.equal((await run({childId:'foreign-child'})).status,403);assert.equal(writes.length,0);
 assert.equal((await run({}, {ineligible:true})).error,'ineligible_grade');assert.equal(writes.length,0);
 assert.equal((await run({}, {private:true})).status,404);assert.equal(writes.length,0);
 assert.equal((await run({}, {closed:true})).error,'slot_capacity_reached');assert.equal(writes.length,0);
 assert.equal((await run({selectedScheduleOptionId:'foreign-slot'})).error,'invalid_schedule_slot');assert.equal(writes.length,0);
 assert.equal((await run({}, {slotsError:true})).status,503);assert.equal(writes.length,0);
 assert.equal((await run({}, {writeError:'duplicate_trial_application'})).error,'duplicate_trial_application');assert.equal(notifications,0);
 assert.equal((await run({}, {writeError:'booking_cutoff_reached'})).error,'booking_cutoff_reached');
 assert.equal((await run({}, {writeError:'failed_to_create_trial_application'})).error,'submission_unknown');
 assert.equal((await run({}, {notificationError:true})).status,201);assert.equal(writes.length,1);assert.equal(writes[0].parentId,'parent');assert.equal(writes[0].parentPhone,'01000000000');assert.equal(writes[0].childName,'기존학생');assert.equal(writes[0].childGrade,'초3');assert.equal(writes[0].interestSubjects,'수학');
 assert.equal((await run({childId:'',childName:'직접학생',childGrade:'elem_2'})).status,201);assert.equal(writes[0].childId,null);assert.equal(writes[0].interestSubjects,null);
 assert.equal((await run({}, {review:true})).status,201);assert.equal(writes.length,1);
 assert.equal((await run({classId:'22222222-2222-4222-8222-222222222222'}, {review:true})).status,404);assert.equal(writes.length,0);
 assert.equal((await run({}, {review:true,closed:true})).error,'slot_capacity_reached');assert.equal(writes.length,0);
 assert.equal((await run({privacyAgreed:'no'}, {review:true})).status,400);assert.equal(writes.length,0);
 console.log('PASS 18 submission scenarios: consent, ownership, legacy grade, public scope, capacity, slot, uncertainty, notification isolation, manual child');
})().catch(e=>{console.error(e);process.exitCode=1;});
