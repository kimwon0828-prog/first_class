-- REVIEW ONLY: do not run against the real DB until this exact file is approved.
-- One administrative transaction; no JWT/role impersonation, DDL, upsert or cleanup.
-- Existing demo identities only. Creates exactly 1 class + 1 schedule + 1 application.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $prepare$
declare
 org constant uuid := '29e8c477-dabb-404c-bac4-ba96ffd1e999';
 parent constant uuid := 'b30a0732-5e20-4969-97d1-a8c51210f715';
 klass constant uuid := '20a8770d-8001-4b33-978b-01bc46a86d27';
 slot constant uuid := 'c7fa66c6-27bc-4be4-b7ec-7bb93a31f596';
 application constant uuid := 'c62170cd-4bce-480a-b5aa-474c972a664b';
 category constant uuid := '1cbe0216-02d0-4b64-81ff-83e7d70ac1de';
 subject constant uuid := '110b6774-0742-4cb9-9fe7-e333b89db01b';
 trigger_fingerprint text;
begin
 -- Run only with an approved administrative DB connection, never a user JWT.
 if auth.uid() is not null or current_user not in ('postgres','supabase_admin') then
  raise exception 'demo_requires_approved_admin_connection';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('piano-report-demo-20261011:' || org::text,0));
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
 if not exists(select 1 from public.subject_categories where id=category and code='music' and is_active)
  or not exists(select 1 from public.subjects where id=subject and code='piano' and category_id=category and is_active) then
  raise exception 'demo_piano_classification_mismatch';
 end if;
 if exists(select 1 from public.classes where id=klass or (organization_id=org and title='[데모] 피아노 리포트 확인 (2026-10-11)'))
  or exists(select 1 from public.class_schedules where id=slot)
  or exists(select 1 from public.trial_applications where id=application) then
  raise exception 'demo_target_already_exists';
 end if;
 if not exists(select 1 from public.parent_confirmed_push_settings where singleton and mode='off') then
  raise exception 'demo_confirmed_push_must_remain_off';
 end if;
 if public.experience_report_observation_label('music_followed_rhythm_or_sound') is null then
  raise exception 'demo_music_migration_required';
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
 values(klass,org,'[데모] 피아노 리포트 확인 (2026-10-11)','piano',category,subject,
  'elem_3','음악 공통 관찰 문항과 리포트 작성 확인을 위한 피아노 비공개 데모 수업입니다.',0,false,'trial_class','post_assign',null,null);

 -- The existing booking trigger requires an open slot even for completed history.
 -- Public recruitment remains blocked by classes.is_active=false; this slot is past.
 insert into public.class_schedules(id,class_id,schedule_type,day_of_week,specific_date,start_time,end_time,
  capacity,booking_status,display_label,sort_order,is_manual_override,generated_by_rule_id)
 values(slot,klass,'one_time',null,'2026-10-10','14:00','15:00',1,'open',
  '2026.10.10 14:00~15:00 · 피아노 리포트 데모',0,false,null);

 -- No real child/contact is copied. No trial_result, publication, activity log or notification is created.
 insert into public.trial_applications(id,class_id,class_schedule_id,parent_id,child_id,child_name,child_grade,
  parent_name,parent_phone,requested_slot_at,confirmed_slot_at,status,completed_at,last_activity_at,
  assigned_teacher_id,requested_schedule_block_id,confirmed_schedule_block_id,registration_status,
  memo,selected_schedule_label)
 values(application,klass,slot,parent,null,'피아노 리포트 데모학생','초3','데모 보호자 1',null,
  '2026-10-10 14:00:00+09','2026-10-10 14:00:00+09','completed','2026-10-10 15:00:00+09','2026-10-10 15:00:00+09',
  null,null,null,'undecided','피아노 리포트 작성 검토용 신규 데모 신청 · 실제 체험 이력이 아닙니다.',
  '2026.10.10 14:00~15:00 · 피아노 리포트 데모');
end $prepare$;

select '20a8770d-8001-4b33-978b-01bc46a86d27'::uuid class_id,'c7fa66c6-27bc-4be4-b7ec-7bb93a31f596'::uuid schedule_id,
 'c62170cd-4bce-480a-b5aa-474c972a664b'::uuid application_id;
commit;
