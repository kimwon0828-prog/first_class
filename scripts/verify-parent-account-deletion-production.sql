-- Safe on LOCAL or approved Production: every identity and row rolls back.
-- Exercises real role/JWT-claim RPC contracts; no external notification or Auth API.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table qa_deletion_results(label text);
grant insert,select on qa_deletion_results to authenticated,anon;
create function pg_temp.qa_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'QA_FAILED: %',label; end if;
insert into qa_deletion_results values(label); end $$;
create function pg_temp.qa_denied(command text,expected text,label text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin begin execute command; exception when others then
 if SQLERRM !~ expected then raise; end if; rejected:=true;
end; perform pg_temp.qa_assert(rejected,label); end $$;
select set_config('qa.parent',gen_random_uuid()::text,true),set_config('qa.other',gen_random_uuid()::text,true),
set_config('qa.studio',gen_random_uuid()::text,true),set_config('qa.org',gen_random_uuid()::text,true),
set_config('qa.class',gen_random_uuid()::text,true),set_config('qa.application',gen_random_uuid()::text,true),
set_config('qa.ongoing',gen_random_uuid()::text,true),set_config('qa.child',gen_random_uuid()::text,true),set_config('qa.schedule',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('qa.parent')::uuid),(current_setting('qa.other')::uuid),(current_setting('qa.studio')::uuid);
insert into public.organizations(id,name) values(current_setting('qa.org')::uuid,'TEST DELETION ROLLBACK');
insert into public.profiles(id,role,name,organization_id) values
(current_setting('qa.parent')::uuid,'parent','TEST Parent',null),
(current_setting('qa.other')::uuid,'parent','TEST Other Parent',null),
(current_setting('qa.studio')::uuid,'academy','TEST Studio',current_setting('qa.org')::uuid);
insert into public.children(id,parent_id,name,grade) values(current_setting('qa.child')::uuid,current_setting('qa.parent')::uuid,'TEST Child','초3');
insert into public.classes(id,organization_id,title,subject,target_age,description,assignment_mode,program_type) values
(current_setting('qa.class')::uuid,current_setting('qa.org')::uuid,'TEST DELETE ROLLBACK','math','elem_3','Transaction-only fixture','post_assign','trial_class');
insert into public.class_schedules(id,class_id,schedule_type,specific_date,start_time,end_time,capacity) values(current_setting('qa.schedule')::uuid,current_setting('qa.class')::uuid,'one_time',(now() at time zone 'Asia/Seoul')::date+10,'15:00','16:00',10);
insert into public.trial_applications(id,parent_id,child_id,class_id,class_schedule_id,child_name,child_grade,parent_name,parent_phone,memo,status,completed_at,requested_slot_at,confirmed_slot_at,next_contact_at) values
(current_setting('qa.application')::uuid,current_setting('qa.parent')::uuid,current_setting('qa.child')::uuid,current_setting('qa.class')::uuid,current_setting('qa.schedule')::uuid,'TEST Child','초3','TEST Guardian','01000000000','TEST preserved snapshot','completed',now(),now(),now(),now()+interval '3 days'),
(current_setting('qa.ongoing')::uuid,current_setting('qa.parent')::uuid,current_setting('qa.child')::uuid,current_setting('qa.class')::uuid,current_setting('qa.schedule')::uuid,'TEST Child','초3','TEST Guardian','01000000000','TEST ongoing snapshot','confirmed',null,now()+interval '10 days',now()+interval '10 days',null);
insert into public.application_logs(application_id,from_status,to_status,actor_id,note) values(current_setting('qa.application')::uuid,'confirmed','completed',current_setting('qa.parent')::uuid,'TEST preserve history');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.studio'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.studio'),'role','authenticated')::text,true);
select public.set_studio_registration_result(current_setting('qa.application')::uuid,'not_enrolled',array['schedule_mismatch'],'TEST preserve reason');
select public.finalize_studio_trial_result(current_setting('qa.application')::uuid,'{"observations":["sustained_engagement"],"publicSummary":"TEST preserved result","recommendedSchedule":"화·목 / 저녁","note":"TEST preserved internal record"}');
select public.publish_experience_report(current_setting('qa.application')::uuid,(select updated_at from public.trial_results where application_id=current_setting('qa.application')::uuid));
select public.record_studio_contact(gen_random_uuid(),current_setting('qa.application')::uuid,now(),'PHONE','NEUTRAL','TEST preserve consultation',null,true,'{"version":1,"state":"specified","groups":[{"dayMode":"selected","days":[2,4],"timeMode":"range","startTime":"17:00","endTime":"19:00"}]}','TEST preserve schedule','plus_minus_30');
select pg_temp.qa_denied('select public.prepare_my_parent_account_deletion()','parent_auth_required','Studio deletion denied');
reset role;
select set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true);
insert into public.parent_decisions(application_id,parent_id,decision) values(current_setting('qa.application')::uuid,current_setting('qa.parent')::uuid,'considering');
insert into public.experience_feedback(application_id,parent_id,class_id,organization_id,program_type,selected_chip_ids,private_note) values(current_setting('qa.application')::uuid,current_setting('qa.parent')::uuid,current_setting('qa.class')::uuid,current_setting('qa.org')::uuid,'trial_class',array['kind_teacher'],'TEST PRIVATE DELETE');
insert into public.parent_notification_reads(parent_id,notification_key) values(current_setting('qa.parent')::uuid,'status:'||current_setting('qa.application'));
insert into public.parent_report_engagement(application_id,parent_id,first_report_id) select current_setting('qa.application')::uuid,current_setting('qa.parent')::uuid,id from public.experience_reports where application_id=current_setting('qa.application')::uuid;
create function pg_temp.history_snapshot() returns jsonb language sql security definer as $$
select jsonb_build_object(
 'applications',(select jsonb_agg(to_jsonb(x)-'parent_id'-'child_id'-'updated_at' order by id) from public.trial_applications x where class_id=current_setting('qa.class')::uuid),
 'results',(select jsonb_agg(to_jsonb(x) order by id) from public.trial_results x where application_id=current_setting('qa.application')::uuid),
 'reports',(select jsonb_agg(to_jsonb(x) order by id) from public.experience_reports x where application_id=current_setting('qa.application')::uuid),
 'consultations',(select jsonb_agg(to_jsonb(x) order by id) from public.consultation_logs x where application_id=current_setting('qa.application')::uuid),
 'registrations',(select jsonb_agg(to_jsonb(x) order by id) from public.registration_results x where application_id=current_setting('qa.application')::uuid),
 'logs',(select jsonb_agg(to_jsonb(x)-'actor_id' order by id) from public.application_logs x where application_id=current_setting('qa.application')::uuid)); $$;
