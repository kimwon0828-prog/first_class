-- Phase 3E-2: organizations.teacher_seat_limit 제거
--
-- 배경
--   이 컬럼은 "학원당 선생님 계정 수" 를 과금 단위로 쓰던 초기 설계의 잔재다.
--   teachers 는 로그인 없는 내부 명부가 되었고(Phase 1~3D), 파트너센터는 학원당 로그인 계정
--   1개 정책이라 teacher 수를 seat 으로 셀 이유가 없다. createStudioTeacher 도 이미 이 값으로
--   등록을 막지 않는다.
--
--   application 소비처는 Phase 3E-2 코드 정리로 0 이 되었다
--   (StudioTeacherSeatSummary 타입 / adapter interface / 양쪽 구현 모두 제거).
--   production 7개 organization 이 전부 default 3 이라 사용자별 커스텀 설정 이력도 없다.
--
--   향후 멀티 멤버 과금이 필요해지면 teacher seat 이 아니라 academy member/profile seat 으로
--   새로 설계한다. 그 때 이 컬럼을 되살리지 않는다.
--
-- CASCADE 를 쓰지 않는 이유
--   view/policy 가 이 컬럼에 의존하고 있으면 DROP COLUMN 이 스스로 실패해야 한다.
--   조용히 다른 객체를 지우는 것보다 migration 이 멈추는 편이 안전하다.
--
-- 이 migration 이 바꾸지 않는 것
--   organizations 의 다른 컬럼, row, teachers, profiles 에 대한 DML 없음.
--   teachers.profile_id / FK / UNIQUE / RLS / trigger / RPC 모두 그대로다.

do $$
declare
  org_count_before integer;
  org_count_after integer;
  column_left integer;
  constraint_left integer;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'teacher_seat_limit'
  ) then
    raise notice 'phase3e2_skip: organizations.teacher_seat_limit already absent';
    return;
  end if;

  select count(*) into org_count_before from public.organizations;

  -- CHECK 제약은 컬럼과 함께 사라지지만, 의도를 남기기 위해 먼저 명시적으로 제거한다.
  execute $ddl$
    alter table public.organizations
      drop constraint if exists organizations_teacher_seat_limit_check
  $ddl$;

  execute $ddl$
    alter table public.organizations
      drop column teacher_seat_limit
  $ddl$;

  -- 사후 검증
  select count(*) into column_left
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'organizations'
    and column_name = 'teacher_seat_limit';

  if column_left <> 0 then
    raise exception 'phase3e2_column_remaining';
  end if;

  select count(*) into constraint_left
  from pg_constraint
  where conrelid = 'public.organizations'::regclass
    and conname = 'organizations_teacher_seat_limit_check';

  if constraint_left <> 0 then
    raise exception 'phase3e2_constraint_remaining';
  end if;

  -- row 수는 하드코딩하지 않고 migration 시작 시점 값과 비교한다.
  select count(*) into org_count_after from public.organizations;

  if org_count_after <> org_count_before then
    raise exception 'phase3e2_organization_rows_changed: % -> %', org_count_before, org_count_after;
  end if;

  -- organizations 의 다른 핵심 컬럼이 함께 사라지지 않았는지 확인한다.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations'
      and column_name in ('id', 'name', 'branch_name', 'address')
    having count(*) = 4
  ) then
    raise exception 'phase3e2_organization_columns_missing';
  end if;
end
$$;
