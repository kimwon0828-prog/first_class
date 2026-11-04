// Rollout safety for the native phone gate, with the real reader/gate/push/consent/onboarding/deletion
// modules and inert Supabase/Apple/SMS boundaries. Synthetic users only; no network or Production access.
//  A. Requests the installed store app (build 11, e708047) makes: identical to today's reader for every
//     migration (before/after) with the shipped routes; the code-only `all` path changes only the intended accounts.
//  B. New app onboarding across the same matrix, with clear retryable errors instead of a dead end.
//  C. Leaving without phone verification: mid-verification, profile-less and existing accounts, with retries.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.cwd();
const env = { NODE_ENV: 'test', PHONE_OTP_ENABLED: 'true', SMS_SEND_ENABLED: 'true', SMS_PROVIDER: 'ncloud', PARENT_PHONE_OTP_HMAC_SECRET: 'test-only-secret-'.repeat(4), NCP_ACCESS_KEY: 'x', NCP_SECRET_KEY: 'x', NCP_SENS_SMS_SERVICE_ID: 'x', NCP_SENS_SMS_FROM_NUMBER: '01000000000' };
const warnings = [];
const sandboxConsole = { log() {}, info() {}, error() {}, warn: (...a) => warnings.push(a.join(' ')) };
// ORACLE_REF: the deployed server code (origin/main) is loaded straight from git for the "today" side.
const ORACLE_REF = process.env.ORACLE_REF || 'origin/main';
const atRef = file => require('node:child_process').execFileSync('git', ['show', `${ORACLE_REF}:${file}`], { encoding: 'utf8' });
function load(file, mocks = {}, ref = null) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(ref ? atRef(file) : fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, Request, Response, FormData, console: sandboxConsole, process: { env }, require(name) {
      if (name === 'server-only') return {};
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts', mocks, ref);
      if (name.startsWith('.')) return load(path.normalize(path.join(path.dirname(file), name)) + '.ts', mocks, ref);
      return require(name);
    } }, { filename: file });
  return exports;
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = (...p) => p.map(provider => ({ provider }));
// required/verified are what get_my_parent_phone_status returns today for each cohort.
const COHORTS = {
  kakao: { identities: ids('kakao'), profile: true, required: false, verified: false },
  grandfatherApple: { identities: ids('apple'), profile: true, required: false, verified: false, phone: '010-1234-5678' },
  appleWithKakao: { identities: ids('apple', 'kakao'), profile: true, required: false, verified: false },
  verifiedApple: { identities: ids('apple'), profile: true, required: true, verified: true },
  pendingApple: { identities: ids('apple'), profile: true, required: true, verified: false },
  appReview: { identities: ids('email'), profile: true, required: false, verified: false, review: true },
  deleting: { identities: ids('apple'), profile: false, required: false, verified: false, deletion: true },
  profilelessApple: { identities: ids('apple'), profile: false, required: false, verified: false },
};
let world;
function setup(cohort, { migration = true, enrollError = false } = {}) {
  const c = COHORTS[cohort], n = Object.keys(COHORTS).indexOf(cohort) + 1;
  world = { cohort, migration, enrollError, calls: [], deleted: [], revoked: [], uid: id(n), deleteFails: 0, revokeFails: 0, prepared: 0,
    user: { id: id(n), email: `p${n}@example.com`, identities: c.identities, app_metadata: c.review ? { provider: 'email', app_store_review: true } : { provider: c.identities[0].provider }, user_metadata: {} },
    profile: c.profile ? { id: id(n), role: 'parent', name: '보호자' } : null, deletion: Boolean(c.deletion),
    status: { required: c.required, verified: c.verified, phoneVerifiedAt: c.verified ? '2026-10-04T00:00:00Z' : null, profileMissing: !c.profile, phone: c.phone ?? null, ...(c.deletion ? { excluded: true } : {}) } };
}
const db = {
  auth: { getUser: async token => (token === undefined || token === 'good') ? { data: { user: world.user }, error: null } : { data: { user: null }, error: {} },
    getClaims: async () => ({ data: { claims: { sub: world.uid, session_id: id(99) } } }) },
  from: table => {
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q, range: async () => ({ data: [], error: null }),
      maybeSingle: async () => table === 'profiles' ? { data: world.profile, error: null } : { data: null, error: null },
      insert: async row => { world.profile = { id: row.id, role: row.role, name: row.name }; return { error: null }; } };
    return q;
  },
  rpc: async name => {
    world.calls.push(name);
    if (name === 'get_my_parent_account_deletion_status') return { data: world.deletion, error: null };
    if (name === 'get_my_parent_phone_status') return { data: world.status, error: null };
    if (name === 'get_my_parent_phone_challenge') return { data: {}, error: null };
    if (name === 'get_my_parent_erasure_contract') return { data: 2, error: null };
    if (name === 'prepare_my_parent_account_deletion') { world.prepared++; if (!world.profile && !world.deletion) return { data: null, error: { message: 'parent_auth_required' } }; world.deletion = true; world.profile = null; return { data: 'db_cleaned', error: null }; }
    if (name === 'get_my_parent_deletion_storage_objects') return { data: [], error: null };
    return { data: null, error: { code: 'XX000', message: 'not in fixture' } };
  }
};
const service = { rpc: async (name, args) => {
  world.calls.push(name);
  if (name === 'enroll_oauth_parent_phone') {
    if (!world.migration) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    if (world.enrollError) return { data: null, error: { code: '57014', message: 'timeout' } };
    assert.equal(args.p_user, world.uid);
    world.status = { ...world.status, required: true }; return { data: world.status, error: null };
  }
  if (name === 'enroll_new_apple_parent_phone') { world.status = { ...world.status, required: true }; return { data: world.status, error: null }; }
  return { data: null, error: { message: 'unexpected ' + name } };
} };
const admin = { auth: { admin: { deleteUser: async uid => { if (world.deleteFails-- > 0) return { error: { status: 500, code: 'unexpected_failure' } }; world.deleted.push(uid); return { error: null }; } } }, storage: { from: () => ({ remove: async () => ({ error: null }) }) } };
const mocks = {
  '@/integrations/supabase/server': { getSupabaseServerClient: async () => { throw new Error('cookie client is web-only'); } },
  '@/integrations/supabase/service-role': { getSupabaseServiceRoleClient: () => service },
  '@/features/notifications/sms/sender': { sendSms: async () => ({ status: 'sent' }) },
  '@/features/auth/lib/apple-token-revocation': { appleRevocationConfigFromEnv: () => ({ fixture: true }), revokeAppleGrantForUser: async (user, token) => {
    if (world.revokeFails-- > 0) return { ok: false, error: 'apple_revocation_failed' };
    world.revoked.push(token); return { ok: true }; } }
};
const gate = load('src/features/auth/phone/gate.ts', mocks);
const { createNativeParentReader } = load('src/features/native/server/parent-reader.ts', mocks);
const { createNativePushDeviceHandler } = load('src/features/native/server/push-device.ts', mocks);
const { createNativeMarketingConsentHandler } = load('src/features/marketing-consent/server/native-handler.ts', mocks);
const { nativeDeletion } = load('src/features/native/server/deletion.ts', mocks);
const { deleteParentAccountWithApple } = load('src/features/my/lib/delete-parent-account-with-apple.ts', mocks);
const { createNativeOnboarding } = load('src/features/native/server/onboarding.ts', mocks);
const otp = load('src/features/auth/phone/otp.ts', mocks), phoneService = load('src/features/auth/phone/service.ts', mocks);

