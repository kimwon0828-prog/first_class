-- Application-scoped mutable Parent presentation state, separate from immutable
-- report snapshots and Studio registration results. No backfill or response rewrite.
create table if not exists public.parent_report_engagement (
  application_id uuid primary key references public.trial_applications(id) on delete restrict,
  parent_id uuid not null references public.profiles(id) on delete restrict,
  first_report_id uuid not null references public.experience_reports(id) on delete restrict,
  report_first_viewed_at timestamptz not null default now(),
  feedback_reminder_sent_at timestamptz,
  constraint parent_report_reminder_after_view check (
    feedback_reminder_sent_at is null or feedback_reminder_sent_at >= report_first_viewed_at + interval '24 hours'
  )
);
comment on table public.parent_report_engagement is
  'First actual report view per application. A committed reminder timestamp IS the durable web notification event; no external push transport.';
alter table public.parent_report_engagement enable row level security;
revoke all on public.parent_report_engagement from public,anon,authenticated;
grant select on public.parent_report_engagement to authenticated;
grant all on public.parent_report_engagement to service_role;
drop policy if exists parent_report_engagement_read_own on public.parent_report_engagement;
create policy parent_report_engagement_read_own on public.parent_report_engagement
for select to authenticated using (
  app.current_role()='parent' and parent_id=auth.uid() and public.is_own_trial_application(application_id)
);

create or replace function public.mark_parent_report_viewed(p_report_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_application uuid;
begin
  if auth.uid() is null or app.current_role() is distinct from 'parent' then raise exception 'report_view_forbidden'; end if;
  select application_id into v_application from public.experience_reports
    where id=p_report_id and status='published' and public.is_own_trial_application(application_id);
  if not found then raise exception 'report_view_forbidden'; end if;
  perform 1 from public.trial_applications where id=v_application and parent_id=auth.uid() for update;
  if not found then raise exception 'report_view_forbidden'; end if;
  perform 1 from public.experience_reports where id=p_report_id and status='published'
    and public.is_own_trial_application(application_id) for share;
  if not found then raise exception 'report_view_forbidden'; end if;
  insert into public.parent_report_engagement(application_id,parent_id,first_report_id)
    values(v_application,auth.uid(),p_report_id) on conflict(application_id) do nothing;
end;
$$;
revoke all on function public.mark_parent_report_viewed(uuid) from public,anon,authenticated;
grant execute on function public.mark_parent_report_viewed(uuid) to authenticated;

-- Existing inbox derives events from domain facts. Persisting this timestamp
-- atomically creates that event; failed/rolled-back writes produce neither event nor
-- sent receipt. Application lock serializes with submissions/publish/withdraw.
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
    if exists(select 1 from public.experience_reports where application_id=candidate.id and status='published')
      and not (exists(select 1 from public.experience_feedback where application_id=candidate.id)
        and exists(select 1 from public.parent_decisions where application_id=candidate.id and superseded_at is null)) then
      update public.parent_report_engagement set feedback_reminder_sent_at=now()
        where application_id=candidate.id and feedback_reminder_sent_at is null;
      get diagnostics affected = row_count;
      created:=created+affected;
    end if;
  end loop;
  return created;
end;
$$;
revoke all on function public.create_parent_feedback_reminders() from public,anon,authenticated;
grant execute on function public.create_parent_feedback_reminders() to service_role;

alter table public.parent_notification_reads drop constraint if exists parent_notification_reads_key_check;
alter table public.parent_notification_reads add constraint parent_notification_reads_key_check
  check(notification_key ~ '^(status|report_published|feedback_reminder):[0-9a-fA-F-]{36}$');
create or replace function public.parent_notification_key_is_visible(p_key text)
returns boolean language sql stable security invoker set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='parent') and (
    exists(select 1 from public.application_logs l join public.my_trial_applications a on a.id=l.application_id
      where a.parent_id=auth.uid() and p_key='status:'||l.id::text
        and l.to_status in ('reviewing','confirmed','canceled','completed')
        and l.from_status is distinct from l.to_status and l.actor_id is distinct from auth.uid() and l.created_at is not null)
    or exists(select 1 from public.experience_reports r join public.my_trial_applications a on a.id=r.application_id
      where a.parent_id=auth.uid() and p_key='report_published:'||r.id::text and r.status='published' and r.published_at is not null)
    or exists(select 1 from public.parent_report_engagement e
      join public.experience_reports r on r.application_id=e.application_id and r.status='published'
      where e.parent_id=auth.uid() and p_key='feedback_reminder:'||e.application_id::text and e.feedback_reminder_sent_at is not null)
  );
