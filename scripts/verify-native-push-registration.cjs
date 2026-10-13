// Exercise the shipped native registration handler with inert auth/database boundaries.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file, deps = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports, require:n=>{if(n in deps)return deps[n];throw Error('unmocked '+n)}, Response, JSON});
 return exports;
}
const contracts=load('src/features/notifications/push/contracts.ts');
const {createNativePushDeviceHandler}=load('src/features/native/server/push-device.ts', {'@/features/notifications/push/contracts':contracts});
const id='00000000-0000-4000-8000-000000000001';
let state, writes, clients, passed=0;
function reset(){state={user:{id},role:'parent',deletion:false,phone:{required:true,excluded:false,phoneVerifiedAt:'2026-10-01'},enabled:true};writes=[];clients=[];}
const db={auth:{getUser:async token=>{assert.equal(token,'valid.jwt.token');return {data:{user:state.user},error:state.authError}}},
 from:table=>{assert.equal(table,'profiles');const q={select:()=>q,eq:(field,value)=>{assert.equal(field,'id');assert.equal(value,id);return q},maybeSingle:async()=>({data:{role:state.role},error:state.profileError})};return q},
 rpc:async(name,args)=>{
  if(name==='get_my_parent_account_deletion_status')return {data:state.deletion,error:state.gateError};
  if(name==='get_my_parent_phone_status')return {data:state.phone};
  assert.equal(name,'register_parent_push_device');writes.push(args);return {error:state.writeError};
 }};
const handle=createNativePushDeviceHandler({client:token=>{clients.push(token);if(state.throw)throw Error('inert');return db},enabled:()=>state.enabled});
const input={installationId:id,installationSecret:'a'.repeat(64),expoPushToken:'ExpoPushToken[fixtureToken20]',platform:'ios',permissionStatus:'granted',appVersion:'1.0.0'};
const req=(body=input,headers={authorization:'Bearer valid.jwt.token','content-type':'application/json'})=>new Request('https://firstsuup.com/api/native/parent/push-devices',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
async function check(response,status,error){assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Authorization');if(error)assert.equal((await response.json()).error,error);}
const pass=label=>{passed++;console.log('PASS '+label)};
(async()=>{
 reset();for(const authorization of ['', 'Basic abc','Bearer '+ 'x'.repeat(8193)])await check(await handle(req(input,{authorization})),401,'login_required');assert.equal(clients.length,0);pass('missing/malformed bearer never creates a client');
 reset();state.user=null;await check(await handle(req()),401,'login_required');assert.equal(writes.length,0);pass('unverified identity cannot register');
 reset();state.role='teacher';await check(await handle(req()),403,'parent_required');assert.equal(writes.length,0);pass('non-Parent blocked');
 for(const deletion of [true,null]){reset();state.deletion=deletion;await check(await handle(req()),deletion?403:503);assert.equal(writes.length,0)}pass('pending deletion and unavailable gates fail closed');
 reset();state.phone.phoneVerifiedAt=null;await check(await handle(req()),403,'phone_verification_required');assert.equal(writes.length,0);state.phone.excluded=true;await check(await handle(req()),200);pass('phone verification required except explicit server exclusion');
 reset();state.enabled=false;await check(await handle(req()),503,'push_disabled');assert.equal(writes.length,0);const get=await handle(new Request('https://firstsuup.com/api/native/parent/push-devices',{headers:{authorization:'Bearer valid.jwt.token'}}));await check(get,200);assert.equal((await get.json()).enabled,false);pass('OFF is readable but prevents registration');
 reset();for(const body of [{...input,parentId:id},'bad JSON','x'.repeat(2049),{...input,expoPushToken:'bad'}])await check(await handle(req(body)),400,'invalid_input');assert.equal(writes.length,0);pass('reject identity injection, oversized body and invalid token');
 reset();await check(await handle(req()),200);assert.equal(writes.length,1);assert.deepEqual(JSON.parse(JSON.stringify(writes[0])),{p_installation_id:id,p_secret:input.installationSecret,p_token:input.expoPushToken,p_platform:'ios',p_permission:'granted',p_version:'1.0.0'});pass('RPC receives only device input under verified caller identity');
 reset();state.writeError=true;await check(await handle(req()),409,'device_registration_failed');state.throw=true;await check(await handle(req()),503,'temporarily_unavailable');pass('provider failures return bounded errors without secrets');
 const route=fs.readFileSync('app/api/native/parent/push-devices/route.ts','utf8');assert(route.includes('createNativePushDeviceHandler'));assert(route.includes('Authorization: `Bearer ${token}`'));assert(!route.includes('ServiceRole'));pass('shipped route binds bearer client; no service-role registration');
 console.log(`PASS ${passed} native registration suites`);
})().catch(e=>{console.error(e);process.exitCode=1});
