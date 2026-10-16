// Isolated DB check (PGlite, in-memory) for 20261016120000_class_trial_price_confirmation.sql. Never connects to a real DB.
// Runs the real save_studio_class_operating_rule (pre- and post-migration versions) against a minimal schema.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE_PATH||'/private/tmp/firstsuup-push-check-tools/node_modules/@electric-sql/pglite');
const MIGRATION='supabase/migrations/20261016120000_class_trial_price_confirmation.sql';
const PREVIOUS_RPC='supabase/migrations/20260927120000_add_regular_tuition_display.sql';
const db=new PGlite();let count=0;const pass=s=>{count++;console.log('PASS '+s);};
const one=async q=>(await db.query(q)).rows[0];
const ORG='00000000-0000-4000-8000-0000000000aa',OTHER='00000000-0000-4000-8000-0000000000bb';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row=async n=>one(`select title,trial_price p,trial_price_confirmed_at t from public.classes where id='${id(n)}'`);
const rpc=(n,fields)=>db.query(`select * from public.save_studio_class_operating_rule('${id(n)}',$1::jsonb,null,0,'[]'::jsonb)`,[JSON.stringify({organization_id:ORG,...fields})]);
(async()=>{try{
 await db.exec(`create schema app;
 create table public.test_flags(fail_after_update boolean not null default false); insert into public.test_flags values(false);
 create function app.current_role() returns text language sql as $$select 'teacher'$$;
 create function app.current_org_id() returns uuid language sql as $$select '${ORG}'::uuid$$;
 create table public.teachers(id uuid primary key,organization_id uuid);
 create table public.class_operating_rules(id uuid default gen_random_uuid(),class_id uuid unique,operation_type text,start_date date,end_date date,slots jsonb,revision int default 1,is_active boolean,updated_at timestamptz);
 create table public.classes(id uuid primary key default gen_random_uuid(),organization_id uuid not null,program_type text,assignment_mode text,title text not null,subject text,
  subject_category_id uuid,subject_id uuid,target_age text,description text,trial_price integer not null default 0 check(trial_price>=0),regular_price_type text,regular_price_amount int,regular_price_note text,
  teacher_id uuid,teacher_display_name text,cover_image_url text,is_active boolean not null default true,archived_at timestamptz,updated_at timestamptz not null default now(),
  class_format text,recommended_for text,experience_points text,curriculum text,teacher_intro text);
 create table public.class_schedules(class_id uuid,schedule_type text,specific_date date,start_time time,end_time time,capacity int,booking_status text,is_manual_override boolean);
 -- Stands in for the real reconcile step that runs after the class update inside the same RPC transaction.
 create function public.reconcile_class_operating_rule(uuid,date,boolean) returns void language plpgsql as $$
 begin if (select fail_after_update from public.test_flags) then raise exception 'reconcile_failed_after_update'; end if; end $$;
 create function app.guard_class_lifecycle() returns trigger language plpgsql as $$ begin
  if old.archived_at is not null and (to_jsonb(new)-array['archived_at','is_active','updated_at']) is distinct from (to_jsonb(old)-array['archived_at','is_active','updated_at']) then raise exception 'class_restore_required'; end if;
  return new; end $$;
 create trigger guard_class_lifecycle before update on public.classes for each row execute function app.guard_class_lifecycle();
 insert into public.classes(id,organization_id,title,trial_price) values('${id(1)}','${ORG}','유료',15000),('${id(2)}','${ORG}','0원',0),('${id(9)}','${OTHER}','다른 학원',0);
 insert into public.classes(id,organization_id,title,trial_price,is_active,archived_at) values('${id(3)}','${ORG}','종료',0,false,now());`);
 // Production RPC before this migration.
 const prev=fs.readFileSync(PREVIOUS_RPC,'utf8');const a=prev.indexOf('create or replace function public.save_studio_class_operating_rule(');
 await db.exec(prev.slice(a,prev.indexOf('end $$;',a)+'end $$;'.length));
 await assert.rejects(rpc(1,{title:'x',trial_price_confirmed_at:'2026-10-16T00:00:00Z'}),/invalid_class_field/);pass('pre-migration RPC rejects the new key with invalid_class_field (app retries without it)');
 const before=(await db.query('select id,trial_price,title,updated_at from public.classes order by id')).rows;
 const sql=fs.readFileSync(MIGRATION,'utf8');
 await db.exec(sql);
 assert.deepEqual(await one(`select data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='classes' and column_name='trial_price_confirmed_at'`),{data_type:'timestamp with time zone',is_nullable:'YES',column_default:null});pass('adds nullable timestamptz without default');
 assert.equal((await one('select count(*)::int n from public.classes where trial_price_confirmed_at is not null')).n,0);pass('no backfill');
 assert.deepEqual((await db.query('select id,trial_price,title,updated_at from public.classes order by id')).rows,before);pass('existing prices, titles and updated_at unchanged');
 await db.exec(sql);pass('migration re-runs safely');

 // Explicit choice through the real RPC: confirmation stored with DB time, never the client value.
 await rpc(2,{trial_price:0,trial_price_confirmed_at:'2000-01-01T00:00:00Z'});
 let r=await row(2);assert.ok(r.t instanceof Date&&r.t.getFullYear()>=2026);pass('RPC explicit choice confirms in the same statement with DB now() (client time ignored)');
 const confirmedAt=r.t.getTime();
 // Title-only edit keeps the confirmation.
 await rpc(2,{title:'0원 제목 수정',cover_image_url:'https://x/p.jpg'});
 r=await row(2);assert.equal(r.title,'0원 제목 수정');assert.equal(r.t.getTime(),confirmedAt);pass('title/photo-only RPC save keeps the confirmation');
 // Price change without a choice (any path) clears it in the same statement.
 await rpc(2,{trial_price:12000});r=await row(2);assert.equal(r.p,12000);assert.equal(r.t,null);pass('RPC price change without explicit choice clears the old confirmation');
 await rpc(2,{trial_price:0,trial_price_confirmed_at:'x'.replace('x','2026-10-16T00:00:00Z')});
 await db.exec(`update public.classes set trial_price=5000 where id='${id(2)}'`);r=await row(2);assert.equal(r.t,null);pass('direct client update of price clears the confirmation too');
 await db.exec(`update public.classes set trial_price=0,trial_price_confirmed_at='2000-01-01' where id='${id(2)}'`);r=await row(2);assert.ok(r.t.getFullYear()>=2026);pass('direct update with explicit confirmation uses DB time');
 // Failure after the update inside the RPC rolls back price and confirmation together.
 const kept=await row(2);await db.exec('update public.test_flags set fail_after_update=true');
 await assert.rejects(rpc(2,{trial_price:30000}),/reconcile_failed_after_update/);
 await assert.rejects(rpc(2,{trial_price:30000,trial_price_confirmed_at:'2026-10-16T00:00:00Z'}),/reconcile_failed_after_update/);
 await db.exec('update public.test_flags set fail_after_update=false');
 r=await row(2);assert.equal(r.p,kept.p);assert.equal(r.t.getTime(),kept.t.getTime());pass('save failing after the update leaves price and confirmation both unchanged (one transaction)');
 // Stale concurrent save: an explicit free save, then a title-only save carrying an old price → confirmation cleared, never kept for the old price.
 await rpc(1,{trial_price:0,trial_price_confirmed_at:'2026-10-16T00:00:00Z'});
 await rpc(1,{title:'다른 탭에서 제목 수정',trial_price:15000});
 r=await row(1);assert.equal(r.p,15000);assert.equal(r.t,null);pass('stale concurrent save that changes the price clears the confirmation');
 await rpc(1,{title:'제목만',trial_price:15000});r=await row(1);assert.equal(r.t,null);pass('re-saving the same price without a choice does not create a confirmation');
 // Inserts.
 await db.exec(`insert into public.classes(id,organization_id,title,trial_price) values('${id(4)}','${ORG}','신규',0)`);assert.equal((await row(4)).t,null);
 await db.exec(`insert into public.classes(id,organization_id,title,trial_price,trial_price_confirmed_at) values('${id(5)}','${ORG}','신규확인',0,'2000-01-01')`);assert.ok((await row(5)).t.getFullYear()>=2026);pass('inserts: unconfirmed unless the insert itself confirms (DB time)');
 // Zero rows / forbidden: another organization's class raises instead of silently succeeding.
 await assert.rejects(rpc(9,{trial_price:0,trial_price_confirmed_at:'2026-10-16T00:00:00Z'}),/studio_class_not_found_or_forbidden/);
 assert.equal((await row(9)).t,null);pass('RPC on a class outside the organization fails (no silent 0-row success)');
 await assert.rejects(db.exec(`update public.classes set trial_price_confirmed_at=now() where id='${id(3)}'`),/class_restore_required/);pass('archived classes stay read-only');
 await assert.rejects(rpc(1,{title:'x',unknown_field:1}),/invalid_class_field/);pass('RPC still rejects any other unknown key');
 console.log(`ALL PASS (${count})`);
}catch(error){console.error('FAIL',error);process.exit(1)}})();
