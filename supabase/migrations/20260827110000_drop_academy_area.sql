-- Phase 3C-2: legacy 학원가 컬럼 academy_area 최종 제거.
--
-- 공개 탐색(/classes, /academies)과 Studio/Admin 화면은 organizations.sido / sigungu / bname
-- 으로 완전히 전환됐고, repository runtime 의 academy_area read / write / UI / type 은 0건이다.
-- 가입 트리거는 20260827100000 에서 structured metadata 를 저장하도록 이미 고쳤고,
-- teacher_signup_requests 는 pending 0 (approved 7 / rejected 1) 이라 진행 중인 승인 흐름이 없다.
--
-- 컬럼을 지우기 전에 컬럼을 참조하는 DB 함수 2개를 먼저 정리한다.
-- 순서가 바뀌면 함수가 존재하지 않는 컬럼을 참조해 승인/조회가 깨진다.
--
-- historical migration 은 수정하지 않는다. 이 파일 하나로만 앞으로 나아간다.

-- 1. list_pending_teacher_signup_requests: 반환 타입에서 academy_area 만 뺀다.
--    RETURNS TABLE 의 시그니처가 바뀌므로 CREATE OR REPLACE 로는 교체할 수 없어 DROP 후 재생성한다.
--    나머지 반환 컬럼 / 정렬 / admin 검사 / SECURITY DEFINER / search_path 는 그대로 유지한다.
drop function if exists public.list_pending_teacher_signup_requests();

create or replace function public.list_pending_teacher_signup_requests()
returns table (
  request_id uuid,
  user_id uuid,
  signup_email text,
  organization_name text,
  branch_name text,
  address text,
  address_detail text,
  teacher_name text,
  teacher_phone text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, app
as $$
  select
    r.id as request_id,
    r.user_id,
    r.signup_email,
    r.organization_name,
    r.branch_name,
    r.address,
    r.address_detail,
    r.teacher_name,
    r.teacher_phone,
    r.status,
    r.created_at
  from public.teacher_signup_requests r
  where exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
    and r.status = 'pending'
  order by r.created_at desc
$$;

-- DROP 으로 사라진 실행 권한을 원래대로 되돌린다.
grant execute on function public.list_pending_teacher_signup_requests() to authenticated;

-- 2. approve_teacher_signup_request: organizations INSERT 에서 academy_area 컬럼만 뺀다.
--    이 컬럼이 남아 있으면 아래 DROP 이후 승인 시 42703 으로 깨진다.
--    나머지 동작(admin 검사 / 잠금 / 상태 검사 / profiles / teachers / 상태 갱신)은 그대로 두고,
--    행정지역·사업자·연락처 보정은 지금처럼 승인 직후 app 단 UPDATE 가 담당한다.
create or replace function public.approve_teacher_signup_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  r public.teacher_signup_requests%rowtype;
  org_id uuid;
  teacher_id uuid;
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

  insert into public.teachers (profile_id, organization_id, display_name, intro, specialty, career_years, is_active)
  values (r.user_id, org_id, coalesce(nullif(trim(r.teacher_name), ''), '학원 관리자'), null, null, 0, true)
  returning id into teacher_id;

  update public.teacher_signup_requests
  set status = 'approved',
      approved_organization_id = org_id,
      approved_teacher_id = teacher_id,
      reviewed_at = now(),
      updated_at = now()
  where id = request_id;
end;
$$;

-- 3. CHECK 제약은 컬럼과 함께 자동으로 사라지지만, 재실행 안전성을 위해 먼저 명시적으로 지운다.
alter table public.teacher_signup_requests
  drop constraint if exists teacher_signup_requests_academy_area_check;

alter table public.organizations
  drop constraint if exists organizations_academy_area_check;

-- 4. 컬럼 제거. DEFAULT '후곡학원가' 와 NOT NULL 도 컬럼과 함께 사라진다.
alter table public.teacher_signup_requests
  drop column if exists academy_area;

alter table public.organizations
  drop column if exists academy_area;