const oracle = {
  reader: load('src/features/native/server/parent-reader.ts', mocks, ORACLE_REF).createNativeParentReader,
  push: load('src/features/native/server/push-device.ts', mocks, ORACLE_REF).createNativePushDeviceHandler,
  consent: load('src/features/marketing-consent/server/native-handler.ts', mocks, ORACLE_REF).createNativeMarketingConsentHandler,
  deletion: load('src/features/native/server/deletion.ts', mocks, ORACLE_REF).nativeDeletion,
  deleteAccount: load('src/features/my/lib/delete-parent-account-with-apple.ts', mocks, ORACLE_REF).deleteParentAccountWithApple
};
let gateMode; // undefined = shipped routes
const gated = via => (c, u) => gate.readNativeParentPhoneState(c, u, gateMode ? { via, mode: gateMode } : { via });
const deletion = (request, client) => nativeDeletion(request, client, { enabled: true, run: token => deleteParentAccountWithApple(client, admin, { appleRefreshToken: token, allowPreProfile: true }) });
const legacyDeletion = (request, client) => oracle.deletion(request, client, { enabled: true, run: token => oracle.deleteAccount(client, admin, { appleRefreshToken: token }) });
const base = { client: () => db, storage: () => ({}), reviewAccess: async () => {}, pushDevice: async () => Response.json({ ok: true }) };
// Today's production wiring (no phoneState) is the oracle for "unchanged".
const legacyReader = oracle.reader({ ...base, deletion: legacyDeletion });
const newReader = createNativeParentReader({ ...base, deletion, phoneState: gated('api') });
const legacyPush = oracle.push({ client: () => db, enabled: () => true });
const newPush = createNativePushDeviceHandler({ client: () => db, enabled: () => true, phoneState: gated('api') });
const legacyConsent = oracle.consent({ client: () => db });
const newConsent = createNativeMarketingConsentHandler({ client: () => db, phoneState: gated('api') });
const onboarding = createNativeOnboarding({ client: () => db, phoneState: gated('onboarding'),
  emailConflict: async () => ({ ok: true, reason: null }), otpReady: () => otp.otpConfigurationReady(), phoneAction: (i, c) => phoneService.runParentPhoneAction(i, c) });

