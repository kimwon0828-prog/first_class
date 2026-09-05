-- 기존 학원이 엑셀로 관리하던 체험 예약을 첫수업으로 옮기기 위한 저장소.
--
-- 이관된 예약에는 첫수업 학부모 계정이 없다. 계정을 대신 만들어 주는 방식은
-- 쓰지 않는다(나중에 학부모가 실제로 가입할 때 충돌한다). 대신 신청 row 가
-- 학부모 계정 없이도 존재할 수 있게 한다.
--
-- 학생·보호자 정보는 원래부터 신청 row 에 스냅샷으로 저장되므로
-- (child_name / child_grade / parent_name / parent_phone) 이관에 필요한 값은 그대로 담긴다.

-- ─────────────────────────────────────────────────────────────
-- 1. 학부모 계정 없는 신청 허용
--
-- FK 는 그대로 둔다. 값이 있으면 반드시 실재하는 profile 이어야 한다.
-- 기존 Marketplace 신청은 계속 parent_id = auth.uid() 로 저장된다 — 의미 변경 없음.
--
-- parent RLS(trial_applications_parent_select_self) 는 parent_id = auth.uid() 라서
-- NULL 이면 자연히 거짓이다. 이관 예약이 어떤 학부모의 `/my` 에도 나타나지 않는다.
-- ─────────────────────────────────────────────────────────────

alter table public.trial_applications
  alter column parent_id drop not null;

-- ─────────────────────────────────────────────────────────────
-- 2. 가져오기 이력
--
-- batch 는 멱등성의 근거다. 같은 batch 를 두 번 실행해도 신청이 두 벌 생기지 않는다.
-- row 는 중복 후보 판정(fingerprint)과 "이 신청이 몇 번째 행에서 왔는지" 추적에 쓴다.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.studio_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  -- 지금은 예약 이관 하나뿐이다. 나중에 상담 이관이 생겨도 같은 테이블을 쓴다.
  import_type text not null,
  original_file_name text,
  status text not null default 'previewed',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  imported_rows integer not null default 0,
  failed_rows integer not null default 0,
  created_by uuid
    references public.profiles(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint studio_import_batches_import_type_check
    check (import_type in ('trial_reservations')),
  constraint studio_import_batches_status_check
    check (status in ('previewed', 'importing', 'completed', 'failed')),
  constraint studio_import_batches_counts_check
    check (
      total_rows >= 0
      and valid_rows >= 0
      and imported_rows >= 0
      and failed_rows >= 0
    ),
  constraint studio_import_batches_completed_at_check
    check (
      (status = 'completed' and completed_at is not null)
      or (status <> 'completed' and completed_at is null)
    )
);

create table if not exists public.studio_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null
    references public.studio_import_batches(id)
    on delete cascade,
  row_number integer not null,
  -- 같은 예약을 다시 가져오는지 판단하는 지문. 자동 병합·삭제에는 쓰지 않는다.
  fingerprint text not null,
  status text not null,
  application_id uuid
    references public.trial_applications(id)
    on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  constraint studio_import_rows_status_check
    check (status in ('imported', 'skipped', 'failed')),
  constraint studio_import_rows_row_number_check check (row_number > 0)
);

create unique index if not exists studio_import_rows_batch_row_uidx
  on public.studio_import_rows (batch_id, row_number);
create index if not exists studio_import_rows_fingerprint_idx
  on public.studio_import_rows (fingerprint);
create index if not exists studio_import_batches_organization_created_idx
  on public.studio_import_batches (organization_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 3. 신청이 어디서 왔는지
--
-- 별도 source enum 을 만들지 않는다. NULL 이면 Marketplace 신청이고,
-- 값이 있으면 그 batch 로 이관된 예약이다.
-- ─────────────────────────────────────────────────────────────

alter table public.trial_applications
  add column if not exists import_batch_id uuid
    references public.studio_import_batches(id)
    on delete set null;

create index if not exists trial_applications_import_batch_idx
  on public.trial_applications (import_batch_id)
  where import_batch_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 4. 권한
--
-- 자기 조직 이력만 읽는다. 쓰기는 가져오기 RPC 만 한다.
-- ─────────────────────────────────────────────────────────────

alter table public.studio_import_batches enable row level security;
alter table public.studio_import_rows enable row level security;

revoke all on table public.studio_import_batches from anon, authenticated;
revoke all on table public.studio_import_rows from anon, authenticated;
grant select on table public.studio_import_batches to authenticated;
grant select on table public.studio_import_rows to authenticated;

drop policy if exists studio_import_batches_select_same_org on public.studio_import_batches;
create policy studio_import_batches_select_same_org
on public.studio_import_batches
for select
to authenticated
using (
  app.current_org_id() is not null
  and organization_id = app.current_org_id()
);

drop policy if exists studio_import_rows_select_same_org on public.studio_import_rows;
create policy studio_import_rows_select_same_org
on public.studio_import_rows
for select
to authenticated
using (
  exists (
    select 1
    from public.studio_import_batches batch
    where batch.id = studio_import_rows.batch_id
      and app.current_org_id() is not null
      and batch.organization_id = app.current_org_id()
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.studio_import_batches'::regclass
      and tgname = 'set_studio_import_batches_updated_at'
      and not tgisinternal
  ) then
    create trigger set_studio_import_batches_updated_at
    before update on public.studio_import_batches
    for each row execute function public.set_updated_at();
  end if;
end
$$;
