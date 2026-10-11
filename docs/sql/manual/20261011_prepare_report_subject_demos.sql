-- REVIEW ONLY. Exact file approval required before actual DB execution.
-- Seven missing categories only: 7 private classes + 7 past slots + 7 completed applications.
-- Existing English/coding cases and all other existing rows remain unchanged.
-- No report writes, notifications, new identities, JWT/role manipulation or disabled checks.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- korean_language (one private class / past slot / completed application)
do $prepare$
declare
 org constant uuid := '29e8c477-dabb-404c-bac4-ba96ffd1e999';
 parent constant uuid := 'b30a0732-5e20-4969-97d1-a8c51210f715';
 klass constant uuid := 'fc2a65a7-a049-47f0-a99c-cadc89c4a7a8';
 slot constant uuid := 'b4745226-419e-4bf4-926b-1a1291480698';
 application constant uuid := 'c830f295-62f3-47f9-8712-a77a23f3cec8';
 category constant uuid := '9c309401-7bdf-4aac-9506-83ce9497ca52';
 subject constant uuid := '5c2b1a8b-d993-4439-a084-a49245aeb3f4';
 trigger_fingerprint text;
begin
 -- Run only with an approved administrative DB connection, never a user JWT.
 if auth.uid() is not null or current_user not in ('postgres','supabase_admin') then
  raise exception 'demo_requires_approved_admin_connection';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('subject-report-demo-20261011:' || org::text,0));
 if not exists(select 1 from public.organizations where id=org and name='첫수업 데모학원') then
  raise exception 'demo_organization_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id='accedc61-4a49-4679-ad5c-392499c21ccd' and p.organization_id=org
  and p.role='academy' and u.email='demo@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_academy_account_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=parent and p.role='parent' and p.name='데모 보호자 1'
  and u.email='demo-parent1@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_parent_mismatch';
 end if;
 if not exists(select 1 from public.subject_categories where id=category and code='korean_language' and is_active)
  or not exists(select 1 from public.subjects where id=subject and code='korean' and category_id=category and is_active) then
  raise exception 'demo_subject_classification_mismatch';
 end if;
 if exists(select 1 from public.classes where id=klass or (organization_id=org and title='[데모] 국어·논술 리포트 확인 (2026-10-11)'))
  or exists(select 1 from public.class_schedules where id=slot)
  or exists(select 1 from public.trial_applications where id=application) then
  raise exception 'demo_target_already_exists';
 end if;
 if not exists(select 1 from public.parent_confirmed_push_settings where singleton and mode='off') then
  raise exception 'demo_confirmed_push_must_remain_off';
 end if;
 if public.experience_report_observation_label('korean_language_asked_about_text') is null then
  raise exception 'demo_subject_migration_required';
 end if;
 -- Stop for re-review if INSERT triggers/functions changed, including new webhooks.
 select md5(string_agg(pg_get_triggerdef(t.oid)||pg_get_functiondef(t.tgfoid),''
  order by t.tgrelid::regclass::text,t.tgname)) into trigger_fingerprint
 from pg_trigger t where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not tgisinternal;
 if trigger_fingerprint is distinct from '58f7610de81ada34daa5f723e6393cf1'
  or exists(select 1 from pg_trigger where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
   and not tgisinternal and tgenabled<>'O') then
  raise exception 'demo_trigger_contract_changed';
 end if;
 if exists(select 1 from pg_class where oid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not relrowsecurity) then raise exception 'demo_rls_contract_changed'; end if;
 if now() <= '2026-10-10 15:00:00+09'::timestamptz then raise exception 'demo_trial_must_be_in_past'; end if;

 insert into public.classes(id,organization_id,title,subject,subject_category_id,subject_id,
  target_age,description,trial_price,is_active,program_type,assignment_mode,teacher_id,archived_at)
 values(klass,org,'[데모] 국어·논술 리포트 확인 (2026-10-11)','korean',category,subject,
  'elem_3','국어·논술 관찰 문항과 리포트 작성 확인을 위한 비공개 데모 수업입니다.',0,false,'trial_class','post_assign',null,null);

 -- The existing booking trigger requires an open slot even for completed history.
 -- Public recruitment remains blocked by classes.is_active=false; this slot is past.
 insert into public.class_schedules(id,class_id,schedule_type,day_of_week,specific_date,start_time,end_time,
  capacity,booking_status,display_label,sort_order,is_manual_override,generated_by_rule_id)
 values(slot,klass,'one_time',null,'2026-10-10','14:00','15:00',1,'open',
  '2026.10.10 14:00~15:00 · 국어·논술 리포트 데모',0,false,null);

 -- No real child/contact is copied. No trial_result, publication, activity log or notification is created.
 insert into public.trial_applications(id,class_id,class_schedule_id,parent_id,child_id,child_name,child_grade,
  parent_name,parent_phone,requested_slot_at,confirmed_slot_at,status,completed_at,last_activity_at,
  assigned_teacher_id,requested_schedule_block_id,confirmed_schedule_block_id,registration_status,
  memo,selected_schedule_label)
 values(application,klass,slot,parent,null,'국어·논술 리포트 데모학생','초3','데모 보호자 1',null,
  '2026-10-10 14:00:00+09','2026-10-10 14:00:00+09','completed','2026-10-10 15:00:00+09','2026-10-10 15:00:00+09',
  null,null,null,'undecided','국어·논술 리포트 작성 검토용 신규 데모 신청 · 실제 체험 이력이 아닙니다.',
  '2026.10.10 14:00~15:00 · 국어·논술 리포트 데모');
