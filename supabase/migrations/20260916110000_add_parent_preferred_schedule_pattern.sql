-- 학부모가 알려 주는 "가능한 시간" 을 날짜가 아니라 요일·시간대로 받는다.
--
-- ⚠️ 왜 바꾸는가.
--
--    지금은 희망 날짜를 YYYY-MM-DD 로 받고 있다. 그런데 학부모가 실제로 아는
--    것은 특정 하루가 아니라 "화요일 목요일 오후 4시 이후면 돼요" 같은 평소
--    가능한 패턴이다. 날짜 하나를 받으면 학원은 그날만 제안할 수 있고,
--    그날이 안 되면 대화가 거기서 끝난다.
--
-- ⚠️ 기존 preferred_date 는 지우지 않는다.
--
--    이미 Production 에 있는 column 이고, 값이 들어간 기록이 생기면 그건
--    그때 학부모가 실제로 적은 날짜다. 새 구조로 추측 변환하지 않는다 —
--    "9월 22일" 에서 요일을 뽑아 "월요일마다 가능" 이라고 적으면 그건
--    학부모가 한 적 없는 말이다. 새 UI 는 이 column 을 더 쓰지 않는다.

alter table public.parent_decisions
  add column if not exists preferred_days text[],
  add column if not exists preferred_start_time time,
  add column if not exists preferred_end_time time,
  add column if not exists preferred_time_mode text;

comment on column public.parent_decisions.preferred_days is
  '가능한 요일. mon~sun 소문자 3글자. 특정 날짜가 아니라 평소 패턴이다.';
comment on column public.parent_decisions.preferred_time_mode is
  'after(이 시간 이후) · exact(그 시간) · range(시작~종료). 종료 시각은 range 에만 있다.';
comment on column public.parent_decisions.preferred_date is
  '옛 방식으로 받은 희망 날짜. 새 화면은 쓰지 않는다 — 요일·시간대(preferred_days 외)를 쓴다. 과거 기록 보존용.';

-- 요일 값
--
-- CHECK 안에서는 subquery 를 쓸 수 없어서 판정을 immutable 함수로 옮긴다.
-- 이 함수는 인자만 보고 답한다 — 다른 표를 읽지 않으므로 immutable 이 맞다.
create or replace function public.is_valid_preferred_days(p_days text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_days is null
    or (
      array_length(p_days, 1) between 1 and 7
      and p_days <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]
      -- 같은 요일을 두 번 적지 않는다. 화면이 보낸 것을 그대로 믿지 않는다.
      and array_length(p_days, 1) = (select count(distinct d) from unnest(p_days) as d)
    );
$$;

alter table public.parent_decisions
  add constraint parent_decisions_preferred_days_check
  check (public.is_valid_preferred_days(preferred_days));

alter table public.parent_decisions
  add constraint parent_decisions_preferred_time_mode_check
  check (
    preferred_time_mode is null
    or preferred_time_mode in ('after', 'exact', 'range')
  );

-- ─────────────────────────────────────────────────────────────
-- 옛 제약을 새 구조에 맞게 바꾼다
--
-- 기존 두 제약은 "시간대가 이유면 preferred_date 가 있어야 한다" 를 말한다.
-- 이제 그 자리를 요일·시각이 대신하므로, 날짜를 요구하는 쪽을 내리고
-- 같은 뜻을 새 column 으로 다시 세운다.
--
-- ⚠️ 기존 migration 파일은 고치지 않는다(이미 적용됐다). 여기서 갈아 끼운다.
-- ─────────────────────────────────────────────────────────────
alter table public.parent_decisions
  drop constraint if exists parent_decisions_schedule_mismatch_requires_date_check;

alter table public.parent_decisions
  drop constraint if exists parent_decisions_preferred_schedule_scope_check;

-- 희망 일정은 시간대가 이유일 때만 의미가 있다.
-- preferred_date 도 같은 범위에 둔다 — 과거 기록은 이미 그 조건을 만족한다.
alter table public.parent_decisions
  add constraint parent_decisions_preferred_schedule_scope_check
  check (
    decline_reason = 'schedule_mismatch'
    or (
      preferred_date is null
      and preferred_days is null
      and preferred_start_time is null
      and preferred_end_time is null
      and preferred_time_mode is null
    )
  );

