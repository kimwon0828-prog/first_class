// Real COMPAT + HARDENING + 20261030 OAuth enrollment SQL in isolated PostgreSQL (PGlite).
// Synthetic accounts only. No network, Production access, or SMS.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const { createParentPhoneSchema, read } = require('./lib/parent-phone-fixture.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const users = {
  grandApple: id(1), kakao: id(2), newGoogle: id(3), googleKakao: id(4), appleKakao: id(5), newApple: id(6),
  studio: id(7), review: id(8), deleting: id(9), stranger: id(10), grandGoogle: id(11), verifiedApple: id(12)
};
const providers = {
  grandApple: ['apple'], kakao: ['kakao'], newGoogle: ['google'], googleKakao: ['google', 'kakao'], appleKakao: ['apple', 'kakao'],
  newApple: ['apple'], studio: ['google'], review: ['email'], deleting: ['apple'], stranger: ['google'], grandGoogle: ['google'], verifiedApple: ['apple']
};
let serial = 100, suites = 0;
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const root = () => db.exec('reset role');
async function asUser(uid) {
  await db.exec(`reset role; set request.jwt.claims='${JSON.stringify({ sub: uid, role: 'authenticated', session_id: uid })}'; set role authenticated`);
}
async function service() { await db.exec('reset role; set role service_role'); }
const pass = name => { suites++; console.log('PASS ' + name); };
async function denied(fn, message) {
  await assert.rejects(fn, e => { if (message) assert.equal(e.message, message); assert.equal(e.code, '42501', e.code + ': ' + e.message); return true; });
}
async function insertApplication(uid) {
  const appId = id(serial++);
  await asUser(uid);
  await db.query(`insert into trial_applications(id,parent_id,class_id,child_name,child_grade,parent_name,parent_phone,status)
    values($1,$2,$3,'fixture child','초1','fixture parent',null,'new')`, [appId, uid, id(90)]);
  return appId;
}
const hash = code => code.repeat(64).slice(0, 64);
async function send(uid, phone, code = 'a') {
  await service(); const challenge = id(serial++);
  const data = (await one('select public.begin_parent_phone_challenge($1,$1,$2,$3,$4,$5) as v', [uid, challenge, phone, hash(code), 'b'.repeat(64)])).v;
  if (data.status !== 'created') return { status: data.status, data };
  await db.query('select public.mark_parent_phone_challenge_sent($1,$2,true)', [uid, challenge]);
  return { status: 'created', challenge };
}
// Let the 60s resend cooldown elapse without waiting.
async function ageChallenges(uid) { await root(); await db.query("update app.parent_phone_challenges set created_at=created_at-interval '61 seconds' where user_id=$1", [uid]); }
async function verify(uid, challenge, code = 'a', session = uid) {
  await service(); return (await one('select public.verify_parent_phone_challenge($1,$2,$3,$4) as v', [uid, session, challenge, hash(code)])).v;
}
async function enroll(uid) { await service(); return (await one('select public.enroll_oauth_parent_phone($1) v', [uid])).v; }
async function status(uid) { await asUser(uid); return (await one('select public.get_my_parent_phone_status() as v')).v; }
async function profile(uid) { await root(); return one('select name,phone,phone_verification_required r,phone_verified_at v from profiles where id=$1', [uid]); }
async function snapshot() {
  await root(); const out = {};
  for (const table of ['profiles', 'trial_applications', 'app.parent_phone_verifications', 'app.parent_phone_challenges']) {
    out[table] = (await db.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows;
  }
  return out;
}
(async () => {
  try {
    await createParentPhoneSchema(db);
    for (const [kind, uid] of Object.entries(users)) {
      await db.query('insert into auth.users(id,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3)', [uid,
        kind === 'studio' ? { signup_intent: 'teacher_public' } : {}, kind === 'review' ? { app_store_review: true } : {}]);
      await db.query('insert into auth.sessions values($1,$1)', [uid]);
      for (const provider of providers[kind]) await db.query('insert into auth.identities values($1,$2)', [uid, provider]);
    }
    await db.query("insert into classes(id,program_type) values($1,'trial_class')", [id(90)]);
    // Existing Parents created before this change. An unverified contact string is NOT a verification.
    for (const [uid, phone] of [[users.grandApple, '010-1234-5678'], [users.kakao, '01022223333'], [users.appleKakao, null],
      [users.review, '01099990000'], [users.deleting, null], [users.grandGoogle, null]]) {
      await db.query("insert into profiles(id,role,name,phone) values($1,'parent','fixture',$2)", [uid, phone]);
    }
    // A COMPAT-era new Apple Parent already verified through the existing flow.
    await service(); assert.equal((await one('select enroll_new_apple_parent_phone($1) v', [users.verifiedApple])).v.required, true);
    const first = await send(users.verifiedApple, '01044445555');
    assert.equal((await verify(users.verifiedApple, first.challenge)).status, 'verified');
    const proof = await status(users.verifiedApple);
    await db.query(`insert into profiles(id,role,name,phone,phone_verification_required,phone_verified_at) values($1,'parent','verified',$2,true,$3)`,
      [users.verifiedApple, proof.phone, proof.phoneVerifiedAt]);
    await root(); await db.query("insert into app.parent_account_deletions(parent_id,state) values($1,'processing')", [users.deleting]);

    const before = await snapshot();
    const policiesBefore = (await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
    const triggersBefore = (await db.query("select tgname,tgrelid::regclass::text t from pg_trigger where not tgisinternal order by 1")).rows;
    await db.exec(read('20261030120000_oauth_parent_phone_enrollment.sql'));
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual((await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows, policiesBefore);
    assert.deepEqual((await db.query("select tgname,tgrelid::regclass::text t from pg_trigger where not tgisinternal order by 1")).rows, triggersBefore);
    pass('migration rewrites zero rows; RLS policies and trigger set unchanged');

    for (const uid of [users.grandApple, users.grandGoogle]) {
      const s = await status(uid); assert.equal(s.required, false); assert.equal(s.phoneVerifiedAt, null);
      // What an already installed app does today must keep working right after the migration.
      await asUser(uid); await db.exec("update profiles set name='still editable' where id=auth.uid()");
      await insertApplication(uid);
    }
    pass('no batch change: existing unverified Apple/Google keep profile edits and applications until their own login enrolls them');

    for (const uid of [users.kakao]) {
      assert.equal((await enroll(uid)).required, false);
      await asUser(uid); await db.exec("update profiles set phone='01022224444',name='Kakao edited' where id=auth.uid()");
      await insertApplication(uid);
    }
    await root(); assert.equal((await one('select count(*)::int n from app.parent_phone_verifications where user_id=$1', [users.kakao])).n, 0);
    pass('Kakao-only Parent: not enrolled, ordinary contact edits and applications unchanged');

    let s = await enroll(users.grandApple);
    assert.equal(s.required, true); assert.equal(s.verified, false); assert.equal(s.phoneVerifiedAt, null);
    assert.equal((await profile(users.grandApple)).r, false);
    await assert.rejects(() => insertApplication(users.grandApple), e => e.message === 'parent_phone_verification_required');
    await asUser(users.grandApple);
    await denied(() => db.query("update profiles set phone_verification_required=true where id=auth.uid()"), 'parent_phone_verification_state_immutable');
    await denied(() => db.query("update profiles set phone_verified_at=now() where id=auth.uid()"), 'parent_phone_verification_state_immutable');
    await denied(() => db.query("update profiles set phone_verification_required=true,phone_verified_at=now(),phone='01012345678' where id=auth.uid()"), 'parent_phone_verification_state_immutable');
    pass('existing Apple with a stored phone string: enrolled at login, not verified, applications blocked, self-forgery denied');

    const g = await send(users.grandApple, '01012345678', 'c');
    assert.equal((await verify(users.grandApple, g.challenge, 'c')).status, 'verified');
    const p = await profile(users.grandApple);
    assert.equal(p.phone, '01012345678'); assert.equal(p.r, true); assert(p.v);
    s = await status(users.grandApple); assert.equal(s.required, true); assert.equal(s.verified, true);
    await insertApplication(users.grandApple);
    const again = await enroll(users.grandApple); assert.equal(again.verified, true);
    assert.equal(String((await profile(users.grandApple)).v), String(p.v));
    await asUser(users.grandApple);
    await denied(() => db.query("update profiles set phone='01099998888' where id=auth.uid()"), 'parent_verified_phone_immutable');
    await db.exec("update profiles set name='renamed' where id=auth.uid()");
    pass('existing Apple OTP: proof copied to profile, re-login keeps verification, verified phone immutable, name edit allowed');

    s = await enroll(users.newGoogle); assert.equal(s.required, true); assert.equal(s.profileMissing, true);
    await asUser(users.newGoogle);
    await denied(() => db.query("insert into profiles(id,role,name) values(auth.uid(),'parent','G')"), 'parent_phone_verification_required');
    const ng = await send(users.newGoogle, '010 5555 6666'.replace(/ /g, ''), 'd');
    assert.equal((await verify(users.newGoogle, ng.challenge, 'd')).status, 'verified');
    s = await status(users.newGoogle); assert.equal(s.verified, true); assert.equal(s.profileMissing, true);
    await asUser(users.newGoogle);
    await denied(() => db.query("insert into profiles(id,role,name,phone,phone_verification_required,phone_verified_at) values(auth.uid(),'parent','G','01000000000',true,$1)", [s.phoneVerifiedAt]), 'parent_verified_phone_immutable');
    await db.query("insert into profiles(id,role,name,phone,phone_verification_required,phone_verified_at) values(auth.uid(),'parent','G',$1,true,$2)", [s.phone, s.phoneVerifiedAt]);
    await insertApplication(users.newGoogle);
    pass('new Google: enrolled before profile, profile only with matching proof, then applications allowed');

    for (const uid of [users.googleKakao, users.appleKakao]) {
      s = await enroll(uid); assert.equal(s.required, true, uid); assert.equal(s.verified, false);
    }
    await assert.rejects(() => insertApplication(users.appleKakao), e => e.message === 'parent_phone_verification_required');
    pass('Kakao link does not exempt an Apple/Google account (no trusted Kakao phone on the server)');

    const dup = await send(users.googleKakao, '01022224444', 'e');
    assert.equal((await verify(users.googleKakao, dup.challenge, 'e')).status, 'duplicate_phone');
    assert.equal((await profile(users.kakao)).phone, '01022224444');
    s = await status(users.googleKakao); assert.equal(s.verified, false);
    assert.equal((await verify(users.googleKakao, dup.challenge, 'e')).status, 'used');
    await ageChallenges(users.googleKakao);
    const dup2 = await send(users.googleKakao, '01044445555', 'f');
    assert.equal((await verify(users.googleKakao, dup2.challenge, 'f')).status, 'duplicate_phone');
    pass('duplicate phone (profile or proof of another account): no merge/overwrite, no proof, challenge consumed');

    await ageChallenges(users.googleKakao);
    const w = await send(users.googleKakao, '01077776666', 'a');
    const lefts = [];
    for (let i = 0; i < 4; i++) lefts.push((await verify(users.googleKakao, w.challenge, 'z')).attemptsLeft);
    assert.deepEqual(lefts, [4, 3, 2, 1]);
    assert.equal((await verify(users.googleKakao, w.challenge, 'z')).status, 'attempts_exceeded');
    assert.equal((await verify(users.googleKakao, w.challenge, 'a')).status, 'attempts_exceeded');
    pass('wrong code: remaining tries 4→1, fifth miss locks the challenge even for the right code');

    await ageChallenges(users.googleKakao);
    const e = await send(users.googleKakao, '01077776666', 'a');
    const cooldown = await send(users.googleKakao, '01077776666', 'a');
    assert.equal(cooldown.status, 'cooldown'); assert(cooldown.data.retryAfter > 0 && cooldown.data.retryAfter <= 60);
    await asUser(users.googleKakao);
    const resume = (await one('select public.get_my_parent_phone_challenge() v')).v;
    assert.equal(resume.challengeId, e.challenge); assert.equal(resume.attemptsLeft, 5); assert(resume.expiresIn > 240 && resume.expiresIn <= 300);
    await asUser(users.stranger); assert.deepEqual((await one('select public.get_my_parent_phone_challenge() v')).v, {});
    await root(); await db.query("update app.parent_phone_challenges set expires_at=now()-interval '1 second' where id=$1", [e.challenge]);
    assert.equal((await verify(users.googleKakao, e.challenge, 'a')).status, 'expired');
    await asUser(users.googleKakao); assert.equal((await one('select public.get_my_parent_phone_challenge() v')).v.challengeId, null);
    pass('resend cooldown, own-session resume with expiry/attempts, expiry rejects a correct code');

    await ageChallenges(users.googleKakao);
    const ok = await send(users.googleKakao, '01077776666', 'a');
    assert.equal((await verify(users.stranger, ok.challenge, 'a')).status, 'unauthorized');
    assert.equal((await enroll(users.stranger)).required, true);
    assert.equal((await verify(users.stranger, ok.challenge, 'a', users.stranger)).status, 'used');
    assert.equal((await verify(users.googleKakao, ok.challenge, 'a', users.stranger)).status, 'unauthorized');
    assert.equal((await verify(users.googleKakao, ok.challenge, 'a')).status, 'verified');
    // Once verified the account is no longer pending, so a replay is rejected before the challenge lookup.
    assert.equal((await verify(users.googleKakao, ok.challenge, 'a')).status, 'unauthorized');
    s = await status(users.stranger); assert.equal(s.verified, false);
    pass("another account cannot use a challenge or session; a verified code cannot be reused");

    for (const [uid, role] of [[users.studio, null], [users.deleting, null]]) {
      s = await enroll(uid); assert.equal(s.required, false, uid);
    }
    await root(); await db.query("insert into profiles(id,role,name) values($1,'academy','studio')", [users.studio]);
    s = await enroll(users.studio); assert.equal(s.excluded, true);
    s = await enroll(users.review); assert.equal(s.required, false);
    await root(); assert.equal((await one('select count(*)::int n from app.parent_phone_verifications where user_id = any($1)', [[users.studio, users.deleting, users.review]])).n, 0);
    await insertApplication(users.review);
    pass('studio intent/role, pending deletion and App Review account are never enrolled; review access unchanged');

    await asUser(users.grandGoogle);
    await denied(() => db.query('select public.enroll_oauth_parent_phone($1)', [users.grandGoogle]));
    await denied(() => db.query('select public.verify_parent_phone_challenge($1,$1,$1,$2)', [users.grandGoogle, 'a'.repeat(64)]));
    await denied(() => db.query('select app.oauth_parent_phone_eligible($1)', [users.grandGoogle]));
    await denied(() => db.query('insert into app.parent_phone_verifications(user_id,phone_verification_required) values(auth.uid(),false)'));
    pass('client roles cannot call enrollment/verify RPCs or write private proof');

    s = await enroll(users.verifiedApple); assert.equal(s.verified, true);
    await insertApplication(users.verifiedApple);
    s = await enroll(users.newApple); assert.equal(s.required, true); assert.equal(s.profileMissing, true);
    await service(); assert.equal((await one('select enroll_new_apple_parent_phone($1) v', [users.newApple])).v.required, true);
    pass('COMPAT-verified Apple stays verified; web new-Apple enrollment RPC keeps working');

    // Leaving never requires verification. Existing profile (enrolled, unverified): the existing
    // self-only deletion RPC still works; a retry is idempotent; Auth removal cascades OTP data.
    s = await status(users.appleKakao); assert.equal(s.required, true); assert.equal(s.verified, false);
    await asUser(users.appleKakao);
    assert.equal((await one('select public.prepare_my_parent_account_deletion() v')).v, 'db_cleaned');
    assert.equal((await one('select public.prepare_my_parent_account_deletion() v')).v, 'db_cleaned');
    await root(); assert.equal((await one('select count(*)::int n from profiles where id=$1', [users.appleKakao])).n, 0);
    await db.query('delete from auth.users where id=$1', [users.appleKakao]);
    // Profile-less sign-in that stopped mid-verification: only the Auth user and its enrollment exist.
    const midway = id(13);
    await db.query('insert into auth.users(id) values($1)', [midway]); await db.query('insert into auth.sessions values($1,$1)', [midway]);
    await db.query("insert into auth.identities values($1,'google')", [midway]);
    assert.equal((await enroll(midway)).required, true);
    await send(midway, '01033334444');
    await asUser(midway);
    await assert.rejects(() => db.query('select public.prepare_my_parent_account_deletion()'), e => e.message === 'parent_auth_required');
    await root(); await db.query('delete from auth.users where id=$1', [midway]);
    for (const uid of [users.appleKakao, midway]) {
      for (const table of ['app.parent_phone_verifications', 'app.parent_phone_challenges']) {
        assert.equal((await one(`select count(*)::int n from ${table} where user_id=$1`, [uid])).n, 0, table);
      }
    }
    pass('unverified deletion: existing profile via the existing RPC (retry-safe); profile-less account via Auth delete; OTP data cascades');

    console.log(`ALL PASS ${suites} OAuth phone enrollment suites; no Production access, no SMS`);
  } catch (error) {
    console.error('FAIL', error);
    process.exitCode = 1;
  } finally { await db.close(); }
})();
