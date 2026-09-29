// Actual localhost routes, real local JWTs, HTML/RSC and interactive form verification.
// PLAYWRIGHT_MODULE_PATH=/path/to/playwright node scripts/verify-parent-experience-feedback-browser.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright')
const {createClient}=require('@supabase/supabase-js')
const out='/tmp/parent-feedback-v1',m=JSON.parse(fs.readFileSync(`${out}/fixtures.json`))
const env=Object.fromEntries(cp.execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\n').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^"|"$/g,'')]}))
assert(['localhost','127.0.0.1'].includes(new URL(env.API_URL).hostname))
const db=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
for(const a of m.accounts)fs.writeFileSync(`${out}/${a.label}-state.json`,JSON.stringify({cookies:[{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(a.session)).toString('base64url'),domain:'localhost',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'}],origins:[]}),{mode:0o600})
const base='http://localhost:3000',results=[],errors=[]
let browser
async function update(id,values){const r=await db.from('trial_applications').update(values).eq('id',id);if(r.error)throw Error(r.error.message)}
const forbidden=['FEEDBACK_PRIVATE_CANARY','NOTE_ONLY_PRIVATE_CANARY','PRIVATE_NOTE_ONLY','TEST_CHILD_FEEDBACK_PRIVATE',...m.accounts.map(a=>a.id),...Object.values(m.applications)]
function checkPublic(text, ownViewerId=null){for(const value of forbidden.filter(value=>value!==ownViewerId))assert(!text.includes(value),`public response leaked ${value}`)}
const pass=s=>{results.push(s);console.log('PASS '+s)}
;(async()=>{
 browser=await chromium.launch({channel:'chrome',headless:true})
 const reset=await db.from('experience_feedback').delete().eq('application_id',m.applications.unsubmitted);if(reset.error)throw Error(reset.error.message)
 const parent=await browser.newContext({viewport:{width:390,height:844},storageState:`${out}/parent1-state.json`})
 const page=await parent.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())})
 const shot=async(name,p=page)=>{await p.evaluate(()=>window.scrollTo(0,0));await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await p.screenshot({path:`${out}/${name}.png`,fullPage:true});const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert(!overflow,`${name} horizontal overflow`)}
 const route=id=>`${base}/record/${id}`
 await page.goto(route(m.applications.unsubmitted));await page.getByRole('heading',{name:'체험은 어떠셨나요?'}).waitFor()
 const section=page.locator('[data-parent-feedback]'),chips=section.locator('button[aria-pressed]')
 assert.equal(await chips.count(),18);await shot('01-parent-unsubmitted');pass('completed without report, real Parent form with 18 chips')
 for(let i=0;i<3;i++)await chips.nth(i).click()
 await shot('02-parent-three');assert.equal(await section.locator('[aria-pressed="true"]').count(),3);pass('3/5 selection')
 for(let i=3;i<5;i++)await chips.nth(i).click()
 assert.equal(await section.locator('button[aria-pressed="false"]:disabled').count(),13)
 assert.equal(await section.locator('button[aria-pressed="true"]:disabled').count(),0)
 await shot('03-parent-five');pass('5/5 disables only unselected chips')
 await chips.nth(0).focus();await page.keyboard.press('Space');assert.equal(await section.locator('[aria-pressed="true"]').count(),4);pass('keyboard toggle and selected-chip deselection')
 for(let i=1;i<5;i++)await chips.nth(i).click()
 const note=section.getByRole('textbox',{name:'학원에 전하고 싶은 의견이 있나요?'})
 await note.fill('UI_NOTE_ONLY_PRIVATE_CANARY 학원에 전할 의견이에요.')
 await shot('04-parent-note-only')
 // Make the actual server reject eligibility; failed submission must retain the form.
 await update(m.applications.unsubmitted,{status:'canceled',canceled_at:new Date().toISOString()})
 await section.getByRole('button',{name:'피드백 보내기',exact:true}).click();await section.getByRole('alert').waitFor()
 assert.equal(await note.inputValue(),'UI_NOTE_ONLY_PRIVATE_CANARY 학원에 전할 의견이에요.')
 pass('failed save retains note/selection')
 await update(m.applications.unsubmitted,{status:'completed',canceled_at:null})
 await page.route('**/record/**',async route=>{if(route.request().method()==='POST')await new Promise(r=>setTimeout(r,400));await route.continue()})
 await section.getByRole('button',{name:'피드백 보내기',exact:true}).click()
 await section.locator('form[aria-busy="true"]').waitFor()
 assert(await section.getByRole('button',{name:'보내는 중…'}).isDisabled());pass('pending submit disabled; double click prevented')
 await section.getByRole('button',{name:'수정하기',exact:true}).waitFor()
 await page.unroute('**/record/**')
 await shot('05-parent-submitted');assert((await section.innerText()).includes('UI_NOTE_ONLY_PRIVATE_CANARY'));pass('note-only real server action saves and displays receipt')
 await section.getByRole('button',{name:'수정하기',exact:true}).click()
 await section.getByRole('button',{name:'아이가 즐거워했어요',exact:true}).click()
 await shot('06-parent-edit')
 await section.getByRole('button',{name:'수정한 피드백 보내기',exact:true}).click();await section.getByRole('button',{name:'수정하기',exact:true}).waitFor();pass('real edit replaces current response')
 // Local-only simulated RPC read failure must not become an empty overwrite form.
 const sql=s=>cp.execFileSync('docker',['exec','-i','supabase_db_first-class-mvp','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,stdio:['pipe','pipe','pipe']})
 try {
   sql('revoke execute on function public.get_parent_experience_feedback_context(uuid) from authenticated;')
   await page.reload();await page.getByText('피드백을 불러오지 못했어요. 다시 확인해 주세요.').waitFor()
   assert.equal(await page.locator('[data-parent-feedback] form').count(),0);await shot('16-parent-load-error');pass('read failure has retry notice, no empty overwrite form')
 } finally { sql('grant execute on function public.get_parent_experience_feedback_context(uuid) to authenticated;') }
 await page.goto(route(m.applications.levelTestUnsubmitted));await page.getByRole('heading',{name:'체험은 어떠셨나요?'}).waitFor()
 assert.equal(await page.locator('[data-parent-feedback] button[aria-pressed]').count(),14)
 for(const label of ['수업에 집중했어요','수업이 체계적이었어요','활동이 흥미로웠어요','직접 해보는 활동이 좋았어요'])assert.equal(await page.getByRole('button',{name:label,exact:true}).count(),0)
 await shot('07-parent-level-test');pass('level_test actual UI hides four forbidden chips')
 await page.goto(route(m.applications.confirmed));await page.waitForLoadState('networkidle')
 assert.equal(await page.locator('#experience-feedback').count(),0);await shot('08-parent-not-eligible');pass('not completed has no feedback form')
 // Public pages are checked both as guest and authenticated Parent, including RSC navigation.
 const guest=await browser.newContext({viewport:{width:390,height:844}}),pub=await guest.newPage()
 pub.on('pageerror',e=>errors.push(e.message));pub.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())})
 const payloads=[]
 pub.on('response',async r=>{if(r.url().startsWith(base)&&(/text\/html|text\/x-component/.test(r.headers()['content-type']||''))){try{payloads.push(await r.text())}catch{}}})
 for(const [name,path,scope,visible] of [['09-class-public',`/classes/${m.classes['체험수업']}`,'CLASS',true],['10-academy-public',`/academy/${m.organizationId}`,'ACADEMY',true],['11-class-hidden',`/classes/${m.classes['응답 부족']}`,'CLASS',false]]){
  const response=await pub.goto(base+path);assert.equal(response.status(),200);await pub.waitForLoadState('networkidle')
  const feedback=pub.locator(`[data-feedback-public="${scope}"]`)
  assert.equal(await feedback.count(),visible?1:0)
  checkPublic(await response.text());checkPublic(await pub.content());await shot(name,pub)
 }
 await pub.goto(`${base}/academy/${m.organizationId}`)
 await pub.locator(`a[href="/classes/${m.classes['체험수업']}"]`).click();await pub.waitForURL(`**/classes/${m.classes['체험수업']}`)
 await pub.waitForLoadState('networkidle');for(const payload of payloads)checkPublic(payload)
 assert(payloads.some(t=>t.includes('data-feedback-public')));pass('Class/Academy actual HTML, RSC, serialized props: no private data; below threshold absent')
 // Existing signed-in Class application UI includes the viewer's own auth identity.
 // Exempt ONLY that existing viewer ID; all feedback/application IDs and notes remain forbidden.
 for(const path of [`/classes/${m.classes['체험수업']}`,`/academy/${m.organizationId}`]){const r=await page.goto(base+path);checkPublic(await r.text(),m.accounts[0].id);checkPublic(await page.content(),m.accounts[0].id)}
 pass('authenticated Parent public pages do not leak own private data')
 const studio=await browser.newContext({viewport:{width:1440,height:1100},storageState:`${out}/studio-state.json`}),sp=await studio.newPage()
 sp.on('pageerror',e=>errors.push(e.message));sp.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())})
 for(const [name,id,hasCard,hasNote] of [['12-studio-chip-note',m.applications.chipAndNote,true,true],['13-studio-chip-only',m.applications.chipOnly,true,false],['14-studio-note-only',m.applications.noteOnly,true,true],['15-studio-unsubmitted',m.applications.levelTestUnsubmitted,false,false]]){
  const r=await sp.goto(`${base}/studio/applications/${id}`);assert.equal(r.status(),200);await sp.waitForLoadState('networkidle')
  const card=sp.getByRole('region',{name:'학부모 체험 피드백',exact:true});assert.equal(await card.count(),hasCard?1:0)
  if(hasCard){assert.equal(await card.getByText('비공개 의견',{exact:true}).count(),hasNote?1:0);assert.equal(await card.locator('button,input,textarea').count(),0)}
  await shot(name,sp)
 }
 pass('Studio actual detail: chip+note/chip-only/note-only/missing; read-only')
 for(const path of ['/studio','/studio/cases','/studio/schedule']){const r=await sp.goto(base+path);assert.equal(r.status(),200);await sp.waitForLoadState('networkidle');assert(!(await sp.innerText('body')).includes('Application error'));pass(`smoke ${path}`)}
 for(const path of ['/','/classes','/record',`/record/${m.applications.chipAndNote}/report`]){const r=await page.goto(base+path);assert(r.status()<400);await page.waitForLoadState('networkidle');pass(`smoke ${path.replace(m.applications.chipAndNote,':id')}`)}
 for(const width of [390,768,1440]){await pub.setViewportSize({width,height:900});await pub.goto(`${base}/classes/${m.classes['체험수업']}`);await shot(`public-width-${width}`,pub)}
 assert.deepEqual(errors,[]);pass('no page errors; 390/768/1440 no overflow')
 await browser.close()
 fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify({results,errors,passed:results.length},null,2))
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1})
