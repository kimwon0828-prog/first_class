-- Lifecycle final contract permission smoke, also rehearsed on Local Supabase.
-- All TEST identities and rows exist only inside this transaction. Always ROLLBACK.
-- No server action, SMS/Alimtalk provider or real user row is invoked/modified.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create temporary table qa_lifecycle_results(label text);
grant insert,select on qa_lifecycle_results to authenticated;
create function pg_temp.qa_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'QA_FAILED: %',label; end if;
 insert into qa_lifecycle_results values(label); end $$;
create function pg_temp.qa_denied(command text, expected text, label text) returns void language plpgsql as $$
declare rejected boolean := false;
begin
 begin execute command; exception when others then
  if SQLERRM !~ expected then raise; end if; rejected := true;
 end;
 perform pg_temp.qa_assert(rejected,label);
end $$;
select set_config('qa.studio',gen_random_uuid()::text,true),set_config('qa.parent',gen_random_uuid()::text,true),
 set_config('qa.other',gen_random_uuid()::text,true),set_config('qa.org',gen_random_uuid()::text,true),
 set_config('qa.other_org',gen_random_uuid()::text,true),set_config('qa.class',gen_random_uuid()::text,true),
 set_config('qa.application',gen_random_uuid()::text,true),set_config('qa.canceled',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('qa.studio')::uuid),(current_setting('qa.parent')::uuid),(current_setting('qa.other')::uuid);
insert into public.organizations(id,name) values(current_setting('qa.org')::uuid,'TEST RELEASE ROLLBACK'),(current_setting('qa.other_org')::uuid,'TEST RELEASE OTHER');
insert into public.profiles(id,role,name,organization_id) values
 (current_setting('qa.studio')::uuid,'academy','TEST RELEASE Studio',current_setting('qa.org')::uuid),
 (current_setting('qa.parent')::uuid,'parent','TEST RELEASE Parent',null),
 (current_setting('qa.other')::uuid,'academy','TEST RELEASE Other',current_setting('qa.other_org')::uuid);
insert into public.classes(id,organization_id,title,subject,target_age,description,assignment_mode,program_type) values
 (current_setting('qa.class')::uuid,current_setting('qa.org')::uuid,'TEST RELEASE','math','elem_3','Transaction rollback fixture','post_assign','trial_class');
insert into public.trial_applications(id,parent_id,class_id,child_name,child_grade,status,completed_at,requested_slot_at,next_contact_at) values
 (current_setting('qa.application')::uuid,current_setting('qa.parent')::uuid,current_setting('qa.class')::uuid,'TEST RELEASE','초3','completed',now(),now(),now()+interval '3 days'),
 (current_setting('qa.canceled')::uuid,current_setting('qa.parent')::uuid,current_setting('qa.class')::uuid,'TEST CANCELED','초3','canceled',null,now(),null);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.studio'),true),
 set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.studio'),'role','authenticated')::text,true);
select pg_temp.qa_assert((select count(*)=1 from public.studio_trial_applications where id=current_setting('qa.application')::uuid),'same-org detail read');
select public.set_studio_registration_result(current_setting('qa.application')::uuid,'pending',array['schedule_coordination'],'TEST PRIVATE');
select pg_temp.qa_assert((select registration_status='pending' and registration_reason_ids=array['schedule_coordination'] and registration_note='TEST PRIVATE' and next_contact_at=now()+interval '3 days' from public.studio_trial_applications where id=current_setting('qa.application')::uuid),'registration reasons/note and next_contact preserved');
select pg_temp.qa_assert((select count(*)=0 from public.consultation_logs where application_id=current_setting('qa.application')::uuid),'registration needs no consultation and creates none');
select pg_temp.qa_assert((public.set_studio_registration_result(current_setting('qa.application')::uuid,'enrolled')->>'enrollmentTransition')::boolean,'first enrollment eligible once; no SMS invocation');
select pg_temp.qa_assert(not (public.set_studio_registration_result(current_setting('qa.application')::uuid,'enrolled')->>'enrollmentTransition')::boolean,'repeat enrollment has no SMS eligibility');
select public.set_studio_registration_result(current_setting('qa.application')::uuid,'not_enrolled',array['schedule_mismatch'],'TEST reason');
select pg_temp.qa_assert(not (public.set_studio_registration_result(current_setting('qa.application')::uuid,'enrolled')->>'enrollmentTransition')::boolean,'re-enrollment has no SMS eligibility');
select public.finalize_studio_trial_result(current_setting('qa.application')::uuid,'{"observations":["sustained_engagement"],"publicSummary":"TEST report","recommendedSchedule":"화·목 / 저녁","note":"TEST PRIVATE RECORD"}');
select pg_temp.qa_assert((select count(*)=1 from public.trial_results where application_id=current_setting('qa.application')::uuid),'first record finalized');
select public.publish_experience_report(current_setting('qa.application')::uuid,(select updated_at from public.trial_results where application_id=current_setting('qa.application')::uuid));
select pg_temp.qa_assert((select count(*)=1 and bool_and(content::text not like '%TEST PRIVATE%') from public.experience_reports where application_id=current_setting('qa.application')::uuid),'first report published without private content');
select public.record_studio_contact(gen_random_uuid(),current_setting('qa.application')::uuid,now(),'PHONE','NEUTRAL','TEST CONTACT',null,true,'{"version":1,"state":"specified","groups":[{"dayMode":"selected","days":[2,4],"timeMode":"range","startTime":"17:00","endTime":"19:00"}]}','TEST NOTE','plus_minus_30');
select pg_temp.qa_assert((select count(*)=1 and bool_and(time_flexibility='plus_minus_30') from public.consultation_logs where application_id=current_setting('qa.application')::uuid),'structured consultation after enrollment allowed');
select pg_temp.qa_assert((select registration_status='enrolled' from public.studio_trial_applications where id=current_setting('qa.application')::uuid),'consultation leaves registration independent');

