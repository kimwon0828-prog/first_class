-- Local or explicitly authorized TEST-only production transaction. Always rolls back.
-- Run through psql with ON_ERROR_STOP=1; contains no notification calls.
begin;
insert into public.organizations(id,name) values
 ('ca910000-0000-4000-8000-000000000001','TEST Unassigned V1'),('ca910000-0000-4000-8000-000000000002','TEST Other V1');
insert into auth.users(id,email) values
 ('ca920000-0000-4000-8000-000000000001','unassigned-v1@test.invalid'),
 ('ca920000-0000-4000-8000-000000000002','other-v1@test.invalid'),
 ('ca920000-0000-4000-8000-000000000003','parent-v1@test.invalid');
insert into public.profiles(id,role,name,organization_id) values
 ('ca920000-0000-4000-8000-000000000001','academy','TEST owner','ca910000-0000-4000-8000-000000000001'),
 ('ca920000-0000-4000-8000-000000000002','academy','TEST other','ca910000-0000-4000-8000-000000000002'),
 ('ca920000-0000-4000-8000-000000000003','parent','TEST parent',null);
insert into public.teachers(id,organization_id,display_name) values
 ('ca930000-0000-4000-8000-000000000001','ca910000-0000-4000-8000-000000000001','TEST teacher A'),
 ('ca930000-0000-4000-8000-000000000002','ca910000-0000-4000-8000-000000000001','TEST teacher B'),
 ('ca930000-0000-4000-8000-000000000003','ca910000-0000-4000-8000-000000000002','TEST foreign');
insert into public.classes(id,organization_id,title,subject,target_age,description,assignment_mode) values
 ('ca940000-0000-4000-8000-000000000001','ca910000-0000-4000-8000-000000000001','TEST V1','piano','초등','TEST','post_assign'),
 ('ca940000-0000-4000-8000-000000000002','ca910000-0000-4000-8000-000000000002','TEST foreign','piano','초등','TEST','post_assign');
insert into public.class_schedules(id,class_id,schedule_type,specific_date,start_time,end_time,capacity) values
 ('ca950000-0000-4000-8000-000000000001','ca940000-0000-4000-8000-000000000001','one_time','2026-10-15','15:00','16:00',10),
 ('ca950000-0000-4000-8000-000000000002','ca940000-0000-4000-8000-000000000002','one_time','2026-10-15','15:00','16:00',10);
insert into public.trial_applications(id,class_id,class_schedule_id,child_name,child_grade,requested_slot_at,status)
select ('ca960000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ca940000-0000-4000-8000-000000000001',
 case when n=9 then null else 'ca950000-0000-4000-8000-000000000001'::uuid end,'TEST student '||n,'초3',
 case when n=7 then '2026-10-15T07:00:00Z'::timestamptz else '2026-10-15T06:00:00Z'::timestamptz end,
 case when n=3 then 'reviewing' else 'new' end from generate_series(1,9) n;

create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end$$;
create function pg_temp.invoke(n int,op text,teacher_n int default null) returns void language plpgsql as $$declare aid uuid; rev timestamptz;begin
 aid:=('ca960000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
 select updated_at into rev from public.studio_trial_applications where id=aid;
 perform public.set_studio_application_schedule(aid,op,case when teacher_n is null then null else ('ca930000-0000-4000-8000-'||lpad(teacher_n::text,12,'0'))::uuid end,coalesce(rev,now()));
end$$;
create function pg_temp.expect_error(n int,op text,teacher_n int,expected text) returns void language plpgsql as $$begin
 begin perform pg_temp.invoke(n,op,teacher_n); exception when others then
  if sqlerrm=expected then raise notice 'PASS blocked: %',expected; return; end if; raise;
 end; raise exception 'FAIL expected %',expected;
end$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','ca920000-0000-4000-8000-000000000001',true);
select pg_temp.invoke(1,'confirm');
select pg_temp.assert_true((select status='confirmed' and assigned_teacher_id is null and confirmed_schedule_block_id is null and confirmed_slot_at='2026-10-15T06:00:00Z' from public.studio_trial_applications where id='ca960000-0000-4000-8000-000000000001'),'A new unassigned confirm');
select pg_temp.invoke(2,'confirm',1);
select pg_temp.assert_true((select a.assigned_teacher_id=b.teacher_id from public.studio_trial_applications a join public.schedule_blocks b on b.id=a.confirmed_schedule_block_id where a.id='ca960000-0000-4000-8000-000000000002'),'B selected teacher atomic confirm');
select pg_temp.invoke(3,'confirm');
select pg_temp.assert_true((select status='confirmed' from public.studio_trial_applications where id='ca960000-0000-4000-8000-000000000003'),'C legacy reviewing');
update public.studio_trial_applications set status='completed',completed_at=now() where id='ca960000-0000-4000-8000-000000000003';
select pg_temp.assert_true((select status='completed' and assigned_teacher_id is null from public.studio_trial_applications where id='ca960000-0000-4000-8000-000000000003'),'D unassigned completed');
select pg_temp.invoke(1,'assign',1);
select pg_temp.invoke(1,'assign',2);
select pg_temp.assert_true((select a.assigned_teacher_id=b.teacher_id and a.assigned_teacher_id='ca930000-0000-4000-8000-000000000002' and a.confirmed_slot_at='2026-10-15T06:00:00Z' from public.studio_trial_applications a join public.schedule_blocks b on b.id=a.confirmed_schedule_block_id where a.id='ca960000-0000-4000-8000-000000000001'),'E/F later assignment and teacher change keep time/block');
select pg_temp.invoke(1,'assign');
select pg_temp.expect_error(7,'confirm',null,'invalid_requested_class_schedule_occurrence');
select pg_temp.expect_error(8,'confirm',3,'invalid_teacher_for_application_organization');
select pg_temp.expect_error(9,'confirm',null,'missing_requested_schedule_block');
select pg_temp.assert_true((select status='new' and assigned_teacher_id is null from public.studio_trial_applications where id='ca960000-0000-4000-8000-000000000008'),'failed confirm leaves teacher/status unchanged');
select pg_temp.assert_true((select count(*)=0 from public.application_logs where application_id between 'ca960000-0000-4000-8000-000000000001' and 'ca960000-0000-4000-8000-000000000009' and to_status='reviewing'),'no new reviewing logs');
select set_config('request.jwt.claim.sub','ca920000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error(4,'confirm',null,'application_not_found_or_forbidden');
select set_config('request.jwt.claim.sub','ca920000-0000-4000-8000-000000000003',true);
select pg_temp.expect_error(4,'confirm',null,'application_not_found_or_forbidden');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error(4,'confirm',null,'not_authenticated');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.set_studio_application_schedule(uuid,text,uuid,timestamptz)','execute'),'J anon has no execute grant');
rollback;
