// Explicit release smoke only. Creates isolated TEST identities/private rows, reads
// application pages, then removes exactly those fixture IDs. Never changes real classes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {loadEnvConfig}=require('@next/env'),{createClient}=require('@supabase/supabase-js');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
assert(process.argv.includes('--allow-test-fixtures'),'Explicit --allow-test-fixtures required');
loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const studioOrigin=process.env.LIFECYCLE_SMOKE_STUDIO_ORIGIN||'http://localhost:3100';
const parentOrigin=process.env.LIFECYCLE_SMOKE_PARENT_ORIGIN||studioOrigin;
assert(['http://localhost:3100','https://studio.firstsuup.com'].includes(studioOrigin));
assert(['http://localhost:3100','https://firstsuup.com'].includes(parentOrigin));
const prefix=studioOrigin.includes('localhost')?'/studio':'';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(url).hostname,'vfkfpekfwrjjocltqbty.supabase.co');
const client=k=>createClient(url,k,{auth:{persistSession:false,autoRefreshToken:false}}),db=client(process.env.SUPABASE_SERVICE_ROLE_KEY);
const out=process.env.LIFECYCLE_SMOKE_OUTPUT||'/tmp/class-lifecycle-final-release/local-smoke';fs.mkdirSync(out,{recursive:true,mode:0o700});
const m={org:randomUUID(),classes:[randomUUID(),randomUUID()],application:randomUUID(),users:[]};
const ok=async q=>{const r=await q;if(r.error)throw Error(r.error.message);return r.data;};
const save=()=>fs.writeFileSync(path.join(out,'fixture-ids.json'),JSON.stringify(m,null,2),{mode:0o600});
const results=[],errors=[],blockedWrites=[];let browser,studio,parent;
async function account(role){const password='TEST-'+randomUUID()+'!aA1',email='lifecycle-release-'+role+'-'+randomUUID()+'@test.invalid';const u=await ok(db.auth.admin.createUser({email,password,email_confirm:true}));m.users.push(u.user.id);save();await ok(db.from('profiles').upsert({id:u.user.id,name:'TEST LIFECYCLE RELEASE',role,organization_id:role==='academy'?m.org:null}));const c=client(key);const a=await ok(c.auth.signInWithPassword({email,password}));return {id:u.user.id,client:c,session:a.session};}
async function context(account,origin,width=1440){const ctx=await browser.newContext({viewport:{width,height:1000}});const value='base64-'+Buffer.from(JSON.stringify(account.session)).toString('base64url'),base='sb-'+new URL(url).hostname.split('.')[0]+'-auth-token';const chunks=value.match(/.{1,3000}/g);await ctx.addCookies(chunks.map((v,i)=>({name:chunks.length===1?base:base+'.'+i,value:v,domain:new URL(origin).hostname,path:'/',sameSite:'Lax',secure:origin.startsWith('https:')})));await ctx.route('**/*',r=>{if(!['GET','HEAD'].includes(r.request().method())){blockedWrites.push({method:r.request().method(),path:new URL(r.request().url()).pathname});return r.abort();}return r.continue();});return ctx;}
async function read(page,origin,route){const r=await page.goto(origin+route,{waitUntil:'networkidle',timeout:45000});assert.equal(r.status(),200,route);assert(!/sign-in/.test(page.url()),'authenticated route redirected: '+route);const body=await page.locator('body').innerText();assert(!/수업 목록을 불러오지 못했습니다|Application error:|Internal Server Error/.test(body),route);assert(!await page.locator('[data-nextjs-dialog]').count(),route);results.push({route:origin+route,status:200});}
(async()=>{try{
 await ok(db.from('organizations').insert({id:m.org,name:'TEST LIFECYCLE RELEASE - temporary'}));save();studio=await account('academy');parent=await account('parent');
 await ok(db.from('classes').insert(m.classes.map((id,i)=>({id,organization_id:m.org,title:i?'TEST lifecycle history':'TEST lifecycle eligible',subject:'math',target_age:'elem_3',description:'Temporary private release smoke fixture',is_active:false,assignment_mode:'post_assign'}))));
 await ok(db.from('trial_applications').insert({id:m.application,class_id:m.classes[1],parent_id:parent.id,child_name:'TEST CHILD',child_grade:'초3',requested_slot_at:new Date(Date.now()+86400000).toISOString(),status:'new'}));
 browser=await chromium.launch({channel:'chrome',headless:true});const sc=await context(studio,studioOrigin),p=await sc.newPage();p.on('pageerror',e=>errors.push(e.message));
 const login=await p.goto(studioOrigin+(prefix?'/studio/sign-in':'/auth/sign-in'),{waitUntil:'networkidle'});assert.equal(login.status(),200);results.push({route:'Studio login',status:200});
 await read(p,studioOrigin,prefix+'/classes');await p.getByRole('heading',{name:'수업 관리',exact:true}).waitFor();for(const name of ['전체 운영 수업','운영 중','비공개','종료된 수업'])assert.equal(await p.getByRole('button',{name,exact:true}).count(),1);
 const eligible=p.locator('#studio-class-row-'+m.classes[0]);await eligible.getByRole('button',{name:/관리 메뉴/}).click();assert.equal(await eligible.getByRole('button',{name:'영구 삭제',exact:true}).count(),1);assert.equal(await eligible.getByRole('button',{name:'수업 종료',exact:true}).count(),1);await p.screenshot({path:path.join(out,'classes-eligible.png'),fullPage:true});
 await p.keyboard.press('Escape');const history=p.locator('#studio-class-row-'+m.classes[1]);await history.getByRole('button',{name:/관리 메뉴/}).click();assert.equal(await history.getByRole('button',{name:'영구 삭제',exact:true}).count(),0);assert.equal(await history.getByText('수업 삭제 불가',{exact:false}).count(),1);
 await p.keyboard.press('Escape');await p.getByRole('button',{name:'종료된 수업',exact:true}).click();assert.equal(await p.locator('[id^="studio-class-row-"]').count(),0);results.push({check:'Classes filters/lifecycle action UI/eligible and ineligible states',pass:true});
 for(const route of [prefix+'/schedule',prefix+'/cases',prefix||'/',prefix+'/applications/'+m.application])await read(p,studioOrigin,route);
 const pc=await context(parent,parentOrigin,390);await pc.addInitScript(ids=>localStorage.setItem('firstclass_favorites',JSON.stringify(ids)),m.classes);const pp=await pc.newPage();pp.on('pageerror',e=>errors.push(e.message));
 for(const route of ['/','/classes','/favorites','/my/applications'])await read(pp,parentOrigin,route);
 const publicClass=await ok(db.from('classes').select('id,organization_id').eq('is_active',true).is('archived_at',null).limit(1).single());
 await read(pp,parentOrigin,'/classes/'+publicClass.id);assert(await pp.getByRole('button',{name:/신청/}).count()+await pp.getByRole('link',{name:/신청/}).count()>0,'application entry renders');
 await read(pp,parentOrigin,'/academy/'+publicClass.organization_id);
 const privateResponse=await pp.goto(parentOrigin+'/classes/'+m.classes[0],{waitUntil:'networkidle'});assert([200,404].includes(privateResponse.status()));await pp.getByRole('heading',{name:/찾을 수/}).waitFor();assert.equal(await pp.getByRole('button',{name:/신청하기/}).count(),0);results.push({check:'private direct application entry excluded',pass:true});
 const eligibility=await ok(studio.client.rpc('get_studio_class_delete_eligibility'));assert.equal(eligibility.find(r=>r.class_id===m.classes[0]).can_permanently_delete,true);assert.equal(eligibility.find(r=>r.class_id===m.classes[1]).can_permanently_delete,false);
 assert.deepEqual(errors,[]);results.push({check:'authenticated archived_at query/RPC and browser runtime',pass:true});
 }finally{
 if(browser)await browser.close();
 // Exact fixture IDs only. Remove TEST application first, then use authorized lifecycle RPC cleanup.
 await ok(db.from('trial_applications').delete().eq('id',m.application).eq('class_id',m.classes[1]));
 for(const id of m.classes){const exists=await ok(db.from('classes').select('id').eq('id',id).eq('organization_id',m.org).maybeSingle());if(exists){assert(studio,'TEST Studio session required for cleanup');await ok(studio.client.rpc('mutate_studio_class_lifecycle',{p_class_id:id,p_action:'delete'}));}}
 for(const id of m.users)await ok(db.auth.admin.deleteUser(id));
 await ok(db.from('organizations').delete().eq('id',m.org));
 assert.equal((await ok(db.from('classes').select('id').in('id',m.classes))).length,0);m.cleaned=true;save();
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors,blockedWrites,fixtureCleanup:true,realClassMutations:0},null,2));
 }
 console.log(JSON.stringify({checks:results.length,runtimeErrors:errors.length,blockedBrowserWrites:blockedWrites.length,fixtureCleanup:m.cleaned,realClassMutations:0},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
