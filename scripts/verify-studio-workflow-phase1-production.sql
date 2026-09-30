-- Production-safe Phase 1B permission smoke, also rehearsed on Local Supabase.
-- All TEST identities and rows exist only inside this transaction. Always ROLLBACK.
-- No server action, SMS/Alimtalk provider or real user row is invoked/modified.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create temporary table qa_phase1_results(label text);
grant insert,select on qa_phase1_results to authenticated;
create function pg_temp.qa_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'QA_FAILED: %',label; end if;
 insert into qa_phase1_results values(label); end $$;
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
select pg_temp.qa_denied(format('select public.finalize_studio_trial_result(%L::uuid,%L::jsonb)',current_setting('qa.application'),'{}'),'trial_result_already_finalized','second finalization denied');
select pg_temp.qa_denied(format('select public.publish_experience_report(%L::uuid,now())',current_setting('qa.application')),'report_already_sent','report republish denied');
select pg_temp.qa_denied(format('update public.trial_results set note=%L where application_id=%L::uuid','overwrite',current_setting('qa.application')),'permission denied','direct record update denied');
select pg_temp.qa_denied(format('update public.studio_trial_applications set registration_status=%L where id=%L::uuid','pending',current_setting('qa.application')),'permission denied','legacy direct registration denied');
select pg_temp.qa_assert(not has_function_privilege('authenticated','public.create_studio_consultation(uuid,uuid,timestamptz,text,text,text,text,text,text,text,timestamptz,boolean,jsonb,text,text)','EXECUTE'),'legacy coupled RPC effective ACL revoked');
select pg_temp.qa_denied(format('select public.set_studio_registration_result(%L::uuid,%L)',current_setting('qa.canceled'),'enrolled'),'application_not_completed','canceled application denied');
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.other'),'role','authenticated')::text,true);
select pg_temp.qa_assert((select count(*)=0 from public.studio_trial_applications where id=current_setting('qa.application')::uuid),'other-org detail hidden');
select pg_temp.qa_denied(format('select public.set_studio_registration_result(%L::uuid,%L)',current_setting('qa.application'),'pending'),'application_not_found_or_forbidden','other-org registration denied');
select pg_temp.qa_denied(format('select public.finalize_studio_trial_result(%L::uuid,%L::jsonb)',current_setting('qa.application'),'{}'),'application_not_found_or_forbidden','other-org record denied');
select pg_temp.qa_denied(format('select public.publish_experience_report(%L::uuid,now())',current_setting('qa.application')),'application_not_found_or_forbidden','other-org report denied');
select pg_temp.qa_denied(format('select public.record_studio_contact(gen_random_uuid(),%L::uuid,now(),%L,%L,%L,null,false,null,null,null)',current_setting('qa.application'),'PHONE','NEUTRAL','TEST'),'application_not_found_or_forbidden','other-org contact denied');
select set_config('request.jwt.claim.sub',current_setting('qa.parent'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.parent'),'role','authenticated')::text,true);
select pg_temp.qa_assert((select count(*)=1 from public.experience_reports where application_id=current_setting('qa.application')::uuid),'own Parent published report readable');
select pg_temp.qa_assert((select count(*)=0 from public.application_logs where application_id=current_setting('qa.application')::uuid and is_internal),'Parent private history hidden');
select pg_temp.qa_denied('select registration_note from public.trial_applications','permission denied','Parent private registration fields denied');
select pg_temp.qa_denied(format('select public.set_studio_registration_result(%L::uuid,%L)',current_setting('qa.application'),'pending'),'application_not_found_or_forbidden','Parent registration denied');
select pg_temp.qa_denied(format('select public.finalize_studio_trial_result(%L::uuid,%L::jsonb)',current_setting('qa.application'),'{}'),'application_not_found_or_forbidden','Parent record denied');
select pg_temp.qa_denied(format('select public.publish_experience_report(%L::uuid,now())',current_setting('qa.application')),'application_not_found_or_forbidden','Parent report denied');
select pg_temp.qa_denied(format('select public.record_studio_contact(gen_random_uuid(),%L::uuid,now(),%L,%L,%L,null,false,null,null,null)',current_setting('qa.application'),'PHONE','NEUTRAL','TEST'),'application_not_found_or_forbidden','Parent contact denied');
reset role;
select pg_temp.qa_assert(not has_function_privilege('anon','public.set_studio_registration_result(uuid,text,text[],text)','EXECUTE') and not has_function_privilege('anon','public.finalize_studio_trial_result(uuid,jsonb)','EXECUTE') and not has_function_privilege('anon','public.record_studio_contact(uuid,uuid,timestamptz,text,text,text,timestamptz,boolean,jsonb,text,text)','EXECUTE') and not has_function_privilege('anon','public.publish_experience_report(uuid,timestamptz)','EXECUTE'),'anon all mutation RPC effective ACL denied');
select pg_temp.qa_denied(format('update public.trial_results set note=%L where application_id=%L::uuid','overwrite',current_setting('qa.application')),'trial_result_already_finalized','record immutable trigger enforced even with elevated role');
select pg_temp.qa_assert((select count(*)=0 from public.parent_decisions where application_id=current_setting('qa.application')::uuid),'ParentDecision not created or mutated');
select pg_temp.qa_assert((select count(*)=0 from public.sms_logs where trial_application_id=current_setting('qa.application')::uuid),'no SMS log or provider request');
select json_build_object('passed',count(*),'checks',json_agg(label),'fixtureCleanup','ROLLBACK','externalMessages',0) as phase1_smoke from qa_phase1_results;
rollback;
