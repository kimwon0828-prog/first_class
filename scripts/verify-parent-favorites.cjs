const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync('src/features/favorites/lib/storage.ts', 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
let raw = null, failRead = false, failWrite = false
const events = []
const window = { localStorage: {
  getItem(key) { assert.equal(key, 'firstclass_favorites'); if (failRead) throw Error('blocked'); return raw },
  setItem(key, value) { assert.equal(key, 'firstclass_favorites'); if (failWrite) throw Error('quota'); raw = value }
}, dispatchEvent(event) { events.push(event.type) } }
const api = {}
vm.runInNewContext(js, { exports: api, window, Event: class { constructor(type) { this.type = type } } })
assert.equal(api.readFavoriteClassIds().error, false)
assert.equal(api.toggleFavoriteClassId('a').isFavorite, true)
assert.equal(raw, '["a"]')
api.toggleFavoriteClassId('b')
assert.equal(raw, '["a","b"]')
assert.equal(api.toggleFavoriteClassId('a').isFavorite, false)
assert.equal(raw, '["b"]')
assert.ok(events.every(e => e === 'firstclass_favorites_updated'))
const eventCount = events.length
failWrite = true
assert.throws(() => api.toggleFavoriteClassId('b'))
assert.equal(raw, '["b"]')
assert.equal(events.length, eventCount)
failWrite = false; failRead = true
assert.equal(api.readFavoriteClassIds().error, true)
assert.equal(api.getFavoriteClassIds().length, 0)
assert.throws(() => api.toggleFavoriteClassId('c'))
assert.equal(raw, '["b"]')
failRead = false; raw = 'invalid json'
assert.equal(api.readFavoriteClassIds().ids.length, 0)
api.setFavoriteClassIds(['a','a','','b'])
assert.equal(raw, '["a","b"]')
console.log('PASS favorites storage: identity, toggle, events, deduplication, malformed data, read/write failure preservation')
