# Studio 미배정 일정 확정 V1 — 구현·검증 보고

검증: 2026-09-28 ~ 2026-09-29 KST. 기존 proposal 이후 사용자가 승인한 구현 범위의 결과다. Production DB migration을 먼저 적용했고, 앱 변경은 localhost:3000에서 검수했다. 앱 배포·commit·push는 하지 않았다.

## 1. 기존 blocking constraint

`trial_applications_confirmed_state_check`는 다음 두 경우만 허용했다.

```sql
(confirmed_slot_at IS NULL AND confirmed_schedule_block_id IS NULL)
OR (confirmed_slot_at IS NOT NULL AND confirmed_schedule_block_id IS NOT NULL
    AND status IN ('confirmed', 'completed'))
```

`assigned_teacher_id`는 이미 nullable이었다. `schedule_blocks.teacher_id NOT NULL` 때문에 미배정 예약 블록을 만들 수 없고, 위 CHECK 때문에 시각만 있는 확정을 저장할 수 없었다. 서버 action의 담당자 필수 가드도 제거했다. 기존 updated_at/rolling/registration trigger에는 신청 담당자 필수 규칙이 없으며 그대로 유지했다. Excel import의 담당자 필수 계약과 수업 설정의 preassigned 계약도 유지했다.

## 2. Migration 내용

[20260928150000_unassigned_studio_confirmation.sql](../supabase/migrations/20260928150000_unassigned_studio_confirmation.sql)을 생성·적용했다. 기존 두 CHECK 분기를 유지하고 다음 예외만 추가했다.

```sql
confirmed_slot_at IS NOT NULL
AND confirmed_schedule_block_id IS NULL
AND assigned_teacher_id IS NULL
AND class_schedule_id IS NOT NULL
AND status IN ('confirmed', 'completed')
```

새 테이블·열·status와 RLS 변경은 없다. `schedule_blocks.teacher_id NOT NULL`과 기존 FK를 유지했다. 함수 `set_studio_application_schedule(uuid,text,uuid,timestamptz)`를 추가해 확정과 후배정을 같은 트랜잭션 안에서 처리한다. SECURITY INVOKER이며 기존 조직 범위 view/RLS를 사용한다. authenticated만 실행 가능하고 역할·조직·활성 선생님을 추가 검증한다.

## 3. 미배정 confirm 저장 구조

기존 `class_schedule_id`와 유효한 희망 occurrence를 사용한다. KST 날짜/요일/시각, 수업 소유권, booking 상태, 정원을 검증하고 `status=confirmed`, `confirmed_slot_at=검증된 시작 시각`, `assigned_teacher_id=null`, `confirmed_schedule_block_id=null`을 함께 저장한다. 선생님 없는 가짜 block은 만들지 않는다. 같은 저장 형태로 completed 전환도 가능하다.

## 4. Teacher 선택 confirm 구조

화면의 라디오 선택은 확정 전까지 draft다. 한 번의 `일정 확정하기` 제출이 선생님·예약 block·확정 시각·상태·일정 확정 로그를 RPC 안에서 저장한다. block은 같은 수업/선생님/시간의 기존 available block을 재사용하거나 생성한다. 다른 예약과의 시간 충돌과 block 정원을 검사한다. 일부 성공 후 실패하는 별도 담당자 저장 단계는 없다.

UI는 기존 희망 일정으로 확정한다. 다른 occurrence로 재예약하는 별도 날짜 선택기는 이번 V1에 추가하지 않았다. 일정 참조가 없으면 확정 버튼을 비활성화하고, 유효하지 않은 시각은 저장 없이 오류를 표시한다.

## 5. 후배정 구조

confirmed 미배정 신청의 `변경` 폼이 같은 RPC의 assign 경로를 호출한다. 기존 확정 시각을 유지하며 teacher와 필요한 block을 함께 연결한다. class → application → teacher 순서의 잠금과 expected updated_at 검증을 사용한다. 실패하면 새 block과 신청 수정, 로그가 모두 rollback된다.

## 6. Teacher 변경 구조

A→B 변경도 assign 경로로 처리한다. 기존 확정 시각과 구간을 유지하고 새 teacher의 겹침·정원을 검사한다. 신청과 block의 teacher를 일치시킨다. 이전 imported trial_booked block은 해당 신청 전용이며 다른 신청 참조가 없는 경우만 제거한다. 공유 available block과 과거 requested block/시각은 보존한다. 같은 class schedule 신청을 다시 미배정으로 바꾸면 확정 시각은 유지하고 확정 block 연결을 해제한다.

## 7. Dashboard 영향

