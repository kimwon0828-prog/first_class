// Real four-screen components and Next Image. Inert auth/data/actions; no external requests or writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript')
const {build}=require(process.env.ESBUILD_MODULE_PATH||'esbuild')
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright')
const root=process.cwd(),out=process.env.PARENT_CONTENT_EVIDENCE||fs.mkdtempSync('/tmp/parent-content-browser-'),results=[]
fs.mkdirSync(out,{recursive:true})
const queryMock=p=>{
const prefix=`const mode=()=>new URLSearchParams(location.search).get('state');`;
if(p.endsWith('require-parent-access'))return `export const requireParentAccess=async()=>({id:'fixture-parent'});`;
if(p.endsWith('get-my-experience-report'))return prefix+`export const getMyExperienceReport=async()=>mode()==='error'?{status:'error'}:mode()==='empty'?{status:'unavailable'}:{status:'ok',experience:window.fixtureExperience,report:window.fixtureReport};`;
if(p.endsWith('get-record-child-context'))return `export const getRecordChildContext=async q=>['c1','c2'].includes(q)?q:null;`;
if(p.endsWith('get-experience-feedback'))return `export const getParentExperienceFeedback=async()=>({status:'ok',context:{eligible:true,programType:'trial_class',feedback:{selectedChipIds:[],privateNote:'아이가 즐겁게 참여했어요.',createdAt:'2026-10-03T03:00:00Z',updatedAt:'2026-10-03T03:00:00Z'}}});`;
if(p.endsWith('get-my-current-parent-decision'))return `export const getMyCurrentParentDecision=async()=>({status:'ok',decision:{decision:'considering',preferredDays:[],preferredStartTime:null,preferredEndTime:null,preferredTimeMode:null}});`;
if(p.endsWith('get-parent-notifications'))return prefix+`export const getParentNotifications=async()=>({notifications:mode()==='empty'?[]:window.fixtureNotifications,error:mode()==='error'?'error':null});`;
if(p.endsWith('get-parent-actions'))return `export const getParentActions=async()=>({actions:[{href:'/record/example/report'}],error:null});`;
throw Error('Unexpected fixture dependency '+p);
}
const entry=`
import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{usePathname,useSearchParams}from'next/navigation';
import{ParentScheduleScreen}from'./src/features/schedule/ui/parent-schedule-screen';import{buildScheduleView}from'./src/features/schedule/lib/schedule-view';
import{RecordHome}from'./src/features/record/ui/record-home';import Report from './app/record/[experienceId]/report/page';import Notifications from './app/notifications/page';
import{ParentAppShell}from'./src/features/classes/ui/parent-app-shell';import{ParentHeader}from'./src/features/classes/ui/parent-header';import './app/globals.css';
window.__fixtureActions=[];
const children=[{id:'c1',name:'김민준',grade:'초등학교 3학년'},{id:'c2',name:'이서준',grade:'초등학교 1학년'}];
const cover='https://assets.example.test/storage/v1/object/public/class-covers/cover.png';
const experience={id:'example',classId:'class',childId:'c1',childName:'김민준',childGrade:'초등학교 3학년',classTitle:'생각을 키우는 창의 미술 체험수업',classProgramType:'trial_class',academyName:'첫수업 미술학원',organizationAddress:'서울 노원구 중계로 123',classCoverImageUrl:cover,status:'completed',completedAt:'2026-10-03T05:00:00Z',confirmedSlotAt:'2026-10-03T05:00:00Z',requestedSlotAt:'2026-10-03T05:00:00Z',createdAt:'2026-09-30T05:00:00Z',canceledAt:null,canCollectParentDecision:true};
window.fixtureExperience=experience;
window.fixtureReport={id:'report',publishedAt:'2026-10-03T06:00:00Z',content:{experience:{type:'trial_class',date:experience.completedAt,child:{displayName:experience.childName,grade:experience.childGrade},class:{title:experience.classTitle},academy:{name:experience.academyName}},observations:[{code:'engagement',label:'새로운 재료를 탐색하며 자기 생각을 작품으로 표현했어요.'},{code:'focus',label:'수업 활동에 집중해서 참여했어요.'}],summary:'처음 만나는 친구들과 자연스럽게 어울리며 즐겁게 참여했어요. 색을 고르고 조합하는 과정에서 자신만의 생각을 또렷하게 표현했습니다. '.repeat(5),recommendation:{course:'창의 미술 기초 과정',level:'기초',schedule:'매주 화요일 오후 4시, 아이의 일정에 맞춰 상담 후 확정할 수 있어요.'}}};
window.fixtureNotifications=[['report_published','체험수업 리포트가 도착했어요','/record/example/report',true],['schedule_confirmed','체험 일정이 확정됐어요.','/record/example',false],['feedback_reminder','체험은 어떠셨나요?','/record/example/report#experience-feedback',true],['application_reviewing','학원이 신청을 확인하고 있어요.','/record/example',false],['application_canceled','신청이 취소됐어요.','/record/example',false],['experience_completed','체험을 다녀왔어요.','/record/example',false]].map(([kind,title,href,isUnread],i)=>({id:'notice-'+i,kind,title,href,isUnread,description:kind==='feedback_reminder'?'짧게 의견을 남겨주세요.':undefined,childName:'김민준',classTitle:experience.classTitle,academyName:experience.academyName,occurredAt:'2026-10-03T0'+(6-i)+':00:00Z'}));
function Fixture(){const route=usePathname(),params=useSearchParams(),selected=params.get('child'),mode=params.get('state'),[asyncContent,setAsyncContent]=useState(null);
useEffect(()=>{let active=true;setAsyncContent(null);const work=route.endsWith('/report')?Report({params:Promise.resolve({experienceId:'example'}),searchParams:Promise.resolve(Object.fromEntries(params))}):route==='/notifications'?Notifications():null;if(work)work.then(x=>active&&setAsyncContent(x));return()=>{active=false}},[route,params.toString()]);
const rows=[experience,{...experience,id:'missing',childId:'c2',childName:'이서준',classTitle:'실험으로 배우는 과학',classCoverImageUrl:null},{...experience,id:'broken',classTitle:'즐거운 영어 체험',classCoverImageUrl:cover.replace('cover.png','broken.png')}].map((r,i)=>({...r,completedAt:'2026-10-0'+(3-i)+'T05:00:00Z',confirmedSlotAt:'2026-10-0'+(3-i)+'T05:00:00Z'}));
const scoped=selected?rows.filter(r=>r.childId===selected):rows;
if(route==='/my/schedule')return <ParentScheduleScreen model={buildScheduleView(mode==='empty'?[]:[...scoped,...scoped.map((r,i)=>({...r,id:'future-'+r.id,status:'confirmed',confirmedSlotAt:'2099-01-0'+(3+i)+'T05:00:00Z',completedAt:null}))],selected,Date.parse('2026-10-03T06:00:00Z'))} childOptions={children} selectedChildId={selected} today='2099-01-03' failed={mode==='error'}/>;
if(route==='/record')return <RecordHome experiences={mode==='empty'?[]:scoped} childOptions={children} selectedChildId={selected} error={mode==='error'?'records':null} reportedExperienceIds={new Set(['example'])} decidedExperienceIds={new Set(['example'])}/>;
if(route.endsWith('/report')||route==='/notifications')return asyncContent;
return <ParentAppShell style={{maxWidth:480,margin:'auto'}}><ParentHeader title='체험 기록' backHref='/record'/></ParentAppShell>};createRoot(document.getElementById('root')).render(<Fixture/>);`
async function main(){
await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://assets.example.test"'},
plugins: [{ name: 'readonly-fixture', setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link|cache)$/ }, a => ({ path: a.path, namespace: 'fixture' }))
    b.onResolve({filter: /\/(queries\/|require-parent-access$)/},a=>({path:a.path,namespace:'queries'}))
    b.onLoad({filter:/.*/,namespace:'queries'},a=>({contents:queryMock(a.path),loader:'js',resolveDir:root}))
    b.onResolve({ filter: /integrations\/supabase\/client$/ }, a => ({ path: a.path, namespace: 'fixture' }))
    b.onResolve({ filter: /\/actions\// }, a => ({ path: (a.path.startsWith('@/') ? path.join(root, 'src', a.path.slice(2)) : path.resolve(a.resolveDir, a.path)) + '.ts', namespace: 'action' }))
    b.onLoad({ filter: /.*/, namespace: 'action' }, a => {
      const file = ts.createSourceFile(a.path, fs.readFileSync(a.path, 'utf8'), ts.ScriptTarget.Latest, true), names = []
      for (const item of file.statements) if (item.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isFunctionDeclaration(item) && item.name) names.push(item.name.text)
        if (ts.isVariableStatement(item)) for (const d of item.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text)
      }
      return { contents: names.map(n => `export async function ${n}(...args){if(!['markNotificationRead','markReportViewed'].includes('${n}'))throw Error('Mutation forbidden');window.__fixtureActions.push({name:'${n}',args});return true}`).join('\n') }
    })
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'jsx', resolveDir: root, contents: a.path === 'next/navigation' ? `import {useSyncExternalStore} from 'react';for(const key of ['pushState','replaceState']){const orig=history[key].bind(history);history[key]=(...args)=>{orig(...args);dispatchEvent(new Event('fixture-nav'))}}const subscribe=f=>{addEventListener('fixture-nav',f);addEventListener('popstate',f);return()=>{removeEventListener('fixture-nav',f);removeEventListener('popstate',f)}};export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));export const useRouter=()=>({push:p=>history.pushState(null,'',p),replace:p=>history.replaceState(null,'',p),refresh:()=>{},back:()=>history.back()});export const unstable_rethrow=()=>{};export const notFound=()=>{throw Error('not_found')};` : a.path === 'next/link' ? `import React from 'react';export const useLinkStatus=()=>({pending:false});export default function Link({children,prefetch,onNavigate,onClick,href,replace,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();let cancelled=false;onNavigate?.({preventDefault:()=>{cancelled=true}});if(!cancelled)history[replace?'replaceState':'pushState'](null,'',href)}}>{children}</a>}` : a.path === 'next/cache' ? `export const unstable_noStore=()=>{}` : `export function getSupabaseBrowserClient(){throw Error('Network forbidden')}` }))
  } }] })
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://fixture');
    if(url.pathname==='/_next/image'){
      res.setHeader('Content-Type','image/svg+xml');res.end(url.searchParams.get('url')?.includes('broken')?'invalid-image':'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e8e1d5"/><rect x="40" y="50" width="135" height="160" rx="14" fill="#deb59c"/><circle cx="270" cy="130" r="65" fill="#84a79a"/><path d="M20 280 140 180 230 280" fill="#d4be74"/></svg>');return
    }
    const asset=['/ui.js','/ui.css'].includes(url.pathname);res.setHeader('Content-Type',asset?url.pathname.endsWith('.css')?'text/css':'text/javascript':'text/html; charset=utf-8');res.end(asset?fs.readFileSync(path.join(out,url.pathname.slice(1))):'<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><div id="root"></div><script src="/ui.js"></script></html>')
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port
  try{for(const[name,engine]of[['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch(name==='chromium'?{channel:'chrome'}:{});
    try{for(const width of [390,430,480,1280]){
      const context=await browser.newContext({viewport:{width,height:844}});await context.route('**/*',r=>new URL(r.request().url()).origin===base&&r.request().method()==='GET'?r.continue():r.abort());
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message)});
      const layout=async(title,nav)=>{
        await page.getByRole('heading',{name:title,exact:true}).waitFor();const h=await page.locator('[data-parent-header] h1').boundingBox();assert(Math.abs(h.x+h.width/2-width/2)<1,'centered header');
        const b=await page.getByRole('link',{name:'뒤로가기',exact:true}).boundingBox();assert(b.width>=44&&b.height>=44,'back touch target');
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
        const n=page.getByRole('navigation',{name:'하단 탭'});assert.equal(await n.count(),nav?1:0);
        if(nav)assert.equal(await n.getByRole('link',{name:nav,exact:true}).getAttribute('aria-current'),'page');
        for(const txt of ['김민준','모든 아이'])for(const e of await page.getByText(txt,{exact:true}).all()){if(!await e.isVisible())continue;assert.equal(await e.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return new Set([...r.getClientRects()].filter(r=>r.width).map(r=>Math.round(r.top))).size}),1,txt+' no vertical splitting')}
      }
      for(const [route,title,nav] of [['/my/schedule','내 일정','일정'],['/record','기록','기록'],['/record/example/report?child=c1','체험 리포트','기록'],['/notifications','알림',null]]){
        await page.goto(base+route);await layout(title,nav);
        if(route!='/notifications'){
          const frames=page.locator('[data-experience-thumbnail]');assert(await frames.count()>0);
          for(const frame of await frames.all()){const r=await frame.boundingBox();assert(Math.abs(r.width/r.height-4/3)<0.02,'4:3 image');}
          const img=frames.first().locator('img');await img.waitFor();await page.waitForFunction(()=>document.querySelector('[data-experience-thumbnail] img')?.naturalWidth>0);
          assert((await img.getAttribute('src')).includes('/_next/image?'));assert.equal(await img.getAttribute('loading'),'lazy');assert(['88px','96px','120px'].includes(await img.getAttribute('sizes')));
          if(route==='/record'||route==='/my/schedule'){
            await frames.nth(2).scrollIntoViewIfNeeded();await frames.nth(2).getByRole('img',{name:'이미지 없음'}).waitFor();assert.equal(await frames.nth(1).getByRole('img',{name:'이미지 없음'}).count(),1);await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));const last=await frames.last().locator('xpath=..').boundingBox(),navBox=await page.getByRole('navigation',{name:'하단 탭'}).boundingBox();assert(last.y+last.height<=navBox.y,'last row clears navigation after scrolling');await page.evaluate(()=>scrollTo(0,0));
          }
        }
        if(route.includes('/report')){
          for(const label of ['선생님이 남긴 관찰','선생님 총평','선생님이 제안한 과정 · 레벨','선생님이 제안한 일정'])assert.equal(await page.getByRole('heading',{name:label,exact:true}).count(),1);
          assert.equal(await page.getByText('보낸 피드백',{exact:true}).count(),1);assert.equal(await page.getByText('이번 체험 후, 현재 생각은 어떤가요?',{exact:true}).count(),1);
          assert.equal(await page.getByRole('link',{name:'체험 기록으로 돌아가기'}).getAttribute('href'),'/record/example?child=c1');
          await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));const feedback=page.getByText('피드백을 보냈어요. 제출한 내용은 수정할 수 없어요.',{exact:true});const f=await feedback.boundingBox(),n=await page.getByRole('navigation',{name:'하단 탭'}).boundingBox();assert(f.y+f.height<=n.y,'last content clears nav');await page.evaluate(()=>scrollTo(0,0));
        }
        if(route==='/notifications'){
          assert.equal(await page.locator('article').count(),0,'no separate report card');assert.equal(await page.getByRole('img',{name:'읽지 않은 알림'}).count(),2);
          const notices=page.locator('li > a');assert.equal(await notices.count(),6);
          await notices.first().click();await page.waitForURL(base+'/record/example/report');assert((await page.evaluate(()=>window.__fixtureActions)).some(x=>x.name==='markNotificationRead'&&x.args[0]==='notice-0'));await page.goto(base+route);await layout(title,nav);
        }
        await page.screenshot({path:path.join(out,`${name}-${width}-${title}.png`),fullPage:true});results.push({name,width,route,result:'PASS'});
      }
      await page.goto(base+'/my/schedule?child=c1&filter=keep');await page.getByRole('tab',{name:/완료/}).click();assert.equal(await page.getByRole('tab',{name:/완료/}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('[data-experience-thumbnail]').count(),2);
      await page.getByRole('button',{name:/김민준/}).click();await page.getByRole('button',{name:'모든 아이',exact:true}).click();await page.waitForFunction(()=>!new URLSearchParams(location.search).has('child'));assert.equal(new URL(page.url()).searchParams.get('filter'),'keep');
      await page.goto(base+'/record?child=c1');await page.getByRole('link',{name:/리포트 보기/}).click();await page.waitForURL(/\/record\/example\/report\?/);assert.equal(new URL(page.url()).searchParams.get('child'),'c1');await page.getByRole('link',{name:'뒤로가기',exact:true}).click();await page.waitForURL(base+'/record?child=c1');
      for(const [route,title,nav] of [['/my/schedule','내 일정','일정'],['/record','기록','기록'],['/record/example/report','체험 리포트','기록'],['/notifications','알림',null]])for(const state of ['empty','error']){
        await page.goto(base+route+'?state='+state);await layout(title,nav);assert.equal(await page.locator('[data-experience-thumbnail]').count(),0);
        assert((await page.locator('main').innerText()).includes(state==='error'?'불러오지 못했어요':'없어요'));results.push({name,width,route,state,result:'PASS'});
      }
      assert.deepEqual(errors,[],'no runtime errors');await context.close();console.log('PASS',name,width,'four screens, thumbnails/fallback, center/back, child query, tabs, report/feedback, notification reads, empty/error');
    }}finally{await browser.close()}
  }}finally{server.close()}
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results},null,2));console.log('Evidence:',out)
}
main().catch(e=>{console.error(e);process.exitCode=1})
