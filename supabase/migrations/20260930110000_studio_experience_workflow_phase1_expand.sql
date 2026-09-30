-- Phase 1A EXPANSION. Preserves all pre-existing writer functions, grants and triggers.
-- Final locks are deferred to 20260930111000. Apply only after the rollout rehearsal.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
alter table public.trial_applications
  add column registration_reason_ids text[] not null default '{}',
  add column registration_note text;
alter table public.consultation_logs add column time_flexibility text
  check (time_flexibility in ('exact','plus_minus_30','same_day_flexible','flexible'));

create or replace view public.studio_trial_applications as
select ta.* from public.trial_applications ta
where app.current_role() = 'teacher' and ta.class_id in
 (select c.id from public.classes c where c.organization_id = app.current_org_id())
with check option;
-- Registration reason history is internal. Parent status-event access stays unchanged.
alter table public.application_logs add column is_internal boolean not null default false;
alter policy application_logs_parent_select_self on public.application_logs
using (not is_internal and public.is_own_trial_application(application_id));
create function public.workflow_studio_application(p_id uuid)
returns public.trial_applications language plpgsql security definer set search_path=public as $$
declare a public.trial_applications; begin
 select ta.* into a from public.trial_applications ta
 join public.classes c on c.id=ta.class_id
 join public.profiles p on p.id=auth.uid() and p.organization_id=c.organization_id
 where ta.id=p_id and p.role in ('academy','admin') for update of ta;
 if not found then raise exception 'application_not_found_or_forbidden'; end if;
 if a.status <> 'completed' or a.no_show_at is not null or a.canceled_at is not null then
 raise exception 'application_not_completed'; end if;
 return a;
end $$;
revoke all on function public.workflow_studio_application(uuid) from public,anon,authenticated;

create function public.finalize_studio_trial_result(p_application_id uuid, p_content jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare a public.trial_applications; begin
 a:=public.workflow_studio_application(p_application_id);
 if exists(select 1 from public.trial_results where application_id=a.id) then
 raise exception 'trial_result_already_finalized'; end if;
 if p_content is null or jsonb_typeof(p_content)<>'object' or
 jsonb_typeof(coalesce(p_content->'observations','[]')) <> 'array' or length(p_content->>'publicSummary')>1000 then
 raise exception 'invalid_trial_record'; end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(p_content->'observations','[]')) v
 where public.experience_report_observation_label(v) is null) then raise exception 'invalid_trial_observations'; end if;
 insert into public.trial_results(application_id,observations,recommended_course,recommended_level,
 recommended_schedule,public_summary,note,created_by,updated_by)
 values(a.id,array(select value from jsonb_array_elements_text(coalesce(p_content->'observations','[]')) with ordinality group by value order by min(ordinality)),
 p_content->>'recommendedCourse',p_content->>'recommendedLevel',p_content->>'recommendedSchedule',
 p_content->>'publicSummary',p_content->>'note',auth.uid(),auth.uid());
 insert into public.application_logs(application_id,from_status,to_status,actor_id,note)
 values(a.id,a.status,a.status,auth.uid(),'체험 기록 최종 확정');
 return 'created';