select set_config('qa.history',pg_temp.history_snapshot()::text,true);
-- Inspect anon ACL without running a nested error handler after SET ROLE anon.
-- Actual anonymous HTTP rejection is covered by the local/Production API smoke.
select pg_temp.qa_assert(not has_function_privilege('anon','public.prepare_my_parent_account_deletion()','execute'),'anon execute ACL denied');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.other'),'role','authenticated')::text,true);
select pg_temp.qa_assert((select pronargs=0 from pg_proc where oid='public.prepare_my_parent_account_deletion()'::regprocedure),'RPC has no target UID parameter');
select pg_temp.qa_assert(not public.get_my_parent_account_deletion_status(),'other Parent cannot see A deletion marker');
select set_config('request.jwt.claim.sub',current_setting('qa.parent'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.parent'),'role','authenticated')::text,true);
select pg_temp.qa_assert(public.prepare_my_parent_account_deletion()='db_cleaned','Parent own cleanup PASS');
select pg_temp.qa_assert(public.prepare_my_parent_account_deletion()='db_cleaned','retry is idempotent');
select pg_temp.qa_assert(public.get_my_parent_account_deletion_status(),'pending marker supports Auth failure retry');
select pg_temp.qa_assert((select count(*)=0 from public.my_trial_applications),'old JWT cannot read detached applications');
select pg_temp.qa_assert((select count(*)=0 from public.experience_reports where application_id=current_setting('qa.application')::uuid),'old Parent cannot read preserved report');
reset role;
select pg_temp.qa_assert(not exists(select 1 from public.profiles where id=current_setting('qa.parent')::uuid),'profile cleanup');
select pg_temp.qa_assert(not exists(select 1 from public.children where parent_id=current_setting('qa.parent')::uuid),'children cleanup');
select pg_temp.qa_assert(not exists(select 1 from public.parent_decisions where parent_id=current_setting('qa.parent')::uuid),'ParentDecision cleanup');
select pg_temp.qa_assert(not exists(select 1 from public.experience_feedback where parent_id=current_setting('qa.parent')::uuid),'feedback chips and private note cleanup');
select pg_temp.qa_assert(not exists(select 1 from public.parent_notification_reads where parent_id=current_setting('qa.parent')::uuid) and not exists(select 1 from public.parent_report_engagement where parent_id=current_setting('qa.parent')::uuid),'personal notification/engagement cleanup');
select pg_temp.qa_assert((select bool_and(parent_id is null and child_id is null) from public.trial_applications where class_id=current_setting('qa.class')::uuid),'all account/child ownership detached');
select pg_temp.qa_assert((select status='confirmed' and confirmed_slot_at=now()+interval '10 days' from public.trial_applications where id=current_setting('qa.ongoing')::uuid),'ongoing reservation is not canceled');
select pg_temp.qa_assert(pg_temp.history_snapshot()=current_setting('qa.history')::jsonb,'Academy application, consultation, result, report, registration and history fingerprints preserved');
select pg_temp.qa_assert(exists(select 1 from auth.users where id=current_setting('qa.parent')::uuid),'Auth still present until server admin deletion');
select pg_temp.qa_assert(exists(select 1 from public.profiles where id=current_setting('qa.other')::uuid),'other Parent untouched');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.studio'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.studio'),'role','authenticated')::text,true);
select pg_temp.qa_assert((select count(*)=2 from public.studio_trial_applications where class_id=current_setting('qa.class')::uuid),'Studio retains both application rows');
select pg_temp.qa_assert((select count(*)=1 from public.experience_reports where application_id=current_setting('qa.application')::uuid),'Studio retains published report');
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.other'),'role','authenticated')::text,true);
select pg_temp.qa_assert((select count(*)=0 from public.my_trial_applications where class_id=current_setting('qa.class')::uuid),'different/new UUID cannot inherit detached history');
reset role;
select pg_temp.qa_assert((select count(*)=0 from public.sms_logs where trial_application_id in(current_setting('qa.application')::uuid,current_setting('qa.ongoing')::uuid)),'no external notification invoked');
select json_build_object('passed',count(*),'checks',json_agg(label),'cleanup','ROLLBACK','externalMessages',0) deletion_smoke from qa_deletion_results;
rollback;
