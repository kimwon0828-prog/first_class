-- 부모에게 발행한 체험 리포트를 별도의 불변 artifact 로 남긴다.
--
-- trial_results 는 mutable source 다. 학원이 언제든 고칠 수 있고, 고쳐야 한다.
-- 그런데 부모가 이미 본 리포트가 그 수정에 따라 같이 바뀌면 안 된다 —
-- "우리 아이가 도움이 필요했다고 적혀 있었는데 지금 보니 없다" 가 되어서는 안 된다.
--
-- 그래서 발행 시점의 내용을 통째로 얼려 둔다. source 가 바뀌면 새 version 을
-- 발행하고, 이전 version 은 superseded 로 남는다. 철회는 삭제가 아니다.
--
-- draft 를 두지 않는다. trial_results 가 이미 draft 역할을 한다. 이 표에는
-- "실제로 발행된 적이 있는 것" 만 들어온다.

-- ─────────────────────────────────────────────────────────────
-- 1. 발행 artifact
-- ─────────────────────────────────────────────────────────────
create table if not exists public.experience_reports (
  id uuid primary key default gen_random_uuid(),

  application_id uuid not null,

  -- application 단위로 1 부터 올라간다. 재사용하지 않는다 —
  -- 철회 뒤 다시 발행해도 다음 번호를 쓴다. 번호가 곧 발행 이력이다.
  version integer not null,

  status text not null,

  -- snapshot 구조의 버전. 구조를 바꿀 때 과거 row 를 변환하지 않고
  -- 읽는 쪽이 이 값으로 분기한다.
  content_version integer not null default 1,

  -- 발행 당시 부모가 볼 수 있던 내용 전체. 아래 publish 함수만 만들어 넣는다.
  content jsonb not null,

  published_at timestamptz not null,
  -- ⚠️ 수업을 진행한 선생님이 아니라 발행 버튼을 누른 Studio 계정이다.
  --    trial_results.created_by / updated_by 와 같은 의미다.
  --    학부모 화면에 교사 이름으로 표시하면 안 된다.
  published_by uuid,

  superseded_at timestamptz,
  superseded_by uuid,

  withdrawn_at timestamptz,
  withdrawn_by uuid,

  created_at timestamptz not null default now(),

  -- draft 는 없다. 발행된 적 없는 것은 이 표에 들어오지 않는다.
  constraint experience_reports_status_check
    check (status in ('published', 'superseded', 'withdrawn')),

  constraint experience_reports_version_positive_check
    check (version > 0),

  constraint experience_reports_content_version_positive_check
    check (content_version > 0),

  -- 종료 상태는 자기 시각을 갖고, 아닌 상태는 갖지 않는다.
  -- 한 row 가 superseded 이면서 withdrawn 일 수 없다.
  constraint experience_reports_lifecycle_timestamps_check
    check (
      case status
        when 'published'  then superseded_at is null and withdrawn_at is null
        when 'superseded' then superseded_at is not null and withdrawn_at is null
        when 'withdrawn'  then withdrawn_at is not null and superseded_at is null
      end
    ),

  constraint experience_reports_application_version_unique
    unique (application_id, version),

  -- 삭제 정책은 CASCADE 가 아니다.
  --
  -- trial_results 는 CASCADE 다 — source 라서 신청이 사라지면 같이 사라져도 된다.
  -- 발행 이력은 다르다. "우리가 이 부모에게 무엇을 보여 줬는가" 의 기록이라
  -- 신청 row 하나 지우는 것으로 조용히 사라지면 안 된다. 지우려면 발행 이력을
  -- 어떻게 할지 먼저 정하게 만든다.
  constraint experience_reports_application_id_fkey
    foreign key (application_id) references public.trial_applications(id)
    on delete restrict,

  constraint experience_reports_published_by_fkey
    foreign key (published_by) references public.profiles(id) on delete set null,
  constraint experience_reports_superseded_by_fkey
    foreign key (superseded_by) references public.profiles(id) on delete set null,
  constraint experience_reports_withdrawn_by_fkey
    foreign key (withdrawn_by) references public.profiles(id) on delete set null
);

