-- COMPAT: 9 additional master-category templates; shared V3 pipeline unchanged.
-- No data rewrite, new RPC, grants, RLS, trigger or publication-policy changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.trial_results drop constraint trial_results_observations_allowed_check,
 drop constraint trial_results_observations_cardinality_check;
alter table public.trial_results add constraint trial_results_observations_allowed_check check (
 observations <@ array['sustained_engagement','active_participation','verbal_explanation','independent_after_instruction','needs_some_guidance','needs_repeated_guidance','ready_for_more_challenge','korean_language_asked_about_text','korean_language_joined_familiar_topic','korean_language_volunteered_thought','korean_language_found_text_details','korean_language_retold_main_content','korean_language_expressed_with_reason','korean_language_reread_after_question','korean_language_revised_with_example','korean_language_explained_with_prompt','english_responded_familiar_expression','english_asked_expression_meaning','english_tried_new_expression','english_identified_heard_content','english_found_reading_content','english_expressed_in_english','english_retried_after_model','english_used_expression_in_context','english_revised_after_feedback','science_asked_about_phenomenon','science_joined_familiar_phenomenon','science_suggested_investigation','science_described_observation','science_compared_results','science_explained_with_evidence','science_reobserved_with_prompt','science_retried_inquiry_steps','science_revised_explanation','social_history_asked_about_topic','social_history_connected_known_event','social_history_shared_viewpoint','social_history_summarized_topic','social_history_found_source_details','social_history_explained_with_source','social_history_rechecked_source','social_history_compared_after_example','social_history_added_explanation','coding_it_robotics_explored_task','coding_it_robotics_asked_about_operation','coding_it_robotics_suggested_implementation','coding_it_robotics_described_task_goal','coding_it_robotics_implemented_steps','coding_it_robotics_located_error','coding_it_robotics_revised_with_guidance','coding_it_robotics_retried_smaller_steps','coding_it_robotics_checked_changed_result','foreign_language_responded_known_expression','foreign_language_asked_new_expression','foreign_language_initiated_expression','foreign_language_showed_content_understanding','foreign_language_expressed_with_learning','foreign_language_used_context_expression','foreign_language_retried_after_example','foreign_language_applied_guided_expression','foreign_language_revised_expression','art_design_explored_expression','art_design_started_familiar_method','art_design_proposed_idea','art_design_expressed_intention','art_design_tried_taught_method','art_design_described_choices','art_design_retried_after_demonstration','art_design_adjusted_expression','art_design_continued_in_steps','sports_dance_joined_warmup','sports_dance_started_familiar_movement','sports_dance_attempted_new_movement','sports_dance_followed_movement','sports_dance_connected_movement_sequence','sports_dance_adjusted_to_rules','sports_dance_retried_after_model','sports_dance_continued_slow_steps','sports_dance_adjusted_after_guidance','creative_mind_explored_problem','creative_mind_began_known_method','creative_mind_proposed_alternative','creative_mind_compared_methods','creative_mind_explained_strategy','creative_mind_changed_strategy','creative_mind_used_hint','creative_mind_retried_small_problem','creative_mind_applied_example_method','math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives','math_applied_concept','math_needed_step_guidance','math_reviewed_foundations','math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice','music_interested_in_sound','music_started_familiar_activity','music_attempted_new_activity','music_followed_rhythm_or_sound','music_applied_learning','music_reviewed_activity_steps','music_retried_after_guidance','music_continued_with_smaller_steps','music_needs_further_practice']::text[] or observations <@ array['집중을 잘했어요','적극적으로 참여했어요','발표를 잘했어요','이해가 빨랐어요','도움이 조금 필요했어요','난이도가 높아 보였어요','난이도가 쉬워 보였어요']::text[]),
 add constraint trial_results_observations_cardinality_check check (cardinality(observations)<=106);

