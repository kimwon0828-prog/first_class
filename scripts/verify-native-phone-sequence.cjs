// Same-account sequences across installed (old) and new apps on ONE isolated PostgreSQL (PGlite) with the
// real migrations. Old app = today's server code loaded from git (ORACLE_REF, default origin/main) with no
// phone-gate dependency; new app = this worktree's onboarding + reader. Both talk to the same database,
// so every step sees the state the previous step left behind. Synthetic users, virtual SMS, no network.
//   ENROLL_MODE=all  shows what happens once existing-account enrollment is switched on (hazard demo).
//   DEMO=1           print the step table without asserting (to inspect another code version).
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { execFileSync } = require('node:child_process');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const { createParentPhoneSchema, read } = require('./lib/parent-phone-fixture.cjs');
const root = process.cwd(), ORACLE_REF = process.env.ORACLE_REF || 'origin/main', DEMO = process.env.DEMO === '1';
const env = { NODE_ENV: 'test', PHONE_OTP_ENABLED: 'true', SMS_SEND_ENABLED: 'true', SMS_PROVIDER: 'ncloud', PARENT_PHONE_OTP_HMAC_SECRET: 'test-only-secret-'.repeat(4), NCP_ACCESS_KEY: 'x', NCP_SECRET_KEY: 'x', NCP_SENS_SMS_SERVICE_ID: 'x', NCP_SENS_SMS_FROM_NUMBER: '01000000000' };
const pg = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sms = [];
let chain = Promise.resolve();
// One statement group at a time, each under its own role/JWT, as PostgREST would run it.
function exclusive(role, claims, fn) {
  const run = chain.then(() => pg.transaction(async tx => {
    await tx.exec(`set local role ${role}`);
    if (claims) await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    return fn(tx);
  }));
  chain = run.catch(() => {});
  return run;
}
const users = new Map();
function client(uid) {
  const claims = uid === 'service' ? null : { sub: uid, role: 'authenticated', session_id: uid };
  const role = uid === 'service' ? 'service_role' : 'authenticated';
  const wrap = async fn => { try { return await exclusive(role, claims, fn); } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; } };
  return {
    auth: {
      getUser: async () => users.has(uid) ? { data: { user: users.get(uid) }, error: null } : { data: { user: null }, error: { message: 'no user' } },
      getClaims: async () => ({ data: { claims }, error: null })
    },
    rpc: (name, args = {}) => wrap(async tx => {
      const keys = Object.keys(args);
      const sql = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as v`;
      return { data: (await tx.query(sql, keys.map(k => args[k]))).rows[0].v, error: null };
    }),
    from(table) {
      const where = []; let cols = '*';
      const builder = {
        select(c) { cols = c; return builder; },
        eq(col, value) { where.push([col, value]); return builder; },
        maybeSingle: () => wrap(async tx => {
          const sql = `select ${cols} from public.${table}${where.length ? ' where ' + where.map(([c], i) => `${c} = $${i + 1}`).join(' and ') : ''}`;
          return { data: (await tx.query(sql, where.map(([, v]) => v))).rows[0] ?? null, error: null };
        }),
        insert: row => wrap(async tx => {
          const keys = Object.keys(row);
          await tx.query(`insert into public.${table}(${keys.join(',')}) values(${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map(k => row[k]));
          return { error: null };
        })
      };
      return builder;
    }
  };
}
const service = client('service');
function load(file, mocks, ref) {
  const exports = {};
  const source = ref ? execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' }) : fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, Request, Response, FormData, console: { log() {}, info() {}, error() {}, warn() {} }, process: { env }, require(name) {
      if (name === 'server-only') return {};
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts', mocks, ref);
      if (name.startsWith('.')) return load(path.normalize(path.join(path.dirname(file), name)) + '.ts', mocks, ref);
      return require(name);
    } }, { filename: file });
  return exports;
}
const mocks = {
  '@/integrations/supabase/server': { getSupabaseServerClient: async () => { throw new Error('web only'); } },
  '@/integrations/supabase/service-role': { getSupabaseServiceRoleClient: () => service },
  '@/features/notifications/sms/sender': { sendSms: async message => { sms.push(message); return { status: 'sent' }; } }
};
const gate = load('src/features/auth/phone/gate.ts', mocks);
const otp = load('src/features/auth/phone/otp.ts', mocks), phoneService = load('src/features/auth/phone/service.ts', mocks);
const oldReader = load('src/features/native/server/parent-reader.ts', mocks, ORACLE_REF).createNativeParentReader({ client: t => client(t), storage: () => ({}), reviewAccess: async () => {}, pushDevice: async () => Response.json({ ok: true }) });
let enrollMode = process.env.ENROLL_MODE || undefined; // undefined = what the routes ship with
const phoneState = via => (db, user) => gate.readNativeParentPhoneState(db, user, enrollMode ? { via, mode: enrollMode } : { via });
const newReader = load('src/features/native/server/parent-reader.ts', mocks).createNativeParentReader({ client: t => client(t), storage: () => ({}), reviewAccess: async () => {}, pushDevice: async () => Response.json({ ok: true }), phoneState: phoneState('api') });
const onboarding = load('src/features/native/server/onboarding.ts', mocks).createNativeOnboarding({ client: t => client(t), phoneState: phoneState('onboarding'),
  emailConflict: async () => ({ ok: true, reason: null }), otpReady: () => otp.otpConfigurationReady(), phoneAction: (i, c) => phoneService.runParentPhoneAction(i, c) });

