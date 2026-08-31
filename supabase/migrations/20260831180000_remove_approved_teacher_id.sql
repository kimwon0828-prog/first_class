-- Phase 3D-3: teacher_signup_requests.approved_teacher_id 제거
--
-- 배경
--   이 컬럼은 승인 시 함께 만들던 system teacher mapping row 를 가리키는 포인터였다.
--   Phase 2A 이후 승인은 teachers 를 만들지 않아 항상 NULL 이고, Phase 3C 에서 남은 2건이
--   가리키던 row 도 평범한 roster teacher 로 전환되어 "승인 산출물" 이라는 의미가 사라졌다.
--   승인 결과 추적은 approved_organization_id / status / reviewed_at / reviewed_by 로 충분하다.
--
--   application consumer 는 Phase 3D-3 코드 정리에서 0 이 되었다
--   (admin 승인 화면의 teachers.phone 동기화 block 은 값이 항상 NULL 이라 이미 죽은 경로였다).
--
-- 순서가 중요하다
--   approve_teacher_signup_request 가 이 컬럼에 대입하고 있으므로 함수를 먼저 교체한 뒤
--   컬럼을 DROP 한다. 반대로 하면 함수가 깨진 상태로 남는다.
--
-- 이 migration 이 바꾸지 않는 것
--   reviewed_by / reviewed_at / approved_organization_id / status semantics 모두 그대로다.
--   teacher_signup_requests row DELETE 없음. teachers / organizations / profiles 에 대한 DML 없음.
--   RLS, 다른 컬럼, 다른 함수는 건드리지 않는다.

-- A. 승인 RPC 교체. Phase 2A 정의에서 approved_teacher_id 대입 한 줄만 제거한다.
--    SECURITY DEFINER / search_path / 반환 타입 / 에러 semantics 는 그대로 유지한다.
create or replace function public.approve_teacher_signup_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  r public.teacher_signup_requests%rowtype;
  org_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'forbidden';
  end if;

  select *
  into r
  from public.teacher_signup_requests
  where id = request_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if r.status <> 'pending' then
    raise exception 'already_reviewed';
  end if;

  insert into public.organizations (name, branch_name, address, address_detail)
  values (r.organization_name, r.branch_name, r.address, r.address_detail)
  returning id into org_id;

  insert into public.profiles (id, role, name, phone, organization_id)
  values (r.user_id, 'academy', r.teacher_name, r.teacher_phone, org_id)
  on conflict (id) do update
    set role = 'academy',
        name = excluded.name,
        phone = excluded.phone,
        organization_id = excluded.organization_id,
        updated_at = now();

  -- teachers INSERT 없음. 선생님 명부는 Studio 에서 직접 등록할 때만 만들어진다
  -- (createStudioTeacher: profile_id = NULL).

  update public.teacher_signup_requests
  set status = 'approved',
      approved_organization_id = org_id,
      reviewed_at = now(),
      updated_at = now()
  where id = request_id;
end;
$$;

-- CREATE OR REPLACE 는 기존 ACL 을 보존하지만, 권한 상태를 명시적으로 고정해 둔다.
grant execute on function public.approve_teacher_signup_request(uuid) to authenticated;

-- B. 컬럼 제거. FK(teacher_signup_requests_approved_teacher_id_fkey)는 컬럼과 함께 사라진다.
--    CASCADE 는 쓰지 않는다.
alter table public.teacher_signup_requests
  drop column if exists approved_teacher_id;

-- C. 사후 검증. row count 같은 시점 의존 값은 검사하지 않는다.
do $$
declare
  column_left integer;
  fk_left integer;
  fn_refs integer;
begin
  select count(*) into column_left
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'teacher_signup_requests'
    and column_name = 'approved_teacher_id';

  if column_left <> 0 then
    raise exception 'phase3d3_column_remaining';
  end if;

  select count(*) into fk_left
  from pg_constraint
  where conrelid = 'public.teacher_signup_requests'::regclass
    and conname = 'teacher_signup_requests_approved_teacher_id_fkey';

  if fk_left <> 0 then
    raise exception 'phase3d3_fk_remaining';
  end if;

  select count(*) into fn_refs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'approve_teacher_signup_request'
    and pg_get_functiondef(p.oid) ilike '%approved_teacher_id%';

  if fn_refs <> 0 then
    raise exception 'phase3d3_function_still_references_column';
  end if;

  -- 승인 감사 필드는 그대로 남아 있어야 한다.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'teacher_signup_requests'
      and column_name in ('approved_organization_id', 'reviewed_at', 'reviewed_by')
    having count(*) = 3
  ) then
    raise exception 'phase3d3_audit_columns_missing';
  end if;
end
$$;
