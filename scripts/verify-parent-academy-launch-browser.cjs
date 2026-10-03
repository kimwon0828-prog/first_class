// Actual academy components / Next Image, isolated read-only data; Chromium + WebKit.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript')
const {build}=require(process.env.ESBUILD_MODULE_PATH||'esbuild')
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright')
const root=process.cwd(),out=process.env.ACADEMY_EVIDENCE||fs.mkdtempSync('/tmp/academy-launch-browser-'),results=[]
fs.mkdirSync(out,{recursive:true})
const queryMock=p=>{throw Error('Unexpected query: '+p)}
const entry=`
import React from 'react';import{createRoot}from'react-dom/client';import{usePathname,useSearchParams}from'next/navigation';
import{AcademiesFrame}from'./src/features/academies/ui/academies-frame';import{AcademiesExplorer}from'./src/features/academies/ui/academies-explorer';
import{ParentAppShell}from'./src/features/classes/ui/parent-app-shell';import{ParentHeader}from'./src/features/classes/ui/parent-header';import './app/globals.css';
const logo='https://assets.example.test/storage/v1/object/public/academy-profile-assets/valid.png';
const rows=['valid','missing','broken'].map((id,i)=>({id,displayName:['첫수업 검수학원 중계센터','로고 없는 학원','이미지 실패 학원'][i],logoImageUrl:i===1?null:logo.replace('valid',id),sido:'서울',sigungu:'노원구',bname:'중계동',address:'서울 노원구 중계로 123',subjectTags:['예체능','창의사고력'],targetAgeSummary:'초등학교 1~3학년',representativeClasses:[]}));
const catalog=[{id:'cat',code:'arts',name:'예체능',subjects:[{id:'sub',code:'art',name:'미술',categoryId:'cat'}]}];
function Fixture(){const route=usePathname(),params=useSearchParams(),q=params.get('q')||'',mode=params.get('state');if(route.startsWith('/academy/'))return <ParentAppShell><ParentHeader title='학원 정보'/></ParentAppShell>;
return <AcademiesFrame><AcademiesExplorer academies={mode==='empty'?[]:rows.filter(r=>r.displayName.includes(q))} error={mode==='error'} initialQuery={q} subjectCatalog={catalog} selectedSubjectCategory={params.has('subjectCategory')?catalog[0]:null} selectedSubject={null} selectedSubjectLabel='예체능' selectedGrade={params.get('grade')} selectedGradeLabel='초등 저학년' selectedSort={params.get('sort')||'recommended'} sortDisabledReasonLabel={null}/></AcademiesFrame>};createRoot(document.getElementById('root')).render(<Fixture/>);`
async function main(){await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://assets.example.test"'},
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
      return { contents: names.map(n => `export async function ${n}(...args){throw Error('Mutation forbidden: ${n}')}`).join('\n') }
    })
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'jsx', resolveDir: root, contents: a.path === 'next/navigation' ? `import {useSyncExternalStore} from 'react';for(const key of ['pushState','replaceState']){const orig=history[key].bind(history);history[key]=(...args)=>{orig(...args);dispatchEvent(new Event('fixture-nav'))}}const subscribe=f=>{addEventListener('fixture-nav',f);addEventListener('popstate',f);return()=>{removeEventListener('fixture-nav',f);removeEventListener('popstate',f)}};export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));export const useRouter=()=>({push:p=>history.pushState(null,'',p),replace:p=>history.replaceState(null,'',p),refresh:()=>{},back:()=>history.back()});export const unstable_rethrow=()=>{};export const notFound=()=>{throw Error('not_found')};` : a.path === 'next/link' ? `import React from 'react';export const useLinkStatus=()=>({pending:false});export default function Link({children,prefetch,onNavigate,onClick,href,replace,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();let cancelled=false;onNavigate?.({preventDefault:()=>{cancelled=true}});if(!cancelled)history[replace?'replaceState':'pushState'](null,'',href)}}>{children}</a>}` : a.path === 'next/cache' ? `export const unstable_noStore=()=>{}` : `export function getSupabaseBrowserClient(){throw Error('Network forbidden')}` }))
  } }] })
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://fixture');
    if(url.pathname==='/_next/image'){
      res.setHeader('Content-Type','image/svg+xml');res.end(url.searchParams.get('url')?.includes('broken')?'invalid-image':'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect width="400" height="120" fill="#e8e1d5"/><rect x="40" y="50" width="135" height="160" rx="14" fill="#deb59c"/><circle cx="270" cy="130" r="65" fill="#84a79a"/><path d="M20 280 140 180 230 280" fill="#d4be74"/></svg>');return
    }
    const asset=['/ui.js','/ui.css'].includes(url.pathname);res.setHeader('Content-Type',asset?url.pathname.endsWith('.css')?'text/css':'text/javascript':'text/html; charset=utf-8');res.end(asset?fs.readFileSync(path.join(out,url.pathname.slice(1))):'<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><div id="root"></div><script src="/ui.js"></script></html>')
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port
 try{for(const[name,engine]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(name==='chromium'?{channel:'chrome'}:{});try{for(const width of[390,430,480,1280]){
 const context=await browser.newContext({viewport:{width,height:844}});await context.route('**/*',r=>new URL(r.request().url()).origin===base&&r.request().method()==='GET'?r.continue():r.abort());
 const page=await context.newPage(),errors=[],images=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.resourceType()==='image')images.push(r.url())});
 await page.goto(base+'/academies?child=child-a&returnTo=%2Fclasses');await page.getByRole('heading',{name:'노원구 학원 찾기',exact:true}).waitFor();
 const h=await page.locator('[data-parent-header] h1').boundingBox();assert(Math.abs(h.x+h.width/2-width/2)<1);const back=await page.getByRole('link',{name:'뒤로가기',exact:true}).boundingBox();assert(back.width>=44&&back.height>=44);
 assert.equal(await page.locator('[data-parent-launch-location]').textContent(),'노원구');assert.equal(await page.getByRole('button',{name:'위치 설정 열기'}).count(),0);assert.equal(await page.getByText('첫수업은 현재 노원구에서 먼저 만나보실 수 있어요.').count(),1);
 const img=page.getByAltText('첫수업 검수학원 중계센터 로고');await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth>0);assert((await img.getAttribute('src')).includes('/_next/image?'));assert.equal(await img.getAttribute('sizes'),'56px');assert.equal(await img.getAttribute('loading'),'lazy');assert.equal(await img.evaluate(e=>getComputedStyle(e).objectFit),'contain');
 const frame=await img.locator('..').boundingBox();assert.equal(frame.width,56);assert.equal(frame.height,56);assert.equal(await page.getByRole('img',{name:'로고 없는 학원 로고 없음'}).count(),1);await page.getByRole('img',{name:'이미지 실패 학원 로고 없음'}).waitFor();
 for(const row of await page.locator('li>a').all()){const r=await row.boundingBox();assert(r.width<=440);const icon=await row.locator(':scope > span').first().boundingBox();assert.equal(icon.width,56);assert.equal(icon.x,frame.x)}
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.getByRole('navigation',{name:'하단 탭'}).locator('[aria-current="page"]').count(),0);assert.equal(images.length,2,'one valid / one broken request; no missing-image request');
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const last=await page.locator('li>a').last().boundingBox(),nav=await page.getByRole('navigation',{name:'하단 탭'}).boundingBox();assert(last.y+last.height<=nav.y,'last academy clears Nav');await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:path.join(out,name+'-'+width+'.png'),fullPage:true});await img.click();await page.waitForURL(/\/academy\/valid/);assert.equal(new URL(page.url()).searchParams.get('returnTo'),'/academies?child=child-a&returnTo=%2Fclasses');await page.getByRole('link',{name:'뒤로가기',exact:true}).click();await page.waitForURL(base+'/academies?child=child-a&returnTo=%2Fclasses');
 await page.getByRole('textbox').fill('없는');await page.getByRole('textbox').press('Enter');await page.waitForFunction(()=>new URLSearchParams(location.search).get('q')==='없는');assert.equal(new URL(page.url()).searchParams.get('child'),'child-a');assert.equal(await page.locator('li>a').count(),1);await page.getByRole('textbox').fill('일산');await page.getByRole('textbox').press('Enter');await page.getByRole('heading',{name:'조건에 맞는 학원을 찾지 못했어요.'}).waitFor();
 await page.goto(base+'/academies?child=child-a&returnTo=%2Fclasses');await page.getByRole('button',{name:'학년 선택 열기'}).click();await page.getByRole('option',{name:'초1~2',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('child'),'child-a');assert(new URL(page.url()).searchParams.get('grade'));
 await page.getByRole('button',{name:'정렬 선택 열기'}).click();await page.getByRole('option',{name:'이름순',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('sort'),'name');assert(new URL(page.url()).searchParams.get('grade'));
 await page.getByRole('button',{name:'과목 선택 열기'}).click();await page.getByRole('option',{name:'예체능',exact:true}).click();await page.getByRole('option',{name:'예체능 전체',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('subjectCategory'),'arts');assert.equal(new URL(page.url()).searchParams.get('sort'),'name');assert.equal(new URL(page.url()).searchParams.get('returnTo'),'/classes');
 await page.goto(base+'/academies?state=error');await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'다시 시도하기'}).count(),1);assert.deepEqual(errors,[]);results.push({name,width,result:'PASS',contracts:'logo/fallback/contain/56px/query/search/subject/grade/sort/back/header/nav/overflow/error'});await context.close()
 }}finally{await browser.close()}
 }}finally{await new Promise(r=>server.close(r))}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS '+results.length+' Chromium/WebKit viewport suites. Evidence: '+out)
}
main().catch(e=>{console.error(e);process.exitCode=1})