-- 시간 정보는 통째로 있거나 통째로 없다.
-- 요일만 있고 시각이 없으면 학원은 몇 시에 제안할지 알 수 없다.
alter table public.parent_decisions
  add constraint parent_decisions_preferred_pattern_completeness_check
  check (
    (preferred_days is null and preferred_start_time is null and preferred_time_mode is null)
    or (preferred_days is not null and preferred_start_time is not null and preferred_time_mode is not null)
  );

-- 종료 시각은 range 에만 있고, 시작보다 뒤여야 한다.
alter table public.parent_decisions
  add constraint parent_decisions_preferred_end_time_check
  check (
    (preferred_time_mode = 'range' and preferred_end_time is not null and preferred_end_time > preferred_start_time)
    or (preferred_time_mode is distinct from 'range' and preferred_end_time is null)
  );

-- ─────────────────────────────────────────────────────────────
-- 과거 기록은 새 column 도 고칠 수 없다
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
     or new.preferred_days is distinct from old.preferred_days
     or new.preferred_start_time is distinct from old.preferred_start_time
     or new.preferred_end_time is distinct from old.preferred_end_time
     or new.preferred_time_mode is distinct from old.preferred_time_mode
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
-- RPC — 요일·시각을 받는다
--
-- 공개 함수 구조는 그대로다. 구현만 internal 하나에 있고, bypass 인자를
-- 가진 함수는 여전히 아무에게도 열려 있지 않다(F1 최종 계약).
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_parent_decision_internal(
  p_application_id uuid,
  p_decision text,
  p_decline_reason text,
  p_preferred_days text[],
  p_preferred_start_time time,
  p_preferred_end_time time,
  p_preferred_time_mode text,
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
  v_days text[];
  v_start time;
  v_end time;
  v_mode text;
  v_inserted public.parent_decisions%rowtype;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if p_decision not in ('planned', 'considering', 'declined') then
    raise exception 'invalid_parent_decision';
  end if;

  if p_decision = 'declined' then
    v_reason := nullif(btrim(p_decline_reason), '');
    if v_reason is null and p_allow_missing_reason is not true then
      raise exception 'decline_reason_required'
        using detail = '등록하지 않는 이유를 선택해 주세요.';
    end if;

    if v_reason = 'schedule_mismatch' then
      -- 빈 배열과 null 을 같게 본다. 화면이 아무것도 고르지 않은 것과
      -- 필드를 안 보낸 것을 구분해 봐야 답이 같다.
      -- 요일 순서로 정렬한다. 알파벳순으로 두면 "목·화" 처럼 읽혀서
      -- 학부모가 고른 것과 화면에 뜨는 것이 달라 보인다.
      select array_agg(d order by array_position(
        array['mon','tue','wed','thu','fri','sat','sun']::text[], d
      ))
      into v_days
      from (
        select distinct btrim(dd) as d
        from unnest(coalesce(p_preferred_days, array[]::text[])) as dd
        where btrim(dd) <> ''
      ) cleaned;

      v_mode := nullif(btrim(p_preferred_time_mode), '');
      v_start := p_preferred_start_time;
      v_end := p_preferred_end_time;

      if v_days is null or array_length(v_days, 1) is null then
        raise exception 'preferred_days_required'
          using detail = '가능한 요일을 하나 이상 골라 주세요.';
      end if;

      if v_start is null then
        raise exception 'preferred_time_required'
          using detail = '가능한 시간을 알려 주세요.';
      end if;

      if v_mode is null or v_mode not in ('after', 'exact', 'range') then
        raise exception 'preferred_time_mode_required'
          using detail = '가능한 시간 조건을 골라 주세요.';
      end if;

      if v_mode = 'range' then
        if v_end is null then
          raise exception 'preferred_end_time_required'
            using detail = '가능한 시간의 끝 시각을 알려 주세요.';
        end if;
        if v_end <= v_start then
          raise exception 'preferred_end_time_invalid'
            using detail = '끝 시각은 시작 시각보다 뒤여야 해요.';
        end if;
      else
        -- after · exact 에는 끝 시각이 없다. 보내와도 버린다.
        v_end := null;
      end if;
    else
      v_days := null;
      v_start := null;
      v_end := null;
      v_mode := null;
    end if;
  else
    v_reason := null;
    v_days := null;
    v_start := null;
    v_end := null;
    v_mode := null;
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

  -- 같은 사람이 같은 것을 같은 말로 다시 고르면 기록을 늘리지 않는다.
  if found
     and v_current.parent_id = v_actor
     and v_current.decision = p_decision
     and v_current.decline_reason is not distinct from v_reason
     and v_current.preferred_days is not distinct from v_days
     and v_current.preferred_start_time is not distinct from v_start
     and v_current.preferred_end_time is not distinct from v_end
     and v_current.preferred_time_mode is not distinct from v_mode
  then
    return jsonb_build_object(
      'id', v_current.id,
      'changed', false,
      'decision', v_current.decision,
      'declineReason', v_current.decline_reason,
      'preferredDays', v_current.preferred_days,
      'preferredStartTime', v_current.preferred_start_time,
      'preferredEndTime', v_current.preferred_end_time,
      'preferredTimeMode', v_current.preferred_time_mode,
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
    decline_reason, preferred_days, preferred_start_time, preferred_end_time, preferred_time_mode
  )
  values (
    p_application_id, v_actor, p_decision, v_now,
    v_reason, v_days, v_start, v_end, v_mode
  )
  returning * into v_inserted;

  return jsonb_build_object(
    'id', v_inserted.id,
    'changed', true,
    'decision', v_inserted.decision,
    'declineReason', v_inserted.decline_reason,
    'preferredDays', v_inserted.preferred_days,
    'preferredStartTime', v_inserted.preferred_start_time,
    'preferredEndTime', v_inserted.preferred_end_time,
    'preferredTimeMode', v_inserted.preferred_time_mode,
    'createdAt', v_inserted.created_at
  );
end;
$$;

revoke all on function public.set_parent_decision_internal(uuid, text, text, text[], time, time, text, boolean) from public;
revoke all on function public.set_parent_decision_internal(uuid, text, text, text[], time, time, text, boolean) from anon;
revoke all on function public.set_parent_decision_internal(uuid, text, text, text[], time, time, text, boolean) from authenticated;

-- ─── 공개 함수 A: 새 코드용 ───
create or replace function public.set_parent_decision(
  p_application_id uuid,
  p_decision text,
  p_decline_reason text,
  p_preferred_days text[],
  p_preferred_start_time time,
  p_preferred_end_time time,
  p_preferred_time_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.set_parent_decision_internal(
    p_application_id, p_decision, p_decline_reason,
    p_preferred_days, p_preferred_start_time, p_preferred_end_time, p_preferred_time_mode,
    false
  );
end;
$$;

revoke all on function public.set_parent_decision(uuid, text, text, text[], time, time, text) from public;
revoke all on function public.set_parent_decision(uuid, text, text, text[], time, time, text) from anon;
grant execute on function public.set_parent_decision(uuid, text, text, text[], time, time, text) to authenticated;

-- ─── 옛 5-arg(date 기반) 은 새 구현으로 넘긴다 ───
--
-- 배포 전환 동안 구 코드가 이 시그니처를 부른다. 날짜는 더 이상 저장하지
-- 않는다 — 요일 패턴으로 추측 변환하지 않기 위해서다. 그래서 그 호출은
-- 시간대 이유를 완성하지 못하고 preferred_days_required 로 되돌아간다.
--
-- ⚠️ 구 UI 에서 "시간대가 맞지 않아요" 만 저장되지 않는다. 나머지 이유와
--    planned · considering · declined 는 그대로 동작한다. 전환 구간이 짧고,
--    잘못된 날짜를 남기는 것보다 저장되지 않는 편이 낫다.
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
    p_application_id, p_decision, p_decline_reason, null, null, null, null, false
  );
end;
$$;

-- ─── 공개 함수 B: 구 2-arg ───
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
    p_application_id, p_decision, null, null, null, null, null, true
  );
end;
$$;

-- 옛 6-arg internal 은 더 이상 쓰이지 않는다. 남겨 두면 인자를 가진 함수가
-- 하나 더 존재하게 되므로 지운다.
drop function if exists public.set_parent_decision_internal(uuid, text, text, date, text, boolean);
