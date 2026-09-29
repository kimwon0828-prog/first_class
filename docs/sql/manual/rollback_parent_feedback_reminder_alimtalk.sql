begin;

drop function if exists public.complete_parent_feedback_reminder(uuid,boolean,text,text);
drop function if exists public.claim_parent_feedback_reminders(integer);

alter table public.parent_report_engagement
  drop constraint if exists parent_report_feedback_reminder_channel_check,
  drop constraint if exists parent_report_feedback_reminder_error_check,
  drop column if exists feedback_reminder_claimed_at,
  drop column if exists feedback_reminder_attempted_at,
  drop column if exists feedback_reminder_channel,
  drop column if exists feedback_reminder_last_error;

drop index if exists public.parent_report_engagement_feedback_reminder_due_idx;

create or replace function public.create_parent_feedback_reminders()
returns integer language plpgsql security definer set search_path='' as $$
declare candidate record; created integer:=0; affected integer;
begin
  for candidate in
    select a.id from public.trial_applications a
    join public.parent_report_engagement e on e.application_id=a.id and e.parent_id=a.parent_id
    where e.feedback_reminder_sent_at is null and e.report_first_viewed_at <= now()-interval '24 hours'
      and a.status='completed' and a.canceled_at is null and a.no_show_at is null
      and exists(select 1 from public.experience_reports where application_id=a.id and status='published')
      and not (exists(select 1 from public.experience_feedback where application_id=a.id)
        and exists(select 1 from public.parent_decisions where application_id=a.id and superseded_at is null))
    order by e.report_first_viewed_at,a.id limit 500 for update of a skip locked
  loop
    update public.parent_report_engagement set feedback_reminder_sent_at=now()
      where application_id=candidate.id and feedback_reminder_sent_at is null;
    get diagnostics affected=row_count;
    created:=created+affected;
  end loop;
  return created;
end;
$$;
revoke all on function public.create_parent_feedback_reminders() from public,anon,authenticated;
grant execute on function public.create_parent_feedback_reminders() to service_role;

notify pgrst,'reload schema';

commit;
