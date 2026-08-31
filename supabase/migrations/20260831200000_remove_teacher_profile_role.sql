-- Phase 3E-4: profiles.role 허용값에서 'teacher' 제거
--
-- 배경
--   'teacher' 는 "선생님이 직접 로그인하던" 초기 설계의 profile role 이다. 지금 파트너센터는
--   학원당 로그인 계정 1개(academy) + 운영자(admin) 구조이고, 선생님 로그인 UI 자체가 없다.
--   teachers 는 로그인 없는 내부 명부이며 Studio access 는 teachers 를 조회하지 않는다.
--   production profiles 에 role='teacher' row 는 0 건이고, 이 값을 만들어 내는 코드 경로도 없다
--   (parent signup 은 'parent', 승인 RPC 는 'academy' 를 하드코딩한다).
--
--   application 소비처는 Phase 3E-4 코드 정리에서 0 이 되었다
--   (normalizeProfileRole / STUDIO_ROLES / studio-sign-in / oauth conflict / current-auth /
--    parent 화면 3곳의 studio 판별 분기).
--
-- ⚠️ app.current_role() 은 건드리지 않는다
--   이 함수는 academy|admin 을 RLS 내부 role 문자열 'teacher' 로 folding 한다. 23 개 정책이
--   그 문자열에 의존하므로 profiles.role 의 'teacher' 제거와는 완전히 다른 개념이다.
--   role='teacher' row 가 0 이라 `else role` 로 'teacher' 가 반환되던 경로만 사라질 뿐,
--   folding 결과와 RLS semantics 는 그대로다. 이 migration 은 함수/정책을 수정하지 않는다.
--
-- 이 migration 이 바꾸지 않는 것
--   profiles row 에 대한 DML 없음. teachers / organizations / auth metadata / RLS / trigger /
--   RPC / operator role 모두 그대로다. constraint 이름도 유지한다.

do $$
declare
  teacher_rows integer;
  roles_before text;
  roles_after text;
  check_def text;
  org_check_def text;
  folding_ok boolean;
begin
  -- A. precondition: role='teacher' row 가 남아 있으면 절대 진행하지 않는다.
  select count(*) into teacher_rows from public.profiles where role = 'teacher';

  if teacher_rows <> 0 then
    raise exception 'phase3e4_teacher_profiles_present: %', teacher_rows;
  end if;

  -- 비교용 스냅샷. 시점 의존 값을 하드코딩하지 않고 migration 내부에서만 비교한다.
  select coalesce(string_agg(r.role || '=' || r.cnt, ',' order by r.role), '(none)')
  into roles_before
  from (select role, count(*) as cnt from public.profiles group by role) r;

  -- B/C. 기존 constraint 제거. CASCADE 는 쓰지 않는다.
  execute $ddl$
    alter table public.profiles
      drop constraint if exists profiles_role_org_check
  $ddl$;

  execute $ddl$
    alter table public.profiles
      drop constraint if exists profiles_role_check
  $ddl$;

  -- D/E. 새 정의로 재생성. 기존 데이터가 위반하면 여기서 스스로 실패한다.
  execute $ddl$
    alter table public.profiles
      add constraint profiles_role_check
      check (role = any (array['parent', 'academy', 'admin']))
  $ddl$;

  execute $ddl$
    alter table public.profiles
      add constraint profiles_role_org_check
      check (
        (role = 'parent' and organization_id is null)
        or (role = any (array['academy', 'admin']) and organization_id is not null)
      )
  $ddl$;

  -- F. 사후 검증
  select pg_get_constraintdef(oid) into check_def
  from pg_constraint
  where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check';

  if check_def is null or check_def like '%teacher%' then
    raise exception 'phase3e4_role_check_still_allows_teacher: %', coalesce(check_def, '(missing)');
  end if;

  select pg_get_constraintdef(oid) into org_check_def
  from pg_constraint
  where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_org_check';

  if org_check_def is null or org_check_def like '%teacher%' then
    raise exception 'phase3e4_org_check_still_allows_teacher: %', coalesce(org_check_def, '(missing)');
  end if;

  -- 데이터 불변
  select coalesce(string_agg(r.role || '=' || r.cnt, ',' order by r.role), '(none)')
  into roles_after
  from (select role, count(*) as cnt from public.profiles group by role) r;

  if roles_after is distinct from roles_before then
    raise exception 'phase3e4_profile_rows_changed: % -> %', roles_before, roles_after;
  end if;

  -- RLS folding 은 그대로 살아 있어야 한다. (이 migration 은 함수를 수정하지 않지만,
  --  실수로 함께 바뀌는 상황을 여기서 잡는다.)
  select pg_get_functiondef(p.oid) ilike '%when role in (''academy'', ''admin'') then ''teacher''%'
  into folding_ok
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.proname = 'current_role';

  if folding_ok is not true then
    raise exception 'phase3e4_current_role_folding_broken';
  end if;
end
$$;
