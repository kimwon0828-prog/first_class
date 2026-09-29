// Actual localhost Record route; only local TEST fixtures and JWTs.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright'),{createClient}=require('@supabase/supabase-js')
const {publishFixtureReport}=require('./fixtures/parent-report.cjs')
const out='/tmp/parent-feedback-final',m=JSON.parse(fs.readFileSync(`${out}/fixtures.json`))
const env=Object.fromEntries(cp.execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\n').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^"|"$/g,'')]}))
assert(['localhost','127.0.0.1'].includes(new URL(env.API_URL).hostname))
const client=key=>createClient(env.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),db=client(env.SERVICE_ROLE_KEY)
const sql=s=>cp.execFileSync('docker',['exec','-i','supabase_db_first-class-mvp','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,stdio:['pipe','pipe','pipe']})
const results=[],errors=[],base='http://localhost:3000';let browser
const pass=s=>{results.push(s);console.log('PASS '+s)}
const rows=async(table,id)=>{const r=await db.from(table).select('*').eq('application_id',id);assert(!r.error);return r.data}
async function state(label){const a=m.accounts.find(a=>a.label===label),c=client(env.ANON_KEY);const r=await c.auth.signInWithPassword({email:a.email,password:m.password});assert(!r.error);return{client:c,cookies:[{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(r.data.session)).toString('base64url'),domain:'localhost',path:'/',sameSite:'Lax'}]}}
async function fault(revoke,grant,fn){try{sql(revoke);await fn()}finally{sql(grant)}}
;(async()=>{
 // New mutable UI fixtures on each run; never erase a reviewer's existing response.
 for(const label of ['browser','browserFailure','browserDuplicate','browserDecisionOnly','browserFeedbackOnly']){
  const id=require('node:crypto').randomUUID();m.applications[label]=id
  const created=await db.from('trial_applications').insert({id,parent_id:m.accounts[0].id,class_id:m.classes.trial,child_name:'TEST 최종 제출 브라우저',child_grade:'초3',requested_slot_at:new Date().toISOString(),status:'completed',completed_at:new Date().toISOString()});assert(!created.error,created.error?.message)
  await publishFixtureReport(db,id)
  if(label==='browserDecisionOnly'){const r=await db.from('parent_decisions').insert({application_id:id,parent_id:m.accounts[0].id,decision:'considering'});assert(!r.error,r.error?.message)}
  if(label==='browserFeedbackOnly'){const r=await db.from('experience_feedback').insert({application_id:id,parent_id:m.accounts[0].id,class_id:m.classes.trial,organization_id:m.organizationId,program_type:'trial_class',selected_chip_ids:['child_enjoyed'],private_note:'FINAL_LEGACY_PRIVATE_CANARY'});assert(!r.error,r.error?.message)}
 }
 browser=await chromium.launch({channel:'chrome',headless:true});const auth=await state('parent1'),context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies(auth.cookies)
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 const card=page.locator('#experience-feedback'),feedback=card.locator('[data-parent-feedback]'),decision=card.locator('#decision-title')
 const send=card.getByRole('button',{name:'피드백 보내기',exact:true}),note=feedback.getByRole('textbox')
 const chip=feedback.getByRole('button',{name:'아이가 즐거워했어요',exact:true}),decline=decision.getByRole('button',{name:'이번에는 등록하지 않을게요',exact:true})
 const planned=decision.getByRole('button',{name:'등록할 생각이에요',exact:true})
 const go=async id=>{await page.goto(`${base}/record/${id}/report`);await card.getByRole('heading',{name:'체험은 어떠셨나요?',exact:true}).waitFor();await page.waitForLoadState('networkidle')}
 const shot=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert.equal(await card.locator('section,details,form form').count(),0);await page.screenshot({path:`${out}/${name}.png`,fullPage:true})}
 const readonly=async()=>{await card.getByText('피드백을 보냈어요. 제출한 내용은 수정할 수 없어요.',{exact:true}).waitFor();assert.equal(await card.locator('input,textarea,select,button').count(),0);for(const t of ['수정하기','수정한 피드백 보내기','생각 변경하기'])assert.equal(await card.getByText(t,{exact:true}).count(),0)}
 let posts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/record/'))posts++})
 await go(m.applications.browser)
 posts=0 // Ignore the separate first-view POST, which completed before input.
 assert.equal(await feedback.locator('button[aria-pressed]').count(),18);assert(await send.isDisabled())
 assert.equal(await card.locator('button[type="submit"]').count(),1)
 assert(await send.evaluate(e=>Array.from(e.form.querySelectorAll('input,textarea,select,#decision-title')).every(n=>Boolean(n.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING))))
 await shot('01-final-empty');pass('one final CTA after every input; empty submission disabled')
 await chip.focus();await page.keyboard.press('Space');assert.equal(await chip.getAttribute('aria-pressed'),'true');assert.equal(await chip.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');assert(await send.isDisabled())
 await decline.click();assert(await send.isDisabled());await decision.getByLabel('시간대가 맞지 않아요',{exact:true}).check();assert(await send.isDisabled())
 const day=decision.getByRole('checkbox',{name:'화요일',exact:true}),start=decision.locator('[name="preferredStartTime"]'),end=decision.locator('[name="preferredEndTime"]')
 await day.focus();await page.keyboard.press('Space');assert.equal(await day.evaluate(e=>getComputedStyle(e.parentElement).outlineStyle),'solid');await start.fill('16:00');await decision.getByLabel('이 사이라면 괜찮아요',{exact:true}).check();await end.fill('15:00');assert(await send.isDisabled());await end.fill('18:00');assert(await send.isEnabled())
 await note.fill('BROWSER_FINAL_PRIVATE_CANARY 의견');assert.equal(posts,0);assert.equal((await rows('experience_feedback',m.applications.browser)).length,0);assert.equal((await rows('parent_decisions',m.applications.browser)).length,0)
 await shot('02-final-draft');pass('all eligibility conditions, schedule validation, keyboard focus; selecting sends zero POSTs')
 await fault('revoke execute on function public.submit_parent_experience(uuid,text[],text,text,text,text[],time,time,text) from authenticated;','grant execute on function public.submit_parent_experience(uuid,text[],text,text,text,text[],time,time,text) to authenticated;',async()=>{
  await send.click();await card.getByRole('alert').waitFor();assert.equal(await chip.getAttribute('aria-pressed'),'true');assert.equal(await note.inputValue(),'BROWSER_FINAL_PRIVATE_CANARY 의견');assert.equal(await decline.getAttribute('aria-pressed'),'true');assert(await decision.getByLabel('시간대가 맞지 않아요',{exact:true}).isChecked());assert(await day.isChecked());assert(await decision.getByLabel('이 사이라면 괜찮아요',{exact:true}).isChecked());assert.equal(await start.inputValue(),'16:00');assert.equal(await end.inputValue(),'18:00');await shot('03-final-save-error')
 })
 pass('failed final action retains chips/note/decision/reason/day/start/end/mode')
 const before=posts
 await page.route('**/record/**',async r=>{if(r.request().method()==='POST')await new Promise(done=>setTimeout(done,350));await r.continue()})
 await send.evaluate(e=>{e.click();e.click()});await card.locator('form[aria-busy="true"]').waitFor();assert(await card.getByRole('button',{name:'보내는 중…',exact:true}).isDisabled());await readonly();await page.unroute('**/record/**');assert.equal(posts-before,1)
 assert.equal((await rows('experience_feedback',m.applications.browser)).length,1);assert.equal((await rows('parent_decisions',m.applications.browser)).length,1);await shot('04-final-submitted');await page.reload();await readonly();pass('one POST, double-click prevention, real atomic save, reload remains read-only')
 await go(m.applications.browserDecisionOnly);assert.equal(await decision.locator('button[aria-pressed]').count(),0);assert((await decision.innerText()).includes('조금 더 고민 중이에요'));await note.fill('LEGACY_BROWSER_PRIVATE_CANARY');assert(await send.isEnabled());await shot('05-legacy-decision-only');await send.click();await readonly();pass('legacy Decision readonly + one-time Feedback-only completion')
 await go(m.applications.browserFeedbackOnly);assert.equal(await feedback.locator('textarea,button').count(),0);await planned.click();assert(await send.isEnabled());await shot('06-legacy-feedback-only');await send.click();await readonly();pass('Feedback-only readonly + one-time Decision completion')
 await go(m.applications.browserDuplicate);await note.fill('DUPLICATE_DRAFT');await planned.click()
 const external=await auth.client.rpc('submit_parent_experience',{p_application_id:m.applications.browserDuplicate,p_selected_chip_ids:['kind_teacher'],p_decision:'considering'});assert(!external.error)
 await send.click();await card.getByRole('alert').waitFor();assert.equal(await card.getByRole('alert').innerText(),'이미 피드백을 보냈어요.');assert.equal(await note.inputValue(),'DUPLICATE_DRAFT');await shot('07-final-duplicate');await card.getByRole('button',{name:'보낸 내용 확인하기'}).click();await readonly();pass('stale-tab duplicate has specific message; no overwritten response')
 await fault('revoke execute on function public.get_parent_experience_feedback_context(uuid) from authenticated;','grant execute on function public.get_parent_experience_feedback_context(uuid) to authenticated;',async()=>{
  await go(m.applications.browserFailure);await feedback.getByText('피드백을 불러오지 못했어요. 다시 확인해 주세요.').waitFor();assert.equal(await decision.locator('button[aria-pressed]').count(),3);assert(await send.isDisabled());await shot('08-feedback-read-error')
 })
 await fault('revoke select on public.parent_decisions from authenticated;','grant select on public.parent_decisions to authenticated;',async()=>{
  await go(m.applications.browserFailure);await decision.getByText('선택 정보를 불러오지 못했어요. 다시 확인해 주세요.').waitFor();assert.equal(await feedback.locator('button[aria-pressed]').count(),18);await note.fill('READ_ERROR_DRAFT');assert(await send.isDisabled());await shot('09-decision-read-error')
 })
 pass('independent read errors remain visible; final CTA fails closed')
 await go(m.applications.level);assert.equal(await feedback.locator('button[aria-pressed]').count(),14);await shot('10-level-test')
 await go(m.applications.legacyCompleted);await readonly();assert((await decision.innerText()).includes('10월 3일'));await shot('11-legacy-date');pass('level taxonomy and legacy date readonly preserved')
 const guest=await browser.newContext({viewport:{width:390,height:844}}),pub=await guest.newPage()
 for(const path of [`/classes/${m.classes.trial}`,`/academy/${m.organizationId}`]){
  const r=await pub.goto(base+path);assert.equal(r.status(),200);const text=await r.text();for(const canary of ['FINAL_PRIVATE_CANARY','BROWSER_FINAL_PRIVATE_CANARY','FINAL_LEGACY_PRIVATE_CANARY',...Object.values(m.applications)])assert(!text.includes(canary),`public payload ${path} contains TEST marker ${canary}: ${text.slice(Math.max(0,text.indexOf(canary)-180),text.indexOf(canary)+220)}`)
  const rsc=await guest.request.get(base+path,{headers:{RSC:'1'}});assert.equal(rsc.status(),200);assert(!(await rsc.text()).includes('PRIVATE_CANARY'))
 }
 assert(await pub.locator('[data-feedback-public="ACADEMY"]').count());await pub.screenshot({path:`${out}/12-public-academy.png`,fullPage:true});pass('Class/Academy HTML + RSC aggregates show no private note/application identifiers')
 const sa=await state('studio'),sc=await browser.newContext({viewport:{width:1440,height:1000}});await sc.addCookies(sa.cookies);const sp=await sc.newPage();await sp.goto(`${base}/studio/applications/${m.applications.browser}`)
 const sf=sp.getByRole('region',{name:'학부모 체험 피드백',exact:true});await sf.waitFor();assert((await sf.innerText()).includes('BROWSER_FINAL_PRIVATE_CANARY'));assert.equal(await sf.locator('button,input,textarea').count(),0);await sp.screenshot({path:`${out}/13-studio-readonly.png`,fullPage:true});pass('Studio Feedback remains same read-only private view')
 await go(m.applications.review);for(const width of [390,768]){await page.setViewportSize({width,height:844});await shot(`14-review-${width}`)}
 assert.deepEqual(errors,[]);pass('390/768 no overflow, no nested card or runtime errors')
 fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify({passed:results.length,results,errors},null,2))
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close()})
