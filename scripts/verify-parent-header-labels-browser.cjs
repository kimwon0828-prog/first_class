// Actual Parent components, inert server actions, and external requests blocked.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), ts = require('typescript')
const { build } = require(process.env.ESBUILD_MODULE_PATH || 'esbuild')
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = process.cwd(), out = process.env.PARENT_LABEL_EVIDENCE || fs.mkdtempSync('/tmp/parent-label-browser-'), results = []
fs.mkdirSync(out, { recursive: true })
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';import Link from 'next/link';import {usePathname,useSearchParams} from 'next/navigation';
import {ParentAppShell} from './src/features/classes/ui/parent-app-shell';import {ParentHeader} from './src/features/classes/ui/parent-header';import {ParentDetailLink} from './src/features/classes/ui/parent-detail-link';
import {HomeChildSelector} from './src/features/children/ui/home-child-selector';import {ParentScheduleScreen} from './src/features/schedule/ui/parent-schedule-screen';import {RecordHome} from './src/features/record/ui/record-home';
import './app/globals.css';import home from './app/page.module.css';
const children=[{id:'c1',name:'김민준',grade:'초등학교 3학년'},{id:'c2',name:'이서준',grade:'초등학교 1학년'}];
const card={id:'example',startAt:'2099-01-01T05:00:00Z',dateKey:'2099-01-01',title:'아이의 생각을 키우는 즐거운 체험수업',academy:'첫수업 학원',address:'서울특별시 강남구 체험로 123',childName:'김민준',href:'/record/example'};
const experience={id:'example',childId:'c1',childName:'김민준',classTitle:card.title,academyName:card.academy,programType:'trial_class',status:'completed',completedAt:card.startAt,confirmedSlotAt:card.startAt,createdAt:card.startAt};
function Fixture(){const route=usePathname(),params=useSearchParams(),selected=params.get('child');
if(route==='/my/schedule')return <ParentScheduleScreen model={{upcoming:[card],completed:[card]}} childOptions={children} selectedChildId={selected} today='2099-01-01'/>;
if(route==='/record')return <RecordHome experiences={[experience]} childOptions={children} selectedChildId={selected} error={null}/>;
return <ParentAppShell className={home.page}><div className={home.shell}><ParentHeader inset title={route==='/'?undefined:route==='/record/example'?'체험 기록':'마이페이지'} brand={route==='/'?<Link href='/'>첫수업</Link>:undefined} backHref={route==='/record/example'?'/record':undefined} actions={route==='/my'?<><button>도움말</button><button>알림</button></>:undefined}/>
{route==='/'?<div className={home.experience}><div className={home.headerContext}><div>서울 강남구</div><div className={home.childContext}><HomeChildSelector options={children} selectedChildId={selected} className={home.childChip} labelClassName={home.childChipLabel}/></div></div></div>:<p>긴 본문 설명은 모바일 화면의 가용 너비 안에서 정상적으로 다음 줄로 이어져야 합니다.</p>}
<ParentDetailLink href='/record/example'>체험 기록 열기</ParentDetailLink></div></ParentAppShell>};createRoot(document.getElementById('root')).render(<Fixture/>);`
async function main() {
  await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'readonly-fixture', setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, a => ({ path: a.path, namespace: 'fixture' }))
    b.onResolve({ filter: /integrations\/supabase\/client$/ }, a => ({ path: a.path, namespace: 'fixture' }))
    b.onResolve({ filter: /\/actions\// }, a => ({ path: (a.path.startsWith('@/') ? path.join(root, 'src', a.path.slice(2)) : path.resolve(a.resolveDir, a.path)) + '.ts', namespace: 'action' }))
    b.onLoad({ filter: /.*/, namespace: 'action' }, a => {
      const file = ts.createSourceFile(a.path, fs.readFileSync(a.path, 'utf8'), ts.ScriptTarget.Latest, true), names = []
      for (const item of file.statements) if (item.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isFunctionDeclaration(item) && item.name) names.push(item.name.text)
        if (ts.isVariableStatement(item)) for (const d of item.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text)
      }
      return { contents: names.map(n => `export async function ${n}(){throw Error('Mutation forbidden in header/label verifier')}`).join('\n') }
    })
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'jsx', resolveDir: root, contents: a.path === 'next/navigation' ? `import {useSyncExternalStore} from 'react';for(const key of ['pushState','replaceState']){const orig=history[key].bind(history);history[key]=(...args)=>{orig(...args);dispatchEvent(new Event('fixture-nav'))}}const subscribe=f=>{addEventListener('fixture-nav',f);addEventListener('popstate',f);return()=>{removeEventListener('fixture-nav',f);removeEventListener('popstate',f)}};export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));export const useRouter=()=>({push:p=>history.pushState(null,'',p),replace:p=>history.replaceState(null,'',p),refresh:()=>{},back:()=>history.back()});export const unstable_rethrow=()=>{};` : a.path === 'next/link' ? `import React from 'react';export const useLinkStatus=()=>({pending:false});export default function Link({children,prefetch,onNavigate,onClick,href,replace,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();let cancelled=false;onNavigate?.({preventDefault:()=>{cancelled=true}});if(!cancelled)history[replace?'replaceState':'pushState'](null,'',href)}}>{children}</a>}` : a.path === 'next/image' ? `import React from 'react';export default function Image({fill,unoptimized,priority,...props}){return <img {...props}/ >}` : `export function getSupabaseBrowserClient(){throw Error('Network forbidden')}` }))
  } }] })
  const server = http.createServer((req, res) => {
    const asset = ['/ui.js', '/ui.css'].includes(req.url)
    res.setHeader('Content-Type', asset ? req.url.endsWith('.css') ? 'text/css' : 'text/javascript' : 'text/html; charset=utf-8')
    res.end(asset ? fs.readFileSync(path.join(out, req.url.slice(1))) : '<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><div id="root"></div><script src="/ui.js"></script></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));const base = 'http://127.0.0.1:' + server.address().port
  try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
      const browser = await engine.launch(name === 'chromium' ? { channel: 'chrome' } : {})
      try { for (const width of [390, 430, 1280]) {
        const c = await browser.newContext({ viewport: { width, height: 844 } });await c.route('**/*', r => new URL(r.request().url()).origin === base && r.request().method() === 'GET' ? r.continue() : r.abort())
        const page = await c.newPage(), errors = [];page.on('pageerror', x => errors.push(x.message))
        const checkNoSplit=async()=>{
          for(const text of ['김민준','모든 아이','우리 아이 2명'])for(const label of await page.getByText(text,{exact:true}).all()){
            if(!await label.isVisible())continue;
            const lines=await label.evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);return new Set([...r.getClientRects()].filter(b=>b.width>0).map(b=>Math.round(b.top))).size});assert.equal(lines,1,text+' must fit one line');
          }
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
        };
        for(const route of ['/', '/my/schedule', '/my/schedule?child=c1', '/record', '/record?child=c1', '/my']) {
          await page.goto(base+route);await page.locator('[data-parent-header]').waitFor();
          const title=page.locator('[data-parent-header] h1');
          if(await title.count()){
            const b=await title.boundingBox();assert(Math.abs(b.x+b.width/2-width/2)<1,'Title at viewport center');
            const back=page.getByRole('link',{name:'뒤로가기',exact:true});const r=await back.boundingBox();assert(r.width>=44&&r.height>=44);assert(r.x+r.width<=b.x,'Back does not overlap title');
            for(const action of await page.locator('[data-parent-header] button').all()){const a=await action.boundingBox();assert(a.x>=b.x+b.width,'Right actions do not overlap title')}
          }else assert.equal(await page.getByRole('link',{name:'뒤로가기',exact:true}).count(),0,'Home brand has no back');
          await checkNoSplit();await page.screenshot({path:path.join(out,name+'-'+width+'-'+route.replace(/[^a-z0-9]/gi,'_')+'.png')});results.push({engine:name,width,route,status:'PASS'});
        }
        await page.goto(base+'/record?child=c1&region=seoul&filter=keep');await page.getByRole('button',{name:/김민준/,exact:false}).click();
        await page.getByRole('button',{name:'모든 아이',exact:true}).click();await page.waitForFunction(()=>!new URLSearchParams(location.search).has('child'));assert.equal(new URL(page.url()).searchParams.get('region'),'seoul');assert.equal(new URL(page.url()).searchParams.get('filter'),'keep');await checkNoSplit();
        await page.getByRole('button',{name:'모든 아이',exact:true}).click();await page.getByRole('button',{name:'김민준 · 초등학교 3학년',exact:true}).click();await page.waitForFunction(()=>new URLSearchParams(location.search).get('child')==='c1');await checkNoSplit();
        await page.goto(base+'/?child=c1');const nav=page.getByRole('navigation',{name:'하단 탭'});await nav.getByRole('link',{name:'일정',exact:true}).click();await page.getByRole('heading',{name:'내 일정',exact:true}).waitFor();
        await nav.getByRole('link',{name:'기록',exact:true}).click();await page.getByRole('heading',{name:'기록',exact:true}).waitFor();await page.getByRole('link',{name:'뒤로가기',exact:true}).click();await page.waitForURL(base+'/my/schedule?child=c1');await page.getByRole('link',{name:'뒤로가기',exact:true}).click();await page.waitForURL(base+'/?child=c1');
        // A fresh document with older history still has no proof of a safe Parent predecessor.
        await page.goto(base+'/my');await page.goto(base+'/record?child=c1&returnTo=https%3A%2F%2Fevil.example');await page.getByRole('link',{name:'뒤로가기',exact:true}).click();await page.waitForURL(base+'/?child=c1');
        // Existing explicit detail returnTo contract and query survive.
        await page.goto(base+'/?child=c1');await page.getByRole('link',{name:'체험 기록 열기',exact:true}).click();await page.getByRole('heading',{name:'체험 기록',exact:true}).waitFor();await page.getByRole('link',{name:'뒤로가기',exact:true}).click();await page.waitForURL(base+'/?child=c1');
        console.log(name,width,'PASS center/44px/labels/child query/tab history/direct fallback/detail back');
        assert.deepEqual(errors, []);await c.close();
      } } finally { await browser.close() }
    }
  } finally { server.close() }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results }, null, 2))
  console.log('Evidence:', out)
}
main().catch(e => { console.error(e);process.exitCode = 1 })
