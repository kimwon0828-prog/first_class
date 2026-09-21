// Execute the real query modules with injected boundary failures; no DB or auth writes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const path = require('node:path')
function moduleAt(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const exports = {}
  new Function('require', 'exports', code)((name) => {
    if (name === 'server-only') return {}
    if (name in mocks) return mocks[name]
    if (name.startsWith('@/')) return moduleAt(path.join('src', name.slice(2) + '.ts'), mocks)
    if (name.startsWith('.')) return moduleAt(path.resolve(path.dirname(file), name + '.ts'), mocks)
    throw new Error(`Unexpected dependency: ${name}`)
  }, exports)
  return exports
}
async function main() {
  const captured = []
  const original = console.error
  console.error = (...args) => captured.push(args)
  try {
    const app = { id: 'exp', status: 'completed', completedAt: '2026-09-20T00:00:00Z', canceledAt: null, childId: 'child', childName: '가온', childGrade: 'E3', classTitle: '파이썬', canCollectParentDecision: true }
    const event = { id: 'report_published:report', kind: 'report_published', href: '/record/exp/report', isUnread: true }
    let notificationResult = { notifications: [event], error: null, readStateStatus: 'available' }
    let notificationThrows = false
    let signals = { reportedExperienceIds: new Set(['exp']), decidedExperienceIds: new Set(), error: null }
    let actionThrows = false
    const notifications = moduleAt('src/features/notifications/queries/get-home-notifications.ts', {
      './get-parent-notifications': { getParentNotifications: async () => { if (notificationThrows) throw new Error('fixture notification query throw'); return notificationResult } }
    })
    const actions = moduleAt('src/features/actions/queries/get-parent-home-actions.ts', {
      '@/features/record/queries/get-parent-experience-signals': { getParentExperienceSignals: async () => { if (actionThrows) throw new Error('fixture report/decision query throw'); return signals } },
      './get-parent-actions': { PARENT_ACTION_LOOKUP_LIMIT: 20 }
    })
    const run = async () => {
      const result = await notifications.getHomeNotifications('parent')
      return { result, bell: notifications.hasHomeUnreadNotifications(result), actions: await actions.getParentHomeActions([app], Promise.resolve(result)) }
    }
    let state = await run()
    assert.equal(state.bell, true); assert.equal(state.actions.actions[0].kind, 'report_review')
    event.isUnread = false
    state = await run(); assert.equal(state.bell, false); assert.equal(state.actions.actions[0].kind, 'experience_reflection')
    signals.decidedExperienceIds.add('exp') // including considering, which is a valid decision
    state = await run(); assert.equal(state.actions.actions.length, 0); assert.equal(state.result.notifications.length, 1)
    notificationResult = { notifications: [{ ...event, isUnread: undefined }], error: null, readStateStatus: 'unavailable' }
    state = await run(); assert.equal(state.bell, false); assert(state.actions.error); assert.equal(state.result.notifications[0].isUnread, undefined)
    notificationThrows = true
    state = await run(); assert.equal(state.result.readStateStatus, 'unavailable'); assert(state.result.error); assert.equal(state.bell, false)
    notificationThrows = false
    for (const malformed of [null, { notifications: null }, { notifications: [null] }]) {
      notificationResult = malformed
      state = await run(); assert.equal(state.result.readStateStatus, 'unavailable'); assert(state.actions.error)
    }
    notificationResult = { notifications: [{ ...event, isUnread: true }], error: null, readStateStatus: 'available' }
    actionThrows = true
    state = await run(); assert.equal(state.bell, true); assert(state.actions.error)
    actionThrows = false; signals = null
    state = await run(); assert(state.actions.error)
    signals = { reportedExperienceIds: new Set(['exp']), decidedExperienceIds: new Set(), error: 'fixture returned query error' }
    state = await run(); assert(state.actions.error)
    // A failed action query must not discard a successfully loaded upcoming schedule.
    const future = { ...app, id: 'upcoming', status: 'confirmed', completedAt: null, confirmedSlotAt: '2099-09-22T06:00:00Z' }
    const summary = moduleAt('src/features/classes/queries/get-parent-home-summary.ts', {
      '@/features/applications/queries/get-my-applications': { getMyApplications: async () => ({ data: [app, future], error: null }) },
      '@/features/children/queries/get-my-children': { getMyChildren: async () => ({ data: [{ id: 'child', name: '가온', grade: 'E3' }], error: null }) },
      '@/features/classes/queries/get-public-class-detail': { getPublicClassDetail: async () => { throw new Error('fixture cover query throw') } },
      '@/features/actions/queries/get-parent-home-actions': actions
    })
    const result = await summary.getParentHomeSummary('child', Promise.resolve(notificationResult))
    assert.equal(result.error, true); assert.equal(result.upcoming.length, 1); assert.equal(result.selectedChildId, 'child')
    assert.equal(result.upcoming[0].coverImageUrl, null)
    assert(captured.some(args => args[0].includes('[parent-home:notifications]') && args[1].stack))
    assert(captured.some(args => args[0].includes('[parent-home:actions]') && args[1].stack))
    assert(captured.some(args => args[0].includes('[parent-home:schedule-cover]')))
    console.log('PASS notification normal/throw/unavailable/malformed; action normal/throw/error/null; unread/read/decision independence; bell true/false; history retained; upcoming preserved; original stacks logged')
  } finally { console.error = original }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