end $prepare$;


-- science (one private class / past slot / completed application)
do $prepare$
declare
 org constant uuid := '29e8c477-dabb-404c-bac4-ba96ffd1e999';
 parent constant uuid := 'b30a0732-5e20-4969-97d1-a8c51210f715';
 klass constant uuid := 'dcffc2d6-eb5e-4960-af90-4d6ccfa4de99';
 slot constant uuid := '3dd31933-aab3-49f3-ac4b-462868a6b5e4';
 application constant uuid := '1930955b-ef54-4a5c-8a9e-5b4cd6c5ac15';
 category constant uuid := 'c3b5e55b-4035-47a0-b28e-31f3390ebb76';
 subject constant uuid := '2da74bec-878f-4ec9-b14e-aa0b88c1640e';
 trigger_fingerprint text;
begin
 -- Run only with an approved administrative DB connection, never a user JWT.
 if auth.uid() is not null or current_user not in ('postgres','supabase_admin') then
  raise exception 'demo_requires_approved_admin_connection';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('subject-report-demo-20261011:' || org::text,0));
 if not exists(select 1 from public.organizations where id=org and name='첫수업 데모학원') then
  raise exception 'demo_organization_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id='accedc61-4a49-4679-ad5c-392499c21ccd' and p.organization_id=org
  and p.role='academy' and u.email='demo@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_academy_account_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=parent and p.role='parent' and p.name='데모 보호자 1'
  and u.email='demo-parent1@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_parent_mismatch';
 end if;
 if not exists(select 1 from public.subject_categories where id=category and code='science' and is_active)
  or not exists(select 1 from public.subjects where id=subject and code='science' and category_id=category and is_active) then
  raise exception 'demo_subject_classification_mismatch';
 end if;
 if exists(select 1 from public.classes where id=klass or (organization_id=org and title='[데모] 과학 리포트 확인 (2026-10-11)'))
  or exists(select 1 from public.class_schedules where id=slot)
  or exists(select 1 from public.trial_applications where id=application) then
  raise exception 'demo_target_already_exists';
 end if;
 if not exists(select 1 from public.parent_confirmed_push_settings where singleton and mode='off') then
  raise exception 'demo_confirmed_push_must_remain_off';
 end if;
 if public.experience_report_observation_label('science_asked_about_phenomenon') is null then
  raise exception 'demo_subject_migration_required';
 end if;
 -- Stop for re-review if INSERT triggers/functions changed, including new webhooks.
 select md5(string_agg(pg_get_triggerdef(t.oid)||pg_get_functiondef(t.tgfoid),''
  order by t.tgrelid::regclass::text,t.tgname)) into trigger_fingerprint
 from pg_trigger t where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not tgisinternal;
 if trigger_fingerprint is distinct from '58f7610de81ada34daa5f723e6393cf1'
  or exists(select 1 from pg_trigger where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
   and not tgisinternal and tgenabled<>'O') then
  raise exception 'demo_trigger_contract_changed';
 end if;
 if exists(select 1 from pg_class where oid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not relrowsecurity) then raise exception 'demo_rls_contract_changed'; end if;
 if now() <= '2026-10-10 15:00:00+09'::timestamptz then raise exception 'demo_trial_must_be_in_past'; end if;

 insert into public.classes(id,organization_id,title,subject,subject_category_id,subject_id,
  target_age,description,trial_price,is_active,program_type,assignment_mode,teacher_id,archived_at)
 values(klass,org,'[데모] 과학 리포트 확인 (2026-10-11)','science',category,subject,
  'elem_3','과학 관찰 문항과 리포트 작성 확인을 위한 비공개 데모 수업입니다.',0,false,'trial_class','post_assign',null,null);

 -- The existing booking trigger requires an open slot even for completed history.
 -- Public recruitment remains blocked by classes.is_active=false; this slot is past.
 insert into public.class_schedules(id,class_id,schedule_type,day_of_week,specific_date,start_time,end_time,
  capacity,booking_status,display_label,sort_order,is_manual_override,generated_by_rule_id)
 values(slot,klass,'one_time',null,'2026-10-10','14:00','15:00',1,'open',
  '2026.10.10 14:00~15:00 · 과학 리포트 데모',0,false,null);

 -- No real child/contact is copied. No trial_result, publication, activity log or notification is created.
 insert into public.trial_applications(id,class_id,class_schedule_id,parent_id,child_id,child_name,child_grade,
  parent_name,parent_phone,requested_slot_at,confirmed_slot_at,status,completed_at,last_activity_at,
  assigned_teacher_id,requested_schedule_block_id,confirmed_schedule_block_id,registration_status,
  memo,selected_schedule_label)
 values(application,klass,slot,parent,null,'과학 리포트 데모학생','초3','데모 보호자 1',null,
  '2026-10-10 14:00:00+09','2026-10-10 14:00:00+09','completed','2026-10-10 15:00:00+09','2026-10-10 15:00:00+09',
  null,null,null,'undecided','과학 리포트 작성 검토용 신규 데모 신청 · 실제 체험 이력이 아닙니다.',
  '2026.10.10 14:00~15:00 · 과학 리포트 데모');
