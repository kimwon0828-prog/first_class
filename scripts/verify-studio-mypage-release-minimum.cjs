/* Runtime verification with the real queries/Studio guard/components and mocked I/O.
 * node scripts/verify-studio-mypage-release-minimum.cjs [--http]
 * No credentials, DB writes, Auth mutations or production service-role calls.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const root = process.cwd()
const queries = [
  'src/features/studio/queries/get-studio-settings-organization.ts',
  'src/features/studio/queries/get-pending-academy-update-request.ts'
]

function runtime(options = {}) {
  const state = { role: 'academy', userId: 'user-own', orgId: 'org-own', hostname: 'localhost:3000', ...options }
  const calls = []
  const modules = new Map()
  const profile = { id: state.userId, name: 'TEST Studio', role: state.role, organization_id: state.orgId }
  function db(service) {
    return {
      auth: { getClaims: async () => ({ data: { claims: { sub: state.userId } }, error: null }) },
      from(table) {
        assert.ok(service ? ['profiles', 'organizations', 'academy_update_requests'].includes(table) : table === 'profiles')
        const filters = {}
        const query = {
          select() { return query },
          eq(key, value) { filters[key] = value; return query },
          async maybeSingle() {
            calls.push({ service, table, filters: { ...filters } })
            if (table === 'profiles') {
              assert.equal(filters.id, state.userId)
              return { data: state.profileError ? null : profile, error: state.profileError ? { code: 'test_error' } : null }
            }
            if (table === 'organizations') {
              assert.equal(filters.id, state.orgId)
              return { data: { id: state.orgId, name: 'TEST Academy' }, error: state.queryError ? { code: 'test_error' } : null }
            }
            assert.equal(filters.organization_id, state.orgId)
            assert.equal(filters.status, 'pending')
            return { data: state.emptyPending ? null : { id: 'request-own', organization_id: state.orgId, status: 'pending', current_snapshot: {}, requested_snapshot: {} }, error: state.queryError ? { code: 'test_error' } : null }
          }
        }
        return query
      }
    }
  }
  const mocks = {
    'server-only': {},
    react: { ...React, cache: fn => fn },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/headers': { headers: async () => new Headers({ host: state.hostname }) },
    'next/navigation': { redirect: url => { throw new Error(`REDIRECT:${url}`) } },
    'next/link': { __esModule: true, default: ({ prefetch, children, ...props }) => React.createElement('a', props, children) },
    '@/integrations/supabase/server': { getSupabaseServerClient: async () => db(false) },
    '@/integrations/supabase/service-role': {
      getSupabaseServiceRoleClient: () => { calls.push({ service: true, factory: true }); return db(true) }
    }
  }
  function load(file) {
    file = path.resolve(root, file)
    if (modules.has(file)) return modules.get(file).exports
    const module = { exports: {} }; modules.set(file, module)
    const source = fs.readFileSync(file, 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
    } }).outputText
    function localRequire(name) {
      if (name in mocks) return mocks[name]
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
      assert.ok(name.startsWith('@/') || name.startsWith('.'), `Unexpected dependency: ${name}`)
      const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(file), name)
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find(f => fs.existsSync(f) && fs.statSync(f).isFile())
      assert.ok(resolved, `Unresolved module: ${name}`)
      return load(resolved)
    }
    vm.runInNewContext(compiled, { module, exports: module.exports, require: localRequire, console, URL, URLSearchParams, process: { env: { NODE_ENV: 'test' } } }, { filename: file })
    return module.exports
  }
  return { load, calls }
}

const access = { id: 'user-own', organizationId: 'org-own', name: 'TEST Studio' }
async function verifyQueries() {
  for (const [i, file] of queries.entries()) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.match(source, /import "server-only"/)
    assert.doesNotMatch(source, /["']use server["']/)
    const fnName = i === 0 ? 'getStudioSettingsOrganization' : 'getPendingAcademyUpdateRequest'
    const argument = i === 0 ? access : access.organizationId
    for (const role of ['academy', 'admin', 'operator']) {
      const r = runtime({ role })
      const result = await r.load(file)[fnName](argument)
      assert.equal(i === 0 ? result.id : result.organizationId, access.organizationId)
      assert.ok(r.calls.some(c => c.service && !c.factory))
    }
    const denied = [
      ['other organization', {}, i === 0 ? { ...access, organizationId: 'org-other' } : 'org-other', /forbidden_studio_organization/],
      ['Parent', { role: 'parent' }, argument, /REDIRECT:/],
      ['anon', { userId: null }, argument, /REDIRECT:/],
      ['invalid role', { role: 'unknown' }, argument, /REDIRECT:/],
      ['missing organization', { orgId: null }, argument, /REDIRECT:/],
      ['profile lookup failure', { profileError: true }, argument, /REDIRECT:/]
    ]
    if (i === 0) denied.push(['forged actor', {}, { ...access, id: 'user-other' }, /forbidden_studio_organization/])
    for (const [label, options, arg, expected] of denied) {
      const r = runtime(options)
      await assert.rejects(() => r.load(file)[fnName](arg), expected)
      assert.equal(r.calls.filter(c => c.service).length, 0, `${label}: no privileged client or read`)
    }
    const failed = runtime({ queryError: true })
    await assert.rejects(() => failed.load(file)[fnName](argument), /failed_to_fetch/)
    console.log(`PASS ${fnName}: own Studio roles, cross-org/Parent/anon rejection before service-role, read failure`)
  }
  const r = runtime({ emptyPending: true })
  assert.equal(await r.load(queries[1]).getPendingAcademyUpdateRequest('org-own'), null)
}

async function verifyRenderedLinks() {
  for (const hostname of ['localhost:3000', 'studio.firstsuup.com']) {
    const r = runtime({ hostname })
    const mypage = renderToStaticMarkup(await r.load('src/features/studio/ui/studio-mypage-page.tsx').StudioMypagePage({ academyName: 'TEST Academy' }))
    const footer = renderToStaticMarkup(await r.load('src/features/studio/ui/studio-workspace-footer.tsx').StudioWorkspaceFooter())
    const production = hostname === 'studio.firstsuup.com'
    for (const html of [mypage, footer]) {
      for (const route of ['/terms', '/privacy', '/third-party-consent']) {
        assert.ok(html.includes(`href="${production ? 'https://firstsuup.com' : ''}${route}"`))
        if (production) assert.ok(!html.includes(`href="${route}"`))
      }
    }
    const company = r.load('src/shared/config/company-info.ts')
    assert.ok(mypage.includes(`href="${company.COMPANY_EMAIL_HREF}"`))
    assert.ok(mypage.includes('서비스 이용 종료 문의'))
    assert.ok(mypage.includes('학원 공식정보'))
    assert.ok(!mypage.includes('학원 설정'))
    for (const href of production ? ['/settings', '/mypage/profile', '/billing', '/auth/sign-out'] : ['/studio/settings', '/studio/mypage/profile', '/studio/billing', '/studio/sign-out']) {
      assert.ok(mypage.includes(`href="${href}"`), href)
    }
    const headings = [...mypage.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map(m => m[1])
    assert.deepEqual(headings, ['학원', '정책', '계정'])
    console.log(`PASS ${hostname}: actual MyPage/footer render, policy links, existing routes, inquiry, section order`)
  }
  const settings = fs.readFileSync('src/features/studio/ui/studio-settings-page.tsx', 'utf8')
  assert.match(settings, /<h1 className=\{styles.title\}>학원 공식정보<\/h1>/)
  assert.match(settings, /action=\{formAction\}/)
  const logout = fs.readFileSync('app/studio/sign-out/route.ts', 'utf8')
  assert.match(logout, /await supabase.auth.signOut\(\)/)
  assert.match(logout, /resolveStudioNavigationPath\("\/studio\/sign-in"\)/)
  const mypage = fs.readFileSync('src/features/studio/ui/studio-mypage-page.tsx', 'utf8')
  assert.match(mypage, /href=\{studioPath\("\/studio\/sign-out"\)\} prefetch=\{false\}/)
  assert.doesNotMatch(fs.readFileSync('app/(legal)/terms/page.tsx', 'utf8'), /TODO/)
  console.log('PASS settings title/form wiring, logout contract, terms contact placeholder')
}

async function main() {
  await verifyQueries()
  await verifyRenderedLinks()
  if (process.argv.includes('--http')) {
    for (const origin of ['https://firstsuup.com', 'http://localhost:3000']) {
      for (const route of ['/terms', '/privacy', '/third-party-consent']) {
        const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(30000) })
        assert.equal(response.status, 200, `${origin}${route}`)
        console.log(`PASS HTTP 200 ${origin}${route}`)
        await response.body?.cancel()
      }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
