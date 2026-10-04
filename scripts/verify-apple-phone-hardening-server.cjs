// Real actions with inert adapter/Supabase/notification boundaries; no external writes.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.cwd(); let state;
function reset() { state = { appError:null, profileError:null, profilePhone:'01012345678', authRedirect:null, applications:0, notifications:0, profileWrites:[] }; }
function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX } }).outputText, {
    exports, console, URL, URLSearchParams, FormData, process, Error,
    require(name) {
      if (name === 'server-only') return {};
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load('src/'+name.slice(2)+'.ts',mocks);
      if (name.startsWith('.')) return load(path.normalize(path.join(path.dirname(file),name))+'.ts',mocks);
      return require(name);
    }
  }, { filename:file }); return exports;
}
const mocks = {
  'next/navigation':{redirect:href=>{throw Object.assign(new Error('redirect'),{href})}},
  'next/cache':{revalidatePath:()=>{}},
  '@/shared/constants/grade-options':{isChildEligibleForClass:()=>true},
  '@/features/notifications/sms/send-studio-notification':{sendStudioNotificationSafely:async()=>{state.notifications++}},
  '@/features/auth/lib/session':{requireSession:async href=>{state.authRedirect=href;return {user:{id:'parent'}}}},
  '@/features/auth/lib/profile-sync':{getMyProfile:async()=>({id:'parent',role:'parent',name:'보호자',phone:state.profilePhone})},
  '@/shared/lib/cross-product-navigation-server':{resolveStudioCrossProductHref:async()=>'/studio'},
  '@/shared/lib/db':{dataAdapter:{
    getClassById:async()=>({id:'class-1',isActive:true,title:'수업',assignmentMode:'post_assign'}),
    listMyChildren:async()=>[{id:'child-1',name:'아이',grade:'초1'}],
    listAvailableScheduleSlotsByClassId:async()=>[{optionId:'slot-1',isClosed:false,appliedCount:0,capacity:5}],
    createTrialApplication:async()=>{if(state.appError)throw new Error(state.appError);state.applications++;return {id:'app-1',classId:'class-1',parentId:'parent'}}
  }},
  '@/integrations/supabase/server':{getSupabaseServerClient:async()=>({from(table){
    if(table==='classes')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{organization_id:'org'}})})})};
    assert.equal(table,'profiles');return {update(values){state.profileWrites.push(values);return {eq:async()=>({error:state.profileError?{message:state.profileError}:null})}}};
  }})}
};
const app=load('src/features/applications/actions/create-trial-application.ts',mocks);
const profile=load('src/features/my/actions/update-parent-profile.ts',mocks);
const contracts=load('src/features/auth/phone/contracts.ts',mocks);
function applicationForm() { const f=new FormData();for(const[k,v]of Object.entries({childId:'child-1',childName:'아이',childGrade:'초1',selectedScheduleOptionId:'slot-1',privacyAgreed:'yes',thirdPartyAgreed:'yes',guardianAgreed:'yes'}))f.set(k,v);return f; }
function profileForm() { const f=new FormData();f.set('name','보호자');f.set('phone','01012345678');f.set('phone_verified_at',new Date().toISOString());f.set('phone_verification_required','false');return f; }
(async()=>{
  reset();state.appError='parent_phone_verification_required';
  await assert.rejects(()=>app.createTrialApplicationAction('class-1',undefined,applicationForm()),e=>{
    assert.equal(new URL(e.href,'http://local').pathname,'/auth/complete-phone');
    const next=new URL(e.href,'http://local').searchParams.get('returnTo');
    assert.equal(next,'/classes/class-1?apply=1&child=child-1');return true;
  });
  assert.equal(state.notifications,0);assert.equal(state.applications,0);
  assert.equal(new URL(state.authRedirect,'http://local').searchParams.get('returnTo'),'/classes/class-1?apply=1&child=child-1');
  console.log('PASS DB denial propagated as phone gate; returnTo/child retained; no notifications/application');
  reset();assert.equal((await app.createTrialApplicationAction('class-1',undefined,applicationForm())).status,'success');assert.equal(state.notifications,1);
  reset();state.profilePhone=null;const noContact=await app.createTrialApplicationAction('class-1',undefined,applicationForm());assert.match(noContact.message,/연락처/);assert.equal(state.applications,0);
  console.log('PASS allowed application and existing missing-contact validation unchanged');
  reset();assert.equal((await profile.updateParentProfileAction(undefined,profileForm())).status,'success');
  assert.deepEqual(Object.keys(state.profileWrites[0]).sort(),['name','parent_birth_date','phone','updated_at']);
  for(const code of ['parent_verified_phone_immutable','parent_phone_verification_required']){
    reset();state.profileError=code;const r=await profile.updateParentProfileAction(undefined,profileForm());assert.equal(r.status,'error');assert.match(r.message,/인증/);
  }
  console.log('PASS ordinary profile action ignores forged verification fields; guarded phone errors are actionable');
  for(const next of ['/classes/class-1?child=child-1&apply=1','/classes/class-1/apply?child=child-1','/my/schedule?child=child-1']) {
    assert.equal(new URL(contracts.completePhoneHref(next),'http://local').searchParams.get('returnTo'),next);
  }
  console.log('PASS sheet/dedicated application/schedule returnTo and child round-trip');
})().catch(e=>{console.error(e);process.exitCode=1});