end $prepare$;


-- social_history (one private class / past slot / completed application)
do $prepare$
declare
 org constant uuid := '29e8c477-dabb-404c-bac4-ba96ffd1e999';
 parent constant uuid := 'b30a0732-5e20-4969-97d1-a8c51210f715';
 klass constant uuid := 'd8d49de7-8535-4614-b455-285fdd1261f9';
 slot constant uuid := '61cbbe75-4330-419f-8f62-1202eef6eeef';
 application constant uuid := '7dbf219a-f7cc-46dd-aa09-1c640026451f';
 category constant uuid := '08c74dc1-438d-4e86-ad29-b501c7287d12';
 subject constant uuid := 'c32cb52b-925b-4d2b-9529-aeb2ae801eaf';
 trigger_fingerprint text;
begin
 -- Run only with an approved administrative DB connection, never a user JWT.
 if auth.uid() is not null or current_user not in ('postgres','supabase_admin') then
  raise exception 'demo_requires_approved_admin_connection';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('subject-report-demo-20261011:' || org::text,0));
 if not exists(select 1 from public.organizations where id=org and name='첫수업 데모학원') then
  raise exception 'demo_organization_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id='accedc61-4a49-4679-ad5c-392499c21ccd' and p.organization_id=org
  and p.role='academy' and u.email='demo@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_academy_account_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=parent and p.role='parent' and p.name='데모 보호자 1'
  and u.email='demo-parent1@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_parent_mismatch';
 end if;
 if not exists(select 1 from public.subject_categories where id=category and code='social_history' and is_active)
  or not exists(select 1 from public.subjects where id=subject and code='social' and category_id=category and is_active) then
  raise exception 'demo_subject_classification_mismatch';
 end if;
 if exists(select 1 from public.classes where id=klass or (organization_id=org and title='[데모] 사회·역사 리포트 확인 (2026-10-11)'))
  or exists(select 1 from public.class_schedules where id=slot)
  or exists(select 1 from public.trial_applications where id=application) then
  raise exception 'demo_target_already_exists';
 end if;
 if not exists(select 1 from public.parent_confirmed_push_settings where singleton and mode='off') then
  raise exception 'demo_confirmed_push_must_remain_off';
 end if;
 if public.experience_report_observation_label('social_history_asked_about_topic') is null then
  raise exception 'demo_subject_migration_required';
 end if;
 -- Stop for re-review if INSERT triggers/functions changed, including new webhooks.
 select md5(string_agg(pg_get_triggerdef(t.oid)||pg_get_functiondef(t.tgfoid),''
  order by t.tgrelid::regclass::text,t.tgname)) into trigger_fingerprint
 from pg_trigger t where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not tgisinternal;
 if trigger_fingerprint is distinct from '58f7610de81ada34daa5f723e6393cf1'
  or exists(select 1 from pg_trigger where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
   and not tgisinternal and tgenabled<>'O') then
  raise exception 'demo_trigger_contract_changed';
 end if;
 if exists(select 1 from pg_class where oid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not relrowsecurity) then raise exception 'demo_rls_contract_changed'; end if;
 if now() <= '2026-10-10 15:00:00+09'::timestamptz then raise exception 'demo_trial_must_be_in_past'; end if;

 insert into public.classes(id,organization_id,title,subject,subject_category_id,subject_id,
  target_age,description,trial_price,is_active,program_type,assignment_mode,teacher_id,archived_at)
 values(klass,org,'[데모] 사회·역사 리포트 확인 (2026-10-11)','social',category,subject,
  'elem_3','사회·역사 관찰 문항과 리포트 작성 확인을 위한 비공개 데모 수업입니다.',0,false,'trial_class','post_assign',null,null);

 -- The existing booking trigger requires an open slot even for completed history.
 -- Public recruitment remains blocked by classes.is_active=false; this slot is past.
 insert into public.class_schedules(id,class_id,schedule_type,day_of_week,specific_date,start_time,end_time,
  capacity,booking_status,display_label,sort_order,is_manual_override,generated_by_rule_id)
 values(slot,klass,'one_time',null,'2026-10-10','14:00','15:00',1,'open',
  '2026.10.10 14:00~15:00 · 사회·역사 리포트 데모',0,false,null);

 -- No real child/contact is copied. No trial_result, publication, activity log or notification is created.
 insert into public.trial_applications(id,class_id,class_schedule_id,parent_id,child_id,child_name,child_grade,
  parent_name,parent_phone,requested_slot_at,confirmed_slot_at,status,completed_at,last_activity_at,
  assigned_teacher_id,requested_schedule_block_id,confirmed_schedule_block_id,registration_status,
  memo,selected_schedule_label)
 values(application,klass,slot,parent,null,'사회·역사 리포트 데모학생','초3','데모 보호자 1',null,
  '2026-10-10 14:00:00+09','2026-10-10 14:00:00+09','completed','2026-10-10 15:00:00+09','2026-10-10 15:00:00+09',
  null,null,null,'undecided','사회·역사 리포트 작성 검토용 신규 데모 신청 · 실제 체험 이력이 아닙니다.',
  '2026.10.10 14:00~15:00 · 사회·역사 리포트 데모');
