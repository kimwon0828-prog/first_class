// Actual route/components/CSS; queries and actions replaced at bundle boundaries.
// No Supabase connection or web server. Browser network is blocked entirely.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const esbuild = require(process.env.ESBUILD_MODULE_PATH || 'esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = process.cwd(), out = process.env.UX_V2_OUTPUT || fs.mkdtempSync('/tmp/application-detail-ux-v2-')
fs.mkdirSync(out, { recursive: true })
const stubs = {
  'next/navigation': `const router={refresh:()=>{window.refreshes++}};export const useRouter=()=>router;export const usePathname=()=>'/studio/applications/workflow-test';export const useSearchParams=()=>new URLSearchParams();export const notFound=()=>{throw Error('not found')};`,
  'next/link': `import React from 'react';export const useLinkStatus=()=>({pending:false});export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>}`,
  'next/image': `import React from 'react';export default function Image({fill,priority,...props}){return <img {...props}/>}`,
  '@/shared/lib/db': `export const dataAdapter={listExperienceReportVersions:async()=>window.fixture.sent?[{}]:[],getStudioAcademyMemo:async()=>{if(window.fixture.memoError)throw Error('TEST memo load');return window.memoStore??{note:window.fixture.application.trialResult?.note??null,revision:'legacy:test'}}}`,
  '@/shared/lib/request-host': `export const getRequestHostname=async()=> 'localhost'`,
  '@/shared/lib/studio-navigation-server': `export const getStudioNavigationPathResolver=async()=>p=>p`,
  '@/features/studio/ui/studio-navigation-provider': `export const useStudioNavigationPathFactory=()=>p=>p;export const useStudioNavigationPath=p=>p;export const useStudioInternalPathname=()=>'/studio/applications/workflow-test'`,
  '@/features/studio/lib/require-teacher-studio-access': `export const requireTeacherStudioAccess=async()=>({id:'test-teacher',organizationId:'test-org'})`,
  '@/features/studio/queries/get-studio-application-detail': `export const getStudioApplicationDetail=async()=>({data:window.fixture.application,error:null})`,
  '@/features/studio/queries/get-studio-application-assignee-options': `export const getStudioApplicationAssigneeOptions=async()=>({data:[{teacherId:'test-teacher',teacherName:'테스트 선생님'},{teacherId:'second-teacher',teacherName:'두번째 선생님'}],error:window.fixture.assigneeError||null})`,
  '@/features/billing/queries/get-organization-entitlements': `export const getStudioEntitlementsForDisplay=async()=>({entitlements:{canWriteTrialResults:true,canWriteConsultations:true,canReopenConsultation:true,canPublishParentReport:!window.fixture.free}})`,
  '@/features/feedback/queries/get-experience-feedback': `export const getStudioExperienceFeedback=async()=>({feedback:null,error:false});export const getParentExperienceFeedback=async()=>({feedback:null,error:false})`,
  '@/features/studio/actions/save-academy-memo': `export async function saveAcademyMemoAction(id,previous,form){const values=Object.fromEntries(form);window.submissions.push({name:'saveAcademyMemoAction',values});await new Promise(r=>setTimeout(r,200));if(window.memoOutcome==='throw')throw Error('network failed');if(window.memoOutcome!=='success')return {status:'error',message:'TEST 메모 저장 실패 · 입력 유지'};window.memoStore={note:values.note.trim()||null,revision:'memo:'+crypto.randomUUID()};return {status:'success',message:'메모를 저장했어요.',saved:window.memoStore}}`,
  'next/cache': `export const unstable_noStore=()=>{}`,
  '@/features/my/lib/require-parent-access': `export const requireParentAccess=async()=>({id:'test-parent'})`,
  '@/features/record/queries/get-my-experience-report': `export const getMyExperienceReport=async()=>window.reportFixture`,
  '@/features/record/queries/get-record-child-context': `export const getRecordChildContext=async()=>null`,
  '@/features/decisions/queries/get-my-current-parent-decision': `export const getMyCurrentParentDecision=async()=>({data:null,error:null})`,
  // This regression renders the actual Parent report body, but never records a view or submits feedback.
  '@/features/reports/ui/report-view-tracker': `export const ReportViewTracker=()=>null`,
  '@/features/feedback/ui/parent-feedback-form': `export const ParentFeedbackForm=()=>null`,
  '@/features/reports/queries/get-published-experience-report': `export const getPublishedExperienceReport=async()=>({data:window.fixture.report,error:window.fixture.reportError||null})`,
  '@/features/decisions/queries/get-studio-parent-decision': `export const getStudioParentDecision=async()=>({data:null,error:null})`,
  '@/features/registration/queries/get-studio-registration-result': `export const getStudioRegistrationResult=async()=>({data:null,error:null})`,
  '@/integrations/supabase/client': `export const getSupabaseBrowserClient=()=>null`
}
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import Page from ${JSON.stringify(root + '/app/studio/(dashboard)/applications/[id]/page.tsx')};
import ParentReportPage from ${JSON.stringify(root + '/app/record/[experienceId]/report/page.tsx')};
import {StudioShell} from '@/features/studio/ui/studio-shell';
import {createWorkflowApplication,createWorkflowRecord} from ${JSON.stringify(root + '/scripts/fixtures/application-detail-workflow.ts')};
import {buildExperienceReportSnapshotV2,buildExperienceReportSnapshotV3} from '@/features/reports/lib/experience-report-snapshot';
window.buildMathSnapshot=buildExperienceReportSnapshotV3;
const appRoot=createRoot(document.getElementById('app'));let renderCount=0;window.submissions=[];window.refreshes=0;
window.renderFixture=async(name)=>{const a=createWorkflowApplication({interestSubjects:'수학, 음악',childNotes:'차분히 설명해 주세요.',memo:'긴 학부모 요청도 줄바꿈되어 표시됩니다.'});
const f={application:a,sent:false,report:null};
if(!['unwritten','unlinked','record-error','new','canceled'].includes(name))a.trialResult=createWorkflowRecord({observations:['sustained_engagement']});
if(name==='memo-only'){a.trialResult.observations=[];a.trialResult.publicSummary=null;a.trialResult.recommendedCourse=null;a.trialResult.recommendedLevel=null;a.trialResult.recommendedSchedule=null;}
if(name==='pending'){a.registrationStatus='pending';a.registrationReasonIds=['price_consideration'];a.registrationNote='저장된 추가 메모'}
if(name==='not-enrolled'){a.registrationStatus='not_enrolled';a.registrationReasonIds=['price_burden','schedule_mismatch'];a.registrationNote='저장된 미등록 메모'}
if(name==='enrolled')a.registrationStatus='enrolled';
if(name==='new'){a.status='new';a.completedAt=null;a.confirmedSlotAt=null}
if(name==='canceled'){a.status='canceled';a.noShowAt=a.updatedAt;a.completedAt=null}
if(['future','in-trial','elapsed','unknown-time'].includes(name)){a.status='confirmed';a.completedAt=null;a.trialResult=null;const start=Date.now()+(name==='future'?3600000:name==='in-trial'?-1800000:-7200000);a.confirmedBlockStartAt=name==='unknown-time'?null:new Date(start).toISOString();a.confirmedBlockEndAt=name==='unknown-time'?null:new Date(start+3600000).toISOString();a.confirmedSlotAt=a.confirmedBlockStartAt;a.scheduleStartTime=null;a.scheduleEndTime=null;}
if(name==='record-error')a.trialResultLoadError='TEST 조회 오류';
if(name==='assignee-error')f.assigneeError='TEST 선생님 조회 실패';
if(name==='assignee-unassigned'){a.assignedTeacherId=null;a.assignedTeacherName=null}
if(name==='memo-error')f.memoError=true;
if(name==='report-error')f.reportError='TEST 리포트 조회 오류';
if(name==='free')f.free=true;if(name==='unlinked')a.parentId=null;
if(name==='withdrawn')f.sent=true;
if(name==='sent'||name==='sent-v1'){f.sent=true;const built=buildExperienceReportSnapshotV2({programType:a.classProgramType,confirmedSlotAt:a.confirmedSlotAt,completedAt:a.completedAt,childName:a.childName,childGrade:a.childGrade,academyName:a.academyName,classTitle:a.classTitle,...a.trialResult});f.report={version:1,publishedAt:a.updatedAt,content:name==='sent-v1'?(({summary,...snapshot})=>snapshot)(built.snapshot):built.snapshot}}
if(name==='contact-structured'){a.regularSchedulePreference={version:1,state:'specified',groups:[{dayMode:'selected',days:[2],timeMode:'range',startTime:'17:00',endTime:'19:00'},{dayMode:'selected',days:[4],timeMode:'range',startTime:'18:00',endTime:'20:00'}]};a.regularSchedulePreferenceNote='목요일은 18시 이후';a.nextContactAt='2026-10-07T09:00:00Z'}
if(name==='contact-existing'){a.regularSchedulePreference={version:1,state:'specified',groups:[{dayMode:'selected',days:[2,4],timeMode:'after',startTime:'17:15',endTime:null},{dayMode:'any',days:[],timeMode:'before',startTime:null,endTime:'20:15'},{dayMode:'any',days:[],timeMode:'any',startTime:null,endTime:null}]};a.regularSchedulePreferenceNote='기존 메모'}
if(name==='contact-unreadable'){a.regularSchedulePreference={version:2,state:'specified',groups:[]};a.regularSchedulePreferenceNote='보존 메모'}
if(name==='contact-undecided')a.regularSchedulePreference={version:1,state:'undecided',groups:[]};
if(['contact','legacy'].includes(name))a.consultationLogs=[{id:'test-contact',applicationId:a.id,activityType:name==='legacy'?'LEGACY_IMPORT':'CONTACT',channel:'PHONE',sentiment:'NEUTRAL',note:'커리큘럼과 희망 요일을 안내드렸습니다.',occurredAt:a.updatedAt,createdAt:a.updatedAt,updatedAt:a.updatedAt,registrationStatusSnapshot:'undecided',nextContactAt:null,createdBy:'test-teacher'}];
if(name==='long'){a.childName='긴 이름 학생';a.classTitle='길게 표시되는 실제 수업명을 가정한 수업명 '.repeat(5);a.trialResult.publicSummary='긴 총평을 줄바꿈해 읽을 수 있어요. '.repeat(70);a.trialResult.note='메모에서도 긴 상담 내용을 확인해요. '.repeat(100)}
window.fixture=f;window.fixtureKey=name+(++renderCount);const content=await Page({params:Promise.resolve({id:a.id})});flushSync(()=>appRoot.render(<StudioShell key={window.fixtureKey} organizationName="첫수업 테스트 학원">{content}</StudioShell>))};
window.refreshCurrent=async()=>{const content=await Page({params:Promise.resolve({id:window.fixture.application.id})});flushSync(()=>appRoot.render(<StudioShell key={window.fixtureKey} organizationName='첫수업 테스트 학원'>{content}</StudioShell>))};
window.renderParentSchedule=async(schedule)=>{const a=createWorkflowApplication();const built=buildExperienceReportSnapshotV2({programType:a.classProgramType,confirmedSlotAt:a.confirmedSlotAt,completedAt:a.completedAt,childName:a.childName,childGrade:a.childGrade,academyName:a.academyName,classTitle:a.classTitle,...createWorkflowRecord({recommendedSchedule:schedule,note:'PRIVATE_REPORT_CANARY'})});window.reportFixture={status:'ok',experience:{status:'completed',canCollectParentDecision:false},report:{id:'test-report',version:2,publishedAt:a.updatedAt,content:name==='sent-v1'?(({summary,...snapshot})=>snapshot)(built.snapshot):built.snapshot}};appRoot.render(await ParentReportPage({params:Promise.resolve({experienceId:a.id})}))};
window.renderMathParent=async(snapshot)=>{window.reportFixture={status:'ok',experience:{status:'completed',canCollectParentDecision:false},report:{id:'math-report',version:1,publishedAt:'2026-10-11T01:00:00Z',content:snapshot}};flushSync(()=>appRoot.render(null));appRoot.render(await ParentReportPage({params:Promise.resolve({experienceId:'math-fixture'})}))};
window.renderFixture('unwritten');`

;(async () => {
  await esbuild.build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root }, outfile: path.join(out, 'bundle.js'), bundle: true, platform: 'browser', jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), loader: { '.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'isolated-boundaries', setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      if (stubs[args.path]) return { path: args.path, namespace: 'stub' }
      if (args.path.includes('/actions/')) {
        const file = args.path.startsWith('@/') ? path.join(root, 'src', args.path.slice(2)) : path.resolve(args.resolveDir, args.path)
        return { path: file.endsWith('.ts') ? file : file + '.ts', namespace: 'action-stub' }
      }
      if (/supabase|server-only|node:/.test(args.path)) throw Error('Unexpected server/network dependency: ' + args.path)
    })
    build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: root }))
    build.onLoad({ filter: /.*/, namespace: 'action-stub' }, args => {
      const names = [...fs.readFileSync(args.path, 'utf8').matchAll(/export\s+(?:async\s+function|const)\s+(\w+)/g)].map(m => m[1])
      return { contents: names.map(name => `export async function ${name}(...args){window.submissions.push({name:${JSON.stringify(name)},values:Object.fromEntries(args.at(-1)),observations:args.at(-1).getAll('observations')});await new Promise(r=>setTimeout(r,200));return {status:${name === 'updateApplicationAssigneeAction' ? "window.assigneeOutcome||'error'" : name === 'createConsultationLogAction' ? "window.contactOutcome||'error'" : name === 'upsertTrialResultAction' ? "window.recordOutcome||'error'" : name === 'saveStudioRegistrationResultAction' ? "window.registrationOutcome||'error'" : "'error'"},message:'TEST 저장 실패 · 입력 유지',successToken:'mock-result',token:crypto.randomUUID()}}`).join('\n'), loader: 'js' }
    })
  } }] })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = []
    page.on('pageerror', e => {errors.push(e.message);console.error('PAGEERROR '+e.message)});await page.route('**/*', route => route.abort())
    await page.evaluate(()=>{if(!crypto.randomUUID)crypto.randomUUID=()=> 'test-'+crypto.getRandomValues(new Uint32Array(4)).join('-')});
    await page.setContent('<html lang="ko"><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>')
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8') + '\n' + fs.readFileSync(path.join(out, 'bundle.css'), 'utf8') })
    await page.addScriptTag({ content: fs.readFileSync(path.join(out, 'bundle.js'), 'utf8') })
    const render = async name => { await page.evaluate(name => window.renderFixture(name), name);await page.locator('#record-report-title').waitFor() }
    const reg = () => page.getByRole('region', { name: '등록 결과', exact: true })
    const save = () => reg().getByRole('button', { name: '등록 결과 저장', exact:true });
    const openReg = async () => reg().getByRole('button',{name:/등록 결과 (입력|변경)/}).click();
    const openMemo = async () => page.locator('#academy-memo').getByRole('button',{name:/^(수정|메모 추가)$/}).click();
    const openHistory = async () => {const d=page.locator('[class*=historyDisclosure]');if(await d.count()&&!await d.evaluate(e=>e.open))await d.locator(':scope > summary').click()}
    const results = [], pass = message => { results.push(message);console.log('PASS ' + message) }
    if (process.env.REPORT_PHOTOS_ONLY) {
      await require('./verify-report-photos-browser.cjs')({page,render,out,root,assert,fs,pass});
      assert.deepEqual(errors,[]);return;
    }
    if (!process.env.REPORT_OBSERVATIONS_ONLY) {
    for (const name of ['unwritten','finalized','sent','pending','not-enrolled','enrolled','contact','legacy','record-error','report-error','free','unlinked','new','canceled','future','in-trial','elapsed','unknown-time']) {
      await render(name)
      assert.equal(await page.getByRole('list', { name: '신청 진행 단계', includeHidden: true }).count(), 0)
      assert.equal(await save().count(),0)
      for (const width of [1440,1024]) {
        await page.setViewportSize({ width, height: 1100 });assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), name + ' overflow at ' + width)
        await openHistory();const history=page.locator('details[aria-label="처리 이력"]');if(!await history.getAttribute('open').then(v=>v!==null))await history.locator('summary').click();
        assert(await history.locator('[class*=activitySystemTitle]').evaluateAll(nodes=>nodes.every(e=>e.getBoundingClientRect().width>150)),name+' history text column');
        assert(await page.locator('[class*=activityContent]').evaluateAll(nodes=>nodes.every(e=>e.getBoundingClientRect().width>150)),name+' activity text column');
        await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true })
      }
    }
    pass('18 isolated actual route states × 1440/1024: compact header, no overflow, saved registration view first')
    await render('unwritten');assert.equal(await reg().locator('textarea').count(),0);assert(await page.getByRole('button',{name:'미리보기',exact:true}).isDisabled());assert.equal(await page.getByRole('button',{name:'리포트 보내기',exact:true}).count(),0)
    pass('unwritten record and separate unsent report row; no always-visible registration textarea')
    await render('sent');assert.equal(await page.getByRole('button',{name:'리포트 보내기',exact:true}).count(),0);assert(await page.getByRole('region',{name:'학부모 리포트',exact:true}).getByText('즐겁게 수업에 참여했어요.',{exact:true}).isVisible());assert.equal(await page.getByRole('button',{name:'기록 작성',exact:true}).count(),0)
    pass('sent report/record read-only; published snapshot opens; no editing or republish')
    for(const name of ['sent-v1','withdrawn']){await render(name);assert.equal(await page.getByRole('button',{name:'기록 수정',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'리포트 보내기',exact:true}).count(),0);assert(await page.getByText(/리포트 보냄/).first().isVisible());assert.equal(await page.getByRole('button',{name:'상담 기록 추가',exact:true}).count(),0);await openMemo();assert.equal(await page.getByLabel('등록 상담 메모 (선택)').getAttribute('readonly'),null);}
    await render('finalized');await page.getByRole('button',{name:'내용 수정',exact:true}).click();const edit=page.getByRole('dialog',{name:'리포트 내용 수정',exact:true});assert(await edit.getByRole('button',{name:'기록 저장',exact:true}).isDisabled());const summary=edit.getByLabel('학부모에게 전달할 총평',{exact:true});const savedSummary=await summary.inputValue();await summary.fill(savedSummary+' 수정');assert(await edit.getByRole('button',{name:'기록 저장',exact:true}).isEnabled());await summary.fill(savedSummary);assert(await edit.getByRole('button',{name:'기록 저장',exact:true}).isDisabled());await edit.getByRole('button',{name:'취소',exact:true}).click();
    pass('V1/V2 snapshots and withdrawn history stay locked; academy memo independent; pre-send editing detects change and reversion');

    await render('unwritten');await openReg();await reg().getByRole('button',{name:'고민중',exact:true}).focus();await page.keyboard.press('Space');assert.equal(await reg().locator('fieldset button').count(),8);assert.notEqual(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');assert(await save().isEnabled())
    await reg().getByRole('button',{name:'비용 고민',exact:true}).click();await reg().getByLabel('추가 메모 (선택)').fill('실패 후에도 보존할 메모');assert.equal(await page.evaluate(()=>window.submissions.length),0);await save().click();await reg().getByRole('alert').waitFor();assert.equal(await reg().getByLabel('추가 메모 (선택)').inputValue(),'실패 후에도 보존할 메모');assert.equal(await reg().getByRole('button',{name:'비용 고민',exact:true}).getAttribute('aria-pressed'),'true')
    await reg().getByRole('button',{name:'등록 완료',exact:true}).click();assert.equal(await reg().locator('textarea,fieldset').count(),0);assert.equal(await reg().locator('[name=registrationNote]').inputValue(),'실패 후에도 보존할 메모');await reg().getByRole('button',{name:'등록하지 않음',exact:true}).click();assert.equal(await reg().locator('fieldset button').count(),9)
    pass('keyboard/focus, 8/9 reason chips, state-only selection, failed-save drafts, hidden note preservation')
    await render('pending');await openReg();await reg().getByRole('button',{name:'비용 고민',exact:true}).click();assert(await save().isEnabled());await reg().getByRole('button',{name:'비용 고민',exact:true}).click();assert(await save().isDisabled());pass('reverting draft to saved values disables duplicate save')
    const record=page.getByRole('dialog',{name:'기록 작성',exact:true});
    const openRecord=async()=>{await render('unwritten');await page.getByRole('button',{name:'기록 작성',exact:true}).click();await record.waitFor()};
    for(const width of [1440,1024]) {
      await page.setViewportSize({width,height:900});await openRecord();assert.equal((await record.boundingBox()).width,820);assert.equal(await record.getByRole('group',{name:'관찰한 모습',exact:true}).getByRole('button').count(),7);assert.equal(await record.locator('input[name=recommendedSchedule][type=hidden]').count(),1);assert.equal(await record.locator('input[name=recommendedSchedule]:not([type=hidden])').count(),0);
      assert(await record.getByText('저장만으로 학부모에게 보내지지 않아요.',{exact:true}).isVisible());assert(!await record.evaluate(e=>e.scrollWidth>e.clientWidth));await page.screenshot({path:path.join(out,`record-modal-${width}.png`)});await record.getByRole('button',{name:'취소',exact:true}).click()
    }
    pass('approved 820px record modal, 7 existing observations, 1440/1024 no overflow; no free-text schedule');
    await openRecord();await record.locator('details > summary').click();const schedule=record.getByRole('region',{name:'추천 일정',exact:true});await schedule.getByRole('button',{name:'화',exact:true}).focus();await page.keyboard.press('Space');assert.notEqual(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');assert.equal(await record.locator('[name=recommendedSchedule]').inputValue(),'화');await page.screenshot({path:path.join(out,'record-schedule-single-day.png')});await schedule.getByRole('button',{name:'목',exact:true}).click();assert.equal(await record.locator('[name=recommendedSchedule]').inputValue(),'화·목');await page.screenshot({path:path.join(out,'record-schedule-multiple-days.png')});
    for(const [label,filename] of [['오전','morning'],['오후','afternoon'],['저녁','evening'],['시간 무관','any']]) {
      await schedule.getByRole('button',{name:label,exact:true}).click();assert.equal(await record.getByRole('group',{name:'추천 시간대',exact:true}).locator('[aria-pressed=true]').count(),1);assert.equal(await record.locator('[name=recommendedSchedule]').inputValue(),'화·목 / '+label);await page.screenshot({path:path.join(out,`record-schedule-${filename}.png`)})
    }
    await schedule.getByRole('button',{name:'시간 무관',exact:true}).click();assert.equal(await record.locator('[name=recommendedSchedule]').inputValue(),'화·목');await schedule.getByRole('button',{name:'저녁',exact:true}).click();
    await record.getByRole('group',{name:'관찰한 모습',exact:true}).getByRole('button').nth(0).click();await record.getByRole('group',{name:'관찰한 모습',exact:true}).getByRole('button').nth(1).click();await record.getByLabel('추천 과정',{exact:true}).fill('기초 과정');await record.getByLabel('추천 레벨',{exact:true}).fill('입문');await record.getByLabel('학부모에게 전달할 총평',{exact:true}).fill('학부모에게 전달할 총평');assert.equal(await record.locator('[name=note]').count(),0);assert.equal(await record.getByText(/등록 상담 메모/).count(),0);assert.equal(await record.getByLabel('학부모에게 전달할 총평',{exact:true}).getAttribute('maxlength'),'1000');
    const recordCalls=()=>page.evaluate(()=>window.submissions.filter(x=>x.name==='upsertTrialResultAction'));assert.equal((await recordCalls()).length,0);await record.getByRole('button',{name:'기록 저장',exact:true}).click();await record.getByRole('button',{name:'저장 중...',exact:true}).waitFor();assert(await record.getByRole('button',{name:'취소',exact:true}).isDisabled());await page.keyboard.press('Escape');assert(await record.isVisible());await record.getByRole('alert').waitFor();assert.equal(await record.getByLabel('추천 과정',{exact:true}).inputValue(),'기초 과정');assert.equal(await record.getByLabel('추천 레벨',{exact:true}).inputValue(),'입문');assert.equal(await record.getByLabel('학부모에게 전달할 총평',{exact:true}).inputValue(),'학부모에게 전달할 총평');assert.equal(await record.locator('[name=recommendedSchedule]').inputValue(),'화·목 / 저녁');assert.equal(await record.getByRole('group',{name:'관찰한 모습',exact:true}).locator('[aria-pressed=true]').count(),2);
    let recordPayload=(await recordCalls()).at(-1);assert.equal(recordPayload.values.recommendedSchedule,'화·목 / 저녁');assert.deepEqual(recordPayload.observations,['sustained_engagement','active_participation']);assert.equal(recordPayload.values.publicSummary,'학부모에게 전달할 총평');assert.equal(recordPayload.values.note,undefined);await page.screenshot({path:path.join(out,'record-failed-draft.png')});
    pass('single/multiple weekdays and all four periods rendered; keyboard selection; unchanged form fields; failure retains every draft; pending blocks cancel/Escape');
    await page.setViewportSize({width:1024,height:500});const recordFooter=await record.locator('footer').boundingBox();assert(recordFooter.y>=0&&recordFooter.y+recordFooter.height<=500);assert(await record.locator('[class*=body]').evaluate(e=>e.scrollHeight>e.clientHeight));await record.getByRole('button',{name:'기록 저장',exact:true}).focus();await page.keyboard.press('Tab');assert(await record.getByRole('button',{name:'닫기',exact:true}).evaluate(e=>e===document.activeElement));await page.keyboard.press('Shift+Tab');assert(await record.getByRole('button',{name:'기록 저장',exact:true}).evaluate(e=>e===document.activeElement));await page.screenshot({path:path.join(out,'record-short-viewport.png')});page.once('dialog',async d=>{assert.match(d.message(),/저장하지 않은/);await d.accept()});await page.keyboard.press('Escape');assert.equal(await record.count(),0);
    pass('record footer and finalization notice remain accessible at 500px height; focus trap and Escape close');
    await openRecord();await page.evaluate(()=>window.recordOutcome='success');const beforeRecord=(await recordCalls()).length;await record.getByRole('button',{name:'기록 저장',exact:true}).evaluate(button=>{button.click();button.click()});await record.waitFor({state:'detached'});assert.equal((await recordCalls()).length,beforeRecord+1);const success=page.getByRole('dialog',{name:'체험 기록을 저장했습니다.',exact:true});await success.waitFor();await success.getByRole('button',{name:'확인',exact:true}).click();await render('finalized');await page.getByRole('button',{name:'기록 작성',exact:true}).waitFor({state:'detached'});
    pass('record mock double submit sends once; success uses existing acknowledgement/refresh; finalized fixture exposes no write control');
    const memo=()=>page.getByRole('region',{name:'등록 상담 메모',exact:true});
    for(const name of ['finalized','sent','sent-v1','withdrawn','unwritten']) {
      await page.evaluate(()=>{window.memoStore=null;window.memoOutcome='error'});await render(name);
      assert.equal(await page.getByRole('button',{name:'상담 기록 추가',exact:true}).count(),0);
      assert.equal(await page.locator('details[aria-label="이전 상담 기록"]').count(),0);
      assert.equal(await memo().locator('textarea').count(),0);await openMemo();const field=memo().getByLabel('등록 상담 메모 (선택)'),button=memo().getByRole('button',{name:'메모 저장',exact:true});
      assert.equal(await field.inputValue(),name==='unwritten'?'':'내부 전용 테스트 메모');
      await field.fill('새 등록 상담 메모 PRIVATE_MEMO_CANARY');await button.click();await memo().getByRole('button',{name:'저장 중…',exact:true}).waitFor();assert(await field.isDisabled());await memo().getByRole('alert').waitFor();assert.equal(await field.inputValue(),'새 등록 상담 메모 PRIVATE_MEMO_CANARY');
      await page.evaluate(()=>window.memoOutcome='success');await button.click();await memo().getByText('메모를 저장했어요.',{exact:true}).waitFor();assert.equal(await button.count(),0);
      await render(name);assert(await memo().getByText('새 등록 상담 메모 PRIVATE_MEMO_CANARY',{exact:true}).isVisible());await openMemo();assert.equal(await memo().getByLabel('등록 상담 메모 (선택)').inputValue(),'새 등록 상담 메모 PRIVATE_MEMO_CANARY');
      assert.equal(await memo().locator('textarea').count(),1);assert.equal(await page.locator('textarea[name=note]').count(),1);
      for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.screenshot({path:path.join(out,`memo-${name}-${width}.png`),fullPage:true})}
    }
    await page.evaluate(()=>{window.memoStore=null;window.memoOutcome='success'});await render('sent');await openMemo();
    await memo().getByLabel('등록 상담 메모 (선택)').fill('');await memo().getByRole('button',{name:'메모 저장',exact:true}).click();await memo().getByText('메모를 저장했어요.',{exact:true}).waitFor();await render('sent');assert(await memo().getByText('아직 남긴 메모가 없어요.',{exact:true}).isVisible());await openMemo();assert.equal(await memo().getByLabel('등록 상담 메모 (선택)').inputValue(),'');
    await memo().getByLabel('등록 상담 메모 (선택)').fill('network draft');await page.evaluate(()=>window.memoOutcome='throw');await memo().getByRole('button',{name:'메모 저장',exact:true}).click();await memo().getByRole('alert').waitFor();assert.equal(await memo().getByLabel('등록 상담 메모 (선택)').inputValue(),'network draft');
    await page.evaluate(()=>window.memoOutcome='success');const memoBefore=await page.evaluate(()=>window.submissions.filter(s=>s.name==='saveAcademyMemoAction').length);await memo().getByRole('button',{name:'메모 저장',exact:true}).evaluate(b=>{b.click();b.click()});await memo().getByText('메모를 저장했어요.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.submissions.filter(s=>s.name==='saveAcademyMemoAction').length),memoBefore+1);
    pass('cleared memo stays empty on re-entry instead of resurrecting legacy note; thrown network failure retains draft; retry and double-click send once');
    await page.evaluate(()=>{window.memoStore=null;window.memoOutcome='error'});await render('memo-error');assert(await memo().getByRole('alert').isVisible());assert(await memo().getByText('내부 전용 테스트 메모',{exact:true}).isVisible());assert(await memo().getByRole('button',{name:'수정',exact:true}).isDisabled());
    for(const name of ['new','future','canceled']){await render(name);assert.equal(await memo().count(),0)}
    for(const name of ['contact','legacy']){await render(name);await openHistory();const history=page.locator('details[aria-label="이전 상담 기록"]');assert.equal(await history.getAttribute('open'),null);await history.locator('summary').click();assert(await history.getByText('커리큘럼과 희망 요일을 안내드렸습니다.',{exact:true}).isVisible());assert.equal(await history.locator('button,input,textarea').count(),0)}
    pass('one optional academy memo: draft/sent/V1/withdrawn write UI, pending/success/error, failed draft retained, saved value re-entry, missing RPC read-only legacy fallback, before-trial hidden, previous consultation read-only collapsed and empty omitted');
    await render('finalized');await page.getByRole('button',{name:'내용 수정',exact:true}).click();const recordEdit=page.getByRole('dialog',{name:'리포트 내용 수정',exact:true});
    assert.equal(await recordEdit.getByText(/등록 상담 메모/).count(),0);
    const recommendations=recordEdit.locator('details');assert.equal(await recommendations.getAttribute('open'),null);
    assert.equal(await recordEdit.locator('[name=recommendedSchedule]').inputValue(),'주 2회');
    await recommendations.locator('summary').click();assert.equal(await recordEdit.getByLabel('추천 과정',{exact:true}).inputValue(),'피아노 기초반');
    await recommendations.locator('summary').click();await recordEdit.getByLabel('학부모에게 전달할 총평',{exact:true}).fill('총평만 수정');
    await page.evaluate(()=>window.recordOutcome='error');await recordEdit.getByRole('button',{name:'기록 저장',exact:true}).click();await recordEdit.getByRole('alert').waitFor();
    const preserved=(await recordCalls()).at(-1);assert.equal(preserved.values.recommendedSchedule,'주 2회');assert.equal(preserved.values.recommendedCourse,'피아노 기초반');assert.equal(preserved.values.recommendedLevel,'기초');assert.deepEqual(preserved.observations,['sustained_engagement']);
    page.once('dialog',d=>d.accept());await recordEdit.getByRole('button',{name:'취소',exact:true}).click();
    pass('editor order and collapsed recommendations preserve stored course/level/legacy schedule/observations in submitted form; no memo UI');
    await page.evaluate(()=>{window.registrationOutcome='success';window.memoStore=null});await render('pending');
    assert(await reg().getByText('비용 고민',{exact:true}).isVisible());assert(await reg().getByText('저장된 추가 메모',{exact:true}).isVisible());
    await openReg();await reg().getByRole('button',{name:'등록 완료',exact:true}).click();await reg().getByRole('button',{name:'취소',exact:true}).click();assert(await reg().getByText('고민중',{exact:true}).isVisible());
    await openReg();await reg().getByRole('button',{name:'등록 완료',exact:true}).click();const regBefore=await page.evaluate(()=>window.submissions.filter(s=>s.name==='saveStudioRegistrationResultAction').length);await save().evaluate(b=>{b.click();b.click()});await save().waitFor({state:'detached'});assert(await reg().getByText('등록 완료',{exact:true}).isVisible());assert.equal(await page.evaluate(()=>window.submissions.filter(s=>s.name==='saveStudioRegistrationResultAction').length),regBefore+1);
    await page.evaluate(async()=>{window.fixture.application.registrationStatus='not_enrolled';window.fixture.application.registrationReasonIds=['schedule_mismatch'];await window.refreshCurrent()});assert(await reg().getByText('등록하지 않음',{exact:true}).isVisible());
    pass('registration view shows saved reasons; cancel never saves; success shows confirmed values once; server refresh replaces optimistic view');
    await page.evaluate(()=>{window.memoOutcome='success';window.memoStore=null});await render('finalized');await openMemo();await memo().getByLabel('등록 상담 메모 (선택)').fill('save one');await memo().getByRole('button',{name:'메모 저장',exact:true}).click();await memo().getByText('메모를 저장했어요.',{exact:true}).waitFor();
    await page.evaluate(async()=>{window.memoStore={note:'다른 창에서 저장한 최신 내용',revision:'memo:remote'};await window.refreshCurrent()});assert(await memo().getByText('다른 창에서 저장한 최신 내용',{exact:true}).isVisible());
    await openMemo();await memo().getByLabel('등록 상담 메모 (선택)').fill('아직 저장하지 않은 메모');await page.evaluate(async()=>{window.memoStore={note:'다시 변경된 서버 메모',revision:'memo:newer'};await window.refreshCurrent()});assert.equal(await memo().getByLabel('등록 상담 메모 (선택)').inputValue(),'아직 저장하지 않은 메모');assert.equal(await memo().locator('[name=expectedRevision]').inputValue(),'memo:remote');
    await memo().getByRole('button',{name:'취소',exact:true}).click();assert(await memo().getByText('다시 변경된 서버 메모',{exact:true}).isVisible());
    pass('memo refresh shows latest server content while edit retains draft and original CAS revision; cancel shows saved server value');
    await page.evaluate(()=>window.memoStore=null);await render('memo-only');assert(await page.getByText('아직 작성된 리포트 내용이 없어요. 체험에서 관찰한 모습과 총평을 기록해 주세요.',{exact:true}).isVisible());assert(await memo().getByText('내부 전용 테스트 메모',{exact:true}).isVisible());assert.equal(await page.locator('#trial-record').getByText('내부 전용 테스트 메모').count(),0);
    await render('long');
    for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});const reportBox=await page.locator('[class*=reportReading]').first().boundingBox(),opsBox=await page.getByRole('complementary',{name:'학원에서 관리할 내용'}).boundingBox();assert(reportBox.x+reportBox.width<=opsBox.x);assert(Math.abs(reportBox.y-opsBox.y)<2);assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert(await memo().getByText(/메모에서도 긴 상담 내용을/).isVisible());await page.screenshot({path:path.join(out,'approved-long-'+width+'.png'),fullPage:true})}
    assert.equal(await page.locator('[class*=referenceDisclosure]').getAttribute('open'),null);assert.equal(await page.locator('[class*=historyDisclosure]').getAttribute('open'),null);
    await page.evaluate(()=>{location.hash='detail-trial-schedule'});await page.locator('#detail-trial-schedule').waitFor();assert(await page.locator('[class*=referenceDisclosure]').evaluate(e=>e.open));
    assert.equal(await page.getByRole('link',{name:'신청으로 돌아가기',exact:true}).getAttribute('href'),'/studio/cases');assert(await page.getByRole('link',{name:'전화하기',exact:true}).getAttribute('href').then(v=>v.startsWith('tel:')));
    await page.getByRole('button',{name:'미리보기',exact:true}).click();const preview=page.getByRole('dialog',{name:'리포트 미리보기',exact:true});await preview.waitFor();assert(!(await preview.innerText()).includes('메모에서도'));await page.keyboard.press('Escape');await preview.waitFor({state:'detached'});assert(await page.getByRole('button',{name:'미리보기',exact:true}).evaluate(e=>e===document.activeElement));
    await page.getByRole('button',{name:'내용 수정',exact:true}).click();const orderedEdit=page.getByRole('dialog',{name:'리포트 내용 수정',exact:true});const layout=await orderedEdit.evaluate(e=>{const group=e.querySelector('fieldset'),summary=e.querySelector('[name=publicSummary]'),recs=e.querySelector('details'),buttons=[...group.querySelectorAll('button')].map(x=>x.getBoundingClientRect());return {order:group.getBoundingClientRect().top<summary.getBoundingClientRect().top&&summary.getBoundingClientRect().top<recs.getBoundingClientRect().top,twoColumns:buttons[0].x<buttons[1].x&&buttons[0].y===buttons[1].y}});assert(layout.order&&layout.twoColumns);await orderedEdit.getByRole('button',{name:'취소',exact:true}).click();
    pass('1440/1024 long content wraps in aligned report/operations columns; references default closed, anchors reveal hidden targets, contact/back links and preview Escape/focus work; ordered editor keeps 2 observation columns');
    for(const width of [390,768]) {
      await page.setViewportSize({width,height:844});await page.evaluate(()=>window.renderParentSchedule('화·목 / 저녁'));await page.getByText('화·목 / 저녁',{exact:true}).waitFor();await page.evaluate(()=>window.scrollTo(0,0));assert.equal(await page.getByRole('region',{name:'추천 정보'}).getByText('화·목 / 저녁',{exact:true}).count(),1);assert(!(await page.locator('body').innerText()).includes('PRIVATE_REPORT_CANARY'));assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.screenshot({path:path.join(out,`parent-report-recommendation-${width}.png`),fullPage:true})
    }
    await page.evaluate(()=>window.renderParentSchedule('기존 자유 입력 일정 원문'));await page.getByText('기존 자유 입력 일정 원문',{exact:true}).waitFor();
    pass('actual Parent report page/CSS renders new recommendation at 390/768 and preserves legacy text; no private note; view tracking disabled in isolated fixture');
    }
    // Math: same real route/editor and shared reader, only fixture data and action transport isolated.
    for(const width of [1440,1024]) {
      await page.setViewportSize({width,height:1000});await render('finalized');
      await page.evaluate(async()=>{window.fixture.application.reportSubjectCategory='math';window.fixture.application.classTitle='수학 체험수업';await window.refreshCurrent()});
      await page.getByRole('button',{name:'내용 수정',exact:true}).click();const mathEdit=page.getByRole('dialog',{name:'리포트 내용 수정',exact:true});
      for(const group of ['관심과 참여','오늘 내용의 이해','안내 후 반응'])assert.equal(await mathEdit.getByRole('group',{name:group,exact:true}).getByRole('button').count(),3);
      assert.equal(await mathEdit.getByRole('button',{name:'활동이 진행되는 동안 과제에 계속 참여했어요.',exact:true}).getAttribute('aria-pressed'),'true');
      await mathEdit.getByRole('button',{name:'새로운 문제에 스스로 도전했어요',exact:true}).click();
      assert.deepEqual(await mathEdit.locator('[name=observations]').evaluateAll(nodes=>nodes.map(n=>n.value)),['sustained_engagement','math_attempted_new_problem']);
      assert.equal(await mathEdit.locator('[name=publicSummary]').inputValue(),'즐겁게 수업에 참여했어요.');
      assert(!await mathEdit.evaluate(e=>e.scrollWidth>e.clientWidth),JSON.stringify(await mathEdit.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,bad:[...e.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>e.getBoundingClientRect().right).map(n=>({tag:n.tagName,cls:n.className,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right})).slice(0,15)}))));await page.screenshot({path:path.join(out,'math-editor-'+width+'.png')});
      await mathEdit.getByRole('button',{name:'기록 저장',exact:true}).click();await mathEdit.getByText('TEST 저장 실패 · 입력 유지',{exact:true}).waitFor();
      const submitted=await page.evaluate(()=>window.submissions.filter(s=>s.name==='upsertTrialResultAction').at(-1));assert.deepEqual(submitted.observations,['sustained_engagement','math_attempted_new_problem']);
      assert.equal(await mathEdit.getByRole('button',{name:'새로운 문제에 스스로 도전했어요',exact:true}).getAttribute('aria-pressed'),'true');
      // Re-entry uses a separately persisted source (actual RPC persistence is covered in the isolated DB suite).
      await render('finalized');await page.evaluate(async()=>{const a=window.fixture.application;a.reportSubjectCategory='math';a.classTitle='수학 체험수업';a.trialResult.observations=['math_applied_concept','math_solved_after_example'];await window.refreshCurrent()});
      await page.getByRole('button',{name:'내용 수정',exact:true}).click();assert.equal(await mathEdit.getByRole('button',{name:'배운 개념을 문제에 적용했어요',exact:true}).getAttribute('aria-pressed'),'true');await mathEdit.getByRole('button',{name:'취소',exact:true}).click();
      assert.equal(await page.locator('#trial-record').getByText('관심과 참여',{exact:true}).count(),0);
      await page.getByRole('button',{name:'미리보기',exact:true}).click();const mathPreview=page.getByRole('dialog',{name:'리포트 미리보기',exact:true});
      assert.equal(await mathPreview.getByText('관심과 참여',{exact:true}).count(),0);assert(await mathPreview.getByText('오늘 내용의 이해',{exact:true}).isVisible());assert(await mathPreview.getByText('안내 후 반응',{exact:true}).isVisible());
      const studioObservations=await mathPreview.locator('li').allTextContents();
      const snapshot=await page.evaluate(()=>{const a=window.fixture.application;return window.buildMathSnapshot({programType:a.classProgramType,confirmedSlotAt:a.confirmedSlotAt,completedAt:a.completedAt,childName:a.childName,childGrade:a.childGrade,academyName:a.academyName,classTitle:a.classTitle,...a.trialResult}).snapshot});
      await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await page.evaluate(s=>window.renderMathParent(s),snapshot);await page.getByRole('heading',{name:'수업에서 보인 모습',exact:true}).waitFor();
      assert.deepEqual(await page.getByRole('region',{name:'수업에서 보인 모습',exact:true}).locator('li').allTextContents(),studioObservations);assert.equal(await page.getByText('관심과 참여',{exact:true}).count(),0);
      assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert.equal(await page.getByRole('region',{name:'추천 정보',exact:true}).locator('a').count(),0);
      await page.screenshot({path:path.join(out,'math-parent-390-from-'+width+'.png'),fullPage:true});
    }
    // Music (piano demo): same real route/editor and shared reader, only fixture data and action transport isolated.
    for(const width of [1440,1024]) {
      await page.setViewportSize({width,height:1000});await render('finalized');
      await page.evaluate(async()=>{window.fixture.application.reportSubjectCategory='music';window.fixture.application.classTitle='피아노 체험수업';await window.refreshCurrent()});
      await page.getByRole('button',{name:'내용 수정',exact:true}).click();const pianoEdit=page.getByRole('dialog',{name:'리포트 내용 수정',exact:true});
      for(const group of ['관심과 참여','오늘 활동의 수행','안내 후 반응'])assert.equal(await pianoEdit.getByRole('group',{name:group,exact:true}).getByRole('button').count(),3);
      assert.equal(await pianoEdit.getByRole('button',{name:'활동이 진행되는 동안 과제에 계속 참여했어요.',exact:true}).getAttribute('aria-pressed'),'true');
      await pianoEdit.getByRole('button',{name:'소리나 음악 활동에 관심을 보였어요',exact:true}).click();
      assert.deepEqual(await pianoEdit.locator('[name=observations]').evaluateAll(nodes=>nodes.map(n=>n.value)),['sustained_engagement','music_interested_in_sound']);
      assert.equal(await pianoEdit.locator('[name=publicSummary]').inputValue(),'즐겁게 수업에 참여했어요.');
      assert(!await pianoEdit.evaluate(e=>e.scrollWidth>e.clientWidth));await page.screenshot({path:path.join(out,'piano-editor-'+width+'.png')});
      await pianoEdit.getByRole('button',{name:'기록 저장',exact:true}).click();await pianoEdit.getByText('TEST 저장 실패 · 입력 유지',{exact:true}).waitFor();
      const submitted=await page.evaluate(()=>window.submissions.filter(s=>s.name==='upsertTrialResultAction').at(-1));assert.deepEqual(submitted.observations,['sustained_engagement','music_interested_in_sound']);
      assert.equal(await pianoEdit.getByRole('button',{name:'소리나 음악 활동에 관심을 보였어요',exact:true}).getAttribute('aria-pressed'),'true');
      // Re-entry uses a separately persisted source (actual RPC persistence is covered in the isolated DB suite).
      await render('finalized');await page.evaluate(async()=>{const a=window.fixture.application;a.reportSubjectCategory='music';a.classTitle='피아노 체험수업';a.trialResult.observations=['music_followed_rhythm_or_sound','music_retried_after_guidance'];await window.refreshCurrent()});
      await page.getByRole('button',{name:'내용 수정',exact:true}).click();assert.equal(await pianoEdit.getByRole('button',{name:'제시된 리듬이나 소리를 따라 표현했어요',exact:true}).getAttribute('aria-pressed'),'true');await pianoEdit.getByRole('button',{name:'취소',exact:true}).click();
      assert.equal(await page.locator('#trial-record').getByText('관심과 참여',{exact:true}).count(),0);
      await page.getByRole('button',{name:'미리보기',exact:true}).click();const pianoPreview=page.getByRole('dialog',{name:'리포트 미리보기',exact:true});
      assert.equal(await pianoPreview.getByText('관심과 참여',{exact:true}).count(),0);assert(await pianoPreview.getByText('오늘 활동의 수행',{exact:true}).isVisible());assert(await pianoPreview.getByText('안내 후 반응',{exact:true}).isVisible());
      const studioObservations=await pianoPreview.locator('li').allTextContents();
      const snapshot=await page.evaluate(()=>{const a=window.fixture.application;return window.buildMathSnapshot({programType:a.classProgramType,confirmedSlotAt:a.confirmedSlotAt,completedAt:a.completedAt,childName:a.childName,childGrade:a.childGrade,academyName:a.academyName,classTitle:a.classTitle,...a.trialResult}).snapshot});
      await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await page.evaluate(s=>window.renderMathParent(s),snapshot);await page.getByRole('heading',{name:'수업에서 보인 모습',exact:true}).waitFor();
      assert.deepEqual(await page.getByRole('region',{name:'수업에서 보인 모습',exact:true}).locator('li').allTextContents(),studioObservations);assert.equal(await page.getByText('관심과 참여',{exact:true}).count(),0);
      assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert.equal(await page.getByRole('region',{name:'추천 정보',exact:true}).locator('a').count(),0);
      await page.screenshot({path:path.join(out,'piano-parent-390-from-'+width+'.png'),fullPage:true});
    }
    if(process.env.SUBJECT_CATALOG_PATH){
     const catalog=JSON.parse(fs.readFileSync(process.env.SUBJECT_CATALOG_PATH,'utf8'));
     for(const [category,groups] of Object.entries(catalog.groups).filter(([k])=>!['math','music'].includes(k))){
    for(const width of [1440,1024]) {
      await page.setViewportSize({width,height:1000});await render('finalized');
      await page.evaluate(async(category)=>{window.fixture.application.reportSubjectCategory=category;window.fixture.application.classTitle=category+' 체험수업';await window.refreshCurrent()},category);
      await page.getByRole('button',{name:'내용 수정',exact:true}).click();const pianoEdit=page.getByRole('dialog',{name:'리포트 내용 수정',exact:true});
      for(const group of groups.map(g=>g.label))assert.equal(await pianoEdit.getByRole('group',{name:group,exact:true}).getByRole('button').count(),3);
      assert.equal(await pianoEdit.getByRole('button',{name:'활동이 진행되는 동안 과제에 계속 참여했어요.',exact:true}).getAttribute('aria-pressed'),'true');
      await pianoEdit.getByRole('button',{name:groups[0].options[0].label,exact:true}).click();
      assert.deepEqual(await pianoEdit.locator('[name=observations]').evaluateAll(nodes=>nodes.map(n=>n.value)),['sustained_engagement',groups[0].options[0].value]);
      assert.equal(await pianoEdit.locator('[name=publicSummary]').inputValue(),'즐겁게 수업에 참여했어요.');
      assert(!await pianoEdit.evaluate(e=>e.scrollWidth>e.clientWidth));await page.screenshot({path:path.join(out,category+'-editor-'+width+'.png')});
      await pianoEdit.getByRole('button',{name:'기록 저장',exact:true}).click();await pianoEdit.getByText('TEST 저장 실패 · 입력 유지',{exact:true}).waitFor();
      const submitted=await page.evaluate(()=>window.submissions.filter(s=>s.name==='upsertTrialResultAction').at(-1));assert.deepEqual(submitted.observations,['sustained_engagement',groups[0].options[0].value]);
      assert.equal(await pianoEdit.getByRole('button',{name:groups[0].options[0].label,exact:true}).getAttribute('aria-pressed'),'true');
      // Re-entry uses a separately persisted source (actual RPC persistence is covered in the isolated DB suite).
      await render('finalized');await page.evaluate(async({category,groups})=>{const a=window.fixture.application;a.reportSubjectCategory=category;a.classTitle=category+' 체험수업';a.trialResult.observations=[groups[1].options[0].value,groups[2].options[0].value];await window.refreshCurrent()},{category,groups});
      await page.getByRole('button',{name:'내용 수정',exact:true}).click();assert.equal(await pianoEdit.getByRole('button',{name:groups[1].options[0].label,exact:true}).getAttribute('aria-pressed'),'true');await pianoEdit.getByRole('button',{name:'취소',exact:true}).click();
      assert.equal(await page.locator('#trial-record').getByText('관심과 참여',{exact:true}).count(),0);
      await page.getByRole('button',{name:'미리보기',exact:true}).click();const pianoPreview=page.getByRole('dialog',{name:'리포트 미리보기',exact:true});
      assert.equal(await pianoPreview.getByText('관심과 참여',{exact:true}).count(),0);assert(await pianoPreview.getByText(groups[1].label,{exact:true}).isVisible());assert(await pianoPreview.getByText('안내 후 반응',{exact:true}).isVisible());
      const studioObservations=await pianoPreview.locator('li').allTextContents();
      const snapshot=await page.evaluate(()=>{const a=window.fixture.application;return window.buildMathSnapshot({programType:a.classProgramType,confirmedSlotAt:a.confirmedSlotAt,completedAt:a.completedAt,childName:a.childName,childGrade:a.childGrade,academyName:a.academyName,classTitle:a.classTitle,...a.trialResult}).snapshot});
      await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await page.evaluate(s=>window.renderMathParent(s),snapshot);await page.getByRole('heading',{name:'수업에서 보인 모습',exact:true}).waitFor();
      assert.deepEqual(await page.getByRole('region',{name:'수업에서 보인 모습',exact:true}).locator('li').allTextContents(),studioObservations);assert.equal(await page.getByText('관심과 참여',{exact:true}).count(),0);
      assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert.equal(await page.getByRole('region',{name:'추천 정보',exact:true}).locator('a').count(),0);
      await page.screenshot({path:path.join(out,category+'-parent-390-from-'+width+'.png'),fullPage:true});
    }
     }
     pass('Nine additional categories: shared editor selection/reentry/failure, optional domains and preview/Parent equivalence at 1440/1024/390');
    }
    await page.evaluate(()=>window.renderMathParent({experience:{type:'trial_class',date:'2026-10-11T01:00:00Z',child:{displayName:'격리 학생',grade:'초3'},academy:{name:'격리 학원'},class:{title:'격리 수업'}},observations:[],summary:'선생님 이야기만 있는 리포트',recommendation:{course:null,level:null,schedule:null}}));
    await page.getByText('선생님 이야기만 있는 리포트',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'수업에서 보인 모습',exact:true}).count(),0);assert.equal(await page.getByRole('region',{name:'추천 정보',exact:true}).count(),0);
    pass('Math + music 3 optional domains / 9 unique choices, legacy generic selection preserved, failed draft retained, saved math re-entry, shared preview/Parent labels, omitted empty domains, Parent 390 and Studio 1440/1024');
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));console.log('Evidence: '+out)
  } catch (error) {
    const page = browser.contexts()[0]?.pages()[0]
    if (page) { await page.screenshot({path:path.join(out,'failure.png')});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(await page.evaluate(()=>({submissions:window.submissions,select:[...document.querySelectorAll('select')].map(e=>({value:e.value,html:e.outerHTML})),body:document.body.innerText})),null,2)) }
    throw error
  } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exitCode=1})
