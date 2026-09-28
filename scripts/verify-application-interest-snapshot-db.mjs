// Local Docker Supabase only. Migration, fixtures and profile edits all ROLLBACK.
// node scripts/verify-application-interest-snapshot-db.mjs
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const migration=readFileSync('supabase/migrations/20260928120000_add_application_interest_subjects_snapshot.sql','utf8')
const sql=`
\\set ON_ERROR_STOP on
begin;
create temp table snapshot_baseline as select id,to_jsonb(a) as row from public.trial_applications a;
create temp table acl_baseline as select oid,relacl from pg_class where oid in ('public.trial_applications'::regclass,'public.studio_trial_applications'::regclass,'public.children'::regclass);
${migration}
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='children' and column_name='interest_subjects' and data_type='text' and is_nullable='YES') then raise exception 'child type mismatch'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='trial_applications' and column_name='interest_subjects' and data_type='text' and is_nullable='YES' and column_default is null) then raise exception 'snapshot type/default mismatch'; end if;
 if exists(select 1 from public.trial_applications where interest_subjects is not null) then raise exception 'legacy backfill detected'; end if;
 if exists(select 1 from acl_baseline b join pg_class c on c.oid=b.oid where c.relacl is distinct from b.relacl) then raise exception 'ACL changed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1","role":"authenticated"}',true) is not null as parent_claims_set;
insert into public.children(id,parent_id,name,grade,interest_subjects) values('a7180000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Snapshot fixture','초2','수학');
insert into public.trial_applications(id,parent_id,class_id,child_id,child_name,child_grade,requested_slot_at,status,interest_subjects,current_level,child_notes,goal_note)
select 'a7180000-0000-4000-8000-000000000002',parent_id,'33333333-3333-3333-3333-333333333331',id,name,grade,now()+interval '4 days','new',interest_subjects,'중급','메모','목표' from public.children where id='a7180000-0000-4000-8000-000000000001';
update public.children set interest_subjects='영어' where id='a7180000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.studio_trial_applications where id='a7180000-0000-4000-8000-000000000002') then raise exception 'parent accessed Studio surface'; end if;
 begin perform interest_subjects from public.trial_applications; raise exception 'parent base SELECT unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.trial_applications(id,parent_id,class_id,child_name,child_grade,requested_slot_at,status) values('a7180000-0000-4000-8000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','33333333-3333-3333-3333-333333333331','Legacy fixture','초2',now()+interval '5 days','new');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2","role":"authenticated"}',true) is not null as teacher_claims_set;
do $$ declare v record; begin
 select * into strict v from public.studio_trial_applications where id='a7180000-0000-4000-8000-000000000002';
 if v.interest_subjects <> '수학' or v.current_level <> '중급' or v.child_notes <> '메모' or v.goal_note <> '목표' then raise exception 'snapshot not preserved after profile change'; end if;
 if exists(select 1 from public.studio_trial_applications where id='a7180000-0000-4000-8000-000000000003' and interest_subjects is not null) then raise exception 'legacy fallback'; end if;
 if exists(select 1 from public.children where id='a7180000-0000-4000-8000-000000000001') then raise exception 'teacher live child access widened'; end if;
end $$;
reset role;
-- The local seeded teacher is temporarily moved to another fixture org, then ROLLBACK.
insert into public.organizations(id,name) values('a7180000-0000-4000-8000-000000000004','Snapshot isolation fixture');
update public.profiles set organization_id='a7180000-0000-4000-8000-000000000004' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.studio_trial_applications where id='a7180000-0000-4000-8000-000000000002') then raise exception 'cross academy access'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform interest_subjects from public.studio_trial_applications; raise exception 'anon Studio SELECT unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from snapshot_baseline b full join (select id,to_jsonb(a)-'interest_subjects' as row from public.trial_applications a where id not in ('a7180000-0000-4000-8000-000000000002','a7180000-0000-4000-8000-000000000003')) a using(id) where b.row is distinct from a.row) then raise exception 'existing application fingerprint changed'; end if;
end $$;
rollback;
select 'PASS local migration, text/null, no backfill, existing-row fingerprints/ACL unchanged, Parent INSERT, profile-change isolation, Studio DTO projection, Parent/other-academy/anon denied; all rolled back' as result;
`
const result=spawnSync('docker',['exec','-i','supabase_db_first-class-mvp','psql','-X','-U','postgres','-d','postgres','-q'],{input:sql,encoding:'utf8'})
if(result.error)throw result.error
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
process.exitCode=result.status??1
