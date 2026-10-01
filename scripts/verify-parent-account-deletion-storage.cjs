// Isolated local Storage ownership/failure test and concurrent complete workflows.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process'),vm=require('node:vm'),ts=require('typescript')
const {createClient}=require('@supabase/supabase-js')
const env=JSON.parse(cp.execFileSync('supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));assert(['localhost','127.0.0.1'].includes(new URL(env.API_URL).hostname))
const db=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false}}),api={},results=[]
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/my/lib/parent-account-deletion-workflow.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,Map})
const ok=async p=>{const r=await p;if(r.error)throw r.error;return r.data},pass=s=>{results.push(s);console.log('PASS '+s)}
const suffix=Date.now().toString(36),bucket='deletion-fixture-'+suffix,policy='deletion_fixture_'+suffix
const sql=s=>cp.execFileSync('docker',['exec','-i','supabase_db_first-class-mvp','psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'],{input:s,encoding:'utf8'})
async function parent(label){const email=`deletion-${suffix}-${label}@example.test`,password='LocalOnly-DeleteV1!';const {user}=await ok(db.auth.admin.createUser({email,password,email_confirm:true}));await ok(db.from('profiles').insert({id:user.id,role:'parent',name:'LOCAL storage fixture'}));const client=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false}});await ok(client.auth.signInWithPassword({email,password}));return {id:user.id,client}}
;(async()=>{
 const a=await parent('storage');await ok(db.storage.createBucket(bucket,{public:false}))
 sql(`create policy ${policy} on storage.objects for insert to authenticated with check (bucket_id='${bucket}' and auth.uid()='${a.id}'::uuid);`)
 try {
  await ok(a.client.storage.from(bucket).upload('owned.txt',Buffer.from('LOCAL fixture')))
  let deletes=0
  const failAdmin={storage:{from:()=>({remove:async()=>({error:{message:'fixture storage failure'}})})},auth:{admin:{deleteUser:async()=>{deletes++;return {error:null}}}}}
  const failed=await api.deleteParentAccountWorkflow(a.client,failAdmin);assert.equal(failed.status,'error');assert.equal(failed.cleanupStarted,true);assert.equal(deletes,0)
  assert.equal((await ok(a.client.rpc('get_my_parent_deletion_storage_objects'))).length,1)
  assert((await a.client.storage.from(bucket).upload('new.txt',Buffer.from('blocked'))).error)
  pass('owned object discovered; Storage failure leaves Auth alive; pending account cannot upload new objects')
  assert.equal((await api.deleteParentAccountWorkflow(a.client,db)).status,'success')
  assert.equal((await ok(db.storage.from(bucket).list())).length,0);assert((await db.auth.admin.getUserById(a.id)).error)
  pass('retry removes actual Storage file before Auth deletion')
 } finally {sql(`drop policy ${policy} on storage.objects`);await ok(db.storage.from(bucket).remove(['owned.txt','new.txt']));await ok(db.storage.deleteBucket(bucket))}
 const concurrent=await parent('concurrent');let count=0,release;const barrier=new Promise(resolve=>release=resolve)
 const proxy={auth:concurrent.client.auth,rpc:async(name)=>{const r=await concurrent.client.rpc(name);if(name==='prepare_my_parent_account_deletion'){count++;if(count===2)release();await barrier}return r}}
 const r=await Promise.all([api.deleteParentAccountWorkflow(proxy,db),api.deleteParentAccountWorkflow(proxy,db)])
 assert(r.every(x=>x.status==='success'),JSON.stringify(r));assert((await db.auth.admin.getUserById(concurrent.id)).error)
 pass('two overlapping verified deletion workflows complete consistently, duplicate Auth delete is safe')
 fs.writeFileSync('/tmp/parent-deletion-v1/storage-results.json',JSON.stringify(results,null,2))
})().catch(e=>{console.error(e);process.exitCode=1})
