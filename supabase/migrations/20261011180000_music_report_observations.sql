-- COMPAT: pending review. Never rewrite saved observations or V1/V2/V3 snapshots.
-- Extends the existing shared pipeline only; no new RPC/permission/lock policy.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Replace only the two CHECK definitions to accept a superset of existing data.
-- Legacy-only arrays remain valid; authored legacy/canonical mixtures remain invalid.
alter table public.trial_results drop constraint trial_results_observations_allowed_check,
 drop constraint trial_results_observations_cardinality_check;
alter table public.trial_results add constraint trial_results_observations_allowed_check check (
 observations <@ array['sustained_engagement','active_participation','verbal_explanation','independent_after_instruction','needs_some_guidance','needs_repeated_guidance','ready_for_more_challenge','math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives','math_applied_concept','math_needed_step_guidance','math_reviewed_foundations','math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice','music_interested_in_sound','music_started_familiar_activity','music_attempted_new_activity','music_followed_rhythm_or_sound','music_applied_learning','music_reviewed_activity_steps','music_retried_after_guidance','music_continued_with_smaller_steps','music_needs_further_practice']::text[] or observations <@ array['집중을 잘했어요','적극적으로 참여했어요','발표를 잘했어요','이해가 빨랐어요','도움이 조금 필요했어요','난이도가 높아 보였어요','난이도가 쉬워 보였어요']::text[]),
 add constraint trial_results_observations_cardinality_check check (cardinality(observations)<=25);

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
 when 'music_interested_in_sound' then '소리나 음악 활동에 관심을 보였어요'
 when 'music_started_familiar_activity' then '익숙한 곡이나 활동부터 참여했어요'
 when 'music_attempted_new_activity' then '새로운 곡이나 활동을 스스로 시도했어요'
 when 'music_followed_rhythm_or_sound' then '제시된 리듬이나 소리를 따라 표현했어요'
 when 'music_applied_learning' then '배운 내용을 연주·노래·음악 만들기에 활용했어요'
 when 'music_reviewed_activity_steps' then '활동의 일부 단계를 함께 확인하며 진행했어요'
 when 'music_retried_after_guidance' then '시범이나 설명을 들은 뒤 다시 시도했어요'
 when 'music_continued_with_smaller_steps' then '활동을 작은 단계로 나눈 뒤 이어갔어요'
 when 'music_needs_further_practice' then '반복 연습을 통해 더 확인할 부분이 있어요'
 else null end $$;

create or replace function public.experience_report_observation_group(p_code text)
returns jsonb language sql immutable set search_path='' as $$ select case
 when p_code=any(array['math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['math_applied_concept','math_needed_step_guidance','math_reviewed_foundations']::text[]) then jsonb_build_object('code','understanding_today','label','오늘 내용의 이해')
 when p_code=any(array['math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['music_interested_in_sound','music_started_familiar_activity','music_attempted_new_activity']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['music_followed_rhythm_or_sound','music_applied_learning','music_reviewed_activity_steps']::text[]) then jsonb_build_object('code','performance_today','label','오늘 활동의 수행')
 when p_code=any(array['music_retried_after_guidance','music_continued_with_smaller_steps','music_needs_further_practice']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 else null end $$;
-- Both initial finalize and save already call this same private guard.
-- New music choices require the persisted music category FK, regardless of subsubject.
-- Existing choices remain preservable/removable after subject reclassification.
create or replace function public.trial_observations_match_subject(p_class_id uuid,p_observations text[],p_previous text[])
returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from unnest(p_observations) v
 where not(v=any(coalesce(p_previous,'{}'::text[]))) and (
  (v=any(array['math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives','math_applied_concept','math_needed_step_guidance','math_reviewed_foundations','math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   left join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and (sc.code='math' or (sc.code is null and coalesce(s.code,c.subject)=any(array['math','school_math','thinking_math','competition_math','arithmetic','abacus'])))))
  or (v=any(array['music_interested_in_sound','music_started_familiar_activity','music_attempted_new_activity','music_followed_rhythm_or_sound','music_applied_learning','music_reviewed_activity_steps','music_retried_after_guidance','music_continued_with_smaller_steps','music_needs_further_practice']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and sc.code='music'))
 ))
$$;

-- Replace one reviewed expression; all auth/revision/lock/publication logic stays intact.
do $patch$
declare definition text := pg_get_functiondef('public.save_studio_trial_result(uuid,jsonb,timestamptz)'::regprocedure);
begin
 if md5(definition) <> '993d9ba5aff81bb6d16a121c814e5384' then raise exception 'music_migration_save_studio_trial_result_changed'; end if;
 execute replace(definition,$old$cardinality(obs)>16$old$,$new$cardinality(obs)>25$new$);
end $patch$;

-- Replace one reviewed expression; all auth/revision/lock/publication logic stays intact.
do $patch$
declare definition text := pg_get_functiondef('public.publish_experience_report(uuid,timestamptz)'::regprocedure);
begin
 if md5(definition) <> 'ae614c182460641715539c6a06a8cc0c' then raise exception 'music_migration_publish_experience_report_changed'; end if;
 execute replace(definition,$old$v=any(array['math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives','math_applied_concept','math_needed_step_guidance','math_reviewed_foundations','math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice']::text[])$old$,$new$public.experience_report_observation_group(v) is not null$new$);
end $patch$;

notify pgrst,'reload schema';
commit;
