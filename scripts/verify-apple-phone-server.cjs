// Actual route, gate, hash modules with inert Supabase/SMS boundaries.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=process.cwd();let s;
const env={NODE_ENV:'test',PHONE_OTP_ENABLED:'true',SMS_SEND_ENABLED:'true',SMS_PROVIDER:'ncloud',PARENT_PHONE_OTP_HMAC_SECRET:'test-only-secret-'.repeat(4),NCP_ACCESS_KEY:'fixture',NCP_SECRET_KEY:'fixture',NCP_SENS_SMS_SERVICE_ID:'fixture',NCP_SENS_SMS_FROM_NUMBER:'01000000000'};
const uid='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002';
function reset(){s={user:{id:uid,email:'relay@privaterelay.appleid.com',app_metadata:{provider:'apple'},user_metadata:{}},status:{required:true,verified:false,phoneVerifiedAt:null,profileMissing:true},calls:[],sms:[],sent:'sent',verify:'verified',conflict:true}}
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,Request,FormData,console,process:{env},require(name){if(name==='server-only')return {};if(name in mocks)return mocks[name];if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts',mocks);if(name.startsWith('.'))return load(path.normalize(path.join(path.dirname(file),name))+'.ts',mocks);return require(name)}},{filename:file});return exports}
const service={rpc:async(name,args)=>{s.calls.push({name,args});if(name==='enroll_new_apple_parent_phone')return {data:s.status,error:s.dbError?{}:null};if(name==='begin_parent_phone_challenge')return {data:{status:s.begin||'created'},error:null};if(name==='verify_parent_phone_challenge')return {data:{status:s.verify},error:null};return {error:s.markError?{message:'fixture'}:null}}};
const server={auth:{getSession:async()=>({data:{session:s.user?{user:s.user}:null},error:null}),getUser:async()=>({data:{user:s.user},error:null}),getClaims:async()=>({data:{claims:{sub:s.claimSub||uid,session_id:s.session||sid,app_metadata:s.user?.app_metadata}}})},rpc:async name=>{s.calls.push({name});return {data:s.status,error:s.dbError?{}:null}}};
const mocks={'@/integrations/supabase/server':{getSupabaseServerClient:async()=>server},'@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>service},'@/features/auth/lib/oauth-account-conflict':{detectOAuthEmailConflict:async()=>({ok:s.conflict})},'@/features/notifications/sms/sender':{sendSms:async arg=>{s.sms.push(arg);return {status:s.sent}}}};
const route=load('app/api/auth/parent-phone/route.ts',mocks),otp=load('src/features/auth/phone/otp.ts'),gate=load('src/features/auth/phone/gate.ts',mocks),contracts=load('src/features/auth/phone/contracts.ts');
const next='/my/schedule?child=child-1';
async function call(body={},origin='http://localhost:3000'){const r=await route.POST(new Request('http://localhost:3000/api/auth/parent-phone',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'send',phone:'010-1234-5678',returnTo:next,...body})}));assert.equal(r.headers.get('cache-control'),'no-store');return {http:r.status,...await r.json()}}
(async()=>{
 for(const p of ['01012345678','010-1234-5678','+82 10 1234 5678'])assert.equal(contracts.normalizeParentMobile(p),'01012345678');for(const p of ['0212345678','010123','01012345678<script>',null])assert.equal(contracts.normalizeParentMobile(p),null);
 assert.equal(contracts.phoneReturnTo('//evil.test'),'/');assert.equal(contracts.phoneReturnTo('/auth/complete-phone'),'/my');assert.equal(contracts.phoneReturnTo(next),next);
 assert.match(otp.generatePhoneOtp(),/^\d{6}$/);assert.equal(otp.hashPhoneOtp('c',uid,'123456').length,64);assert.notEqual(otp.hashPhoneOtp('c',uid,'123456'),otp.hashPhoneOtp('d',uid,'123456'));assert.notEqual(otp.hashPhoneOtp('c',uid,'123456'),otp.hashPhoneOtp('c','other','123456'));
 reset();assert.equal((await call({},'https://evil.test')).http,403);assert.equal(s.calls.length,0);
 reset();s.user=null;assert.equal((await call()).http,401);assert.equal(s.sms.length,0);
 reset();s.claimSub='other';assert.equal((await call()).http,401);assert.equal(s.sms.length,0);
 reset();s.dbError=true;assert.equal((await call()).status,'unavailable');assert.equal(s.sms.length,0);
 const configuredSecret=env.PARENT_PHONE_OTP_HMAC_SECRET;
 for(const value of [undefined,'too-short']){reset();if(value===undefined)delete env.PARENT_PHONE_OTP_HMAC_SECRET;else env.PARENT_PHONE_OTP_HMAC_SECRET=value;assert.equal(otp.otpConfigurationReady(),false);assert.throws(()=>otp.hashPhoneOtp('c',uid,'123456'),/phone_otp_not_configured/);assert.equal((await call()).status,'unavailable');assert.equal(s.sms.length,0);assert.equal(s.calls.some(c=>c.name==='begin_parent_phone_challenge'),false)}
 env.PARENT_PHONE_OTP_HMAC_SECRET=configuredSecret;assert.equal(otp.otpConfigurationReady(),true);
 reset();env.PHONE_OTP_ENABLED='false';assert.equal((await call()).status,'unavailable');env.PHONE_OTP_ENABLED='true';assert.equal(s.sms.length,0);
 for(const status of ['dry_run','failed','skipped']){reset();s.sent=status;assert.equal((await call()).status,'unavailable');assert.equal(s.calls.find(c=>c.name==='mark_parent_phone_challenge_sent').args.p_sent,false)}
 reset();s.begin='cooldown';assert.equal((await call()).status,'cooldown');assert.equal(s.sms.length,0);
 reset();const sent=await call({userId:'other',sessionId:'fake'});assert.equal(sent.status,'sent');const begin=s.calls.find(c=>c.name==='begin_parent_phone_challenge').args;assert.equal(begin.p_user,uid);assert.equal(begin.p_session,sid);assert.equal(begin.p_phone,'01012345678');const code=s.sms[0].messagePreview.match(/\[(\d{6})\]/)[1];assert.equal(begin.p_hash,otp.hashPhoneOtp(sent.challengeId,uid,code));assert(!JSON.stringify(sent).includes(code));assert(!JSON.stringify(sent).includes('01012345678'));
 const verified=await call({action:'verify',challengeId:sent.challengeId,code});assert.equal(verified.status,'verified');assert.equal(new URL(verified.next,'http://local').searchParams.get('returnTo'),next);assert.equal(s.calls.find(c=>c.name==='verify_parent_phone_challenge').args.p_hash,begin.p_hash);
 reset();s.status={required:true,verified:true,phoneVerifiedAt:'2026-10-04T00:00:00Z',profileMissing:false};assert.equal((await call()).next,next);assert.equal(s.sms.length,0);
 for(const status of ['invalid_code','expired','attempts_exceeded','duplicate_phone','used']){reset();s.verify=status;assert.equal((await call({action:'verify',challengeId:sid,code:'123456'})).status,status)}
 reset();s.conflict=false;assert.equal((await call()).http,403);assert.equal(s.sms.length,0);
 reset();s.status={required:false,verified:false,phoneVerifiedAt:null,excluded:true};assert.equal((await call()).http,403);
 reset();s.user.user_metadata.signup_intent='teacher_invite';assert.equal((await call()).http,401);
 reset();assert.equal(await gate.applePhoneGateHref(s.user,next),contracts.completePhoneHref(next));s.status={required:true,verified:true,phoneVerifiedAt:'2026-10-04T00:00:00Z',profileMissing:true};assert.equal(new URL(await gate.applePhoneGateHref(s.user,next),'http://local').pathname,'/auth/complete-profile');s.status.profileMissing=false;assert.equal(await gate.applePhoneGateHref(s.user,next),null);
 reset();s.user.app_metadata={provider:'kakao'};assert.equal(await gate.applePhoneGateHref(s.user,next),null);assert.equal(s.calls.length,0,'Kakao gate adds zero RPC');
 reset();s.user.app_metadata={provider:'email',providers:['email','apple']};assert.equal(await gate.applePhoneGateHref(s.user,next),contracts.completePhoneHref(next));
 // Exact flag/timestamp matrix; neither missing phone nor stale verified boolean can change the predicate.
 for(const required of [false,true])for(const timestamp of [null,'2026-10-04T00:00:00Z'])for(const phone of [null,'01012345678']) {
  reset();s.status={required,phoneVerifiedAt:timestamp,phone,profileMissing:false,verified:timestamp===null};
  assert.equal(await gate.applePhoneGateHref(s.user,next),required&&timestamp===null?contracts.completePhoneHref(next):null);
 }
 reset();s.dbError=true;assert.equal(await gate.applePhoneGateHref(s.user,next),null,'missing migration cannot force legacy OTP');
 reset();const enrolled=await gate.enrollNewAppleParentPhone(s.user);assert.equal(enrolled.required,true);assert.equal(s.calls[0].args.p_user,uid);
 const sessionModule=load('src/features/auth/lib/session.ts',{...mocks,react:{cache:fn=>fn},'next/navigation':{redirect:href=>{throw new Error('REDIRECT '+href)}}});
 reset();await assert.rejects(()=>sessionModule.requireSession('/auth/sign-in?returnTo='+encodeURIComponent(next)),error=>error.message==='REDIRECT '+contracts.completePhoneHref(next));
 reset();s.status={required:true,verified:true,phoneVerifiedAt:'2026-10-04T00:00:00Z',profileMissing:false};assert.equal((await sessionModule.requireSession('/auth/sign-in')).user.id,uid);
 reset();s.claimSub='other';await assert.rejects(()=>sessionModule.requireSession('/auth/sign-in'),/REDIRECT \/auth\/sign-in/);
 reset();s.user.app_metadata={provider:'kakao'};assert.equal((await sessionModule.requireSession('/auth/sign-in')).user.id,uid);assert.equal(s.calls.length,0);
 const access=load('src/features/my/lib/require-parent-access.ts',{...mocks,'next/navigation':{redirect:href=>{throw new Error('REDIRECT '+href)}},'@/features/auth/lib/current-auth':{resolveCurrentAuth:async()=>({status:'profile_missing',user:s.user})},'@/shared/config/cross-product-navigation':{},'@/shared/lib/request-host':{}});
 reset();await assert.rejects(()=>access.getParentAccessState(next),error=>error.message==='REDIRECT '+contracts.completePhoneHref(next));
 console.log('PASS OTP normalization/HMAC, session/CSRF/config, provider dry-run/error, rate reservation, non-disclosure, trusted user binding, verify/relogin, role/email isolation, returnTo/child and zero-RPC Kakao gate');
})().catch(e=>{console.error(e);process.exitCode=1});
