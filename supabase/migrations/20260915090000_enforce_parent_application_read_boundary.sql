-- 학부모가 신청 row 를 직접 읽을 수 있는 범위를 DB 에서 정한다.
--
-- 지금까지 경계는 앱 코드의 whitelist select 하나였다. RLS 는 "어떤 row 를
-- 볼 수 있는가" 만 정하고 "그 row 의 어떤 column 을 볼 수 있는가" 는 정하지
-- 않는다. 그래서 학부모 credential 로 PostgREST 에 직접 붙어
--   /rest/v1/trial_applications?select=*
-- 하면 자기 row 에 한해 registration_status · unregistered_reason ·
-- 상담 메모 같은 학원 내부 운영 값까지 읽을 수 있었다.
--
-- 앱이 안 보여주는 것과 DB 가 못 읽게 하는 것은 다른 보장이다. 이 migration 은
-- 뒤쪽을 만든다.
--
-- ⚠️ 어려운 지점: 학부모도 학원도 DB role 이 authenticated 로 같다.
--    그래서 `revoke select ... from authenticated` 만 하면 Studio 도 같이 멈춘다.
--    role 별로 권한을 나눌 수 없으므로, 읽는 표면 자체를 둘로 나눈다.
--
--      my_trial_applications      학부모용 — 학부모 제품에 필요한 column 만
--      studio_trial_applications  학원용   — 자기 조직 신청 전체
--
--    둘 다 security definer view 다(소유자 postgres 권한으로 돈다). 그래서
--    base table 의 권한을 모두 거둬도 view 를 통해서는 읽을 수 있고,
--    view 의 WHERE 가 각 표면의 경계가 된다.
--
-- 데이터는 바꾸지 않는다. 이 migration 은 권한과 표면만 다룬다.

-- ─────────────────────────────────────────────────────────────
-- 학부모 읽기 표면
--
-- 여기 없는 column 은 학부모에게 존재하지 않는 값이다. 지금 없는 것:
--   registration_status · registered_course · unregistered_reason(+note)
--   enrolled_at · lost_at · consultation_note · trial_feedback · memo
--   follow_up_note · next_contact_at · last_activity_at · assigned_teacher_id
--   final_level · final_schedule · 상담 스냅샷 전부
--
-- "일단 담고 화면에서 빼기" 를 하지 않는다 — adapter 의 학부모 DTO 와 같은 규칙이다.
--
-- 판단이 필요한 값은 원본 대신 boolean 으로 접어서 준다. 학부모 화면에 필요한
-- 답은 "취소할 수 있는가" · "지금 생각을 물어도 되는가" 지, 학원이 무엇을
-- 적어 뒀는지가 아니다.
-- ─────────────────────────────────────────────────────────────
create or replace view public.my_trial_applications as
select
  ta.id,
  ta.class_id,
  ta.parent_id,
  ta.child_id,
  ta.child_name,
  ta.child_grade,
  ta.parent_name,
  ta.parent_phone,
  ta.class_schedule_id,
  ta.requested_schedule_block_id,
  ta.selected_schedule_label,
  ta.requested_slot_at,
  ta.confirmed_slot_at,
  ta.completed_at,
  ta.canceled_at,
  ta.goal_type,
  ta.status,
  ta.created_at,
  ta.updated_at,

  -- 수업 정보는 학부모에게 공개된 값이라 평평하게 붙인다.
  -- PostgREST 의 embed 관계 추론에 기대지 않는다 — view 마다 되는지 달라진다.
  c.title as class_title,
  c.program_type as class_program_type,
  c.organization_id as class_organization_id,

  -- 지금 확정된 등록 결과가 있는가. 결과값도 확정 시각도 나가지 않는다.
  public.has_current_registration_result(ta.*) as has_current_registration_result,

  -- 취소할 수 있는가. registration_status 를 내보내는 대신 여기서 접는다.
  -- 판정 규칙은 adapter 의 resolveParentCanCancel 과 같다.
  (
    ta.registration_status is distinct from 'enrolled'
    and ta.status in ('new', 'reviewing', 'confirmed')
  ) as can_cancel
