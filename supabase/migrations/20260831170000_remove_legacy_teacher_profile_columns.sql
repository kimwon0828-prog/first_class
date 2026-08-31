-- Phase 3D-2: teachers legacy 공개 프로필 컬럼 제거 + backup table 정리 + roster 인덱스 재정의
--
-- 배경
--   teachers 는 학원 내부 명부다. 학부모 공개 기능이 폐기되면서 teacher_public_profiles view 는
--   Phase 3C 에서 이미 DROP 되었고, Phase 3D-1 에서 application 이 아래 9개 컬럼을 읽지도 쓰지도
--   않도록 정리한 뒤 production 에 배포되었다. 이제 컬럼 자체를 제거한다.
--
--   담당 과목/대상 같은 정보는 teachers 컬럼이 아니라 classes.teacher_id 배정에서 파생한다.
--
-- backup table 을 먼저 정리하는 이유
--   두 backup 은 Phase 3B/3C 의 `select *` 스냅샷이라, teachers 에서 컬럼이 사라지는 순간
--   `insert into teachers select * from backup` 형태의 복원이 성립하지 않는다. 즉 컬럼 DROP 과
--   동시에 복원 가치가 사라지므로, PII 를 더 오래 두지 않고 같은 migration 에서 함께 제거한다.
--   fresh database 에는 두 table 이 없으므로 IF EXISTS 로 no-op 이다.
--
-- 인덱스 재정의
--   idx_teachers_org_active_created_at_partial 은 WHERE profile_id IS NULL 부분 인덱스였다.
--   profile_id 는 이제 "선생님에게 파트너센터 로그인 권한을 연결" 하는 optional link 이고,
--   link 된 강사도 명부에 계속 보여야 하므로(3D-1 에서 READ 필터 제거) 부분 조건을 없앤다.
--
-- 이 migration 이 바꾸지 않는 것
--   teachers row DELETE 없음. profile_id / classes / trial_applications / schedule_blocks /
--   sms_logs / profiles / organizations 에 대한 DML 없음. RLS, FK, trigger, approved_teacher_id,
--   approve RPC, teachers_organization_id_idx 모두 그대로 둔다.

-- A. backup table 제거. fresh database 에서는 존재하지 않으므로 no-op.
drop table if exists public.legacy_system_teachers_backup_20260830;
drop table if exists public.legacy_used_system_teachers_backup_20260831;

-- B. legacy 공개 프로필 컬럼 9개 제거.
--    teachers_career_years_check 는 career_years 와 함께 자동으로 사라진다. CASCADE 는 쓰지 않는다.
alter table public.teachers
  drop column if exists intro,
  drop column if exists specialty,
  drop column if exists career_years,
  drop column if exists subjects,
  drop column if exists target_students,
  drop column if exists specialties,
  drop column if exists short_intro,
  drop column if exists teaching_style,
  drop column if exists public_visibility;

-- C/D. 부분 인덱스를 일반 roster 인덱스로 교체.
drop index if exists public.idx_teachers_org_active_created_at_partial;

create index if not exists teachers_org_active_created_at_idx
  on public.teachers (organization_id, is_active, created_at);

-- E. 사후 검증. row count 같은 시점 의존 값은 검사하지 않는다.
do $$
declare
  legacy_left integer;
  column_total integer;
begin
  select count(*) into legacy_left
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'teachers'
    and column_name in (
      'intro', 'specialty', 'career_years', 'subjects', 'target_students',
      'specialties', 'short_intro', 'teaching_style', 'public_visibility'
    );

  if legacy_left <> 0 then
    raise exception 'phase3d2_legacy_columns_remaining: %', legacy_left;
  end if;

  select count(*) into column_total
  from information_schema.columns
  where table_schema = 'public' and table_name = 'teachers';

  if column_total <> 9 then
    raise exception 'phase3d2_unexpected_column_count: expected 9, got %', column_total;
  end if;

  if to_regclass('public.legacy_system_teachers_backup_20260830') is not null
     or to_regclass('public.legacy_used_system_teachers_backup_20260831') is not null then
    raise exception 'phase3d2_backup_table_remaining';
  end if;

  if to_regclass('public.idx_teachers_org_active_created_at_partial') is not null then
    raise exception 'phase3d2_partial_index_remaining';
  end if;

  if to_regclass('public.teachers_org_active_created_at_idx') is null then
    raise exception 'phase3d2_new_index_missing';
  end if;
end
$$;
