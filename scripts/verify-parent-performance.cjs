// No DB/auth writes. Execute real image policy/query modules and the real map UI.
// Uses existing ESBUILD_MODULE_PATH / PLAYWRIGHT_MODULE_PATH tool installations.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), http = require('node:http')
const ts = require('typescript')
const { build } = require(process.env.ESBUILD_MODULE_PATH || 'esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = process.cwd(), out = fs.mkdtempSync('/tmp/parent-performance-verifier-')
function load(file, mocks = {}, globals = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, URL, Map, console, ...globals, require(name) {
    if (name === 'server-only') return {}
    if (name in mocks) return mocks[name]
    throw Error('Unexpected dependency: ' + name)
  } })
  return exports
}
function images() {
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://assets.example.test' }
  const { canOptimizeParentImage: allows } = load('src/features/classes/lib/parent-image.ts', {}, { process: { env } })
  for (const bucket of ['class-covers', 'academy-profile-assets']) {
    assert(allows(`https://assets.example.test/storage/v1/object/public/${bucket}/folder/photo.png`))
  }
  for (const url of ['/local.png', 'broken', 'data:image/png;base64,AA',
    'https://other.example.test/storage/v1/object/public/class-covers/a.png',
    'https://assets.example.test/storage/v1/object/public/private/a.png',
    'https://assets.example.test/storage/v1/object/sign/class-covers/a.png?token=secret',
    'https://assets.example.test/storage/v1/object/public/class-covers/a.png?token=secret',
    'https://user:pass@assets.example.test/storage/v1/object/public/class-covers/a.png']) assert(!allows(url), url)
  env.NEXT_PUBLIC_SUPABASE_URL = ''
  assert(!allows('https://assets.example.test/storage/v1/object/public/class-covers/a.png'))
  console.log('PASS image allowlist: own public buckets only; legacy/external/signed/local URLs keep original delivery')
}
async function projection(detail, subjectFailure = false, organizationFailure = false) {
  let subjectStarted = false, organizationStarted = false
  let release
  const organizationBegun = new Promise(resolve => { release = resolve })
  const row = { id: 'class', organization_id: 'academy', title: '수학', subject: 'math',
    subject_id: 'subject', subject_category_id: 'category', program_type: 'trial_class',
    target_age: '초3', description: '체험', is_active: true, teacher_display_name: 'private', teacher_intro: 'private' }
  const client = { from(table) {
    const query = {
      select() { return query }, eq() { return query }, is() { return query }, order() { return query },
      in() { return query }, limit() { return query }, maybeSingle() { return query },
      then(resolve, reject) {
        if (table === 'organizations') {
          organizationStarted = true; release()
          return Promise.resolve({ data: [{ id: 'academy', name: '학원', latitude: 37, longitude: 127 }],
            error: organizationFailure ? { message: 'failed' } : null }).then(resolve, reject)
        }
        return Promise.resolve({ data: detail ? row : [row], error: null }).then(resolve, reject)
      }
    }; return query
  } }
  const api = load('src/features/classes/queries/public-class-safe-projection.ts', {
    '@/integrations/supabase/service-role': { getSupabaseServiceRoleClient: () => client },
    '@/features/subjects/queries/get-subject-master': { loadSubjectMasterMapsByIdsWithClient: async () => {
      subjectStarted = true
      // Would deadlock if organizations were still awaited after the subject result.
      await organizationBegun
      if (subjectFailure) throw Error('subject unavailable')
      return { categoryById: new Map(), subjectById: new Map() }
    } },
    '@/shared/constants/education-taxonomy': { normalizeSubjectCategory: value => value },
    '@/shared/lib/subject-master': { buildClassSubjectReadModel: () => ({}), formatClassSubjectDisplayLabel: () => '수학' }
  })
  let timer
  try {
    const request = detail ? api.getPublicClassDetailWithSafeProjection('class') : api.listPublicClassesWithSafeProjection({ query: '학원' })
    const bounded = Promise.race([request, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Independent projection requests did not overlap')), 1000) })])
    if (organizationFailure) await assert.rejects(bounded, /failed_to_fetch_public_organization_projection/)
    else {
      const data = await bounded, item = detail ? data : data[0]
      assert.equal(item.id, 'class'); assert.equal(item.organization.name, '학원')
      assert.equal(item.teacherDisplayName, null); assert.equal(item.teacherIntro, null)
      assert.equal(item.organization.latitude, detail ? 37 : undefined)
    }
    assert(subjectStarted && organizationStarted)
  } finally { clearTimeout(timer) }
}
async function detailRequests() {
  const source = fs.readFileSync('app/classes/[id]/page.tsx', 'utf8')
  const body = source.slice(source.indexOf('  const [{ data: classItem'), source.indexOf('  const organizationLabel'))
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const names = ['getPublicClassDetail', 'getSession', 'getMyProfile', 'getPublicClassFeedback',
    'getPublicClassAvailableSlots', 'getMyChildren', 'getPublicAcademyPageByHandle', 'formatRegularPrice',
    'safeParentReturnTo', 'resolvedParams', 'resolvedSearchParams', 'regionQuery']
  const run = new AsyncFunction(...names, body + '\nreturn {isParentUser, favoritesEnabled, children, slots, feedbackSummary, academy}')
  for (const role of [null, 'parent', 'teacher']) {
    let profiles = 0, childCalls = 0, slotsStarted = false
    const result = await run(
      async () => ({data: {id: 'class', organization: {id: 'academy'}}, error: null}),
      async () => role ? {user: {id: role}} : null,
      async () => { profiles++; return {role} },
      async () => { await Promise.resolve(); assert(slotsStarted, 'Feedback and slots should overlap'); return {chips: []} },
      async () => { slotsStarted = true; return {data: [], error: null} },
      async () => { childCalls++; return {data: [{id: 'owned-child'}], error: null} },
      async () => { throw Error('optional academy unavailable') },
      () => null, () => null, {id: 'class'}, undefined, new URLSearchParams()
    )
    assert.equal(profiles, role ? 1 : 0); assert.equal(childCalls, role === 'parent' ? 1 : 0)
    assert.equal(result.isParentUser, role === 'parent'); assert.equal(result.favoritesEnabled, role !== 'teacher')
    assert.equal(result.academy, null, 'Optional academy failure remains nonfatal')
  }
  console.log('PASS detail orchestration: anonymous/parent/teacher gates, independent feedback/slots, optional academy fallback')
}
async function maps() {
  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {NaverMapByAddress} from './src/features/maps/ui/naver-map-by-address';
    const root=createRoot(document.getElementById('root')); window.unmountMap=()=>root.unmount();
    root.render(<div style={{paddingTop:2000}}><NaverMapByAddress address='검수 주소' latitude={37} longitude={127}/></div>);`
  }, bundle: true, outfile: path.join(out, 'map.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'public-env-only', setup(b) {
    b.onResolve({ filter: /shared\/config\/env$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export function getPublicEnv(){return {naverMapClientId:'fixture'}}` }))
  } }] })
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/map.js' ? 'text/javascript' : 'text/html; charset=utf-8')
    res.end(req.url === '/map.js' ? fs.readFileSync(path.join(out, 'map.js')) : '<!doctype html><div id="root"></div><script src="/map.js"></script>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome' })
    for (const mode of ['scroll', 'unmount', 'no-observer', 'sdk-error']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
      if (mode === 'no-observer') await ctx.addInitScript(() => { delete window.IntersectionObserver })
      let sdkRequests = 0
      await ctx.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin === base) return route.continue()
        assert.equal(url.hostname, 'oapi.map.naver.com'); sdkRequests++
        if (mode === 'sdk-error') return route.abort()
        return route.fulfill({ contentType: 'text/javascript', body: `window.naver={maps:{LatLng:function(){},Marker:function(){},Map:function(el){window.mapCount=(window.mapCount||0)+1;el.dataset.mapReady='true'}}};` })
      })
      const page = await ctx.newPage(), errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(base); await page.waitForTimeout(300)
      if (mode !== 'no-observer') assert.equal(sdkRequests, 0, 'No below-fold SDK request')
      if (mode === 'unmount') {
        await page.evaluate(() => window.unmountMap()); await page.evaluate(() => scrollTo(0, 2200))
        await page.waitForTimeout(200); assert.equal(sdkRequests, 0, 'Observer disconnected on unmount')
      } else {
        await page.evaluate(() => scrollTo(0, 1900))
        if (mode === 'sdk-error') await page.getByText('지도를 불러오지 못했어요.', { exact: false }).waitFor()
        else { await page.locator('[data-map-ready]').waitFor(); assert.equal(await page.evaluate(() => window.mapCount), 1) }
        assert.equal(sdkRequests, 1)
      }
      assert.deepEqual(errors, []); await ctx.close()
    }
    console.log('PASS real map: deferred SDK, near-viewport start once, unmount cleanup, unsupported observer fallback, SDK error UI')
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
}
;(async () => {
  images()
  for (const detail of [false, true]) { await projection(detail); await projection(detail, true); await projection(detail, false, true) }
  console.log('PASS parallel public projections preserve list/detail DTO, subject fallback, organization errors and privacy fields')
  await detailRequests()
  await maps(); console.log('Evidence: ' + out)
})().catch(error => { console.error(error); process.exitCode = 1 })
