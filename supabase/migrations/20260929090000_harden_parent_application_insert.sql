-- app.current_role()/current_org_id() are only trustworthy if API callers cannot
-- rewrite their own authority. Existing self-update RLS otherwise permits escalation.
-- Normal name/phone/birth-date edits and approved SECURITY DEFINER signup flows remain.
create or replace function app.guard_profile_authority_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') and
    (new.id,new.role,new.organization_id) is distinct from (old.id,old.role,old.organization_id) then
    raise exception 'profile_authority_change_forbidden' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_profile_authority_update() from public,anon,authenticated;
drop trigger if exists guard_profile_authority_update on public.profiles;
create trigger guard_profile_authority_update before update on public.profiles
for each row execute function app.guard_profile_authority_update();

-- Parent's actual createTrialApplication payload remains valid (including preassignment).
-- No UPDATE/SELECT boundary, Studio view, service role or workflow contract changes.
create or replace function app.valid_parent_application_initial_context(p_class uuid, p_child uuid, p_teacher uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and app.current_role() = 'parent'
    and exists (select 1 from public.classes c where c.id=p_class and c.is_active
      and p_teacher is not distinct from (case when c.assignment_mode='preassigned' then c.teacher_id else null end))
    and (p_child is null or exists (select 1 from public.children ch where ch.id=p_child and ch.parent_id=auth.uid()));
$$;
revoke all on function app.valid_parent_application_initial_context(uuid,uuid,uuid) from public, anon;
grant execute on function app.valid_parent_application_initial_context(uuid,uuid,uuid) to authenticated;

-- Column allowlist prevents spoofing system fields, including future added columns.
revoke insert on public.trial_applications from authenticated;
grant insert (id,parent_id,class_id,assigned_teacher_id,child_id,child_name,child_grade,
  parent_name,parent_phone,child_school,child_notes,interest_subjects,subject_experience_yn,
  subject_experience_duration,current_level,preferred_regular_schedule,goal_type,goal_note,
  class_schedule_id,requested_schedule_block_id,requested_slot_at,selected_schedule_label,memo,status)
  on public.trial_applications to authenticated;

drop policy if exists trial_applications_parent_insert_self on public.trial_applications;
create policy trial_applications_parent_insert_self on public.trial_applications for insert to authenticated
with check (
  parent_id=auth.uid() and app.current_role()='parent' and status='new'
  and completed_at is null and canceled_at is null and no_show_at is null
  and confirmed_slot_at is null and confirmed_schedule_block_id is null
  and contacted_at is null and scheduled_at is null and enrolled_at is null and lost_at is null
  and next_contact_at is null and last_activity_at is null
  and registration_status='undecided' and registered_course is null and unregistered_reason is null
  and unregistered_reason_note is null and follow_up_note is null
  and consultation_note is null and trial_feedback is null and final_level is null and final_schedule is null
  and regular_schedule_preference is null and regular_schedule_preference_note is null
  and regular_schedule_preference_updated_at is null and import_batch_id is null
  and app.valid_parent_application_initial_context(class_id,child_id,assigned_teacher_id)
);
