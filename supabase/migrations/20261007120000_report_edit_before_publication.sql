-- Local review only. Production application requires explicit user approval.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Existing trigger remains installed. Only the lock boundary changes from first
-- record save to first publication; direct client DML grants remain revoked.
create or replace function public.lock_final_trial_result() returns trigger
language plpgsql security definer set search_path='' as $$
declare application uuid;
begin
 if TG_OP='DELETE' then raise exception 'trial_result_already_finalized'; end if;
 application:=case when TG_OP='INSERT' then new.application_id else old.application_id end;
 if TG_OP='UPDATE' and (new.id is distinct from old.id or new.application_id is distinct from old.application_id
  or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by) then raise exception 'invalid_trial_record'; end if;
 -- Approved save/publish RPCs both take application -> record locks.
 perform 1 from public.trial_applications where id=application for update;
 if exists(select 1 from public.experience_reports where application_id=application) then raise exception 'report_content_locked'; end if;
 if TG_OP='UPDATE' then new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond'); end if;
 return new;
end $$;
create trigger trial_result_publication_insert_lock before insert on public.trial_results
 for each row execute function public.lock_final_trial_result();

create function public.save_studio_trial_result(p_application_id uuid,p_content jsonb,p_expected_updated_at timestamptz default null)
returns text language plpgsql security definer set search_path='' as $$
declare a public.trial_applications; r public.trial_results; obs text[]; field text;
begin
 a:=public.workflow_studio_application(p_application_id);
 if exists(select 1 from public.experience_reports where application_id=a.id) then raise exception 'report_content_locked'; end if;
 select * into r from public.trial_results where application_id=a.id for update;
 if r.updated_at is distinct from p_expected_updated_at then raise exception 'assessment_changed_since_preview'; end if;
 if p_content is null or jsonb_typeof(p_content)<>'object' or jsonb_typeof(p_content->'observations') is distinct from 'array'
  or length(p_content->>'publicSummary')>1000 then raise exception 'invalid_trial_record'; end if;
 foreach field in array array['recommendedCourse','recommendedLevel','recommendedSchedule','publicSummary','note'] loop
  if p_content ? field and jsonb_typeof(p_content->field) not in ('string','null') then raise exception 'invalid_trial_record'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_content->'observations') v where jsonb_typeof(v)<>'string') then raise exception 'invalid_trial_observations'; end if;
 if r.id is not null and array(select value from jsonb_array_elements_text(p_content->'observations') with ordinality order by ordinality) is not distinct from r.observations then obs:=r.observations;
 else
 select coalesce(array_agg(value order by first_index),'{}') into obs from
  (select value,min(ordinality) first_index from jsonb_array_elements_text(p_content->'observations') with ordinality group by value) normalized;
 end if;
 -- Preserve untouched legacy observations, but never accept newly authored legacy
 -- labels. Publication's existing human-review/canonical requirement is retained.
 if cardinality(obs)>7 or (obs is distinct from r.observations and exists(select 1 from unnest(obs) v where public.experience_report_observation_label(v) is null)) then raise exception 'invalid_trial_observations'; end if;
 if r.id is null then
  insert into public.trial_results(application_id,observations,recommended_course,recommended_level,recommended_schedule,public_summary,note,created_by,updated_by)
   values(a.id,obs,nullif(btrim(p_content->>'recommendedCourse'),''),nullif(btrim(p_content->>'recommendedLevel'),''),nullif(btrim(p_content->>'recommendedSchedule'),''),nullif(btrim(p_content->>'publicSummary'),''),nullif(btrim(p_content->>'note'),''),auth.uid(),auth.uid());
 else
  if r.observations is not distinct from obs and r.recommended_course is not distinct from nullif(btrim(p_content->>'recommendedCourse'),'')
   and r.recommended_level is not distinct from nullif(btrim(p_content->>'recommendedLevel'),'') and r.recommended_schedule is not distinct from nullif(btrim(p_content->>'recommendedSchedule'),'')
   and r.public_summary is not distinct from nullif(btrim(p_content->>'publicSummary'),'') and r.note is not distinct from nullif(btrim(p_content->>'note'),'') then return 'updated'; end if;
  update public.trial_results set observations=obs,recommended_course=nullif(btrim(p_content->>'recommendedCourse'),''),recommended_level=nullif(btrim(p_content->>'recommendedLevel'),''),
   recommended_schedule=nullif(btrim(p_content->>'recommendedSchedule'),''),public_summary=nullif(btrim(p_content->>'publicSummary'),''),note=nullif(btrim(p_content->>'note'),''),updated_by=auth.uid() where id=r.id;
 end if;
 insert into public.application_logs(application_id,from_status,to_status,actor_id,is_internal,note)
  values(a.id,a.status,a.status,auth.uid(),true,case when r.id is null then '체험 기록 저장' else '체험 기록 수정' end);
 return case when r.id is null then 'created' else 'updated' end;
end $$;
revoke all on function public.save_studio_trial_result(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.save_studio_trial_result(uuid,jsonb,timestamptz) to authenticated;

-- Existing snapshot immutability, one-publication, withdrawal and Parent RLS
-- contracts are reused without modifying their functions or policies.
notify pgrst,'reload schema';
commit;
