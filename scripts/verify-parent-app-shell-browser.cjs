// Real shared frames/styles rendered with fixture content and inert action transport.
// External requests are blocked. Protected account/DB flows are not exercised here.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const ts = require('typescript')
const { build } = require(process.env.ESBUILD_MODULE_PATH || 'esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = process.cwd(), out = fs.mkdtempSync('/tmp/parent-shell-browser-')
const imports = [
 ['MyFrame','app/my/my-frame'], ['MyHub','src/features/my/ui/my-hub'],
 ['ChildrenFrame','src/features/children/ui/children-frame'], ['ApplicationsFrame','app/my/applications/applications-frame'],
 ['FavoritesFrame','app/favorites/favorites-frame'], ['AcademiesFrame','src/features/academies/ui/academies-frame'],
 ['AcademyDetailFrame','src/features/academies/ui/academy-detail-frame'], ['NotificationsFrame','src/features/notifications/ui/notifications-frame'],
 ['ReportFrame','app/record/[experienceId]/report/report-frame'], ['EducationProfileFrame','app/record/profile/profile-frame'],
 ['RecordFrame','src/features/record/ui/record-home'], ['ScheduleFrame','src/features/schedule/ui/parent-schedule-screen'],
 ['ParentAppShell','src/features/classes/ui/parent-app-shell'], ['ParentHeader','src/features/classes/ui/parent-header'],
 ['ParentDetailLink','src/features/classes/ui/parent-detail-link']
].map(([name,file])=>`import {${name}} from './${file}';`).join('\n')
const entry = `${imports}
import React from 'react'; import {createRoot} from 'react-dom/client'; import {usePathname} from 'next/navigation';
import './app/globals.css'; import home from './app/page.module.css'; import detail from './app/classes/[id]/page.module.css'; import record from './app/record/[experienceId]/page.module.css';
const body=<div data-fixture-body style={{padding:20}}><ParentDetailLink href='/classes/sample'>수업 상세 fixture</ParentDetailLink><ParentDetailLink href='/academy/sample'>학원 상세 fixture</ParentDetailLink><ParentDetailLink href='/record/sample'>기록 상세 fixture</ParentDetailLink><div style={{height:900}}>본문 디자인 검증용 자리</div><button data-last style={{minHeight:48}}>마지막 콘텐츠</button></div>;
function Fixture(){const route=usePathname();
 if(route==='/my')return <MyFrame><MyHub profile={{id:'fixture',name:'검수 학부모',phone:'01012345678',parentBirthDate:'1990-01-02'}} email='parent@example.test' childrenCount={2} childrenError={null}/></MyFrame>;
 const frames={'/my/children':ChildrenFrame,'/my/applications':ApplicationsFrame,'/favorites':FavoritesFrame,'/academies':AcademiesFrame,'/academy/sample':AcademyDetailFrame,'/notifications':NotificationsFrame,'/record/sample/report':ReportFrame,'/record/profile':EducationProfileFrame,'/record':RecordFrame,'/my/schedule':ScheduleFrame};
 const Frame=frames[route];if(Frame)return <Frame>{body}</Frame>;
 const isClass=route==='/classes/sample',isRecord=route==='/record/sample';const css=isClass?detail:isRecord?record:home;
 return <ParentAppShell className={css.page}><div className={css.shell}>
 <ParentHeader inset={!isRecord} title={isClass?'수업 상세':isRecord?'체험 기록':'수업찾기'} backHref={isClass?'/classes':isRecord?'/record':undefined}
 brand={route==='/'?<a href='/' aria-label='첫수업 홈'>첫수업</a>:undefined}
 actions={<a href='/notifications' aria-label={isClass?'관심수업':'알림'}>♡</a>}/>{body}</div>
 {isClass?<div data-cta className={detail.fixedCta}><button className={detail.ctaButton}>신청하기 fixture</button></div>:null}</ParentAppShell>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`
const navigation = `import {useSyncExternalStore} from 'react';
for(const key of ['pushState','replaceState']){const original=history[key].bind(history);history[key]=(...args)=>{original(...args);dispatchEvent(new Event('fixture-navigation'));};}
function subscribe(fn){addEventListener('popstate',fn);addEventListener('fixture-navigation',fn);return()=>{removeEventListener('popstate',fn);removeEventListener('fixture-navigation',fn)}}
export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname)}
export function useSearchParams(){return new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search))}
export function useRouter(){return {back:()=>history.back(),push:p=>history.pushState(null,'',p),replace:p=>history.replaceState(null,'',p),refresh:()=>{}}}
export function unstable_rethrow(e){if(e?.digest?.startsWith('NEXT_'))throw e;}`
async function main(){
 await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'inert-fixtures',setup(b){
  b.onResolve({filter:/^next\/(navigation|link|image)$/},a=>({path:a.path,namespace:'fixture'}))
  b.onResolve({filter:/integrations\/supabase\/client$/},a=>({path:a.path,namespace:'fixture'}))
  b.onResolve({filter:/\/actions\//},a=>{
    const file=a.path.startsWith('@/')?path.join(root,'src',a.path.slice(2)):path.resolve(a.resolveDir,a.path)
    return {path:file+'.ts',namespace:'inert-action'}
  })
  b.onLoad({filter:/.*/,namespace:'inert-action'},a=>{
    const source=ts.createSourceFile(a.path,fs.readFileSync(a.path,'utf8'),ts.ScriptTarget.Latest,true)
    const names=[];for(const item of source.statements){if(!item.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;if(ts.isFunctionDeclaration(item)&&item.name)names.push(item.name.text);if(ts.isVariableStatement(item))for(const d of item.declarationList.declarations)if(ts.isIdentifier(d.name))names.push(d.name.text)}
    return {contents:names.map(n=>`export async function ${n}(){throw Error('Mutation forbidden in shell verifier')}`).join('\n')}
  })
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'jsx',resolveDir:root,contents:a.path==='next/navigation'?navigation:a.path==='next/link'?`import React from 'react';export function useLinkStatus(){return {pending:false}};export default function Link({href,children,prefetch,scroll,replace,onClick,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||props.target==='_blank')return;e.preventDefault();history[replace?'replaceState':'pushState'](null,'',href);}}>{children}</a>}`:a.path==='next/image'?`import React from 'react';export default function Image({fill,priority,unoptimized,...props}){return <img {...props}/>} `:`export function getSupabaseBrowserClient(){throw Error('Auth access forbidden in shell verifier')}` }))
 }}]})
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/my/profile')){const query=new URL(req.url,'http://fixture').searchParams;query.set('edit','profile');res.writeHead(307,{Location:'/my?'+query});return res.end()}
  const file=req.url==='/ui.js'||req.url==='/ui.css'?req.url:null
  res.setHeader('Content-Type',file?(file.endsWith('css')?'text/css':'text/javascript'):'text/html; charset=utf-8')
  res.end(file?fs.readFileSync(path.join(out,file.slice(1))):'<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><div id="root"></div><script src="/ui.js"></script></html>')
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`
 let browser;const results=[]
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:390,height:844}})
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort())
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  const matrix=[['/','홈','home'],['/classes',null,'root'],['/classes/sample',null,'detail'],['/academies',null,'root'],['/academy/sample',null,'detail'],['/favorites',null,'root'],['/my/schedule','일정','root'],['/record','기록','root'],['/record/sample','기록','detail'],['/record/sample/report','기록','detail'],['/record/profile','기록','detail'],['/my','마이페이지','root'],['/my/children','마이페이지','detail'],['/my/applications','마이페이지','detail'],['/notifications',null,'detail']]
  for(const width of [390,430,480,1280]){
   await page.setViewportSize({width,height:844})
   for(const [url,active,header] of matrix){
    await page.goto(base+url);await page.locator('[data-parent-header]').waitFor()
    assert.equal(await page.locator('[data-parent-app-shell]').count(),1,url)
    assert.equal(await page.locator('[data-parent-header]').count(),1,url)
    assert.equal(await page.locator('[data-parent-header]').getAttribute('data-parent-header'),header,url)
    const nav=page.getByRole('navigation',{name:'하단 탭'});assert.equal(await nav.count(),url==='/notifications'?0:1,url)
    if(url!=='/notifications'){if(active)assert.equal(await nav.locator('[aria-current="page"]').innerText(),active,url);else assert.equal(await nav.locator('[aria-current="page"]').count(),0,url);assert.equal(await nav.locator('a').count(),4)
      for(const link of await nav.locator('a').all()){const b=await link.boundingBox();assert(b.width>=44&&b.height>=44,url)}
      const box=await nav.boundingBox();assert(box.width<=480&&Math.abs(box.x+box.width/2-width/2)<1,url)
    }
    const hb=await page.locator('[data-parent-header]').boundingBox();assert(hb.height<=90&&hb.width<=480,url)
    for(const action of await page.locator('[data-parent-header] a,[data-parent-header] button').all()){const b=await action.boundingBox();assert(b.width>=44&&b.height>=44,url)}
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),url)
    if(url!=='/notifications'&&await page.locator('[data-last]').count()){
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));if(url==='/classes/sample'){await page.waitForTimeout(50);await page.evaluate(()=>window.scrollBy(0,-16));await page.waitForTimeout(220)}const last=await page.locator('[data-last]').boundingBox(),nb=await nav.boundingBox();assert(last.y+last.height<=nb.y,url+' last content behind nav')
    }
    if(url==='/classes/sample'){const cta=await page.locator('[data-cta]').boundingBox(),nb=await nav.boundingBox();assert(cta.y+cta.height<=nb.y,url+' CTA behind nav')}
    if(['/','/classes/sample','/my','/record/sample/report'].includes(url))await page.screenshot({path:path.join(out,`${url.replaceAll('/','-')||'home'}-${width}.png`)})
   }
   results.push(`15 routes at ${width}px: single shell/header, active, 44px actions, centered nav, no overflow/overlap`)
  }
  await page.goto(base+'/classes?q=piano&subject=music&child=owned-child')
  await page.getByRole('link',{name:'수업 상세 fixture',exact:true}).click();await page.waitForURL('**/classes/sample?**')
  assert.equal(new URL(page.url()).searchParams.get('child'),'owned-child')
  await page.getByRole('link',{name:'뒤로가기',exact:true}).click();assert.equal(new URL(page.url()).search,'?q=piano&subject=music&child=owned-child')
  await page.getByRole('link',{name:'학원 상세 fixture',exact:true}).click();await page.getByRole('link',{name:'뒤로가기',exact:true}).click();assert.equal(new URL(page.url()).search,'?q=piano&subject=music&child=owned-child')
  await page.goto(base+'/my/schedule?child=owned-child');await page.getByRole('link',{name:'기록 상세 fixture',exact:true}).click();await page.getByRole('link',{name:'뒤로가기',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/my/schedule');assert.equal(new URL(page.url()).search,'?child=owned-child')
  await page.goto(base+'/record/sample?child=owned-child&returnTo=%2Frecord&edit=ignored');await page.getByRole('navigation',{name:'하단 탭'}).getByRole('link',{name:'마이페이지',exact:true}).click();await page.waitForURL('**/my?child=owned-child');await page.getByRole('button',{name:'내 정보 수정하기'}).click();const dialog=page.getByRole('dialog',{name:'내 정보 수정'});await dialog.waitFor();assert.equal(new URL(page.url()).searchParams.get('child'),'owned-child');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(new URL(page.url()).search,'?child=owned-child')
  await page.goto(base+'/my/profile?child=owned-child');await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(new URL(page.url()).search,'?child=owned-child')
  await page.goto(base+'/classes/sample?returnTo=https%3A%2F%2Fevil.test');assert.equal(await page.getByRole('link',{name:'뒤로가기',exact:true}).getAttribute('href'),'/classes')
  await page.locator('[data-parent-header] h1').evaluate(e=>e.textContent='아주 긴 제목 '.repeat(40));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  results.push('query/back: Classes filters, Academy source, Schedule child, detail-to-tab whitelist, My edit/alias close, external return rejection, long title truncation')
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors,note:'Frame fixtures, no authenticated DB integration'},null,2));console.log(results.map(s=>'PASS '+s).join('\n'));console.log('Evidence: '+out)
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1})
