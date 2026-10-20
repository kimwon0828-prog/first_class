// Synthetic keys/tokens and an in-memory Apple HTTP stub only. No live revocation.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict')
const crypto = require('node:crypto'), ts = require('typescript')
const source = 'src/features/auth/lib/apple-token-revocation.ts'
const api = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: api, require: name => name === 'server-only' ? {} : name === 'node:crypto' ? crypto : (() => { throw Error(name) })(),
  Buffer, URLSearchParams, AbortSignal, Date, process
})
const now = 1800000000
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const config = { clientId: 'com.example.web', teamId: 'ABCDEFGHIJ', keyId: '1234567890', privateKey: ec.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() }
const user = { identities: [{ provider: 'apple', provider_id: 'trusted-subject', identity_data: { sub: 'trusted-subject' } }] }
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
function token(claims = {}, key = rsa.privateKey, header = {}) {
  const input = `${b64({ alg: 'RS256', kid: 'apple-key', ...header })}.${b64({ iss: 'https://appleid.apple.com', aud: config.clientId, sub: 'trusted-subject', iat: now, exp: now + 3600, ...claims })}`
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`
}
function fixture(overrides = {}) {
  const calls = []
  const fetch = async (url, options) => {
    calls.push({ url, options })
    assert.equal(options.redirect, 'error')
    assert.equal(options.cache, 'no-store')
    assert(options.signal instanceof AbortSignal)
    if (url.endsWith('/auth/token')) {
      const form = options.body
      assert.equal(form.get('client_id'), config.clientId)
      assert.equal(form.get('grant_type'), 'refresh_token')
      assert.equal(form.get('refresh_token'), 'provider-refresh-token')
      const secret = form.get('client_secret').split('.')
      const header = JSON.parse(Buffer.from(secret[0], 'base64url'))
      const claims = JSON.parse(Buffer.from(secret[1], 'base64url'))
      assert.equal(header.alg, 'ES256'); assert.equal(header.kid, config.keyId)
      assert.equal(claims.iss, config.teamId); assert.equal(claims.sub, config.clientId)
      assert.equal(claims.exp, now + 300)
      assert(crypto.verify('sha256', Buffer.from(secret.slice(0, 2).join('.')), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(secret[2], 'base64url')))
      if (overrides.exchangeThrow) throw Error('secret-provider-response-must-not-escape')
      return new Response(JSON.stringify(overrides.exchange ?? { id_token: token(overrides.claims) }), { status: overrides.exchangeStatus ?? 200 })
    }
    if (url.endsWith('/auth/keys')) return new Response(JSON.stringify(overrides.jwks ?? { keys: [{ ...rsa.publicKey.export({ format: 'jwk' }), kid: 'apple-key', alg: 'RS256', use: 'sig' }] }))
    if (url.endsWith('/auth/revoke')) {
      assert.equal(options.body.get('token'), 'provider-refresh-token')
      assert.equal(options.body.get('token_type_hint'), 'refresh_token')
      if (overrides.revokeThrow) throw Error('private-network-error')
      return new Response('', { status: overrides.revokeStatus ?? 200 })
    }
    throw Error('unexpected endpoint')
  }
  return { calls, options: { config, now: () => now * 1000, fetch } }
}
let passed = 0
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name) }
async function rejected(overrides, error = 'apple_verification_failed') {
  const f = fixture(overrides), result = await api.revokeAppleGrantForUser(user, 'provider-refresh-token', f.options)
  assert.equal(result.ok, false); assert.equal(result.error, error)
  if (error === 'apple_verification_failed') assert(!f.calls.some(call => call.url.endsWith('/auth/revoke')))
}
;(async () => {
  await check('verified ownership, ES256 client secret, original Apple refresh token revoked', async () => {
    const f = fixture(), result = await api.revokeAppleGrantForUser(user, 'provider-refresh-token', f.options)
    assert.equal(result.ok, true); assert.equal(f.calls.length, 3)
  })
  await check('missing configuration makes no external calls', async () => {
    const f = fixture(), result = await api.revokeAppleGrantForUser(user, 'provider-refresh-token', { ...f.options, config: null })
    assert.equal(result.error, 'apple_configuration_unavailable'); assert.equal(f.calls.length, 0)
  })
  await check('missing or malformed provider token rejected without network', async () => {
    for (const value of [null, '', 'bad token', 'x'.repeat(8193)]) {
      const f = fixture(), result = await api.revokeAppleGrantForUser(user, value, f.options)
      assert.equal(result.error, 'apple_token_required'); assert.equal(f.calls.length, 0)
    }
  })
  await check('only a trusted linked Apple identity is accepted', async () => {
    for (const value of [{}, { identities: [{ provider: 'kakao' }] }, { identities: [{ provider: 'apple' }] }, { identities: [user.identities[0], user.identities[0]] }]) {
      const f = fixture(), result = await api.revokeAppleGrantForUser(value, 'provider-refresh-token', f.options)
      assert.equal(result.error, 'apple_identity_required'); assert.equal(f.calls.length, 0)
    }
  })
  for (const [label, claims] of Object.entries({ subject: { sub: 'another-user' }, audience: { aud: 'another-client' }, issuer: { iss: 'https://attacker.test' }, expired: { exp: now }, future: { iat: now + 61 } })) {
    await check('reject incorrect ' + label + ' before revocation', () => rejected({ claims }))
  }
  await check('reject missing identity token even when token endpoint says 200', () => rejected({ exchange: { access_token: 'opaque' } }))
  await check('reject unsigned ID token', () => rejected({ exchange: { id_token: `${b64({ alg: 'none' })}.${b64({ sub: 'trusted-subject' })}.eA` } }))
  await check('reject forged signature', async () => {
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    await rejected({ exchange: { id_token: token({}, other.privateKey) } })
  })
  await check('reject missing or ambiguous signing key', async () => {
    await rejected({ jwks: { keys: [] } })
    const key = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'apple-key', alg: 'RS256', use: 'sig' }
    await rejected({ jwks: { keys: [key, key] } })
  })
  await check('Apple token error fails closed', () => rejected({ exchangeStatus: 400 }))
  await check('network error sanitized', () => rejected({ exchangeThrow: true }))
  await check('revocation failure does not report success', () => rejected({ revokeStatus: 500 }, 'apple_revocation_failed'))
  await check('revocation network failure sanitized', () => rejected({ revokeThrow: true }, 'apple_revocation_failed'))
  await check('invalid signing key fails before HTTP calls', async () => {
    const f = fixture(), result = await api.revokeAppleGrantForUser(user, 'provider-refresh-token', { ...f.options, config: { ...config, privateKey: 'invalid' } })
    assert.equal(result.error, 'apple_configuration_unavailable'); assert.equal(f.calls.length, 0)
  })
  console.log(`TOTAL ${passed} PASS; live Apple calls=0; DB writes=0`)
})().catch(error => { console.error(error); process.exitCode = 1 })
