# Studio Rolling Schedule V1

2026-09-24. 로컬 구현 및 격리 검증. Production 적용/기존 운영 데이터 변환/commit/push 없음.

## 현재 계약 audit

- `classes`: 공개는 `is_active`, 담당자는 `assignment_mode`/`teacher_id`/`teacher_display_name`. 반복 규칙에 별도 담당자를 복제하지 않는다.
- `class_schedules`: 실제 날짜별 예약 대상으로 `one_time`, `specific_date`, `start_time`, `end_time`, `capacity`, `booking_status(open/closed/hidden)`를 유지한다. legacy `weekly`도 유지한다.
- `series_id`는 기존 생성 그룹 식별자일 뿐 반복 요일·기간의 원본이 아니었다. 기존 데이터를 보고 rolling/fixed를 확정할 수 없다.
- `trial_applications.class_schedule_id`가 일정 ID를 참조한다. 신규/확인/확정뿐 아니라 완료·취소·노쇼 이력도 보호 대상이다. 기존 FK는 변경하지 않는다.
- 기존 `studio-operating-hours.ts`의 `OPEN_ENDED_GENERATION_DAYS=90`와 생성 helper는 날짜 배열만 만들었고 반복 규칙을 저장하지 않았다. 이제 helper는 UI 미리보기용이고 DB가 실제 생성의 권위 원천이다.
- Studio route → 공통 Form → `upsert-studio-class` → adapter 경로를 유지한다. Parent 공개 조회·예약 상태 의미·리포트/등록 전환 계약은 변경하지 않는다.

## Additive schema

Migration: `supabase/migrations/20260924160000_studio_rolling_schedule_v1.sql`.

| 변경 | 저장 내용 |
| --- | --- |
| `class_operating_rules` | 수업당 1개, rolling/fixed_period, 시작일/종료일, rolling_days=90, slots JSONB, active, revision, 마지막 생성일 |
| slots 원소 | weekday(일=0), startTime/endTime, capacity, seriesId. 현재 Form의 공통 interval·요일 그룹 계약 검증 |
| `class_schedules` 추가 열 | generated_by_rule_id, is_manual_override |
| `class_schedule_exceptions` | 날짜 전체 또는 날짜/시작시간 단위 open/closed/hidden/deleted 예외 |

기존 행에는 provenance가 없는 상태로 남는다. 기존 일정을 삭제/변환/backfill하지 않는다.
새 자동 일정에만 `(class_id,specific_date,start_time)` partial unique index를 적용한다. 기존 중복 행이 migration을 막지 않는다.
복합 FK로 생성 rule과 schedule의 class 일치를 보장한다.
반복 규칙/예외는 Studio 소속 학원만 조회할 수 있고 직접 쓰기 권한은 없다. 소속 검증 RPC가 저장한다. cron RPC는 service_role 전용이다.

## 생성 및 중복 방지

Asia/Seoul의 오늘부터 **오늘+89일까지, 오늘 포함 90개 날짜**가 창이다. 오늘 이미 지난 시간은 생성하지 않는다.
시작일이 미래면 그 날짜부터, 창 밖이면 아직 생성하지 않는다. 요일과 시간 규칙에 해당하는 누락 일정만 INSERT한다.
같은 날짜/시작시간의 기존 일정은 출처와 관계없이 우선한다. 전체 삭제/재생성은 없다.
수업 행 잠금 + unique index + NOT EXISTS + ON CONFLICT가 재실행/동시 실행 중복을 방지한다.
수업 정보·반복 규칙 revision·일정 조정은 `save_studio_class_operating_rule`의 한 transaction이다. 실패하면 모두 rollback한다.

## 보호 및 예외 우선순위

1. 기존 신청이 참조하는 일정, 지난 일정은 삭제/교체하지 않는다. 상태를 제한하지 않고 참조 존재 자체로 보호한다.
2. 직접 추가한 일정과 기존 legacy 일정은 자동 조정 대상이 아니다.
3. 개별 일정 수정은 manual marker를 남긴다. 삭제/날짜·시간 이동은 원래 위치에 tombstone을 남겨 재생성을 막는다.
4. 날짜 전체 마감/숨김은 아직 생성되지 않은 시간에도 적용된다. 해당 날짜에 새 시간 규칙이 추가돼도 마감/숨김 상태로 생성된다.
5. 자동 생성되고 수동 변경/신청/예외가 없는 미래 일정만 규칙 변경으로 조정할 수 있다. 일치하는 시간은 ID를 유지하며 정원만 변경한다.

운영 요일/시간을 바꾸면 보호되지 않은 미래 자동 일정 중 새 규칙에서 빠진 것만 삭제하고 새 시간을 생성한다.
예약 접수, 규칙 저장, 개별 정원/숨김 수정, cron은 같은 class 잠금 순서를 사용한다. Form revision 충돌은 저장을 거절하고 재확인을 요구한다.

## 비공개·재공개·기간 운영

- 신규 비공개 rolling: rule만 저장하고 자동 일정은 아직 만들지 않는다.
- 비공개 전환: 자동 생성 중단. 전환 자체로 기존 일정을 삭제하지 않는다.
- 재공개: 같은 transaction의 trigger로 현재 규칙 기준 90일 누락분을 보충한다.
- fixed_period: 지정 종료일까지만 저장 시 생성한다. 일일 cron 대상에서 제외한다.
- 비공개 상태에서도 운영자가 규칙을 명시적으로 수정하면 보호 정책 아래 미래 자동 일정 정리는 가능하지만 새 rolling 일정은 생성하지 않는다.

