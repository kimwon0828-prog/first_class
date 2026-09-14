-- 수업 관찰 항목을 표시 문구가 아니라 stable code 로 저장한다.
--
-- 문구는 앞으로 바뀐다 — Report 공개, 표현 개선, 다국어. 표시 문구를 그대로
-- 저장해 두면 문구를 고치는 순간 과거 데이터의 의미가 끊긴다.
--
-- ⚠️ 이 migration 은 기존 데이터를 새 code 로 바꾸지 않는다.
--    한때 문구 → code UPDATE 가 들어 있었으나 걷어냈다. 매핑 중 일부가
--    의미 동등이 아니었다 — "난이도가 높아 보였어요" 는 관찰자의 인상이고
--    needs_repeated_guidance 는 아이가 실제로 한 일이다. "이해가 빨랐어요" 와
--    independent_after_instruction 도 같은 사실이 아니다.
--    migration 이 과거에 없던 행동을 새로 주장하면 안 된다.
--    과거 기록은 작성 당시 원문 그대로 둔다.
--
-- 이 migration 은 앞으로의 저장 형식만 고정한다. 기존 체험 결과가 학부모에게
-- 공개되지 않고, Report 가 만들어지지도 않는다.

-- ─────────────────────────────────────────────────────────────
-- 1. 알 수 없는 값이 있으면 멈춘다
--
-- server action 이 whitelist 를 강제하지 않던 시기가 있어, 목록 밖 문자열이
-- 들어가 있을 수 있다. 그런 값을 조용히 버리거나 짐작해서 매핑하면
-- 원장이 입력한 관찰 기록이 소리 없이 사라진다. 사람이 보고 정하게 남긴다.
--
-- 여기서 "아는 값" 은 새 code 7개 + 문구를 저장하던 시절의 값 7개다.
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
      'trial_results.observations 에 알 수 없는 값이 % 건 있습니다 (예: %). 처리 방법을 정한 뒤 다시 실행하세요.',
      unknown_count, sample;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────
-- 1-2. 한 row 안에 두 표기가 섞여 있으면 멈춘다
--
-- 아래 CHECK 가 섞인 배열을 거절하므로, 그런 row 가 남아 있으면 constraint 를
-- 거는 순간 읽기 어려운 메시지로 실패한다. 먼저 사람이 읽을 수 있는 말로 멈춘다.
--
-- 섞인 row 는 "옛 기록 일부만 새 기준으로 옮겨 적은" 상태다. 기계가 나머지를
-- 짐작해 채울 수 없다 — 옛 문구와 새 code 는 의미가 같지 않기 때문이다.
-- Production 사전 조회 결과 0 건이다.
-- ─────────────────────────────────────────────────────────────
do $$
declare
  mixed_count integer;
  -- uuid 에는 min() 이 없다. 예시 하나만 보여 주면 되므로 text 로 받는다.
  sample text;
begin
  select count(*), min(tr.id::text)
  into mixed_count, sample
  from public.trial_results tr
  where exists (
    select 1 from unnest(tr.observations) as value
    where value in (
      'sustained_engagement', 'active_participation', 'verbal_explanation',
      'independent_after_instruction', 'needs_some_guidance',
      'needs_repeated_guidance', 'ready_for_more_challenge'
    )
  )
  and exists (
    select 1 from unnest(tr.observations) as value
    where value in (
      '집중을 잘했어요', '적극적으로 참여했어요', '발표를 잘했어요', '이해가 빨랐어요',
      '도움이 조금 필요했어요', '난이도가 높아 보였어요', '난이도가 쉬워 보였어요'
    )
  );

  if mixed_count <> 0 then
    raise exception
      'trial_results.observations 에 옛 문구와 새 code 가 섞인 row 가 % 건 있습니다 (예: %). 한 row 는 한 표기만 쓸 수 있습니다. 사람이 현재 기준으로 다시 확인한 뒤 실행하세요.',
      mixed_count, sample;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. DB 도 같은 목록만 받는다
