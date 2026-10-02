// Actual Parent components, inert server actions, and external requests blocked.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), ts = require('typescript')
const { build } = require(process.env.ESBUILD_MODULE_PATH || 'esbuild')
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = process.cwd(), out = process.env.PARENT_GREEN_EVIDENCE || fs.mkdtempSync('/tmp/parent-green-browser-'), results = []
fs.mkdirSync(out, { recursive: true })
const rgb = hex => hex.match(/../g).map(c => parseInt(c, 16))
const luminance = c => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0)
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
const colors = { brand: '2AAD38', action: '21882C', hover: '20822A', pressed: '1F7E29' }
for (const role of ['action', 'hover', 'pressed']) assert(contrast(rgb(colors[role]), [255, 255, 255]) >= 4.5)
assert(contrast(rgb(colors.brand), [255, 255, 255]) < 4.5)
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';import {ParentAppShell} from './src/features/classes/ui/parent-app-shell';import {ParentHeader} from './src/features/classes/ui/parent-header';
import {HomeReportCta} from './src/features/classes/ui/home-report-cta';import {ClassDetailApplicationSheet} from './src/features/applications/ui/class-detail-application-sheet';import {ApplyForm} from './src/features/applications/ui/apply-form';import {BookmarkButton} from './src/features/favorites/ui/bookmark-button';
import {MyHub} from './src/features/my/ui/my-hub';import {MyFrame} from './app/my/my-frame';import {RecordHome} from './src/features/record/ui/record-home';import {FavoritesClient} from './app/favorites/favorites-client';
import './app/globals.css';import home from './app/page.module.css';import detail from './app/classes/[id]/page.module.css';import apply from './app/classes/[id]/apply/page.module.css';import feedback from './src/features/feedback/ui/feedback.module.css';import schedule from './src/features/schedule/ui/parent-schedule-screen.module.css';
const props={classId:'fixture',classTargetAge:'elem_3_4',availableSlots:[{id:'slot',optionId:'slot',source:'class_schedule',classScheduleId:'slot',startAt:'2099-01-01T05:00:00Z',endAt:'2099-01-01T06:00:00Z',remainingCount:5,capacity:5,appliedCount:0,isClosed:false}],slotsError:null,childProfiles:[{id:'own-child',parentId:'fixture',name:'검수 아이',grade:'elem_3',schoolName:'검수 학교'}],childProfilesError:null,parentName:'검수 부모',parentPhone:'01012345678'};
function Fixture(){const route=location.pathname;
if(route==='/studio-fixture')return <button className={feedback.button}>Shared Studio sentinel</button>;
if(route==='/apply')return <main className={apply.page}><div className={apply.shell}><ApplyForm {...props}/></div></main>;
if(route==='/my')return <MyFrame><MyHub profile={{id:'fixture',name:'검수 부모',phone:'01012345678',parentBirthDate:'1990-01-02'}} email='fixture@example.test' childrenCount={1} childrenError={null}/></MyFrame>;
if(route==='/record')return <RecordHome experiences={[]} childOptions={[]} selectedChildId={null} error={null}/>;
if(route==='/favorites')return <FavoritesClient allClasses={[]} queryError={null} favoritesEnabled scheduleEntryHref='/my/schedule' recordEntryHref='/record' myPageEntryHref='/my' studioHref='/studio'/>;
return <ParentAppShell className={route==='/'?home.page:detail.page} data-parent-class-detail={route!=='/'||undefined}><div className={home.shell}><ParentHeader title={route==='/'?'첫수업':'수업 상세'}/>
{route==='/'?<><h1 className={home.hero}>우리 아이에게 맞는<br/><span>수업의 시작</span></h1><HomeReportCta report={{id:'fixture',kind:'experience_reflection',title:'이번 체험은 어떠셨나요?',description:'아이의 체험 경험을 남겨주세요.',childName:'검수 아이',classTitle:'검수 수업',ctaLabel:'피드백 남기기',href:'/record/fixture/report#experience-feedback'}}/><HomeReportCta report={{id:'report',kind:'report_review',title:'체험 리포트가 도착했어요',description:'선생님이 남긴 관찰을 확인해보세요.',childName:'검수 아이',classTitle:'검수 수업',ctaLabel:'리포트 확인하기',href:'/record/fixture/report'}}/><div data-status className={schedule.upcoming}>예정 상태 색상 유지</div></>:<><h1>검수 수업</h1><p>체험수업 신청과 관심수업</p><ClassDetailApplicationSheet {...props} classTitle='검수 수업' academyName='검수 학원' trialPriceLabel='무료 체험수업' hasSession isParentUser signInHref='/auth/sign-in' secondaryAction={<BookmarkButton classId='fixture' className={detail.dockFavorite} activeClassName={detail.favoriteActive} variant='heart'/>} fixedCtaClassName={detail.fixedCta} ctaButtonClassName={detail.ctaButton}/></>}
</div></ParentAppShell>};createRoot(document.getElementById('root')).render(<Fixture/>);`
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
      return { contents: names.map(n => `export async function ${n}(){throw Error('Mutation forbidden in color verifier')}`).join('\n') }
    })
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'jsx', resolveDir: root, contents: a.path === 'next/navigation' ? `import {useSyncExternalStore} from 'react';for(const key of ['pushState','replaceState']){const orig=history[key].bind(history);history[key]=(...args)=>{orig(...args);dispatchEvent(new Event('fixture-nav'))}}const subscribe=f=>{addEventListener('fixture-nav',f);addEventListener('popstate',f);return()=>{removeEventListener('fixture-nav',f);removeEventListener('popstate',f)}};export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));export const useRouter=()=>({push:p=>history.pushState(null,'',p),replace:p=>history.replaceState(null,'',p),refresh:()=>{},back:()=>history.back()});export const unstable_rethrow=()=>{};` : a.path === 'next/link' ? `import React from 'react';export const useLinkStatus=()=>({pending:false});export default function Link({children,prefetch,onNavigate,...props}){return <a {...props}>{children}</a>}` : a.path === 'next/image' ? `import React from 'react';export default function Image({fill,unoptimized,priority,...props}){return <img {...props}/ >}` : `export function getSupabaseBrowserClient(){throw Error('Network forbidden')}` }))
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
        const fill = el => el.evaluate(e => { const s = getComputedStyle(e);return { bg: s.backgroundColor, color: s.color } })
        const checkAction = async el => { await el.waitFor();await page.mouse.move(0, 0);const style = await fill(el);assert.equal(style.bg, 'rgb(33, 136, 44)');assert.equal(style.color, 'rgb(255, 255, 255)');assert(contrast(style.bg.match(/\d+/g).map(Number), style.color.match(/\d+/g).map(Number)) >= 4.5) }
        for (const route of ['/', '/classes/fixture', '/favorites', '/record', '/my', '/apply']) {
          await page.goto(base + route)
          if (route === '/') {
            const action = page.getByRole('link', { name: '피드백 남기기', exact: true });await checkAction(action);await checkAction(page.getByRole('link', { name: '리포트 확인하기', exact: true }))
            await action.hover();assert.equal((await fill(action)).bg, 'rgb(32, 130, 42)');await page.mouse.down();assert.equal((await fill(action)).bg, 'rgb(31, 126, 41)');await page.mouse.move(0, 0);await page.mouse.up()
            assert.equal(await page.locator('[data-status]').evaluate(e => getComputedStyle(e).color), 'rgb(26, 116, 38)')
            const nav = page.getByRole('navigation', { name: '하단 탭' }), active = nav.locator('[aria-current="page"]');assert.equal(await active.locator('svg').first().evaluate(e => getComputedStyle(e).color), 'rgb(42, 173, 56)');assert.equal((await fill(active)).color, 'rgb(33, 136, 44)')
            const glass = nav;assert.equal((await fill(glass)).bg, 'rgba(255, 255, 255, 0.44)');const box = await nav.boundingBox();assert.equal(box.height, 64);assert(Math.abs(box.x + box.width / 2 - width / 2) < 1)
          } else if (route === '/classes/fixture') {
            const action = page.getByRole('button', { name: '체험수업 신청하기', exact: true });await checkAction(action)
            await page.getByRole('button', { name: '관심수업 추가', exact: true }).click();assert.equal(await page.getByRole('button', { name: '관심수업 해제', exact: true }).locator('path').first().evaluate(e => getComputedStyle(e).fill), 'rgb(198, 40, 40)')
            await action.click();const dialog = page.getByRole('dialog', { name: '체험수업 신청', exact: true });await dialog.waitFor();const next = dialog.getByRole('button', { name: '다음', exact: true });await dialog.getByRole('button', { name: '오후 2:00', exact: true }).click();assert.equal(await next.isEnabled(), true);await checkAction(next);await page.screenshot({ path: path.join(out, `${name}-${width}-sheet.png`) });await page.getByRole('button', { name: '닫기', exact: true }).click()
          } else if (route === '/favorites' || route === '/record') await checkAction(page.getByRole('link', { name: '수업 찾아보기', exact: true }))
          else if (route === '/my') { await page.getByRole('button', { name: '내 정보 수정하기', exact: true }).click();await checkAction(page.getByRole('button', { name: '저장', exact: true })) }
          else await checkAction(page.locator('button[type="submit"]').last())
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          await page.screenshot({ path: path.join(out, `${name}-${width}-${route.replace(/\//g, '_') || 'home'}.png`) });results.push({ engine: name, width, route, status: 'PASS' })
        }
        await page.goto(base + '/studio-fixture');assert.equal((await fill(page.getByRole('button'))).bg, 'rgb(27, 122, 38)', 'Shared Studio feedback token stays unchanged')
        assert.deepEqual(errors, []);await c.close();console.log(name, width, 'color/contrast/portal/heart/Nav/Studio PASS')
      } } finally { await browser.close() }
    }
  } finally { server.close() }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ colors, contrast: Object.fromEntries(Object.entries(colors).map(([k,v]) => [k, contrast(rgb(v), [255,255,255])])), results }, null, 2))
  console.log('Evidence:', out)
}
main().catch(e => { console.error(e);process.exitCode = 1 })