신청 접수 → 일정 확정 → 체험 진행 → 체험 완료 → 등록 결과의 5단계로 표시한다. new/reviewing은 신청 접수로 합친다. 체험 진행은 기존 confirmed 시각으로 계산하는 표시 상태이며 새 DB status가 아니다. 단계별 누적 도달 수는 동일 신청을 각 단계에서 한 번만 센다. 기존 기간/cohort와 등록 전환 분모는 유지한다. 마지막 등록 결과 수치는 기존 enrolled 수를 유지하며, 등록/미등록/미결정 내역은 별도 등록 결과 카드에서 확인한다.

미배정만으로 blocking next action을 만들지 않는다. 확정 전에는 일정 확정, 체험 완료 후에는 기록/후속 상담 등 실제 다음 작업을 표시한다.

## 8. Cases / Schedule / Detail 영향

Cases에서 new/reviewing은 `신청 접수` 필터와 `일정 확정 필요` 작업으로 합친다. historical reviewing 상태·로그는 보존하지만 신규 reviewing 버튼과 로그는 생성하지 않는다. confirmed + teacher null은 정상 확정이다.

Schedule은 block 없는 confirmed도 기존 application의 확정 시각으로 노출하며 `미배정` 필터에서 조회된다. Detail의 선생님은 선택사항이고 확정 전 별도 담당자 저장 버튼은 없다. 확정 후에는 작은 변경 폼을 사용한다. 기존 체험 기록·상담·리포트·등록 결과 UI/권한은 유지한다. 완료 이후 상세는 기존 후속 운영 단계 표시를 유지한다.

## 9. Reminder / metric 영향

teacher 알림의 `skipped + teacher_not_assigned`를 `teacherFailed` 대신 `teacherSkippedUnassigned`로 집계한다. 학부모/학원 알림은 독립적으로 처리한다. 기존 safe wrapper와 중복 방지 정책을 유지한다. 이번 검증에서 실제 외부 SMS/알림톡은 보내지 않았다. Production TEST의 알림 로그 18건 모두 skipped였다.

기존 중복 방지 로그가 이미 생긴 reminder를 나중에 담당자 배정했다는 이유로 자동 재발송하는 정책은 추가하지 않았다.

## 10. Local DB fixture

기존 로컬 Supabase DB를 별도 `unassigned_v1` PostgreSQL DB에 복제해 검증했다. 개발용 원본 DB에는 이번 migration을 적용하지 않았다. 복제 과정의 graphql_public.graphql 부재로 인한 grant 4건은 public 업무 테이블 검증과 분리했다.

| Fixture | 결과 |
| --- | --- |
| A: new + 미배정 + 유효 class_schedule → confirmed | PASS |
| B: new + 선생님 선택 → confirmed, teacher/block 일치 | PASS |
| C: legacy reviewing + 미배정 → confirmed | PASS |
| D: 미배정 confirmed → completed | PASS |
| E: confirmed 미배정 → 후배정 | PASS |
| F: A→B 변경, 확정 시각 유지 | PASS |
| G: 잘못된 occurrence / 일정 소유권 불일치 | 거절 PASS |
| H: 타 학원 teacher | 거절 PASS |
| I: class_schedule과 유효한 기존 block 없는 확정 | 거절 PASS |
| J: 타 학원 / Parent / unauth / anon | 차단 PASS |

추가 검증: 동시 확정은 하나만 commit, 나머지는 revision conflict. 로그 INSERT에 테스트용 예외를 주입했을 때 신청/생성 block 모두 rollback. 새 형태 row가 있으면 rollback SQL 거절, 없으면 원래 CHECK 복원 가능. 이후 격리 DB에는 migration을 다시 적용했다.

재사용 가능한 fixture는 [verify-unassigned-confirmation.sql](../scripts/verify-unassigned-confirmation.sql)이다. BEGIN/ROLLBACK으로 실행되며 실제 역할과 JWT claim으로 RLS를 검증한다.

## 11. Production migration

linked project `vfkfpekfwrjjocltqbty`에서 read-only preflight로 실제 CHECK 정의·validation·teacher NOT NULL·trigger·RLS·운영 신청/예약 block fingerprint를 기록했다. `db push --dry-run --linked`에는 이번 migration 한 개만 표시됐다. 그 후 migration을 적용했다.

적용 직후 CHECK validated=true, teacher NOT NULL=true, 기존 RLS fingerprint 및 운영 신청/예약 block fingerprint 동일함을 확인했다. Production에서도 transaction fixture를 실행하고 rollback했다. 앱 코드보다 DB가 먼저 반영되었다.

## 12. Production TEST / localhost 실제 검수