## 자동 실행

`GET /api/cron/rolling-schedules`, Vercel cron `15 15 * * *` = KST 매일 00:15.
CRON_SECRET 누락 시 503, 잘못된 Bearer는 401. 개발 환경도 인증 생략 없음.
공개·활성 rolling 중 오늘 미처리 수업만 class_id cursor로 100개씩 조회한다. 수업별 RPC transaction으로 실패를 격리한다.
결과에 processed/inserted/failures를 반환하고 실패·240초 작업 한도 도달은 500이다. 성공한 수업은 당일 재실행에서 제외된다.
실패/미완료 수업은 재호출 시 다시 처리한다. 자동 재시도를 추가한 것은 아니므로 실패 알림과 운영 재실행 절차가 필요하다.
Vercel 작업 실행 자체의 지연·실패까지 무조건 90일을 보장하지는 않는다. 일일 실행 상태를 모니터링해야 한다.
참고: https://vercel.com/docs/cron-jobs/manage-cron-jobs

## Form 연동

등록/수정 같은 C. 체험 운영 UI에서 rolling/fixed 규칙을 편집한다. 수정 시 실제 저장된 규칙을 복원한다.
연속 타임은 간결한 시간 범위로 복원하고, 기존 시작일이 과거여도 수정할 수 있다.
변경하지 않은 rule은 보내지 않는다. 일정 배열을 오래된 Form snapshot으로 덮어쓰지 않는다.
Sticky: `상시 운영` / `앞으로 90일간 예약 일정이 자동으로 열립니다.`. 기간 운영은 시작~종료일이다. Sticky 예약시간 개수는 없다.
기존 localStorage/이미지/가격/수업 미리보기 계약은 유지한다.

## 기존 수업 전환

**확정적으로 자동 변환할 수 있는 기존 수업은 없다.** 같은 미래 일정 패턴도 fixed/rolling/수동 추가인지 구별할 근거가 없다.
읽기 전용 `docs/sql/manual/audit_legacy_rolling_candidates.sql`로 검토 대상과 예약 참조 수만 확인한다. 후보 표시도 rolling 확정 판정이 아니다.
운영자가 해당 수업의 기간/요일/시간/정원을 확인하고 Form에서 저장한 경우에만 rule을 생성한다.
기존 일정의 provenance를 소급 부여하지 않으므로 기존 미래 일정도 모두 유지한다. 새 규칙과 다른 legacy 일정은 별도 검토 후 기존 운영 UI에서 정리한다.
이 보수적인 전환 방식은 예전 예약 가능 시간 일부가 새 시간과 함께 남을 수 있다. 무인 backfill로 정리하지 않는다.

## 검증 및 한계

- `scripts/verify-rolling-schedules.sql`: 실제 격리 PostgreSQL에서 A–N, 재실행, 과거/예약 참조, 마감/숨김/정원, 날짜 전체 예외, tombstone, legacy 보존, atomic rollback, revision conflict, 소속/role 권한.
- `scripts/verify-rolling-schedules-concurrency.mjs`: 4개 job 동시 실행, 예약 접수와 규칙 변경 경합, 정원·숨김·cron 동시 변경.
- `scripts/verify-rolling-schedules.ts`: 규칙 검증·직렬화/복원·90일 preview·mock 보호.
- 로컬 1440px actual Form fixture: 신규 payload, 수정 rule 복원/과거 시작일 편집, compact 범위, revision, Summary, 브라우저 오류 없음.
- cron route/runner는 격리 client 대체 테스트로 인증, 101개 pagination, 공개/rolling/당일 필터, 실패 응답 검증.
- typecheck/lint/build, 기존 class/schedule/Parent/Studio route verifiers, diff whitespace 확인.

전체 migration chain을 새 로컬 DB에 적용했다. Storage service가 없는 DB-only 컨테이너에는 기존 Storage migration 실행용 최소 테이블 stub만 제공했다.
Supabase PostgreSQL 이미지의 기본 preloaded 확장 설정에서 authenticated SET ROLE 테스트 중 SIGSEGV가 발생했다. 비교 환경과 동일하게 shared/session preload를 끈 격리 DB에서는 기능/권한 및 동시 실행 검증이 모두 통과했다. 개별 확장 원인까지 확정한 것은 아니며 실제 호스팅 확장 조합에서의 staging 확인은 별도 필요하다.
Production migration/실제 계정 로그인/운영 Storage upload/배포된 Vercel cron 실행은 **SKIP**. 로컬 fixture를 운영 통합 검증으로 간주하지 않는다.

## Production 적용 전 확인

1. 별도 staging Supabase의 실제 확장/Auth/RLS 환경에서 migration과 동일 verifier를 재검증한다. 기존 migration 적용 이력과 필수 class 열을 확인한다.
2. DB migration을 먼저 적용한 뒤 애플리케이션을 배포한다. 새 Studio read와 개별 일정 RPC는 migration을 요구한다.
3. Production CRON_SECRET/service-role 환경 변수와 cron 활성화, 실행 시간 제한, 실패 알림을 확인한다. 비밀 값은 브라우저에 보내지 않는다.
4. 소수의 명시적으로 확인된 수업만 rule 등록 후 일정 ID/예외/마지막 생성일을 비교한다. 기존 수업 대량 자동 전환은 하지 않는다.
5. 중단 필요 시 cron을 비활성화하거나 rule active를 끈다. 이미 생성된 일정과 예약 FK를 rollback 목적으로 일괄 삭제하지 않는다.
