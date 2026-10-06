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
  '@/shared/lib/db': `export const dataAdapter={listExperienceReportVersions:async()=>window.fixture.sent?[{}]:[]}`,
  '@/shared/lib/request-host': `export const getRequestHostname=async()=> 'localhost'`,
  '@/shared/lib/studio-navigation-server': `export const getStudioNavigationPathResolver=async()=>p=>p`,
  '@/features/studio/ui/studio-navigation-provider': `export const useStudioNavigationPathFactory=()=>p=>p;export const useStudioNavigationPath=p=>p;export const useStudioInternalPathname=()=>'/studio/applications/workflow-test'`,
  '@/features/studio/lib/require-teacher-studio-access': `export const requireTeacherStudioAccess=async()=>({id:'test-teacher',organizationId:'test-org'})`,
  '@/features/studio/queries/get-studio-application-detail': `export const getStudioApplicationDetail=async()=>({data:window.fixture.application,error:null})`,
  '@/features/studio/queries/get-studio-application-assignee-options': `export const getStudioApplicationAssigneeOptions=async()=>({data:[{teacherId:'test-teacher',teacherName:'테스트 선생님'},{teacherId:'second-teacher',teacherName:'두번째 선생님'}],error:window.fixture.assigneeError||null})`,
  '@/features/billing/queries/get-organization-entitlements': `export const getStudioEntitlementsForDisplay=async()=>({entitlements:{canWriteTrialResults:true,canWriteConsultations:true,canReopenConsultation:true,canPublishParentReport:!window.fixture.free}})`,
  '@/features/feedback/queries/get-experience-feedback': `export const getStudioExperienceFeedback=async()=>({feedback:null,error:false});export const getParentExperienceFeedback=async()=>({feedback:null,error:false})`,
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
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import Page from ${JSON.stringify(root + '/app/studio/(dashboard)/applications/[id]/page.tsx')};
import ParentReportPage from ${JSON.stringify(root + '/app/record/[experienceId]/report/page.tsx')};
import {StudioShell} from '@/features/studio/ui/studio-shell';
import {createWorkflowApplication,createWorkflowRecord} from ${JSON.stringify(root + '/scripts/fixtures/application-detail-workflow.ts')};
import {buildExperienceReportSnapshotV2} from '@/features/reports/lib/experience-report-snapshot';
const appRoot=createRoot(document.getElementById('app'));window.submissions=[];window.refreshes=0;
window.renderFixture=async(name)=>{const a=createWorkflowApplication({interestSubjects:'수학, 음악',childNotes:'차분히 설명해 주세요.',memo:'긴 학부모 요청도 줄바꿈되어 표시됩니다.'});
const f={application:a,sent:false,report:null};
if(!['unwritten','unlinked','record-error','new','canceled'].includes(name))a.trialResult=createWorkflowRecord({observations:['sustained_engagement']});
if(name==='pending'){a.registrationStatus='pending';a.registrationReasonIds=['price_consideration'];a.registrationNote='저장된 추가 메모'}
if(name==='not-enrolled'){a.registrationStatus='not_enrolled';a.registrationReasonIds=['price_burden','schedule_mismatch'];a.registrationNote='저장된 미등록 메모'}
if(name==='enrolled')a.registrationStatus='enrolled';
if(name==='new'){a.status='new';a.completedAt=null;a.confirmedSlotAt=null}
if(name==='canceled'){a.status='canceled';a.noShowAt=a.updatedAt;a.completedAt=null}
if(name==='record-error')a.trialResultLoadError='TEST 조회 오류';
if(name==='assignee-error')f.assigneeError='TEST 선생님 조회 실패';
if(name==='assignee-unassigned'){a.assignedTeacherId=null;a.assignedTeacherName=null}
if(name==='report-error')f.reportError='TEST 리포트 조회 오류';
if(name==='free')f.free=true;if(name==='unlinked')a.parentId=null;
if(name==='sent'){f.sent=true;const built=buildExperienceReportSnapshotV2({programType:a.classProgramType,confirmedSlotAt:a.confirmedSlotAt,completedAt:a.completedAt,childName:a.childName,childGrade:a.childGrade,academyName:a.academyName,classTitle:a.classTitle,...a.trialResult});f.report={version:1,publishedAt:a.updatedAt,content:built.snapshot}}
if(name==='contact-structured'){a.regularSchedulePreference={version:1,state:'specified',groups:[{dayMode:'selected',days:[2],timeMode:'range',startTime:'17:00',endTime:'19:00'},{dayMode:'selected',days:[4],timeMode:'range',startTime:'18:00',endTime:'20:00'}]};a.regularSchedulePreferenceNote='목요일은 18시 이후';a.nextContactAt='2026-10-07T09:00:00Z'}
if(name==='contact-existing'){a.regularSchedulePreference={version:1,state:'specified',groups:[{dayMode:'selected',days:[2,4],timeMode:'after',startTime:'17:15',endTime:null},{dayMode:'any',days:[],timeMode:'before',startTime:null,endTime:'20:15'},{dayMode:'any',days:[],timeMode:'any',startTime:null,endTime:null}]};a.regularSchedulePreferenceNote='기존 메모'}
if(name==='contact-unreadable'){a.regularSchedulePreference={version:2,state:'specified',groups:[]};a.regularSchedulePreferenceNote='보존 메모'}
if(name==='contact-undecided')a.regularSchedulePreference={version:1,state:'undecided',groups:[]};
if(['contact','legacy'].includes(name))a.consultationLogs=[{id:'test-contact',applicationId:a.id,activityType:name==='legacy'?'LEGACY_IMPORT':'CONTACT',channel:'PHONE',sentiment:'NEUTRAL',note:'커리큘럼과 희망 요일을 안내드렸습니다.',occurredAt:a.updatedAt,createdAt:a.updatedAt,updatedAt:a.updatedAt,registrationStatusSnapshot:'undecided',nextContactAt:null,createdBy:'test-teacher'}];
window.fixture=f;appRoot.render(<StudioShell key={name} organizationName="첫수업 테스트 학원">{await Page({params:Promise.resolve({id:a.id})})}</StudioShell>)};
window.renderParentSchedule=async(schedule)=>{const a=createWorkflowApplication();const built=buildExperienceReportSnapshotV2({programType:a.classProgramType,confirmedSlotAt:a.confirmedSlotAt,completedAt:a.completedAt,childName:a.childName,childGrade:a.childGrade,academyName:a.academyName,classTitle:a.classTitle,...createWorkflowRecord({recommendedSchedule:schedule,note:'PRIVATE_REPORT_CANARY'})});window.reportFixture={status:'ok',experience:{status:'completed',canCollectParentDecision:false},report:{id:'test-report',version:2,publishedAt:a.updatedAt,content:built.snapshot}};appRoot.render(await ParentReportPage({params:Promise.resolve({experienceId:a.id})}))};
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
      return { contents: names.map(name => `export async function ${name}(...args){window.submissions.push({name:${JSON.stringify(name)},values:Object.fromEntries(args.at(-1)),observations:args.at(-1).getAll('observations')});await new Promise(r=>setTimeout(r,200));return {status:${name === 'updateApplicationAssigneeAction' ? "window.assigneeOutcome||'error'" : name === 'createConsultationLogAction' ? "window.contactOutcome||'error'" : name === 'upsertTrialResultAction' ? "window.recordOutcome||'error'" : "'error'"},message:'TEST 저장 실패 · 입력 유지',successToken:'mock-result'}}`).join('\n'), loader: 'js' }
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
    const render = async name => { await page.evaluate(name => window.renderFixture(name), name);await page.getByRole('heading', { name: '체험 결과 정리', exact: true }).waitFor() }
    const reg = () => page.getByRole('region', { name: '등록 결과', exact: true })
    const save = () => reg().getByRole('button', { name: '등록 결과 저장', exact: true })
    const results = [], pass = message => { results.push(message);console.log('PASS ' + message) }
    for (const name of ['unwritten','finalized','sent','pending','not-enrolled','enrolled','contact','legacy','record-error','report-error','free','unlinked','new','canceled']) {
      await render(name)
      assert.equal(await page.getByRole('list', { name: '신청 진행 단계' }).locator(':scope > li').count(), 4)
      if (!['new','canceled'].includes(name)) assert(await save().isDisabled())
      for (const width of [1440,1280,1024]) {
        await page.setViewportSize({ width, height: 1100 });assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), name + ' overflow at ' + width)
        await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true })
      }
    }
    pass('14 actual route states × 1440/1280/1024: 4 read-only steps, no overflow, initial save disabled')
    await render('unwritten');assert.equal(await reg().locator('textarea').count(),0);assert(await page.getByText('체험 기록 확정 후 리포트를 발송할 수 있어요.',{exact:true}).isVisible());assert.equal(await page.getByRole('button',{name:'리포트 발송',exact:true}).count(),0)
    pass('unwritten record and separate unsent report row; no always-visible registration textarea')
    await render('sent');assert.equal(await page.getByRole('button',{name:'리포트 발송',exact:true}).count(),0);await page.getByText('리포트 보기',{exact:true}).click();assert(await page.getByText('즐겁게 수업에 참여했어요.',{exact:true}).last().isVisible());assert.equal(await page.getByRole('button',{name:'체험 기록 작성',exact:true}).count(),0)
    pass('sent report/record read-only; published snapshot opens; no editing or republish')
    await render('unwritten');await reg().getByRole('button',{name:'고민 중',exact:true}).focus();await page.keyboard.press('Space');assert.equal(await reg().locator('fieldset button').count(),8);assert.notEqual(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');assert(await save().isEnabled())
    await reg().getByRole('button',{name:'비용 고민',exact:true}).click();await reg().getByLabel('추가 메모 (선택)').fill('실패 후에도 보존할 메모');assert.equal(await page.evaluate(()=>window.submissions.length),0);await save().click();await reg().getByRole('alert').waitFor();assert.equal(await reg().getByLabel('추가 메모 (선택)').inputValue(),'실패 후에도 보존할 메모');assert.equal(await reg().getByRole('button',{name:'비용 고민',exact:true}).getAttribute('aria-pressed'),'true')
    await reg().getByRole('button',{name:'등록 완료',exact:true}).click();assert.equal(await reg().locator('textarea,fieldset').count(),0);assert.equal(await reg().locator('[name=registrationNote]').inputValue(),'실패 후에도 보존할 메모');await reg().getByRole('button',{name:'미등록',exact:true}).click();assert.equal(await reg().locator('fieldset button').count(),9)
    pass('keyboard/focus, 8/9 reason chips, state-only selection, failed-save drafts, hidden note preservation')
    await render('pending');await reg().getByRole('button',{name:'비용 고민',exact:true}).click();assert(await save().isEnabled());await reg().getByRole('button',{name:'비용 고민',exact:true}).click();assert(await save().isDisabled());pass('reverting draft to saved values disables duplicate save')
    await render('assignee-unassigned');await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>window.scrollTo(0,0))
    const header=page.getByRole('region',{name:'신청 작업 헤더'}),change=header.getByRole('button',{name:'변경',exact:true}),dialog=page.getByRole('dialog',{name:'담당 선생님',exact:true})
    assert.equal(await header.getByText('더보기',{exact:true}).count(),0);assert.equal(await page.getByText('수업 미리보기',{exact:true}).count(),0)
    assert.equal(await header.getByRole('link',{name:'전화하기'}).getAttribute('href'),'tel:010-0000-0000');assert.equal(await header.getByRole('link',{name:'문자하기'}).getAttribute('href'),'sms:010-0000-0000')
    for(const width of [1440,1024]) {
      await page.setViewportSize({width,height:1100});const before=await header.boundingBox();await change.click();await dialog.waitFor();assert.deepEqual(await header.boundingBox(),before);assert((await dialog.boundingBox()).width<=420);assert.equal(await dialog.getByLabel('선생님 선택').inputValue(),'');assert(await dialog.getByRole('button',{name:'저장',exact:true}).isDisabled());await page.screenshot({path:path.join(out,`assignee-dialog-${width}.png`)});await dialog.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0)
    }
    pass('header menu removed; phone/SMS intact; compact 420px modal at 1440/1024 has zero layout shift; cancel restores focus')
    await change.click();await dialog.getByLabel('선생님 선택').selectOption('second-teacher');const calls=await page.evaluate(()=>window.submissions.length);await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>window.submissions.length),calls);assert(await change.evaluate(e=>e===document.activeElement))
    await change.click();assert.equal(await dialog.getByLabel('선생님 선택').inputValue(),'');await dialog.getByLabel('선생님 선택').selectOption('second-teacher');await dialog.getByRole('button',{name:'저장',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('선생님 선택').inputValue(),'second-teacher');assert(await header.getByText('미배정',{exact:true}).first().isVisible())
    await page.evaluate(()=>window.assigneeOutcome='success');await dialog.getByRole('button',{name:'저장',exact:true}).click();await dialog.waitFor({state:'detached'});assert(await header.getByText('두번째 선생님',{exact:true}).isVisible());assert(await page.evaluate(()=>window.refreshes>0))
    await change.click();await dialog.getByLabel('선생님 선택').selectOption('');await dialog.getByRole('button',{name:'저장',exact:true}).click();await dialog.waitFor({state:'detached'});assert(await header.getByText('미배정',{exact:true}).isVisible());assert.equal(await page.evaluate(()=>window.submissions.at(-1).values.assignedTeacherId),'')
    pass('assignment mock: no submit on selection/cancel/Escape; failure retains choice; success closes/updates header; unassign uses empty existing field')
    await render('assignee-error');await header.getByRole('button',{name:'변경',exact:true}).click();await dialog.getByRole('alert').waitFor();assert(await dialog.getByLabel('선생님 선택').isDisabled());assert(await dialog.getByRole('button',{name:'저장',exact:true}).isDisabled());await dialog.getByRole('button',{name:'취소',exact:true}).click();pass('teacher query failure disables saving and remains distinguishable from empty options')
    const record=page.getByRole('dialog',{name:'체험 기록 작성',exact:true});
    const openRecord=async()=>{await render('unwritten');await page.getByRole('button',{name:'체험 기록 작성',exact:true}).click();await record.waitFor()};
    for(const width of [1440,1280,1024]) {
      await page.setViewportSize({width,height:900});await openRecord();assert.equal((await record.boundingBox()).width,600);assert.equal(await record.getByRole('group',{name:'수업 관찰',exact:true}).getByRole('button').count(),7);assert.equal(await record.locator('input[name=recommendedSchedule][type=hidden]').count(),1);assert.equal(await record.locator('input[name=recommendedSchedule]:not([type=hidden])').count(),0);
      assert(await record.getByText('체험 기록은 확정 후 수정할 수 없습니다.',{exact:true}).isVisible());assert(!await record.evaluate(e=>e.scrollWidth>e.clientWidth));await page.screenshot({path:path.join(out,`record-modal-${width}.png`)});await record.getByRole('button',{name:'취소',exact:true}).click()
    }
    pass('record modal matches consultation 600px width, chips, border/radius/footer; 1440/1280/1024 no overflow; no free-text schedule');
    await openRecord();const schedule=record.getByRole('region',{name:'추천 일정',exact:true});await schedule.getByRole('button',{name:'화',exact:true}).focus();await page.keyboard.press('Space');assert.notEqual(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');assert.equal(await record.locator('[name=recommendedSchedule]').inputValue(),'화');await page.screenshot({path:path.join(out,'record-schedule-single-day.png')});await schedule.getByRole('button',{name:'목',exact:true}).click();assert.equal(await record.locator('[name=recommendedSchedule]').inputValue(),'화·목');await page.screenshot({path:path.join(out,'record-schedule-multiple-days.png')});
    for(const [label,filename] of [['오전','morning'],['오후','afternoon'],['저녁','evening'],['시간 무관','any']]) {
      await schedule.getByRole('button',{name:label,exact:true}).click();assert.equal(await record.getByRole('group',{name:'추천 시간대',exact:true}).locator('[aria-pressed=true]').count(),1);assert.equal(await record.locator('[name=recommendedSchedule]').inputValue(),'화·목 / '+label);await page.screenshot({path:path.join(out,`record-schedule-${filename}.png`)})
    }
    await schedule.getByRole('button',{name:'시간 무관',exact:true}).click();assert.equal(await record.locator('[name=recommendedSchedule]').inputValue(),'화·목');await schedule.getByRole('button',{name:'저녁',exact:true}).click();
    await record.getByRole('group',{name:'수업 관찰',exact:true}).getByRole('button').nth(0).click();await record.getByRole('group',{name:'수업 관찰',exact:true}).getByRole('button').nth(1).click();await record.getByLabel('추천 과정',{exact:true}).fill('기초 과정');await record.getByLabel('추천 레벨',{exact:true}).fill('입문');await record.getByLabel('총평',{exact:true}).fill('학부모에게 전달할 총평');await record.getByLabel('내부 메모 · 비공개',{exact:true}).fill('비공개 실패 보존 메모');assert.equal(await record.getByLabel('총평',{exact:true}).getAttribute('maxlength'),'1000');
    const recordCalls=()=>page.evaluate(()=>window.submissions.filter(x=>x.name==='upsertTrialResultAction'));assert.equal((await recordCalls()).length,0);await record.getByRole('button',{name:'체험 기록 확정',exact:true}).click();await record.getByRole('button',{name:'저장 중...',exact:true}).waitFor();assert(await record.getByRole('button',{name:'취소',exact:true}).isDisabled());await page.keyboard.press('Escape');assert(await record.isVisible());await record.getByRole('alert').waitFor();assert.equal(await record.getByLabel('추천 과정',{exact:true}).inputValue(),'기초 과정');assert.equal(await record.getByLabel('추천 레벨',{exact:true}).inputValue(),'입문');assert.equal(await record.getByLabel('총평',{exact:true}).inputValue(),'학부모에게 전달할 총평');assert.equal(await record.getByLabel('내부 메모 · 비공개',{exact:true}).inputValue(),'비공개 실패 보존 메모');assert.equal(await record.locator('[name=recommendedSchedule]').inputValue(),'화·목 / 저녁');assert.equal(await record.getByRole('group',{name:'수업 관찰',exact:true}).locator('[aria-pressed=true]').count(),2);
    let recordPayload=(await recordCalls()).at(-1);assert.equal(recordPayload.values.recommendedSchedule,'화·목 / 저녁');assert.deepEqual(recordPayload.observations,['sustained_engagement','active_participation']);assert.equal(recordPayload.values.publicSummary,'학부모에게 전달할 총평');assert.equal(recordPayload.values.note,'비공개 실패 보존 메모');await page.screenshot({path:path.join(out,'record-failed-draft.png')});
    pass('single/multiple weekdays and all four periods rendered; keyboard selection; unchanged form fields; failure retains every draft; pending blocks cancel/Escape');
    await page.setViewportSize({width:1024,height:500});const recordFooter=await record.locator('footer').boundingBox();assert(recordFooter.y>=0&&recordFooter.y+recordFooter.height<=500);assert(await record.locator('[class*=body]').evaluate(e=>e.scrollHeight>e.clientHeight));await record.getByRole('button',{name:'체험 기록 확정',exact:true}).focus();await page.keyboard.press('Tab');assert(await record.getByRole('button',{name:'닫기',exact:true}).evaluate(e=>e===document.activeElement));await page.keyboard.press('Shift+Tab');assert(await record.getByRole('button',{name:'체험 기록 확정',exact:true}).evaluate(e=>e===document.activeElement));await page.screenshot({path:path.join(out,'record-short-viewport.png')});await page.keyboard.press('Escape');assert.equal(await record.count(),0);
    pass('record footer and finalization notice remain accessible at 500px height; focus trap and Escape close');
    await openRecord();await page.evaluate(()=>window.recordOutcome='success');const beforeRecord=(await recordCalls()).length;await record.getByRole('button',{name:'체험 기록 확정',exact:true}).evaluate(button=>{button.click();button.click()});await record.waitFor({state:'detached'});assert.equal((await recordCalls()).length,beforeRecord+1);const success=page.getByRole('dialog',{name:'체험 기록을 최종 확정했습니다.',exact:true});await success.waitFor();await success.getByRole('button',{name:'확인',exact:true}).click();await render('finalized');await page.getByRole('button',{name:'체험 기록 작성',exact:true}).waitFor({state:'detached'});
    pass('record mock double submit sends once; success uses existing acknowledgement/refresh; finalized fixture exposes no write control');
    const contact=page.getByRole('dialog',{name:'상담 기록 추가',exact:true});
    const openContact=async name=>{await render(name);await page.getByRole('button',{name:'+ 기록 추가',exact:true}).click();await contact.waitFor()};
    const fillContact=async()=>{await contact.getByRole('button',{name:'전화',exact:true}).click();await contact.getByRole('button',{name:'긍정적',exact:true}).click();await contact.getByLabel('상담 내용',{exact:true}).fill('상담 내용 유지 검증')};
    const contactCalls=()=>page.evaluate(()=>window.submissions.filter(x=>x.name==='createConsultationLogAction'));
    for(const width of [1440,1280,1024]) {
      await page.setViewportSize({width,height:800});await openContact('unwritten');assert.equal((await contact.boundingBox()).width,600);assert.equal(await contact.getByLabel('희망 요일 1').count(),0);assert.equal(await contact.getByLabel('시간 조정 가능 범위').count(),0);
      assert.equal(await contact.locator('textarea').count(),2);assert.equal(await contact.locator('input[name=nextContactAt]').count(),0);await page.screenshot({path:path.join(out,`consultation-simple-${width}.png`)});
      await contact.getByRole('button',{name:'+ 희망 시간 추가',exact:true}).click();await contact.getByLabel('희망 요일 1').selectOption('2');await contact.getByLabel('시작 시간 1').selectOption('17:00');await contact.getByLabel('종료 시간 1').selectOption('19:00');await contact.getByLabel('시간 조정 가능 범위').selectOption('plus_minus_30');
      assert(!await contact.evaluate(e=>e.scrollWidth>e.clientWidth));await page.screenshot({path:path.join(out,`consultation-rows-${width}.png`)});await page.keyboard.press('Escape');assert.equal(await contact.count(),0)
    }
    pass('consultation 600px at 1440/1280/1024; empty schedule collapsed; 30-minute rows and flexibility disclosure; no overflow');
    await page.setViewportSize({width:1024,height:500});await openContact('contact-structured');assert.equal(await contact.getByLabel('희망 요일 1').inputValue(),'2');assert.equal(await contact.getByLabel('희망 요일 2').inputValue(),'4');assert.equal(await contact.getByLabel('추가 메모 · 선택').inputValue(),'목요일은 18시 이후');
    const footer=await contact.locator('footer').boundingBox();assert(footer.y>=0&&footer.y+footer.height<=500);assert(await contact.locator('[class*=body]').evaluate(e=>e.scrollHeight>e.clientHeight));
    const saveContact=contact.getByRole('button',{name:'저장하기',exact:true});await saveContact.focus();await page.keyboard.press('Tab');assert(await contact.getByRole('button',{name:'닫기',exact:true}).evaluate(e=>e===document.activeElement));await page.keyboard.press('Shift+Tab');assert(await saveContact.evaluate(e=>e===document.activeElement));assert.notEqual(await saveContact.evaluate(e=>getComputedStyle(e).outlineStyle),'none');await page.screenshot({path:path.join(out,'consultation-short-viewport.png')});await page.keyboard.press('Escape');
    pass('existing two rows/note restored; 500px viewport scrolls body while footer stays visible; native focus trap/Escape/focus indicator');
    await openContact('unwritten');await fillContact();const initialCalls=(await contactCalls()).length;await saveContact.click();await contact.getByRole('alert').waitFor();assert.equal((await contactCalls()).length,initialCalls+1);assert.equal(await contact.getByLabel('상담 내용',{exact:true}).inputValue(),'상담 내용 유지 검증');let payload=(await contactCalls()).at(-1).values;assert.equal(payload.regularSchedulePreference,undefined);assert.equal(payload.nextContactAt,undefined);assert.equal(payload.timeFlexibility,'');
    pass('simple contact needs no schedule; existing next_contact_at/preference omitted (preserved by action); mock failure retains draft');
    await contact.getByRole('button',{name:'+ 희망 시간 추가',exact:true}).click();await saveContact.click();assert(await contact.getByText('요일을 선택해 주세요.',{exact:true}).isVisible());assert.equal((await contactCalls()).length,initialCalls+1);
    await contact.getByLabel('희망 요일 1').selectOption('2');await contact.getByLabel('시작 시간 1').selectOption('19:00');await contact.getByLabel('종료 시간 1').selectOption('17:00');assert(await contact.getByText('종료 시간은 시작 시간보다 뒤여야 해요.',{exact:true}).isVisible());await saveContact.click();assert.equal((await contactCalls()).length,initialCalls+1);
    await contact.getByLabel('시작 시간 1').selectOption('17:00');await contact.getByLabel('종료 시간 1').selectOption('19:00');await contact.getByLabel('시간 조정 가능 범위').selectOption('exact');await contact.getByLabel('추가 메모 · 선택').fill('추가 메모 유지');await contact.getByLabel('상담 일시').fill('2026-09-30T16:30');
    await saveContact.click();await contact.getByRole('button',{name:'저장 중...',exact:true}).waitFor();assert(await contact.getByRole('button',{name:'취소',exact:true}).isDisabled());await page.keyboard.press('Escape');assert(await contact.isVisible());await contact.getByRole('button',{name:'저장하기',exact:true}).waitFor();
    assert.equal(await contact.getByLabel('희망 요일 1').inputValue(),'2');assert.equal(await contact.getByLabel('시작 시간 1').inputValue(),'17:00');assert.equal(await contact.getByLabel('시간 조정 가능 범위').inputValue(),'exact');assert.equal(await contact.getByLabel('추가 메모 · 선택').inputValue(),'추가 메모 유지');assert.equal(await contact.getByLabel('상담 일시').inputValue(),'2026-09-30T16:30');assert.equal(await contact.getByRole('button',{name:'긍정적',exact:true}).getAttribute('aria-pressed'),'true');
    payload=(await contactCalls()).at(-1).values;assert.deepEqual(JSON.parse(payload.regularSchedulePreference),{version:1,state:'specified',groups:[{dayMode:'selected',days:[2],timeMode:'range',startTime:'17:00',endTime:'19:00'}]});assert.equal(payload.regularSchedulePreferenceNote,'추가 메모 유지');
    pass('domain validator blocks missing day/reversed time near row; pending locks cancel/Escape; all failed-save drafts and original JSON contract retained');
    await contact.getByLabel('시간 조정 가능 범위').selectOption('flexible');await contact.getByRole('button',{name:'희망 시간 1 삭제',exact:true}).click();assert.equal(await contact.getByLabel('시간 조정 가능 범위').count(),0);await saveContact.click();await contact.getByRole('button',{name:'저장하기',exact:true}).waitFor();payload=(await contactCalls()).at(-1).values;assert.equal(payload.timeFlexibility,'flexible');assert.equal(payload.regularSchedulePreference,'');await page.keyboard.press('Escape');
    pass('flexible remains valid after all rows removed, using existing null preference contract');
    for(const name of ['contact-existing','contact-undecided','contact-unreadable','legacy']) {
      await openContact(name);await fillContact();await saveContact.click();await contact.getByRole('alert').waitFor();payload=(await contactCalls()).at(-1).values;assert.equal(payload.regularSchedulePreference,undefined);assert.equal(payload.regularSchedulePreferenceNote,undefined);
      if(name==='contact-existing'){assert.equal(await contact.getByLabel('희망 요일 1').inputValue(),'stored');assert.equal(await contact.getByLabel('시작 시간 1').inputValue(),'17:15');assert.equal(await contact.getByLabel('종료 시간 2').inputValue(),'20:15');await contact.getByLabel('추가 메모 · 선택').fill('메모만 변경');await saveContact.click();await contact.getByRole('button',{name:'저장하기',exact:true}).waitFor();payload=(await contactCalls()).at(-1).values;assert.deepEqual(JSON.parse(payload.regularSchedulePreference),await page.evaluate(()=>window.fixture.application.regularSchedulePreference))}
      await page.keyboard.press('Escape')
    }
    pass('legacy null/undecided/unreadable/multi-day after/before/any and off-grid times preserved; note-only edit keeps exact canonical preference');
    await openContact('unwritten');await fillContact();await page.evaluate(()=>{window.contactOutcome='success';window.refreshes=0});const beforeDouble=(await contactCalls()).length;await saveContact.evaluate(button=>{button.click();button.click()});await contact.waitFor({state:'detached'});assert.equal((await contactCalls()).length,beforeDouble+1);assert(await page.evaluate(()=>window.refreshes===1));
    pass('double click sends once; mock success closes modal and refreshes list');
    await render('legacy');await page.getByRole('button',{name:/상담 1건 전체 보기/}).click();await page.getByRole('dialog').waitFor();pass('legacy contact list and existing history dialog remain usable')
    for(const width of [390,768]) {
      await page.setViewportSize({width,height:844});await page.evaluate(()=>window.renderParentSchedule('화·목 / 저녁'));await page.getByText('화·목 / 저녁',{exact:true}).waitFor();await page.evaluate(()=>window.scrollTo(0,0));assert.equal(await page.getByRole('region',{name:'선생님이 제안한 일정'}).getByText('화·목 / 저녁',{exact:true}).count(),1);assert(!(await page.locator('body').innerText()).includes('PRIVATE_REPORT_CANARY'));assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.screenshot({path:path.join(out,`parent-report-recommendation-${width}.png`),fullPage:true})
    }
    await page.evaluate(()=>window.renderParentSchedule('기존 자유 입력 일정 원문'));await page.getByText('기존 자유 입력 일정 원문',{exact:true}).waitFor();
    pass('actual Parent report page/CSS renders new recommendation at 390/768 and preserves legacy text; no private note; view tracking disabled in isolated fixture');
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));console.log('Evidence: '+out)
  } catch (error) {
    const page = browser.contexts()[0]?.pages()[0]
    if (page) { await page.screenshot({path:path.join(out,'failure.png')});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(await page.evaluate(()=>({submissions:window.submissions,select:[...document.querySelectorAll('select')].map(e=>({value:e.value,html:e.outerHTML})),body:document.body.innerText})),null,2)) }
    throw error
  } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exitCode=1})
