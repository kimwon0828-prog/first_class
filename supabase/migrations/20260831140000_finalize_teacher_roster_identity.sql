-- Phase 3C: 학부모 공개 view 폐기 + 남은 system teacher 2건 roster 전환
--
-- 배경
--   teachers 는 학원 내부 명부이고 학부모에게는 선생님 정보를 공개하지 않기로 확정했다.
--   application 에서 teacher_public_profiles consumer 는 이미 0 이며,
--   production 스키마 확인 결과 이 view 에 의존하는 다른 view/function/policy 도 없다.
--
--   Phase 3B 이후 남은 profile_id NOT NULL teacher 는 2건이다.
--     5a19e778…  내부/개발 조직(1ae6a9bd)의 admin 계정에 연결된 row.
--                담당 수업 4건이 모두 비활성이고 조직 전체가 사실상 운영 종료 상태다.
--     7e652ae6…  '첫수업 데모학원' 시더가 만든 row. 데모 신청 6건/블록 3건/문자 1건이 물려 있다.
--
-- 실행 순서가 중요하다
--   view 를 먼저 DROP 한 뒤에 profile_id 를 NULL 로 바꾼다.
--   순서를 바꾸면 두 row 가 잠시 view 조건(is_active AND profile_id IS NULL)을 만족하고,
--   특히 5a19e778 은 public_visibility 가 7/7 전부 true 라 그 순간 실명이 공개 대상이 된다.
--
-- 이 migration 이 바꾸지 않는 것
--   teachers DELETE 없음. classes / trial_applications / schedule_blocks / sms_logs /
--   profiles / organizations 에 대한 DML 없음. FK 를 건드리지 않으므로 두 teacher id 를
--   가리키는 기존 참조는 전부 그대로 유지된다.
--   teacher_signup_requests.approved_teacher_id 도 이번에는 손대지 않는다(Phase 3D).
--   legacy public 컬럼과 Phase 3B backup table 도 유지한다.

do $$
declare
  internal_id uuid := '5a19e778-ae84-47b2-8d29-653d4b3094e0';
  demo_id uuid := '7e652ae6-20af-475d-8dfc-12b53542e2ae';
  system_count integer;
  target_count integer;
begin
  -- 1) system teacher 가 정확히 2건이고, 그 2건이 지정한 id 와 일치해야 한다.
  select count(*) into system_count
  from public.teachers
  where profile_id is not null;

  if system_count <> 2 then
    raise exception 'phase3c_system_count_failed: expected 2, got %', system_count;
  end if;

  select count(*) into target_count
  from public.teachers
  where id in (internal_id, demo_id)
    and profile_id is not null;

  if target_count <> 2 then
    raise exception 'phase3c_target_precondition_failed: expected 2, got %', target_count;
  end if;

  -- 2) 두 row 모두 현재 활성이어야 한다(전환 전 상태 확인).
  if not exists (select 1 from public.teachers where id = internal_id and is_active) then
    raise exception 'phase3c_internal_not_active';
  end if;

  if not exists (select 1 from public.teachers where id = demo_id and is_active) then
    raise exception 'phase3c_demo_not_active';
  end if;

  -- 3) 참조가 살아 있는지 "존재" 기준으로만 확인한다.
  --    DELETE 가 아니라 UPDATE 이므로 정확한 건수까지 고정하면 불필요하게 취약해진다.
  if not exists (select 1 from public.classes where teacher_id = internal_id)
     or not exists (select 1 from public.trial_applications where assigned_teacher_id = internal_id)
     or not exists (select 1 from public.schedule_blocks where teacher_id = internal_id) then
    raise exception 'phase3c_internal_refs_missing';
  end if;

  if not exists (select 1 from public.classes where teacher_id = demo_id)
     or not exists (select 1 from public.trial_applications where assigned_teacher_id = demo_id)
     or not exists (select 1 from public.schedule_blocks where teacher_id = demo_id)
     or not exists (select 1 from public.sms_logs where teacher_id = demo_id) then
    raise exception 'phase3c_demo_refs_missing';
  end if;

  -- 4) backup table 이 이미 있으면 덮어쓰지 않고 멈춘다.
  if to_regclass('public.legacy_used_system_teachers_backup_20260831') is not null then
    raise exception 'phase3c_backup_table_already_exists';
  end if;
