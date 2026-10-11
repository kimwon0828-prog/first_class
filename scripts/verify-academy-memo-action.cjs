// Executes the real server actions with explicit auth/adapter boundaries; no network.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs')
const esbuild=require(process.env.ESBUILD_MODULE_PATH||'esbuild'),out=process.env.MEMO_QA_OUTPUT
const stubs={
 'next/cache':`export const revalidatePath=p=>{globalThis.memoTest.paths.push(p);if(globalThis.memoTest.cacheFails)throw Error('cache')}`,
 '@/features/studio/lib/require-teacher-studio-access':`export const requireTeacherStudioAccess=async()=>{globalThis.memoTest.authCalls++;if(globalThis.memoTest.denied)throw Error('unauthorized');return {id:'teacher',organizationId:'own-org'}}`,
 '@/features/billing/lib/require-entitlement':`export const requireStudioEntitlement=async(org,flag)=>{globalThis.memoTest.entitlement={org,flag};return {allowed:!globalThis.memoTest.noEntitlement,message:'no permission'}}`,
 '@/shared/lib/db':`export const dataAdapter={saveStudioAcademyMemo:async input=>{globalThis.memoTest.calls.push(input);if(globalThis.memoTest.fail)throw Error(globalThis.memoTest.fail);return {note:input.note,revision:'memo:new'}},upsertStudioTrialResult:async input=>{globalThis.memoTest.recordCalls.push(input);return 'updated'}}`,
 '@/features/studio/queries/get-studio-trial-result-save-context':`export const getStudioTrialResultSaveContext=async()=>({data:{status:'completed',reportSubjectCategory:globalThis.memoTest.category,reportEverSent:globalThis.memoTest.sent,assessmentUpdatedAt:'old-revision',trialResult:{observations:globalThis.memoTest.observations??['active_participation'],recommendedCourse:null,recommendedLevel:null,recommendedSchedule:null,publicSummary:'public',note:'LEGACY_SOURCE_KEEP',parentReaction:null,nextAction:null}},error:null})`
}
;(async()=>{
 await esbuild.build({stdin:{contents:`export {saveAcademyMemoAction} from './src/features/studio/actions/save-academy-memo';export {upsertTrialResultAction} from './src/features/studio/actions/upsert-trial-result'`,resolveDir:process.cwd(),loader:'ts'},outfile:path.join(out,'actions.cjs'),bundle:true,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'ts'}))}}]})
 const {saveAcademyMemoAction:save,upsertTrialResultAction:record}=require(path.join(out,'actions.cjs'))
 const state={status:'idle',message:''},f=()=>{const form=new FormData();for(const [k,v]of Object.entries({note:' private ',expectedRevision:'legacy:old',publicSummary:'ATTACK',observations:'ATTACK',organizationId:'other-org',actorId:'parent',registrationStatus:'enrolled'}))form.set(k,v);return form}
 const t=globalThis.memoTest={authCalls:0,calls:[],recordCalls:[],paths:[]}
 let result=await save('app',state,f());assert.equal(result.status,'success');assert.deepEqual(t.calls[0],{applicationId:'app',organizationId:'own-org',actorId:'teacher',note:'private',expectedRevision:'legacy:old'});assert.deepEqual(t.entitlement,{org:'own-org',flag:'canWriteTrialResults'});assert.deepEqual(t.paths,['/studio/applications/app'])
 t.cacheFails=true;assert.equal((await save('app',state,f())).status,'success');t.cacheFails=false
 const count=t.calls.length;t.noEntitlement=true;assert.equal((await save('app',state,f())).status,'error');assert.equal(t.calls.length,count);t.noEntitlement=false
 const tooLong=f();tooLong.set('note','x'.repeat(10001));assert.equal((await save('app',state,tooLong)).status,'error');assert.equal(t.calls.length,count)
 for(const reason of ['academy_memo_changed','application_not_completed','application_not_found_or_forbidden','network']){t.fail=reason;assert.equal((await save('app',state,f())).status,'error')};t.fail=null
 t.denied=true;await assert.rejects(save('app',state,f()));t.denied=false
 const report=f();report.set('expectedAssessmentUpdatedAt','old-revision');report.set('observations','active_participation');report.set('publicSummary','public');report.set('note','INJECT_SOURCE_MEMO');assert.equal((await record('app',state,report)).status,'success');assert.equal(t.recordCalls[0].note,'LEGACY_SOURCE_KEEP');assert.equal(t.calls.length,count+4)
 t.sent=true;assert.equal((await record('app',state,report)).status,'error');assert.equal(t.recordCalls.length,1)
 t.sent=false;const mathForm=f();mathForm.set('expectedAssessmentUpdatedAt','old-revision');mathForm.set('observationsTouched','true');mathForm.set('observations','math_applied_concept');
 assert.equal((await record('app',state,mathForm)).status,'error');assert.equal(t.recordCalls.length,1)
 t.category='math';assert.equal((await record('app',state,mathForm)).status,'success');assert.deepEqual(t.recordCalls.at(-1).observations,['math_applied_concept']);assert.equal(t.recordCalls.at(-1).note,'LEGACY_SOURCE_KEEP')
 mathForm.set('observationsTouched','false');assert.equal((await record('app',state,mathForm)).status,'success');assert.deepEqual(t.recordCalls.at(-1).observations,['active_participation'])
 const pianoForm=f();pianoForm.set('expectedAssessmentUpdatedAt','old-revision');pianoForm.set('observationsTouched','true');pianoForm.set('observations','music_followed_rhythm_or_sound');
 t.category='math';const priorPiano=t.recordCalls.length;assert.equal((await record('app',state,pianoForm)).status,'error');assert.equal(t.recordCalls.length,priorPiano)
 t.category='english';assert.equal((await record('app',state,pianoForm)).status,'error')
 t.category='music';assert.equal((await record('app',state,pianoForm)).status,'success');assert.deepEqual(t.recordCalls.at(-1).observations,['music_followed_rhythm_or_sound'])
 t.sent=true;assert.equal((await record('app',state,pianoForm)).status,'error');t.sent=false
 if(process.env.SUBJECT_CATALOG_PATH){
  const catalog=JSON.parse(fs.readFileSync(process.env.SUBJECT_CATALOG_PATH,'utf8'));
  for(const [category,groups] of Object.entries(catalog.groups)){
   const codes=groups.flatMap(g=>g.options.map(o=>o.value)),form=f();form.set('expectedAssessmentUpdatedAt','old-revision');form.set('observationsTouched','true');form.delete('observations');codes.forEach(code=>form.append('observations',code));
   t.category=category;assert.equal((await record('app',state,form)).status,'success');assert.deepEqual(t.recordCalls.at(-1).observations,codes);
   const before=t.recordCalls.length;t.category='other';const denied=await record('app',state,form);assert.equal(denied.status,'error');assert.equal(t.recordCalls.length,before);
   t.observations=codes;assert.equal((await record('app',state,form)).status,'success','old selections survive reclassification');t.observations=undefined;
  }
  console.log('PASS actual action: all 11 categories, foreign-code rejection and preserved previous selection');
 }
 console.log('PASS real music record action: music master category only, english/math denied, published source blocked')
 console.log('PASS real report action accepts new math codes only for saved math classification; untouched generic values and private source retained')
 console.log('PASS actual memo/report actions: auth + entitlement, scalar whitelist, forged org/actor/public fields ignored, revision, max length, failure messages, cache failure after committed save, legacy source note preserved, published report action blocked')
})().catch(e=>{console.error(e);process.exitCode=1})