end $prepare$;


-- foreign_language (one private class / past slot / completed application)
do $prepare$
declare
 org constant uuid := '29e8c477-dabb-404c-bac4-ba96ffd1e999';
 parent constant uuid := 'b30a0732-5e20-4969-97d1-a8c51210f715';
 klass constant uuid := '1aafd1e9-fcff-4b29-99a7-4e199d17e501';
 slot constant uuid := '22965749-f1f3-41f4-abb8-98cb39bed070';
 application constant uuid := '8fdd8af8-67a7-4c4b-b679-7709e84999ff';
 category constant uuid := 'fe4b6b22-28ff-47a6-95fa-e0b1cf635bf4';
 subject constant uuid := 'fa3cabe9-752d-43b2-9ad8-b4764990bf84';
 trigger_fingerprint text;
begin
 -- Run only with an approved administrative DB connection, never a user JWT.
 if auth.uid() is not null or current_user not in ('postgres','supabase_admin') then
  raise exception 'demo_requires_approved_admin_connection';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('subject-report-demo-20261011:' || org::text,0));
 if not exists(select 1 from public.organizations where id=org and name='첫수업 데모학원') then
  raise exception 'demo_organization_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id='accedc61-4a49-4679-ad5c-392499c21ccd' and p.organization_id=org
  and p.role='academy' and u.email='demo@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_academy_account_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=parent and p.role='parent' and p.name='데모 보호자 1'
  and u.email='demo-parent1@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_parent_mismatch';
 end if;
 if not exists(select 1 from public.subject_categories where id=category and code='foreign_language' and is_active)
  or not exists(select 1 from public.subjects where id=subject and code='chinese' and category_id=category and is_active) then
  raise exception 'demo_subject_classification_mismatch';
 end if;
 if exists(select 1 from public.classes where id=klass or (organization_id=org and title='[데모] 외국어 리포트 확인 (2026-10-11)'))
  or exists(select 1 from public.class_schedules where id=slot)
  or exists(select 1 from public.trial_applications where id=application) then
  raise exception 'demo_target_already_exists';
 end if;
 if not exists(select 1 from public.parent_confirmed_push_settings where singleton and mode='off') then
  raise exception 'demo_confirmed_push_must_remain_off';
 end if;
 if public.experience_report_observation_label('foreign_language_responded_known_expression') is null then
  raise exception 'demo_subject_migration_required';
 end if;
 -- Stop for re-review if INSERT triggers/functions changed, including new webhooks.
 select md5(string_agg(pg_get_triggerdef(t.oid)||pg_get_functiondef(t.tgfoid),''
  order by t.tgrelid::regclass::text,t.tgname)) into trigger_fingerprint
 from pg_trigger t where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not tgisinternal;
 if trigger_fingerprint is distinct from '58f7610de81ada34daa5f723e6393cf1'
  or exists(select 1 from pg_trigger where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
   and not tgisinternal and tgenabled<>'O') then
  raise exception 'demo_trigger_contract_changed';
 end if;
 if exists(select 1 from pg_class where oid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not relrowsecurity) then raise exception 'demo_rls_contract_changed'; end if;
 if now() <= '2026-10-10 15:00:00+09'::timestamptz then raise exception 'demo_trial_must_be_in_past'; end if;

 insert into public.classes(id,organization_id,title,subject,subject_category_id,subject_id,
  target_age,description,trial_price,is_active,program_type,assignment_mode,teacher_id,archived_at)
 values(klass,org,'[데모] 외국어 리포트 확인 (2026-10-11)','chinese',category,subject,
  'elem_3','외국어 관찰 문항과 리포트 작성 확인을 위한 비공개 데모 수업입니다.',0,false,'trial_class','post_assign',null,null);

 -- The existing booking trigger requires an open slot even for completed history.
 -- Public recruitment remains blocked by classes.is_active=false; this slot is past.
 insert into public.class_schedules(id,class_id,schedule_type,day_of_week,specific_date,start_time,end_time,
  capacity,booking_status,display_label,sort_order,is_manual_override,generated_by_rule_id)
 values(slot,klass,'one_time',null,'2026-10-10','14:00','15:00',1,'open',
  '2026.10.10 14:00~15:00 · 외국어 리포트 데모',0,false,null);

 -- No real child/contact is copied. No trial_result, publication, activity log or notification is created.
 insert into public.trial_applications(id,class_id,class_schedule_id,parent_id,child_id,child_name,child_grade,
  parent_name,parent_phone,requested_slot_at,confirmed_slot_at,status,completed_at,last_activity_at,
  assigned_teacher_id,requested_schedule_block_id,confirmed_schedule_block_id,registration_status,
  memo,selected_schedule_label)
 values(application,klass,slot,parent,null,'외국어 리포트 데모학생','초3','데모 보호자 1',null,
  '2026-10-10 14:00:00+09','2026-10-10 14:00:00+09','completed','2026-10-10 15:00:00+09','2026-10-10 15:00:00+09',
  null,null,null,'undecided','외국어 리포트 작성 검토용 신규 데모 신청 · 실제 체험 이력이 아닙니다.',
  '2026.10.10 14:00~15:00 · 외국어 리포트 데모');
