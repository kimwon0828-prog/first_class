// Actual COMPAT migration in isolated PostgreSQL; existing Apple 1 + Kakao 2 fixtures.
// No Production writes, real contact information, or SMS.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const db=new PGlite();let count=0,serial=100;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const a=id(1),b=id(2),kakao=id(3),admin=id(4),studio=id(5),deleted=id(6),linked=id(7),legacyApple=id(8),kakao2=id(9);
const phone='01012345678',hash='a'.repeat(64),ip='b'.repeat(64);
const pass=s=>{count++;console.log('PASS '+s)},root=()=>db.exec('reset role');
const one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
async function login(u){await db.exec(`reset role;set request.jwt.claims='${JSON.stringify({sub:u,session_id:u})}';set role authenticated`)}
async function fail(sql){await assert.rejects(()=>db.exec(sql),/permission/i)}
async function begin(u=a,p=phone){const c=id(serial++);const data=(await one('select begin_parent_phone_challenge($1,$1,$2,$3,$4,$5) as v',[u,c,p,hash,ip])).v;return {c,...data}}
async function send(u=a,p=phone){await root();const d=await begin(u,p);assert.equal(d.status,'created');await db.query('select mark_parent_phone_challenge_sent($1,$2,true)',[u,d.c]);return d.c}
async function verify(u,c,h=hash){return (await one('select verify_parent_phone_challenge($1,$1,$2,$3) as v',[u,c,h])).v.status}
async function enroll(u){await root();return (await one('select enroll_new_apple_parent_phone($1) v',[u])).v}
(async()=>{try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema app;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);
 create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
 create table profiles(id uuid primary key references auth.users on delete cascade,role text not null,phone text,name text);
 create table trial_applications(id uuid primary key,parent_id uuid,parent_phone text);
 create table app.parent_account_deletions(parent_id uuid,state text);
 alter table profiles enable row level security;
 create policy own on profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());
 grant usage on schema public,auth to authenticated,anon,service_role;
 grant select,insert,update,delete on profiles to authenticated;
 grant select,insert on trial_applications to authenticated;
 `);
 for(const u of [a,b,kakao,admin,studio,deleted,linked,legacyApple,kakao2]){await db.query('insert into auth.users(id) values($1)',[u]);await db.query('insert into auth.sessions values($1,$1)',[u]);await db.query('insert into auth.identities values($1,$2)',[u,[kakao,kakao2].includes(u)?'kakao':'apple'])}
 await db.query('insert into auth.identities values($1,$2)',[linked,'kakao']);
 await db.exec(`insert into profiles(id,role,phone,name) values('${legacyApple}','parent','01077778888','legacy Apple'),('${kakao}','parent','+82 10-2222-3333','legacy Kakao'),('${kakao2}','parent',null,'legacy Kakao no phone'),('${admin}','admin',null,'admin'),('${studio}','academy',null,'studio');`);
 const before=(await db.query('select to_jsonb(p) r from profiles p order by id')).rows;
 await db.exec(fs.readFileSync('supabase/migrations/20261004100000_apple_parent_phone_verification.sql','utf8'));
 assert.deepEqual((await db.query("select to_jsonb(p)-'phone_verified_at'-'phone_verification_required' r from profiles p order by id")).rows,before);
 assert.equal((await one('select count(*)::int n from profiles where phone_verification_required or phone_verified_at is not null')).n,0);
 assert.equal((await one("select count(*)::int n from pg_trigger where tgrelid in ('profiles'::regclass,'trial_applications'::regclass) and not tgisinternal")).n,0);pass('actual migration additive, existing rows unchanged/default false, ZERO hardening triggers');
 for(const u of [legacyApple,kakao,kakao2]){
  const enrolled=await enroll(u);assert.equal(enrolled.required,false,'existing Parent never enrolled');
  await login(u);const state=(await one('select get_my_parent_phone_status() v')).v;assert.equal(state.required,false);assert.equal(state.phoneVerifiedAt,null);
  await db.exec("update profiles set name='edited without OTP' where id=auth.uid()");
  await db.query('insert into trial_applications(id,parent_id,parent_phone) select $1,id,phone from profiles where id=auth.uid()',[id(serial++)]);
 }
 await root();assert.equal((await one('select count(*)::int n from app.parent_phone_verifications')).n,0);pass('existing Apple 1 + Kakao 2: name updates/application inserts and no OTP, including missing phone');
 // New Kakao Parent remains legacy default even after migration.
 await db.exec(`insert into profiles(id,role,phone,name) values('${linked}','parent','01066667777','new linked Kakao')`);await login(linked);assert.equal((await one('select get_my_parent_phone_status() v')).v.required,false);pass('new Kakao/linked identity remains default false');
 await login(a);assert.equal((await one('select get_my_parent_phone_status() v')).v.required,false,'identity alone never gates');
 await fail('select * from app.parent_phone_challenges');await fail('select * from app.parent_phone_verifications');await fail(`select enroll_new_apple_parent_phone('${a}')`);await fail(`select begin_parent_phone_challenge('${a}','${a}','${id(99)}','${phone}','${hash}','${ip}')`);
 await root();assert.equal((await begin()).status,'unauthorized','no automatic enrollment');
 for(const u of [a,b]){const state=await enroll(u);assert.equal(state.required,true);assert.equal(state.phoneVerifiedAt,null);assert.equal(state.profileMissing,true)}
 assert.equal((await enroll(a)).required,true);pass('explicit server enrollment only for new Apple Parent; private hashes/RPC inaccessible');
 let c=await send();assert.equal((await begin()).status,'cooldown');await login(a);const resume=(await one('select get_my_parent_phone_challenge() v')).v;assert.equal(resume.challengeId,c);assert(!('otp_hash' in resume));await login(b);assert.deepEqual((await one('select get_my_parent_phone_challenge() v')).v,{});await root();
 assert.equal(await verify(b,c),'used');for(let n=0;n<5;n++)assert.equal(await verify(a,c,'c'.repeat(64)),n===4?'attempts_exceeded':'invalid_code');assert.equal(await verify(a,c),'attempts_exceeded');pass('session/owner, refresh, five attempts and 60-second cooldown');
 await db.exec("update app.parent_phone_challenges set created_at=now()-interval '61 seconds'");c=await send();await db.query("update app.parent_phone_challenges set expires_at=now()-interval '1 second' where id=$1",[c]);assert.equal(await verify(a,c),'expired');pass('OTP expiry');
 await db.exec("update app.parent_phone_challenges set created_at=now()-interval '61 seconds'");c=await send();assert.equal(await verify(a,c),'verified');
 await login(a);let state=(await one('select get_my_parent_phone_status() v')).v;assert.equal(state.required,true);assert(state.phoneVerifiedAt);assert.equal(state.verified,true);assert.equal(state.phone,phone);
 // Profile completion transfers trusted pre-profile state; no DB trigger stamps it.
 await db.query('insert into profiles(id,role,phone,name,phone_verification_required,phone_verified_at) values($1,$2,$3,$4,true,$5)',[a,'parent',state.phone,'new Apple',state.phoneVerifiedAt]);
 await root();assert.equal(await verify(a,c),'unauthorized','verified cohort cannot consume/send again');assert.equal((await one('select consumed_at from app.parent_phone_challenges where id=$1',[c])).consumed_at!==null,true);
 await login(a);state=(await one('select get_my_parent_phone_status() v')).v;assert.equal(state.verified,true);assert(state.phoneVerifiedAt);await db.exec("update profiles set name='new verified Apple edit' where id=auth.uid()");await db.query('insert into trial_applications values($1,$2,$3)',[id(serial++),a,phone]);pass('OTP consumed; canonical phone/timestamp transferred to profile; verified new Apple can update/apply');
 await root();await db.exec(`delete from auth.sessions where id='${a}';insert into auth.sessions values('${a}','${a}')`);await login(a);assert.equal((await one('select get_my_parent_phone_status() v')).v.verified,true);pass('relogin retains verification');
 await root();c=await send(b,'01022223333');assert.equal(await verify(b,c),'duplicate_phone');assert.equal((await one(`select phone from profiles where id='${kakao}'`)).phone,'+82 10-2222-3333');assert.equal((await one(`select verified_at from app.parent_phone_verifications where user_id='${b}'`)).verified_at,null);pass('duplicate formatted Kakao phone denied; no merge/overwrite');
 await db.exec(`update app.parent_phone_challenges set created_at=now()-interval '61 seconds' where user_id='${b}'`);c=await send(b,phone);assert.equal(await verify(b,c),'duplicate_phone');pass('duplicate Apple proof denied within OTP RPC');
 for(const u of [admin,studio]){await root();assert.equal((await enroll(u)).excluded,true);assert.equal((await begin(u)).status,'unauthorized');await login(u);assert.equal((await one('select get_my_parent_phone_status() v')).v.excluded,true)}pass('Admin/Studio enrollment and OTP excluded, existing authority untouched');
 await root();await db.exec(`insert into app.parent_account_deletions values('${deleted}','processing')`);assert.equal((await enroll(deleted)).excluded,true);assert.equal((await begin(deleted)).status,'unauthorized');
 await db.exec(`delete from profiles where id='${a}';insert into app.parent_account_deletions values('${a}','db_cleaned')`);await login(a);assert.equal((await one('select get_my_parent_phone_status() v')).v.excluded,true);await root();await db.exec(`delete from auth.users where id='${a}'`);assert.equal((await one(`select count(*)::int n from app.parent_phone_verifications where user_id='${a}'`)).n,0);assert.equal((await one(`select count(*)::int n from app.parent_phone_challenges where user_id='${a}'`)).n,0);pass('deletion pending denied; existing Auth deletion cascade cleans OTP data without profile trigger');
 await db.exec('delete from app.parent_phone_challenges');const results=await Promise.all([begin(b,'01055556666'),begin(b,'01055556666')]);assert.deepEqual(results.map(v=>v.status).sort(),['cooldown','created']);
 for(let n=1;n<5;n++){await db.exec("update app.parent_phone_challenges set created_at=now()-interval '61 seconds'");assert.equal((await begin(b,'01055556666')).status,'created')}
 await db.exec("update app.parent_phone_challenges set created_at=now()-interval '61 seconds'");assert.equal((await begin(b,'01077778888')).status,'rate_limited');pass('concurrent issuance and per-user quota');
 await db.exec('delete from app.parent_phone_challenges');for(let n=0;n<5;n++)await db.query("insert into app.parent_phone_challenges(id,user_id,session_id,phone,otp_hash,ip_hash,created_at) values($1,$2,$2,$3,$4,$5,now()-interval '61 seconds')",[id(serial++),linked,'01000000000',hash,ip]);assert.equal((await begin(b,'01000000000')).status,'rate_limited');pass('per-phone quota independent of caller');
 for(let n=5;n<20;n++)await db.query("insert into app.parent_phone_challenges(id,user_id,session_id,phone,otp_hash,ip_hash,created_at) values($1,$2,$2,$3,$4,$5,now()-interval '61 seconds')",[id(serial++),linked,'01000000000',hash,ip]);assert.equal((await begin(b,'01088889999')).status,'rate_limited');pass('per-IP quota');
 await db.exec('delete from app.parent_phone_challenges');c=(await begin(b)).c;assert.equal(await verify(b,c),'unavailable');await db.query('select mark_parent_phone_challenge_sent($1,$2,false)',[b,c]);assert.equal(await verify(b,c),'unavailable');pass('dry-run/unsent SMS never verifies');
 console.log(`ALL PASS ${count} COMPAT database suites; no Production writes`);
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