별도 TEST 학원 2개, 선생님 3명, 신청 9건과 검수 계정을 생성했다. localhost:3000의 실제 Supabase 연결로 다음을 수행했다.

- 미배정 신규 확정 → A 후배정 → B 변경: 신청/예약 block 모두 B이며 시각 유지.
- 선생님 A를 선택한 신규 확정: 한 번 제출로 teacher/block 일치.
- legacy reviewing 미배정 직접 확정.
- 미배정 확정 → 체험 완료, 기록·상담·등록 결과 접근 유지.
- 미배정 확정 → 노쇼 dialog → canceled/no_show_at 저장.
- 일정 없음 비활성화 / 잘못된 시각 오류와 미변경.
- Dashboard/Cases의 정상 confirmed 표시, Schedule 미배정 필터 노출.
- 1440px/390px 화면 검수. 모바일 scrollWidth=innerWidth=390, 확정 submit 1개, 신청 확인 단계 없음.

TEST 데이터와 권한 override, 알림/신청 로그, Auth 계정을 정리했다. 기존 62개 운영 신청의 전체 row fingerprint와 전체 예약 block fingerprint, RLS fingerprint가 preflight와 동일하다. 최종 TEST 잔여 row 수는 검수 증거의 cleanup 결과를 참조한다. 새 console 수집에서 오류가 없음을 확인했다. 개발 도중의 React key 경고는 전달하는 화면 영역에 안정적인 key를 추가해 해결했다.

시각 검수 자료:

- [신청 상세 Desktop](../.codex/artifacts/unassigned-confirmation-v1/detail-final-desktop.png)
- [신청 상세 Mobile](../.codex/artifacts/unassigned-confirmation-v1/detail-final-mobile.png)
- [Dashboard](../.codex/artifacts/unassigned-confirmation-v1/dashboard.png)
- [Cases](../.codex/artifacts/unassigned-confirmation-v1/cases.png)
- [Schedule 미배정](../.codex/artifacts/unassigned-confirmation-v1/schedule-unassigned.png)

TEST 신청은 정리되어 스크린샷의 TEST 상세 URL은 더 이상 조회되지 않는다. 실제 사용자 계정으로 localhost:3000에서 변경된 화면을 검수할 수 있다.

## 13. Rollback 조건

[rollback_unassigned_studio_confirmation.sql](sql/manual/rollback_unassigned_studio_confirmation.sql)을 준비했다. 기존 CHECK를 위반하는 blockless confirmed/completed row가 **0건일 때만** 원래 CHECK와 RPC 삭제를 한 트랜잭션으로 수행한다. 새 형태 row가 있으면 SQL이 중단되며, 먼저 담당자/block 배정 등 승인된 데이터 정규화 정책이 필요하다. 데이터를 자동 변환하거나 삭제하지 않는다. 앱도 RPC 의존 코드와 함께 이전 버전으로 되돌려야 한다. Production rollback은 실행하지 않았다.

## 14. Verifier

`npm run typecheck`, `npm run lint`, production build PASS. 실행 중 dev server의 .next 충돌을 피하려고 환경 변수 파일을 제외한 임시 소스 복사본에서 build했다. 실제 인증/DB 연결은 localhost 브라우저 및 Production fixture에서 별도 검증했다. 새 라이브러리 추가 없음.

기존 및 신규 verifier 24개 PASS: application-detail-workflow-v2, studio-dashboard-phase11, case-in-trial-filter, studio-cases-v1, trial-progress-state, studio-schedule-v11, studio-navigation-contract, studio-navigation-migration, studio-ux-phase1, final-ux-coherence, conversion-analytics, conversion-report, parent-applications-record, parent-schedule, experience-report-publication, parent-decision, registration-result, consultation-preference-write, rolling-schedules, unassigned-confirmation, parent-notifications, parent-notifications-v2, parent-notification-reads, consultation-atomicity.

각 verifier는 코드/fixture 회귀 검사다. 실제 UI mutation은 위 12항에 열거한 범위이며 실제 리포트 발행·외부 메시지 발송·운영 등록 결과 입력은 하지 않았다. DB fixture·동시성·rollback 검사는 별도로 수행했다. 결과 목록과 로그는 `.codex/artifacts/unassigned-confirmation-v1/`에 보관했다.

## 15. Commit / push 없음

기존 dirty/untracked 작업을 보존했다. git add/commit/push, main 반영, 앱 배포 없음. 사용자 시각 검수 후 후속 반영을 진행한다.

UNASSIGNED TEACHER CONFIRMATION V1 IMPLEMENTED — READY FOR VISUAL REVIEW
