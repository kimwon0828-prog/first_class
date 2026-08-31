-- Phase 3B: PURE_MAPPING legacy system teacher 5건 정리
--
-- 배경
--   Phase 2A 이전의 학원 가입 승인은 teachers 에 profile_id 가 채워진 mapping row 를
--   함께 만들었다. 이 row 는 실제 강사가 아니라 Studio 접근 게이트 통과용이었고,
--   Phase 1 / sign-in 수정으로 접근 판단이 profiles + organization 으로 옮겨가면서
--   더 이상 필요하지 않다. Phase 2A 적용 이후 신규 생성도 멈췄다.
--
-- 이 migration 이 지우는 것
--   아래 explicit 5건뿐이다. 조건 기반 광범위 DELETE 를 쓰지 않는다.
--   실행 시점 데이터가 조사 결과와 다르면 assertion 이 전체를 중단시킨다.
--
-- 이 migration 이 지우지 않는 것
--   USED_AS_TEACHER 2건(5a19e778…, 7e652ae6…)은 classes / trial_applications /
--   schedule_blocks 에서 아직 참조되므로 Phase 3C 에서 수동 처리한다.
--   roster teacher(profile_id IS NULL) 16건도 전혀 건드리지 않는다.
--
-- FK 영향 (production 확인 기준)
--   classes.teacher_id                        ON DELETE SET NULL
--   trial_applications.assigned_teacher_id    ON DELETE SET NULL
--   schedule_blocks.teacher_id                ON DELETE CASCADE  ← 가장 위험
--   sms_logs.teacher_id                       ON DELETE SET NULL
--   teacher_signup_requests.approved_teacher_id ON DELETE SET NULL
--   대상 5건은 앞의 4종 참조가 모두 0 이므로 운영 데이터에 영향이 없다.
--   approved_teacher_id 5건만 NULL 이 되며, status / approved_organization_id /
--   reviewed_at / user_id 등 승인 감사 정보는 그대로 남는다.
--
-- 복구
--   삭제 직전 legacy_system_teachers_backup_20260830 에 18개 컬럼 전체를 snapshot 한다.
--   backup table 은 Phase 3C 완료 후 DROP 한다.

-- replay 호환성
--   이 migration 은 production legacy data cleanup 이다. 대상 5건이 없는 fresh database
--   (supabase db reset 등)에서는 지울 것이 없으므로 전체를 no-op 으로 건너뛴다.
--   backup table 도 그때는 만들지 않는다. production 에는 이미 applied 되어 재실행되지 않는다.

do $$
declare
  target_ids uuid[] := array[
    'c36f34d9-3412-4600-8182-6bcf53425d6f',
    '7aebcdc8-9e29-44a4-a6ef-f7ab40f1b6d3',
    '87f5f2b4-7283-4dbc-b592-b3f3768a1702',
    '51e25220-873d-40f1-b951-cf063142f9ca',
    '180bb1b2-bca2-4ef3-94e4-749679aeb729'
  ]::uuid[];
  protected_ids uuid[] := array[
    '5a19e778-ae84-47b2-8d29-653d4b3094e0',
    '7e652ae6-20af-475d-8dfc-12b53542e2ae'
  ]::uuid[];
  target_count integer;
  system_count integer;
  bad_count integer;
  backup_count integer;
  deleted_count integer;
  remaining_target integer;
  remaining_protected integer;
  remaining_system integer;
