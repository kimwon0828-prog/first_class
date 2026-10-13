-- Additional Parent events. Default OFF, no historical backfill or automatic activation.
begin;
create table public.parent_event_push_settings (
 singleton boolean primary key default true check(singleton),
 mode text not null default 'off' check(mode in ('off','test','all')),
 test_parent_id uuid references public.profiles(id) on delete set null,
 test_application_id uuid,
 test_device_ids uuid[] not null default '{}'
);
insert into public.parent_event_push_settings(singleton) values(true);
alter table public.parent_event_push_settings enable row level security;
revoke all on public.parent_event_push_settings from public,anon,authenticated;
grant all on public.parent_event_push_settings to service_role;

create table public.parent_event_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 event_type text not null check(event_type in ('schedule_changed','report_published','feedback_reminder')),
 source_id uuid not null,
 source_value timestamptz,
 notification_key text not null unique,
 application_id uuid not null references public.trial_applications(id) on delete cascade,
 parent_id uuid not null references public.profiles(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','receipts','checking','fallback_ready','fallback_sending','delivered','fallback_done','unknown','canceled','test_suppressed','no_device')),
 attempts jsonb not null default '[]' check(jsonb_typeof(attempts)='array'),
 suppress_legacy boolean not null default false,
 feedback_completed boolean not null default false,
 completion_channel text check(completion_channel is null or completion_channel in ('alimtalk','sms_fallback')),
 next_check_at timestamptz not null default now(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),reason text
);
create unique index parent_event_push_once_per_application on public.parent_event_push_deliveries(application_id,event_type)
 where event_type in ('report_published','feedback_reminder');
create index parent_event_push_work on public.parent_event_push_deliveries(state,next_check_at);
alter table public.parent_event_push_deliveries enable row level security;
revoke all on public.parent_event_push_deliveries from public,anon,authenticated;
grant all on public.parent_event_push_deliveries to service_role;

create function app.parent_event_push_source_current(j public.parent_event_push_deliveries)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trial_applications a join public.profiles p on p.id=a.parent_id
 where a.id=j.application_id and a.parent_id=j.parent_id and p.role='parent'
 and not exists(select 1 from app.parent_account_deletions where parent_id=a.parent_id)
 and a.canceled_at is null and a.no_show_at is null
 and case j.event_type
 when 'schedule_changed' then a.status='confirmed' and a.confirmed_slot_at=j.source_value
 when 'report_published' then exists(select 1 from public.experience_reports r where r.id=j.source_id and r.application_id=a.id and r.status='published')
 when 'feedback_reminder' then a.status='completed'
   and exists(select 1 from public.experience_reports r where r.application_id=a.id and r.status='published')
   and exists(select 1 from public.parent_report_engagement e where e.application_id=a.id and e.parent_id=a.parent_id
     and e.report_first_viewed_at<=now()-interval '24 hours' and e.feedback_reminder_sent_at is null)
   and not (exists(select 1 from public.experience_feedback f where f.application_id=a.id)
     and exists(select 1 from public.parent_decisions d where d.application_id=a.id and d.superseded_at is null))
 else false end);
$$;
revoke all on function app.parent_event_push_source_current(public.parent_event_push_deliveries) from public,anon,authenticated;

