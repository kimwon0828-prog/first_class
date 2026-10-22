-- LOCAL REVIEW DRAFT: one atomic transaction. NOT applied to production.
-- Supersedes the standalone retention-plan draft; do not apply both.
-- Backend must be deployed first (supports legacy + v2 schemas).
-- Self-withdrawal scrubs direct identifiers, personal content and referenced files.
-- Withdrawal retains minimal operational facts until the terminal event + 12 months.
-- TTL then removes individual records; only private organization/month counters remain.
-- Includes a bounded 12-month executor. DB scopes start EMPTY; no execution enabled.
-- Worker environment flag and Cron registration also remain OFF/unconfigured.
-- Active holds, legacy pending deletions or unexpected guard definitions abort.
begin;

set local lock_timeout='5s';
set local statement_timeout='60s';

create table app.trial_privacy_policy (
 singleton boolean primary key default true check(singleton),
 version text not null default '2026-10-22-v1' check(version='2026-10-22-v1'),
 retention_months integer not null default 12 check(retention_months=12),
 approved_at timestamptz not null default now()
);
insert into app.trial_privacy_policy(singleton) values(true);
alter table app.trial_privacy_policy enable row level security;
revoke all on app.trial_privacy_policy from public,anon,authenticated,service_role;
grant select on app.trial_privacy_policy to service_role;

-- An exception is scoped, dated and requires a recorded legal reason.
-- There is deliberately no indefinite "academy operation" exception.
create table app.trial_privacy_holds (
 application_id uuid primary key references public.trial_applications(id) on delete cascade,
 basis text not null check(basis in ('statutory_record','active_dispute')),
 basis_reference text not null check(length(btrim(basis_reference)) between 5 and 500),
 retain_until timestamptz not null,
 reviewed_by uuid not null references auth.users(id),
 reviewed_at timestamptz not null default now(),
 check(retain_until>reviewed_at)
);
alter table app.trial_privacy_holds enable row level security;
revoke all on app.trial_privacy_holds from public,anon,authenticated,service_role;
grant select,insert,update,delete on app.trial_privacy_holds to service_role;

-- Pure classification. p_as_of is injected only for deterministic tests.
-- Public callers never receive a time override on the service-only preview RPC.
create function app.classify_trial_privacy_retention(
 p_status text,p_completed_at timestamptz,p_canceled_at timestamptz,
 p_no_show_at timestamptz,p_confirmed_at timestamptz,p_requested_at timestamptz,
 p_as_of timestamptz
) returns jsonb language plpgsql immutable set search_path='' as $$
declare anchor_at timestamptz; due_at timestamptz; terminal_kind text;
begin
 if p_as_of is null then raise exception 'privacy_clock_required'; end if;
 if p_status is null or p_status not in ('new','reviewing','confirmed','completed','canceled') then
  return jsonb_build_object('reason','state_review_required','eligible',false);
 end if;
 -- Open applications are never auto-canceled or destroyed merely due to age.
 if p_status in ('new','reviewing') then
  return jsonb_build_object('reason','open_application_review','eligible',false);
 end if;
 -- A future live reservation must not become a purge target through an old
 -- completion timestamp or an inconsistent attendance marker.
 if p_status<>'canceled' and coalesce(p_confirmed_at,p_requested_at)>p_as_of then
  return jsonb_build_object('reason','future_booking','eligible',false);
 end if;
 if p_status='canceled' then anchor_at:=p_canceled_at; terminal_kind:='canceled';
 elsif p_no_show_at is not null then anchor_at:=p_no_show_at; terminal_kind:='no_show';
 elsif p_status='completed' then anchor_at:=p_completed_at; terminal_kind:='completed';
 else return jsonb_build_object('reason','active_booking','eligible',false);
 end if;
 if anchor_at is null or anchor_at>p_as_of then
  return jsonb_build_object('reason','terminal_time_review','eligible',false);
 end if;
 -- Calendar months in the service timezone, not 365 days or session timezone.
 due_at:=((anchor_at at time zone 'Asia/Seoul')+interval '12 months') at time zone 'Asia/Seoul';
 return jsonb_build_object('reason',case when due_at<=p_as_of then 'expired' else 'within_retention' end,
  'eligible',due_at<=p_as_of,'terminalKind',terminal_kind,'anchorAt',anchor_at,'dueAt',due_at);
end $$;
revoke all on function app.classify_trial_privacy_retention(text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)
 from public,anon,authenticated,service_role;