begin
  -- 1) 대상 5건이 모두 존재하고 전부 profile_id 가 채워져 있어야 한다.
  select count(*) into target_count
  from public.teachers t
  where t.id = any(target_ids)
    and t.profile_id is not null;

  -- fresh database: 정리할 legacy row 가 없으므로 아무 것도 하지 않는다.
  if target_count = 0 then
    raise notice 'phase3b: no legacy system teachers found; skipping cleanup';
    return;
  end if;

  if target_count <> 5 then
    raise exception 'phase3b_target_precondition_failed: expected 5 rows with profile_id, got %', target_count;
  end if;

  -- 2) 실사용 참조 4종이 전부 0 이어야 한다.
  select count(*) into bad_count
  from public.teachers t
  where t.id = any(target_ids)
    and (
      exists (select 1 from public.classes c where c.teacher_id = t.id)
      or exists (select 1 from public.trial_applications a where a.assigned_teacher_id = t.id)
      or exists (select 1 from public.schedule_blocks b where b.teacher_id = t.id)
      or exists (select 1 from public.sms_logs l where l.teacher_id = t.id)
    );

  if bad_count <> 0 then
    raise exception 'phase3b_reference_precondition_failed: % target rows still referenced', bad_count;
  end if;

  -- 3) 보호 대상이 삭제 목록에 섞이지 않았는지 확인한다.
  if exists (select 1 from unnest(protected_ids) p(id) where p.id = any(target_ids)) then
    raise exception 'phase3b_protected_row_in_target_list';
  end if;

  -- 4) 조사 시점과 동일한 구조인지 확인한다.
  select count(*) into system_count
  from public.teachers
  where profile_id is not null;

  if system_count <> 7 then
    raise exception 'phase3b_system_teacher_count_changed: expected 7, got %', system_count;
  end if;

  -- 삭제 직전 snapshot. select * 이므로 18개 컬럼 전체가 보존되고,
  -- 이후 컬럼이 추가/변경되어도 복원 시 누락이 생기지 않는다.
  -- (조건부 실행이라 DDL 을 execute 로 감싼다. 모두 migration 내부 고정 문자열이다.)
  execute $ddl$
    create table public.legacy_system_teachers_backup_20260830 as
    select *
    from public.teachers
    where id in (
      'c36f34d9-3412-4600-8182-6bcf53425d6f',
      '7aebcdc8-9e29-44a4-a6ef-f7ab40f1b6d3',
      '87f5f2b4-7283-4dbc-b592-b3f3768a1702',
      '51e25220-873d-40f1-b951-cf063142f9ca',
      '180bb1b2-bca2-4ef3-94e4-749679aeb729'
    )
  $ddl$;

  -- backup 은 이름/전화번호가 들어 있는 복구 전용 테이블이다.
  -- public schema 의 default privileges 로 anon/authenticated 에 권한이 붙지 않게 회수하고,
  -- RLS 를 켜 정책 없이 두어 service_role/postgres 외에는 접근할 수 없게 한다.
  execute 'revoke all on table public.legacy_system_teachers_backup_20260830 from anon';
  execute 'revoke all on table public.legacy_system_teachers_backup_20260830 from authenticated';
  execute 'alter table public.legacy_system_teachers_backup_20260830 enable row level security';

  -- 5) backup 이 정확히 5건인지 확인한 뒤에만 삭제한다.
  select count(*) into backup_count from public.legacy_system_teachers_backup_20260830;
  if backup_count <> 5 then
    raise exception 'phase3b_backup_count_failed: expected 5, got %', backup_count;
  end if;

  -- 6) explicit id 로만 삭제한다.
  delete from public.teachers
  where id in (
    'c36f34d9-3412-4600-8182-6bcf53425d6f',
    '7aebcdc8-9e29-44a4-a6ef-f7ab40f1b6d3',
    '87f5f2b4-7283-4dbc-b592-b3f3768a1702',
    '51e25220-873d-40f1-b951-cf063142f9ca',
    '180bb1b2-bca2-4ef3-94e4-749679aeb729'
  );

  get diagnostics deleted_count = row_count;
  if deleted_count <> 5 then
    raise exception 'phase3b_delete_count_failed: expected 5, deleted %', deleted_count;
  end if;

  -- 7) 사후 검증.
  select count(*) into remaining_target
  from public.teachers
  where id = any(target_ids);
  if remaining_target <> 0 then
    raise exception 'phase3b_postcheck_target_remaining: %', remaining_target;
  end if;

  select count(*) into remaining_protected
  from public.teachers
  where id = any(protected_ids);
  if remaining_protected <> 2 then
    raise exception 'phase3b_postcheck_protected_missing: expected 2, got %', remaining_protected;
  end if;

  select count(*) into remaining_system
  from public.teachers
  where profile_id is not null;
  if remaining_system <> 2 then
    raise exception 'phase3b_postcheck_system_count: expected 2, got %', remaining_system;
  end if;
end
$$;
