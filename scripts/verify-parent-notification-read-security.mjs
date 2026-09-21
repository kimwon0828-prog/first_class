// Run with PGLITE_MODULE pointing to an isolated @electric-sql/pglite install.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const parent='00000000-0000-4000-8000-000000000001'
const other='00000000-0000-4000-8000-000000000002'
const teacher='00000000-0000-4000-8000-000000000003'
const log='00000000-0000-4000-8000-000000000010'
const report='00000000-0000-4000-8000-000000000011'
await db.exec(`create role authenticated; create role anon; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth, public to authenticated,anon;
create table profiles(id uuid primary key,role text);
create table trial_applications(id uuid primary key,parent_id uuid);
create table application_logs(id uuid primary key,application_id uuid,from_status text,to_status text,actor_id uuid,created_at timestamptz);
create table experience_reports(id uuid primary key,application_id uuid,status text,published_at timestamptz);
create view my_trial_applications with (security_barrier=true) as select id,parent_id from trial_applications where parent_id=auth.uid();
grant select on profiles,my_trial_applications,application_logs,experience_reports to authenticated;
insert into profiles values ('${parent}','parent'),('${other}','parent'),('${teacher}','teacher');
insert into trial_applications values ('${parent}','${parent}'),('${other}','${other}');
insert into application_logs values ('${log}','${parent}','confirmed','completed','${teacher}',now());
insert into experience_reports values ('${report}','${parent}','published',now());`)
await db.exec(readFileSync('supabase/migrations/20260921130000_create_parent_notification_reads.sql','utf8'))
const asUser=async id=>db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}';`)
const fails=async sql=>{await assert.rejects(db.exec(sql))}
await asUser(parent)
await db.exec(`insert into parent_notification_reads(parent_id,notification_key) values ('${parent}','status:${log}'),('${parent}','report_published:${report}');`)
await db.exec(`insert into parent_notification_reads(parent_id,notification_key) values ('${parent}','status:${log}') on conflict do nothing;`)
assert.equal((await db.query('select * from parent_notification_reads')).rows.length,2)
await fails(`insert into parent_notification_reads(parent_id,notification_key) values ('${other}','status:${log}')`)
await fails(`insert into parent_notification_reads(parent_id,notification_key) values ('${parent}','status:${other}')`)
await fails(`update parent_notification_reads set parent_id='${other}'`)
await asUser(other)
assert.equal((await db.query('select * from parent_notification_reads')).rows.length,0)
await fails(`insert into parent_notification_reads(parent_id,notification_key) values ('${other}','status:${log}')`)
await db.exec(`update parent_notification_reads set read_at=now()`)
await asUser(teacher)
assert.equal((await db.query('select * from parent_notification_reads')).rows.length,0)
await fails(`insert into parent_notification_reads(parent_id,notification_key) values ('${teacher}','status:${log}')`)
await db.exec('reset role; set role anon;')
await fails('select * from parent_notification_reads')
await db.exec(`reset role; update experience_reports set status='withdrawn';`)
await asUser(parent)
assert.equal((await db.query('select * from parent_notification_reads')).rows.length,2)
assert.equal((await db.query(`select parent_notification_key_is_visible('report_published:${report}') as visible`)).rows[0].visible,false)
await fails('delete from parent_notification_reads')
await db.close()
console.log('PASS actual PostgreSQL migration/RLS: own read+insert, idempotence, cross-parent read/write/update isolation, teacher/anon denied, orphan retained, no delete')
