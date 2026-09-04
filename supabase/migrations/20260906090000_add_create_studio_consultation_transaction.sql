-- 상담 생성 1회를 하나의 transaction 으로 묶는다.
--
-- 이전에는 server action 이 세 번의 개별 mutation 을 순서대로 호출했다.
--   W1 trial_applications  등록 결과 UPDATE (+ application_logs INSERT)
--   W2 consultation_logs   INSERT
--   W3 trial_applications  상담 스냅샷 UPDATE
-- 사이에서 실패하면 "등록은 됐는데 상담 이력이 없는" Case 가 남고,
-- 종결 guard 때문에 재시도도 막혀 원장이 스스로 복구할 수 없었다(CONSULT-6.1 재현).
--
-- 이 함수는 SECURITY INVOKER 다. 호출자의 RLS 를 그대로 통과해야 하므로
-- 다른 조직의 신청은 애초에 lock 대상 조회에서 걸러진다. 그래도 organization
-- 스코프를 함수 안에서 다시 확인한다 — action 의 사전 검사에 의존하지 않는다.
--
-- 순서가 중요하다. submissionId 중복 확인이 종결 guard 보다 먼저다.
-- 첫 저장이 commit 됐는데 응답만 유실된 뒤의 재시도는 "종결된 신청" 오류가 아니라
-- duplicate 로 판정되어야 한다.

