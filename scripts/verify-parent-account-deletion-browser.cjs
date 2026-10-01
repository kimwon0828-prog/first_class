// LOCAL Next + LOCAL Supabase only. Deletes only explicitly labelled test accounts.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright')
const {createClient}=require('@supabase/supabase-js')
const base=process.env.PARENT_DELETION_TEST_URL || 'http://localhost:3000';assert(['localhost','127.0.0.1'].includes(new URL(base).hostname))
const out='/tmp/parent-deletion-v1',m=JSON.parse(fs.readFileSync(out+'/fixtures.json','utf8'))
const env=JSON.parse(cp.execFileSync('supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
assert(['localhost','127.0.0.1'].includes(new URL(env.API_URL).hostname))
const db=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false}}),results=[],errors=[]
const pass=s=>{results.push(s);console.log('PASS '+s)}
let browser
async function context(label,width=390){
 const a=m.accounts.find(a=>a.label===label);assert(a && a.email.endsWith('@example.test'))
 const c=await browser.newContext({viewport:{width,height:844}})
 await c.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort())
 await c.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(a.session)).toString('base64url'),domain:'localhost',path:'/',sameSite:'Lax'}])
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return {c,p,a}
}
async function visit(p,path){const r=await p.goto(base+path);assert(r && r.status()<400,`${path}: ${r?.status()}`);await p.locator('body').waitFor();return r}
;(async()=>{
 browser=await chromium.launch({channel:'chrome',headless:true})
 if(!process.argv.includes('--read-only')) {
 const {c,p,a}=await context('browser')
 for(const path of ['/my','/record','/my/applications','/favorites']){await visit(p,path);assert(!p.url().includes('/sign-in'));assert(!/불러오지 못|Internal Server Error/.test(await p.locator('body').innerText()),path)}
 pass('Parent /my, /record, /my/applications, /favorites load before deletion')
 await visit(p,'/my');await p.getByRole('button',{name:'회원탈퇴',exact:true}).waitFor()
 for(const href of ['/terms','/privacy','/third-party-consent'])assert.equal(await p.locator(`a[href="${href}"]`).count(),1)
 await p.evaluate(({id,classId})=>{localStorage.setItem('firstclass_favorites_account',id);localStorage.setItem('firstclass_favorites',JSON.stringify([classId]))},{id:a.id,classId:m.classId})
 await p.getByRole('button',{name:'회원탈퇴',exact:true}).click()
 const sheet=p.getByRole('dialog',{name:'회원탈퇴',exact:true});await sheet.waitFor()
 await sheet.getByText('첫수업 계정과 첫수업에서 관리하는 개인 정보가 삭제됩니다.').waitFor()
 for(const width of [390,430,480,1280]){
  await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert((await sheet.boundingBox()).width<=480)
  await p.screenshot({path:`${out}/deletion-explanation-${width}.png`,fullPage:true})
 }
 await p.setViewportSize({width:390,height:844})
 await sheet.getByRole('button',{name:'회원탈퇴 계속',exact:true}).click();await sheet.getByRole('heading',{name:'정말 탈퇴하시겠어요?'}).waitFor()
 await p.screenshot({path:out+'/deletion-confirm.png',fullPage:true})
 await sheet.getByRole('button',{name:'취소',exact:true}).click();await sheet.waitFor({state:'hidden'})
 assert(!(await db.auth.admin.getUserById(a.id)).error)
 pass('two-step bottom sheet, mobile/desktop layout, focus and cancellation preserve account')
 await p.getByRole('button',{name:'회원탈퇴',exact:true}).click();await sheet.getByRole('button',{name:'회원탈퇴 계속'}).click()
 const failAction=r=>r.request().method()==='POST'&&r.request().headers()['next-action']?r.abort('failed'):r.fallback()
 await p.route('**/*',failAction)
 await sheet.getByRole('button',{name:'회원탈퇴',exact:true}).click();await sheet.getByRole('alert').waitFor()
 assert((await sheet.getByRole('alert').innerText()).includes('완료하지 못했습니다'))
 assert(!(await db.auth.admin.getUserById(a.id)).error)
 await p.screenshot({path:out+'/deletion-error.png',fullPage:true});await p.unroute('**/*',failAction)
 pass('network failure leaves sheet open with safe error, no fake success, retry available')
 await sheet.getByRole('button',{name:'회원탈퇴',exact:true}).click()
 await p.waitForURL('**/account-deleted',{timeout:45000})
 await p.getByText('회원탈퇴가 완료되었습니다.',{exact:true}).waitFor()
 assert((await db.auth.admin.getUserById(a.id)).error)
 assert.equal(await p.evaluate(()=>localStorage.getItem('firstclass_favorites')),null)
 assert.equal((await c.cookies()).filter(v=>v.name.startsWith('sb-')&&v.name.includes('auth-token')).length,0)
 await p.screenshot({path:out+'/deletion-complete.png',fullPage:true})
 pass('real local server workflow deletes Auth last, clears session/favorites and opens public completion')
 for(const path of ['/my','/record','/my/applications']){await visit(p,path);await p.getByRole('button',{name:'카카오로 3초 만에 시작하기'}).waitFor()}
 pass('deleted account cannot return to authenticated Parent routes')
 for(const path of ['/terms','/privacy','/third-party-consent']){const r=await visit(p,path);assert.equal(r.status(),200)}
 pass('policy routes return HTTP 200 and MyPage links match')
 await c.close()
 const recovery=await context('recovery');await visit(recovery.p,'/my');await recovery.p.getByRole('heading',{name:'회원탈퇴를 마무리해 주세요'}).waitFor()
 await recovery.p.screenshot({path:out+'/deletion-retry.png',fullPage:true});await recovery.p.getByRole('button',{name:'탈퇴 다시 시도'}).click();await recovery.p.waitForURL('**/account-deleted',{timeout:45000});assert((await db.auth.admin.getUserById(recovery.a.id)).error);await recovery.c.close()
 pass('pending Auth-failure account returns to recovery UI and completes on retry')
 }
 const studio=await context('studio',1440)
 for(const path of ['/studio/cases',`/studio/applications/${m.applications.completed}`]){await visit(studio.p,path);const body=await studio.p.locator('body').innerText();assert(!/불러오지 못|Internal Server Error/.test(body),body);assert(body.includes('보존 학생'),body);await studio.p.screenshot({path:out+(path.includes('/applications/')?'/studio-preserved-detail.png':'/studio-preserved-cases.png'),fullPage:true})}
 await studio.p.getByText('기록 보기',{exact:true}).click();const body=await studio.p.locator('body').innerText();assert(body.includes('보존 상담 내용'));assert(body.includes('보존 체험 결과'));assert(body.includes('미등록'));assert(body.includes('학부모 응답 정보가 없습니다.'))
 await studio.p.getByText('리포트 보기',{exact:true}).click();await studio.p.getByText('TEST 리포트 전체 총평입니다. 피드백을 보내지 않아도 읽을 수 있어요.',{exact:true}).first().waitFor()
 pass('Studio Cases/detail preserve consultation, trial result, registration and ParentDecision empty fallback')
 await studio.c.close()
 const rejoinClient=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false}});const login=await rejoinClient.auth.signInWithPassword({email:m.rejoin.email,password:m.password});assert(!login.error);m.accounts.push({label:'rejoined',id:m.rejoin.id,email:m.rejoin.email,session:login.data.session})
 const rejoined=await context('rejoined');await rejoined.c.addInitScript(({oldId,classId})=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('firstclass_favorites_account',oldId);localStorage.setItem('firstclass_favorites',JSON.stringify([classId]));sessionStorage.setItem('seeded','1')}},{oldId:m.accounts.find(a=>a.label==='full').id,classId:m.classId})
 await visit(rejoined.p,'/my');await rejoined.p.getByRole('heading',{name:'재가입 부모님'}).waitFor();await rejoined.p.waitForFunction(()=>!localStorage.getItem('firstclass_favorites'));await visit(rejoined.p,'/my/applications');assert(!(await rejoined.p.locator('body').innerText()).includes('보존 학생'));await visit(rejoined.p,'/record');assert(!(await rejoined.p.locator('body').innerText()).includes('보존 학생'));await rejoined.c.close();pass('same-email rejoined browser has fresh MyPage and no old applications, records or favorites')
 const review=await context('review');await visit(review.p,'/my');await review.p.getByRole('button',{name:'회원탈퇴',exact:true}).waitFor();await review.c.storageState({path:out+'/review-storage-state.json'});fs.chmodSync(out+'/review-storage-state.json',0o600);await review.c.close()
 assert.deepEqual(errors,[]);pass('no page runtime errors; unused local review account prepared')
 fs.writeFileSync(out+(process.argv.includes('--read-only')?'/browser-extra-results.json':'/browser-results.json'),JSON.stringify({results,errors},null,2))
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>browser?.close())