end $prepare$;


-- art_design (one private class / past slot / completed application)
do $prepare$
declare
 org constant uuid := '29e8c477-dabb-404c-bac4-ba96ffd1e999';
 parent constant uuid := 'b30a0732-5e20-4969-97d1-a8c51210f715';
 klass constant uuid := 'da93f169-f413-41f1-b2fd-6a6932b007b4';
 slot constant uuid := '3971a109-4c2c-4521-bc95-829499014bdf';
 application constant uuid := '41645455-4ece-4637-a3ba-fe9202a96907';
 category constant uuid := '40dd842a-c75f-48cf-9098-934ca56c81ec';
 subject constant uuid := 'b46de9a0-8b35-42af-82a0-a62f64d2bae0';
 trigger_fingerprint text;
begin
 -- Run only with an approved administrative DB connection, never a user JWT.
 if auth.uid() is not null or current_user not in ('postgres','supabase_admin') then
  raise exception 'demo_requires_approved_admin_connection';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('subject-report-demo-20261011:' || org::text,0));
 if not exists(select 1 from public.organizations where id=org and name='첫수업 데모학원') then
  raise exception 'demo_organization_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id='accedc61-4a49-4679-ad5c-392499c21ccd' and p.organization_id=org
  and p.role='academy' and u.email='demo@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_academy_account_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=parent and p.role='parent' and p.name='데모 보호자 1'
  and u.email='demo-parent1@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_parent_mismatch';
 end if;
 if not exists(select 1 from public.subject_categories where id=category and code='art_design' and is_active)
  or not exists(select 1 from public.subjects where id=subject and code='art' and category_id=category and is_active) then
  raise exception 'demo_subject_classification_mismatch';
 end if;
 if exists(select 1 from public.classes where id=klass or (organization_id=org and title='[데모] 미술·디자인 리포트 확인 (2026-10-11)'))
  or exists(select 1 from public.class_schedules where id=slot)
  or exists(select 1 from public.trial_applications where id=application) then
  raise exception 'demo_target_already_exists';
 end if;
 if not exists(select 1 from public.parent_confirmed_push_settings where singleton and mode='off') then
  raise exception 'demo_confirmed_push_must_remain_off';
 end if;
 if public.experience_report_observation_label('art_design_explored_expression') is null then
  raise exception 'demo_subject_migration_required';
 end if;
 -- Stop for re-review if INSERT triggers/functions changed, including new webhooks.
 select md5(string_agg(pg_get_triggerdef(t.oid)||pg_get_functiondef(t.tgfoid),''
  order by t.tgrelid::regclass::text,t.tgname)) into trigger_fingerprint
 from pg_trigger t where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not tgisinternal;
 if trigger_fingerprint is distinct from '58f7610de81ada34daa5f723e6393cf1'
  or exists(select 1 from pg_trigger where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
   and not tgisinternal and tgenabled<>'O') then
  raise exception 'demo_trigger_contract_changed';
 end if;
 if exists(select 1 from pg_class where oid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not relrowsecurity) then raise exception 'demo_rls_contract_changed'; end if;
 if now() <= '2026-10-10 15:00:00+09'::timestamptz then raise exception 'demo_trial_must_be_in_past'; end if;

 insert into public.classes(id,organization_id,title,subject,subject_category_id,subject_id,
  target_age,description,trial_price,is_active,program_type,assignment_mode,teacher_id,archived_at)
 values(klass,org,'[데모] 미술·디자인 리포트 확인 (2026-10-11)','art',category,subject,
  'elem_3','미술·디자인 관찰 문항과 리포트 작성 확인을 위한 비공개 데모 수업입니다.',0,false,'trial_class','post_assign',null,null);

 -- The existing booking trigger requires an open slot even for completed history.
 -- Public recruitment remains blocked by classes.is_active=false; this slot is past.
 insert into public.class_schedules(id,class_id,schedule_type,day_of_week,specific_date,start_time,end_time,
  capacity,booking_status,display_label,sort_order,is_manual_override,generated_by_rule_id)
 values(slot,klass,'one_time',null,'2026-10-10','14:00','15:00',1,'open',
  '2026.10.10 14:00~15:00 · 미술·디자인 리포트 데모',0,false,null);

 -- No real child/contact is copied. No trial_result, publication, activity log or notification is created.
 insert into public.trial_applications(id,class_id,class_schedule_id,parent_id,child_id,child_name,child_grade,
  parent_name,parent_phone,requested_slot_at,confirmed_slot_at,status,completed_at,last_activity_at,
  assigned_teacher_id,requested_schedule_block_id,confirmed_schedule_block_id,registration_status,
  memo,selected_schedule_label)
 values(application,klass,slot,parent,null,'미술·디자인 리포트 데모학생','초3','데모 보호자 1',null,
  '2026-10-10 14:00:00+09','2026-10-10 14:00:00+09','completed','2026-10-10 15:00:00+09','2026-10-10 15:00:00+09',
  null,null,null,'undecided','미술·디자인 리포트 작성 검토용 신규 데모 신청 · 실제 체험 이력이 아닙니다.',
  '2026.10.10 14:00~15:00 · 미술·디자인 리포트 데모');