const call = async (handler, uid, p, init = {}) => { const r = await handler(new Request('https://firstsuup.test/x', { ...init, headers: { Authorization: `Bearer ${uid}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } }), p); return { status: r.status, body: await r.json() }; };
const oldApp = (uid, p = ['session']) => call(oldReader, uid, p);
const newApp = (uid, p = ['session']) => call(newReader, uid, p);
const step = uid => call(onboarding, uid);
const post = (uid, body) => call(onboarding, uid, undefined, { method: 'POST', body: JSON.stringify(body) });
async function oldAppApplies(uid) {
  try { await exclusive('authenticated', { sub: uid, role: 'authenticated' }, tx => tx.query(`insert into trial_applications(id,parent_id,class_id,child_name,child_grade,parent_name,parent_phone,status) values($1,$2,$3,'c','초1','p','01000000000','new')`, [id(5000 + Math.floor(Math.random() * 4000)), uid, id(90)])); return 'ok'; }
  catch (e) { return e.message; }
}
const age = uid => exclusive('postgres', null, tx => tx.query("update app.parent_phone_challenges set created_at=created_at-interval '61 seconds' where user_id=$1", [uid]));
async function finishVerification(uid, phone) {
  await age(uid);
  const sent = await post(uid, { action: 'send', phone });
  assert.equal(sent.body.status, 'sent', JSON.stringify(sent.body));
  const code = sms.at(-1).messagePreview.match(/\[(\d{6})\]/)[1];
  return post(uid, { action: 'verify', challengeId: sent.body.challengeId, code });
}
async function addUser(n, providers, { profile = true, phone = null } = {}) {
  const uid = id(n);
  await exclusive('postgres', null, async tx => {
    await tx.query('insert into auth.users(id) values($1)', [uid]); await tx.query('insert into auth.sessions values($1,$1)', [uid]);
    for (const p of providers) await tx.query('insert into auth.identities values($1,$2)', [uid, p]);
    if (profile) await tx.query("insert into profiles(id,role,name,phone) values($1,'parent','보호자',$2)", [uid, phone]);
  });
  users.set(uid, { id: uid, email: `u${n}@example.com`, identities: providers.map(provider => ({ provider })), app_metadata: { provider: providers[0] }, user_metadata: providers.includes('kakao') ? { name: '카카오보호자' } : {} });
  return uid;
}
// Supabase links a same-email Google sign-in into the existing user: same id, one more identity.
async function linkGoogle(uid) {
  await exclusive('postgres', null, tx => tx.query("insert into auth.identities values($1,'google')", [uid]));
  users.get(uid).identities.push({ provider: 'google' });
}
const table = [];
const record = (who, label, value) => { table.push({ who, label, value: typeof value === 'string' ? value : `${value.status}${value.body?.error ? ' ' + value.body.error : value.body?.step ? ' step=' + value.body.step : value.body?.status ? ' ' + value.body.status : ''}` }); return value; };
const check = (actual, expected, message) => { if (!DEMO) assert.equal(actual, expected, message); };

(async () => {
  await createParentPhoneSchema(pg);
  await pg.exec(read('20261030120000_oauth_parent_phone_enrollment.sql'));
  await pg.query("insert into classes(id,program_type) values($1,'trial_class')", [id(90)]);
  const shipped = !enrollMode;

  // 1. Existing Apple Parent (stored but unverified phone): the full sequence on ONE account.
  const apple = await addUser(1, ['apple'], { phone: '010-1234-5678' });
  check(record('기존 Apple', '1 구버전 정상 이용', await oldApp(apple)).status, 200);
  const first = record('기존 Apple', '2 새 앱 온보딩', await step(apple));
  check(first.body.step, shipped ? 'ready' : 'phone');
  if (first.body.step === 'phone') record('기존 Apple', '3 인증 시작(문자 발송) 후 중단', (await post(apple, { action: 'send', phone: '01012345678' })));
  const other = record('기존 Apple', '4 다른 기기 구버전 API', await oldApp(apple));
  record('기존 Apple', '4 다른 기기 구버전 신청(DB)', await oldAppApplies(apple));
  check(other.status, shipped ? 200 : 403);
  const savedMode = enrollMode; enrollMode = 'off';
  const afterOff = record('기존 Apple', '5 설정 off 후 구버전 API', await oldApp(apple));
  check(afterOff.status, shipped ? 200 : 403, 'switching off does not undo a stored requirement');
  record('기존 Apple', '5 설정 off 후 새 앱 온보딩', await step(apple));
  enrollMode = savedMode;
  if (!shipped) {
    const done = record('기존 Apple', '6 새 앱에서 인증 완료', await finishVerification(apple, '01012345678'));
    check(done.body.status, 'verified');
  }
  check(record('기존 Apple', '6 구버전 재접속', await oldApp(apple)).status, 200);
  check(record('기존 Apple', '6 새 앱 재접속', await step(apple)).body.step, 'ready');
  check(record('기존 Apple', '6 구버전 신청(DB)', await oldAppApplies(apple)), 'ok');

  // 2. Google linked into an existing Kakao account and an existing Apple account (Supabase same-email linking).
  for (const [n, providers, who] of [[2, ['kakao'], '카카오+Google'], [3, ['apple'], 'Apple+Google']]) {
    const uid = await addUser(n, providers);
    check(record(who, '1 구버전 정상 이용', await oldApp(uid)).status, 200);
    await linkGoogle(uid);
    const s = record(who, '2 Google 연결 후 새 앱 온보딩', await step(uid));
    check(s.body.step, shipped ? 'ready' : 'phone');
    if (s.body.step === 'phone') await post(uid, { action: 'send', phone: `0105555000${n}` });
    check(record(who, '4 다른 기기 구버전 API', await oldApp(uid)).status, shipped ? 200 : 403);
    enrollMode = 'off'; check(record(who, '5 설정 off 후 구버전 API', await oldApp(uid)).status, shipped ? 200 : 403); enrollMode = savedMode;
    if (!shipped) check(record(who, '6 새 앱에서 인증 완료', await finishVerification(uid, `0105555000${n}`)).body.status, 'verified');
    check(record(who, '6 구버전 재접속', await oldApp(uid)).status, 200);
    check(record(who, '6 새 앱 재접속', await step(uid)).body.step, 'ready');
  }

  // 3. New Apple signup in the new app, also signed in on an old-app device meanwhile.
  const fresh = await addUser(4, ['apple'], { profile: false });
  check(record('신규 Apple', '1 새 앱 가입 → 온보딩', await step(fresh)).body.step, 'phone');
  check(record('신규 Apple', '2 인증 중 구버전 API', await oldApp(fresh)).body.error, 'parent_required');
  check(record('신규 Apple', '3 인증 완료', await finishVerification(fresh, '01066667777')).body.step, 'name');
  check(record('신규 Apple', '4 이름 입력', await post(fresh, { action: 'name', name: '홍길동' })).body.step, 'ready');
  check(record('신규 Apple', '5 구버전 재접속', await oldApp(fresh)).status, 200);
  check(record('신규 Apple', '5 구버전 신청(DB)', await oldAppApplies(fresh)), 'ok');

  // 4. Web Apple signup that stopped before OTP: enrolled, no profile yet (the DB refuses an unverified
  //    required profile). Every app answers parent_required today; the new app can finish it.
  const pending = await addUser(5, ['apple'], { profile: false });
  await exclusive('service_role', null, tx => tx.query('select public.enroll_new_apple_parent_phone($1)', [pending]));
  check(record('웹 미인증 Apple', '1 구버전(오늘과 동일)', await oldApp(pending)).body.error, 'parent_required');
  check(record('웹 미인증 Apple', '2 새 앱 인증 완료', await finishVerification(pending, '01088889999')).body.step, 'name');
  check(record('웹 미인증 Apple', '3 이름 입력', await post(pending, { action: 'name', name: '김보호' })).body.step, 'ready');
  check(record('웹 미인증 Apple', '4 구버전 재접속', await oldApp(pending)).status, 200);

  // 5. Kakao only: nothing changes anywhere.
  const kakao = await addUser(6, ['kakao']);
  check(record('카카오', '새 앱 온보딩', await step(kakao)).body.step, 'ready');
  check(record('카카오', '구버전 API', await oldApp(kakao)).status, 200);

  const counts = (await pg.query(`select count(*) filter (where p.id is not null and not p.phone_verification_required)::int existing_enrolled
    from app.parent_phone_verifications v left join profiles p on p.id = v.user_id where v.verified_at is null or not p.phone_verification_required`)).rows[0];
  if (shipped) assert.equal(counts.existing_enrolled, 0, 'shipped code never stores a requirement on an existing account');

  console.log(`mode: ${shipped ? 'shipped routes' : 'ENROLL_MODE=' + enrollMode} · old app code: ${ORACLE_REF}`);
  for (const row of table) console.log(`${row.who.padEnd(10)} ${row.label.padEnd(28)} ${row.value}`);
  if (!DEMO) console.log('ALL PASS same-account sequence' + (shipped ? ' (shipped: existing accounts never enrolled; old app unaffected)' : ' (hazard demo assertions)'));
})().catch(error => { console.error('FAIL', error); for (const row of table) console.error(`${row.who} ${row.label} ${row.value}`); process.exitCode = 1; }).finally(() => pg.close());