create or replace function public.create_studio_consultation(
  p_submission_id uuid,
  p_application_id uuid,
  p_occurred_at timestamptz,
  p_channel text,
  p_sentiment text,
  p_note text,
  p_registration_status text,
  p_unregistered_reason text,
  p_unregistered_reason_note text,
  p_next_action text,
  p_next_contact_at timestamptz,
  p_preference_provided boolean,
  p_preference jsonb,
  p_preference_note text,
  p_outcome_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_app public.trial_applications%rowtype;
  v_existing_application_id uuid;
  v_now timestamptz := now();
  v_outcome_changed boolean;
  v_registration_status text;
  v_reason text;
  v_reason_note text;
  v_enrolled_at timestamptz;
  v_lost_at timestamptz;
  v_preference jsonb;
  v_preference_note text;
  v_preference_updated_at timestamptz;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  -- 호출자의 조직은 파라미터로 받지 않는다. profiles 에서 직접 읽는다.
  -- app.current_org_id() 를 쓰지 않는 이유는 authenticated 에 app schema USAGE 가
  -- 없어서다(RLS 정책 안에서만 평가된다). 새 권한을 열지 않고 같은 값을 얻는다.
  select p.organization_id, p.role
  into v_org, v_role
  from public.profiles p
  where p.id = v_actor;

  -- role 매핑은 normalizeProfileRole 과 같다: academy | admin 이 Studio 계정이다.
  if v_org is null or v_role is null or v_role not in ('academy', 'admin') then
    raise exception 'application_not_found_or_forbidden';
  end if;

  -- 대상 신청을 transaction 안에서 잠근다. 동시 저장 두 건이 같은 stale 상태를
  -- 보고 각자 성공하던 race 를 여기서 닫는다.
  select ta.*
  into v_app
  from public.trial_applications ta
  join public.classes c on c.id = ta.class_id
  where ta.id = p_application_id
    and c.organization_id = v_org
  for update of ta;

  if not found then
    raise exception 'application_not_found_or_forbidden';
  end if;

  -- 멱등 확인이 상태 guard 보다 먼저다(위 주석 참고).
  select cl.application_id
  into v_existing_application_id
  from public.consultation_logs cl
  where cl.id = p_submission_id;

  if found then
    if v_existing_application_id is distinct from p_application_id then
      raise exception 'consultation_submission_conflict';
    end if;

    return jsonb_build_object(
      'mode', 'duplicate',
      'outcomeUpdated', false,
      'enrollmentTransition', false,
      'registrationStatus', v_app.registration_status
    );
  end if;

  -- 상태 판정은 잠근 row 기준이다. 호출자가 먼저 읽은 값은 쓰지 않는다.
  if v_app.status <> 'completed' then
    raise exception 'application_not_completed';
  end if;

  if v_app.registration_status in ('enrolled', 'not_enrolled') then
    raise exception 'application_registration_terminal';
  end if;

  v_reason := case when p_registration_status = 'not_enrolled' then p_unregistered_reason else null end;
  v_reason_note := case
    when p_registration_status = 'not_enrolled' and p_unregistered_reason = 'other'
      then p_unregistered_reason_note
    else null
  end;

  v_outcome_changed :=
    v_app.registration_status is distinct from p_registration_status
    or v_app.unregistered_reason is distinct from v_reason
    or v_app.unregistered_reason_note is distinct from v_reason_note;

  if v_outcome_changed then
    v_registration_status := p_registration_status;
    v_enrolled_at := case when p_registration_status = 'enrolled' then v_now else null end;
    -- 이미 미등록이던 Case 를 다시 미등록으로 저장하면 최초 이탈 시각을 유지한다.
    v_lost_at := case
      when p_registration_status = 'not_enrolled'
        then case when v_app.registration_status = 'not_enrolled' then v_app.lost_at else v_now end
      else null
    end;
  else
    v_registration_status := v_app.registration_status;
    v_reason := v_app.unregistered_reason;
    v_reason_note := v_app.unregistered_reason_note;
    v_enrolled_at := v_app.enrolled_at;
    v_lost_at := v_app.lost_at;
  end if;

  -- 희망 일정: "미전달"과 "명시적 값"은 다른 사실이다.
  -- 미전달이면 Case 값을 그대로 두고, 이번 상담 스냅샷에 현재 값을 복사한다.
  if p_preference_provided then
    v_preference := p_preference;
    v_preference_note := p_preference_note;
    -- updated_at 은 호출자가 넘긴 flag 가 아니라 여기서 직접 비교해 정한다.
    -- 저장된 JSON 은 canonical 값이라 jsonb 비교로 충분하다.
    v_preference_updated_at := case
      when v_app.regular_schedule_preference is distinct from p_preference
        or v_app.regular_schedule_preference_note is distinct from p_preference_note
        then v_now
      else v_app.regular_schedule_preference_updated_at
    end;
  else
    v_preference := v_app.regular_schedule_preference;
    v_preference_note := v_app.regular_schedule_preference_note;
    v_preference_updated_at := v_app.regular_schedule_preference_updated_at;
  end if;

  -- 등록 결과와 상담 스냅샷을 한 번의 UPDATE 로 쓴다.
  -- updated_at 은 set_trial_applications_updated_at 트리거가 정한다.
  update public.trial_applications
  set registration_status = v_registration_status,
      enrolled_at = v_enrolled_at,
      lost_at = v_lost_at,
      unregistered_reason = v_reason,
      unregistered_reason_note = v_reason_note,
      next_contact_at = p_next_contact_at,
      last_activity_at = p_occurred_at,
      regular_schedule_preference = v_preference,
      regular_schedule_preference_note = v_preference_note,
      regular_schedule_preference_updated_at = v_preference_updated_at
  where id = p_application_id;

  insert into public.consultation_logs (
    id,
    application_id,
    occurred_at,
    activity_type,
    channel,
    sentiment,
    registration_status_snapshot,
    regular_schedule_preference_snapshot,
    regular_schedule_preference_note_snapshot,
    unregistered_reason_snapshot,
    unregistered_reason_note_snapshot,
    next_action,
    next_contact_at,
    note,
    created_by
  )
  values (
    p_submission_id,
    p_application_id,
    p_occurred_at,
    'CONSULTATION',
    p_channel,
    p_sentiment,
    p_registration_status,
    v_preference,
    v_preference_note,
    case when p_registration_status = 'not_enrolled' then p_unregistered_reason else null end,
    case
      when p_registration_status = 'not_enrolled' and p_unregistered_reason = 'other'
        then p_unregistered_reason_note
      else null
    end,
    p_next_action,
    p_next_contact_at,
    p_note,
    v_actor
  );

  -- 감사 이력도 같은 transaction 이다. 저장이 rollback 되면 로그도 남지 않는다.
  if v_outcome_changed then
    insert into public.application_logs (application_id, from_status, to_status, actor_id, note)
    values (p_application_id, v_app.status, v_app.status, v_actor, p_outcome_note);
  end if;

  return jsonb_build_object(
    'mode', 'created',
    'outcomeUpdated', v_outcome_changed,
    'enrollmentTransition', v_outcome_changed and p_registration_status = 'enrolled',
    'registrationStatus', v_registration_status
  );
end;
$$;

revoke all on function public.create_studio_consultation(
  uuid, uuid, timestamptz, text, text, text, text, text, text, text, timestamptz, boolean, jsonb, text, text
) from public;

grant execute on function public.create_studio_consultation(
  uuid, uuid, timestamptz, text, text, text, text, text, text, text, timestamptz, boolean, jsonb, text, text
) to authenticated;