--
-- server validation 과 이중 방어다. 애플리케이션을 우회한 write 나
-- 앞으로 추가될 다른 경로가 목록 밖 값을 넣지 못하게 막는다.
--
-- ⚠️ 이 허용 목록은 영구 contract 가 아니라 transition 용이다.
--    - 새 code 7개  : 앞으로의 write 가 쓰는 값. 영구 contract.
--    - 옛 문구 7개  : 이미 저장돼 있는 값. 읽기·보존 전용이다.
--
--    server 는 새 write 에서 옛 문구를 거절한다. 옛 문구가 여기 남아 있는 이유는
--    기존 row 가 valid 로 남아야 하고, 관찰 항목을 건드리지 않은 수정 저장이
--    기존 배열을 그대로 다시 쓰기 때문이다.
--
--    ⚠️ 두 목록의 합집합이 아니다. 한 row 는 둘 중 한쪽에만 속해야 한다.
--       transitional storage permits legacy-only or canonical-only arrays;
--       mixed representation is prohibited.
--
--       섞인 배열을 허용하면 "이 관찰은 어느 기준으로 적힌 것인가" 에 답할 수
--       없는 row 가 생긴다. Report 는 canonical 만 공개 후보로 삼는데, 섞인
--       row 에서는 공개 가능한 절반만 발행되어 학부모가 본 기록이 실제 관찰의
--       일부라는 사실이 드러나지 않는다. 같은 이유로 화면도 한쪽을 골라
--       보여 주지 않고 두 영역을 나눠 보여 준다.
--
--       허용:  {} · {legacy, legacy} · {canonical, canonical}
--       금지:  {legacy, canonical}
--
--    남은 legacy row 를 사람이 현재 기준으로 다시 확인한 뒤에는, 옛 문구 쪽
--    가지를 통째로 빼는 migration 을 따로 추가한다.
-- ─────────────────────────────────────────────────────────────
alter table public.trial_results
  add constraint trial_results_observations_allowed_check
  check (
    -- 새 code 전용 — 신규 write 가 쓰는 값
    observations <@ array[
      'sustained_engagement', 'active_participation', 'verbal_explanation',
      'independent_after_instruction', 'needs_some_guidance',
      'needs_repeated_guidance', 'ready_for_more_challenge'
    ]::text[]
    or
    -- 옛 문구 전용 — 기존 row 보존 전용(transitional)
    observations <@ array[
      '집중을 잘했어요', '적극적으로 참여했어요', '발표를 잘했어요', '이해가 빨랐어요',
      '도움이 조금 필요했어요', '난이도가 높아 보였어요', '난이도가 쉬워 보였어요'
    ]::text[]
    -- 빈 배열은 양쪽 모두에 대해 참이라 그대로 허용된다.
  );

comment on constraint trial_results_observations_allowed_check on public.trial_results is
  'transitional. legacy-only 또는 canonical-only 배열만 허용하고 두 표기를 섞은 배열은 금지한다. 옛 문구는 기존 row 보존 전용이며 신규 write 는 server 에서 거절한다.';

-- 한 row 가 고를 수 있는 관찰은 7개뿐이다. 옛 문구와 새 code 는 같은 축의
-- 서로 다른 표기라 함께 세지 않는다 — 그보다 긴 배열은 중복이거나 조작이다.
alter table public.trial_results
  add constraint trial_results_observations_cardinality_check
  check (cardinality(observations) <= 7);

-- ─────────────────────────────────────────────────────────────
-- 3. 마지막으로 고친 사람
--
-- created_by 는 최초 저장자로 남기고, 수정자는 따로 기록한다.
-- 지금까지는 수정 이력이 없어 누가 언제 바꿨는지 복원할 수 없었다.
--
-- 기존 row 는 null 이다. 과거의 수정자를 지금 와서 지어내지 않는다.
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
