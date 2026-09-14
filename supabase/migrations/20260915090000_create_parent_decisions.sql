-- 체험을 마친 뒤 학부모가 지금 무슨 생각인지 직접 남긴다.
--
-- ⚠️ 등록 결과가 아니다.
--
-- trial_applications.registration_status 는 학원이 판단해 적는 운영 값이다
-- (undecided · pending · enrolled · not_enrolled). 이 표는 학부모 본인이 적는
-- "지금 생각" 이고, 둘은 주체도 의미도 다르다. 그래서 값 이름부터 겹치지 않게 했다 —
-- enrolled / not_enrolled 를 여기 쓰지 않는다.
--
-- 과거 registration_status 를 이 표로 옮기지 않는다. pending 을 considering 으로
-- 바꾸는 것도 변환이 아니라 창작이다. 학원이 "고민 중" 이라고 적어 둔 것과
-- 학부모가 스스로 "고민 중" 이라고 고른 것은 다른 사실이다.

create table if not exists public.parent_decisions (
  id uuid primary key default gen_random_uuid(),

  application_id uuid not null,
  -- 누가 골랐는가. RPC 가 auth.uid() 로 채운다 — 호출자가 지정할 수 없다.
  parent_id uuid not null,

  decision text not null,

  created_at timestamptz not null default now(),
  -- 비어 있으면 지금의 생각이다. 값이 있으면 그때 이후로 바뀐 것이다.
  superseded_at timestamptz,

  constraint parent_decisions_decision_check
    check (decision in ('planned', 'considering', 'declined')),

  -- 발행 이력과 같은 이유로 지우지 않는다. 고민하다 마음을 정한 흐름 자체가
  -- 교육 선택의 기록이다. 신청을 지우는 것으로 조용히 사라지면 안 된다.
  constraint parent_decisions_application_id_fkey
    foreign key (application_id) references public.trial_applications(id)
    on delete restrict,
  constraint parent_decisions_parent_id_fkey
    foreign key (parent_id) references public.profiles(id)
    on delete restrict
);

comment on table public.parent_decisions is
  '체험 후 학부모가 직접 남긴 현재 생각. 학원이 적는 registration_status 와 다른 값이며 서로 변환하지 않는다.';

comment on column public.parent_decisions.superseded_at is
  '비어 있으면 현재 생각. 값이 있으면 그 시점 이후로 바뀐 과거 기록이다.';

-- 한 신청에 지금의 생각은 하나뿐이다.
create unique index if not exists parent_decisions_one_current
  on public.parent_decisions (application_id)
  where superseded_at is null;

create index if not exists parent_decisions_application_idx
  on public.parent_decisions (application_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 과거 기록은 고치지 않는다
--
-- 바뀔 수 있는 것은 "지금 생각이 아니게 됐다" 는 사실 하나뿐이다.
-- 값 자체를 고치면 그건 다른 생각을 그때 했던 것처럼 만드는 일이다.
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
  then
    raise exception 'parent_decision_is_immutable'
      using detail = '지난 선택은 고칠 수 없습니다. 새로 선택하면 기록이 이어집니다.';
  end if;

  -- 한 번 지나간 것을 다시 현재로 되돌리지 않는다.
  if old.superseded_at is not null and new.superseded_at is null then
    raise exception 'parent_decision_is_immutable'
      using detail = '지난 선택을 현재 선택으로 되돌릴 수 없습니다.';
  end if;

  return new;
end;
$$;

create trigger parent_decisions_immutable
  before update on public.parent_decisions
  for each row execute function public.reject_parent_decision_mutation();

-- ─────────────────────────────────────────────────────────────
-- RLS — 읽기만 정책으로 연다
--
-- ⚠️ INSERT / UPDATE / DELETE 정책을 만들지 않는다.
--    쓰기는 아래 RPC 하나로만 들어온다. 그래서 학원도, 학부모 본인도
--    client 에서 직접 값을 써 넣을 수 없다.
-- ─────────────────────────────────────────────────────────────
alter table public.parent_decisions enable row level security;

-- 학부모: 자기 신청에 달린 기록.
create policy parent_decisions_parent_read_own
  on public.parent_decisions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.trial_applications ta
      where ta.id = parent_decisions.application_id
        and ta.parent_id = auth.uid()
    )
  );

-- 학원: 자기 조직 신청에 달린 기록. 읽기만이다 — 고칠 수 없다.
create policy parent_decisions_teacher_read_org
  on public.parent_decisions
  for select
  to authenticated
  using (
    app.current_role() = 'teacher'
    and exists (
      select 1
      from public.trial_applications ta
      join public.classes c on c.id = ta.class_id
      where ta.id = parent_decisions.application_id
        and c.organization_id = app.current_org_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 선택 저장 — 한 transaction 안에서
--
-- security definer 다. 위에서 쓰기 정책을 주지 않았기 때문에 invoker 로는
-- INSERT 자체가 불가능하다. 대신 함수 안에서 호출자 권한을 직접 확인한다.
-- parent_id 도 파라미터로 받지 않고 auth.uid() 로 채운다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_parent_decision(
  p_application_id uuid,
  p_decision text
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
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if p_decision is null or p_decision not in ('planned', 'considering', 'declined') then
    raise exception 'invalid_parent_decision';
  end if;

  -- 대상 신청을 잠근다. 같은 사람이 두 번 빠르게 눌러도 여기서 줄을 선다.
  -- 남의 신청은 조회 자체가 비어 존재 여부가 드러나지 않는다.
  select ta.* into v_app
  from public.trial_applications ta
  where ta.id = p_application_id
    and ta.parent_id = v_actor
  for update of ta;

  if not found then
    raise exception 'application_not_found_or_forbidden';
  end if;

  -- 체험을 마친 뒤에 묻는 질문이다.
  if v_app.status <> 'completed' then
    raise exception 'application_not_completed';
  end if;

  select pd.* into v_current
  from public.parent_decisions pd
  where pd.application_id = p_application_id
    and pd.superseded_at is null
  for update;

  if found then
    -- 같은 생각을 다시 고른 것은 바뀐 것이 아니다.
    -- 기록을 늘리면 "여러 번 마음이 오갔다" 는 없던 이야기가 생긴다.
    if v_current.decision = p_decision then
      return jsonb_build_object(
        'id', v_current.id,
        'decision', v_current.decision,
        'createdAt', v_current.created_at,
        'changed', false
      );
    end if;

    update public.parent_decisions
    set superseded_at = v_now
    where id = v_current.id;
  end if;

  insert into public.parent_decisions (application_id, parent_id, decision, created_at)
  values (p_application_id, v_actor, p_decision, v_now)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'decision', p_decision,
    'createdAt', v_now,
    'changed', true
  );
end;
$$;

-- definer 함수라 기본 실행 권한을 남겨 두지 않는다.
-- Supabase 가 public 스키마 새 함수에 anon 권한을 따로 부여하므로 그것도 거둔다.
revoke all on function public.set_parent_decision(uuid, text) from public;
revoke execute on function public.set_parent_decision(uuid, text) from anon;
grant execute on function public.set_parent_decision(uuid, text) to authenticated;