comment on table public.experience_reports is
  '발행된 체험 리포트의 불변 스냅샷. trial_results(mutable source)와 분리된 publication artifact 다. draft 는 저장하지 않는다.';

comment on column public.experience_reports.published_by is
  '발행한 Studio 계정. 수업 진행자가 아니며 학부모에게 공개하지 않는다.';

-- 한 Experience 에 살아 있는 발행본은 0 개 아니면 1 개다.
-- 재발행 transaction 이 깨져도 이 index 가 마지막으로 막는다.
create unique index if not exists experience_reports_one_active_published
  on public.experience_reports (application_id)
  where status = 'published';

create index if not exists experience_reports_application_idx
  on public.experience_reports (application_id, version desc);

-- ─────────────────────────────────────────────────────────────
-- 2. content 는 발행 뒤 고칠 수 없다
--
-- RLS 로는 컬럼 단위 제한을 못 건다. 아래에서 client 에게 UPDATE 정책을 아예
-- 주지 않지만, service role 이나 앞으로 추가될 다른 경로가 실수로 고치는 것까지
-- 막으려면 표 자신이 거절해야 한다. 상태 전이에 필요한 컬럼만 열어 둔다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.reject_experience_report_content_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- 끝난 것은 끝난 것이다.
  --
  -- superseded 와 withdrawn 은 종료 상태다. 여기서 되살아나면 "이미 지나간
  -- 리포트" 가 다시 부모에게 보이고, 살아 있는 발행본이 두 개가 된다.
  -- 종료된 row 는 lifecycle metadata 까지 통째로 잠근다.
  if old.status in ('superseded', 'withdrawn') then
    raise exception 'experience_report_lifecycle_is_terminal'
      using detail = '이미 종료된 리포트는 되돌릴 수 없습니다. 새 version 을 발행하세요.';
  end if;

  -- published 에서 갈 수 있는 곳은 두 군데뿐이다.
  if new.status not in ('published', 'superseded', 'withdrawn') then
    raise exception 'experience_report_invalid_transition'
      using detail = format('허용되지 않는 상태 전이입니다: %s → %s', old.status, new.status);
  end if;

  if new.content is distinct from old.content
     or new.content_version is distinct from old.content_version
     or new.version is distinct from old.version
     or new.application_id is distinct from old.application_id
     or new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by
     or new.id is distinct from old.id
  then
    raise exception 'experience_report_is_immutable'
      using detail = '발행된 리포트의 내용은 고칠 수 없습니다. 새 version 을 발행하세요.';
  end if;

  return new;
end;
$$;

create trigger experience_reports_immutable_content
  before update on public.experience_reports
  for each row execute function public.reject_experience_report_content_update();

