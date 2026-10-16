// Offline checks: trial price confirmation (rules, display, pre-migration fallback) and the Studio '등록 여부 미정' filter.
const fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
function load(file,dependencies={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>{if(!(name in dependencies))throw Error('unmocked '+name);return dependencies[name]},m,m.exports);return m.exports}
const source=file=>fs.readFileSync(root+'/'+file,'utf8');
const confirmation=load('src/shared/lib/db/trial-price-confirmation.ts');
const {formatDiscoveryPrice}=load('src/features/classes/lib/class-discovery-results.ts',{'@/shared/constants/grade-options':{isChildEligibleForClass:()=>true}});
const {initialPriceMode}=load('src/features/studio/lib/class-price-choice.ts');
const filters=load('src/features/studio/lib/case-filters.ts');
const {orderStudioCases}=load('src/features/studio/lib/cases-order.ts');
// Minimal PostgREST client double: records each call and returns the configured result.
const fakeClient=(result)=>{const calls=[];const chain={select(...a){calls.push(['select',...a]);return chain},in(...a){calls.push(['in',...a]);return chain},eq(...a){calls.push(['eq',...a]);return chain},update(...a){calls.push(['update',...a]);return chain},then(resolve,reject){return Promise.resolve(typeof result==='function'?result(calls):result).then(resolve,reject)}};return {calls,from(table){calls.push(['from',table]);return chain}}};
(async()=>{
 // 1. Missing-column detection is narrow: only "the confirmation column itself does not exist".
 const missing=confirmation.isMissingTrialPriceConfirmationColumn;
 assert.equal(missing({code:'42703',message:'column classes.trial_price_confirmed_at does not exist'}),true);
 assert.equal(missing({code:'42703',message:'column trial_price_confirmed_at does not exist'}),true);
 assert.equal(missing({code:'PGRST204',message:"Could not find the 'trial_price_confirmed_at' column of 'classes' in the schema cache"}),true);
 for(const error of [
  {code:'42703',message:'column classes.class_format does not exist'},                       // other column
  {code:'PGRST204',message:"Could not find the 'class_format' column of 'classes' in the schema cache"},
  {code:'42501',message:'permission denied for column trial_price_confirmed_at'},           // permission
  {code:'',message:'TypeError: fetch failed (trial_price_confirmed_at)'},                   // network
  {code:'PGRST116',message:'trial_price_confirmed_at: JSON object requested, multiple rows'}, // general error naming the column
  {code:'42703',message:'column "trial_price_confirmed_at_old" does not exist'},
  {message:'column classes.trial_price_confirmed_at does not exist'},                      // no code
  null,undefined]) assert.equal(missing(error),false,JSON.stringify(error));
 assert.equal(confirmation.isTrialPriceConfirmationFieldRejected({code:'P0001',message:'invalid_class_field'}),true);
 assert.equal(confirmation.isTrialPriceConfirmationFieldRejected({code:'P0001',message:'studio_class_not_found_or_forbidden'}),false);
 // 2. Save helper: confirmation travels in the same save; retried without it only for "column/key does not exist".
 const attempts=[];const attempt=results=>async field=>{attempts.push(field);return results.shift()};
 attempts.length=0;assert.deepEqual(await confirmation.saveWithTrialPriceConfirmation(false,attempt([{data:1,error:null}])),{data:1,error:null});assert.deepEqual(attempts,[{}]);
 attempts.length=0;await confirmation.saveWithTrialPriceConfirmation(true,attempt([{data:1,error:null}]));assert.equal(attempts.length,1);assert.ok(attempts[0].trial_price_confirmed_at);
 attempts.length=0;assert.equal((await confirmation.saveWithTrialPriceConfirmation(true,attempt([{data:null,error:{code:'P0001',message:'invalid_class_field'}},{data:2,error:null}]))).data,2);assert.deepEqual(attempts[1],{},'pre-migration RPC: retried once without the key');
 attempts.length=0;assert.equal((await confirmation.saveWithTrialPriceConfirmation(true,attempt([{data:null,error:{code:'PGRST204',message:"Could not find the 'trial_price_confirmed_at' column of 'classes' in the schema cache"}},{data:3,error:null}]))).data,3);
 for(const error of [{code:'42501',message:'permission denied'},{code:'',message:'fetch failed'},{code:'P0001',message:'studio_class_not_found_or_forbidden'}]){
  attempts.length=0;const result=await confirmation.saveWithTrialPriceConfirmation(true,attempt([{data:null,error}]));assert.deepEqual(result.error,error);assert.equal(attempts.length,1,'no retry/no success on '+error.message)}
 // A 0-row update is not success: the helper hands back {data:null} and the adapter throws for update mode.
 attempts.length=0;assert.deepEqual(await confirmation.saveWithTrialPriceConfirmation(true,attempt([{data:null,error:null}])),{data:null,error:null});
 const adapter=source('src/shared/lib/db/supabase-adapter.ts');
 assert.equal((adapter.match(/saveWithTrialPriceConfirmation\(Boolean\(input\.confirmTrialPrice\)/g)||[]).length,2,'RPC and direct save both carry the confirmation in the same statement');
 assert.match(adapter,/p_fields: \{ \.\.\.detailPayload, \.\.\.confirmation \}/);
 assert.match(adapter,/buildQuery\(\{ \.\.\.detailPayload, \.\.\.confirmation \}\)/);
 assert.match(adapter,/`studio_class_not_found_or_forbidden \| payload=/);
 assert.ok(!/saveClassTrialPriceConfirmation|saveTrialPriceConfirmation\(/.test(adapter),'no separate confirmation write after the save');
 // 3. Loading for Studio: missing column → null; other errors → unconfirmed, never legacy "free".
 assert.equal(await confirmation.loadTrialPriceConfirmations(fakeClient({data:null,error:{code:'42703',message:'column classes.trial_price_confirmed_at does not exist'}}),['a']),null);
 for(const error of [{code:'42501',message:'permission denied for column trial_price_confirmed_at'},{code:'42703',message:'column classes.class_format does not exist'},{code:'',message:'fetch failed'}])
  assert.deepEqual([...await confirmation.loadTrialPriceConfirmations(fakeClient({data:null,error}),['a'])],[]);
 const loaded=await confirmation.loadTrialPriceConfirmations(fakeClient({data:[{id:'a',trial_price_confirmed_at:'2026-10-16T00:00:00Z'},{id:'b',trial_price_confirmed_at:null}],error:null}),['a','b','a']);
 assert.deepEqual([...loaded],[['a',true],['b',false]]);
 assert.deepEqual(confirmation.withTrialPriceConfirmation([{id:'a'},{id:'b'},{id:'c'}],loaded).map(i=>i.trialPriceConfirmed),[true,false,false]);
 assert.deepEqual(confirmation.withTrialPriceConfirmation([{id:'a'}],null).map(i=>i.trialPriceConfirmed),[null]);
 // Public class projection: only a truly missing confirmation column gives null; other errors fail or keep the column.
 const {loadVm}=require('./verify-trial-price-projection-helper.cjs');
 for(const scenario of [
  {name:'migrated',fail:()=>null,expect:[true,false]},
  {name:'confirmation column missing',fail:f=>f.includes('trial_price_confirmed_at')?{code:'42703',message:'column classes.trial_price_confirmed_at does not exist'}:null,expect:[null,null]},
  {name:'other column missing (legacy DB)',fail:f=>f.includes('assignment_mode')?{code:'42703',message:'column classes.assignment_mode does not exist'}:null,expect:[true,false]},
  {name:'permission error naming the column',fail:()=>({code:'42501',message:'permission denied for column trial_price_confirmed_at'}),expect:'throws'},
  {name:'network error',fail:()=>({code:'',message:'fetch failed'}),expect:'throws'}]){
  const projection=loadVm(root,scenario.fail);
  if(scenario.expect==='throws'){await assert.rejects(projection.listPublicClassesWithSafeProjection({}),scenario.name);await assert.rejects(projection.getPublicClassDetailWithSafeProjection('c1'),scenario.name);continue}
  const list=await projection.listPublicClassesWithSafeProjection({});
  assert.deepEqual(list.map(c=>c.trialPriceConfirmed),scenario.expect,scenario.name);
  assert.equal((await projection.getPublicClassDetailWithSafeProjection('c1')).trialPriceConfirmed,scenario.expect[0],scenario.name+' (detail)');
 }
 // Academy cards: same rule.
 const cardsModule=load('src/features/native/server/academy-cards.ts',{'@/shared/lib/db/trial-price-confirmation':confirmation});
 const cardsClient=fail=>({from(){const q={fields:'',select(f){q.fields=f;return q},in(){return q},eq(){return q},is(){return q},then(r){const e=fail(q.fields);return Promise.resolve(e?{data:null,error:e}:{data:[{id:'c1',program_type:'trial_class',trial_price:0,cover_image_url:null,...(q.fields.includes('class_format')?{class_format:'1:1'}:{}),...(q.fields.includes('trial_price_confirmed_at')?{trial_price_confirmed_at:'2026-10-16T00:00:00Z'}:{})}],error:null}).then(r)}};return q}});
 assert.equal((await cardsModule.loadAcademyCardDetails(cardsClient(()=>null),['c1'])).get('c1').trialPriceConfirmed,true);
 assert.equal((await cardsModule.loadAcademyCardDetails(cardsClient(f=>f.includes('trial_price_confirmed_at')?{code:'42703',message:'column classes.trial_price_confirmed_at does not exist'}:null),['c1'])).get('c1').trialPriceConfirmed,null);
 const legacyCard=(await cardsModule.loadAcademyCardDetails(cardsClient(f=>f.includes('class_format')?{code:'42703',message:'column classes.class_format does not exist'}:null),['c1'])).get('c1');
 assert.equal(legacyCard.trialPriceConfirmed,true,'other missing column keeps the confirmation');assert.equal(legacyCard.classFormat,null);
 await assert.rejects(cardsModule.loadAcademyCardDetails(cardsClient(()=>({code:'42501',message:'permission denied for column trial_price_confirmed_at'})),['c1']));
 // 4. Parent display: only a confirmed 0 is free; unconfirmed 0 asks to check; positive prices keep the amount; no column → legacy.
 assert.equal(formatDiscoveryPrice({programType:'trial_class',trialPrice:0,trialPriceConfirmed:true}),'무료 체험수업');
 assert.equal(formatDiscoveryPrice({programType:'trial_class',trialPrice:0,trialPriceConfirmed:false}),'가격 정보 확인 필요');
 assert.equal(formatDiscoveryPrice({programType:'level_test',trialPrice:0,trialPriceConfirmed:null}),'무료 레벨테스트');
 assert.equal(formatDiscoveryPrice({programType:'trial_class',trialPrice:0}),'무료 체험수업');
 for(const confirmed of [true,false,null]) assert.equal(formatDiscoveryPrice({programType:'trial_class',trialPrice:15000,trialPriceConfirmed:confirmed}),'체험수업 15,000원');
 assert.equal(formatDiscoveryPrice({programType:'trial_class',trialPrice:null,trialPriceConfirmed:true}),'가격 정보 확인 필요');
 // 5. Studio edit: unconfirmed 0 is not preselected as free; confirmed 0 / pre-migration 0 keep "free"; positive stays paid.
 assert.equal(initialPriceMode({trialPrice:0,trialPriceConfirmed:false}),'');
 assert.equal(initialPriceMode({trialPrice:0,trialPriceConfirmed:true}),'free');
 assert.equal(initialPriceMode({trialPrice:0,trialPriceConfirmed:null}),'free');
 assert.equal(initialPriceMode({trialPrice:12000,trialPriceConfirmed:false}),'paid');
 assert.equal(initialPriceMode(null),'');
 const form=source('src/features/studio/ui/studio-class-form.tsx');
 assert.match(form,/name="trialPriceChoice" value=\{mode === "create" \|\| priceTouched \? "explicit" : ""\}/);
 assert.equal((form.match(/setPriceTouched\(true\)/g)||[]).length,3,'free/paid radios and the amount input mark an explicit choice');
 assert.match(form,/initialPriceMode\(initialItem\)/);assert.ok(!/initialItem\.trialPrice === 0 \? "free"/.test(form),'no implicit free preselection');
 const action=source('src/features/studio/actions/upsert-studio-class.ts');
 assert.match(action,/confirmTrialPrice: String\(formData\.get\("trialPriceChoice"\) \?\? ""\) === "explicit"/);
 assert.ok(!/saveClassTrialPriceConfirmation/.test(action),'confirmation is part of the class save, not a later write');
 // 6. Studio closed list: '등록 여부 미정' filter, same predicate family as the other result filters, pending-like ordering.
 assert.deepEqual(filters.CASE_CLOSED_FILTERS.map(f=>f.key),['all','undecided','pending','enrolled','not_enrolled','canceled','no_show']);
 assert.equal(filters.CASE_CLOSED_FILTERS[1].label,'등록 여부 미정');
 assert.equal(filters.getCaseFilterPredicate('closed','undecided').orExpression,'and(no_show_at.is.null,canceled_at.is.null,status.neq.canceled,status.eq.completed,registration_status.eq.undecided)');
 assert.equal(filters.resolveCaseFilter('closed','undecided'),'undecided');assert.equal(filters.resolveCaseFilter('active','undecided'),'all');
 const rows=[{id:'1',status:'completed',completed_at:'2026-10-01T00:00:00Z',created_at:'2026-09-01T00:00:00Z',next_contact_at:null},{id:'2',status:'completed',completed_at:'2026-09-20T00:00:00Z',created_at:'2026-09-01T00:00:00Z',next_contact_at:null},{id:'3',status:'completed',completed_at:'2026-10-05T00:00:00Z',created_at:'2026-09-01T00:00:00Z',next_contact_at:'2026-10-02T00:00:00Z'}];
 const now=new Date('2026-10-16T00:00:00Z');
 assert.deepEqual(orderStudioCases(rows,'closed','undecided',new Map(),now).map(r=>r.id),orderStudioCases(rows,'closed','pending',new Map(),now).map(r=>r.id));
 assert.deepEqual(orderStudioCases(rows,'closed','undecided',new Map(),now).map(r=>r.id),['3','2','1']);
 // Count and list share one builder: same organization, predicate and search terms.
 const record=[];const client={from(table){const q={calls:[['from',table]]};record.push(q.calls);const self={select(...a){q.calls.push(['select',a[0]===undefined?a:a[1]]);return self},eq(...a){q.calls.push(['eq',...a]);return self},or(e){q.calls.push(['or',e]);return self},ilike(...a){q.calls.push(['ilike',...a]);return self},order(){return self},range(){return Promise.resolve({data:[],error:null,count:0})},then(r){return Promise.resolve({data:null,error:null,count:7}).then(r)}};return self}};
 const cases=load('src/features/studio/queries/get-studio-cases.ts',{'server-only':{},'@/features/studio/lib/case-filters':filters,'@/features/studio/lib/cases-workflow':{deriveCasesWorkflow:()=>({})},'@/features/studio/lib/cases-order':{getCasesResultRecord:()=>null,orderStudioCases:r=>r},'@/integrations/supabase/server':{getSupabaseServerClient:async()=>client}});
 assert.equal(await cases.countStudioCases('org',{view:'closed',filter:'undecided',query:'김'}),7);
 await cases.getStudioCases('org',{view:'closed',filter:'undecided',query:'김',page:1});
 const appQueries=record.filter(calls=>calls[0][1]==='studio_trial_applications').map(calls=>calls.filter(c=>c[0]!=='select'));
 assert.equal(appQueries.length,2);assert.deepEqual(appQueries[0],appQueries[1]);
 assert.deepEqual(record.filter(calls=>calls[0][1]==='studio_trial_applications').map(calls=>calls.find(c=>c[0]==='select')[1].head),[true,false]);
 // Parent intent is not used as the registration result.
 assert.ok(!/parent_decisions/.test(source('src/features/studio/queries/get-studio-cases.ts')));
 console.log('PASS trial price confirmation (same-statement save, narrow missing-column detection, pre-migration retry only, no 0-row success, projection/card fallbacks never revert to legacy free on other errors, display rules, Studio preselection) and 등록 여부 미정 filter (predicate, ordering, count/list same builder, no parent intent)');
})().catch(error=>{console.error('FAIL',error);process.exit(1)});
