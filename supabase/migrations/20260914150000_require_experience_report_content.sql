-- 내용이 비어 있는 리포트를 발행하지 못하게 한다.
--
-- 관찰도 추천도 없는 체험 결과가 그대로 발행되면, 부모는 학생 이름과 날짜만 적힌
-- 문서를 받는다. Production 에 그런 Case 가 이미 한 건 있고 발행 버튼이 열려 있었다.
--
-- 관찰이 빈 배열인 것 자체는 여전히 유효한 snapshot 이다(R1 계약). 이번에 막는 것은
-- "snapshot 을 만들 수 있는가" 가 아니라 "공식 발행본으로 남길 내용이 있는가" 다.
-- 둘은 다른 질문이라 판정도 따로 둔다.
--
-- ⚠️ 20260914090000 은 이미 Production 에 적용됐다. 그 파일은 고치지 않는다.
--    아래 정의는 그 파일의 함수 본문을 그대로 가져와 검사 하나만 더한 것이다.
--    auth · org scope · parent_not_linked · completed · trial_results lock ·
--    stale revision · date required · canonical only · legacy reject ·
--    unknown reject · version 단조 증가 · published 최대 1개 — 전부 그대로다.

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
  if coalesce(jsonb_array_length(v_observations), 0) = 0
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

  insert into public.experience_reports (
    application_id, version, status, content_version, content, published_at, published_by
  )
  values (
    p_application_id, v_next_version, 'published', 1, v_content, v_now, v_actor
  )
  returning id into v_report_id;

  return jsonb_build_object(
    'id', v_report_id,
    'version', v_next_version,
    'supersededVersion', case when v_current.id is null then null else v_current.version end,
    'publishedAt', v_now
  );
end;
$$;


-- signature 가 같으므로 기존 권한이 유지되지만, 명시적으로 다시 고정한다.
revoke all on function public.publish_experience_report(uuid, timestamptz) from public;
revoke execute on function public.publish_experience_report(uuid, timestamptz) from anon;
grant execute on function public.publish_experience_report(uuid, timestamptz) to authenticated;