-- ─────────────────────────────────────────────────────────────
-- 3. 관찰 문구는 발행 시점 값을 함께 얼린다
--
-- code 만 저장하면 문구를 다듬는 순간 이미 발행된 리포트의 표시 내용이 조용히
-- 바뀐다. 부모가 본 문장과 지금 보이는 문장이 달라지는데 version 은 그대로다.
-- 그래서 snapshot 에 code 와 그때의 문구를 같이 넣는다.
--
-- 이 표는 R0 의 TRIAL_RESULT_OBSERVATION_OPTIONS 와 같은 값이어야 한다.
-- verifier 가 두 쪽이 어긋나지 않는지 확인한다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.experience_report_observation_label(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_code
    when 'sustained_engagement' then '활동이 진행되는 동안 과제에 계속 참여했어요.'
    when 'active_participation' then '질문이나 활동 제안에 스스로 참여했어요.'
    when 'verbal_explanation' then '자기 생각이나 과정을 말로 설명했어요.'
    when 'independent_after_instruction' then '설명을 들은 뒤 다음 단계를 스스로 진행했어요.'
    when 'needs_some_guidance' then '일부 단계에서 추가 설명이나 도움이 필요했어요.'
    when 'needs_repeated_guidance' then '여러 단계에서 반복 설명이나 도움이 필요했어요.'
    when 'ready_for_more_challenge' then '안내된 활동을 마친 뒤 추가 활동을 더 시도했어요.'
    else null
  end
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS — 부모는 살아 있는 발행본만 본다
--
-- ⚠️ 쓰기 정책을 하나도 만들지 않는다. INSERT / UPDATE / DELETE 는 아래 함수로만
--    가능하다. 그래서 client 가 content 를 직접 써 넣을 방법이 없다.
-- ─────────────────────────────────────────────────────────────
alter table public.experience_reports enable row level security;

-- 부모: 자기 신청의, 지금 살아 있는 발행본만.
-- superseded 와 withdrawn 은 읽을 수 없다 — 부모에게는 이미 지난 것이거나
-- 학원이 내린 것이다. 이력은 DB 에 남지만 열람 대상이 아니다.
create policy experience_reports_parent_read_published
  on public.experience_reports
  for select
  to authenticated
  using (
    status = 'published'
    and exists (
      select 1
      from public.trial_applications ta
      where ta.id = experience_reports.application_id
        and ta.parent_id = auth.uid()
    )
  );

-- 학원: 자기 조직의 발행 이력 전체. 기존 teacher/org 정책과 같은 판정을 쓴다.
create policy experience_reports_teacher_read_org
  on public.experience_reports
  for select
  to authenticated
  using (
    app.current_role() = 'teacher'
    and exists (
      select 1
      from public.trial_applications ta
      join public.classes c on c.id = ta.class_id
      where ta.id = experience_reports.application_id
        and c.organization_id = app.current_org_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 5. 발행 — 한 transaction 안에서
--
-- security definer 다. 위에서 쓰기 정책을 하나도 주지 않았기 때문에
-- invoker 로는 INSERT 자체가 불가능하다. 대신 함수 안에서 호출자 권한을
-- 직접 확인한다 — 파라미터로 받은 조직을 믿지 않는다.
--
-- snapshot 도 파라미터로 받지 않는다. 호출자가 content 를 만들어 넘기면
-- 무엇이든 부모에게 보여 줄 수 있게 된다. 여기서 source 를 직접 읽어 조립한다.
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
    'recommendation', jsonb_build_object(
      'course', v_result.recommended_course,
      'level', v_result.recommended_level,
      'schedule', v_result.recommended_schedule
    )
  );

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

-- ─────────────────────────────────────────────────────────────
-- 6. 철회 — 삭제가 아니다
--
-- content 는 그대로 둔다. 부모는 더 이상 읽을 수 없지만, 무엇을 발행했었는지는
-- 남는다. 나중에 "발행되었다가 철회됨" 을 이력으로 보여 줄 수 있어야 한다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.withdraw_experience_report(p_application_id uuid)
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
  v_current public.experience_reports%rowtype;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  select p.organization_id, p.role into v_org, v_role
  from public.profiles p where p.id = v_actor;

  if v_org is null or v_role is null or v_role not in ('academy', 'admin') then
    raise exception 'application_not_found_or_forbidden';
  end if;

  select ta.* into v_app
  from public.trial_applications ta
  join public.classes c on c.id = ta.class_id
  where ta.id = p_application_id
    and c.organization_id = v_org
  for update of ta;

  if not found then
    raise exception 'application_not_found_or_forbidden';
  end if;

  select er.* into v_current
  from public.experience_reports er
  where er.application_id = p_application_id
    and er.status = 'published';

  if not found then
    raise exception 'published_report_not_found';
  end if;

  update public.experience_reports
  set status = 'withdrawn',
      withdrawn_at = v_now,
      withdrawn_by = v_actor
  where id = v_current.id;

  return jsonb_build_object(
    'id', v_current.id,
    'version', v_current.version,
    'withdrawnAt', v_now
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. 실행 권한
--
-- definer 함수라 기본 PUBLIC 실행 권한을 남겨 두면 안 된다.
-- 로그인한 사용자만 부르고, 권한 판정은 함수 안에서 한다.
-- ─────────────────────────────────────────────────────────────
revoke all on function public.publish_experience_report(uuid, timestamptz) from public;
revoke all on function public.withdraw_experience_report(uuid) from public;
revoke all on function public.experience_report_observation_label(text) from public;

grant execute on function public.publish_experience_report(uuid, timestamptz) to authenticated;
grant execute on function public.withdraw_experience_report(uuid) to authenticated;
grant execute on function public.experience_report_observation_label(text) to authenticated;
