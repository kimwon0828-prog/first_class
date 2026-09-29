-- Local/isolated DB only. All fixture data and workflow mutations ROLLBACK.
\set ON_ERROR_STOP on
begin;
insert into public.organizations(id,name) values('fb910000-0000-4000-8000-000000000001','TEST feedback workflow');
insert into auth.users(id,email) values ('fb920000-0000-4000-8000-000000000001','feedback-workflow-parent@test.invalid'),('fb920000-0000-4000-8000-000000000002','feedback-workflow-studio@test.invalid');
insert into public.profiles(id,role,name,organization_id) values
 ('fb920000-0000-4000-8000-000000000001','parent','TEST parent',null),
 ('fb920000-0000-4000-8000-000000000002','academy','TEST studio','fb910000-0000-4000-8000-000000000001');
insert into public.classes(id,organization_id,title,subject,target_age,description,assignment_mode) values
 ('fb940000-0000-4000-8000-000000000001','fb910000-0000-4000-8000-000000000001','TEST feedback workflow','math','elem_3','TEST','post_assign');
insert into public.trial_applications(id,parent_id,class_id,child_name,child_grade,requested_slot_at,status,completed_at)
select ('fb960000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fb920000-0000-4000-8000-000000000001','fb940000-0000-4000-8000-000000000001','TEST student','elem_3',now(),case when n in (1,4,5) then 'completed' else 'confirmed' end,case when n in (1,4,5) then now() else null end from generate_series(1,5)n;
insert into public.parent_decisions(application_id,parent_id,decision) values ('fb960000-0000-4000-8000-000000000004','fb920000-0000-4000-8000-000000000001','planned');
insert into public.experience_reports(application_id,version,status,content,published_at)
select id,1,'published','{}'::jsonb,now() from public.trial_applications
where id in ('fb960000-0000-4000-8000-000000000001','fb960000-0000-4000-8000-000000000004','fb960000-0000-4000-8000-000000000005');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true) is not null as role_set;
select set_config('request.jwt.claim.sub','fb920000-0000-4000-8000-000000000001',true) is not null as actor_set;
select public.submit_parent_experience('fb960000-0000-4000-8000-000000000001',array['child_enjoyed'],null,'considering');
select set_config('request.jwt.claim.sub','fb920000-0000-4000-8000-000000000002',true) is not null as actor_set;
update public.studio_trial_applications set registration_status='enrolled',enrolled_at=now(),registered_course='TEST course' where id in ('fb960000-0000-4000-8000-000000000001','fb960000-0000-4000-8000-000000000004','fb960000-0000-4000-8000-000000000005');
update public.studio_trial_applications set status='canceled',no_show_at=now(),confirmed_slot_at=null,confirmed_schedule_block_id=null where id='fb960000-0000-4000-8000-000000000002';
update public.studio_trial_applications set status='canceled',canceled_at=now(),confirmed_slot_at=null,confirmed_schedule_block_id=null where id='fb960000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.sub','fb920000-0000-4000-8000-000000000001',true) is not null as actor_set;
select public.submit_parent_experience('fb960000-0000-4000-8000-000000000004','{}','등록 후 기존 의향에 피드백만 추가',null);
do $$ begin
 assert (select decision='considering' from public.parent_decisions where application_id='fb960000-0000-4000-8000-000000000001' and superseded_at is null),'ParentDecision independent';
 assert (select private_note is null and selected_chip_ids=array['child_enjoyed'] from public.experience_feedback where application_id='fb960000-0000-4000-8000-000000000001'),'enrolled keeps final feedback';
 begin perform public.submit_parent_experience('fb960000-0000-4000-8000-000000000001','{}','변경','planned');raise exception 'revision allowed';exception when others then if sqlerrm<>'feedback_already_submitted' then raise;end if;end;
 begin perform public.submit_parent_experience('fb960000-0000-4000-8000-000000000005','{}','신규 의향','planned');raise exception 'closed decision allowed';exception when others then if sqlerrm<>'feedback_decision_closed' then raise;end if;end;
 begin perform public.submit_parent_experience('fb960000-0000-4000-8000-000000000002',array['child_enjoyed'],null,'planned');raise exception 'no-show allowed';exception when others then if sqlerrm<>'feedback_not_eligible' then raise;end if;end;
 begin perform public.submit_parent_experience('fb960000-0000-4000-8000-000000000003',array['child_enjoyed'],null,'planned');raise exception 'cancel allowed';exception when others then if sqlerrm<>'feedback_not_eligible' then raise;end if;end;
end $$;
reset role;
do $$ begin
 assert exists(select 1 from public.registration_results where application_id='fb960000-0000-4000-8000-000000000001' and result='enrolled' and superseded_at is null),'registration result trigger';
 assert exists(select 1 from public.trial_applications where id='fb960000-0000-4000-8000-000000000002' and no_show_at is not null and canceled_at is null),'no-show semantics';
 assert exists(select 1 from public.trial_applications where id='fb960000-0000-4000-8000-000000000003' and canceled_at is not null and no_show_at is null),'cancel semantics';
 raise notice 'PASS ParentDecision independent, registration trigger, enrolled finality + legacy completion + closed decision guard, no-show and cancel eligibility';
end $$;
rollback;