from public.trial_applications ta
left join public.classes c on c.id = ta.class_id
-- 자기 신청만. auth.uid() 가 null 이면(미인증) 성립하지 않아 0 row 다.
where ta.parent_id = auth.uid();

comment on view public.my_trial_applications is
  '학부모가 읽을 수 있는 신청 표면. 학원 내부 운영 column 은 포함하지 않으며, 판단이 필요한 값은 boolean 으로 접어서 준다.';

-- ─────────────────────────────────────────────────────────────
-- 학원 읽기/쓰기 표면
--
-- 조직 범위는 기존 RLS 정책(trial_applications_teacher_read_org /
-- _teacher_update_org)과 같은 조건이다. 판정 위치만 policy 에서 view 로 옮긴다.
--
-- `select ta.*` 로 두어 auto-updatable view 가 된다. Studio 의 기존 UPDATE 가
-- 표 이름만 바꾸면 그대로 동작한다 — 쓰기 경로를 RPC 로 갈아엎지 않는다.
-- with check option 이 있어서 자기 조직 밖으로 행을 옮기는 UPDATE 도 막힌다.
-- ─────────────────────────────────────────────────────────────
create or replace view public.studio_trial_applications as
select ta.*
from public.trial_applications ta
where app.current_role() = 'teacher'
  and ta.class_id in (
    select c.id
    from public.classes c
    where c.organization_id = app.current_org_id()
  )
with check option;

comment on view public.studio_trial_applications is
  '학원이 읽고 쓰는 신청 표면. 자기 조직 신청만 보이며, 조건은 기존 teacher RLS 정책과 같다.';

-- ─────────────────────────────────────────────────────────────
-- 중복 신청 확인
--
-- 신청 생성 경로가 "같은 아이 · 같은 수업 · 같은 시각" 중복을 미리 막는다.
-- 그 확인 때문에 학부모에게 base table SELECT 를 열어 둘 수는 없으므로,
-- 있는지 여부만 답하는 함수로 좁힌다.
--
-- 소유권은 안에서 auth.uid() 로 확인한다. 남의 신청 존재 여부는 답하지 않는다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.has_active_trial_application(
  p_class_id uuid,
  p_child_name text,
  p_requested_slot_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trial_applications ta
    where ta.parent_id = auth.uid()
      and ta.class_id = p_class_id
      and ta.child_name = p_child_name
      and ta.requested_slot_at = p_requested_slot_at
      and ta.status in ('new', 'reviewing', 'confirmed')
  );
$$;

