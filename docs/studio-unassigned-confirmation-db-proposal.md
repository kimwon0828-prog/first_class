# Studio 미배정 일정 확정 — 최소 DB 변경 제안

작성: 2026-09-28. **검토 문서이며 적용용 migration이 아니다.**

최신 요청에 따라 구현을 중단했다. 이번 턴에서 시도한 코드 변경은 작업 시작 시점으로 복원했고, 기존 dirty/untracked 작업은 보존했다. 이 문서만 새로 추가한다. DB 연결·migration 생성/적용·운영 데이터 쓰기·commit/push 없음.

## 결론

`trial_applications.assigned_teacher_id`는 이미 nullable이다. 문제는 이 열의 NOT NULL이 아니라 다음 두 차단 지점이다.

1. `updateApplicationStatusAction`이 `post_assign + 미배정` 확정을 명시적으로 거절한다.
2. `trial_applications_confirmed_state_check`가 **확정 시각이 있으면 확정 예약 블록도 반드시 있어야 한다**고 요구한다. adapter의 미배정 분기는 시각만 저장하므로 이 CHECK를 위반한다.

최소 DB 변경은 **기존 CHECK에 한정된 예외를 추가하는 것**이다. `class_schedule_id`로 실제 수업 일정이 연결된 미배정 신청은 `confirmed_schedule_block_id = null`이어도 확정할 수 있게 한다. 체험 완료로 넘어갈 때도 같은 데이터가 유효해야 하므로 이 예외에는 `completed`도 포함한다.

`schedule_blocks.teacher_id NOT NULL`, 기존 블록/FK, status enum, RLS, registration/report 계약은 변경하지 않는다. 다만 CHECK 변경만으로 제품 기능이 완성되지는 않는다. 서버 action·후속 담당자 배정·UI·알림 집계 수정과 실제 DB 회귀 검증을 함께 완료해야 한다.

**근거 범위:** 현재 작업 폴더의 migration 전체 검색 및 실제 호출부 조사. 운영 DB의 catalog나 migration 적용 이력은 조회하지 않았다. 따라서 아래는 저장소 기준 결론이며, 운영 DB가 동일하다는 주장은 아니다. 로컬 Docker daemon에도 연결되지 않아 실제 PostgreSQL 검증은 수행하지 않았다.

## 1. 실제 저장 경로와 강제 지점

| 경로 / 근거 | 현재 계약 | 판정 |
| --- | --- | --- |
| `app/studio/(dashboard)/applications/[id]/page.tsx` → `ApplicationTrialResultWorkflow` → `ApplicationStatusActionForm` | new는 신청 확인, reviewing은 일정 확정 버튼 | UI 선행 단계 |
| `src/features/studio/actions/update-application-status.ts`의 `ACTION_CONFIG` | 확정 허용 현재 상태는 reviewing뿐 | new 직접 확정은 서버에서도 차단 |
| 같은 action의 `classAssignmentMode === "post_assign" && !assignedTeacherId` | 담당 선생님을 먼저 지정하라는 에러 | 명시적 담당자 필수 가드 |
| `src/shared/lib/db/supabase-adapter.ts`의 `updateStudioApplicationStatus` | 희망 블록 또는 class schedule 조회 → 필요 시 블록 INSERT → 신청 UPDATE → 로그 INSERT | **확정 RPC가 아니다. 여러 HTTP/DB 문장** |
| `20260410000000_core_tables_v2.sql`의 `trial_applications.assigned_teacher_id` | nullable FK, teacher 삭제 시 SET NULL | 자체적으로 담당자 필수를 강제하지 않음 |
| 같은 migration의 `schedule_blocks.teacher_id` | NOT NULL FK, teacher 삭제 시 CASCADE | 새로운 선생님 없는 블록 생성 불가 |
| `20260410020000_constraints_indexes_v2.sql`의 `trial_applications_confirmed_state_check` | 시각/블록 둘 다 null, 또는 둘 다 non-null + confirmed/completed | blockless 미배정 확정의 직접 DB 차단 원인 |
| `20260617050000_add_trial_application_class_schedule_fields.sql` | nullable `class_schedule_id` FK, 삭제 시 SET NULL | 선생님과 독립된 기존 일정 원천 |

현재 CHECK는 아래와 같다.

```sql
CHECK (
  (confirmed_slot_at IS NULL AND confirmed_schedule_block_id IS NULL)
  OR (
    confirmed_slot_at IS NOT NULL
    AND confirmed_schedule_block_id IS NOT NULL
    AND status IN ('confirmed', 'completed')
  )
)
```

