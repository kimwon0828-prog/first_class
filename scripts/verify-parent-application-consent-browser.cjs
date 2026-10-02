// Real application forms + React DOM. Only server actions/router are inert; no DB/auth writes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const os = require('node:os')
const { build } = require(process.env.ESBUILD_MODULE_PATH || 'esbuild')
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = process.cwd()
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'parent-consent-verifier-'))
const results = []
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {ClassDetailApplicationSheet} from './src/features/applications/ui/class-detail-application-sheet';
import {ApplyForm} from './src/features/applications/ui/apply-form';
import './app/globals.css';import applyStyles from './app/classes/[id]/apply/page.module.css';
const props={classId:'fixture',classTargetAge:'elem_3_4',availableSlots:[{id:'slot',optionId:'slot',source:'class_schedule',classScheduleId:'slot',startAt:'2099-01-01T05:00:00Z',endAt:'2099-01-01T06:00:00Z',remainingCount:5,capacity:5,appliedCount:0,isClosed:false}],slotsError:null,childProfiles:[{id:'own-child',parentId:'fixture',name:'QA Child',grade:'elem_3',schoolName:'QA School'}],childProfilesError:null,parentName:'QA Parent',parentPhone:'01012345678'};
createRoot(document.getElementById('root')).render(location.pathname==='/apply'?<main className={applyStyles.page}><div className={applyStyles.shell}><ApplyForm {...props}/></div></main>:<ClassDetailApplicationSheet {...props} classTitle='QA class' academyName='QA academy' trialPriceLabel='무료 체험수업' hasSession isParentUser signInHref='/auth/sign-in'/>);`
const navigation = `export function useRouter(){return {replace:p=>{window.lastRedirect=p},refresh:()=>{}}}export function usePathname(){return location.pathname}export function useSearchParams(){return new URLSearchParams(location.search)}export function unstable_rethrow(e){if(e?.digest?.startsWith('NEXT_'))throw e}`
const action = `export async function createTrialApplicationAction(id,previous,form){
 window.calls=(window.calls||0)+1;window.payload=Object.fromEntries(form);const mode=window.mode;
 await new Promise(resolve=>{window.releaseAction=resolve});
 if(mode==='network-error')throw new TypeError('QA simulated network failure');
 return mode==='success'?{status:'success',message:'QA success',redirectTo:'/my/applications'}:{status:'error',message:'QA server failure'};
}`
const names = ['privacyAgreed', 'thirdPartyAgreed', 'guardianAgreed']
async function main() {
  await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true,
    outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'inert-consent-boundaries', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link)$/ }, a => ({ path: a.path, namespace: 'fixture' }))
      b.onResolve({ filter: /\/actions\// }, a => {
        assert(a.path.endsWith('/create-trial-application'), 'Unexpected action import: ' + a.path)
        return { path: a.path, namespace: 'action' }
      })
      b.onLoad({ filter: /.*/, namespace: 'action' }, () => ({ contents: action }))
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'jsx', resolveDir: root, contents: a.path === 'next/navigation' ? navigation :
        `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}` }))
    } }] })
  const server = http.createServer((req, res) => {
    const asset = ['/ui.js', '/ui.css'].includes(req.url)
    res.setHeader('Content-Type', asset ? req.url.endsWith('.css') ? 'text/css' : 'text/javascript' : 'text/html; charset=utf-8')
    res.end(asset ? fs.readFileSync(path.join(out, req.url.slice(1))) : '<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><div id="root"></div><script src="/ui.js"></script></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  try {
    for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
      const browser = await engine.launch(engineName === 'chromium' ? { channel: 'chrome' } : {})
      try {
        for (const width of [390, 430]) for (const variant of ['sheet', 'apply']) {
          const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true })
          await context.route('**/*', r => new URL(r.request().url()).origin === base && r.request().method() === 'GET' ? r.continue() : r.abort())
          await context.addInitScript(() => {
            window.resetEvents = []
            document.addEventListener('reset', e => {
              const form = e.target
              queueMicrotask(() => window.resetEvents.push({ prevented: e.defaultPrevented, connected: form.isConnected }))
            })
          })
          const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000)
          page.on('pageerror', e => errors.push(e.message))
          await page.goto(base + '/' + variant)
          const form = page.locator('form')
          async function openConsent() {
            await page.getByRole('button', { name: '체험수업 신청하기', exact: true }).click()
            const dialog = page.getByRole('dialog', { name: '체험수업 신청', exact: true })
            const selected = dialog.locator('button[aria-pressed="true"]')
            if (!await selected.count()) await dialog.locator('button[aria-pressed="false"]:not([disabled])').first().click()
            await dialog.getByRole('button', { name: '다음', exact: true }).click()
            await dialog.getByRole('button', { name: /QA Child/ }).click()
            await dialog.getByRole('button', { name: '다음', exact: true }).click()
          }
          if (variant === 'sheet') await openConsent()
          else await form.locator('select[name="childId"]').selectOption('own-child')
          const boxes = form.locator('input[type="checkbox"]'), submit = form.locator('button[type="submit"]')
          async function expectConsent(checked) {
            await page.waitForFunction(({ names, checked }) => {
              const f = document.querySelector('form'), boxes = [...f.querySelectorAll('input[type=checkbox]')], data = new FormData(f)
              return boxes.length === 3 && boxes.every(x => x.checked === checked) && names.every(n => (data.get(n) === 'yes') === checked)
            }, { names, checked })
            assert.equal(await submit.isDisabled(), !checked)
          }
          await expectConsent(false) // A: first entry
          for (const box of await boxes.all()) await box.check()
          await expectConsent(true) // B: state, DOM, FormData and button agree
          for (const name of names) assert.equal(await form.evaluate((f, n) => new FormData(f).get(n), name), 'yes')
          await boxes.first().uncheck()
          assert.equal(await form.evaluate(f => new FormData(f).get('privacyAgreed')), null)
          assert(await submit.isDisabled())
          await boxes.first().check()
          const originalForm = await form.elementHandle()
          for (const [index, mode] of ['server-error', 'network-error'].entries()) {
            await page.evaluate(mode => { window.mode = mode }, mode)
            // Same-turn duplicate events, then another event while pending, must yield one action.
            await form.evaluate(f => { f.requestSubmit(); f.requestSubmit() })
            await page.waitForFunction(count => window.calls === count && typeof window.releaseAction === 'function', index + 1)
            assert(await submit.isDisabled())
            await form.evaluate(f => f.requestSubmit())
            assert.equal(await page.evaluate(() => window.calls), index + 1)
            await page.evaluate(() => { window.releaseAction(); window.releaseAction = null })
            await page.getByText(mode === 'server-error' ? 'QA server failure' : '체험수업 신청에 실패했습니다. 잠시 후 다시 시도해주세요.', { exact: true }).waitFor()
            await expectConsent(true) // D: error preserves consent and allows retry
            assert(await originalForm.evaluate(f => f === document.querySelector('form')), 'Failure must not remount the form')
            assert.equal(await form.evaluate(f => new FormData(f).get('childId')), 'own-child')
            assert.equal(await form.evaluate(f => new FormData(f).get('selectedScheduleOptionId')), 'slot')
            await page.screenshot({ path: path.join(out, `${engineName}-${width}-${variant}-${mode}.png`) })
          }
          if (variant === 'sheet') { // F: close button AND Escape clear consent on the next entry
            for (const close of ['button', 'escape']) {
              if (close === 'button') await page.getByRole('button', { name: '닫기', exact: true }).click()
              else await page.keyboard.press('Escape')
              await openConsent()
              await expectConsent(false)
              for (const box of await boxes.all()) await box.check()
            }
          }
          await page.evaluate(() => { window.mode = 'success' })
          await submit.click()
          await page.waitForFunction(() => window.calls === 3 && typeof window.releaseAction === 'function')
          assert(await submit.isDisabled())
          const payload = await page.evaluate(() => window.payload)
          for (const name of names) assert.equal(payload[name], 'yes')
          await page.evaluate(() => window.releaseAction())
          await page.waitForFunction(() => window.lastRedirect === '/my/applications') // E: successful retry
          assert.equal(await page.evaluate(() => window.calls), 3)
          const resets = await page.evaluate(() => window.resetEvents)
          assert(resets.length >= 3 && resets.every(x => x.prevented), 'Action DOM resets must be canceled')
          assert.deepEqual(errors, [])
          results.push({ engine: engineName, width, variant, scenarios: 'A/B/C/D(server+network)/E/F(sheet)', status: 'PASS', actionCalls: 3, resets })
          console.log('PASS', engineName, width, variant)
          await context.close()
        }
      } finally { await browser.close() }
    }
  } finally {
    await new Promise(resolve => server.close(resolve))
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2))
    console.log('Evidence:', out)
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