end $$;
revoke all on function public.finalize_studio_trial_result(uuid,jsonb) from public,anon;
grant execute on function public.finalize_studio_trial_result(uuid,jsonb) to authenticated;
create function public.set_studio_registration_result(p_application_id uuid,p_status text,
 p_reason_ids text[] default '{}',p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.trial_applications; reasons text[]; first_enrolled boolean; begin
 a:=public.workflow_studio_application(p_application_id);
 if p_status is null or p_status not in ('undecided','pending','enrolled','not_enrolled') then
 raise exception 'invalid_registration_status'; end if;
 reasons:=coalesce(p_reason_ids,'{}');
 if array_position(reasons,null) is not null or cardinality(reasons)>9 or
 (p_status='pending' and not reasons <@ array['schedule_coordination','price_consideration',
 'comparing_academies','discussing_with_child','discussing_with_family','program_or_level','start_timing','other']) or
 (p_status='not_enrolled' and not reasons <@ array['schedule_mismatch','price_burden','distance_or_transport',
 'child_fit','no_suitable_program','chose_other_academy','schedule_changed','no_current_enrollment_plan','other']) or
 (p_status in ('undecided','enrolled') and cardinality(reasons)>0) then
 raise exception 'invalid_registration_reasons'; end if;
 if length(p_note)>2000 then raise exception 'registration_note_too_long'; end if;
 reasons:=array(select distinct x from unnest(reasons) x order by x);
 if a.registration_status=p_status and a.registration_reason_ids=reasons and
 a.registration_note is not distinct from nullif(btrim(p_note),'') then
 return jsonb_build_object('changed',false,'enrollmentTransition',false); end if;
 first_enrolled:=p_status='enrolled' and a.registration_status<>'enrolled' and not exists(
 select 1 from public.registration_results where application_id=a.id and result='enrolled');
 update public.trial_applications set registration_status=p_status,registration_reason_ids=reasons,
 registration_note=nullif(btrim(p_note),''),
 unregistered_reason=case when p_status='not_enrolled' then a.unregistered_reason else null end,
 unregistered_reason_note=case when p_status='not_enrolled' then a.unregistered_reason_note else null end,
 enrolled_at=case when p_status='enrolled' then case when a.registration_status='enrolled' then a.enrolled_at else now() end else null end,
 lost_at=case when p_status='not_enrolled' then case when a.registration_status='not_enrolled' then a.lost_at else now() end else null end
 where id=a.id;
 -- Existing CHECK only permits an active legacy reason while not_enrolled.
 -- Preserve its exact previous value in the same transaction's internal event, never remap it.
 insert into public.application_logs(application_id,from_status,to_status,actor_id,is_internal,note)
 values(a.id,a.status,a.status,auth.uid(),true,jsonb_build_object('event','registration_result_saved',
 'before',jsonb_build_object('status',a.registration_status,'reasonIds',a.registration_reason_ids,'note',a.registration_note,
 'legacyReason',a.unregistered_reason,'legacyNote',a.unregistered_reason_note),
 'after',jsonb_build_object('status',p_status,'reasonIds',reasons,'note',nullif(btrim(p_note),''),
 'legacyReason',case when p_status='not_enrolled' then a.unregistered_reason else null end,
 'legacyNote',case when p_status='not_enrolled' then a.unregistered_reason_note else null end))::text);
 return jsonb_build_object('changed',true,'enrollmentTransition',first_enrolled);
end $$;
revoke all on function public.set_studio_registration_result(uuid,text,text[],text) from public,anon;
grant execute on function public.set_studio_registration_result(uuid,text,text[],text) to authenticated;

create function public.validate_contact_preference(p jsonb) returns boolean
language plpgsql immutable as $$
declare g jsonb; d jsonb; begin
 if p is null then return true; end if;
 if jsonb_typeof(p)<>'object' or p->>'version' is distinct from '1' or
 p->>'state' is null or p->>'state' not in ('specified','undecided') or jsonb_typeof(p->'groups') is distinct from 'array' then return false; end if;
 if p->>'state'='undecided' then return jsonb_array_length(p->'groups')=0; end if;
 if jsonb_array_length(p->'groups') not between 1 and 3 then return false; end if;
 for g in select jsonb_array_elements(p->'groups') loop
 if g->>'dayMode' is null or g->>'dayMode' not in ('selected','any') or jsonb_typeof(g->'days') is distinct from 'array' then return false; end if;
 if (g->>'dayMode'='selected' and jsonb_array_length(g->'days')=0) or
 (g->>'dayMode'='any' and jsonb_array_length(g->'days')<>0) then return false; end if;
 for d in select jsonb_array_elements(g->'days') loop
 if jsonb_typeof(d)<>'number' or d::text !~ '^[1-7]$' then return false; end if; end loop;
 if g->>'timeMode' is null or g->>'timeMode' not in ('range','after','before','any') then return false; end if;
 if g->>'timeMode' in ('range','after') and coalesce(g->>'startTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
 if g->>'timeMode' in ('range','before') and coalesce(g->>'endTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
 if g->>'timeMode'='range' and g->>'endTime' <= g->>'startTime' then return false; end if;
 end loop; return true;
end $$;

create function public.record_studio_contact(p_submission_id uuid,p_application_id uuid,
 p_occurred_at timestamptz,p_channel text,p_sentiment text,p_note text,p_next_contact_at timestamptz,
 p_preference_provided boolean,p_preference jsonb,p_preference_note text,p_flexibility text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.trial_applications; old_app uuid; pref jsonb; pref_note text; begin
 a:=public.workflow_studio_application(p_application_id);
 select application_id into old_app from public.consultation_logs where id=p_submission_id;
 if found then
 if old_app<>a.id then raise exception 'consultation_submission_conflict'; end if;
 return jsonb_build_object('mode','duplicate','outcomeUpdated',false,'enrollmentTransition',false,'registrationStatus',a.registration_status); end if;
 if p_channel is null or p_channel not in ('PHONE','SMS','KAKAO','VISIT','OTHER') or
 p_sentiment is null or p_sentiment not in ('POSITIVE','NEUTRAL','NEGATIVE') or
 p_occurred_at is null or coalesce(btrim(p_note),'')='' then raise exception 'invalid_contact'; end if;
 if not public.validate_contact_preference(p_preference) or
 (p_flexibility is not null and p_flexibility not in ('exact','plus_minus_30','same_day_flexible','flexible')) then
 raise exception 'invalid_contact_preference'; end if;
 pref:=case when p_preference_provided then p_preference else a.regular_schedule_preference end;
 pref_note:=case when p_preference_provided then p_preference_note else a.regular_schedule_preference_note end;
 insert into public.consultation_logs(id,application_id,occurred_at,activity_type,channel,sentiment,note,created_by,
 registration_status_snapshot,next_action,next_contact_at,regular_schedule_preference_snapshot,
 regular_schedule_preference_note_snapshot,time_flexibility)
 values(p_submission_id,a.id,p_occurred_at,'CONSULTATION',p_channel,p_sentiment,p_note,auth.uid(),
 a.registration_status,case when p_next_contact_at is null then 'NONE' else 'FOLLOW_UP' end,p_next_contact_at,pref,pref_note,p_flexibility);
 update public.trial_applications set next_contact_at=p_next_contact_at,last_activity_at=p_occurred_at,
 regular_schedule_preference=pref,regular_schedule_preference_note=pref_note,
 regular_schedule_preference_updated_at=case when regular_schedule_preference is distinct from pref or
 regular_schedule_preference_note is distinct from pref_note then now() else regular_schedule_preference_updated_at end where id=a.id;
 return jsonb_build_object('mode','created','outcomeUpdated',false,'enrollmentTransition',false,'registrationStatus',a.registration_status);
end $$;
revoke all on function public.record_studio_contact(uuid,uuid,timestamptz,text,text,text,timestamptz,boolean,jsonb,text,text) from public,anon;
grant execute on function public.record_studio_contact(uuid,uuid,timestamptz,text,text,text,timestamptz,boolean,jsonb,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
