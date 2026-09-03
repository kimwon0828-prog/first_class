-- 정규수업 희망 일정(체험 이후 등록 상담에서 확인한 등록 가능 일정) 저장 foundation.
--
-- 이 migration 은 그릇만 만든다. 값을 쓰는 경로는 CONSULT-4 에서 붙인다.
--
-- ⚠️ 기존 컬럼과 혼동하지 않는다.
--   trial_applications.preferred_regular_schedule (text) 은 "체험 신청 당시" 학부모가
--   자유 텍스트로 적은 값이다. 여기서 만드는 컬럼과 의미가 다르므로 변환하지 않고,
--   삭제·rename 도 하지 않는다. trial_results.recommended_schedule 도 건드리지 않는다.
--
-- backfill 0 건. 새 컬럼은 전부 NULL 로 시작한다.
--   NULL      = 상담에서 아직 기록하지 않음
--   undecided = 상담했으나 학부모가 아직 결정하지 못함
--   specified = 실제 가능 조건을 확인함

alter table public.trial_applications
  add column if not exists regular_schedule_preference jsonb,
  add column if not exists regular_schedule_preference_note text,
  add column if not exists regular_schedule_preference_updated_at timestamptz;

alter table public.consultation_logs
  add column if not exists regular_schedule_preference_snapshot jsonb,
  add column if not exists regular_schedule_preference_note_snapshot text;

-- ─────────────────────────────────────────────────────────────
-- 최소 구조 constraint.
--
-- DB 를 JSON schema engine 으로 만들지 않는다. 여기서는 절대 깨지면 안 되는
-- 구조(object / version / state / groups 배열 / group 개수)만 막는다.
-- 요일 정렬·중복, 시간 정규식, range 순서, group 중복은 server validator 담당이다.
--
-- ⚠️ CHECK 는 TRUE 뿐 아니라 NULL 일 때도 통과한다.
--   키가 없으면 `preference->>'version'` 이 SQL NULL 이 되고,
--   `NULL = '1'` 은 NULL 이라 `{}` 같은 값이 그대로 들어간다.
--   그래서 전체 식을 coalesce(..., false) 로 감싸 NULL 을 반드시 거짓으로 만든다.
-- ─────────────────────────────────────────────────────────────

alter table public.trial_applications
  add constraint trial_applications_regular_schedule_preference_shape_check
  check (
    regular_schedule_preference is null
    or coalesce(
      jsonb_typeof(regular_schedule_preference) = 'object'
      and jsonb_typeof(regular_schedule_preference -> 'version') = 'number'
      and regular_schedule_preference ->> 'version' = '1'
      and regular_schedule_preference ->> 'state' in ('specified', 'undecided')
      and jsonb_typeof(regular_schedule_preference -> 'groups') = 'array'
      and jsonb_array_length(regular_schedule_preference -> 'groups') <= 3,
      false
    )
  );

alter table public.consultation_logs
  add constraint consultation_logs_regular_schedule_preference_shape_check
  check (
    regular_schedule_preference_snapshot is null
    or coalesce(
      jsonb_typeof(regular_schedule_preference_snapshot) = 'object'
      and jsonb_typeof(regular_schedule_preference_snapshot -> 'version') = 'number'
      and regular_schedule_preference_snapshot ->> 'version' = '1'
      and regular_schedule_preference_snapshot ->> 'state' in ('specified', 'undecided')
      and jsonb_typeof(regular_schedule_preference_snapshot -> 'groups') = 'array'
      and jsonb_array_length(regular_schedule_preference_snapshot -> 'groups') <= 3,
      false
    )
  );

comment on column public.trial_applications.regular_schedule_preference is
  '체험 이후 등록 상담에서 확인한 정규수업 등록 가능 일정(구조화). 신청 시 자유 입력인 preferred_regular_schedule 과 다른 값이다.';

comment on column public.trial_applications.regular_schedule_preference_note is
  '정규수업 희망 일정에 대한 추가 설명. 일반 상담 메모(consultation_logs.note)와 분리한다.';

comment on column public.trial_applications.regular_schedule_preference_updated_at is
  '현재 희망 일정을 마지막으로 확인/수정한 시각. application.updated_at 을 재사용하지 않는다.';

comment on column public.consultation_logs.regular_schedule_preference_snapshot is
  '해당 상담 시점의 희망 일정 스냅샷. registration_status_snapshot 과 같은 방식이다.';

comment on column public.consultation_logs.regular_schedule_preference_note_snapshot is
  '해당 상담 시점의 희망 일정 메모 스냅샷.';