이 CHECK는 `assigned_teacher_id`를 검사하지 않는다. 그러므로 **이미 유효한 확정 블록이 있는 신청은 담당자가 null이어도 기존 DB 계약상 유효**하다. 문제가 되는 조합은 `확정 시각 있음 + 확정 블록 없음`이다. 초기 설명의 “미배정 확정에는 DB 변경 필요”는 이 blockless 경로를 가리킨다.

### RPC / trigger 추적

- `set_trial_applications_updated_at`, `set_schedule_blocks_updated_at`: updated_at 갱신만 한다. 담당자 필수 규칙 없음.
- `lock_class_schedule_application` (`20260924160000_studio_rolling_schedule_v1.sql`): INSERT 또는 class_schedule_id 변경 시 class를 잠그고 해당 수업의 일정인지 확인한다. 담당자 검사는 없다. **status만 바꾸는 확정 UPDATE에는 실행되지 않는다.** 현재 이 migration은 작업 시작부터 untracked였으며 운영 적용 여부는 확인하지 않았다.
- `trial_applications_sync_registration_result` (`20260914230000_create_registration_results.sql`): registration_status INSERT/UPDATE에 반응한다. 일정 확정의 teacher 검사가 아니다. 변경하지 않는다.
- `save_studio_class_operating_rule`의 `preassigned_teacher_required`: **수업 설정이 preassigned인 경우**에 적용한다. 신청의 선택적 배정과 다른 계약이며 제거하지 않는다. 최신 정의는 `20260927120000_add_regular_tuition_display.sql`에 있다.
- `import_studio_trial_reservations` (`20260909120000_add_reservation_import_transaction.sql`): confirmed Excel 행은 teacher를 조직·활성 여부로 검증하고 `trial_booked` 블록을 생성한다. 이 RPC도 teacher 없는 confirmed 행을 거절하지만 **신청 상세의 확정 action은 이 RPC를 호출하지 않는다.** 이번 최소 변경에서는 Excel 계약을 유지한다.
- 저장소에서 일반 신청 확정을 담당하는 RPC 또는 status 전이에 reviewing을 강제하는 trigger는 발견되지 않았다. reviewing 선행 조건은 현재 server action에 있다.

## 2. 권장 저장 형태

class schedule 기반 신규 미배정 확정:

```text
status                       = confirmed
assigned_teacher_id          = null
class_schedule_id            = 기존 신청이 참조하는 실제 일정 ID
confirmed_slot_at            = 검증된 해당 occurrence의 시작 시각
confirmed_schedule_block_id  = null
scheduled_at                 = 확정 작업 시각
requested_slot_at            = 기존 희망 시각 유지
```

임의의 system teacher, 로그인 운영자 ID, 다른 선생님을 대신 지정하지 않는다. Studio 로그인 actor와 수업 담당 teacher는 별개다 (`require-teacher-studio-access.ts`).

- 체험 완료: `status = completed`, `completed_at` 기록, 위 일정 원천 유지.
- 취소/노쇼: 기존대로 confirmed 필드 둘을 비운다. 노쇼는 `canceled + no_show_at` 유지.
- legacy `requested_schedule_block_id`만 있는 신청: 유효한 기존 희망 블록의 수업·조직·시간을 검증하고 그 블록을 confirmed 블록으로 연결하는 기존 CHECK 형태를 사용한다. 담당자 ID는 null로 둘 수 있다. 새 선생님 없는 블록을 만들거나 기존 블록의 소유 선생님을 변경하지 않는다. 이 경로는 adapter 수정·회귀 검증이 필요하다.
- 일정 참조가 없는 신청: 임의 시각만으로 확정하지 않는다. 기존 일정 복구/운영 확인을 요구한다.

## 3. 최소 migration 내용 — 제안 SQL, 미실행

변경은 CHECK 하나다. 기존 허용 조합을 그대로 유지하면서 **미배정 + class_schedule 참조 + 확정 시각 + confirmed/completed**만 추가한다.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.trial_applications
  DROP CONSTRAINT trial_applications_confirmed_state_check;

