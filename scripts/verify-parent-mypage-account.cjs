// Actual UI + mocked action transport. No Supabase credentials or network writes.
// ESBUILD_MODULE_PATH and PLAYWRIGHT_MODULE_PATH may point to existing tool installs.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const vm = require('node:vm')
const ts = require('typescript')
const { build } = require(process.env.ESBUILD_MODULE_PATH || 'esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = process.cwd()
const out = fs.mkdtempSync('/tmp/parent-mypage-verifier-')
const results = []
const pass = label => { results.push(label); console.log('PASS ' + label) }
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

async function verifyAction() {
  let role = 'parent', dbError = null, written = null, target = null, invalidated = null
  const api = {}
  const js = ts.transpileModule(read('src/features/my/actions/update-parent-profile.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const birth = {}
  vm.runInNewContext(ts.transpileModule(read('src/shared/lib/parent-birth-date.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: birth, Date })
  vm.runInNewContext(js, { exports: api, Date, require: name => {
    if (name === 'next/cache') return { revalidatePath: value => { invalidated = value } }
    if (name.endsWith('profile-sync')) return { getMyProfile: async () => ({ id: 'current-parent', role }) }
    if (name.endsWith('/session')) return { requireSession: async () => {} }
    if (name.endsWith('parent-birth-date')) return birth
    if (name.endsWith('supabase/server')) return { getSupabaseServerClient: async () => ({ from: table => {
      assert.equal(table, 'profiles')
      return { update: value => { written = value; return { eq: async (key, value) => { target = [key, value]; return { error: dbError } } } } }
    } }) }
    throw Error('Unexpected dependency: ' + name)
  } })
  const form = (name = '검수 부모', phone = '01012345678', birthdate = '1990-01-02') => {
    const data = new FormData(); data.set('name', name); data.set('phone', phone); data.set('parentBirthDate', birthdate); data.set('id', 'another-parent'); return data
  }
  role = 'teacher'; assert.equal((await api.updateParentProfileAction(undefined, form())).status, 'error'); assert.equal(written, null)
  role = 'parent'; assert.equal((await api.updateParentProfileAction(undefined, form('가'))).status, 'error'); assert.equal(written, null)
  assert.equal((await api.updateParentProfileAction(undefined, form('검수 부모', '123'))).status, 'error'); assert.equal(written, null)
  assert.equal((await api.updateParentProfileAction(undefined, form('검수 부모', '', '2999-01-01'))).status, 'error'); assert.equal(written, null)
  dbError = { message: 'mock database failure' }; assert.equal((await api.updateParentProfileAction(undefined, form())).status, 'error'); assert.equal(invalidated, null)
  dbError = null; assert.equal((await api.updateParentProfileAction(undefined, form('  검수 부모  ', '', ''))).status, 'success')
  assert.deepEqual(target, ['id', 'current-parent']); assert.equal(written.name, '검수 부모'); assert.equal(written.phone, null); assert.equal(written.parent_birth_date, null); assert.equal(invalidated, '/my')
  pass('existing action: Parent authorization, validation, own ID only, DB failure, nullable fields, /my revalidation (all dependencies mocked)')
}

async function main() {
  await verifyAction()
  const redirectApi = {}, navigationApi = {}
  vm.runInNewContext(ts.transpileModule(read('src/features/classes/lib/parent-navigation.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: navigationApi, URL })
  vm.runInNewContext(ts.transpileModule(read('app/my/profile/page.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: redirectApi, require: name => name === 'next/navigation' ? ({ redirect: target => { throw new Error(target) } }) : navigationApi })
  await assert.rejects(() => redirectApi.default({ searchParams: Promise.resolve({}) }), /\/my\?edit=profile/)
  const pageSource = read('app/my/page.tsx')
  assert(pageSource.includes('profile.error || !profile.data')); assert(pageSource.includes('getMyParentProfileDetail()')); assert(pageSource.includes('requireParentAccess({ returnTo })'))
  assert(!read('app/page.tsx').includes('ParentProfileAvatar')); assert(read('app/page.tsx').includes('<NotificationBell'))
  assert(!read('app/classes/page.tsx').includes('ParentProfileAvatar'))
  pass('legacy route redirects to edit state; query failure guarded; Home bell retained; Classes duplicate profile entry removed')
  await build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { MyHub } from './src/features/my/ui/my-hub'; import { MyFrame } from './app/my/my-frame'; import './app/globals.css'; createRoot(document.getElementById('root')).render(<MyFrame><MyHub profile={{id:'fixture-parent',name:'검수 학부모',phone:'01012345678',parentBirthDate:'1990-01-02'}} email='parent@example.test' childrenCount={2} childrenError={null}/></MyFrame>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'no-production-dependencies', setup(builder) {
      builder.onResolve({ filter: /(delete-parent-account|integrations\/supabase\/client)$/ }, args => ({ path: args.path, namespace: 'mock' }))
      builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: 'mock' }))
      builder.onResolve({ filter: /features\/my\/actions\/update-parent-profile$/ }, args => ({ path: args.path, namespace: 'mock' }))
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'jsx', resolveDir: root, contents: args.path.endsWith('delete-parent-account') ? `export async function deleteMyParentAccountAction(){return {status:'error',message:'검증용 탈퇴 실패'}}` : args.path.endsWith('supabase/client') ? `export function getSupabaseBrowserClient(){return {auth:{signOut:async()=>({error:null})}}}` : args.path === 'next/link' ? `import React from 'react';export function useLinkStatus(){return {pending:false}}; export default function Link({href,children,prefetch,scroll,...props}){return <a href={href} {...props}>{children}</a>}` : args.path === 'next/navigation' ? `
        import {useSyncExternalStore} from 'react';
        for(const key of ['pushState','replaceState']){const original=history[key].bind(history); history[key]=(...args)=>{original(...args);window.dispatchEvent(new Event('mock-navigation'));};}
        function subscribe(fn){window.addEventListener('popstate',fn);window.addEventListener('mock-navigation',fn);return()=>{window.removeEventListener('popstate',fn);window.removeEventListener('mock-navigation',fn);};}
        export function useSearchParams(){const search=useSyncExternalStore(subscribe,()=>location.search);return new URLSearchParams(search)}
        export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname)}
        export function useRouter(){return {back:()=>history.back(),refresh:()=>{},replace:url=>history.replaceState(null,'',url)}}
        export function unstable_rethrow(error){if(error?.digest?.startsWith('NEXT_'))throw error;}
      ` : `export async function updateParentProfileAction(previous,formData){window.mockCalls=(window.mockCalls||0)+1;window.lastSubmitted=Object.fromEntries(formData);await new Promise(r=>setTimeout(r,100));if(window.mockMode==='throw')throw Error('Offline');return window.mockMode==='success'?{status:'success',message:'저장했습니다.'}:{status:'error',message:'검증용 저장 실패'};}` }))
    } }]
  })
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/my/profile')) { res.writeHead(307, { Location: '/my?edit=profile' }); return res.end() }
    if (req.url === '/ui.js' || req.url === '/ui.css') { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); return res.end(fs.readFileSync(path.join(out, req.url.slice(1)))) }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyPage isolated verifier</title><link rel="stylesheet" href="/ui.css"><div id="root"></div><script src="/ui.js"></script></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    // Fail closed: this verifier can only contact its own in-memory static server.
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(base + '/my')
    await page.getByRole('heading', { name: '검수 학부모님' }).waitFor()
    const edit = page.getByRole('button', { name: '내 정보 수정하기' })
    const dialog = page.getByRole('dialog', { name: '내 정보 수정' })
    for (const width of [390, 430, 480, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      assert.equal(await page.locator('nav a[aria-current="page"]').innerText(), '마이페이지')
      await page.screenshot({ path: path.join(out, `my-${width}.png`), fullPage: true })
      await edit.click(); await dialog.waitFor()
      assert(await dialog.evaluate(el => el.getBoundingClientRect().width <= 480))
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      assert(await dialog.evaluate(el => el.contains(document.activeElement)))
      await page.screenshot({ path: path.join(out, `edit-${width}.png`), fullPage: true })
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
      await page.waitForFunction(() => document.activeElement?.textContent === '내 정보 수정하기')
    }
    pass('390/430/480/desktop: avatar/card, centered <=480px, no overflow, active MyPage tab, sheet open/Escape/focus return')
    await page.setViewportSize({ width: 390, height: 844 }); await edit.click(); await dialog.waitFor()
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement))) }
    await page.keyboard.press('Shift+Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement)))
    const name = dialog.getByLabel('이름', { exact: false }), phone = dialog.getByLabel('연락처', { exact: false })
    await name.fill('변경 학부모'); await phone.fill('01099998888')
    await dialog.getByRole('button', { name: '저장', exact: true }).click()
    await dialog.getByRole('alert').waitFor()
    assert.equal(await name.inputValue(), '변경 학부모'); assert.equal(await phone.inputValue(), '01099998888')
    await page.evaluate(() => { window.mockMode = 'throw' })
    await dialog.getByRole('button', { name: '저장', exact: true }).click()
    await dialog.getByText('보호자 정보를 저장하지 못했어요.', { exact: false }).waitFor()
    assert.equal(await name.inputValue(), '변경 학부모')
    pass('keyboard focus containment; returned server error and thrown network error preserve inputs and keep sheet open')
    await page.evaluate(() => { window.mockMode = 'success' })
    await dialog.getByRole('button', { name: '저장', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' }); await page.getByRole('heading', { name: '변경 학부모님' }).waitFor()
    await edit.click(); await dialog.waitFor(); assert.equal(await name.inputValue(), '변경 학부모'); assert.equal(await phone.inputValue(), '01099998888')
    pass('mock save success closes sheet, immediately updates MyPage name, reopens with saved values')
    await page.goBack(); await dialog.waitFor({ state: 'hidden' }); await page.goForward(); await dialog.waitFor()
    await dialog.getByRole('button', { name: '취소', exact: true }).click(); await dialog.waitFor({ state: 'hidden' })
    await page.goto(base + '/my/profile'); await dialog.waitFor(); assert.equal(new URL(page.url()).search, '?edit=profile')
    await dialog.getByRole('button', { name: '취소', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); assert.equal(new URL(page.url()).pathname, '/my')
    await page.waitForFunction(() => document.activeElement?.textContent === '내 정보 수정하기')
    pass('back/forward edit state and direct legacy deep-link close stay within MyPage with focus restored')
    await edit.click(); await dialog.waitFor(); await page.setViewportSize({ width: 390, height: 420 })
    await dialog.getByRole('button', { name: '저장', exact: true }).scrollIntoViewIfNeeded()
    const box = await dialog.boundingBox(); assert(box.y >= 0 && box.y + box.height <= 421)
    await page.screenshot({ path: path.join(out, 'edit-short-viewport.png'), fullPage: true })
    await dialog.getByRole('button', { name: '취소', exact: true }).click(); await dialog.waitFor({ state: 'hidden' })
    await page.setViewportSize({ width: 390, height: 844 })
    for (const href of ['/my/children','/my/applications','/favorites','/terms','/privacy','/third-party-consent']) assert.equal(await page.locator(`a[href="${href}"]`).count(), 1)
    assert.equal(await page.locator('form[action="/auth/sign-out"][method="post"]').count(), 1)
    await page.getByRole('button', { name: '회원탈퇴', exact: true }).click()
    const withdraw = page.getByRole('dialog', { name: '회원탈퇴', exact: true }); await withdraw.waitFor()
    assert(await withdraw.getByText('첫수업 계정과 첫수업에서 관리하는 개인 정보가 삭제됩니다.', { exact: true }).count())
    assert.equal(await withdraw.locator('form').count(), 0)
    await withdraw.getByRole('button', { name: '회원탈퇴 계속' }).click(); await withdraw.getByRole('heading', { name: '정말 탈퇴하시겠어요?' }).waitFor()
    await page.screenshot({ path: path.join(out, 'withdrawal-entry.png'), fullPage: true })
    await page.keyboard.press('Escape'); await withdraw.waitFor({ state: 'hidden' })
    assert.deepEqual(errors, [])
    pass('short viewport scroll, existing navigation/logout contracts, two-step withdrawal entry with mocked action, no runtime errors')
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors, base }, null, 2))
    console.log('Evidence: ' + out)
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