create function public.enqueue_parent_event_push(p_event text,p_application_id uuid,p_source_id uuid,p_source_value timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare cfg public.parent_event_push_settings; j public.parent_event_push_deliveries; existing_id uuid;
begin
 if p_event is null or p_event not in ('schedule_changed','report_published','feedback_reminder') or p_source_id is null then raise exception 'invalid_push_event'; end if;
 -- Return existing ownership even when the gate is later disabled; do not also send legacy.
 select id into existing_id from public.parent_event_push_deliveries where application_id=p_application_id
 and event_type=p_event and (event_type<>'schedule_changed' or source_id=p_source_id);
 if found then return existing_id; end if;
 select * into cfg from public.parent_event_push_settings where singleton;
 select parent_id into j.parent_id from public.trial_applications where id=p_application_id;
 if cfg.mode is null or cfg.mode='off' or j.parent_id is null then return null; end if;
 if cfg.mode='test' and (j.parent_id is distinct from cfg.test_parent_id or p_application_id is distinct from cfg.test_application_id) then return null; end if;
 j.event_type:=p_event;j.application_id:=p_application_id;j.source_id:=p_source_id;j.source_value:=p_source_value;
 if not app.parent_event_push_source_current(j) then return null; end if;
 if p_event='report_published' and exists(select 1 from public.experience_reports
   where application_id=p_application_id and id<>p_source_id and published_at is not null) then return null; end if;
 if p_event='feedback_reminder' and p_source_id<>p_application_id then raise exception 'invalid_feedback_source'; end if;
 insert into public.parent_event_push_deliveries(event_type,source_id,source_value,notification_key,application_id,parent_id,suppress_legacy)
 values(p_event,p_source_id,p_source_value,p_event||':'||p_source_id::text,p_application_id,j.parent_id,cfg.mode='test')
 on conflict do nothing returning id into existing_id;
 if existing_id is null then select id into existing_id from public.parent_event_push_deliveries where application_id=p_application_id
   and event_type=p_event and (p_event<>'schedule_changed' or source_id=p_source_id); end if;
 return existing_id;
end;
$$;
revoke all on function public.enqueue_parent_event_push(text,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_parent_event_push(text,uuid,uuid,timestamptz) to service_role;

create function app.capture_parent_report_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='published' and (tg_op='INSERT' or old.status is distinct from new.status) then
  perform public.enqueue_parent_event_push('report_published',new.application_id,new.id,null);
 end if;
 return new;
exception when others then raise warning 'parent_report_push_capture_failed';return new;
end;
$$;
revoke all on function app.capture_parent_report_push() from public,anon,authenticated;
create trigger capture_parent_report_push after insert or update of status on public.experience_reports
 for each row execute function app.capture_parent_report_push();

create function app.capture_parent_schedule_change_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='confirmed' and new.status='confirmed' and old.parent_id is not distinct from new.parent_id
 and old.confirmed_slot_at is not null and new.confirmed_slot_at is not null
 and old.confirmed_slot_at is distinct from new.confirmed_slot_at then
  perform public.enqueue_parent_event_push('schedule_changed',new.id,gen_random_uuid(),new.confirmed_slot_at);
 end if;
 return new;
exception when others then raise warning 'parent_schedule_push_capture_failed';return new;
end;
$$;
revoke all on function app.capture_parent_schedule_change_push() from public,anon,authenticated;
create trigger capture_parent_schedule_change_push after update of confirmed_slot_at on public.trial_applications
 for each row execute function app.capture_parent_schedule_change_push();

create function public.claim_parent_event_push(p_id uuid,p_operation text)
returns setof public.parent_event_push_deliveries language plpgsql security definer set search_path='' as $$
declare j public.parent_event_push_deliveries; cfg public.parent_event_push_settings;
begin
 select * into j from public.parent_event_push_deliveries where id=p_id for update skip locked;
 if not found then return; end if;
 if p_operation='send' and j.state='pending' or p_operation='fallback' and j.state='fallback_ready' then
  if not app.parent_event_push_source_current(j) or j.created_at<now()-interval '24 hours' then
   update public.parent_event_push_deliveries set state='canceled',updated_at=now() where id=p_id;return;
  end if;
  if p_operation='fallback' then
   return query update public.parent_event_push_deliveries set state='fallback_sending',updated_at=now() where id=p_id returning *;return;
  end if;
  select * into cfg from public.parent_event_push_settings where singleton;
  if cfg.mode is null or cfg.mode='off' or cfg.mode='test' and (j.parent_id is distinct from cfg.test_parent_id or j.application_id is distinct from cfg.test_application_id) then
   return query update public.parent_event_push_deliveries set state='fallback_ready',reason='gate_off',updated_at=now() where id=p_id returning *;return;
  end if;
  return query update public.parent_event_push_deliveries set state='sending',updated_at=now(),attempts=coalesce((
   select jsonb_agg(jsonb_build_object('deviceId',d.id,'platform',d.platform,'token',d.expo_push_token,'sendStatus','reserved') order by d.id)
   from public.parent_push_devices d join auth.sessions s on s.id=d.session_id and s.user_id=d.parent_id
   where d.parent_id=j.parent_id and d.enabled and d.permission_status='granted' and d.expo_push_token is not null
   and (s.not_after is null or s.not_after>now()) and (cfg.mode='all' or d.id=any(cfg.test_device_ids))),'[]'::jsonb)
   where id=p_id returning *;
 elsif p_operation='receipts' and (j.state='receipts' and j.next_check_at<=now() or j.state='checking' and j.updated_at<now()-interval '2 minutes') then
  return query update public.parent_event_push_deliveries set state='checking',updated_at=now() where id=p_id returning *;
 end if;
end;
$$;
revoke all on function public.claim_parent_event_push(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_parent_event_push(uuid,text) to service_role;

alter table public.parent_report_engagement drop constraint parent_report_feedback_reminder_channel_check;
alter table public.parent_report_engagement add constraint parent_report_feedback_reminder_channel_check
 check(feedback_reminder_channel is null or feedback_reminder_channel in ('alimtalk','sms_fallback','push'));
create function public.complete_parent_push_feedback(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare j public.parent_event_push_deliveries;
begin
 select * into j from public.parent_event_push_deliveries where id=p_id and event_type='feedback_reminder' and state in ('delivered','fallback_done') for update;
 if not found or j.feedback_completed then return false; end if;
 if j.state='fallback_done' and j.completion_channel is null then raise exception 'push_completion_channel_missing'; end if;
 if app.parent_event_push_source_current(j) then
 update public.parent_report_engagement set feedback_reminder_sent_at=now(),feedback_reminder_channel=case when j.state='delivered' then 'push' else j.completion_channel end,
 feedback_reminder_last_error=null,feedback_reminder_claimed_at=null where application_id=j.application_id and parent_id=j.parent_id and feedback_reminder_sent_at is null;
 end if;
 update public.parent_event_push_deliveries set feedback_completed=true,updated_at=now() where id=p_id;
 return true;
end;
$$;
revoke all on function public.complete_parent_push_feedback(uuid) from public,anon,authenticated;
grant execute on function public.complete_parent_push_feedback(uuid) to service_role;

-- Existing five-minute worker now notices either queue. No activation or secret changes.
create or replace function app.invoke_confirmed_push_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare secret text; request_id bigint;
begin
 if not exists(select 1 from public.parent_confirmed_push_deliveries where state in ('pending','receipts','checking','fallback_ready') and next_check_at<=now())
 and not exists(select 1 from public.parent_event_push_deliveries where state in ('pending','receipts','checking','fallback_ready') and next_check_at<=now()
 or event_type='feedback_reminder' and state in ('delivered','fallback_done') and not feedback_completed) then return null; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='parent_confirmed_push_cron_secret';
 if secret is null then raise exception 'confirmed_push_worker_secret_missing'; end if;
 select net.http_get(url:='https://firstsuup.com/api/cron/schedule-confirmed-push',headers:=jsonb_build_object('Authorization','Bearer '||secret),timeout_milliseconds:=175000) into request_id;
 return request_id;
end;
$$;
notify pgrst,'reload schema';
commit;