ALTER TABLE public.trial_applications
  ADD CONSTRAINT trial_applications_confirmed_state_check
  CHECK (
    (confirmed_slot_at IS NULL AND confirmed_schedule_block_id IS NULL)
    OR (
      confirmed_slot_at IS NOT NULL
      AND confirmed_schedule_block_id IS NOT NULL
      AND status IN ('confirmed', 'completed')
    )
    OR (
      confirmed_slot_at IS NOT NULL
      AND confirmed_schedule_block_id IS NULL
      AND assigned_teacher_id IS NULL
      AND class_schedule_id IS NOT NULL
      AND status IN ('confirmed', 'completed')
    )
  );
COMMIT;
```

- transaction 안에서 교체하므로 외부에 제약이 없는 중간 상태를 노출하지 않는다. 검증 실패/lock timeout이면 전부 rollback한다.
- 기존 CHECK를 만족하던 행은 모두 새 CHECK도 만족한다. 기존 배정 신청 및 기존 blockless가 아닌 데이터의 backfill은 필요 없다.
- 실제 적용 전 catalog에서 기존 제약 정의와 validated 여부를 확인한다. 운영 정의가 다르면 이 SQL을 그대로 적용하지 않는다.
- ALTER TABLE은 강한 잠금과 기존 행 검증을 수반하므로 데이터 규모·쓰기 트래픽에 맞춰 적용 시간을 잡는다. 이 문서는 실행 승인이나 무중단 보장이 아니다.
- CHECK는 일정이 해당 class 소유인지/발생일·시각이 유효한지까지 증명하지 않는다. 기존 FK·조직 경계와 server validation을 유지해야 한다. 다른 테이블을 읽는 함수를 CHECK 안에 넣지 않는다.
- `schedule_blocks.teacher_id`를 nullable로 바꾸는 대안은 제외한다. 블록 RLS가 teacher를 통해 조직을 찾고 teacher별 조회/예약 타입도 이에 의존하므로, 그 대안은 이번 목표보다 변경 범위가 크다.

## 4. 함께 필요한 애플리케이션 변경 — 아직 미구현

1. 상태 action에서 new/reviewing 모두 바로 확정하도록 허용하고 post_assign 선배정 필수 검사를 제거한다. selected teacher가 있을 때는 기존 teacher option 정책(동일 조직·활성·내부 프로필)을 동일하게 검증한다.
2. 일정 확정 form의 teacher 선택은 draft로 유지한다. 신청 row UPDATE 하나에 `assigned_teacher_id`, `confirmed_slot_at`, `confirmed_schedule_block_id`, `status`, `scheduled_at`을 함께 넣는다. 별도 배정 action을 먼저 호출하면 부분 저장이 생긴다.
3. 현재 adapter의 class schedule + 미배정 분기는 이미 `confirmed_slot_at`을 채우고 confirmed 블록을 null로 두지만, 새 CHECK 예외에 맞는 일정 참조/occurrence를 검증해야 한다. 기존 서울 시각 helper는 시작 시각·길이를 검사하며 특정 날짜/요일까지 전부 검증하지는 않는다. 확정 일정 변경을 추가할 때는 날짜/요일·정원·마감·수업 일치 검증을 별도로 보존/확인한다.
4. **미배정 확정 이후 담당자 배정:** 현재 `updateStudioApplicationAssignee`는 teacher ID만 UPDATE한다. 제안 CHECK에서 이대로 teacher만 채우면 더 이상 미배정 예외가 아니므로 실패한다. 이 경로에서는 기존 확정 시각 기준으로 해당 teacher의 유효한 블록을 준비하고, teacher와 confirmed 블록을 같은 신청 UPDATE로 저장해야 한다. 블록 충돌 시 둘 다 저장하지 않는다. completed 상태에서의 담당자 편집도 같은 검토가 필요하다.
5. 기존 assigned + confirmed block 신청의 배정/해제는 이번 예외 때문에 새로 깨지지 않는다. 이미 있는 블록을 일괄 삭제하거나 일정 시각을 다시 계산하지 않는다.
6. 비교 후 저장 경합을 막기 위해 현재 status뿐 아니라 읽은 row의 updated_at을 조건으로 사용하거나, 별도 승인된 transaction 안에서 잠근다. 현재 status만 같은 담당자 변경/상담 저장은 기존 status 조건으로 감지하지 못한다.
7. UI에서 미배정을 오류/필수 작업으로 취급하지 않게 맞춘다. 기록·상담·등록·리포트 권한은 그대로 둔다.

### 원자성의 실제 한계

현재 확정은 RPC transaction이 아니다. 블록 INSERT, 신청 UPDATE, application_logs INSERT가 각각 별도 문장이다. 로그 실패는 warn만 남기고, 알림은 safe wrapper로 처리한다. 따라서 “기존에 일정·신청·로그가 전부 atomic이었다”라고 전제하면 안 된다.

- 위 CHECK 변경은 저장 가능한 형태만 확장한다. 새 RPC·trigger는 이 예외를 표현하는 데 필수는 아니다.
- 미배정 class schedule 확정은 새 블록 생성 없이 신청 UPDATE 하나로 끝낼 수 있다.
- teacher를 선택한 확정/사후 배정은 블록 준비 후 신청 UPDATE 실패 시 미연결 블록이 남을 수 있는 기존 구조를 가진다. 같은 시간 블록을 동시 생성하는 경합도 별도 입증되지 않았다. 기존 스키마에서 available 블록의 `(class, teacher, start, end)` unique/exclusion 보장은 찾지 못했다.
- **블록 생성부터 로그까지 모두 rollback되는 원자성을 출시 조건으로 삼으면**, 별도의 좁은 확정/사후배정 RPC 설계가 추가로 필요하다. 이는 CHECK 하나만의 최소안과 구분하여 승인·검증해야 한다. 이번 제안에서 범용 RPC나 기존 consultation transaction을 임의로 재사용하지 않는다.
- 기존 희망 occurrence를 그대로 확정하면 new/reviewing/confirmed 모두 active 예약 집합에 있으므로 동일 신청을 추가 예약으로 세면 안 된다. 다른 slot 선택을 허용하면 별도의 예약 이동·동시 정원 검증이 필요하다. 현재 확정 adapter는 선택 가능한 대체 slot 입력을 받지 않는다.

## 5. 조회·UI·권한·알림 영향

| 영역 | 조사 결과 | 필요한 처리 |
| --- | --- | --- |
| Schedule 목록 | `listStudioApplications`는 confirmed_slot_at 범위 조회가 기본. block join은 기본 left embed. block-only inner 조회는 confirmed_slot_at이 없는 별도 fallback | blockless 행이 일반 조회에서 사라지지 않음. 기본 조회를 inner로 바꾸지 않음 |
| Schedule 화면 | `getStudioSchedulePlacement`는 confirmed_slot_at 우선. 이벤트와 미배정 필터가 null teacher 지원 | 미배정 안내를 선택적 정보로 유지. 필수 작업처럼 읽히는 경고 문구 검토 |
| 선생님별 Schedule | teacherId 필터는 특정 teacher와 같은 행만 선택 | 미배정이 빠지는 것은 필터 의미상 정상. 전체/미배정에서 확인 가능해야 함 |
| Application Detail | block embed 없음 허용, teacher name은 미배정 fallback | 시작 전 미배정을 최우선 배정 CTA로 만드는 workflow helper 수정 필요 |
| Cases / Dashboard | null teacher 조회·매핑 가능. 현재 attention/action 우선순위는 UNASSIGNED | 신규 일정 확정 및 체험 후 업무를 가리지 않게 우선순위 조정 필요 |
| 체험 진행/완료 판정 | `trial-completion.ts`는 블록 → confirmed_slot_at + class schedule 길이 fallback | blockless도 진행 판정 가능. 시작/종료를 모르면 추정 완료 금지 |
| 종료 시각 | 블록 없는 신청은 class schedule 길이에 의존 | 예약 후 schedule 시간이 수정되면 표시 길이가 달라질 수 있음. 참조된 일정의 시간 수정 정책과 함께 검증. 새 snapshot 열은 이번 최소안에 포함하지 않음 |
| Studio 권한 | `studio_trial_applications` auto-updatable view가 role + class 조직으로 제한하고 WITH CHECK OPTION 적용 | teacher 배정 null과 무관. view/RLS/grant 변경 불필요 |
| 역할 호환 | `app.current_role()`은 academy/admin을 teacher로 매핑 | 로그인 actor를 assigned teacher로 대신 채우지 않음 |
| schedule_blocks RLS | teacher 소유 또는 teacher의 조직으로 read/write 허용 | teacher_id NOT NULL 유지. 블록 없는 경로는 이 RLS를 확장할 필요 없음 |
| 학부모 | `my_trial_applications`가 confirmed_slot_at 제공. assigned_teacher_id는 공개 projection 아님 | null teacher 때문에 학부모 일정이 누락되지 않음. 공개 열 추가 불필요 |
| 결과·리포트·상담 | 완료 여부/정규 등록 축 사용, teacher 필수 확정 RPC와 무관 | completed 예외를 허용하고 기존 completed_at/last_activity_at/nullable next_contact_at, entitlement 유지 |
| 확정 알림 | Parent 알림은 teacher 불필요. Studio sender는 미배정이면 teacher_not_assigned로 skip하고 정상 경로에서 관리자 발송 진행 | safe wrapper 유지. 선택된 teacher가 있으면 기존 확정 알림 사용 |
| 리마인더 | confirmed_slot_at으로 대상 조회. `run-trial-reminders.ts`는 teacher skip 중 중복 번호만 정상 처리하고 teacher_not_assigned는 teacherFailed 증가 | 예상 가능한 미배정을 실패로 집계하지 않도록 수정 필요. skipped 이력이 나중 배정 후 같은 event 재전송을 막는 중복 처리도 검토 |
| 로그 | 확정 로그는 신청 UPDATE 뒤 별도 INSERT. reviewing 전용 외부 발송 분기는 현재 상태 action에 없음 | 새 reviewing 로그를 만들지 않음. 과거 로그·학부모 historical notification 매핑 보존 |
| Excel | confirmed import RPC는 실제 teacher/전용 블록 필수 | 이번 상세 확정 정책 예외와 분리. 미배정 Excel 확정까지 자동 확장하지 않음 |
| Rolling / 일정 삭제 | 참조된 일정 보호 경로가 존재. class_schedule FK는 ON DELETE SET NULL | blockless 행은 참조가 없어지면 CHECK 위반으로 삭제를 거절할 수 있음. 보호 유지가 맞으며 참조 삭제를 우회하지 않음 |

주요 읽기 근거: `src/shared/lib/db/supabase-adapter.ts`, `src/features/studio/queries/get-studio-cases.ts`, `src/features/studio/lib/{trial-completion,studio-schedule-range,studio-schedule-events,application-detail-workflow-state,case-view-model,studio-dashboard-view}.ts`.

권한 근거: `20260506120000_rls_teacher_unified_atomic.sql`, `20260604090000_profiles_roles_academy_admin.sql`, `20260915090000_enforce_parent_application_read_boundary.sql`.

## 6. 적용 전 읽기 전용 확인안 — 미실행

운영 정의와 repository의 차이를 먼저 확인한다. 데이터를 수정하지 않는 catalog 조회다.

```sql
SELECT conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.trial_applications'::regclass,
                   'public.schedule_blocks'::regclass)