-- First production use, if later approved, is read-only candidate inspection.
-- Returns IDs/times/counters only; never names, contacts, notes or photo URLs.
create function public.preview_trial_privacy_retention(p_organization_id uuid,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'privacy_service_required' using errcode='42501';
 end if;
 if p_organization_id is null or p_limit is null or p_limit not between 1 and 1000 then
  raise exception 'privacy_invalid_scope';
 end if;
 with classified as (
  select a.id,app.classify_trial_privacy_retention(a.status,a.completed_at,a.canceled_at,a.no_show_at,
    a.confirmed_slot_at,a.requested_slot_at,now()) as rule,
   exists(select 1 from app.trial_privacy_holds h where h.application_id=a.id and h.retain_until>now()) as held,
   (exists(select 1 from app.parent_account_deletions d where d.parent_id=a.parent_id) or exists(select 1 from app.parent_erasure_trials t join app.parent_account_deletions d on d.parent_id=t.parent_id where t.application_id=a.id)) as withdrawal_pending
  from public.trial_applications a join public.classes c on c.id=a.class_id
  where c.organization_id=p_organization_id
 ), decisions as (
  select id,rule,case when held then 'legal_hold' when withdrawal_pending then 'withdrawal_pending'
   else rule->>'reason' end as reason,
   coalesce((rule->>'eligible')::boolean,false) and not held and not withdrawal_pending as eligible
  from classified
 ), counts as (
  select reason,count(*) as n from decisions group by reason
 )
 select jsonb_build_object('policyVersion','2026-10-22-v1','retentionMonths',12,
  'mode','read_only','automaticExecutionAvailable',false,
  'reviewedCount',(select count(*) from decisions),
  'eligibleCount',(select count(*) from decisions where eligible),
  'reasons',coalesce((select jsonb_object_agg(reason,n) from counts),'{}'::jsonb),
  'candidates',coalesce((select jsonb_agg(jsonb_build_object('applicationId',id,
   'anchorAt',rule->'anchorAt','dueAt',rule->'dueAt') order by (rule->>'dueAt')::timestamptz,id)
   from (select * from decisions where eligible order by (rule->>'dueAt')::timestamptz,id limit p_limit) q),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.preview_trial_privacy_retention(uuid,integer) from public,anon,authenticated;
grant execute on function public.preview_trial_privacy_retention(uuid,integer) to service_role;

comment on function public.preview_trial_privacy_retention(uuid,integer) is
 'Read-only privacy-retention planning. Not a purge API and not proof that account-deletion cleanup is complete.';
notify pgrst,'reload schema';

set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
 if exists(select 1 from app.parent_account_deletions) then
  raise exception 'privacy_pending_deletion_review_required';
 end if;
end $$;

alter table public.trial_applications add column privacy_erased_at timestamptz;
alter table public.trial_applications alter column child_name drop not null;
alter table public.trial_applications alter column child_grade drop not null;

-- Self-only retry ledger; cascades only after Auth deletion is permitted.
create table app.parent_erasure_files (
 parent_id uuid not null references auth.users(id) on delete cascade,
 bucket_id text not null, object_name text not null,
 state text not null default 'pending' check(state in ('pending','removed')),
 primary key(parent_id,bucket_id,object_name)
);
-- No user ID/contact/content. Only the prior publication fact for conversion counts.
create table app.erased_trial_metrics (
 application_id uuid primary key references public.trial_applications(id) on delete cascade,
 had_published_report boolean not null,
 erased_at timestamptz not null default now()
);
-- Transaction-scoped, not a client-controlled setting. Never persists on success.
create table app.privacy_erasure_context (
 application_id uuid primary key,
 transaction_id bigint not null,
 actor_parent_id uuid,
 mode text not null default 'withdrawal' check(mode in ('withdrawal','retention','purge'))
);
alter table app.parent_erasure_files enable row level security;
alter table app.erased_trial_metrics enable row level security;
alter table app.privacy_erasure_context enable row level security;
revoke all on app.parent_erasure_files,app.erased_trial_metrics,app.privacy_erasure_context
 from public,anon,authenticated,service_role;

-- Explicit per-organization activation; empty by default. No caller input can enable it.
create table app.trial_privacy_execution_scopes (
 organization_id uuid primary key,enabled boolean not null default false,last_started_at timestamptz
);
create table app.trial_retention_jobs (
 application_id uuid primary key references public.trial_applications(id) deferrable initially deferred,organization_id uuid not null,
 parent_id uuid references auth.users(id),state text not null check(state in ('preparing','db_cleaned','completed','blocked')),
 lease_id uuid,lease_until timestamptz,attempts integer not null default 0,
 retry_after timestamptz,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz,
 check(state<>'completed' or (parent_id is null and lease_id is null and completed_at is not null))
);
create table app.trial_retention_files (
 application_id uuid not null references app.trial_retention_jobs(application_id),bucket_id text not null,object_name text not null,
 state text not null default 'pending' check(state in ('pending','removed')),primary key(application_id,bucket_id,object_name)
);
create index trial_retention_jobs_parent_pending_idx on app.trial_retention_jobs(parent_id) where parent_id is not null;
create index trial_retention_jobs_work_idx on app.trial_retention_jobs(organization_id,state,updated_at) where state='db_cleaned';
alter table app.trial_privacy_execution_scopes enable row level security;
alter table app.trial_retention_jobs enable row level security;
alter table app.trial_retention_files enable row level security;
revoke all on app.trial_privacy_execution_scopes,app.trial_retention_jobs,app.trial_retention_files from public,anon,authenticated,service_role;

-- Short-lived ownership bridge only while self-withdrawal is unfinished.
create table app.parent_erasure_trials (
 parent_id uuid not null references auth.users(id) on delete cascade,
 application_id uuid primary key references public.trial_applications(id) on delete cascade
);
-- No application, user, class, teacher, child or file identifier in aggregate rows.
-- Month is the terminal event's Seoul calendar month, NOT enrollment decision month.
create table app.trial_monthly_retention_totals (
 organization_id uuid not null, terminal_month date not null,
 applications bigint not null default 0 check(applications>=0),
 completed bigint not null default 0 check(completed>=0),
 canceled bigint not null default 0 check(canceled>=0),
 no_show bigint not null default 0 check(no_show>=0),
 enrolled bigint not null default 0 check(enrolled>=0),
 not_enrolled bigint not null default 0 check(not_enrolled>=0),
 unresolved bigint not null default 0 check(unresolved>=0),
 published_reports bigint not null default 0 check(published_reports>=0),
 primary key(organization_id,terminal_month),
 check(extract(day from terminal_month)=1),
 check(applications=completed+canceled+no_show),
 check(applications=enrolled+not_enrolled+unresolved),
 check(published_reports<=applications)
);
alter table app.parent_erasure_trials enable row level security;
alter table app.trial_monthly_retention_totals enable row level security;
revoke all on app.parent_erasure_trials,app.trial_monthly_retention_totals from public,anon,authenticated,service_role;
-- Private aggregate inspection only; no new public/academy read access in this rollout.
grant select on app.trial_monthly_retention_totals to service_role;

create function app.privacy_erasure_active(p_id uuid) returns boolean
language plpgsql volatile security invoker set search_path='' as $$
begin
 if current_user<>'postgres' then return false; end if;
 return exists(select 1 from app.privacy_erasure_context c
  left join app.parent_account_deletions d on d.parent_id=c.actor_parent_id
  where c.application_id=p_id and c.transaction_id=txid_current()
   and ((c.mode='withdrawal' and c.actor_parent_id=auth.uid() and d.state='processing')
    or (c.mode='retention' and auth.role()='service_role' and exists(select 1 from app.trial_retention_jobs j where j.application_id=p_id and j.state='preparing'))
    or (c.mode='purge' and exists(select 1 from app.trial_retention_jobs j where j.application_id=p_id and j.state='db_cleaned')
      and (auth.role()='service_role' or exists(select 1 from app.parent_erasure_trials t join app.parent_account_deletions d on d.parent_id=t.parent_id where t.application_id=p_id and t.parent_id=auth.uid()))))); 
end $$;
revoke all on function app.privacy_erasure_active(uuid) from public,anon,authenticated,service_role;

-- The original final/immutable guards remain intact for every normal caller.
-- Grant a DELETE-only exception inside the narrowly scoped self-erasure transaction.
do $$ declare signature text; body text; definition text; patched text; begin
 foreach signature in array array['public.lock_final_trial_result()','public.report_send_once()'] loop
  select p.prosrc,pg_get_functiondef(p.oid) into body,definition
   from pg_proc p where p.oid=signature::regprocedure and pg_get_userbyid(p.proowner)='postgres';
  if body is null or body !~* '^\s*(declare[\s\S]*?)?begin\y' then raise exception 'privacy_guard_definition_review_required'; end if;
  if (signature='public.lock_final_trial_result()' and md5(body)<>'d6f641e02d5012ff0b9cccf2355aac07') or (signature='public.report_send_once()' and md5(body)<>'3af6a33bc3e8686cadd677451b0d181f') then raise exception 'privacy_guard_definition_changed';end if;
  patched:=regexp_replace(body,'(\mBEGIN\M)',$injection$\1
 if TG_OP='DELETE' and current_user='postgres' then
  if app.privacy_erasure_active(old.application_id) then return old; end if;
 end if;
$injection$,'i');
  if patched=body then raise exception 'privacy_guard_patch_failed'; end if;
  execute replace(definition,body,patched);
 end loop;
end $$;

-- Review-account isolation also permits only this same-transaction detach.
do $$ declare body text;definition text;patched text;begin
 select p.prosrc,pg_get_functiondef(p.oid) into body,definition from pg_proc p
 where p.oid='app.guard_app_store_review_application()'::regprocedure and pg_get_userbyid(p.proowner)='postgres';
 if body is null or md5(body)<>'b29f2324f96787ffe6489d41dedcf2fd' then raise exception 'privacy_review_guard_changed';end if;
 patched:=regexp_replace(body,'(\mBEGIN\M)',$injection$\1
 if TG_OP='UPDATE' and new.parent_id is null and new.child_id is null and new.class_id=old.class_id then
  if app.privacy_erasure_active(old.id) then return new;end if;
 end if;
$injection$,'i');
 if patched=body then raise exception 'privacy_review_guard_patch_failed';end if;
 execute replace(definition,body,patched);
end $$;

-- A final purge must remove both the confirmed time and its individual block.
-- Only the private, transaction-scoped purge may skip rebooking validation;
-- normal booking/withdrawal/retention preparation still runs the original guard.
do $$ declare body text;definition text;patched text;begin
 select p.prosrc,pg_get_functiondef(p.oid) into body,definition from pg_proc p
 where p.oid='app.enforce_date_booking_application()'::regprocedure and pg_get_userbyid(p.proowner)='postgres';
 if body is null or md5(body)<>'48a32a27b1546d7429e2c37ad9bdb2f8' then raise exception 'privacy_booking_guard_changed';end if;
 patched:=regexp_replace(body,'(\mBEGIN\M)',$injection$\1
 if TG_OP='UPDATE' and app.privacy_erasure_active(new.id) and exists(
  select 1 from app.privacy_erasure_context erasure_ctx where erasure_ctx.application_id=new.id and erasure_ctx.transaction_id=txid_current() and erasure_ctx.mode='purge')
 then return new;end if;
$injection$,'i');
 if patched=body then raise exception 'privacy_booking_guard_patch_failed';end if;
 execute replace(definition,body,patched);
end $$;

-- Reject re-identification or content recreation after erasure. No extra read grants.
create function app.guard_erased_trial_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; prior uuid;
begin
 if TG_TABLE_NAME='trial_applications' then
  if TG_OP='DELETE' then target:=old.id; else target:=new.id; end if;
  if TG_OP='UPDATE' then prior:=old.id; end if;
 elsif TG_TABLE_NAME='sms_logs' then
  if TG_OP='DELETE' then target:=old.trial_application_id;else target:=new.trial_application_id;end if;
  if TG_OP='UPDATE' then prior:=old.trial_application_id;end if;
 else
  if TG_OP='DELETE' then target:=old.application_id; else target:=new.application_id; end if;
  if TG_OP='UPDATE' then prior:=old.application_id; end if;
 end if;
 if app.privacy_erasure_active(target) then
  if TG_OP='DELETE' then return old; end if;return new;
 end if;
 if exists(select 1 from app.trial_retention_jobs where application_id in (target,prior) and state in ('preparing','db_cleaned')) then raise exception 'privacy_retention_in_progress';end if;
 if TG_TABLE_NAME='trial_applications' and TG_OP='UPDATE' and to_jsonb(old)->>'privacy_erased_at' is not null then
  if (to_jsonb(new)-array['status','updated_at','contacted_at','scheduled_at','completed_at','enrolled_at','lost_at','canceled_at','no_show_at','registration_status','confirmed_slot_at','confirmed_schedule_block_id','class_schedule_id'])
    is not distinct from (to_jsonb(old)-array['status','updated_at','contacted_at','scheduled_at','completed_at','enrolled_at','lost_at','canceled_at','no_show_at','registration_status','confirmed_slot_at','confirmed_schedule_block_id','class_schedule_id']) then return new;end if;
 end if;
 if TG_TABLE_NAME='sms_logs' and TG_OP<>'DELETE' and not exists(select 1 from jsonb_each(to_jsonb(new)) item where item.key in ('recipient_name','recipient_phone_masked','message_preview','provider_message_id','error_message') and item.value<>'null'::jsonb) then return new;end if;
 if TG_TABLE_NAME='registration_results' then
  if TG_OP='DELETE' then return old;end if;return new;
 end if;
 if TG_TABLE_NAME='application_logs' and TG_OP<>'DELETE' and to_jsonb(new)->>'note' is null then return new;end if;
 if exists(select 1 from public.trial_applications a where a.id in (target,prior) and a.privacy_erased_at is not null)
  or (TG_TABLE_NAME='trial_applications' and TG_OP<>'DELETE' and to_jsonb(new)->>'privacy_erased_at' is not null) then
  raise exception 'privacy_content_erased' using errcode='42501';
 end if;
 if TG_OP='DELETE' then return old; end if;return new;
end $$;
revoke all on function app.guard_erased_trial_write() from public,anon,authenticated,service_role;
create trigger privacy_erased_trial_write before insert or update or delete on public.trial_applications
 for each row execute function app.guard_erased_trial_write();
do $$ declare t text; begin
 foreach t in array array['trial_results','experience_reports','studio_academy_memos','consultation_logs','report_attachment_files','application_logs','registration_results','sms_logs'] loop
  execute format('create trigger privacy_erased_trial_write before insert or update or delete on public.%I for each row execute function app.guard_erased_trial_write()',t);
 end loop;
end $$;

-- An allowlist of operational facts, never a heuristic name/health text detector.
-- New nullable content fields are cleared too. Unknown NOT NULL content fails
-- closed so schema drift cannot silently weaken erasure.
create function app.clear_trial_private_fields(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare col record; assignments text:='';
 keep text[]:=array['id','class_id','assigned_teacher_id','requested_slot_at','confirmed_slot_at',
 'requested_schedule_block_id','confirmed_schedule_block_id','class_schedule_id','status',
 'created_at','updated_at','contacted_at','scheduled_at','completed_at','enrolled_at','lost_at',
 'canceled_at','no_show_at','registration_status','privacy_erased_at'];
begin
 if not app.privacy_erasure_active(p_id) then raise exception 'privacy_context_required'; end if;
 for col in select a.attname,a.attnotnull from pg_attribute a
  where a.attrelid='public.trial_applications'::regclass and a.attnum>0 and not a.attisdropped
  and not (a.attname=any(keep)) order by a.attnum loop
  if assignments<>'' then assignments:=assignments||','; end if;
  if col.attname='registration_reason_ids' then assignments:=assignments||format('%I=%L::text[]',col.attname,'{}');
  elsif col.attnotnull then raise exception 'privacy_schema_review_required: %',col.attname;
  else assignments:=assignments||format('%I=NULL',col.attname); end if;
 end loop;
 if assignments='' then raise exception 'privacy_private_fields_missing'; end if;
 execute 'update public.trial_applications set '||assignments||',privacy_erased_at=now() where id=$1' using p_id;
end $$;
revoke all on function app.clear_trial_private_fields(uuid) from public,anon,authenticated,service_role;

create function app.erase_trial_private_payload(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.trial_applications;p_parent uuid;mode text;
begin
 select * into a from public.trial_applications where id=p_id for update;
 if not app.privacy_erasure_active(p_id) then raise exception 'privacy_context_required';end if;
 if a.privacy_erased_at is not null then return;end if;
 select c.actor_parent_id,c.mode into p_parent,mode from app.privacy_erasure_context c where c.application_id=p_id;
 -- Production upload route has maxDuration=60. A ten-minute uploading window
 -- is protected from erasure; failures remain retryable, never completed early.
 if exists(select 1 from public.report_attachment_files f where f.application_id=p_id
  and f.state='uploading' and f.created_at>now()-interval '10 minutes') then
  raise exception 'privacy_upload_in_progress';
 end if;
 if exists(select 1 from app.trial_privacy_holds h where h.application_id=p_id and h.retain_until>now()) then
  raise exception 'privacy_hold_review_required';
 end if;
 if exists(select 1 from public.report_attachment_files f join public.experience_reports r
  on r.application_id<>p_id and r.content->'attachments' @> jsonb_build_array(jsonb_build_object('id',f.id::text))
  where f.application_id=p_id)
 or exists(select 1 from public.report_attachment_files f join public.trial_results r on r.application_id<>p_id
 and r.attachments @> jsonb_build_array(jsonb_build_object('id',f.id::text)) where f.application_id=p_id)
 then raise exception 'privacy_shared_file_review_required'; end if;
 insert into app.erased_trial_metrics(application_id,had_published_report)
 select p_id,exists(select 1 from public.experience_reports r where r.application_id=p_id and r.status='published')
 on conflict(application_id) do nothing;
 if mode='withdrawal' then
  insert into app.parent_erasure_trials(parent_id,application_id) values(p_parent,p_id) on conflict do nothing;
  insert into app.parent_erasure_files(parent_id,bucket_id,object_name)
  select p_parent,'report-attachments',f.object_path from public.report_attachment_files f where f.application_id=p_id on conflict do nothing;
 else
  insert into app.trial_retention_files(application_id,bucket_id,object_name)
  select p_id,'report-attachments',f.object_path from public.report_attachment_files f where f.application_id=p_id on conflict do nothing;
 end if;
 if exists(select 1 from pg_attribute where attrelid='public.parent_notification_reads'::regclass and attname='notification_key' and not attisdropped) then
  execute 'delete from public.parent_notification_reads n where n.notification_key in (select ''status:''||id::text from public.application_logs where application_id=$1 union select ''report_published:''||id::text from public.experience_reports where application_id=$1 union select notification_key from public.parent_event_push_deliveries where application_id=$1)' using p_id;
 end if;
 if to_regclass('public.parent_confirmed_push_deliveries') is not null then
  execute 'delete from public.parent_confirmed_push_deliveries where application_id=$1' using p_id;
 end if;
 delete from public.parent_report_engagement where application_id=p_id;
 delete from public.experience_feedback where application_id=p_id;
 delete from public.parent_decisions where application_id=p_id;
 delete from public.experience_reports where application_id=p_id;
 delete from public.trial_results where application_id=p_id;
 delete from public.studio_academy_memos where application_id=p_id;
 delete from public.consultation_logs where application_id=p_id;
 delete from public.report_attachment_files where application_id=p_id;
 delete from public.studio_import_rows where application_id=p_id;
 update public.application_logs set note=null,actor_id=case when actor_id=p_parent or exists(select 1 from public.profiles p where p.id=actor_id and p.role='parent') then null else actor_id end where application_id=p_id;
 update public.sms_logs set recipient_name=null,recipient_phone_masked=null,message_preview=null,
  provider_message_id=null,error_message=null where trial_application_id=p_id;
 if exists(select 1 from pg_attribute where attrelid='public.sms_logs'::regclass and attname='created_by' and not attisdropped) then
  execute 'update public.sms_logs s set created_by=null where s.trial_application_id=$1 and exists(select 1 from public.profiles p where p.id=s.created_by and p.role=''parent'')' using p_id;
 end if;
 delete from public.parent_event_push_deliveries where application_id=p_id;
 perform app.clear_trial_private_fields(p_id);
end $$;
revoke all on function app.erase_trial_private_payload(uuid) from public,anon,authenticated,service_role;

create function app.erase_parent_trial_content(p_id uuid,p_parent uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.trial_applications;
begin
 select * into a from public.trial_applications where id=p_id for update;
 if a.id is null or p_parent is distinct from auth.uid()
  or not exists(select 1 from app.parent_account_deletions d where d.parent_id=p_parent and d.state='processing')
  or (a.parent_id is distinct from p_parent and not (a.parent_id is null and exists(
   select 1 from public.children c where c.id=a.child_id and c.parent_id=p_parent))) then
  raise exception 'privacy_scope_forbidden' using errcode='42501';
 end if;
 if a.privacy_erased_at is not null then return; end if;
 insert into app.privacy_erasure_context(application_id,transaction_id,actor_parent_id,mode) values(p_id,txid_current(),p_parent,'withdrawal');
 perform app.erase_trial_private_payload(p_id);
 delete from app.privacy_erasure_context where application_id=p_id;
end $$;
revoke all on function app.erase_parent_trial_content(uuid,uuid) from public,anon,authenticated,service_role;

-- Fail closed for new references, including CASCADE/SET NULL edges, before erasure.
create function app.assert_trial_purge_schema() returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  where c.contype='f' and c.confrelid='public.trial_applications'::regclass
   and not ((n.nspname||'.'||t.relname)=any(array[
    'public.trial_results','public.experience_reports','public.experience_feedback','public.parent_decisions',
    'public.parent_report_engagement','public.studio_academy_memos','public.consultation_logs','public.application_logs',
    'public.registration_results','public.report_attachment_files','public.sms_logs','public.studio_import_rows',
    'public.parent_event_push_deliveries','public.parent_confirmed_push_deliveries','public.schedule_blocks',
    'app.trial_privacy_holds','app.erased_trial_metrics','app.trial_retention_jobs','app.parent_erasure_trials'])
    and cardinality(c.conkey)=1 and (select a.attname from pg_attribute a where a.attrelid=c.conrelid and a.attnum=c.conkey[1])=
     case when t.relname='sms_logs' then 'trial_application_id' when t.relname='schedule_blocks' then 'related_application_id' else 'application_id' end))
 then raise exception 'privacy_reference_schema_review_required';end if;
 -- Child-row deletion must not silently cascade into an unreviewed table either.
 if exists(select 1 from pg_constraint c join pg_class target on target.oid=c.confrelid join pg_namespace tn on tn.oid=target.relnamespace
  join pg_class source on source.oid=c.conrelid join pg_namespace sn on sn.oid=source.relnamespace
  where c.contype='f' and tn.nspname='public'
   and target.relname=any(array['trial_results','experience_reports','experience_feedback','parent_decisions','parent_report_engagement',
    'studio_academy_memos','consultation_logs','application_logs','registration_results','report_attachment_files','sms_logs',
    'studio_import_rows','parent_event_push_deliveries','parent_confirmed_push_deliveries','schedule_blocks'])
   and not(sn.nspname='public' and cardinality(c.conkey)=1 and (
    (target.relname='application_logs' and source.relname='parent_confirmed_push_deliveries' and (select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[1])='id')
    or (target.relname='experience_reports' and source.relname='parent_report_engagement' and (select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[1])='first_report_id')
    or (target.relname='schedule_blocks' and source.relname='trial_applications' and (select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[1]) in ('requested_schedule_block_id','confirmed_schedule_block_id')))))
 then raise exception 'privacy_reference_schema_review_required';end if;
end $$;
revoke all on function app.assert_trial_purge_schema() from public,anon,authenticated,service_role;

-- Retention holds must be established before destructive processing begins.
create function app.guard_trial_hold_start() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.trial_applications where id=new.application_id for update;
 if exists(select 1 from app.trial_retention_jobs where application_id=new.application_id and state in ('preparing','db_cleaned'))
 then raise exception 'privacy_erasure_already_started';end if;
 return new;
end $$;
revoke all on function app.guard_trial_hold_start() from public,anon,authenticated,service_role;
create trigger trial_hold_start before insert or update on app.trial_privacy_holds for each row execute function app.guard_trial_hold_start();

-- Finalize aggregate and remove ALL per-application rows atomically, only after files.
-- A repeated request cannot increment a deleted application's counters a second time.
create function app.finish_trial_retention_job(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j app.trial_retention_jobs;a public.trial_applications;rule jsonb;month date;outcome text;published boolean;
begin
 select * into j from app.trial_retention_jobs where application_id=p_id for update;
 if j.application_id is null then raise exception 'privacy_job_missing';end if;
 if j.state<>'db_cleaned' or exists(select 1 from app.trial_retention_files where application_id=p_id and state='pending') then return false;end if;
 select * into a from public.trial_applications where id=p_id for update;
 if a.id is null or a.privacy_erased_at is null or not exists(select 1 from public.classes where id=a.class_id and organization_id=j.organization_id)
 then raise exception 'privacy_scope_forbidden';end if;
 if exists(select 1 from app.trial_privacy_holds where application_id=p_id and retain_until>now()) then raise exception 'privacy_hold_review_required';end if;
 rule:=app.classify_trial_privacy_retention(a.status,a.completed_at,a.canceled_at,a.no_show_at,a.confirmed_slot_at,a.requested_slot_at,now());
 if coalesce((rule->>'eligible')::boolean,false)=false then raise exception 'privacy_not_expired';end if;
 perform app.assert_trial_purge_schema();
 month:=date_trunc('month',(rule->>'anchorAt')::timestamptz at time zone 'Asia/Seoul')::date;
 select r.result into outcome from public.registration_results r where r.application_id=p_id and r.superseded_at is null;
 if outcome is null then outcome:='unresolved';end if;
 if outcome not in ('enrolled','not_enrolled','unresolved') then raise exception 'privacy_outcome_review_required';end if;
 select coalesce(m.had_published_report,false) into published from app.erased_trial_metrics m where application_id=p_id;
 insert into app.privacy_erasure_context(application_id,transaction_id,actor_parent_id,mode) values(p_id,txid_current(),auth.uid(),'purge');
 if not app.privacy_erasure_active(p_id) then raise exception 'privacy_scope_forbidden';end if;
 insert into app.trial_monthly_retention_totals as total(organization_id,terminal_month,applications,completed,canceled,no_show,enrolled,not_enrolled,unresolved,published_reports)
 values(j.organization_id,month,1,(rule->>'terminalKind'='completed')::int,(rule->>'terminalKind'='canceled')::int,(rule->>'terminalKind'='no_show')::int,
 (outcome='enrolled')::int,(outcome='not_enrolled')::int,(outcome='unresolved')::int,coalesce(published,false)::int)
 on conflict(organization_id,terminal_month) do update set applications=total.applications+1,
 completed=total.completed+excluded.completed,canceled=total.canceled+excluded.canceled,no_show=total.no_show+excluded.no_show,
 enrolled=total.enrolled+excluded.enrolled,not_enrolled=total.not_enrolled+excluded.not_enrolled,unresolved=total.unresolved+excluded.unresolved,
 published_reports=total.published_reports+excluded.published_reports;
 delete from public.registration_results where application_id=p_id;
 delete from public.application_logs where application_id=p_id;
 delete from public.sms_logs where trial_application_id=p_id;
 -- Booking blocks are individual reservation records, not reusable class schedules.
 if to_regclass('public.schedule_blocks') is not null then
  if exists(select 1 from public.trial_applications other join public.schedule_blocks b on b.id in(other.requested_schedule_block_id,other.confirmed_schedule_block_id)
    where b.related_application_id=p_id and other.id<>p_id) then raise exception 'privacy_shared_booking_review_required';end if;
  update public.trial_applications set requested_schedule_block_id=null,confirmed_schedule_block_id=null,confirmed_slot_at=null where id=p_id;
  delete from public.schedule_blocks where related_application_id=p_id;
 end if;
 delete from app.trial_privacy_holds where application_id=p_id;
 delete from app.erased_trial_metrics where application_id=p_id;
 -- Keep job/context until the guarded base-row DELETE is complete.
 delete from public.trial_applications where id=p_id;
 delete from app.privacy_erasure_context where application_id=p_id;
 delete from app.trial_retention_files where application_id=p_id;
 delete from app.trial_retention_jobs where application_id=p_id;
 return true;
end $$;
revoke all on function app.finish_trial_retention_job(uuid) from public,anon,authenticated,service_role;

-- A parent withdrawal takes over any unfinished TTL files without losing them.
create function app.merge_parent_retention_cleanup(p_uid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if p_uid is distinct from auth.uid() or auth.role() is distinct from 'authenticated'
 or not exists(select 1 from app.parent_account_deletions where parent_id=p_uid) then raise exception 'privacy_scope_forbidden';end if;
 insert into app.parent_erasure_trials(parent_id,application_id) select p_uid,application_id from app.trial_retention_jobs where parent_id=p_uid and state='db_cleaned' on conflict do nothing;
 perform 1 from app.trial_retention_jobs where parent_id=p_uid and state='db_cleaned' order by application_id for update;
 insert into app.parent_erasure_files(parent_id,bucket_id,object_name)
 select p_uid,f.bucket_id,f.object_name from app.trial_retention_jobs j join app.trial_retention_files f using(application_id)
 where j.parent_id=p_uid and j.state='db_cleaned' and f.state='pending'
 on conflict(parent_id,bucket_id,object_name) do update set state='pending';
 for r in select application_id from app.trial_retention_jobs where parent_id=p_uid and state='db_cleaned' order by application_id for update loop
  perform app.finish_trial_retention_job(r.application_id);
 end loop;
end $$;
revoke all on function app.merge_parent_retention_cleanup(uuid) from public,anon,authenticated,service_role;

create function app.prepare_retained_trial(p_id uuid,p_org uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.trial_applications;owner_id uuid;current_owner uuid;rule jsonb;
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from app.trial_privacy_execution_scopes where organization_id=p_org and enabled) then raise exception 'privacy_execution_disabled';end if;
 select * into a from public.trial_applications where id=p_id;
 owner_id:=coalesce(a.parent_id,(select parent_id from public.children where id=a.child_id));
 -- Same profile -> application lock order as the self-withdrawal RPC.
 if owner_id is not null then perform 1 from public.profiles where id=owner_id for update;end if;
 select * into a from public.trial_applications where id=p_id for update;
 current_owner:=coalesce(a.parent_id,(select parent_id from public.children where id=a.child_id));
 if owner_id is distinct from current_owner then raise exception 'privacy_owner_changed';end if;
 if a.id is null or not exists(select 1 from public.classes where id=a.class_id and organization_id=p_org) then raise exception 'privacy_scope_forbidden';end if;
 perform app.assert_trial_purge_schema();
 if exists(select 1 from app.parent_erasure_trials t join app.parent_account_deletions d on d.parent_id=t.parent_id where t.application_id=p_id) then raise exception 'privacy_withdrawal_pending';end if;
 if exists(select 1 from app.parent_account_deletions where parent_id=owner_id) then raise exception 'privacy_withdrawal_pending';end if;
 if a.parent_id is not null and a.child_id is not null and exists(select 1 from public.children where id=a.child_id and parent_id<>a.parent_id) then raise exception 'privacy_child_scope_review_required';end if;
 rule:=app.classify_trial_privacy_retention(a.status,a.completed_at,a.canceled_at,a.no_show_at,a.confirmed_slot_at,a.requested_slot_at,now());
 if coalesce((rule->>'eligible')::boolean,false)=false then raise exception 'privacy_not_expired';end if;
 insert into app.trial_retention_jobs(application_id,organization_id,parent_id,state) values(p_id,p_org,owner_id,'preparing')
 on conflict(application_id) do update set parent_id=excluded.parent_id,state='preparing',updated_at=now(),last_error=null;
 insert into app.privacy_erasure_context(application_id,transaction_id,actor_parent_id,mode) values(p_id,txid_current(),owner_id,'retention');
 perform app.erase_trial_private_payload(p_id);
 delete from app.privacy_erasure_context where application_id=p_id;
 update app.trial_retention_jobs set state='db_cleaned',updated_at=now() where application_id=p_id;
 perform app.finish_trial_retention_job(p_id);
 return true;
end $$;
revoke all on function app.prepare_retained_trial(uuid,uuid) from public,anon,authenticated,service_role;

create function public.list_trial_privacy_execution_scopes() returns table(organization_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'privacy_service_required' using errcode='42501';end if;
 return query select s.organization_id from app.trial_privacy_execution_scopes s where s.enabled
 order by s.last_started_at nulls first,s.organization_id limit 10;
end $$;
revoke all on function public.list_trial_privacy_execution_scopes() from public,anon,authenticated;
grant execute on function public.list_trial_privacy_execution_scopes() to service_role;

create function public.prepare_trial_privacy_retention_batch(p_org uuid,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r record;n int:=0;blocked int:=0;reason text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'privacy_service_required' using errcode='42501';end if;
 if p_org is null or p_limit is null or p_limit not between 1 and 25 then raise exception 'privacy_invalid_scope';end if;
 if not exists(select 1 from app.trial_privacy_execution_scopes where organization_id=p_org and enabled) then raise exception 'privacy_execution_disabled';end if;
 -- Serializes TTL batches across tenants; does not pretend to serialize all web traffic.
 if not pg_try_advisory_xact_lock(hashtextextended('trial-privacy-retention-batch',0)) then return jsonb_build_object('prepared',0,'blocked',0,'needsReview',0,'busy',true);end if;
 update app.trial_privacy_execution_scopes set last_started_at=now() where organization_id=p_org;
 for r in select a.id from public.trial_applications a join public.classes c on c.id=a.class_id
 left join app.trial_retention_jobs j on j.application_id=a.id
 where c.organization_id=p_org
 and not exists(select 1 from app.parent_erasure_trials t join app.parent_account_deletions d on d.parent_id=t.parent_id where t.application_id=a.id)
 and coalesce((app.classify_trial_privacy_retention(a.status,a.completed_at,a.canceled_at,a.no_show_at,a.confirmed_slot_at,a.requested_slot_at,now())->>'eligible')::boolean,false)
 and not exists(select 1 from app.trial_privacy_holds h where h.application_id=a.id and h.retain_until>now())
 and not exists(select 1 from app.parent_account_deletions d where d.parent_id=coalesce(a.parent_id,(select parent_id from public.children where id=a.child_id)))
 and (j.application_id is null or (j.state='blocked' and j.retry_after<=now()))
 order by a.id limit p_limit loop
  begin
   if app.prepare_retained_trial(r.id,p_org) then n:=n+1;end if;
  exception when others then
   -- Never record raw SQL exception/detail or customer content in the job log.
   reason:=case when sqlerrm='privacy_upload_in_progress' then 'upload_in_progress'
    when sqlerrm in ('privacy_owner_changed','privacy_withdrawal_pending','privacy_not_expired') then 'candidate_changed'
    else 'review_required' end;
   insert into app.trial_retention_jobs(application_id,organization_id,state,last_error,retry_after)
   values(r.id,p_org,'blocked',reason,case when reason='review_required' then null else now()+interval '10 minutes' end)
   on conflict(application_id) do update set state='blocked',parent_id=null,last_error=excluded.last_error,retry_after=excluded.retry_after,updated_at=now();
   blocked:=blocked+1;
  end;
 end loop;
 return jsonb_build_object('prepared',n,'blocked',blocked,'needsReview',
  (select count(*) from app.trial_retention_jobs where organization_id=p_org and state='blocked' and last_error='review_required')+
  (select count(*) from public.trial_applications a join public.classes c on c.id=a.class_id
   where c.organization_id=p_org
   and not exists(select 1 from app.trial_privacy_holds h where h.application_id=a.id and h.retain_until>now())
   and (app.classify_trial_privacy_retention(a.status,a.completed_at,a.canceled_at,a.no_show_at,a.confirmed_slot_at,a.requested_slot_at,now())->>'reason'
    in ('terminal_time_review','state_review_required') or (a.status in ('new','reviewing') and a.created_at<=now()-interval '12 months'))),
  'busy',false);
end $$;
revoke all on function public.prepare_trial_privacy_retention_batch(uuid,integer) from public,anon,authenticated;
grant execute on function public.prepare_trial_privacy_retention_batch(uuid,integer) to service_role;

create function public.claim_trial_privacy_retention_files(p_org uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j app.trial_retention_jobs;token uuid:=gen_random_uuid();files jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'privacy_service_required' using errcode='42501';end if;
 if not exists(select 1 from app.trial_privacy_execution_scopes where organization_id=p_org and enabled) then raise exception 'privacy_execution_disabled';end if;
 select * into j from app.trial_retention_jobs where organization_id=p_org and state='db_cleaned'
 and (lease_until is null or lease_until<=now()) and (retry_after is null or retry_after<=now())
 order by updated_at,application_id limit 1 for update skip locked;
 if not found then return null;end if;
 update app.trial_retention_jobs set lease_id=token,lease_until=now()+interval '10 minutes',attempts=attempts+1,updated_at=now() where application_id=j.application_id;
 select coalesce(jsonb_agg(jsonb_build_object('bucket_id',f.bucket_id,'object_name',f.object_name)),'[]'::jsonb) into files
 from (select bucket_id,object_name from app.trial_retention_files where application_id=j.application_id and state='pending' order by bucket_id,object_name limit 100)f;
 if jsonb_array_length(files)=0 then perform app.finish_trial_retention_job(j.application_id);return null;end if;
 return jsonb_build_object('applicationId',j.application_id,'leaseId',token,'files',files);
end $$;
revoke all on function public.claim_trial_privacy_retention_files(uuid) from public,anon,authenticated;
grant execute on function public.claim_trial_privacy_retention_files(uuid) to service_role;

create function public.ack_trial_privacy_retention_files(p_org uuid,p_id uuid,p_lease uuid,p_objects jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare j app.trial_retention_jobs;item jsonb;done boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'privacy_service_required' using errcode='42501';end if;
 if not exists(select 1 from app.trial_privacy_execution_scopes where organization_id=p_org and enabled) then raise exception 'privacy_execution_disabled';end if;
 select * into j from app.trial_retention_jobs where application_id=p_id and organization_id=p_org for update;
 if j.state is distinct from 'db_cleaned' or j.lease_id is distinct from p_lease or p_lease is null or j.lease_until is null or j.lease_until<=now() then raise exception 'privacy_lease_invalid';end if;
 if p_objects is null or jsonb_typeof(p_objects)<>'array' or jsonb_array_length(p_objects) not between 1 and 100 then raise exception 'privacy_invalid_ack';end if;
 for item in select * from jsonb_array_elements(p_objects) loop
  if not exists(select 1 from app.trial_retention_files f where f.application_id=p_id and f.bucket_id=item->>'bucket_id' and f.object_name=item->>'object_name' and f.state='pending') then raise exception 'privacy_file_scope_forbidden';end if;
  if exists(select 1 from storage.objects o where o.bucket_id=item->>'bucket_id' and o.name=item->>'object_name') then raise exception 'privacy_storage_not_removed';end if;
  update app.trial_retention_files set state='removed' where application_id=p_id and bucket_id=item->>'bucket_id' and object_name=item->>'object_name';
  update app.parent_erasure_files set state='removed' where parent_id=j.parent_id and bucket_id=item->>'bucket_id' and object_name=item->>'object_name';
 end loop;
 done:=app.finish_trial_retention_job(p_id);
 if not done then update app.trial_retention_jobs set lease_id=null,lease_until=null,last_error=null,retry_after=null where application_id=p_id;end if;
 return done;
end $$;
revoke all on function public.ack_trial_privacy_retention_files(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ack_trial_privacy_retention_files(uuid,uuid,uuid,jsonb) to service_role;

create function public.release_trial_privacy_retention_lease(p_org uuid,p_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'privacy_service_required' using errcode='42501';end if;
 if not exists(select 1 from app.trial_privacy_execution_scopes where organization_id=p_org and enabled) then raise exception 'privacy_execution_disabled';end if;
 update app.trial_retention_jobs set lease_id=null,lease_until=null,retry_after=now()+interval '10 minutes',last_error='storage_retry',updated_at=now()
 where application_id=p_id and organization_id=p_org and state='db_cleaned' and lease_id=p_lease;
 return found;
end $$;
revoke all on function public.release_trial_privacy_retention_lease(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_trial_privacy_retention_lease(uuid,uuid,uuid) to service_role;

-- Public signatures and self-only authorization stay unchanged.
create or replace function public.prepare_my_parent_account_deletion()
returns text language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_role text; item record;
begin
 if v_uid is null or auth.role() is distinct from 'authenticated' then raise exception 'parent_auth_required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text,610011500));
 if exists(select 1 from app.parent_account_deletions where parent_id=v_uid and state='db_cleaned') then
  perform app.merge_parent_retention_cleanup(v_uid);
  insert into app.parent_erasure_files(parent_id,bucket_id,object_name)
   select v_uid,o.bucket_id,o.name from storage.objects o where coalesce(o.owner_id,o.owner::text)=v_uid::text
   on conflict(parent_id,bucket_id,object_name) do update set state='pending';
  return 'db_cleaned';end if;
 select role into v_role from public.profiles where id=v_uid for update;
 if v_role is distinct from 'parent' then raise exception 'parent_auth_required' using errcode='42501'; end if;
 if exists(select 1 from public.teachers where profile_id=v_uid)
  or exists(select 1 from public.academy_update_requests where requester_profile_id=v_uid)
  or exists(select 1 from public.registration_results where recorded_by=v_uid)
  or exists(select 1 from public.trial_results where created_by=v_uid or updated_by=v_uid)
  or exists(select 1 from public.experience_reports where published_by=v_uid or withdrawn_by=v_uid or superseded_by=v_uid)
 then raise exception 'parent_account_role_conflict' using errcode='42501';end if;
 if exists(select 1 from public.trial_applications a join public.children c on c.id=a.child_id
  where c.parent_id=v_uid and a.parent_id is not null and a.parent_id<>v_uid) then
  raise exception 'privacy_child_scope_review_required';end if;
 insert into app.parent_account_deletions(parent_id,state) values(v_uid,'processing');
 perform app.merge_parent_retention_cleanup(v_uid);
 insert into app.parent_erasure_files(parent_id,bucket_id,object_name)
 select v_uid,o.bucket_id,o.name from storage.objects o where coalesce(o.owner_id,o.owner::text)=v_uid::text on conflict do nothing;
 for item in select a.id from public.trial_applications a where a.parent_id=v_uid
  or (a.parent_id is null and a.child_id in(select c.id from public.children c where c.parent_id=v_uid))
  order by a.id for update loop
  perform app.erase_parent_trial_content(item.id,v_uid);
 end loop;
 delete from public.experience_feedback where parent_id=v_uid;
 delete from public.parent_decisions where parent_id=v_uid;
 delete from public.parent_report_engagement where parent_id=v_uid;
 delete from public.parent_notification_reads where parent_id=v_uid;
 update public.application_logs set actor_id=null where actor_id=v_uid;
 delete from public.children where parent_id=v_uid;
 delete from public.profiles where id=v_uid;
 update app.parent_account_deletions set state='db_cleaned' where parent_id=v_uid;
 return 'db_cleaned';
end $$;

create function public.get_my_parent_erasure_contract() returns integer
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.role() is distinct from 'authenticated' then raise exception 'parent_auth_required' using errcode='42501';end if;
 return 2;
end $$;
revoke all on function public.get_my_parent_erasure_contract() from public,anon,service_role;
grant execute on function public.get_my_parent_erasure_contract() to authenticated;

create or replace function public.get_my_parent_deletion_storage_objects()
returns table(bucket_id text,object_name text) language sql stable security definer set search_path='' as $$
 select f.bucket_id,f.object_name from app.parent_erasure_files f
 where f.parent_id=auth.uid() and f.state='pending'
 and exists(select 1 from app.parent_account_deletions where parent_id=auth.uid() and state='db_cleaned');
$$;

create function public.ack_my_parent_erasure_files(p_objects jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare item jsonb;r record;
begin
 if auth.uid() is null or auth.role() is distinct from 'authenticated'
  or not exists(select 1 from app.parent_account_deletions where parent_id=auth.uid() and state='db_cleaned')
 then raise exception 'parent_auth_required' using errcode='42501';end if;
 perform 1 from app.trial_retention_jobs where parent_id=auth.uid() and state='db_cleaned' order by application_id for update;
 if p_objects is null or jsonb_typeof(p_objects)<>'array' or jsonb_array_length(p_objects) not between 1 and 100 then raise exception 'privacy_invalid_ack';end if;
 for item in select * from jsonb_array_elements(p_objects) loop
  if not exists(select 1 from app.parent_erasure_files f where f.parent_id=auth.uid()
    and f.bucket_id=item->>'bucket_id' and f.object_name=item->>'object_name') then raise exception 'privacy_file_scope_forbidden';end if;
  if exists(select 1 from storage.objects o where o.bucket_id=item->>'bucket_id' and o.name=item->>'object_name') then raise exception 'privacy_storage_not_removed';end if;
  update app.parent_erasure_files set state='removed' where parent_id=auth.uid()
   and bucket_id=item->>'bucket_id' and object_name=item->>'object_name';
  update app.trial_retention_files f set state='removed' from app.trial_retention_jobs j
  where j.application_id=f.application_id and j.parent_id=auth.uid() and j.state='db_cleaned'
   and f.bucket_id=item->>'bucket_id' and f.object_name=item->>'object_name';
 end loop;
 for r in select application_id from app.trial_retention_jobs where parent_id=auth.uid() and state='db_cleaned' order by application_id for update loop
  perform app.finish_trial_retention_job(r.application_id);
 end loop;
 return true;
end $$;
revoke all on function public.ack_my_parent_erasure_files(jsonb) from public,anon,service_role;
grant execute on function public.ack_my_parent_erasure_files(jsonb) to authenticated;

create function app.block_unfinished_parent_erasure_auth_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from app.trial_retention_jobs where parent_id=old.id and state in ('preparing','db_cleaned')) then raise exception 'privacy_storage_pending';end if;
 if exists(select 1 from app.parent_account_deletions where parent_id=old.id)
  and (exists(select 1 from app.parent_erasure_files where parent_id=old.id and state='pending')
   or exists(select 1 from storage.objects o where coalesce(o.owner_id,o.owner::text)=old.id::text)) then
  raise exception 'privacy_storage_pending';end if;
 return old;
end $$;
revoke all on function app.block_unfinished_parent_erasure_auth_delete() from public,anon,authenticated,service_role;
create trigger privacy_storage_before_auth_delete before delete on auth.users
 for each row execute function app.block_unfinished_parent_erasure_auth_delete();

-- Only a publication counter, never old report JSON or a parent identifier.
create function public.get_studio_erased_report_flags(p_ids uuid[]) returns table(application_id uuid)
language sql stable security definer set search_path='' as $$
 select m.application_id from app.erased_trial_metrics m
 join public.trial_applications a on a.id=m.application_id join public.classes c on c.id=a.class_id
 join public.profiles p on p.id=auth.uid() and p.organization_id=c.organization_id and p.role in('academy','admin')
 where m.application_id=any(p_ids) and m.had_published_report and cardinality(p_ids)<=1000;
$$;
revoke all on function public.get_studio_erased_report_flags(uuid[]) from public,anon,service_role;
grant execute on function public.get_studio_erased_report_flags(uuid[]) to authenticated;

notify pgrst,'reload schema';
commit;
