const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE_PATH||'/private/tmp/firstsuup-push-check-tools/node_modules/@electric-sql/pglite');
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const one=async q=>(await db.query(q)).rows[0];let count=0;const pass=s=>{count++;console.log('PASS '+s);};
(async()=>{try{
 const foundation=fs.readFileSync('scripts/verify-parent-push-foundation-db.cjs','utf8').match(/await db.exec\(`(create schema auth;[\s\S]*?)`\);/)[1];await db.exec(foundation);
 await db.exec(`alter table auth.sessions add column not_after timestamptz;
 alter table trial_applications add column canceled_at timestamptz,add column no_show_at timestamptz;
 alter table parent_report_engagement add column report_first_viewed_at timestamptz,add column feedback_reminder_channel text,
 add column feedback_reminder_claimed_at timestamptz,add column feedback_reminder_last_error text,
 add constraint parent_report_feedback_reminder_channel_check check(feedback_reminder_channel in ('alimtalk','sms_fallback'));
 create table experience_feedback(application_id uuid);create table parent_decisions(application_id uuid,superseded_at timestamptz);
 create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create schema net;
 create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20261004130000_parent_push_foundation.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261005000000_schedule_confirmed_push.sql','utf8'));
 await db.exec(fs.readFileSync(process.env.PUSH_MIGRATION||'supabase/migrations/20261013100000_parent_event_push.sql','utf8'));
 await db.exec(`insert into profiles values('${id(1)}','parent'),('${id(2)}','parent'),('${id(3)}','teacher');
 insert into auth.sessions values('${id(11)}','${id(1)}',null),('${id(12)}','${id(2)}',null);
 insert into trial_applications(id,parent_id,status,confirmed_slot_at) values('${id(30)}','${id(1)}','completed',now()),('${id(31)}','${id(2)}','completed',now()),('${id(32)}','${id(1)}','confirmed',now());
 insert into parent_report_engagement(application_id,parent_id,report_first_viewed_at,feedback_reminder_claimed_at) values('${id(30)}','${id(1)}',now()-interval '25 hours',now());
 insert into experience_reports values('${id(40)}','${id(30)}','published',1,now());`);
 assert.equal((await one('select count(*)::int n from parent_event_push_deliveries')).n,0);pass('default OFF and no historical backfill');
 await db.exec(`update parent_event_push_settings set mode='test',test_parent_id='${id(1)}',test_application_id='${id(30)}',test_device_ids=array['${id(20)}']::uuid[];
 insert into parent_push_devices(id,parent_id,session_id,secret_hash,expo_push_token,platform,enabled,permission_status) values
 ('${id(20)}','${id(1)}','${id(11)}','digest','ExpoPushToken[fixtureToken20]','ios',true,'granted'),
 ('${id(21)}','${id(1)}','${id(11)}','digest','ExpoPushToken[fixtureToken21]','android',true,'granted'),
 ('${id(22)}','${id(2)}','${id(12)}','digest','ExpoPushToken[fixtureToken22]','ios',true,'granted');
 insert into experience_reports values('${id(41)}','${id(31)}','published',1,now());`);
 assert.equal((await one('select count(*)::int n from parent_event_push_deliveries')).n,0);
 const report=(await one(`select enqueue_parent_event_push('report_published','${id(30)}','${id(40)}') id`)).id;assert(report);
 assert.equal((await one(`select enqueue_parent_event_push('report_published','${id(30)}','${id(40)}') id`)).id,report);
 const claims=await Promise.all([db.query(`select * from claim_parent_event_push('${report}','send')`),db.query(`select * from claim_parent_event_push('${report}','send')`)]);
 assert.equal(claims.flatMap(r=>r.rows).length,1);assert.deepEqual(claims.flatMap(r=>r.rows)[0].attempts.map(a=>a.deviceId),[id(20)]);
 pass('exact test scope, unique event and atomic claim, no other-account or extra-device selection');
 await db.exec(`update experience_reports set status='withdrawn' where id='${id(40)}';insert into experience_reports values('${id(42)}','${id(30)}','published',2,now());`);
 assert.equal((await one('select count(*)::int n from parent_event_push_deliveries')).n,1);
 await db.exec(`update parent_event_push_deliveries set state='fallback_ready' where id='${report}'`);assert.equal((await db.query(`select * from claim_parent_event_push('${report}','fallback')`)).rows.length,0);
 pass('republish does not duplicate; withdrawn source cannot fallback');
 const feedback=(await one(`select enqueue_parent_event_push('feedback_reminder','${id(30)}','${id(30)}') id`)).id;assert(feedback);
 await db.exec(`update parent_event_push_settings set mode='off'`);
 assert.equal((await one(`select enqueue_parent_event_push('feedback_reminder','${id(30)}','${id(30)}') id`)).id,feedback);
 assert.equal((await one(`select state from claim_parent_event_push('${feedback}','send')`)).state,'fallback_ready');
 await db.exec(`update parent_event_push_deliveries set state='delivered' where id='${feedback}'`);
 assert.equal((await one(`select complete_parent_push_feedback('${feedback}') ok`)).ok,true);
 assert.equal((await one(`select complete_parent_push_feedback('${feedback}') ok`)).ok,false);
 assert.equal((await one(`select feedback_reminder_channel from parent_report_engagement where application_id='${id(30)}'`)).feedback_reminder_channel,'push');
 pass('pending queue keeps ownership after gate-off; receipt completion is durable and idempotent');
 await db.exec(`update parent_event_push_settings set mode='all';update trial_applications set confirmed_slot_at=confirmed_slot_at+interval '1 hour' where id='${id(32)}'`);
 const schedule=await one(`select * from parent_event_push_deliveries where event_type='schedule_changed'`);assert(schedule);
 await db.exec(`update trial_applications set confirmed_slot_at=confirmed_slot_at where id='${id(32)}'`);
 assert.equal((await one("select count(*)::int n from parent_event_push_deliveries where event_type='schedule_changed'")).n,1);
 await db.exec(`update trial_applications set confirmed_slot_at=confirmed_slot_at+interval '1 hour' where id='${id(32)}'`);
 assert.equal((await db.query(`select * from claim_parent_event_push('${schedule.id}','send')`)).rows.length,0);
 const current=await one("select * from parent_event_push_deliveries where event_type='schedule_changed' and state='pending'");
 await db.exec(`update auth.sessions set not_after=now()-interval '1 second' where id='${id(11)}'`);
 assert.deepEqual((await one(`select attempts from claim_parent_event_push('${current.id}','send')`)).attempts,[]);
 pass('actual confirmed-time changes only; obsolete schedules and expired sessions are excluded');
 await db.exec('set role authenticated');
 for(const q of ['select * from parent_event_push_deliveries','select * from parent_event_push_settings',`select * from claim_parent_event_push('${current.id}','send')`,`select enqueue_parent_event_push('feedback_reminder','${id(30)}','${id(30)}')`])await assert.rejects(db.exec(q));
 await db.exec('reset role');pass('Parent cannot inspect queue/device tokens, change switches or call sender RPCs');
 await db.exec('alter table parent_event_push_deliveries add constraint fail_capture check(false) not valid');
 await db.exec(`update trial_applications set confirmed_slot_at=confirmed_slot_at+interval '1 hour' where id='${id(32)}'`);
 assert.equal((await one(`select status from trial_applications where id='${id(32)}'`)).status,'confirmed');pass('push capture failure never rolls back business mutation');
 console.log('PASS '+count+' isolated database suites');
}finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