$$;
revoke all on function public.parent_notification_key_is_visible(text) from public,anon;
grant execute on function public.parent_notification_key_is_visible(text) to authenticated;

create or replace function public.submit_parent_experience(
  p_application_id uuid,
  p_selected_chip_ids text[] default null,
  p_private_note text default null,
  p_decision text default null,
  p_decline_reason text default null,
  p_preferred_days text[] default null,
  p_preferred_start_time time default null,
  p_preferred_end_time time default null,
  p_preferred_time_mode text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.trial_applications%rowtype; c public.classes%rowtype;
  f public.experience_feedback%rowtype; d public.parent_decisions%rowtype;
  v_class uuid; v_note text := app.normalize_experience_feedback_note(p_private_note);
begin
  if auth.uid() is null or app.current_role() is distinct from 'parent' then raise exception 'feedback_forbidden'; end if;
  select class_id into v_class from public.trial_applications where id=p_application_id and parent_id=auth.uid();
  if not found then raise exception 'feedback_forbidden'; end if;
  -- Canonical lock order. All concurrent submissions serialize at this application.
  select * into c from public.classes where id=v_class for share;
  select * into a from public.trial_applications where id=p_application_id and parent_id=auth.uid() for update;
  if not found or a.class_id is distinct from v_class then raise exception 'feedback_forbidden'; end if;
  select * into f from public.experience_feedback where application_id=a.id;
  select * into d from public.parent_decisions where application_id=a.id and superseded_at is null;
  if (f.id is not null and (f.parent_id,f.class_id,f.organization_id) is distinct from (a.parent_id,a.class_id,c.organization_id))
    or (d.id is not null and d.parent_id is distinct from a.parent_id)
    or (d.id is null and exists(select 1 from public.parent_decisions where application_id=a.id)) then
    raise exception 'feedback_context_changed';
  end if;
  if f.id is not null and d.id is not null then raise exception 'feedback_already_submitted'; end if;
  if a.status<>'completed' or a.no_show_at is not null or a.canceled_at is not null
    or coalesce(f.program_type,c.program_type) not in ('trial_class','level_test') then raise exception 'feedback_not_eligible'; end if;

  -- Same ownership predicate as experience_reports_parent_read_published RLS.
  -- Publication/withdrawal also locks this application before the report row.
  perform 1 from public.experience_reports r
    where r.application_id=a.id and r.status='published'
      and public.is_own_trial_application(r.application_id) for share;
  if not found then raise exception 'feedback_report_required'; end if;

  -- A pre-existing component is final, including old decisions with legacy metadata.
  -- Never silently accept an attempted overwrite. Only the missing component is filled.
  if f.id is not null then
    if p_selected_chip_ids is not null or p_private_note is not null then raise exception 'feedback_existing_feedback_readonly'; end if;
  else
    if not coalesce(app.valid_experience_feedback_chips(p_selected_chip_ids,c.program_type),false)
      or (cardinality(p_selected_chip_ids)=0 and v_note is null) or char_length(v_note)>1000 then raise exception 'feedback_invalid_input'; end if;
  end if;
  if d.id is not null then
    if p_decision is not null or p_decline_reason is not null or p_preferred_days is not null
      or p_preferred_start_time is not null or p_preferred_end_time is not null or p_preferred_time_mode is not null then
      raise exception 'feedback_existing_decision_readonly'; end if;
  else
    -- Retain the existing UI's registration-result capability, and enforce it here.
    if exists(select 1 from public.registration_results where application_id=a.id and superseded_at is null) then
      raise exception 'feedback_decision_closed'; end if;
    if p_decision is null or p_decision not in ('planned','considering','declined') then raise exception 'invalid_parent_decision'; end if;
  end if;

  if f.id is null then
    insert into public.experience_feedback(application_id,parent_id,class_id,organization_id,program_type,selected_chip_ids,private_note)
    values(a.id,auth.uid(),a.class_id,c.organization_id,c.program_type,p_selected_chip_ids,v_note);
  end if;
  if d.id is null then
    -- Reuse the existing canonical reason/schedule validator, only in its INSERT case.
    -- A validation/constraint error here rolls back the feedback INSERT above too.
    perform public.set_parent_decision_internal(a.id,p_decision,p_decline_reason,null,null,
      p_preferred_days,p_preferred_start_time,p_preferred_end_time,p_preferred_time_mode,false);
  end if;
end;
$$;
revoke all on function public.submit_parent_experience(uuid,text[],text,text,text,text[],time,time,text) from public,anon;
grant execute on function public.submit_parent_experience(uuid,text[],text,text,text,text[],time,time,text) to authenticated;
notify pgrst,'reload schema';
