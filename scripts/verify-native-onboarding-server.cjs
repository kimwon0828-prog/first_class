// Actual native onboarding handler + phone gate + shared OTP service + HMAC with inert Supabase and a virtual SMS sender.
// Synthetic users only. No network, Production access, or real SMS.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.cwd();
const env = { NODE_ENV: 'test', PHONE_OTP_ENABLED: 'true', SMS_SEND_ENABLED: 'true', SMS_PROVIDER: 'ncloud', PARENT_PHONE_OTP_HMAC_SECRET: 'test-only-secret-'.repeat(4), NCP_ACCESS_KEY: 'fixture', NCP_SECRET_KEY: 'fixture', NCP_SENS_SMS_SERVICE_ID: 'fixture', NCP_SENS_SMS_FROM_NUMBER: '01000000000' };
const uid = '00000000-0000-4000-8000-000000000001', sid = '00000000-0000-4000-8000-000000000002';
const logs = [];
const quietConsole = { log: (...a) => logs.push(a), info: (...a) => logs.push(a), warn: (...a) => logs.push(a), error: (...a) => logs.push(a) };
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, Request, Response, FormData, console: quietConsole, process: { env }, require(name) {
      if (name === 'server-only') return {};
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts', mocks);
      if (name.startsWith('.')) return load(path.normalize(path.join(path.dirname(file), name)) + '.ts', mocks);
      return require(name);
    } }, { filename: file });
  return exports;
}
let s;
let gateMode; // undefined = shipped routes (existing-account enrollment fixed off)
const plain = value => JSON.parse(JSON.stringify(value));
const identities = (...providers) => providers.map(provider => ({ provider }));
function reset(kind = 'google') {
  s = {
    user: { id: uid, email: 'parent@example.com', app_metadata: { provider: kind }, user_metadata: kind === 'apple' ? {} : { full_name: '김보호' }, identities: identities(kind) },
    profile: null, deletion: false, status: { required: false, verified: false, phoneVerifiedAt: null, profileMissing: true },
    resume: {}, conflict: true, claimsSub: uid, inserts: [], calls: [], sms: [], sent: 'sent', verify: { status: 'verified' }, statusError: false
  };
}
const fakeDb = {
  auth: {
    getUser: async token => token === 'good' && s.user ? { data: { user: s.user }, error: null } : { data: { user: null }, error: { message: 'bad' } },
    getClaims: async () => ({ data: { claims: { sub: s.claimsSub, session_id: sid } }, error: null })
  },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: s.profile, error: null }) }) }),
    insert: async row => { s.inserts.push(row); if (s.profile) return { error: { message: 'duplicate' } }; s.profile = { id: row.id, role: row.role }; return { error: null } }
  }),
  rpc: async name => {
    s.calls.push({ name });
    if (name === 'get_my_parent_account_deletion_status') return { data: s.deletion, error: null };
    if (name === 'get_my_parent_phone_status') return s.statusError ? { data: null, error: { message: 'x' } } : { data: s.status, error: null };
    if (name === 'get_my_parent_phone_challenge') return { data: s.resume, error: null };
    return { data: null, error: { message: 'unexpected ' + name } };
  }
};
const service = { rpc: async (name, args) => {
  s.calls.push({ name, args });
  if (name === 'enroll_oauth_parent_phone') { s.status = { ...s.status, required: true }; return { data: s.status, error: null }; }
  if (name === 'begin_parent_phone_challenge') return { data: { status: s.begin || 'created' }, error: null };
  if (name === 'mark_parent_phone_challenge_sent') return { error: null };
  if (name === 'verify_parent_phone_challenge') {
    if (s.verify.status === 'verified') s.status = { ...s.status, verified: true, phoneVerifiedAt: '2026-10-30T01:00:00Z', phone: '01055556666' };
    return { data: s.verify, error: null };
  }
  return { data: null, error: { message: 'unexpected' } };
} };
const virtualSms = { sendSms: async arg => { s.sms.push(arg); return { status: s.sent }; } };
const mocks = {
  '@/integrations/supabase/server': { getSupabaseServerClient: async () => { throw new Error('cookie client must not be used by native'); } },
  '@/integrations/supabase/service-role': { getSupabaseServiceRoleClient: () => service },
  '@/features/notifications/sms/sender': virtualSms
};
const gate = load('src/features/auth/phone/gate.ts', mocks);
const otp = load('src/features/auth/phone/otp.ts', mocks);
const phoneService = load('src/features/auth/phone/service.ts', mocks);
const { createNativeOnboarding } = load('src/features/native/server/onboarding.ts', mocks);
const { createNativeParentReader } = load('src/features/native/server/parent-reader.ts', mocks);
const handle = createNativeOnboarding({
  client: () => fakeDb,
  phoneState: (db, user) => gate.readNativeParentPhoneState(db, user, gateMode ? { via: 'onboarding', mode: gateMode } : { via: 'onboarding' }),
  emailConflict: async () => ({ ok: s.conflict, reason: s.conflict ? null : (s.conflictReason || 'existing_email_account') }),
  otpReady: () => otp.otpConfigurationReady(),
  phoneAction: (input, caller) => phoneService.runParentPhoneAction(input, caller)
});
async function call(method = 'GET', body, token = 'good') {
  const response = await handle(new Request('https://firstsuup.test/api/native/onboarding', {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), 'x-vercel-forwarded-for': '203.0.113.9' },
    body: body ? JSON.stringify(body) : undefined
  }));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const text = await response.text();
  return { http: response.status, text, ...JSON.parse(text) };
}
let suites = 0; const pass = name => { suites++; console.log('PASS ' + name); };
(async () => {
  reset(); assert.equal((await call('GET', undefined, null)).http, 401); assert.equal((await call('GET', undefined, 'bad')).http, 401);
  assert.equal(s.calls.length, 0);
  pass('missing/invalid bearer → login_required before any account read');

  reset('kakao'); let r = await call();
  assert.equal(r.step, 'ready'); assert.equal(s.inserts.length, 1);
  assert.deepEqual(plain(s.inserts[0]), { id: uid, role: 'parent', name: '김보호', parent_birth_date: null, organization_id: null, phone: null });
  assert(!s.calls.some(c => c.name === 'enroll_oauth_parent_phone'));
  reset('kakao'); s.profile = { id: uid, role: 'parent' }; s.status.profileMissing = false; r = await call();
  assert.equal(r.step, 'ready'); assert.equal(s.inserts.length, 0); assert(!s.calls.some(c => c.name === 'enroll_oauth_parent_phone'));
  pass('Kakao: new account gets a Parent profile without phone fields; existing account goes straight in; never enrolled');

  reset('google'); r = await call();
  assert.equal(r.step, 'phone'); assert.equal(r.available, true); assert.equal(r.challenge, null); assert.equal(s.inserts.length, 0);
  assert.equal(s.calls.filter(c => c.name === 'enroll_oauth_parent_phone').length, 1);
  assert.equal(s.calls.find(c => c.name === 'enroll_oauth_parent_phone').args.p_user, uid);
  r = await call('POST', { action: 'name', name: '우회시도' }); assert.equal(r.step, 'phone'); assert.equal(s.inserts.length, 0);
  pass('new Google: server enrolls, phone step, no profile; a name/skip request cannot bypass');

  const sent = await call('POST', { action: 'send', phone: '010-5555-6666', userId: 'other', sessionId: 'forged' });
  assert.equal(sent.status, 'sent'); assert.equal(sent.retryAfter, 60); assert.equal(sent.expiresIn, 300);
  const begin = s.calls.find(c => c.name === 'begin_parent_phone_challenge').args;
  assert.equal(begin.p_user, uid); assert.equal(begin.p_session, sid); assert.equal(begin.p_phone, '01055556666');
  assert.equal(s.sms.length, 1); assert.equal(s.sms[0].phone, '01055556666');
  const code = s.sms[0].messagePreview.match(/\[(\d{6})\]/)[1];
  assert.equal(begin.p_hash, otp.hashPhoneOtp(sent.challengeId, uid, code));
  assert(!sent.text.includes(code)); assert(!sent.text.includes('01055556666'));
  assert.equal(begin.p_ip_hash, otp.hashOtpIp('203.0.113.9'));
  pass('send: virtual SMS gets the code; DB stores only HMAC; user/session come from the verified token, not the body');

  r = await call('POST', { action: 'verify', challengeId: sent.challengeId, code });
  assert.equal(r.status, 'verified'); assert.equal(r.step, 'ready');
  assert.equal(s.calls.find(c => c.name === 'verify_parent_phone_challenge').args.p_hash, begin.p_hash);
  assert.deepEqual(plain(s.inserts.at(-1)), { id: uid, role: 'parent', name: '김보호', parent_birth_date: null, organization_id: null, phone: '01055556666', phone_verification_required: true, phone_verified_at: '2026-10-30T01:00:00Z' });
  s.calls = []; r = await call(); assert.equal(r.step, 'ready'); assert(!s.calls.some(c => c.name === 'enroll_oauth_parent_phone'));
  assert.equal(s.sms.length, 1);
  pass('verify → profile copies the server proof → ready; re-login skips verification and sends nothing');

  reset('apple'); s.status = { required: true, verified: true, phoneVerifiedAt: '2026-10-30T01:00:00Z', phone: '01077778888', profileMissing: true };
  r = await call(); assert.equal(r.step, 'name'); assert.equal(s.inserts.length, 0);
  for (const name of ['', '김', 'x'.repeat(31), '홍\u0000길동']) assert.equal((await call('POST', { action: 'name', name })).http, 400);
  r = await call('POST', { action: 'name', name: ' 홍길동 ', phone: '01000000000' });
  assert.equal(r.step, 'ready');
  assert.deepEqual(plain(s.inserts.at(-1)), { id: uid, role: 'parent', name: '홍길동', parent_birth_date: null, organization_id: null, phone: '01077778888', phone_verification_required: true, phone_verified_at: '2026-10-30T01:00:00Z' });
  pass('Apple without a provider name: name step after verification; body phone ignored; profile copies proof');

  const existingApple = () => { reset('apple'); s.profile = { id: uid, role: 'parent' }; s.status = { required: false, verified: false, phoneVerifiedAt: null, phone: '010-1234-5678', profileMissing: false }; };
  existingApple(); r = await call(); assert.equal(r.step, 'ready'); assert(!s.calls.some(c => c.name === 'enroll_oauth_parent_phone'));
  env.PARENT_PHONE_EXISTING_GATE = 'all'; existingApple(); r = await call(); assert.equal(r.step, 'ready', 'no env switch exists');
  delete env.PARENT_PHONE_EXISTING_GATE;
  gateMode = 'all'; existingApple(); r = await call();
  assert.equal(r.step, 'phone'); assert.equal(r.phone, '01012345678'); assert.equal(s.inserts.length, 0);
  gateMode = undefined;
  pass('existing Apple Parent without proof: shipped → ready (env cannot change it); existing enrollment path (code-only) → stored phone is only a prefill');

  reset('google'); s.user.identities = identities('google', 'kakao'); r = await call(); assert.equal(r.step, 'phone');
  pass('new Google+Kakao signup (no profile) is not exempted by the Kakao link');

  reset('google'); s.status = { required: true, verified: false, phoneVerifiedAt: null, profileMissing: true };
  s.resume = { phone: '01055556666', challengeId: sid, retryAfter: 12.2, expiresIn: 251, attemptsLeft: 3 };
  r = await call(); assert.deepEqual(r.challenge, { challengeId: sid, retryAfter: 13, expiresIn: 251, attemptsLeft: 3 }); assert.equal(r.phone, '01055556666');
  s.resume = { phone: '01055556666', challengeId: null, retryAfter: 0 }; r = await call(); assert.equal(r.challenge, null);
  pass('app restart: own active challenge resumes with timer/attempts; consumed/expired challenge does not');

  for (const verify of [{ status: 'invalid_code', attemptsLeft: 3 }, { status: 'expired' }, { status: 'attempts_exceeded' }, { status: 'used' }, { status: 'duplicate_phone' }]) {
    reset('google'); s.status.required = true; s.verify = verify;
    r = await call('POST', { action: 'verify', challengeId: sid, code: '123456' });
    assert.equal(r.status, verify.status); assert.equal(r.attemptsLeft, verify.attemptsLeft); assert.equal(s.inserts.length, 0);
    assert(!/kakao|apple|google|@/i.test(r.text), 'no provider/account detail in ' + r.text);
  }
  reset('google'); s.status.required = true;
  assert.equal((await call('POST', { action: 'verify', challengeId: 'nope', code: '123456' })).status, 'invalid_code');
  assert.equal((await call('POST', { action: 'verify', challengeId: sid, code: '12345' })).status, 'invalid_code');
  assert.equal((await call('POST', { action: 'send', phone: '02-123-4567' })).status, 'invalid_phone');
  s.begin = 'cooldown'; assert.equal((await call('POST', { action: 'send', phone: '01055556666' })).status, 'cooldown'); assert.equal(s.sms.length, 0);
  pass('wrong/expired/locked/reused/duplicate pass through without profile writes or provider disclosure; input validation');

  reset('google'); s.status.required = true; s.claimsSub = 'someone-else';
  assert.equal((await call('POST', { action: 'send', phone: '01055556666' })).http, 401); assert.equal(s.sms.length, 0);
  pass('session binding: a token whose verified claims do not match the user cannot send');

  reset('google'); s.status.required = true; env.PHONE_OTP_ENABLED = 'false';
  r = await call(); assert.equal(r.available, false);
  r = await call('POST', { action: 'send', phone: '01055556666' }); assert.equal(r.http, 503); assert.equal(r.status, 'unavailable'); assert.equal(s.sms.length, 0);
  env.PHONE_OTP_ENABLED = 'true';
  for (const status of ['dry_run', 'failed']) { reset('google'); s.status.required = true; s.sent = status; assert.equal((await call('POST', { action: 'send', phone: '01055556666' })).status, 'unavailable'); }
  pass('OTP not configured or SMS not actually sent → unavailable, never treated as sent');

  reset('google'); s.user.user_metadata.signup_intent = 'teacher_public'; assert.equal((await call()).error, 'parent_required');
  reset('google'); s.deletion = true; assert.equal((await call()).error, 'account_deletion_pending');
  reset('google'); s.profile = { id: uid, role: 'academy' }; assert.equal((await call()).error, 'parent_required');
  reset('google'); s.conflict = false; r = await call(); assert.equal(r.http, 403); assert.equal(r.error, 'account_conflict'); assert.equal(s.inserts.length, 0);
  reset('kakao'); s.user.email = undefined; r = await call(); assert.equal(r.http, 403); assert.equal(r.error, 'email_required'); assert.equal(s.inserts.length, 0);
  reset('kakao'); s.conflict = false; s.conflictReason = 'account_check_failed'; r = await call(); assert.equal(r.http, 503); assert.equal(r.error, 'onboarding_unavailable');
  reset('google'); s.statusError = true; assert.equal((await call()).http, 503);
  pass('Studio/role/deletion/email-conflict/no-email/lookup-failure/status failure stop before any profile or OTP write');

  reset('email'); s.user.app_metadata = { provider: 'email', app_store_review: true }; s.profile = { id: uid, role: 'parent' }; s.status.profileMissing = false;
  r = await call(); assert.equal(r.step, 'ready'); assert(!s.calls.some(c => c.name === 'enroll_oauth_parent_phone'));
  pass('App Review account (email identity) keeps direct access');

  // Protected native reader with the enrollment-aware gate: skipping onboarding on the device cannot bypass.
  const reader = createNativeParentReader({ client: () => fakeDb, storage: () => ({}), phoneState: (db, user) => gate.readNativeParentPhoneState(db, user, gateMode ? { via: 'api', mode: gateMode } : { via: 'api' }) });
  reset('apple'); s.profile = { id: uid, role: 'parent', name: 'x' }; s.status.profileMissing = false;
  let res = await reader(new Request('https://firstsuup.test/api/native/parent/session', { headers: { Authorization: 'Bearer good' } }), ['session']);
  assert.equal(res.status, 200, 'switch OFF: existing Apple keeps access');
  gateMode = 'all';
  reset('apple'); s.profile = { id: uid, role: 'parent', name: 'x' }; s.status.profileMissing = false;
  res = await reader(new Request('https://firstsuup.test/api/native/parent/session', { headers: { Authorization: 'Bearer good' } }), ['session']);
  assert.equal(res.status, 403); assert.equal((await res.json()).error, 'phone_verification_required');
  assert.equal(s.calls.filter(c => c.name === 'enroll_oauth_parent_phone').length, 1);
  gateMode = undefined;
  reset('google'); s.user.identities = identities('google', 'kakao'); s.profile = { id: uid, role: 'parent', name: 'x' }; s.status.profileMissing = false;
  res = await reader(new Request('https://firstsuup.test/api/native/parent/session', { headers: { Authorization: 'Bearer good' } }), ['session']);
  assert.equal(res.status, 200, 'an existing account Supabase linked Google into keeps access (installed apps share it)');
  reset('kakao'); s.profile = { id: uid, role: 'parent', name: 'x' }; s.status.profileMissing = false;
  res = await reader(new Request('https://firstsuup.test/api/native/parent/session', { headers: { Authorization: 'Bearer good' } }), ['session']);
  assert.equal(res.status, 200);
  pass('protected native API: shipped keeps existing Apple and Google-linked existing accounts; code-only all → enforced; Kakao unchanged');

  const leaked = JSON.stringify(logs);
  assert(!/\d{6}/.test(leaked) && !leaked.includes('0105555'), 'no code/phone in logs');
  console.log(`ALL PASS ${suites} native onboarding server suites; virtual SMS only`);
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
