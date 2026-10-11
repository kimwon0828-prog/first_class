-- COMPAT: reviewed locally only; Production application requires explicit approval.
-- No existing source/snapshot/data rewrite, grants/policies or lock triggers changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Replace only the two CHECK definitions to accept a superset of existing data.
-- Legacy-only arrays remain valid; authored legacy/canonical mixtures remain invalid.
alter table public.trial_results drop constraint trial_results_observations_allowed_check,
 drop constraint trial_results_observations_cardinality_check;
alter table public.trial_results add constraint trial_results_observations_allowed_check check (
 observations <@ array['sustained_engagement','active_participation','verbal_explanation','independent_after_instruction','needs_some_guidance','needs_repeated_guidance','ready_for_more_challenge','math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives','math_applied_concept','math_needed_step_guidance','math_reviewed_foundations','math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice']::text[] or observations <@ array['집중을 잘했어요','적극적으로 참여했어요','발표를 잘했어요','이해가 빨랐어요','도움이 조금 필요했어요','난이도가 높아 보였어요','난이도가 쉬워 보였어요']::text[]),
 add constraint trial_results_observations_cardinality_check check (cardinality(observations)<=16);

create or replace function public.experience_report_observation_label(p_code text)
returns text language sql immutable set search_path='' as $$ select case p_code
 when 'sustained_engagement' then '활동이 진행되는 동안 과제에 계속 참여했어요.'
 when 'active_participation' then '질문이나 활동 제안에 스스로 참여했어요.'
 when 'verbal_explanation' then '자기 생각이나 과정을 말로 설명했어요.'
 when 'independent_after_instruction' then '설명을 들은 뒤 다음 단계를 스스로 진행했어요.'
 when 'needs_some_guidance' then '일부 단계에서 추가 설명이나 도움이 필요했어요.'
 when 'needs_repeated_guidance' then '여러 단계에서 반복 설명이나 도움이 필요했어요.'
 when 'ready_for_more_challenge' then '안내된 활동을 마친 뒤 추가 활동을 더 시도했어요.'
 when 'math_attempted_new_problem' then '새로운 문제에 스스로 도전했어요'
 when 'math_started_familiar_problem' then '익숙한 문제부터 참여했어요'
 when 'math_engaged_with_manipulatives' then '문제 풀이보다 교구 활동에 더 참여했어요'
 when 'math_applied_concept' then '배운 개념을 문제에 적용했어요'
 when 'math_needed_step_guidance' then '풀이 중 일부 단계에서 도움이 필요했어요'
 when 'math_reviewed_foundations' then '기초 개념을 함께 확인하며 진행했어요'
 when 'math_solved_after_example' then '예시를 본 뒤 비슷한 문제를 해결했어요'
 when 'math_expressed_with_visuals' then '그림·교구를 활용한 뒤 이해를 표현했어요'
 when 'math_needs_further_practice' then '추가 연습을 통해 더 확인할 부분이 있어요'
 else null end $$;

create function public.experience_report_observation_group(p_code text)
returns jsonb language sql immutable set search_path='' as $$ select case
 when p_code=any(array['math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['math_applied_concept','math_needed_step_guidance','math_reviewed_foundations']::text[]) then jsonb_build_object('code','understanding_today','label','오늘 내용의 이해')
 when p_code=any(array['math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 else null end $$;
revoke all on function public.experience_report_observation_group(text) from public,anon;
grant execute on function public.experience_report_observation_group(text) to authenticated;

-- One shared subject guard for both deployed record-writing RPCs.
-- Private helper: only the SECURITY DEFINER writer functions call it.
create function public.trial_observations_match_subject(p_class_id uuid,p_observations text[],p_previous text[])
returns boolean language sql stable set search_path='' as $$
 select not (exists(select 1 from unnest(p_observations) v where v=any(array['math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives','math_applied_concept','math_needed_step_guidance','math_reviewed_foundations','math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice']::text[]) and not(v=any(coalesce(p_previous,'{}'::text[]))))
 and not exists(select 1 from public.classes c
 left join public.subjects s on s.id=c.subject_id
 left join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
 where c.id=p_class_id and (sc.code='math' or (sc.code is null and coalesce(s.code,c.subject)=any(array['math','school_math','thinking_math','competition_math','arithmetic','abacus'])))))
$$;
revoke all on function public.trial_observations_match_subject(uuid,text[],text[]) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_studio_trial_result(p_application_id uuid, p_content jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if cardinality(obs)>16 or (obs is distinct from r.observations and exists(select 1 from unnest(obs) v where public.experience_report_observation_label(v) is null)) then raise exception 'invalid_trial_observations'; end if;
 if not public.trial_observations_match_subject(a.class_id,obs,coalesce(r.observations,'{}'::text[])) then
 raise exception 'observation_subject_mismatch';
 end if;
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
end $function$
;

-- Preserve the initial-write RPC contract; add the same persisted-subject guard.
CREATE OR REPLACE FUNCTION public.finalize_studio_trial_result(p_application_id uuid, p_content jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.trial_applications; obs text[]; begin
 a:=public.workflow_studio_application(p_application_id);
 if exists(select 1 from public.trial_results where application_id=a.id) then
 raise exception 'trial_result_already_finalized'; end if;
 if p_content is null or jsonb_typeof(p_content)<>'object' or
 jsonb_typeof(coalesce(p_content->'observations','[]')) <> 'array' or length(p_content->>'publicSummary')>1000 then
 raise exception 'invalid_trial_record'; end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(p_content->'observations','[]')) v
 where public.experience_report_observation_label(v) is null) then raise exception 'invalid_trial_observations'; end if;
 obs:=array(select value from jsonb_array_elements_text(coalesce(p_content->'observations','[]')) with ordinality group by value order by min(ordinality));
 if not public.trial_observations_match_subject(a.class_id,obs,'{}'::text[]) then
 raise exception 'observation_subject_mismatch';
 end if;
 insert into public.trial_results(application_id,observations,recommended_course,recommended_level,
 recommended_schedule,public_summary,note,created_by,updated_by)
 values(a.id,obs,
 p_content->>'recommendedCourse',p_content->>'recommendedLevel',p_content->>'recommendedSchedule',
 p_content->>'publicSummary',p_content->>'note',auth.uid(),auth.uid());
 insert into public.application_logs(application_id,from_status,to_status,actor_id,note)
 values(a.id,a.status,a.status,auth.uid(),'체험 기록 최종 확정');
 return 'created';
end $function$
;

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

  if exists(select 1 from unnest(v_result.observations) v where v=any(array['math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives','math_applied_concept','math_needed_step_guidance','math_reviewed_foundations','math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice']::text[])) then raise exception 'report_format_requires_updated_client'; end if;

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
$function$
;

CREATE FUNCTION public.publish_experience_report_v3(p_application_id uuid, p_expected_assessment_updated_at timestamp with time zone)
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
      jsonb_build_object('code', value, 'label', public.experience_report_observation_label(value), 'group', public.experience_report_observation_group(value))
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
    -- content_version 3 freezes each selected observation domain and label.
    -- Existing V1/V2 rows are never updated by this migration.
    p_application_id, v_next_version, 'published', 3, v_content, v_now, v_actor
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
$function$
;
revoke all on function public.publish_experience_report_v3(uuid,timestamptz) from public,anon;
grant execute on function public.publish_experience_report_v3(uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