end
$$;

-- 학부모 공개 경로를 먼저 없앤다. 의존 object 가 없으므로 CASCADE 를 쓰지 않는다.
drop view public.teacher_public_profiles;

-- UPDATE 직전 snapshot. select * 이므로 18개 컬럼 전체가 보존되고
-- profile_id / is_active 원본이 남아 되돌릴 수 있다.
create table public.legacy_used_system_teachers_backup_20260831 as
select *
from public.teachers
where id in (
  '5a19e778-ae84-47b2-8d29-653d4b3094e0',
  '7e652ae6-20af-475d-8dfc-12b53542e2ae'
);

-- 이름/전화번호가 담긴 복구 전용 테이블이다. public schema 의 default privileges 로
-- anon/authenticated 에 권한이 붙지 않게 회수하고 RLS 를 켜 정책 없이 둔다.
revoke all on table public.legacy_used_system_teachers_backup_20260831 from anon;
revoke all on table public.legacy_used_system_teachers_backup_20260831 from authenticated;
alter table public.legacy_used_system_teachers_backup_20260831 enable row level security;

do $$
declare
  internal_id uuid := '5a19e778-ae84-47b2-8d29-653d4b3094e0';
  demo_id uuid := '7e652ae6-20af-475d-8dfc-12b53542e2ae';
  backup_count integer;
  updated_count integer;
  remaining_system integer;
  teachers_total integer;
begin
  -- 5) backup 이 정확히 2건일 때만 전환한다.
  select count(*) into backup_count from public.legacy_used_system_teachers_backup_20260831;
  if backup_count <> 2 then
    raise exception 'phase3c_backup_count_failed: expected 2, got %', backup_count;
  end if;

  -- 6) 내부/개발 조직 row: 명부로 전환하되 비활성으로 둔다.
  --    담당 수업이 전부 비활성이고 신규 담당 옵션에 노출될 이유가 없다.
  update public.teachers
  set profile_id = null,
      is_active = false,
      updated_at = now()
  where id = internal_id;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'phase3c_internal_update_failed: %', updated_count;
  end if;

  -- 7) 데모 학원 row: 명부로 전환하고 활성 유지.
  --    데모 시나리오에서 담당 배정이 계속 가능해야 한다. 의도를 남기려고 is_active 도 명시한다.
  update public.teachers
  set profile_id = null,
      is_active = true,
      updated_at = now()
  where id = demo_id;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'phase3c_demo_update_failed: %', updated_count;
  end if;

  -- 8) 사후 검증.
  select count(*) into remaining_system from public.teachers where profile_id is not null;
  if remaining_system <> 0 then
    raise exception 'phase3c_postcheck_system_remaining: %', remaining_system;
  end if;

  select count(*) into teachers_total from public.teachers;
  if teachers_total <> 18 then
    raise exception 'phase3c_postcheck_total_changed: expected 18, got %', teachers_total;
  end if;

  if not exists (select 1 from public.teachers where id = internal_id and profile_id is null and is_active = false) then
    raise exception 'phase3c_postcheck_internal_state';
  end if;

  if not exists (select 1 from public.teachers where id = demo_id and profile_id is null and is_active = true) then
    raise exception 'phase3c_postcheck_demo_state';
  end if;

  -- 9) FK 를 건드리지 않았으므로 두 id 를 가리키는 참조가 그대로 살아 있어야 한다.
  if not exists (select 1 from public.classes where teacher_id = internal_id)
     or not exists (select 1 from public.trial_applications where assigned_teacher_id = internal_id)
     or not exists (select 1 from public.schedule_blocks where teacher_id = internal_id) then
    raise exception 'phase3c_postcheck_internal_refs_lost';
  end if;

  if not exists (select 1 from public.classes where teacher_id = demo_id)
     or not exists (select 1 from public.trial_applications where assigned_teacher_id = demo_id)
     or not exists (select 1 from public.schedule_blocks where teacher_id = demo_id)
     or not exists (select 1 from public.sms_logs where teacher_id = demo_id) then
    raise exception 'phase3c_postcheck_demo_refs_lost';
  end if;
end
$$;