end $prepare$;


-- sports_dance (one private class / past slot / completed application)
do $prepare$
declare
 org constant uuid := '29e8c477-dabb-404c-bac4-ba96ffd1e999';
 parent constant uuid := 'b30a0732-5e20-4969-97d1-a8c51210f715';
 klass constant uuid := 'd724b52b-7f36-43aa-bbfb-6781a21bc4b1';
 slot constant uuid := 'd233bebe-a47d-4e1f-9819-0d6bc1bb114b';
 application constant uuid := '386f42b9-9b43-45fe-9397-6bd1733620fa';
 category constant uuid := 'a2e56c44-f2b5-4e4f-ad63-305970f11db1';
 subject constant uuid := 'f69de1bb-e576-4a24-9e13-15e36855e984';
 trigger_fingerprint text;
begin
 -- Run only with an approved administrative DB connection, never a user JWT.
 if auth.uid() is not null or current_user not in ('postgres','supabase_admin') then
  raise exception 'demo_requires_approved_admin_connection';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('subject-report-demo-20261011:' || org::text,0));
 if not exists(select 1 from public.organizations where id=org and name='첫수업 데모학원') then
  raise exception 'demo_organization_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id='accedc61-4a49-4679-ad5c-392499c21ccd' and p.organization_id=org
  and p.role='academy' and u.email='demo@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_academy_account_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=parent and p.role='parent' and p.name='데모 보호자 1'
  and u.email='demo-parent1@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_parent_mismatch';
 end if;
 if not exists(select 1 from public.subject_categories where id=category and code='sports_dance' and is_active)
  or not exists(select 1 from public.subjects where id=subject and code='taekwondo' and category_id=category and is_active) then
  raise exception 'demo_subject_classification_mismatch';
 end if;
 if exists(select 1 from public.classes where id=klass or (organization_id=org and title='[데모] 체육·무용 리포트 확인 (2026-10-11)'))
  or exists(select 1 from public.class_schedules where id=slot)
  or exists(select 1 from public.trial_applications where id=application) then
  raise exception 'demo_target_already_exists';
 end if;
 if not exists(select 1 from public.parent_confirmed_push_settings where singleton and mode='off') then
  raise exception 'demo_confirmed_push_must_remain_off';
 end if;
 if public.experience_report_observation_label('sports_dance_joined_warmup') is null then
  raise exception 'demo_subject_migration_required';
 end if;
 -- Stop for re-review if INSERT triggers/functions changed, including new webhooks.
 select md5(string_agg(pg_get_triggerdef(t.oid)||pg_get_functiondef(t.tgfoid),''
  order by t.tgrelid::regclass::text,t.tgname)) into trigger_fingerprint
 from pg_trigger t where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not tgisinternal;
 if trigger_fingerprint is distinct from '58f7610de81ada34daa5f723e6393cf1'
  or exists(select 1 from pg_trigger where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
   and not tgisinternal and tgenabled<>'O') then
  raise exception 'demo_trigger_contract_changed';
 end if;
 if exists(select 1 from pg_class where oid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not relrowsecurity) then raise exception 'demo_rls_contract_changed'; end if;
 if now() <= '2026-10-10 15:00:00+09'::timestamptz then raise exception 'demo_trial_must_be_in_past'; end if;

 insert into public.classes(id,organization_id,title,subject,subject_category_id,subject_id,
  target_age,description,trial_price,is_active,program_type,assignment_mode,teacher_id,archived_at)
 values(klass,org,'[데모] 체육·무용 리포트 확인 (2026-10-11)','taekwondo',category,subject,
  'elem_3','체육·무용 관찰 문항과 리포트 작성 확인을 위한 비공개 데모 수업입니다.',0,false,'trial_class','post_assign',null,null);

 -- The existing booking trigger requires an open slot even for completed history.
 -- Public recruitment remains blocked by classes.is_active=false; this slot is past.
 insert into public.class_schedules(id,class_id,schedule_type,day_of_week,specific_date,start_time,end_time,
  capacity,booking_status,display_label,sort_order,is_manual_override,generated_by_rule_id)
 values(slot,klass,'one_time',null,'2026-10-10','14:00','15:00',1,'open',
  '2026.10.10 14:00~15:00 · 체육·무용 리포트 데모',0,false,null);

 -- No real child/contact is copied. No trial_result, publication, activity log or notification is created.
 insert into public.trial_applications(id,class_id,class_schedule_id,parent_id,child_id,child_name,child_grade,
  parent_name,parent_phone,requested_slot_at,confirmed_slot_at,status,completed_at,last_activity_at,
  assigned_teacher_id,requested_schedule_block_id,confirmed_schedule_block_id,registration_status,
  memo,selected_schedule_label)
 values(application,klass,slot,parent,null,'체육·무용 리포트 데모학생','초3','데모 보호자 1',null,
  '2026-10-10 14:00:00+09','2026-10-10 14:00:00+09','completed','2026-10-10 15:00:00+09','2026-10-10 15:00:00+09',
  null,null,null,'undecided','체육·무용 리포트 작성 검토용 신규 데모 신청 · 실제 체험 이력이 아닙니다.',
  '2026.10.10 14:00~15:00 · 체육·무용 리포트 데모');