ORDER BY conrelid, conname;

SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('trial_applications', 'assigned_teacher_id'),
    ('trial_applications', 'class_schedule_id'),
    ('schedule_blocks', 'teacher_id')
  );

SELECT tgname, pg_get_triggerdef(oid), pg_get_functiondef(tgfoid)
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid IN ('public.trial_applications'::regclass,
                  'public.schedule_blocks'::regclass);

SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('trial_applications', 'schedule_blocks', 'class_schedules');

SELECT pg_get_viewdef('public.studio_trial_applications'::regclass, true),
       pg_get_viewdef('public.my_trial_applications'::regclass, true);
```

migration 적용 이력도 별도로 대조한다. 현재 workspace의 기존 untracked rolling migration이 운영에도 있다는 가정으로 보호/동시성을 보장하지 않는다.

## 7. Rollback

**새 형태의 데이터가 생긴 뒤 구 CHECK로 즉시 돌아가는 것은 불가능하다.** 확인 없이 확정 시각을 지우거나 teacher를 임의로 지정하는 rollback은 하지 않는다.

1. 미배정 확정 신규 쓰기를 먼저 중지한다. 읽기 및 정상 완료/취소 기능은 유지한다.
2. 구 CHECK를 만족하지 않는 행을 조회한다. confirmed뿐 아니라 completed도 포함한다.
3. 0건이면 아래 transaction으로 원래 CHECK를 복구할 수 있다.
4. 1건 이상이면 DB downgrade를 중단한다. 확장 CHECK를 유지하면서 구 writer만 중지하는 것이 데이터 손실 없는 중단 방법이다. 업무상 확인한 실제 담당자·블록으로 적법하게 전환하거나, 이 데이터를 계속 읽을 수 있는 호환 버전을 유지하는 별도 결정이 필요하다. historical completed 기록의 담당자를 소급 추정하지 않는다.

```sql
-- 사전 확인: 내용 변경 없이 ID와 상태만 조회.
SELECT id, status
FROM public.trial_applications
WHERE NOT (
  (confirmed_slot_at IS NULL AND confirmed_schedule_block_id IS NULL)
  OR (
    confirmed_slot_at IS NOT NULL
    AND confirmed_schedule_block_id IS NOT NULL
    AND status IN ('confirmed', 'completed')
  )
);