-- Generated derivatives and all operating history must survive archive/restore.
select public.save_studio_class_operating_rule(current_setting('qa.class')::uuid,jsonb_build_object('organization_id',current_setting('qa.org')),jsonb_build_object('operationType','rolling','startDate',(now() at time zone 'Asia/Seoul')::date+2,'endDate',null,'slots',(select jsonb_agg(jsonb_build_object('weekday',i,'startTime','15:00','endTime','16:00','capacity',3,'seriesId',gen_random_uuid())) from generate_series(0,6)i)),0);
select public.set_class_schedule_date_exception(current_setting('qa.class')::uuid,(now() at time zone 'Asia/Seoul')::date+3,'closed');
reset role;
create function pg_temp.lifecycle_snapshot(cid uuid) returns jsonb language sql security definer as $$
select jsonb_build_object(
 'applications',(select jsonb_agg(to_jsonb(x) order by id) from public.trial_applications x where class_id=cid),
 'schedules',(select jsonb_agg(to_jsonb(x) order by id) from public.class_schedules x where class_id=cid),
 'rules',(select jsonb_agg(to_jsonb(x) order by id) from public.class_operating_rules x where class_id=cid),
 'exceptions',(select jsonb_agg(to_jsonb(x) order by id) from public.class_schedule_exceptions x where class_id=cid),
 'reports',(select jsonb_agg(to_jsonb(x) order by id) from public.experience_reports x where application_id in(select id from public.trial_applications where class_id=cid)),
 'results',(select jsonb_agg(to_jsonb(x) order by id) from public.trial_results x where application_id in(select id from public.trial_applications where class_id=cid)),
 'consultations',(select jsonb_agg(to_jsonb(x) order by id) from public.consultation_logs x where application_id in(select id from public.trial_applications where class_id=cid)),
 'registrations',(select jsonb_agg(to_jsonb(x) order by id) from public.registration_results x where application_id in(select id from public.trial_applications where class_id=cid)),
 'logs',(select jsonb_agg(to_jsonb(x) order by id) from public.application_logs x where application_id in(select id from public.trial_applications where class_id=cid))); $$;
