-- 실제 등록이 어떻게 결정되었는가.
--
-- ⚠️ ParentDecision 이 아니다.
--
-- parent_decisions 는 학부모 본인이 남긴 "지금 생각" 이고(planned · considering ·
-- declined), 이 표는 학원에서 확정된 "실제 결과" 다. 주체도 의미도 다르다.
-- 그래서 값도 겹치지 않는다 — 여기에는 enrolled / not_enrolled 둘뿐이다.
--
-- pending / undecided 는 결과값이 아니다. "아직 결과가 확정되지 않음" 이고,
-- 그 상태에서는 현재 RegistrationResult 가 아예 존재하지 않는 것으로 표현한다.
-- 없음을 값으로 적지 않는다.
--
-- trial_applications.registration_status 는 이 migration 에서 지우지 않는다.
-- 기존 Studio 운영 로직과 집계가 아직 그 column 을 읽는다. R5 는 cutover 단계다.

create table if not exists public.registration_results (
  id uuid primary key default gen_random_uuid(),

  application_id uuid not null,

  -- 확정된 결과. 둘뿐이다.
  result text not null,

  -- 이 기록이 어디에서 왔는가.
  --   studio                      — Studio 등록 상담에서 그때 확정된 것
  --   legacy_registration_status  — registration_status 에서 한 번 옮겨 온 것
  origin text not null,

  -- Studio 에서 새로 기록됐다면 그때의 actor. legacy 이관분은 알 수 없어 null 이다.
  recorded_by uuid,

  -- 결과가 실제로 확정된 시각.
  --
  -- ⚠️ 모르면 null 이다. legacy 이관분에 migration 실행 시각을 넣지 않는다.
  --    그건 옮겨 온 시각이지 등록이 결정된 시각이 아니고, 한 번 넣으면
  --    "언제 등록했는가" 를 영원히 틀리게 만든다.
  resolved_at timestamptz,

  -- 이 기록 자체가 만들어진 시각. resolved_at 과 다른 사실이다.
  created_at timestamptz not null default now(),

  -- 비어 있으면 지금의 결과다. 값이 있으면 그때 이후로 결과가 바뀐 것이다.
  superseded_at timestamptz,

  constraint registration_results_result_check
    check (result in ('enrolled', 'not_enrolled')),

  constraint registration_results_origin_check
    check (origin in ('studio', 'legacy_registration_status')),

  -- 결과 이력은 신청을 지워도 조용히 사라지면 안 된다.
  constraint registration_results_application_id_fkey
    foreign key (application_id) references public.trial_applications(id)
    on delete restrict,
  constraint registration_results_recorded_by_fkey
    foreign key (recorded_by) references public.profiles(id)
    on delete restrict
);

comment on table public.registration_results is
  '확정된 실제 등록 결과의 이력. 학부모 의향(parent_decisions)과 다른 값이며 서로 변환하거나 동기화하지 않는다.';

comment on column public.registration_results.resolved_at is
  '결과가 실제로 확정된 시각. 신뢰할 수 있는 기존 시각이 없으면 null 이다 — migration 시각으로 대신 채우지 않는다.';

comment on column public.registration_results.superseded_at is
  '비어 있으면 현재 결과. 값이 있으면 그 시점 이후로 결과가 바뀐 과거 기록이다.';

-- 한 신청에 지금의 결과는 하나뿐이다.
create unique index if not exists registration_results_one_current
  on public.registration_results (application_id)
  where superseded_at is null;

