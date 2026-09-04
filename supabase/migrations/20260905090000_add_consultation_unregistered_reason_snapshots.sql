-- 상담 시점의 미등록 사유를 이력으로 보존한다.
--
-- trial_applications.unregistered_reason 은 "현재 등록 결정"이라 상담 재개
-- (not_enrolled → pending) 시 계약대로 null 이 된다. 그때 구조화된 사유가
-- 영구 소실되지 않도록, 상담 이벤트마다 그 시점의 사유를 따로 남긴다.
--
-- 기존 row 는 건드리지 않는다(update 0). legacy row 는 null 로 남는다.

alter table public.consultation_logs
  add column if not exists unregistered_reason_snapshot text,
  add column if not exists unregistered_reason_note_snapshot text;

comment on column public.consultation_logs.unregistered_reason_snapshot is
  '그 상담 시점의 미등록 사유. trial_applications.unregistered_reason 의 현재 값과 달리 이후 재개로 지워지지 않는다.';
comment on column public.consultation_logs.unregistered_reason_note_snapshot is
  '미등록 사유가 other 일 때의 자유 입력 스냅샷.';

-- 값 목록은 trial_applications_unregistered_reason_check 와 동일하게 유지한다.
alter table public.consultation_logs
  add constraint consultation_logs_unregistered_reason_snapshot_check
  check (
    unregistered_reason_snapshot is null
    or unregistered_reason_snapshot in (
      'schedule_mismatch',
      'cost_burden',
      'distance',
      'child_reaction',
      'comparing_other_academies',
      'no_response',
      'other',
      'class_level_mismatch'
    )
  );

-- trial_applications_unregistered_reason_status_check 와 같은 결합 규칙.
-- 새 컬럼이라 기존 row 는 전부 null 이므로 legacy 데이터와 충돌하지 않는다.
--
-- 반대 방향(not_enrolled 이면 사유가 반드시 있어야 한다)은 걸지 않는다.
-- 사유 없이 not_enrolled 로 남은 legacy 이력이 실제로 존재한다.
alter table public.consultation_logs
  add constraint consultation_logs_unregistered_reason_snapshot_status_check
  check (
    unregistered_reason_snapshot is null
    or registration_status_snapshot = 'not_enrolled'
  );

-- UPDATE 권한은 주지 않는다. 상담 수정 경로는 채널/감정/메모/다음 연락만 바꾸고
-- 등록 결정 스냅샷은 불변이다. 필요해지면 별도 Phase 에서 판단한다.
