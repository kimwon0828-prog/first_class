-- 파일럿 피드백 F1 — 학부모 후속 정보와 공개용 총평.
--
-- 두 가지를 더한다.
--   1) 학부모가 "이번에는 등록하지 않을게요" 를 고를 때 그 이유와 희망 일정
--   2) 학원이 부모에게 공개하려고 적는 총평
--
-- ⚠️ 네 개의 사실을 서로 섞지 않는다.
--
--    ParentDecision              부모의 현재 생각            parent_decisions.decision
--    Parent declined reason      부모가 직접 남긴 이유        parent_decisions.decline_reason  ← 새로 추가
--    RegistrationResult          학원이 확정한 실제 결과      registration_results.result
--    Academy unregistered reason 학원이 적는 미등록 사유      trial_applications.unregistered_reason
--
--    이름이 비슷하다고 같은 값이 아니다. 부모가 "비용이 고민돼요" 라고 적은 것과
--    학원이 "cost_burden" 으로 분류한 것은 다른 사람이 다른 시점에 남긴 다른 사실이다.
--    서로 복사하거나 덮어쓰지 않고, 같은 column 에 합치지도 않는다.

-- ─────────────────────────────────────────────────────────────
-- 1. 부모가 남기는 이유와 희망 일정
--
-- decision 을 쪼개지 않는다. declined 는 그대로 declined 다 —
-- 이유는 그 선택에 딸린 부가 정보이지 다른 선택이 아니다.
-- ─────────────────────────────────────────────────────────────
alter table public.parent_decisions
  add column if not exists decline_reason text,
  add column if not exists preferred_date date,
  add column if not exists preferred_time_note text;

comment on column public.parent_decisions.decline_reason is
  '부모가 직접 고른 이유. 학원이 적는 trial_applications.unregistered_reason 과 다른 값이며 서로 변환하지 않는다.';
comment on column public.parent_decisions.preferred_date is
  '시간대가 맞지 않아 등록하지 않는 경우의 희망 날짜. 학원이 다음 기회를 제안할 때 쓰는 부모의 말이다.';

alter table public.parent_decisions
  add constraint parent_decisions_decline_reason_check
  check (
    decline_reason is null
    or decline_reason in (
      'schedule_mismatch',
      'price',
      'distance',
      'child_preference',
      'class_mismatch',
      'chose_another',
      'other'
    )
  );

-- 이유는 "등록하지 않겠다" 를 고른 경우에만 존재한다.
-- 다른 선택에 이유가 붙어 있으면 그건 옮겨 온 값이거나 지우다 만 값이다.
--
-- ⚠️ "declined 면 이유가 반드시 있다" 는 여기서 강제하지 않는다.
--
--    이 기능이 생기기 전에 남겨진 declined 기록이 이미 있다. 그때는 이유를
--    물어본 적이 없으니 비어 있는 것이 맞다 — 위반이 아니라 사실이다.
--    그걸 제약으로 막으면 둘 중 하나를 해야 한다: migration 을 실패시키거나,
--    없던 이유를 지어내 backfill 하거나. 둘 다 과거를 다시 쓰는 일이다.
--
--    앞으로 들어오는 declined 에는 이유가 필요하다. 그 판정은 set_parent_decision
--    안에 있다(decline_reason_required). 새 기록은 거기를 지나야만 생긴다.
alter table public.parent_decisions
  add constraint parent_decisions_decline_reason_scope_check
  check (
    decision = 'declined'
    or decline_reason is null
  );

-- 희망 일정은 시간대가 이유일 때만 의미가 있다.
alter table public.parent_decisions
  add constraint parent_decisions_preferred_schedule_scope_check
  check (
    decline_reason = 'schedule_mismatch'
    or (preferred_date is null and preferred_time_note is null)
  );

-- 시간대를 이유로 골랐으면 언제가 좋은지는 있어야 한다.
-- 그게 없으면 학원이 할 수 있는 일이 없어서, 이유만 남고 대화가 끊긴다.
alter table public.parent_decisions
  add constraint parent_decisions_schedule_mismatch_requires_date_check
  check (
    decline_reason is distinct from 'schedule_mismatch'
    or preferred_date is not null
  );

-- ─────────────────────────────────────────────────────────────
-- 2. 과거 기록은 여전히 고칠 수 없다
--
-- 새 column 도 같은 규칙이다. 이유와 희망 일정은 그 선택을 할 때의 말이고,
-- 나중에 고치면 그때 그렇게 말했던 것처럼 된다. 생각이 바뀌면 새 row 가 생긴다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.reject_parent_decision_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.application_id is distinct from old.application_id
     or new.parent_id is distinct from old.parent_id
     or new.decision is distinct from old.decision
     or new.created_at is distinct from old.created_at
     or new.decline_reason is distinct from old.decline_reason
     or new.preferred_date is distinct from old.preferred_date
     or new.preferred_time_note is distinct from old.preferred_time_note
  then
    raise exception 'parent_decision_is_immutable'
      using detail = '지난 선택은 고칠 수 없습니다. 새로 선택하면 기록이 이어집니다.';
  end if;

  if old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at then
    raise exception 'parent_decision_is_immutable'
      using detail = '지난 선택의 기록은 고칠 수 없습니다.';
  end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. 선택을 남기는 RPC
