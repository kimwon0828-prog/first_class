// Isolated actual modules; all DB/auth/HTTP transports are inert fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const load=(file,deps={})=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(n in deps)return deps[n];throw Error('unmocked '+n)},process:{env:{PARENT_PUSH_REGISTRATION_ENABLED:'true'}},console:{warn(){}},fetch:()=>{throw Error('live fetch forbidden')},AbortSignal,Date,URL,Response,JSON});return exports};
const c=load('src/features/notifications/push/contracts.ts');const transport=load('src/features/notifications/push/test-transport.ts');
const uuid='00000000-0000-4000-8000-000000000001',device={id:'device',expo_push_token:'ExpoPushToken[abcdefghijklmnop]'};
let checks=0;const pass=s=>{checks++;console.log('PASS '+s)};
(async()=>{
const input={installationId:uuid,installationSecret:'a'.repeat(64),expoPushToken:device.expo_push_token,platform:'ios',permissionStatus:'granted',appVersion:'1'};
assert(c.parsePushDevice(input));for(const invalid of [{...input,parent_id:uuid},{...input,expoPushToken:'https://evil.test'}, {...input,installationSecret:'bad'}, {...input,platform:'web'},{...input,permissionStatus:'granted',expoPushToken:null}])assert.equal(c.parsePushDevice(invalid),null);pass('registration schema rejects parent_id, arbitrary URL/token, bad proof/platform');
for(const p of ['https://evil.test','//evil.test','javascript:alert(1)','/\\evil.test','/record/../studio','/my/schedule?returnTo=https://evil.test','/record/x/report'])assert(!c.safePushPath(p));pass('strict internal canonical push routes only');
const accepted=await transport.sendExpoTestPush(device.expo_push_token,'test:'+uuid,async(url,options)=>{
 const payload=JSON.parse(options.body);assert.equal(payload.title,'첫수업 알림 테스트');assert.equal(payload.body,'알림이 정상적으로 연결되었어요.');assert.equal(payload.data.path,'/notifications');assert.equal(payload.data.type,'test');
 return Response.json({data:{status:'ok',id:'ticket'}});
});assert.equal(accepted.status,'accepted');
let sends=0;const unknown=await transport.sendExpoTestPush(device.expo_push_token,'test:'+uuid,async()=>{sends++;throw Error('timeout')});assert.equal(unknown.status,'unknown');assert.equal(sends,1);
assert.equal((await transport.sendExpoTestPush(device.expo_push_token,'test:'+uuid,async()=>Response.json({data:{status:'error',details:{error:'DeviceNotRegistered'}}}))).category,'DeviceNotRegistered');
pass('one-off fixed test payload; no automatic retry; safe invalid-token category');
let user=true,role='parent',pending=false,rpcCalls=0,lastArgs;
const api=load('app/api/parent/push-devices/route.ts',{'next/server':{NextResponse:Response},'@/integrations/supabase/server':{getSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:user?{id:'session-parent'}:null}})},rpc:async(_,args)=>{rpcCalls++;lastArgs=args;return {error:null}}})},'@/features/auth/lib/profile-sync':{getProfileForUser:async()=>({status:'ok',profile:{role}})},'@/features/my/lib/parent-account-deletion-server':{isMyParentAccountDeletionPending:async()=>pending},'@/features/notifications/push/contracts':c});
const req=(payload=input,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/parent/push-devices',{method:'POST',headers:{origin,host:'localhost:3000','content-type':'application/json'},body:JSON.stringify(payload)});
assert.equal((await api.POST(req())).status,200);assert(!('parent_id'in lastArgs));assert(!('p_parent_id'in lastArgs));assert.equal((await api.POST(req({...input,parent_id:uuid}))).status,400);assert.equal((await api.POST(req(input,'https://evil.test'))).status,403);assert.equal((await api.POST(req(input,'invalid'))).status,403);
user=false;assert.equal((await api.POST(req())).status,401);user=true;role='teacher';assert.equal((await api.POST(req())).status,401);role='parent';pending=true;assert.equal((await api.POST(req())).status,401);assert.equal(rpcCalls,1);pass('actual API: authenticated Parent only, ownership payload rejected, CSRF/deletion guards');
console.log('ALL PASS '+checks+' foundation contract suites; no external sends or DB writes');
})().catch(e=>{console.error(e);process.exitCode=1});
