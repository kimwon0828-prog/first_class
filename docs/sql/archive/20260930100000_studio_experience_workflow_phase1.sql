-- Phase 1. Local validation only; no backfill, no legacy history conversion.
begin;
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
-- Only the new command may change registration. Preserve other view writes.
revoke update on public.studio_trial_applications from authenticated;
do $$ declare cols text; begin
 select string_agg(quote_ident(column_name), ',') into cols from information_schema.columns
 where table_schema='public' and table_name='studio_trial_applications'
 and column_name not in ('registration_status','registration_reason_ids','registration_note',
 'enrolled_at','lost_at','unregistered_reason','unregistered_reason_note');
 execute 'grant update (' || cols || ') on public.studio_trial_applications to authenticated';
end $$;

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
-- Saved rows (including legacy) are final. No destructive backfill is required.
revoke insert,update,delete on public.trial_results from anon,authenticated;
create function public.lock_final_trial_result() returns trigger language plpgsql as $$
begin raise exception 'trial_result_already_finalized'; end $$;
create trigger trial_result_final before update or delete on public.trial_results
for each row execute function public.lock_final_trial_result();

revoke insert,update,delete on public.experience_reports from anon,authenticated;

-- One publication in the application's lifetime, including withdrawn legacy versions.
-- Preserve existing content snapshot and safety withdrawal contract.
create function public.report_send_once() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='DELETE' then raise exception 'report_already_sent'; end if;
 if TG_OP='UPDATE' then
   if new.status='superseded' then raise exception 'report_already_sent'; end if;
   return new;
 end if;
 perform 1 from public.trial_applications where id=new.application_id for update;
 if exists(select 1 from public.experience_reports where application_id=new.application_id) then
 raise exception 'report_already_sent'; end if;
 return new;
end $$;
create trigger experience_report_send_once before insert or update or delete on public.experience_reports
for each row execute function public.report_send_once();

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
 enrolled_at=case when p_status='enrolled' then case when a.registration_status='enrolled' then a.enrolled_at else now() end else null end,
 lost_at=case when p_status='not_enrolled' then case when a.registration_status='not_enrolled' then a.lost_at else now() end else null end
 where id=a.id;
 -- Existing single legacy reason columns are historical data: do not erase or invent a mapping.
 -- Complete before/after state (including legacy fields) lives in the existing internal event log.
 insert into public.application_logs(application_id,from_status,to_status,actor_id,is_internal,note)
 values(a.id,a.status,a.status,auth.uid(),true,jsonb_build_object('event','registration_result_saved',
 'before',jsonb_build_object('status',a.registration_status,'reasonIds',a.registration_reason_ids,'note',a.registration_note,
 'legacyReason',a.unregistered_reason,'legacyNote',a.unregistered_reason_note),
 'after',jsonb_build_object('status',p_status,'reasonIds',reasons,'note',nullif(btrim(p_note),'')))::text);
 return jsonb_build_object('changed',true,'enrollmentTransition',first_enrolled);
end $$;
revoke all on function public.set_studio_registration_result(uuid,text,text[],text) from public,anon;
grant execute on function public.set_studio_registration_result(uuid,text,text[],text) to authenticated;

-- Validate new structured snapshots; old NULL/legacy values remain untouched.
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

create function public.validate_new_contact_snapshot() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' or new.regular_schedule_preference_snapshot is distinct from old.regular_schedule_preference_snapshot then
 if not public.validate_contact_preference(new.regular_schedule_preference_snapshot) then raise exception 'invalid_contact_preference'; end if;
 end if; return new;