revoke all on function public.has_active_trial_application(uuid, text, timestamptz) from public;
revoke all on function public.has_active_trial_application(uuid, text, timestamptz) from anon;
grant execute on function public.has_active_trial_application(uuid, text, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 상담 저장 transaction
--
-- 이 함수는 security invoker 라서 호출자의 base table 권한으로 돌았다.
-- 아래에서 authenticated 의 base table 권한을 거두면 그대로 멈춘다.
--
-- 내부에 이미 같은 검사가 있다 — profiles 에서 role 이 academy | admin 인지
-- 보고, 대상 신청을 classes.organization_id 로 조인해 자기 조직인지 확인한다.
-- 그래서 definer 로 바꿔도 경계가 넓어지지 않는다. RLS 를 한 겹 더 두던 것을
-- 함수 자신의 검사로 일원화한다.
-- ─────────────────────────────────────────────────────────────
alter function public.create_studio_consultation(
  uuid, uuid, timestamptz, text, text, text, text, text, text, text, timestamptz, boolean, jsonb, text, text
) security definer;

-- ─────────────────────────────────────────────────────────────
-- base table 을 닫는다
--
-- 여기가 이 migration 의 핵심이다. 학부모 credential 로는 이제
-- trial_applications 를 어떤 column 으로도 SELECT 할 수 없다 —
-- row 가 0건이라 안 보이는 것이 아니라 권한이 없다.
--
-- INSERT 만 남긴다. 체험 신청 생성은 학부모가 직접 하는 일이고,
-- 그 경로는 trial_applications_parent_insert_self 정책이 계속 판정한다.
-- INSERT 는 RETURNING 을 쓰지 않으면 SELECT 권한을 요구하지 않는다.
--
-- service_role 은 그대로 둔다. cron · 알림 · 공개 수업 조회처럼 RLS 로 표현할
-- 수 없는 서버 전용 경로가 그 권한으로 돈다.
-- ─────────────────────────────────────────────────────────────
revoke all on table public.trial_applications from authenticated;
revoke all on table public.trial_applications from anon;

grant insert on table public.trial_applications to authenticated;

-- ⚠️ view 에도 default privilege 가 붙는다.
--
-- Supabase 는 public schema 에 새로 만들어지는 table/view 에 anon 과
-- authenticated 의 전체 권한을 default privilege 로 붙여 둔다. 그대로 두면
--   · anon 이 학부모 표면을 열어 볼 수 있고
--   · authenticated 가 학부모 표면에 INSERT / DELETE 를 시도할 수 있다.
-- 필요한 것만 남기고 먼저 전부 거둔다.
revoke all on public.my_trial_applications from public;
revoke all on public.my_trial_applications from anon;
revoke all on public.my_trial_applications from authenticated;
revoke all on public.studio_trial_applications from public;
revoke all on public.studio_trial_applications from anon;
revoke all on public.studio_trial_applications from authenticated;

-- 학부모 표면은 읽기 전용이다. 신청 생성은 base table INSERT 로, 취소는
-- 서버 전용 경로로 처리한다 — 이 view 로 값을 쓰지 않는다.
grant select on public.my_trial_applications to authenticated;

-- 학원 표면은 읽기와 수정. INSERT / DELETE 는 열지 않는다 —
-- 신청을 만드는 것은 학부모이고, 지우는 경로는 제품에 없다.
grant select, update on public.studio_trial_applications to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 다른 표의 RLS 정책이 trial_applications 를 직접 읽고 있다
--
-- 위에서 base table 권한을 거두면 여기가 같이 멈춘다. RLS 정책의 식은 질의를
-- 하는 사람의 권한으로 평가되기 때문이다 — 정책 안의
--   exists (select 1 from trial_applications ta where ...)
-- 도 그 사람에게 SELECT 권한을 요구한다.
--
-- 해당 정책은 7개 표에 15개이고, 식의 모양은 딱 두 가지다.
--   · 내 신청인가        ta.id = <표>.application_id and ta.parent_id = auth.uid()
--   · 우리 조직 신청인가  ta.id = <표>.application_id and classes.organization_id = app.current_org_id()
--
-- 그래서 그 두 판정을 함수로 옮기고, 정책은 함수를 부르게 바꾼다. 판정 조건은
-- 한 글자도 바꾸지 않는다 — 여기서 권한이 넓어지거나 좁아지면 안 된다.
--
-- 함수는 security definer 라 base table 권한 없이도 판정할 수 있고,
-- 밖으로는 boolean 하나만 나간다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_own_trial_application(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trial_applications ta
    where ta.id = p_application_id
      and ta.parent_id = auth.uid()
  );
$$;

create or replace function public.is_org_trial_application(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trial_applications ta
    join public.classes c on c.id = ta.class_id
    where ta.id = p_application_id
      and c.organization_id = app.current_org_id()
  );
$$;

revoke all on function public.is_own_trial_application(uuid) from public;
revoke all on function public.is_own_trial_application(uuid) from anon;
grant execute on function public.is_own_trial_application(uuid) to authenticated;

revoke all on function public.is_org_trial_application(uuid) from public;
revoke all on function public.is_org_trial_application(uuid) from anon;
grant execute on function public.is_org_trial_application(uuid) to authenticated;

-- application_logs
drop policy if exists application_logs_parent_select_self on public.application_logs;
create policy application_logs_parent_select_self
on public.application_logs for select to authenticated
using (public.is_own_trial_application(application_logs.application_id));

drop policy if exists application_logs_parent_insert_self on public.application_logs;
create policy application_logs_parent_insert_self
on public.application_logs for insert to authenticated
with check (
  actor_id = auth.uid()
  and public.is_own_trial_application(application_logs.application_id)
);

drop policy if exists application_logs_teacher_read_org on public.application_logs;
create policy application_logs_teacher_read_org
on public.application_logs for select to authenticated
using (
  app.current_role() = 'teacher'
  and public.is_org_trial_application(application_logs.application_id)
);

drop policy if exists application_logs_teacher_insert_org on public.application_logs;
create policy application_logs_teacher_insert_org
on public.application_logs for insert to authenticated
with check (
  app.current_role() = 'teacher'
  and actor_id = auth.uid()
  and public.is_org_trial_application(application_logs.application_id)
);

-- consultation_logs
drop policy if exists consultation_logs_teacher_read_org on public.consultation_logs;
create policy consultation_logs_teacher_read_org
on public.consultation_logs for select to authenticated
using (
  app.current_role() = 'teacher'
  and public.is_org_trial_application(consultation_logs.application_id)
);

drop policy if exists consultation_logs_teacher_insert_org on public.consultation_logs;
create policy consultation_logs_teacher_insert_org
on public.consultation_logs for insert to authenticated
with check (
  app.current_role() = 'teacher'
  and (created_by is null or created_by = auth.uid())
  and public.is_org_trial_application(consultation_logs.application_id)
);

drop policy if exists consultation_logs_teacher_update_org on public.consultation_logs;
create policy consultation_logs_teacher_update_org
on public.consultation_logs for update to authenticated
using (
  app.current_role() = 'teacher'
  and activity_type = 'CONSULTATION'
  and public.is_org_trial_application(consultation_logs.application_id)
)
with check (
  app.current_role() = 'teacher'
  and activity_type = 'CONSULTATION'
  and public.is_org_trial_application(consultation_logs.application_id)
);

-- trial_results
drop policy if exists trial_results_teacher_read_org on public.trial_results;
create policy trial_results_teacher_read_org
on public.trial_results for select to authenticated
using (
  app.current_role() = 'teacher'
  and public.is_org_trial_application(trial_results.application_id)
);

drop policy if exists trial_results_teacher_insert_org on public.trial_results;
create policy trial_results_teacher_insert_org
on public.trial_results for insert to authenticated
with check (
  app.current_role() = 'teacher'
  and (created_by is null or created_by = auth.uid())
  and public.is_org_trial_application(trial_results.application_id)
);

drop policy if exists trial_results_teacher_update_org on public.trial_results;
create policy trial_results_teacher_update_org
on public.trial_results for update to authenticated
using (
  app.current_role() = 'teacher'
  and public.is_org_trial_application(trial_results.application_id)
)
with check (
  app.current_role() = 'teacher'
  and public.is_org_trial_application(trial_results.application_id)
);

-- experience_reports
drop policy if exists experience_reports_parent_read_published on public.experience_reports;
create policy experience_reports_parent_read_published
on public.experience_reports for select to authenticated
using (
  status = 'published'
  and public.is_own_trial_application(experience_reports.application_id)
);

drop policy if exists experience_reports_teacher_read_org on public.experience_reports;
create policy experience_reports_teacher_read_org
on public.experience_reports for select to authenticated
using (
  app.current_role() = 'teacher'
  and public.is_org_trial_application(experience_reports.application_id)
);

-- parent_decisions
drop policy if exists parent_decisions_parent_read_own on public.parent_decisions;
create policy parent_decisions_parent_read_own
on public.parent_decisions for select to authenticated
using (
  parent_decisions.parent_id = auth.uid()
  and public.is_own_trial_application(parent_decisions.application_id)
);

drop policy if exists parent_decisions_teacher_read_org on public.parent_decisions;
create policy parent_decisions_teacher_read_org
on public.parent_decisions for select to authenticated
using (
  app.current_role() = 'teacher'
  and public.is_org_trial_application(parent_decisions.application_id)
);

-- registration_results
drop policy if exists registration_results_teacher_read_org on public.registration_results;
create policy registration_results_teacher_read_org
on public.registration_results for select to authenticated
using (
  app.current_role() = 'teacher'
  and public.is_org_trial_application(registration_results.application_id)
);