create or replace function public.experience_report_observation_label(p_code text)
returns text language sql immutable set search_path='' as $$ select case p_code
 when 'sustained_engagement' then '활동이 진행되는 동안 과제에 계속 참여했어요.'
 when 'active_participation' then '질문이나 활동 제안에 스스로 참여했어요.'
 when 'verbal_explanation' then '자기 생각이나 과정을 말로 설명했어요.'
 when 'independent_after_instruction' then '설명을 들은 뒤 다음 단계를 스스로 진행했어요.'
 when 'needs_some_guidance' then '일부 단계에서 추가 설명이나 도움이 필요했어요.'
 when 'needs_repeated_guidance' then '여러 단계에서 반복 설명이나 도움이 필요했어요.'
 when 'ready_for_more_challenge' then '안내된 활동을 마친 뒤 추가 활동을 더 시도했어요.'
 when 'korean_language_asked_about_text' then '읽은 내용에서 궁금한 점을 물었어요'
 when 'korean_language_joined_familiar_topic' then '익숙한 이야기나 주제부터 참여했어요'
 when 'korean_language_volunteered_thought' then '자기 생각을 먼저 이야기했어요'
 when 'korean_language_found_text_details' then '글에서 필요한 내용을 찾아냈어요'
 when 'korean_language_retold_main_content' then '읽은 내용의 중심 생각을 자기 말로 설명했어요'
 when 'korean_language_expressed_with_reason' then '생각과 그 이유를 말이나 글로 표현했어요'
 when 'korean_language_reread_after_question' then '질문을 들은 뒤 글을 다시 살펴봤어요'
 when 'korean_language_revised_with_example' then '예시를 본 뒤 자기 표현을 고쳐 봤어요'
 when 'korean_language_explained_with_prompt' then '단서를 받은 뒤 생각을 이어서 설명했어요'
 when 'english_responded_familiar_expression' then '익숙한 영어 표현에 반응했어요'
 when 'english_asked_expression_meaning' then '궁금한 영어 표현의 뜻을 물었어요'
 when 'english_tried_new_expression' then '새로운 영어 표현을 스스로 사용해 봤어요'
 when 'english_identified_heard_content' then '들은 내용에 맞는 말이나 행동으로 답했어요'
 when 'english_found_reading_content' then '읽은 글에서 필요한 내용을 찾았어요'
 when 'english_expressed_in_english' then '배운 표현으로 생각을 말하거나 썼어요'
 when 'english_retried_after_model' then '시범을 듣거나 본 뒤 표현을 다시 시도했어요'
 when 'english_used_expression_in_context' then '설명을 들은 뒤 다른 상황에 표현을 사용했어요'
 when 'english_revised_after_feedback' then '안내를 받은 뒤 말이나 글을 고쳐 봤어요'
 when 'science_asked_about_phenomenon' then '관찰한 현상에 대해 질문했어요'
 when 'science_joined_familiar_phenomenon' then '익숙한 현상을 다루는 활동부터 참여했어요'
 when 'science_suggested_investigation' then '궁금한 점을 확인할 방법을 제안했어요'
 when 'science_described_observation' then '관찰한 특징이나 변화를 말로 설명했어요'
 when 'science_compared_results' then '예상한 것과 실제 결과를 비교했어요'
 when 'science_explained_with_evidence' then '관찰한 내용을 근거로 현상을 설명했어요'
 when 'science_reobserved_with_prompt' then '안내받은 부분을 다시 관찰했어요'
 when 'science_retried_inquiry_steps' then '설명을 들은 뒤 탐구 과정을 다시 시도했어요'
 when 'science_revised_explanation' then '질문을 받은 뒤 설명을 보완했어요'
 when 'social_history_asked_about_topic' then '오늘 다룬 주제에 대해 질문했어요'
 when 'social_history_connected_known_event' then '알고 있던 일과 연결해 이야기에 참여했어요'
 when 'social_history_shared_viewpoint' then '자료를 보고 자기 생각을 먼저 이야기했어요'
 when 'social_history_summarized_topic' then '배운 내용의 핵심을 자기 말로 설명했어요'
 when 'social_history_found_source_details' then '자료에서 필요한 정보를 찾아냈어요'
 when 'social_history_explained_with_source' then '자료를 근거로 자기 생각을 설명했어요'
 when 'social_history_rechecked_source' then '질문을 들은 뒤 자료를 다시 확인했어요'
 when 'social_history_compared_after_example' then '예시를 본 뒤 공통점이나 차이점을 찾아봤어요'
 when 'social_history_added_explanation' then '설명을 들은 뒤 자기 이야기에 내용을 덧붙였어요'
 when 'coding_it_robotics_explored_task' then '제시된 과제를 살펴보며 활동을 시작했어요'
 when 'coding_it_robotics_asked_about_operation' then '동작 방식이나 결과에 대해 질문했어요'
 when 'coding_it_robotics_suggested_implementation' then '만들어 보고 싶은 기능이나 방법을 제안했어요'
 when 'coding_it_robotics_described_task_goal' then '만들어야 할 결과를 자기 말로 설명했어요'
 when 'coding_it_robotics_implemented_steps' then '생각한 순서에 따라 구현을 시도했어요'
 when 'coding_it_robotics_located_error' then '예상과 다른 결과가 나온 부분을 찾아봤어요'
 when 'coding_it_robotics_revised_with_guidance' then '안내를 받은 뒤 구현한 내용을 수정했어요'
 when 'coding_it_robotics_retried_smaller_steps' then '과제를 작은 단계로 나눈 뒤 다시 시도했어요'
 when 'coding_it_robotics_checked_changed_result' then '방법을 바꾼 뒤 결과가 달라졌는지 확인했어요'
 when 'foreign_language_responded_known_expression' then '알고 있던 표현에 반응하며 참여했어요'
 when 'foreign_language_asked_new_expression' then '처음 접한 표현의 뜻이나 쓰임을 물었어요'
 when 'foreign_language_initiated_expression' then '배운 언어로 먼저 말하거나 써 봤어요'
 when 'foreign_language_showed_content_understanding' then '듣거나 읽은 내용에 맞게 답했어요'
 when 'foreign_language_expressed_with_learning' then '배운 말이나 문장으로 생각을 표현했어요'
 when 'foreign_language_used_context_expression' then '주어진 상황에 맞는 표현을 골라 사용했어요'
 when 'foreign_language_retried_after_example' then '예시를 듣거나 본 뒤 표현을 다시 시도했어요'
 when 'foreign_language_applied_guided_expression' then '안내받은 표현을 다른 상황에 활용했어요'
 when 'foreign_language_revised_expression' then '설명을 들은 뒤 말이나 글을 고쳐 봤어요'
 when 'art_design_explored_expression' then '여러 표현 방법을 살펴보며 참여했어요'
 when 'art_design_started_familiar_method' then '익숙한 표현 방법부터 시도했어요'
 when 'art_design_proposed_idea' then '만들고 싶은 모습이나 아이디어를 제안했어요'
 when 'art_design_expressed_intention' then '자기 생각을 작품에 표현했어요'
 when 'art_design_tried_taught_method' then '배운 방법을 작품에 사용해 봤어요'
 when 'art_design_described_choices' then '표현 방법을 선택한 이유를 이야기했어요'
 when 'art_design_retried_after_demonstration' then '시범을 본 뒤 표현 방법을 다시 시도했어요'
 when 'art_design_adjusted_expression' then '안내를 받은 뒤 작품의 일부를 바꿔 봤어요'
 when 'art_design_continued_in_steps' then '과정을 작은 단계로 나눈 뒤 작업을 이어갔어요'
 when 'sports_dance_joined_warmup' then '준비 활동부터 몸을 움직이며 참여했어요'
 when 'sports_dance_started_familiar_movement' then '익숙한 동작부터 시도했어요'
 when 'sports_dance_attempted_new_movement' then '새로운 동작이나 활동을 스스로 시도했어요'
 when 'sports_dance_followed_movement' then '제시된 동작을 따라 해 봤어요'
 when 'sports_dance_connected_movement_sequence' then '배운 동작을 순서대로 이어갔어요'
 when 'sports_dance_adjusted_to_rules' then '활동의 규칙이나 약속에 맞춰 움직였어요'
 when 'sports_dance_retried_after_model' then '시범을 본 뒤 같은 동작을 다시 시도했어요'
 when 'sports_dance_continued_slow_steps' then '속도를 낮추거나 동작을 나눈 뒤 이어갔어요'
 when 'sports_dance_adjusted_after_guidance' then '안내받은 부분을 바꿔 움직여 봤어요'
 when 'creative_mind_explored_problem' then '주어진 문제나 활동을 살펴보며 참여했어요'
 when 'creative_mind_began_known_method' then '알고 있던 방법부터 시도했어요'
 when 'creative_mind_proposed_alternative' then '다른 방법으로 해 보자고 제안했어요'
 when 'creative_mind_compared_methods' then '여러 방법의 결과를 비교했어요'
 when 'creative_mind_explained_strategy' then '자기가 선택한 방법을 설명했어요'
 when 'creative_mind_changed_strategy' then '막힌 부분에서 방법을 바꿔 시도했어요'
 when 'creative_mind_used_hint' then '힌트를 들은 뒤 다음 단계를 시도했어요'
 when 'creative_mind_retried_small_problem' then '문제를 작은 단계로 나눈 뒤 다시 풀어 봤어요'
 when 'creative_mind_applied_example_method' then '예시에서 본 방법을 비슷한 문제에 사용했어요'
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
 when p_code=any(array['korean_language_asked_about_text','korean_language_joined_familiar_topic','korean_language_volunteered_thought']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['korean_language_found_text_details','korean_language_retold_main_content','korean_language_expressed_with_reason']::text[]) then jsonb_build_object('code','performance_today','label','읽고 표현한 모습')
 when p_code=any(array['korean_language_reread_after_question','korean_language_revised_with_example','korean_language_explained_with_prompt']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['english_responded_familiar_expression','english_asked_expression_meaning','english_tried_new_expression']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['english_identified_heard_content','english_found_reading_content','english_expressed_in_english']::text[]) then jsonb_build_object('code','performance_today','label','듣고 읽고 표현한 모습')
 when p_code=any(array['english_retried_after_model','english_used_expression_in_context','english_revised_after_feedback']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['science_asked_about_phenomenon','science_joined_familiar_phenomenon','science_suggested_investigation']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['science_described_observation','science_compared_results','science_explained_with_evidence']::text[]) then jsonb_build_object('code','performance_today','label','관찰하고 탐구한 모습')
 when p_code=any(array['science_reobserved_with_prompt','science_retried_inquiry_steps','science_revised_explanation']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['social_history_asked_about_topic','social_history_connected_known_event','social_history_shared_viewpoint']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['social_history_summarized_topic','social_history_found_source_details','social_history_explained_with_source']::text[]) then jsonb_build_object('code','performance_today','label','자료를 읽고 설명한 모습')
 when p_code=any(array['social_history_rechecked_source','social_history_compared_after_example','social_history_added_explanation']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['coding_it_robotics_explored_task','coding_it_robotics_asked_about_operation','coding_it_robotics_suggested_implementation']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['coding_it_robotics_described_task_goal','coding_it_robotics_implemented_steps','coding_it_robotics_located_error']::text[]) then jsonb_build_object('code','performance_today','label','만들고 수정한 모습')
 when p_code=any(array['coding_it_robotics_revised_with_guidance','coding_it_robotics_retried_smaller_steps','coding_it_robotics_checked_changed_result']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['foreign_language_responded_known_expression','foreign_language_asked_new_expression','foreign_language_initiated_expression']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['foreign_language_showed_content_understanding','foreign_language_expressed_with_learning','foreign_language_used_context_expression']::text[]) then jsonb_build_object('code','performance_today','label','이해하고 표현한 모습')
 when p_code=any(array['foreign_language_retried_after_example','foreign_language_applied_guided_expression','foreign_language_revised_expression']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['art_design_explored_expression','art_design_started_familiar_method','art_design_proposed_idea']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['art_design_expressed_intention','art_design_tried_taught_method','art_design_described_choices']::text[]) then jsonb_build_object('code','performance_today','label','탐색하고 표현한 모습')
 when p_code=any(array['art_design_retried_after_demonstration','art_design_adjusted_expression','art_design_continued_in_steps']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['sports_dance_joined_warmup','sports_dance_started_familiar_movement','sports_dance_attempted_new_movement']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['sports_dance_followed_movement','sports_dance_connected_movement_sequence','sports_dance_adjusted_to_rules']::text[]) then jsonb_build_object('code','performance_today','label','움직이고 수행한 모습')
 when p_code=any(array['sports_dance_retried_after_model','sports_dance_continued_slow_steps','sports_dance_adjusted_after_guidance']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['creative_mind_explored_problem','creative_mind_began_known_method','creative_mind_proposed_alternative']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['creative_mind_compared_methods','creative_mind_explained_strategy','creative_mind_changed_strategy']::text[]) then jsonb_build_object('code','performance_today','label','방법을 찾고 해결한 모습')
 when p_code=any(array['creative_mind_used_hint','creative_mind_retried_small_problem','creative_mind_applied_example_method']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['math_attempted_new_problem','math_started_familiar_problem','math_engaged_with_manipulatives']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['math_applied_concept','math_needed_step_guidance','math_reviewed_foundations']::text[]) then jsonb_build_object('code','understanding_today','label','오늘 내용의 이해')
 when p_code=any(array['math_solved_after_example','math_expressed_with_visuals','math_needs_further_practice']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 when p_code=any(array['music_interested_in_sound','music_started_familiar_activity','music_attempted_new_activity']::text[]) then jsonb_build_object('code','interest_participation','label','관심과 참여')
 when p_code=any(array['music_followed_rhythm_or_sound','music_applied_learning','music_reviewed_activity_steps']::text[]) then jsonb_build_object('code','performance_today','label','오늘 활동의 수행')
 when p_code=any(array['music_retried_after_guidance','music_continued_with_smaller_steps','music_needs_further_practice']::text[]) then jsonb_build_object('code','response_to_guidance','label','안내 후 반응')
 else null end $$;

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
  or (v=any(array['korean_language_asked_about_text','korean_language_joined_familiar_topic','korean_language_volunteered_thought','korean_language_found_text_details','korean_language_retold_main_content','korean_language_expressed_with_reason','korean_language_reread_after_question','korean_language_revised_with_example','korean_language_explained_with_prompt']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and sc.code='korean_language'))
  or (v=any(array['english_responded_familiar_expression','english_asked_expression_meaning','english_tried_new_expression','english_identified_heard_content','english_found_reading_content','english_expressed_in_english','english_retried_after_model','english_used_expression_in_context','english_revised_after_feedback']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and sc.code='english'))
  or (v=any(array['science_asked_about_phenomenon','science_joined_familiar_phenomenon','science_suggested_investigation','science_described_observation','science_compared_results','science_explained_with_evidence','science_reobserved_with_prompt','science_retried_inquiry_steps','science_revised_explanation']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and sc.code='science'))
  or (v=any(array['social_history_asked_about_topic','social_history_connected_known_event','social_history_shared_viewpoint','social_history_summarized_topic','social_history_found_source_details','social_history_explained_with_source','social_history_rechecked_source','social_history_compared_after_example','social_history_added_explanation']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and sc.code='social_history'))
  or (v=any(array['coding_it_robotics_explored_task','coding_it_robotics_asked_about_operation','coding_it_robotics_suggested_implementation','coding_it_robotics_described_task_goal','coding_it_robotics_implemented_steps','coding_it_robotics_located_error','coding_it_robotics_revised_with_guidance','coding_it_robotics_retried_smaller_steps','coding_it_robotics_checked_changed_result']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and sc.code='coding_it_robotics'))
  or (v=any(array['foreign_language_responded_known_expression','foreign_language_asked_new_expression','foreign_language_initiated_expression','foreign_language_showed_content_understanding','foreign_language_expressed_with_learning','foreign_language_used_context_expression','foreign_language_retried_after_example','foreign_language_applied_guided_expression','foreign_language_revised_expression']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and sc.code='foreign_language'))
  or (v=any(array['art_design_explored_expression','art_design_started_familiar_method','art_design_proposed_idea','art_design_expressed_intention','art_design_tried_taught_method','art_design_described_choices','art_design_retried_after_demonstration','art_design_adjusted_expression','art_design_continued_in_steps']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and sc.code='art_design'))
  or (v=any(array['sports_dance_joined_warmup','sports_dance_started_familiar_movement','sports_dance_attempted_new_movement','sports_dance_followed_movement','sports_dance_connected_movement_sequence','sports_dance_adjusted_to_rules','sports_dance_retried_after_model','sports_dance_continued_slow_steps','sports_dance_adjusted_after_guidance']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and sc.code='sports_dance'))
  or (v=any(array['creative_mind_explored_problem','creative_mind_began_known_method','creative_mind_proposed_alternative','creative_mind_compared_methods','creative_mind_explained_strategy','creative_mind_changed_strategy','creative_mind_used_hint','creative_mind_retried_small_problem','creative_mind_applied_example_method']::text[]) and not exists(select 1 from public.classes c
   left join public.subjects s on s.id=c.subject_id
   join public.subject_categories sc on sc.id=coalesce(c.subject_category_id,s.category_id)
   where c.id=p_class_id and sc.code='creative_mind'))
 ))
$$;

-- Both finalize and save already call the private guard above.
-- Patch only the save ceiling; fail closed if the reviewed live function changed.
do $patch$
declare definition text := pg_get_functiondef('public.save_studio_trial_result(uuid,jsonb,timestamptz)'::regprocedure);
begin
 if md5(definition) <> '7c2a2b2090c87560d7ad84bdae5eadca' then raise exception 'subject_migration_save_studio_trial_result_changed'; end if;
 execute replace(definition,$old$cardinality(obs)>25$old$,$new$cardinality(obs)>106$new$);
end $patch$;
-- Existing V2 publishing already rejects all codes with a group; V3 is unchanged.
notify pgrst,'reload schema';
commit;