end $$;
create trigger contact_preference_validation before insert or update on public.consultation_logs
for each row execute function public.validate_new_contact_snapshot();

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
-- Retain old SQL/history for rollback, remove its public client entry point.
revoke execute on function public.create_studio_consultation(uuid,uuid,timestamptz,text,text,text,text,text,text,text,timestamptz,boolean,jsonb,text,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.publish_experience_report(p_application_id uuid, p_expected_assessment_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_app public.trial_applications%rowtype;
  v_result public.trial_results%rowtype;
  v_experience_date timestamptz;
  v_class public.classes%rowtype;
  v_org_name text;
  v_now timestamptz := now();
  v_current public.experience_reports%rowtype;
  v_next_version integer;
  v_content jsonb;
  v_observations jsonb;
  v_legacy_count integer;
  v_unknown_count integer;
  v_report_id uuid;
  v_is_first_publication boolean;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  -- 조직은 파라미터로 받지 않는다. profiles 에서 직접 읽는다.
  -- app.current_org_id() 를 쓰지 않는 이유는 authenticated 에 app schema USAGE 가
  -- 없어서다(RLS 정책 안에서만 평가된다). create_studio_consultation 과 같은 방식.
  select p.organization_id, p.role into v_org, v_role
  from public.profiles p where p.id = v_actor;

  -- normalizeProfileRole 과 같은 매핑: academy | admin 이 Studio 계정이다.
  if v_org is null or v_role is null or v_role not in ('academy', 'admin') then
    raise exception 'application_not_found_or_forbidden';
  end if;

  -- 대상 신청을 잠근다. 같은 Experience 에 동시에 발행이 들어와도
  -- 여기서 줄을 세운다 — version 충돌과 published 2개를 막는 1차 방어다.
  select ta.* into v_app
  from public.trial_applications ta
  join public.classes c on c.id = ta.class_id
  where ta.id = p_application_id
    and c.organization_id = v_org
  for update of ta;

  if not found then
    raise exception 'application_not_found_or_forbidden';
  end if;

  if exists(select 1 from public.experience_reports where application_id=p_application_id) then raise exception 'report_already_sent'; end if;

  -- 상태는 잠근 row 기준이다. 호출자가 먼저 읽은 값을 쓰지 않는다.
  if v_app.status <> 'completed' or v_app.no_show_at is not null or v_app.canceled_at is not null then
    raise exception 'application_not_completed';
  end if;

  -- 학부모 계정이 연결되지 않은 신청은 발행하지 않는다.
  --
  -- parent_id 는 nullable 이다(예약 import 경로). 그 상태로 발행하면 읽을 사람이
  -- 없는 artifact 가 생긴다. 이 표는 "실제로 부모에게 발행된 것" 만 담는다 —
  -- 읽을 수 없는 발행은 발행이 아니다. UI 가 아니라 여기서 막는다.
  if v_app.parent_id is null then
    raise exception 'parent_not_linked'
      using detail = '학부모 계정이 연결된 뒤 리포트를 발행할 수 있습니다.';
  end if;

  -- source 도 같은 transaction 안에서 잠근다.
  -- revision 을 확인한 뒤 스냅샷을 뜨는 사이에 source 가 바뀌면 확인이 무의미하다.
  select tr.* into v_result
  from public.trial_results tr
  where tr.application_id = p_application_id
  for update;

  if not found then
    raise exception 'trial_result_not_found';
  end if;

  -- 원장이 본 revision 과 지금 저장된 revision 이 같은가.
  if p_expected_assessment_updated_at is null
     or v_result.updated_at is distinct from p_expected_assessment_updated_at then
    raise exception 'assessment_changed_since_preview'
      using detail = '평가 내용이 확인 이후 변경되었습니다. 최신 내용을 다시 확인한 뒤 발행해 주세요.';
  end if;

  -- 옛 기준으로 적힌 관찰은 자동으로 발행하지 않는다.
  -- 문구를 code 로 짐작해 바꾸면 과거에 없던 행동을 주장하게 된다(R0.1).
  -- 사람이 현재 기준으로 다시 고른 뒤에 발행할 수 있다.
  select count(*) into v_legacy_count
  from unnest(v_result.observations) as value
  where value in (
    '집중을 잘했어요', '적극적으로 참여했어요', '발표를 잘했어요', '이해가 빨랐어요',
    '도움이 조금 필요했어요', '난이도가 높아 보였어요', '난이도가 쉬워 보였어요'
  );

  if v_legacy_count > 0 then
    raise exception 'legacy_observations_require_review'
      using detail = '기존 기준의 관찰 기록은 현재 공개 기준으로 다시 확인한 뒤 발행할 수 있습니다.';
  end if;

  -- 문구를 못 찾는 code 는 발행하지 않는다. 빈 칸으로 내보내지 않는다.
  select count(*) into v_unknown_count
  from unnest(v_result.observations) as value
  where public.experience_report_observation_label(value) is null;

  if v_unknown_count > 0 then
    raise exception 'unknown_observations_cannot_publish';
  end if;

  -- 날짜 없는 리포트는 내보내지 않는다.
  -- confirmed_state_check 는 completed 라도 confirmed_slot_at 이 비어 있는 것을
  -- 허용하므로(예약 import), 완료 처리 시각으로 대신한다. 둘 다 없으면 발행하지 않는다.
  v_experience_date := coalesce(v_app.confirmed_slot_at, v_app.completed_at);

  if v_experience_date is null then
    raise exception 'experience_date_missing'
      using detail = '체험 날짜가 없어 리포트를 발행할 수 없습니다.';
  end if;

  select c.* into v_class from public.classes c where c.id = v_app.class_id;
  select o.name into v_org_name from public.organizations o where o.id = v_class.organization_id;

  -- 관찰: code 와 발행 시점 문구를 함께 얼린다. 입력 순서를 유지한다.
  select coalesce(
    jsonb_agg(
      jsonb_build_object('code', value, 'label', public.experience_report_observation_label(value))
      order by ordinality
    ),
    '[]'::jsonb
  )
  into v_observations
  from unnest(v_result.observations) with ordinality as u(value, ordinality);

  -- ⚠️ source row 를 통째로 펼치지 않는다. 공개 가능한 field 만 이름을 적어 넣는다.
  --    parent_reaction · next_action · note · created_by · updated_by ·
  --    registration_status 는 학원 내부 정보라 여기 오지 않는다.
  v_content := jsonb_build_object(
    'experience', jsonb_build_object(
      'type', v_class.program_type,
      'date', v_experience_date,
      'child', jsonb_build_object(
        'displayName', v_app.child_name,
        'grade', v_app.child_grade
      ),
      'academy', jsonb_build_object('name', v_org_name),
      'class', jsonb_build_object('title', v_class.title)
    ),
    'observations', v_observations,
    -- 총평. 공백만 있으면 null 이다 — 부모 화면에 빈 카드를 만들지 않기 위해서다.
    'summary', nullif(btrim(v_result.public_summary), ''),
    -- 공백만 있는 값은 null 로 눕힌다. TS 쪽 builder(asOptionalText)와 같은 규칙이라
    -- 미리보기와 발행본이 같은 것을 보여 준다.
    'recommendation', jsonb_build_object(
      'course', nullif(btrim(v_result.recommended_course), ''),
      'level', nullif(btrim(v_result.recommended_level), ''),
      'schedule', nullif(btrim(v_result.recommended_schedule), '')
    )
  );

  -- 부모에게 보여 줄 것이 하나도 없는 리포트는 발행하지 않는다.
  --
  -- 관찰이 비어 있는 것 자체는 유효한 snapshot 이다(R1). 하지만 발행은 다른 판단이다 —
  -- 관찰도 추천도 없으면 부모가 받는 것은 이름과 날짜뿐이고, 그건 리포트가 아니라
  -- "확인했다" 는 알림에 가깝다. 학원이 무엇을 봤는지 말해 주지 않는 문서를
  -- 공식 발행본으로 남기지 않는다.
  --
  -- 공백만 있는 추천은 내용으로 세지 않는다.
  -- 총평도 부모가 읽을 내용이다. 관찰이 없어도 선생님이 남긴 글이 있으면 리포트다.
  if coalesce(jsonb_array_length(v_observations), 0) = 0
     and coalesce(btrim(v_result.public_summary), '') = ''
     and coalesce(btrim(v_result.recommended_course), '') = ''
     and coalesce(btrim(v_result.recommended_level), '') = ''
     and coalesce(btrim(v_result.recommended_schedule), '') = ''
  then
    raise exception 'report_content_missing'
      using detail = '부모님께 전달할 리포트 내용이 아직 없습니다. 관찰 내용이나 추천 정보를 확인한 뒤 발행해 주세요.';
  end if;

  -- 살아 있는 발행본이 있으면 같은 transaction 안에서 내린다.
  -- 중간에 published 가 0 개이거나 2 개인 상태가 밖에서 보이지 않는다.
  select er.* into v_current
  from public.experience_reports er
  where er.application_id = p_application_id
    and er.status = 'published';

  if found then
    update public.experience_reports
    set status = 'superseded',
        superseded_at = v_now,
        superseded_by = v_actor
    where id = v_current.id;
  end if;

  -- version 은 철회분까지 포함한 최대값 다음이다. 번호를 다시 쓰지 않는다.
  select coalesce(max(er.version), 0) + 1 into v_next_version
  from public.experience_reports er
  where er.application_id = p_application_id;

  -- ⚠️ "지금 살아 있는 발행본이 없다" 와 "한 번도 발행한 적이 없다" 는 다르다.
  --
  --    발행 → 철회 → 다시 발행 이면 current 는 비어 있지만 처음이 아니다.
  --    supersededVersion 으로 최초 발행을 추론하면 그 경우에 알림이 또 나간다.
  --    발행 이력 자체가 있었는지로 판정한다 — insert 하기 전에 본다.
  v_is_first_publication := v_next_version = 1;

  insert into public.experience_reports (
    application_id, version, status, content_version, content, published_at, published_by
  )
  values (
    -- content_version 2 다. 총평이 들어간 모양이라 V1 과 다른 문서다.
    -- 이미 발행된 V1 은 그대로 둔다 — 부모가 본 것과 같은 것이 남아 있어야 한다.
    p_application_id, v_next_version, 'published', 2, v_content, v_now, v_actor
  )
  returning id into v_report_id;

  return jsonb_build_object(
    'id', v_report_id,
    'version', v_next_version,
    'supersededVersion', case when v_current.id is null then null else v_current.version end,
    -- 이 Experience 의 생애 최초 발행인가. 알림 발송 판정은 이 값만 본다.
    'isFirstPublication', v_is_first_publication,
    'publishedAt', v_now
  );
end;
$function$;
notify pgrst,'reload schema';
commit;
