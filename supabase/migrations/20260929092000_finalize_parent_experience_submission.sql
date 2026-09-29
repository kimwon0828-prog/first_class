-- One Parent command, two independent domain tables. No data backfill/deletion.
-- Prerequisites: 20260929090000 + 20260929091000 and existing Decision migrations.
-- Retire EVERY legacy Parent write entry point, preserving service_role grants/bodies.
revoke execute on function public.save_parent_experience_feedback(uuid,text[],text) from public,anon,authenticated;
revoke execute on function public.set_parent_decision(uuid,text) from public,anon,authenticated;
revoke execute on function public.set_parent_decision(uuid,text,text,date,text) from public,anon,authenticated;
revoke execute on function public.set_parent_decision(uuid,text,text,text[],time,time,text) from public,anon,authenticated;
revoke execute on function public.set_parent_decision_internal(uuid,text,text,date,text,text[],time,time,text,boolean) from public,anon,authenticated;
revoke insert,update,delete on public.parent_decisions,public.experience_feedback from public,anon,authenticated;

-- Preserve intended service-role maintenance: CHECK functions also require EXECUTE.
grant execute on function app.valid_experience_feedback_chips(text[],text), app.normalize_experience_feedback_note(text) to service_role;

-- Defense in depth for authenticated writes through any definer path. Existing
-- service/admin maintenance and the old snapshot/Decision immutability triggers stay.
create or replace function app.reject_parent_experience_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() in ('authenticated','anon') then raise exception 'feedback_already_submitted'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app.reject_parent_experience_revision() from public,anon,authenticated;
drop trigger if exists reject_parent_feedback_revision on public.experience_feedback;
create trigger reject_parent_feedback_revision before update or delete on public.experience_feedback
for each row execute function app.reject_parent_experience_revision();
drop trigger if exists reject_parent_decision_revision on public.parent_decisions;
create trigger reject_parent_decision_revision before update or delete on public.parent_decisions
for each row execute function app.reject_parent_experience_revision();

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