-- 제안 rollback: 미호환 행이 있으면 실패하여 확장 CHECK를 보존한다.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.trial_applications IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.trial_applications
    WHERE NOT (
      (confirmed_slot_at IS NULL AND confirmed_schedule_block_id IS NULL)
      OR (
        confirmed_slot_at IS NOT NULL
        AND confirmed_schedule_block_id IS NOT NULL
        AND status IN ('confirmed', 'completed')
      )
    )
  ) THEN
    RAISE EXCEPTION 'rollback_blocked_by_blockless_confirmations';
  END IF;
END;
$$;
ALTER TABLE public.trial_applications
  DROP CONSTRAINT trial_applications_confirmed_state_check;
ALTER TABLE public.trial_applications
  ADD CONSTRAINT trial_applications_confirmed_state_check CHECK (
    (confirmed_slot_at IS NULL AND confirmed_schedule_block_id IS NULL)
    OR (
      confirmed_slot_at IS NOT NULL
      AND confirmed_schedule_block_id IS NOT NULL
      AND status IN ('confirmed', 'completed')
    )
  );
COMMIT;
```

rollback SQL도 실행하지 않았다. 새 데이터가 없으면 코드 rollback과 제약 복구를 순서대로 진행할 수 있고, 이미 데이터가 있으면 호환 read/write 경로를 먼저 유지해야 한다.

## 8. 검증 결과와 출시 전 조건

이번 조사에서 실행한 것:

- 기존 `verify-trial-progress-state.ts`: PASS.
- 기존 `verify-studio-schedule-v11.ts`: PASS.
- 기존 `verify-application-detail-workflow-v2.ts`: 30 fixture 및 표현 계약 PASS. 이는 **현재 구현**의 회귀 확인이며 목표 UX 구현 통과를 뜻하지 않는다.
- `/tmp/verify-unassigned-confirmation-read-model.ts`: 순수 helper fixture PASS. null teacher + null confirmed block + 실제 확정 시각에서 서울 시간/시작 전·진행·종료 경과 판정, Schedule 표시·미배정 필터·기간 포함 확인. 기존 Detail이 여전히 assignee CTA를 우선한다는 충돌도 재현했다.
- 같은 임시 fixture의 boolean 조합 80개: 제안 CHECK 표현은 기존 허용 형태를 모두 보존하고 목표 confirmed/completed 예외 두 조합만 추가했다. SQL 엔진 테스트가 아닌 논리식 검증이다.
- TypeScript는 이미 설치된 TypeScript transpiler와 임시 loader로 실행했다. 라이브러리 설치나 package 변경 없음.
- 코드 변경은 복원했고 문서만 추가하므로 typecheck/lint/build는 재실행하지 않았다. DB constraint/RLS/transaction/E2E를 검증했다고 주장하지 않는다.

실제 적용 전 격리 PostgreSQL/Supabase에서 반드시 검증할 것:

- new/reviewing 각각 미배정 + class schedule 확정, legacy 희망 블록 확정.
- teacher 선택 시 일정/teacher/status의 일관 저장 및 타 조직/비활성 teacher 차단.
- blockless confirmed → completed, 취소, 노쇼, 결과 기록/상담/리포트.
- blockless 확정의 사후 담당자 배정 성공·블록 충돌 실패·완료 후 편집.
- status 변경 경합, 동일 status에서 담당자/상담 변경 경합, 동시 블록 준비 실패 시 영향.
- 같은 희망 slot은 active count 증가 없음. 대체 slot을 허용하는 경우에만 별도 이동·정원 경합 검증.
- 다른 조직/parent/anon 권한 차단, Parent view의 공개 경계 유지.
- Schedule 전체·미배정·teacher 필터, 목록/상세/실제 알림 dry-run, reminder 정상 skip.
- 기존 assigned 신청·Excel·rolling·registration snapshot 회귀.
- 구 CHECK 만족 데이터에서는 rollback 성공, 새 blockless confirmed/completed가 있으면 rollback 실패 및 데이터 보존.

현재 상태: **변경안 검토 가능 / 구현·migration·배포 미진행**.
