// Real COMPAT + HARDENING + existing INSERT RLS/account deletion SQL in isolated PostgreSQL.
// Synthetic accounts only. No network, Production writes, or SMS.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const read = name => fs.readFileSync('supabase/migrations/' + name, 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const users = { grandfather: id(1), kakao: id(2), pending: id(3), preprofile: id(4), verified: id(5), duplicate: id(6), freshKakao: id(7), flaggedKakao: id(8), stranger: id(9) };
let serial = 100, suites = 0;
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const root = () => db.exec('reset role');
async function asUser(uid) {
  await db.exec(`reset role; set request.jwt.claims='${JSON.stringify({ sub: uid, role: 'authenticated', session_id: uid })}'; set role authenticated`);
}
async function service() { await db.exec('reset role; set role service_role'); }
const pass = name => { suites++; console.log('PASS ' + name); };
async function denied(sql, args = [], message) {
  await assert.rejects(() => db.query(sql, args), e => {
    if (message) assert.equal(e.message, message);
    assert(['42501', '23503'].includes(e.code), e.code + ': ' + e.message);
    return true;
  });
}
async function insertApplication(uid, program = 'trial_class') {
  const appId = id(serial++);
  await db.query(`insert into trial_applications(id,parent_id,class_id,child_name,child_grade,parent_name,parent_phone,status)
    values($1,$2,$3,'fixture child','초1','fixture parent',null,'new')`, [appId, uid, program === 'trial_class' ? id(90) : id(91)]);
  return appId;
}
async function sendFixture(uid, phone) {
  await service(); const challenge = id(serial++);
  const data = (await one('select public.begin_parent_phone_challenge($1,$1,$2,$3,$4,$5) as v', [uid, challenge, phone, 'a'.repeat(64), 'b'.repeat(64)])).v;
  assert.equal(data.status, 'created');
  await db.query('select public.mark_parent_phone_challenge_sent($1,$2,true)', [uid, challenge]);
  return challenge;
}
async function verifyFixture(uid, challenge) {
  await service();
  return (await one('select public.verify_parent_phone_challenge($1,$1,$2,$3) as v', [uid, challenge, 'a'.repeat(64)])).v.status;
}
async function status(uid) { await asUser(uid); return (await one('select public.get_my_parent_phone_status() as v')).v; }
async function snapshot() {
  await root(); const out = {};
  for (const table of ['profiles','trial_applications','children','application_logs','app.parent_phone_verifications','app.parent_phone_challenges']) {
    out[table] = (await db.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows;
  }
  return out;
}
(async () => {
  try {
    // Minimal supporting schema, with the real shipped profile policies and application INSERT boundary.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema app; create schema storage;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);
      create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
      create table profiles(id uuid primary key references auth.users on delete cascade,role text not null,
        organization_id uuid,phone text,name text,parent_birth_date date,updated_at timestamptz default now());
      create function app.current_role() returns text language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid()$$;
      create function app.current_org_id() returns uuid language sql stable security definer set search_path='' as $$select organization_id from public.profiles where id=auth.uid()$$;
      create table classes(id uuid primary key,organization_id uuid,teacher_id uuid,assignment_mode text default 'post_assign',is_active boolean default true,program_type text);
      create table children(id uuid primary key,parent_id uuid references profiles);
      create table trial_applications(id uuid primary key,parent_id uuid references profiles,class_id uuid references classes,
        assigned_teacher_id uuid,child_id uuid references children,child_name text,child_grade text,parent_name text,parent_phone text,
        child_school text,child_notes text,interest_subjects text,subject_experience_yn boolean,subject_experience_duration text,current_level text,
        preferred_regular_schedule text,goal_type text,goal_note text,class_schedule_id uuid,requested_schedule_block_id uuid,
        requested_slot_at timestamptz,selected_schedule_label text,memo text,status text default 'new',
        completed_at timestamptz,canceled_at timestamptz,no_show_at timestamptz,confirmed_slot_at timestamptz,confirmed_schedule_block_id uuid,
        contacted_at timestamptz,scheduled_at timestamptz,enrolled_at timestamptz,lost_at timestamptz,next_contact_at timestamptz,last_activity_at timestamptz,
        registration_status text default 'undecided',registered_course text,unregistered_reason text,unregistered_reason_note text,
        follow_up_note text,consultation_note text,trial_feedback text,final_level text,final_schedule text,regular_schedule_preference text,
        regular_schedule_preference_note text,regular_schedule_preference_updated_at timestamptz,import_batch_id uuid);
      create table application_logs(id uuid primary key,application_id uuid,actor_id uuid not null,note text);
      create table teachers(profile_id uuid); create table academy_update_requests(requester_profile_id uuid);
      create table registration_results(recorded_by uuid); create table trial_results(created_by uuid,updated_by uuid);
      create table experience_reports(published_by uuid,withdrawn_by uuid,superseded_by uuid);
      create table experience_feedback(parent_id uuid); create table parent_decisions(parent_id uuid);
      create table parent_report_engagement(parent_id uuid); create table parent_notification_reads(parent_id uuid);
      create table storage.objects(bucket_id text,name text,owner_id text,owner uuid);
      alter table profiles enable row level security; alter table trial_applications enable row level security;
      grant usage on schema public,auth to authenticated,anon,service_role;
      grant select,insert,update on profiles to authenticated;
      grant insert on trial_applications to authenticated;
      grant select on classes,children to authenticated;
      create policy profiles_select_self on profiles for select to authenticated using(id=auth.uid());
    `);
    const profileRls = read('20260410040000_rls_policies_v2.sql');
    await db.exec(profileRls.slice(profileRls.indexOf('create policy profiles_insert_self_parent'), profileRls.indexOf('create policy teachers_select')));
    await db.exec(read('20260929090000_harden_parent_application_insert.sql'));
    await db.exec(read('20261001150000_parent_account_deletion_v1.sql'));
    await db.exec(read('20261004100000_apple_parent_phone_verification.sql'));
    for (const [kind, uid] of Object.entries(users)) {
      await db.query('insert into auth.users(id) values($1)', [uid]);
      await db.query('insert into auth.sessions values($1,$1)', [uid]);
      await db.query('insert into auth.identities values($1,$2)', [uid, ['kakao','freshKakao','flaggedKakao'].includes(kind) ? 'kakao' : 'apple']);
    }
    await db.query("insert into classes(id,program_type) values($1,'trial_class'),($2,'level_test')", [id(90),id(91)]);
    for (const uid of [users.grandfather,users.kakao,users.flaggedKakao]) {
      await db.query("insert into profiles(id,role,name,phone) values($1,'parent','fixture',null)", [uid]);
    }
    await db.query('update profiles set phone=$2 where id=$1', [users.kakao,'+82 10-2222-3333']);
    // Flagged Kakao is an adversarial cohort to prove that provider metadata never bypasses the guard.
    await db.query('update profiles set phone_verification_required=true where id=$1', [users.flaggedKakao]);
    for (const uid of [users.pending,users.preprofile,users.verified,users.duplicate]) {
      await service(); assert.equal((await one('select enroll_new_apple_parent_phone($1) v', [uid])).v.required, true);
    }
    await root();
    await db.query("insert into profiles(id,role,name,phone_verification_required) values($1,'parent','pending',true)", [users.pending]);
    const verifiedChallenge = await sendFixture(users.verified, '01044445555');
    assert.equal(await verifyFixture(users.verified, verifiedChallenge), 'verified');
    const verifiedState = await status(users.verified);
    await db.query(`insert into profiles(id,role,name,phone,phone_verification_required,phone_verified_at)
      values($1,'parent','verified',$2,true,$3)`, [users.verified, verifiedState.phone, verifiedState.phoneVerifiedAt]);
    const before = await snapshot();
    const policiesBefore = (await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
    await db.exec(read('20261004120000_apple_parent_phone_verification_hardening.sql'));
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual((await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows, policiesBefore);
    pass('migration rewrites zero rows; existing RLS policies unchanged');

    for (const uid of [users.grandfather,users.kakao]) {
      await asUser(uid);
      await db.exec("update profiles set name='edited',parent_birth_date='1985-02-03' where id=auth.uid()");
      for (const program of ['trial_class','level_test']) await insertApplication(uid, program);
      const state = await status(uid); assert.equal(state.required, false); assert.equal(state.phoneVerifiedAt, null);
    }
    pass('A/B grandfather Apple without phone and Kakao: name/birth edit + both application types');
    await asUser(users.freshKakao);
    await db.query("insert into profiles(id,role,name,phone) values($1,'parent','new Kakao',null)", [users.freshKakao]);
    await db.exec("update profiles set phone='01077778888',name='Kakao edited' where id=auth.uid()");
    await insertApplication(users.freshKakao);
    pass('new Kakao onboarding/default false and ordinary contact edits');

    for (const uid of [users.pending,users.flaggedKakao]) {
      await asUser(uid); const state = await status(uid); assert.equal(state.required, true); assert.equal(state.phoneVerifiedAt, null);
      for (const program of ['trial_class','level_test']) {
        await assert.rejects(() => insertApplication(uid, program), e => e.code === '42501' && e.message === 'parent_phone_verification_required');
      }
      await db.exec("update profiles set name='name still editable',parent_birth_date='1988-03-04' where id=auth.uid()");
    }
    pass('C unverified application BLOCK, including non-Apple metadata; harmless profile edits PASS');
    await asUser(users.pending);
    await denied('update profiles set phone_verification_required=false where id=auth.uid()', [], 'parent_phone_verification_state_immutable');
    await denied('update profiles set phone_verified_at=now() where id=auth.uid()', [], 'parent_phone_verification_required');
    await denied("update profiles set phone='01011112222' where id=auth.uid()", [], 'parent_phone_verification_required');
    await db.exec("set app.phone_verified='true'");
    await denied('update profiles set phone_verified_at=now() where id=auth.uid()', [], 'parent_phone_verification_required');
    pass('direct required/timestamp/phone forgery and client GUC bypass BLOCK');
    await asUser(users.preprofile);
    await denied("insert into profiles(id,role,name) values($1,'parent','bypass default')", [users.preprofile], 'parent_phone_verification_required');
    await denied("insert into profiles(id,role,name,phone_verification_required,phone_verified_at) values($1,'parent','fake verified',true,now())", [users.preprofile], 'parent_phone_verification_required');
    await asUser(users.stranger);
    await denied("insert into profiles(id,role,name,phone_verification_required,phone_verified_at) values($1,'parent','invented proof',true,now())", [users.stranger], 'parent_phone_verification_state_immutable');
    pass('pre-profile direct insert/default-false/forged-proof bypass BLOCK');

    await asUser(users.kakao);
    assert.equal((await db.query("update profiles set name='attack' where id=$1 returning id", [users.grandfather])).rows.length, 0);
    await denied('update profiles set phone_verified_at=now() where id=auth.uid()', [], 'parent_phone_verification_state_immutable');
    await denied("update profiles set role='teacher' where id=auth.uid()", [], 'profile_authority_change_forbidden');
    await denied("insert into profiles(id,role,name) values($1,'parent','other account')", [users.stranger]);
    await denied('delete from profiles where id=auth.uid()');
    await denied('select * from app.parent_phone_verifications');
    await denied('select verify_parent_phone_challenge($1,$1,$2,$3)', [users.kakao, id(999), 'a'.repeat(64)]);
    pass('RLS ownership/authority/self-delete/private proof/service-only RPC protections retained');

    await asUser(users.verified);
    await insertApplication(users.verified); await insertApplication(users.verified, 'level_test');
    await db.exec("update profiles set name='verified name edit',parent_birth_date='1980-01-01' where id=auth.uid()");
    await denied("update profiles set phone='01055556666' where id=auth.uid()", [], 'parent_verified_phone_immutable');
    await denied('update profiles set phone_verified_at=null where id=auth.uid()', [], 'parent_phone_verification_state_immutable');
    await denied('update profiles set phone_verification_required=false where id=auth.uid()', [], 'parent_phone_verification_state_immutable');
    pass('D verified applications/name edits PASS; canonical phone/time/required immutable');

    for (const [uid,phone] of [[users.pending,'01012345678'],[users.preprofile,'01087654321']]) {
      const challenge = await sendFixture(uid, phone);
      assert.equal(await verifyFixture(uid, challenge), 'verified');
      const state = await status(uid);
      assert.equal(state.required, true); assert.equal(state.verified, true); assert.equal(state.phone, phone);
      if (state.profileMissing) {
        await denied(`insert into profiles(id,role,name,phone) values($1,'parent','forged false',$2)`, [uid,phone], 'parent_phone_verification_state_immutable');
        await db.query(`insert into profiles(id,role,name,phone,phone_verification_required,phone_verified_at)
          values($1,'parent','completed',$2,true,$3)`, [uid,phone,state.phoneVerifiedAt]);
      }
      await insertApplication(uid);
      await root(); const row = await one('select sent_at,consumed_at,send_failed from app.parent_phone_challenges where id=$1', [challenge]);
      assert(row.sent_at); assert(row.consumed_at); assert.equal(row.send_failed, false);
      assert.equal((await status(uid)).required, true);
    }
    pass('real OTP RPC success: proof + canonical phone + timestamp + consume; existing/missing profile completion; required stays true');
    const duplicate = await sendFixture(users.duplicate, '01022223333');
    assert.equal(await verifyFixture(users.duplicate, duplicate), 'duplicate_phone');
    await root(); assert.equal((await one('select phone from profiles where id=$1', [users.kakao])).phone, '+82 10-2222-3333');
    pass('duplicate phone policy preserved; no merge/overwrite');

    await asUser(users.preprofile); const ownedApplication = await insertApplication(users.preprofile);
    await root();
    await db.query('insert into children values($1,$2)', [id(80),users.preprofile]);
    await db.query('update trial_applications set child_id=$2,status=$3 where id=$1', [ownedApplication,id(80),'canceled']);
    await db.query('insert into application_logs values($1,$2,$3,$4)', [id(81),ownedApplication,users.preprofile,'history retained']);
    await asUser(users.preprofile);
    assert.equal((await one('select prepare_my_parent_account_deletion() v')).v, 'db_cleaned');
    await denied("insert into profiles(id,role,name) values($1,'parent','recreate')", [users.preprofile], 'parent_account_deletion_pending');
    await root();
    const app = await one('select parent_id,child_id,status from trial_applications where id=$1', [ownedApplication]);
    assert.deepEqual(app, { parent_id:null, child_id:null, status:'canceled' });
    assert.deepEqual(await one('select actor_id,note from application_logs where id=$1',[id(81)]),{actor_id:null,note:'history retained'});
    assert.equal((await one('select count(*)::int n from app.parent_phone_verifications where user_id=$1',[users.preprofile])).n,1);
    await db.query('delete from auth.users where id=$1',[users.preprofile]);
    for (const table of ['app.parent_phone_verifications','app.parent_phone_challenges']) assert.equal((await one(`select count(*)::int n from ${table} where user_id=$1`,[users.preprofile])).n,0);
    pass('actual account deletion RPC + Auth cascade: OTP cleanup, application/cancellation/history retained');
    const trigger = await one("select tgtype::int as type from pg_trigger where tgname='guard_parent_phone_application_insert'");
    assert.equal(trigger.type, 7); // ROW | BEFORE | INSERT, no UPDATE or DELETE.
    pass('application guard is INSERT-only; update/delete/cancellation boundary unchanged');
    console.log(`ALL PASS ${suites} HARDENING suites; Production writes/SMS = 0`);
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