--
-- 공개 함수는 둘이다.
--   set_parent_decision(uuid, text, text, date, text)   새 코드용. 이유 필수.
--   set_parent_decision(uuid, text)                      구 코드용. 이유 없이 허용.
--
-- 구현은 아래 internal 하나에 있고, 두 공개 함수가 각각 다른 값으로 부른다.
--
-- ⚠️ 왜 나눴는가.
--
--    "이유 없이 허용" 을 공개 함수의 인자로 두면, 학부모가 그 함수를 직접
--    불러 그 값을 true 로 넘길 수 있다. 화면이 무엇을 쓰는지는 경계가 아니다 —
--    PostgREST 는 grant 된 함수를 누구에게나 그대로 열어 준다.
--    그래서 그 인자를 가진 함수는 authenticated 에게 주지 않는다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_parent_decision_internal(
  p_application_id uuid,
  p_decision text,
  p_decline_reason text,
  p_preferred_date date,
  p_preferred_time_note text,
  -- 구 2-arg 경로에서만 true 다. 호출자가 정할 수 없다 —
  -- 이 함수 자체가 authenticated 에게 열려 있지 않다.
  p_allow_missing_reason boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_app public.trial_applications%rowtype;
  v_current public.parent_decisions%rowtype;
  v_now timestamptz := now();
  v_reason text;
  v_preferred_date date;
  v_preferred_time_note text;
  v_inserted public.parent_decisions%rowtype;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if p_decision not in ('planned', 'considering', 'declined') then
    raise exception 'invalid_parent_decision';
  end if;

  -- 값 정리는 여기서 한 번만 한다. 화면이 비운 것과 안 보낸 것을 구분하지 않게.
  if p_decision = 'declined' then
    v_reason := nullif(btrim(p_decline_reason), '');
    if v_reason is null and p_allow_missing_reason is not true then
      raise exception 'decline_reason_required'
        using detail = '등록하지 않는 이유를 선택해 주세요.';
    end if;

    if v_reason = 'schedule_mismatch' then
      v_preferred_date := p_preferred_date;
      v_preferred_time_note := nullif(btrim(p_preferred_time_note), '');
      if v_preferred_date is null then
        raise exception 'preferred_date_required'
          using detail = '가능한 날짜를 알려 주시면 학원이 다음 일정을 제안할 수 있어요.';
      end if;
    else
      v_preferred_date := null;
      v_preferred_time_note := null;
    end if;
  else
    -- 다른 선택에는 이유가 붙지 않는다. 호출자가 보내도 버린다.
    v_reason := null;
    v_preferred_date := null;
    v_preferred_time_note := null;
  end if;

  select ta.* into v_app
  from public.trial_applications ta
  where ta.id = p_application_id
    and ta.parent_id = v_actor
  for update of ta;

  if not found then
    raise exception 'application_not_found_or_forbidden';
  end if;

  if v_app.status <> 'completed' then
    raise exception 'application_not_completed';
  end if;

  select pd.* into v_current
  from public.parent_decisions pd
  where pd.application_id = p_application_id
    and pd.superseded_at is null
  for update;

  -- 같은 사람이 같은 것을 다시 고르면 기록을 늘리지 않는다.
  -- 이유나 희망 일정이 달라졌으면 그건 다른 말이라 새 기록이다.
  if found
     and v_current.parent_id = v_actor
     and v_current.decision = p_decision
     and v_current.decline_reason is not distinct from v_reason
     and v_current.preferred_date is not distinct from v_preferred_date
     and v_current.preferred_time_note is not distinct from v_preferred_time_note
  then
    return jsonb_build_object(
      'id', v_current.id,
      'changed', false,
      'decision', v_current.decision,
      'declineReason', v_current.decline_reason,
      'preferredDate', v_current.preferred_date,
      'preferredTimeNote', v_current.preferred_time_note,
      'createdAt', v_current.created_at
    );
  end if;

  if found then
    update public.parent_decisions
    set superseded_at = v_now
    where id = v_current.id;
  end if;

  insert into public.parent_decisions (
    application_id, parent_id, decision, created_at,
    decline_reason, preferred_date, preferred_time_note
  )
  values (
    p_application_id, v_actor, p_decision, v_now,
    v_reason, v_preferred_date, v_preferred_time_note
  )
  returning * into v_inserted;

  return jsonb_build_object(
    'id', v_inserted.id,
    'changed', true,
    'decision', v_inserted.decision,
    'declineReason', v_inserted.decline_reason,
    'preferredDate', v_inserted.preferred_date,
    'preferredTimeNote', v_inserted.preferred_time_note,
    'createdAt', v_inserted.created_at
  );
end;
$$;

-- internal 은 아무에게도 주지 않는다.
--
-- 아래 두 wrapper 는 security definer 라 소유자(postgres) 권한으로 돌고,
-- 소유자는 이 함수를 부를 수 있다. 학부모 · 학원 · 미인증 어느 쪽도
-- 직접 부를 수 없으므로 bypass flag 를 밖에서 정할 방법이 없다.
revoke all on function public.set_parent_decision_internal(uuid, text, text, date, text, boolean) from public;
revoke all on function public.set_parent_decision_internal(uuid, text, text, date, text, boolean) from anon;
revoke all on function public.set_parent_decision_internal(uuid, text, text, date, text, boolean) from authenticated;

-- ─── 공개 함수 A: 새 코드용. 이유는 항상 필수다. ───
--
-- allow_missing_reason 을 인자로 받지 않는다. 받으면 호출자가 정할 수 있게 된다.
create or replace function public.set_parent_decision(
  p_application_id uuid,
  p_decision text,
  p_decline_reason text,
  p_preferred_date date,
  p_preferred_time_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.set_parent_decision_internal(
    p_application_id, p_decision, p_decline_reason, p_preferred_date, p_preferred_time_note, false
  );
end;
$$;

revoke all on function public.set_parent_decision(uuid, text, text, date, text) from public;
revoke all on function public.set_parent_decision(uuid, text, text, date, text) from anon;
grant execute on function public.set_parent_decision(uuid, text, text, date, text) to authenticated;

-- ─── 공개 함수 B: 구 코드용. ───
--
-- migration 이 먼저 적용되고 코드가 뒤따르는 사이, 구 화면은 이유를 물을
-- 방법이 없는 채로 declined 를 보낸다. 그때 저장이 실패하면 학부모는
-- "등록하지 않겠다" 를 남길 수 없게 된다 — 기능을 더하다가 있던 기능을 끄는 셈이다.
--
-- 이유는 null 로 남는다. 이 기능이 생기기 전 기록과 같은 모양이고,
-- 그건 사실이지 결함이 아니다. 없는 이유를 지어내 채우지 않는다.
--
-- ⚠️ 이 함수는 이유를 인자로 받지 못한다. 그래서 여기로 들어온 declined 에만
--    null 이 허용되고, 새 코드가 쓰는 위 함수는 영향을 받지 않는다.
create or replace function public.set_parent_decision(
  p_application_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.set_parent_decision_internal(
    p_application_id, p_decision, null, null, null, true
  );
end;
$$;

revoke all on function public.set_parent_decision(uuid, text) from public;
revoke all on function public.set_parent_decision(uuid, text) from anon;
grant execute on function public.set_parent_decision(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. 공개용 총평
--
-- ⚠️ 기존 note 를 재사용하지 않는다.
--
--    trial_results.note 는 학원 내부 메모다. 부모에게 보일 것을 전제로 적히지
--    않았고, 지금까지 그렇게 약속해 왔다. 그 칸을 공개로 돌리면 이미 적어 둔
--    말이 본인도 모르게 밖으로 나간다. 공개할 글은 공개할 자리에 새로 적는다.
-- ─────────────────────────────────────────────────────────────
alter table public.trial_results
  add column if not exists public_summary text;

comment on column public.trial_results.public_summary is
  '부모에게 공개하려고 적는 총평. 내부 메모(note)와 다른 칸이며 서로 옮기지 않는다.';

-- ─────────────────────────────────────────────────────────────
-- 5. 발행 snapshot V2
--
-- 총평이 들어간 새 모양이다. content_version 2 로 적는다.
--
-- ⚠️ 이미 발행된 V1 을 고치지 않는다.
--
--    부모가 읽은 문서가 나중에 바뀌면 그건 같은 version 의 다른 글이 된다.
--    V1 은 V1 인 채로 남고, 앞으로 발행되는 것만 V2 다. backfill 도 하지 않는다.
--
-- 함수 본문은 20260914150000 의 것을 그대로 가져와 세 곳만 바꿨다.
--   · content 에 summary 추가
--   · 발행 가능 판정에 summary 포함
--   · content_version 1 → 2
-- ─────────────────────────────────────────────────────────────
create or replace function public.publish_experience_report(
  p_application_id uuid,
  -- 원장이 Preview 에서 확인한 Assessment 의 시각.
  --
  -- 이 값을 받지 않으면 "확인한 내용" 과 "발행되는 내용" 이 달라질 수 있다.
  -- Preview 를 열어 둔 사이 다른 Studio 계정이 관찰을 고치면, 원장은 본 적 없는
  -- 내용을 부모에게 보내게 된다. 본 것과 보내는 것이 같은지 여기서 확인한다.
  p_expected_assessment_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- 상태는 잠근 row 기준이다. 호출자가 먼저 읽은 값을 쓰지 않는다.
  if v_app.status <> 'completed' then
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
$$;