end $prepare$;


-- creative_mind (one private class / past slot / completed application)
do $prepare$
declare
 org constant uuid := '29e8c477-dabb-404c-bac4-ba96ffd1e999';
 parent constant uuid := 'b30a0732-5e20-4969-97d1-a8c51210f715';
 klass constant uuid := '05250fa4-77fe-480a-a336-ae7bf368f416';
 slot constant uuid := '248e0413-9f9a-41bb-bf70-8af02b047159';
 application constant uuid := 'e41261ca-90c9-4549-b3a3-74a1c9c33d00';
 category constant uuid := '9f2e4d8a-9d21-4a25-a016-299eb052a442';
 subject constant uuid := '54e9973a-83e9-405f-bef2-2f4a991b7a72';
 trigger_fingerprint text;
begin
 -- Run only with an approved administrative DB connection, never a user JWT.
 if auth.uid() is not null or current_user not in ('postgres','supabase_admin') then
  raise exception 'demo_requires_approved_admin_connection';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('subject-report-demo-20261011:' || org::text,0));
 if not exists(select 1 from public.organizations where id=org and name='첫수업 데모학원') then
  raise exception 'demo_organization_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id='accedc61-4a49-4679-ad5c-392499c21ccd' and p.organization_id=org
  and p.role='academy' and u.email='demo@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_academy_account_mismatch';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=parent and p.role='parent' and p.name='데모 보호자 1'
  and u.email='demo-parent1@firstsuup.com' and u.deleted_at is null) then
  raise exception 'demo_parent_mismatch';
 end if;
 if not exists(select 1 from public.subject_categories where id=category and code='creative_mind' and is_active)
  or not exists(select 1 from public.subjects where id=subject and code='chess' and category_id=category and is_active) then
  raise exception 'demo_subject_classification_mismatch';
 end if;
 if exists(select 1 from public.classes where id=klass or (organization_id=org and title='[데모] 창의·두뇌 리포트 확인 (2026-10-11)'))
  or exists(select 1 from public.class_schedules where id=slot)
  or exists(select 1 from public.trial_applications where id=application) then
  raise exception 'demo_target_already_exists';
 end if;
 if not exists(select 1 from public.parent_confirmed_push_settings where singleton and mode='off') then
  raise exception 'demo_confirmed_push_must_remain_off';
 end if;
 if public.experience_report_observation_label('creative_mind_explored_problem') is null then
  raise exception 'demo_subject_migration_required';
 end if;
 -- Stop for re-review if INSERT triggers/functions changed, including new webhooks.
 select md5(string_agg(pg_get_triggerdef(t.oid)||pg_get_functiondef(t.tgfoid),''
  order by t.tgrelid::regclass::text,t.tgname)) into trigger_fingerprint
 from pg_trigger t where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not tgisinternal;
 if trigger_fingerprint is distinct from '58f7610de81ada34daa5f723e6393cf1'
  or exists(select 1 from pg_trigger where tgrelid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
   and not tgisinternal and tgenabled<>'O') then
  raise exception 'demo_trigger_contract_changed';
 end if;
 if exists(select 1 from pg_class where oid in ('public.classes'::regclass,'public.class_schedules'::regclass,'public.trial_applications'::regclass)
  and not relrowsecurity) then raise exception 'demo_rls_contract_changed'; end if;
 if now() <= '2026-10-10 15:00:00+09'::timestamptz then raise exception 'demo_trial_must_be_in_past'; end if;

 insert into public.classes(id,organization_id,title,subject,subject_category_id,subject_id,
  target_age,description,trial_price,is_active,program_type,assignment_mode,teacher_id,archived_at)
 values(klass,org,'[데모] 창의·두뇌 리포트 확인 (2026-10-11)','chess',category,subject,
  'elem_3','창의·두뇌 관찰 문항과 리포트 작성 확인을 위한 비공개 데모 수업입니다.',0,false,'trial_class','post_assign',null,null);

 -- The existing booking trigger requires an open slot even for completed history.
 -- Public recruitment remains blocked by classes.is_active=false; this slot is past.
 insert into public.class_schedules(id,class_id,schedule_type,day_of_week,specific_date,start_time,end_time,
  capacity,booking_status,display_label,sort_order,is_manual_override,generated_by_rule_id)
 values(slot,klass,'one_time',null,'2026-10-10','14:00','15:00',1,'open',
  '2026.10.10 14:00~15:00 · 창의·두뇌 리포트 데모',0,false,null);

 -- No real child/contact is copied. No trial_result, publication, activity log or notification is created.
 insert into public.trial_applications(id,class_id,class_schedule_id,parent_id,child_id,child_name,child_grade,
  parent_name,parent_phone,requested_slot_at,confirmed_slot_at,status,completed_at,last_activity_at,
  assigned_teacher_id,requested_schedule_block_id,confirmed_schedule_block_id,registration_status,
  memo,selected_schedule_label)
 values(application,klass,slot,parent,null,'창의·두뇌 리포트 데모학생','초3','데모 보호자 1',null,
  '2026-10-10 14:00:00+09','2026-10-10 14:00:00+09','completed','2026-10-10 15:00:00+09','2026-10-10 15:00:00+09',
  null,null,null,'undecided','창의·두뇌 리포트 작성 검토용 신규 데모 신청 · 실제 체험 이력이 아닙니다.',
  '2026.10.10 14:00~15:00 · 창의·두뇌 리포트 데모');
end $prepare$;


commit;
