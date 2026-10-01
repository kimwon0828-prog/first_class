// Explicitly approved release smoke only. No existing users or Academy rows touched.
// Full Academy-history coverage is the rollback-only companion SQL verifier.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const {loadEnvConfig}=require('@next/env'),{createClient}=require('@supabase/supabase-js')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright')
assert.equal(process.env.PARENT_DELETION_PRODUCTION_SMOKE,'approved-v1')
const out=process.env.PARENT_DELETION_RELEASE_EVIDENCE;assert(out)
const ready=JSON.parse(fs.readFileSync(out+'/deployment-ready.json','utf8'));assert.equal(ready.state,'READY');assert.equal(ready.target,'production');assert(ready.alias.includes('firstsuup.com'))
loadEnvConfig(process.env.PARENT_DELETION_RELEASE_ENV_DIR||process.cwd(),true,{info(){},error(){}})
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
assert.equal(url,'https://vfkfpekfwrjjocltqbty.supabase.co');assert(process.env.SUPABASE_SERVICE_ROLE_KEY)
const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const fresh=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const ok=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data}
const email=`test-parent-release-${Date.now()}@example.test`,password='Qa!'+crypto.randomBytes(24).toString('hex'),ids=[],results=[],errors=[]
const pass=s=>{results.push(s);console.log('PASS '+s)}
const save=()=>fs.writeFileSync(out+'/production-test-identities.json',JSON.stringify({email,ids},null,2),{mode:0o600})
let browser,allowAction=false
async function create(){const {user}=await ok(db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'TEST RELEASE Parent',signup_intent:'parent'}}));ids.push(user.id);save();await ok(db.from('profiles').insert({id:user.id,role:'parent',name:'TEST RELEASE Parent'}));const c=fresh();const auth=await ok(c.auth.signInWithPassword({email,password}));assert.equal(auth.user.id,user.id);return {id:user.id,client:c,session:auth.session}}
async function sessionContext(account){const c=await browser.newContext({viewport:{width:390,height:844}});await c.route('**/*',r=>{const u=new URL(r.request().url()),method=r.request().method();if(!['firstsuup.com','vfkfpekfwrjjocltqbty.supabase.co'].includes(u.hostname))return r.abort();if(method!=='GET'&&method!=='HEAD'&&method!=='OPTIONS'&&!(allowAction&&u.hostname==='firstsuup.com'&&u.pathname==='/my'&&r.request().headers()['next-action']))return r.abort();return r.continue()});const value='base64-'+Buffer.from(JSON.stringify(account.session)).toString('base64url'),name='sb-vfkfpekfwrjjocltqbty-auth-token',parts=value.match(/.{1,3180}/g);await c.addCookies(parts.map((value,i)=>({name:parts.length===1?name:`${name}.${i}`,value,domain:'firstsuup.com',path:'/',sameSite:'Lax',secure:true})));const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return {c,p}}
async function visit(p,path){const r=await p.goto('https://firstsuup.com'+path,{waitUntil:'domcontentloaded'});assert(r && r.status()<400,`${path}: ${r?.status()}`);return r}
;(async()=>{
 const anon=fresh();assert((await anon.rpc('prepare_my_parent_account_deletion')).error);pass('Production anonymous HTTP RPC denied')
 const a=await create();assert((await a.client.rpc('prepare_my_parent_account_deletion',{p_user_id:crypto.randomUUID()})).error);pass('Production RPC rejects arbitrary target UID')
 await ok(db.from('children').insert([{parent_id:a.id,name:'TEST Child A',grade:'초3'},{parent_id:a.id,name:'TEST Child B',grade:'초4'}]));await ok(db.from('parent_notification_reads').insert({parent_id:a.id,notification_key:'status:'+crypto.randomUUID()}))
 browser=await chromium.launch({channel:'chrome',headless:true});const {c,p}=await sessionContext(a)
 for(const path of ['/','/my','/my/children','/my/applications','/favorites','/terms','/privacy','/third-party-consent']){await visit(p,path);assert(!p.url().includes('/auth/sign-in'),path);assert(!/Internal Server Error|Application error|내 정보를 불러오지 못/.test(await p.locator('body').innerText()),path)}
 pass('Production Parent Home/MyPage/children/applications/favorites/policy routes render')
 await visit(p,'/my');await p.getByRole('heading',{name:'TEST RELEASE Parent님'}).waitFor();await p.getByRole('button',{name:'내 정보 수정하기'}).click();await p.getByRole('dialog',{name:'내 정보 수정',exact:true}).waitFor();await p.getByRole('dialog',{name:'내 정보 수정',exact:true}).getByRole('button',{name:'취소',exact:true}).click();pass('Production profile sheet opens and cancels without profile write')
 await p.evaluate(id=>{localStorage.setItem('firstclass_favorites_account',id);localStorage.setItem('firstclass_favorites',JSON.stringify(['test-release-favorite']))},a.id)
 await p.getByRole('button',{name:'회원탈퇴',exact:true}).click();const sheet=p.getByRole('dialog',{name:'회원탈퇴',exact:true});await sheet.waitFor();await p.screenshot({path:out+'/production-deletion-explanation.png',fullPage:true});await sheet.getByRole('button',{name:'회원탈퇴 계속'}).click();await sheet.getByRole('heading',{name:'정말 탈퇴하시겠어요?'}).waitFor()
 allowAction=true;await sheet.getByRole('button',{name:'회원탈퇴',exact:true}).click();await p.waitForURL('**/account-deleted',{timeout:60000});allowAction=false
 await p.getByText('회원탈퇴가 완료되었습니다.',{exact:true}).waitFor();await p.waitForFunction(()=>localStorage.getItem('firstclass_favorites')===null);await p.screenshot({path:out+'/production-deletion-complete.png',fullPage:true})
 assert((await db.auth.admin.getUserById(a.id)).error)
 for(const table of ['profiles','children','parent_decisions','experience_feedback','parent_notification_reads','parent_report_engagement'])assert.equal((await ok(db.from(table).select('*').eq(table==='profiles'?'id':'parent_id',a.id))).length,0,table)
 assert.equal((await c.cookies()).filter(x=>x.name.includes('auth-token')).length,0)
 assert((await fresh().auth.signInWithPassword({email,password})).error)
 pass('Production synthetic Parent final CTA: personal cleanup, Auth deletion, session/favorites removal, old login denied')
 await visit(p,'/my');await p.getByRole('button',{name:'카카오로 3초 만에 시작하기'}).waitFor();await c.close()
 const b=await create();assert.notEqual(a.id,b.id);for(const table of ['my_trial_applications','children','experience_feedback'])assert.equal((await ok(b.client.from(table).select('*'))).length,0,table)
 const rejoin=await sessionContext(b);await visit(rejoin.p,'/my');await rejoin.p.getByRole('heading',{name:'TEST RELEASE Parent님'}).waitFor();assert.equal(await rejoin.p.evaluate(()=>localStorage.getItem('firstclass_favorites')),null);await rejoin.c.close();pass('same-email rejoin uses new UUID with empty personal ownership/favorites')
 assert.deepEqual(errors,[]);pass('Production browser has no unhandled runtime errors')
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 await browser?.close()
 // Only IDs created above. Never search for or remove other TEST/real users.
 const cleanup=[]
 for(const id of ids){const lookup=await db.auth.admin.getUserById(id);if(lookup.error){assert(lookup.error.status===404 || lookup.error.code==='user_not_found');cleanup.push(id);continue}assert.equal(lookup.data.user.email,email);await ok(db.auth.admin.deleteUser(id));cleanup.push(id)}
 for(const id of ids){assert((await db.auth.admin.getUserById(id)).error);assert.equal((await ok(db.from('profiles').select('id').eq('id',id))).length,0)}
 save();fs.writeFileSync(out+'/production-browser-results.json',JSON.stringify({results,errors,fixtureAuthIds:ids,cleanupComplete:cleanup.length===ids.length,externalNotifications:0,persistedAcademyFixtures:0,fullHistoryMode:'transaction rollback RPC smoke'},null,2));console.log('Synthetic fixture cleanup complete')
})