const auth = { Authorization: 'Bearer good' };
// Every request shape the installed store app sends (src at e708047). The phone gate runs before
// path dispatch, so these cover all of its reader paths; post-gate handlers are unchanged code.
const OLD_APP = [
  ['GET', ['session']], ['GET', ['profile']], ['GET', ['children']], ['GET', ['notifications']], ['GET', ['applications']],
  ['GET', ['applications', id(50)]], ['GET', ['applications', id(50), 'report']], ['GET', ['applications', id(50), 'feedback']],
  ['GET', ['application-context', id(60)]], ['GET', ['photos', id(70)]], ['GET', ['account-deletion']], ['GET', ['push-devices']],
];
async function snapshot(response) { const text = await response.text(); return { status: response.status, body: text }; }
async function callReader(reader, method, p) {
  return snapshot(await reader(new Request('https://firstsuup.test/api/native/parent/' + p.join('/'), { method, headers: auth }), p));
}
let suites = 0; const pass = name => { suites++; console.log('PASS ' + name); };
(async () => {
  // A. Installed app compatibility matrix.
  const changedUnderAll = new Set(['grandfatherApple', 'appleWithKakao']);
  for (const migration of [false, true]) for (const mode of ['off', 'all']) {
    gateMode = mode === 'off' ? undefined : mode; env.PARENT_PHONE_EXISTING_GATE = 'all'; // env is ignored
    for (const cohort of Object.keys(COHORTS)) for (const [method, p] of OLD_APP) {
      setup(cohort, { migration }); const legacy = await callReader(legacyReader, method, p);
      setup(cohort, { migration }); const next = await callReader(newReader, method, p);
      const expectBlocked = mode === 'all' && migration && changedUnderAll.has(cohort) && p[0] !== 'account-deletion';
      // The one intended difference: an Apple sign-in that never got a profile can now open deletion
      // (today it is told "학부모 계정만 탈퇴할 수 있어요" and cannot leave).
      if (cohort === 'profilelessApple' && p[0] === 'account-deletion') {
        assert.equal(legacy.status, 403); assert.equal(next.status, 200); assert.deepEqual(JSON.parse(next.body), { enabled: true, pending: false });
      } else if (expectBlocked) { assert.equal(next.status, 403, `${cohort} ${p}`); assert.equal(JSON.parse(next.body).error, 'phone_verification_required'); }
      else assert.deepEqual(next, legacy, `migration=${migration} mode=${mode} ${cohort} ${method} ${p.join('/')}`);
      // The old app never calls onboarding, so no enrollment may happen outside `all`.
      if (mode !== 'all') assert(!world.calls.includes('enroll_oauth_parent_phone'), `${cohort} enrolled under ${mode}`);
    }
    for (const cohort of Object.keys(COHORTS)) for (const [legacy, next, url] of [[legacyPush, newPush, 'parent/push-devices'], [legacyConsent, newConsent, 'me/marketing-consent']]) {
      setup(cohort, { migration }); const a = await snapshot(await legacy(new Request('https://firstsuup.test/api/native/' + url, { headers: auth })));
      setup(cohort, { migration }); const b = await snapshot(await next(new Request('https://firstsuup.test/api/native/' + url, { headers: auth })));
      if (mode === 'all' && migration && changedUnderAll.has(cohort)) assert.equal(b.status, 403);
      else assert.deepEqual(b, a, `${url} migration=${migration} mode=${mode} ${cohort}`);
    }
  }
  gateMode = undefined; delete env.PARENT_PHONE_EXISTING_GATE;
  pass(`installed app vs ${ORACLE_REF} code: ${OLD_APP.length} reader requests + push + consent × 8 cohorts identical to today for migration before/after with the shipped routes (env set to all is ignored); the code-only all path changes only unverified existing Apple`);

  gateMode = 'all';
  for (const cohort of changedUnderAll) {
    setup(cohort, { migration: true, enrollError: true }); const legacy = await callReader(legacyReader, 'GET', ['session']);
    setup(cohort, { migration: true, enrollError: true }); const next = await callReader(newReader, 'GET', ['session']);
    assert.deepEqual(next, legacy);
  }
  assert(warnings.some(w => w.includes('existing-account enrollment unavailable')) && !warnings.some(w => /\d{3}-?\d{4}|@|0000-4000/.test(w)));
  gateMode = undefined;
  pass('enrollment failure for an existing account never creates a block; the warning carries no id, email or phone');

  // B. New app onboarding across the matrix.
  const step = async () => { const r = await onboarding(new Request('https://firstsuup.test/api/native/onboarding', { headers: auth })); return { http: r.status, ...(await r.json()) }; };
  for (const migration of [false, true]) for (const mode of ['off', 'all']) {
    gateMode = mode === 'off' ? undefined : mode; env.PARENT_PHONE_EXISTING_GATE = 'all'; // env is ignored
    setup('kakao', { migration }); assert.equal((await step()).step, 'ready');
    setup('verifiedApple', { migration }); assert.equal((await step()).step, 'ready');
    setup('pendingApple', { migration }); assert.equal((await step()).step, 'phone');
    setup('grandfatherApple', { migration });
    assert.equal((await step()).step, mode === 'all' && migration ? 'phone' : 'ready', `grandfather migration=${migration} mode=${mode}`);
    setup('profilelessApple', { migration }); let r = await step();
    assert.equal(r.step, 'phone'); assert.equal(world.calls.includes('enroll_new_apple_parent_phone'), !migration, 'pre-migration falls back to the web Apple enrollment');
    setup('profilelessApple', { migration }); world.user.identities = ids('google'); r = await step();
    if (migration) assert.equal(r.step, 'phone'); else { assert.equal(r.http, 503); assert.equal(r.error, 'onboarding_unavailable'); }
  }
  gateMode = undefined;
  pass('new app onboarding: new signups always verify; existing Apple only on the code-only path; pre-migration Google stops with a retryable error (provider stays OFF)');

  // C. Leaving without phone verification.
  const del = async (method = 'GET', body) => snapshot(await newReader(new Request('https://firstsuup.test/api/native/parent/account-deletion', {
    method, headers: { ...auth, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }), ['account-deletion']));
  // Mid-verification Google signup: no profile, enrollment pending.
  setup('profilelessApple'); world.user.identities = ids('google'); world.user.app_metadata = { provider: 'google' }; world.status.required = true;
  assert.equal((await callReader(newReader, 'GET', ['session'])).status, 403, 'other APIs stay closed');
  let r = await del(); assert.equal(r.status, 200); assert.deepEqual(JSON.parse(r.body), { enabled: true, pending: false });
  world.deleteFails = 1;
  r = await del('POST', { confirmation: 'delete' }); assert.equal(r.status, 503); assert.equal(world.deleted.length, 0);
  r = await del('POST', { confirmation: 'delete' }); assert.equal(r.status, 200); assert.deepEqual(world.deleted, [world.uid]);
  assert.equal(world.prepared, 0, 'no profile workflow for a profile-less account');
  pass('mid-verification Google account: deletion allowed without verification; failed Auth delete is retried to success; other APIs stay closed');

  // Profile-less Apple (verified, waiting for the name step): Apple re-auth + revocation stay mandatory.
  setup('profilelessApple'); world.status = { required: true, verified: true, phoneVerifiedAt: '2026-10-30T00:00:00Z', profileMissing: true };
  r = await del('POST', { confirmation: 'delete' }); assert.equal(r.status, 503); assert.equal(JSON.parse(r.body).appleReauthRequired, true); assert.equal(world.deleted.length, 0);
  world.revokeFails = 1;
  r = await del('POST', { confirmation: 'delete', appleRefreshToken: 'apple-rt-1' }); assert.equal(JSON.parse(r.body).appleReauthRequired, true); assert.equal(world.deleted.length, 0);
  r = await del('POST', { confirmation: 'delete', appleRefreshToken: 'apple-rt-2' }); assert.equal(r.status, 200);
  assert.deepEqual(world.revoked, ['apple-rt-2']); assert.deepEqual(world.deleted, [world.uid]);
  pass('profile-less Apple account: re-auth required, failed revocation deletes nothing, retry revokes then deletes');

  // Existing Parent asked to verify (code-only all path) but never did: the existing erasure workflow runs.
  gateMode = 'all';
  setup('grandfatherApple');
  assert.equal((await callReader(newReader, 'GET', ['session'])).status, 403);
  r = await del('POST', { confirmation: 'delete', appleRefreshToken: 'apple-rt-3' }); assert.equal(r.status, 200);
  assert.equal(world.prepared, 1); assert.deepEqual(world.deleted, [world.uid]); assert.deepEqual(world.revoked, ['apple-rt-3']);
  setup('kakao'); world.status.required = true;
  world.deleteFails = 1; r = await del('POST', { confirmation: 'delete' }); assert.equal(r.status, 503); assert.equal(JSON.parse(r.body).cleanupStarted, true);
  r = await del(); assert.equal(JSON.parse(r.body).pending, true, 'the existing retry marker drives the retry');
  r = await del('POST', { confirmation: 'delete' }); assert.equal(r.status, 200); assert.deepEqual(world.deleted, [world.uid]);
  gateMode = undefined;
  pass('existing unverified Parent: existing erasure workflow (Apple revocation, cleanup, retry marker) without phone verification');

  for (const [cohort, tweak] of [['profilelessApple', u => { u.user_metadata = { signup_intent: 'teacher_public' }; }], ['profilelessApple', u => { u.app_metadata = { provider: 'email', app_store_review: true }; }]]) {
    setup(cohort); tweak(world.user);
    r = await del(); assert.equal(r.status, 403); assert.equal(JSON.parse(r.body).error, 'parent_required');
    r = await del('POST', { confirmation: 'delete', appleRefreshToken: 'x' }); assert.equal(r.status, 403); assert.equal(world.deleted.length + world.revoked.length, 0);
  }
  setup('kakao'); world.profile = { id: world.uid, role: 'academy' };
  r = await del('POST', { confirmation: 'delete' }); assert.equal(r.status, 403); assert.equal(world.deleted.length, 0);
  pass('Studio signup, App Review identity and non-parent roles cannot use the profile-less deletion path');

  setup('profilelessApple'); world.user.identities = ids('google');
  const webStyle = await deleteParentAccountWithApple(db, admin, {});
  const webToday = await oracle.deleteAccount(db, admin, {}); assert.equal(webToday.status, 'error');
  assert.equal(webStyle.status, 'error'); assert.equal(world.deleted.length, 0);
  pass('web deletion action is unchanged: no profile-less deletion without the native opt-in');

  console.log(`ALL PASS ${suites} native phone rollout/deletion suites; no network, SMS or Production access`);
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
