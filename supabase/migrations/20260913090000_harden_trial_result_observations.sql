-- 수업 관찰 항목을 표시 문구가 아니라 stable code 로 저장한다.
--
-- 문구는 앞으로 바뀐다 — Report 공개, 표현 개선, 다국어. 표시 문구를 그대로
-- 저장해 두면 문구를 고치는 순간 과거 데이터의 의미가 끊긴다.
--
-- 이 migration 은 저장 형식만 바꾼다. 기존 체험 결과가 학부모에게 공개되지 않고,
-- Report 가 만들어지지도 않는다.

-- ─────────────────────────────────────────────────────────────
-- 1. 알 수 없는 값이 있으면 멈춘다
--
-- server action 이 whitelist 를 강제하지 않던 시기가 있어, 목록 밖 문자열이
-- 들어가 있을 수 있다. 그런 값을 조용히 버리거나 짐작해서 매핑하면
-- 원장이 입력한 관찰 기록이 소리 없이 사라진다. 사람이 보고 정하게 남긴다.
-- ─────────────────────────────────────────────────────────────
do $$
declare
  unknown_count integer;
  sample text;
begin
  select count(*), min(value)
  into unknown_count, sample
  from public.trial_results tr
  cross join lateral unnest(tr.observations) as value
  where value not in (
    -- 새 code
    'sustained_engagement', 'active_participation', 'verbal_explanation',
    'independent_after_instruction', 'needs_some_guidance',
    'needs_repeated_guidance', 'ready_for_more_challenge',
    -- 문구를 저장하던 시절의 값
    '집중을 잘했어요', '적극적으로 참여했어요', '발표를 잘했어요', '이해가 빨랐어요',
    '도움이 조금 필요했어요', '난이도가 높아 보였어요', '난이도가 쉬워 보였어요'
  );

  if unknown_count <> 0 then
    raise exception
      'trial_results.observations 에 알 수 없는 값이 % 건 있습니다 (예: %). 매핑을 정한 뒤 다시 실행하세요.',
      unknown_count, sample;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. 문구 → code
--
-- 배열의 순서 자체에 의미는 없지만 입력한 순서를 그대로 둔다.
-- with ordinality 로 원래 위치를 유지한 채 다시 모은다. 빈 배열은 빈 배열로 남는다.
-- ─────────────────────────────────────────────────────────────
update public.trial_results tr
set observations = mapped.values
from (
  select
    tr2.id,
    coalesce(
      array_agg(
        case value
          when '집중을 잘했어요' then 'sustained_engagement'
          when '적극적으로 참여했어요' then 'active_participation'
          when '발표를 잘했어요' then 'verbal_explanation'
          when '이해가 빨랐어요' then 'independent_after_instruction'
          when '도움이 조금 필요했어요' then 'needs_some_guidance'
          when '난이도가 높아 보였어요' then 'needs_repeated_guidance'
          when '난이도가 쉬워 보였어요' then 'ready_for_more_challenge'
          else value
        end
        order by ordinality
      ),
      '{}'::text[]
    ) as values
  from public.trial_results tr2
  cross join lateral unnest(tr2.observations) with ordinality as u(value, ordinality)
  group by tr2.id
) as mapped
where tr.id = mapped.id;

-- ─────────────────────────────────────────────────────────────
-- 3. DB 도 같은 목록만 받는다
--
-- server validation 과 이중 방어다. 애플리케이션을 우회한 write 나
-- 앞으로 추가될 다른 경로가 목록 밖 값을 넣지 못하게 막는다.
-- ─────────────────────────────────────────────────────────────
alter table public.trial_results
  add constraint trial_results_observations_allowed_check
  check (
    observations <@ array[
      'sustained_engagement', 'active_participation', 'verbal_explanation',
      'independent_after_instruction', 'needs_some_guidance',
      'needs_repeated_guidance', 'ready_for_more_challenge'
    ]::text[]
  );

-- 선택지가 7개뿐이라 그보다 긴 배열은 중복이거나 조작이다.
alter table public.trial_results
  add constraint trial_results_observations_cardinality_check
  check (cardinality(observations) <= 7);

-- ─────────────────────────────────────────────────────────────
-- 4. 마지막으로 고친 사람
--
-- created_by 는 최초 저장자로 남기고, 수정자는 따로 기록한다.
-- 지금까지는 수정 이력이 없어 누가 언제 바꿨는지 복원할 수 없었다.
--
-- ⚠️ 둘 다 "실제 수업을 진행한 선생님" 이 아니다. 폼을 저장한 Studio 계정이다.
--    학부모 화면에 교사 이름으로 표시하면 안 된다.
-- ─────────────────────────────────────────────────────────────
alter table public.trial_results
  add column if not exists updated_by uuid
    references public.profiles(id)
    on delete set null;

comment on column public.trial_results.updated_by is
  '마지막으로 저장한 Studio 계정. 수업 진행자가 아니며 학부모에게 공개하지 않는다.';