select set_config('qa.history_before',pg_temp.lifecycle_snapshot(current_setting('qa.class')::uuid)::text,true);
set local role authenticated;
select pg_temp.qa_assert(not(select can_permanently_delete from public.get_studio_class_delete_eligibility() where class_id=current_setting('qa.class')::uuid),'C history class is ineligible');
select pg_temp.qa_denied(format('select public.mutate_studio_class_lifecycle(%L,%L)',current_setting('qa.class'),'delete'),'class_has_operating_history','C permanent delete history FAIL');
select public.mutate_studio_class_lifecycle(current_setting('qa.class')::uuid,'archive');
select pg_temp.qa_assert((select archived_at is not null and not is_active from public.classes where id=current_setting('qa.class')::uuid),'D archive atomic state');
select pg_temp.qa_assert(pg_temp.lifecycle_snapshot(current_setting('qa.class')::uuid)=current_setting('qa.history_before')::jsonb,'archive preserves complete operating history/rules/exceptions');
select pg_temp.qa_denied(format('update public.classes set is_active=true where id=%L',current_setting('qa.class')),'class_restore_required','F archived direct publish FAIL');
select pg_temp.qa_denied(format('update public.classes set title=%L where id=%L','stale edit',current_setting('qa.class')),'class_restore_required','archived metadata edit FAIL');
select public.mutate_studio_class_lifecycle(current_setting('qa.class')::uuid,'restore');
select pg_temp.qa_assert((select archived_at is null and not is_active from public.classes where id=current_setting('qa.class')::uuid),'E restore is private, no automatic publish');
select pg_temp.qa_assert(pg_temp.lifecycle_snapshot(current_setting('qa.class')::uuid)=current_setting('qa.history_before')::jsonb,'restore preserves complete operating history');
select public.mutate_studio_class_lifecycle(current_setting('qa.class')::uuid,'archive');
reset role;
select pg_temp.qa_assert(public.reconcile_class_operating_rule(current_setting('qa.class')::uuid,(now() at time zone 'Asia/Seoul')::date+80,true)=0,'H archived reconcile generates 0');
select pg_temp.qa_assert(public.extend_rolling_class_schedule(current_setting('qa.class')::uuid)=0,'H archived refill generates 0');
select pg_temp.qa_assert(pg_temp.lifecycle_snapshot(current_setting('qa.class')::uuid)=current_setting('qa.history_before')::jsonb,'reconcile/refill preserve archived data');
select pg_temp.qa_denied(format('insert into public.trial_applications(class_id,child_name,child_grade,requested_slot_at) values(%L,%L,%L,now())',current_setting('qa.class'),'TEST','초3'),'class_not_available','G archived service/import application FAIL');
select pg_temp.qa_denied(format('insert into public.class_schedules(class_id,schedule_type,specific_date,start_time,end_time,capacity) values(%L,%L,current_date+2,%L,%L,2)',current_setting('qa.class'),'one_time','19:00','20:00'),'class_restore_required','archived manual generation FAIL');
select pg_temp.qa_denied(format('update public.class_operating_rules set slots=slots where class_id=%L',current_setting('qa.class')),'class_restore_required','archived operating-rule mutation FAIL');
set local role authenticated;
-- An independent eligible private fixed-period fixture exercises raw delete and RPC deletion.
do $$ declare c uuid; d date := (now() at time zone 'Asia/Seoul')::date+2; begin
 select id into c from public.save_studio_class_operating_rule(null,jsonb_build_object('organization_id',current_setting('qa.org'),'title','TEST LIFECYCLE PRIVATE FIXED','subject','math','target_age','elem_3','description','rollback only','assignment_mode','post_assign','is_active',false),jsonb_build_object('operationType','fixed_period','startDate',d,'endDate',d+6,'slots',(select jsonb_agg(jsonb_build_object('weekday',i,'startTime','15:00','endTime','16:00','capacity',3,'seriesId',gen_random_uuid())) from generate_series(0,6)i)),0);
 perform pg_temp.qa_assert((select count(*)=7 from public.class_schedules where class_id=c),'I nonarchived private fixed_period generates 7 occurrences');
 perform pg_temp.qa_assert((select can_permanently_delete from public.get_studio_class_delete_eligibility() where class_id=c),'B generated-only eligible');
 perform pg_temp.qa_denied(format('delete from public.classes where id=%L',c),'class_delete_requires_lifecycle_rpc','A raw direct DELETE blocked');
 perform public.mutate_studio_class_lifecycle(c,'delete');
 perform pg_temp.qa_assert(not exists(select 1 from public.classes where id=c) and not exists(select 1 from public.class_schedules where class_id=c),'B/J same-org RPC permanent delete PASS; derivatives cleaned');
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.other'),'role','authenticated')::text,true);
select pg_temp.qa_assert(not exists(select 1 from public.get_studio_class_delete_eligibility() where class_id=current_setting('qa.class')::uuid),'other-org eligibility does not leak target');
do $$ declare a text; begin foreach a in array array['archive','restore','delete'] loop perform pg_temp.qa_denied(format('select public.mutate_studio_class_lifecycle(%L,%L)',current_setting('qa.class'),a),'studio_class_not_found_or_forbidden','K other-org '||a||' denied'); end loop; end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.parent'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.parent'),'role','authenticated')::text,true);
do $$ declare a text; begin foreach a in array array['archive','restore','delete'] loop perform pg_temp.qa_denied(format('select public.mutate_studio_class_lifecycle(%L,%L)',current_setting('qa.class'),a),'studio_class_not_found_or_forbidden','K Parent '||a||' denied'); end loop; end $$;
select pg_temp.qa_denied('select public.get_studio_class_delete_eligibility()','studio_class_not_found_or_forbidden','K Parent eligibility denied');
select pg_temp.qa_denied(format('insert into public.trial_applications(class_id,parent_id,child_name,child_grade,requested_slot_at) values(%L,%L,%L,%L,now())',current_setting('qa.class'),current_setting('qa.parent'),'TEST','초3'),'class_not_available|row-level security','G Parent archived application FAIL');
select pg_temp.qa_assert((select count(*)=1 from public.experience_reports where application_id=current_setting('qa.application')::uuid),'Parent historical published report remains readable');
reset role;
grant insert,select on qa_lifecycle_results to anon;
set local role anon;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $$ declare a text; begin foreach a in array array['archive','restore','delete'] loop perform pg_temp.qa_denied(format('select public.mutate_studio_class_lifecycle(%L,%L)',current_setting('qa.class'),a),'permission denied','K anon '||a||' denied'); end loop; end $$;
select pg_temp.qa_denied('select public.get_studio_class_delete_eligibility()','permission denied','K anon eligibility denied');
select pg_temp.qa_assert(not exists(select 1 from public.classes where id=current_setting('qa.class')::uuid),'Parent/anon public RLS excludes archived');
reset role;
select pg_temp.qa_assert((select count(*)=0 from public.sms_logs where trial_application_id=current_setting('qa.application')::uuid),'no SMS log or provider request');
select json_build_object('passed',count(*),'checks',json_agg(label),'fixtureCleanup','ROLLBACK','externalMessages',0) as lifecycle_smoke from qa_lifecycle_results;
rollback;
