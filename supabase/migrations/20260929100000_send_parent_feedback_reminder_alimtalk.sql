-- Claim, deliver and complete the post-report feedback reminder separately.
-- Only a provider-accepted Alimtalk (or its accepted SMS fallback) becomes the
-- durable web-inbox event. Failed or crashed attempts are safe to retry.
alter table public.parent_report_engagement
  add column if not exists feedback_reminder_claimed_at timestamptz,
  add column if not exists feedback_reminder_attempted_at timestamptz,
  add column if not exists feedback_reminder_channel text,
  add column if not exists feedback_reminder_last_error text;

alter table public.parent_report_engagement
  drop constraint if exists parent_report_feedback_reminder_channel_check;
alter table public.parent_report_engagement
  add constraint parent_report_feedback_reminder_channel_check
  check (feedback_reminder_channel is null or feedback_reminder_channel in ('alimtalk','sms_fallback'));

alter table public.parent_report_engagement
  drop constraint if exists parent_report_feedback_reminder_error_check;
alter table public.parent_report_engagement
  add constraint parent_report_feedback_reminder_error_check
  check (feedback_reminder_last_error is null or char_length(feedback_reminder_last_error) <= 500);

create index if not exists parent_report_engagement_feedback_reminder_due_idx
  on public.parent_report_engagement(report_first_viewed_at,application_id)
  where feedback_reminder_sent_at is null;

drop function if exists public.create_parent_feedback_reminders();

create or replace function public.claim_parent_feedback_reminders(p_limit integer default 500)
returns table(
  application_id uuid,
  organization_id uuid,
  class_id uuid,
  parent_id uuid,
  parent_name text,
  parent_phone text,
  student_name text,
  academy_name text,
  class_title text,
  requested_slot_at timestamptz,
  confirmed_slot_at timestamptz,
  selected_schedule_label text
) language plpgsql security definer set search_path='' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'feedback_reminder_invalid_limit';
  end if;

  return query
  with candidates as (
    select e.application_id
    from public.parent_report_engagement e
    join public.trial_applications a on a.id=e.application_id and a.parent_id=e.parent_id
    join public.classes c on c.id=a.class_id
    join public.organizations o on o.id=c.organization_id
    where e.feedback_reminder_sent_at is null
      and e.report_first_viewed_at <= now()-interval '24 hours'
      and (e.feedback_reminder_claimed_at is null
        or e.feedback_reminder_claimed_at <= now()-interval '15 minutes')
      and a.status='completed' and a.canceled_at is null and a.no_show_at is null
      and exists(select 1 from public.experience_reports r
        where r.application_id=a.id and r.status='published')
      and not (
        exists(select 1 from public.experience_feedback f where f.application_id=a.id)
        and exists(select 1 from public.parent_decisions d
          where d.application_id=a.id and d.superseded_at is null)
      )
    order by e.report_first_viewed_at,e.application_id
    limit p_limit
    for update of e skip locked
  ), claimed as (
    update public.parent_report_engagement e
    set feedback_reminder_claimed_at=now(),
        feedback_reminder_attempted_at=now(),
        feedback_reminder_last_error=null
    from candidates c
    where e.application_id=c.application_id and e.feedback_reminder_sent_at is null
    returning e.application_id
  )
  select a.id,c.organization_id,a.class_id,a.parent_id,a.parent_name,a.parent_phone,
    a.child_name,o.name,c.title,a.requested_slot_at,a.confirmed_slot_at,a.selected_schedule_label
  from claimed q
  join public.trial_applications a on a.id=q.application_id
  join public.classes c on c.id=a.class_id
  join public.organizations o on o.id=c.organization_id
  order by a.id;
end;
$$;
revoke all on function public.claim_parent_feedback_reminders(integer) from public,anon,authenticated;
grant execute on function public.claim_parent_feedback_reminders(integer) to service_role;

create or replace function public.complete_parent_feedback_reminder(
  p_application_id uuid,
  p_delivered boolean,
  p_channel text default null,
  p_error text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  if p_delivered and p_channel not in ('alimtalk','sms_fallback') then
    raise exception 'feedback_reminder_channel_required';
  end if;
  if not p_delivered and p_channel is not null then
    raise exception 'feedback_reminder_channel_invalid';
  end if;

  update public.parent_report_engagement
  set feedback_reminder_sent_at=case when p_delivered then now() else null end,
      feedback_reminder_channel=case when p_delivered then p_channel else null end,
      feedback_reminder_last_error=case when p_delivered then null else left(coalesce(p_error,'delivery_failed'),500) end,
      feedback_reminder_claimed_at=null
  where application_id=p_application_id
    and feedback_reminder_sent_at is null
    and feedback_reminder_claimed_at is not null;
  get diagnostics affected=row_count;
  return affected=1;
end;
$$;
revoke all on function public.complete_parent_feedback_reminder(uuid,boolean,text,text)
  from public,anon,authenticated;
grant execute on function public.complete_parent_feedback_reminder(uuid,boolean,text,text) to service_role;

-- Parent Alimtalk falls back to SMS only when delivery through Kakao is not
-- available. Keep both report events loggable and allow the already-supported
-- Ncloud provider value.
alter table public.sms_logs drop constraint if exists sms_logs_event_type_check;
alter table public.sms_logs add constraint sms_logs_event_type_check check (
  event_type in (
    'trial_contact_started','trial_rejected','trial_schedule_confirmed','trial_completed',
    'trial_enrolled','trial_reminder','trial_report_published','trial_feedback_reminder',
    'teacher_trial_requested','teacher_trial_assigned','teacher_trial_schedule_confirmed',
    'teacher_trial_schedule_updated','teacher_trial_canceled','teacher_trial_reminder',
    'admin_trial_requested','admin_trial_canceled','admin_trial_schedule_confirmed','admin_trial_reminder'
  )
);
alter table public.sms_logs drop constraint if exists sms_logs_provider_check;
alter table public.sms_logs add constraint sms_logs_provider_check
  check (provider is null or provider in ('dry_run','ncloud'));

notify pgrst,'reload schema';