create index if not exists registration_results_application_idx
  on public.registration_results (application_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 과거 결과는 고치지 않는다
--
-- 바뀔 수 있는 것은 "지금의 결과가 아니게 됐다" 는 사실 하나뿐이다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.reject_registration_result_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.application_id is distinct from old.application_id
     or new.result is distinct from old.result
     or new.origin is distinct from old.origin
     or new.recorded_by is distinct from old.recorded_by
     or new.resolved_at is distinct from old.resolved_at
     or new.created_at is distinct from old.created_at
  then
    raise exception 'registration_result_is_immutable'
      using detail = '지난 등록 결과는 고칠 수 없습니다. 결과가 바뀌면 새 기록이 이어집니다.';
  end if;

  -- 이미 과거가 된 기록의 시각도 고칠 수 없다. 허용되는 전이는 null → 시각 하나뿐이다.
  if old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at then
    raise exception 'registration_result_is_immutable'
      using detail = '지난 등록 결과의 기록은 고칠 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists registration_results_immutable on public.registration_results;
create trigger registration_results_immutable
  before update on public.registration_results
  for each row execute function public.reject_registration_result_mutation();

-- ─────────────────────────────────────────────────────────────
-- RLS — 읽기만 정책으로 연다
--
-- ⚠️ INSERT / UPDATE / DELETE 정책을 만들지 않는다.
--    쓰기는 아래 동기화 trigger 하나로만 들어온다. client 에서 직접 결과를
--    써 넣을 수 있는 경로가 없다.
--
-- ⚠️ 학부모 SELECT 정책도 만들지 않는다.
--    학부모 화면은 raw 결과값을 쓰지 않는다. 필요한 것은 "지금 생각을 물어도
--    되는가" boolean 하나뿐이고, 그건 아래 computed column 이 답한다.
-- ─────────────────────────────────────────────────────────────
alter table public.registration_results enable row level security;

create policy registration_results_teacher_read_org
  on public.registration_results
  for select
  to authenticated
  using (
    app.current_role() = 'teacher'
    and exists (
      select 1
      from public.trial_applications ta
      join public.classes c on c.id = ta.class_id
      where ta.id = registration_results.application_id
        and c.organization_id = app.current_org_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- legacy 상태와 결과를 어긋나게 두지 않는다
--
-- registration_status 를 쓰는 경로가 지금 둘이다.
--   · create_studio_consultation RPC (등록 상담 저장)
--   · updateStudioApplicationOutcome 의 직접 UPDATE (미등록 상담 재개)
-- 앞으로 하나가 더 생겨도 같다. 그래서 동기화를 호출부가 아니라 table 에 건다 —
-- registration_status 가 바뀌는 모든 transaction 안에서 같은 문장으로 처리된다.
-- 호출부가 잊어버릴 수 있는 자리를 남기지 않는다.
--
-- 쓰기 권한은 이 trigger 가 유일하다. security definer 라서 registration_results
-- 에 client 쓰기 정책을 열지 않고도 기록할 수 있다.
--
-- 소유권 검사를 여기서 다시 하지 않는다. 이 trigger 는 trial_applications 의
-- UPDATE 가 이미 성공한 뒤에만 돈다 — 그 UPDATE 는 자기 조직 teacher 에게만
-- 열려 있다(trial_applications_teacher_update_org). 학부모에게는 UPDATE 정책이
-- 아예 없어서 이 경로에 들어올 수 없다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.sync_registration_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_current public.registration_results%rowtype;
  v_resolved_at timestamptz;
begin
  -- 현재 결과를 잠근다. 같은 신청에 동시 저장이 들어와도 current 가 둘이 되지 않는다.
  select rr.*
  into v_current
  from public.registration_results rr
  where rr.application_id = new.id
    and rr.superseded_at is null
  for update;

  if new.registration_status in ('enrolled', 'not_enrolled') then
    -- 같은 결과를 다시 저장하면 이력을 늘리지 않는다.
    if found and v_current.result = new.registration_status then
      return new;
    end if;

    if found then
      update public.registration_results
      set superseded_at = now()
      where id = v_current.id;
    end if;

    -- 확정 시각은 legacy 경로가 이미 정확히 찍는 값을 그대로 쓴다.
    v_resolved_at := case
      when new.registration_status = 'enrolled' then new.enrolled_at
      else new.lost_at
    end;

    insert into public.registration_results (
      application_id, result, origin, recorded_by, resolved_at
    )
    values (
      new.id, new.registration_status, 'studio', v_actor, v_resolved_at
    );

    return new;
  end if;

  -- pending / undecided 는 결과가 아니다. 지금의 결과를 과거로 보내고 비워 둔다.
  if found then
    update public.registration_results
    set superseded_at = now()
    where id = v_current.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trial_applications_sync_registration_result on public.trial_applications;
create trigger trial_applications_sync_registration_result
  after insert or update of registration_status on public.trial_applications
  for each row execute function public.sync_registration_result();

-- ─────────────────────────────────────────────────────────────
-- 학부모 경계 — boolean 하나만 넘긴다
--
-- PostgREST computed column 이다. 이미 RLS 를 통과해 읽을 수 있는 신청에 대해
-- "지금 확정된 결과가 있는가" 만 답한다. 결과값도, 시각도 나가지 않는다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.has_current_registration_result(public.trial_applications)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.registration_results rr
    where rr.application_id = $1.id
      and rr.superseded_at is null
  );
$$;

revoke all on function public.has_current_registration_result(public.trial_applications) from public;
grant execute on function public.has_current_registration_result(public.trial_applications) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- legacy 이관
--
-- 지금 확정 상태인 신청만 한 번 옮긴다. pending / undecided 는 결과가 아니므로
-- row 를 만들지 않는다.
--
-- 과거 이력은 복원하지 않는다. 상담 로그에 남은 결과 스냅샷이 지금 확정 상태를
-- 전부 설명하지 못해서, 없는 이력을 지어내는 대신 현재 결과만 세운다.
--
-- 재실행해도 안전하다 — 이미 현재 결과가 있는 신청은 건너뛴다.
-- ─────────────────────────────────────────────────────────────
insert into public.registration_results (
  application_id, result, origin, recorded_by, resolved_at
)
select
  ta.id,
  ta.registration_status,
  'legacy_registration_status',
  null,
  case
    when ta.registration_status = 'enrolled' then ta.enrolled_at
    else ta.lost_at
  end
from public.trial_applications ta
where ta.registration_status in ('enrolled', 'not_enrolled')
  and not exists (
    select 1
    from public.registration_results rr
    where rr.application_id = ta.id
      and rr.superseded_at is null
  );
