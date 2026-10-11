# 수학 리포트 데모 데이터 준비 SQL — 실제 적용 승인 대기

SQL: `docs/sql/manual/20261011_prepare_math_report_demo.sql`
SHA-256: `d0f23e0509ba4a0d8244a758528afeeb8747d9d68dd056c1e234d55b663c3375`

실제 DB에는 실행하지 않았다. 새 migration, 로그인, fixture 화면, 관리 기능도 추가하지 않았다.

## 생성 계획: 정확히 3행

| 테이블 | 새 ID | 저장 내용 |
| --- | --- | --- |
| classes | `7f17bdb5-5c30-4605-a300-69fbd43d652c` | `[데모] 수학 리포트 확인 (2026-10-11)`, 비공개, 체험수업, 초3, 체험비 0원, 담당 미지정 |
| class_schedules | `cd1565d7-8216-44fa-b149-516ee6a01218` | 2026-10-10 14:00–15:00 Asia/Seoul, 일회성, 정원 1, open |
| trial_applications | `020993c4-4c97-466a-aeb5-04118e9af764` | 수학 리포트 데모학생 / 초3, 체험 완료, 완료·최근 활동 2026-10-10 15:00 +09, 등록 여부 미정 |

- 조직: 첫수업 데모학원 `29e8c477-dabb-404c-bac4-ba96ffd1e999`.
- 과목은 실제 활성 master FK를 사용한다. 수학 대분류 `c0985fd7-bebd-4a0b-8a35-1d78bdf8392e` + 교과수학 `393cec97-251d-4d1c-b2f7-c8b0a3506f02`, 기존 subject 코드도 `school_math`로 일치시킨다.
- 기존 데모 학원 계정 `accedc61-4a49-4679-ad5c-392499c21ccd`의 조직/role/seed email을 검증한다. 계정이나 교사를 생성·변경하지 않는다.
- 기존 `데모 보호자 1` (`b30a0732-5e20-4969-97d1-a8c51210f715`)을 연결한다. repo의 seed 정의와 실제 Auth email/Parent role/이름/미삭제 상태가 일치하고 기존 데모 신청 9건이 연결된 것을 읽기로 확인했다. Parent 2는 사용하지 않는다.
- 실제 자녀·연락처를 복사하지 않는다. 새 child_name은 명백한 데모 표시이며 child_id/parent_phone/teacher/schedule_block은 null이다. 기존 nullable FK 및 담당 미지정 일정 확정 계약에 맞춘다.
- 신청 memo에 실제 체험 이력이 아닌 신규 데모 데이터임을 표시한다. 리포트 원본·전달본·등록 상담 메모·처리 이력은 만들지 않는다.

## 회차와 발행 제한

현재 DB의 `enforce_date_booking_application`은 완료 이력의 INSERT에도 회차 `booking_status=open`을 요구한다. 이를 바꾸거나 우회하지 않는다. 수업 자체의 `is_active=false`로 공개 모집이 차단되며 회차도 과거 일자다. 기존 날짜 마감 규칙과 FK·시간·정원 검증을 모두 실행한다.

기존 Parent 연결은 가능하지만 **리포트 내용은 아직 저장되지 않았고 Parent V3 reader도 미배포**다. 실제 V3 보내기는 계속 금지한다. 향후 적법한 실제 로그인으로 저장·재진입·미리보기 및 발행 조건을 별도로 확인해야 한다. 데이터 준비와 실제 로그인/저장 E2E 성공은 다르다.

## 실행 통제와 발송 검토

- 별도 승인 후 정상 관리 DB 연결에서만 실행할 단일 transaction이다. auth.uid가 있거나 관리 역할이 아니면 중단한다. JWT/SET ROLE, RLS·trigger·검증 비활성화, 정책 변경, 기존 행 UPDATE/DELETE, upsert, 계정 생성 없음.
- 조직/기존 계정/분류 불일치, 준비 ID·제목 중복, Push mode가 off 아님, RLS 꺼짐, INSERT trigger 정의/활성 상태 변경 시 중단한다. 같은 SQL 재실행은 전체 거부하며 기존 행을 재활용하지 않는다.
- 3개 테이블의 실제 trigger 11개와 호출 함수·날짜 마감 검증을 읽었다. INSERT 과정에 외부 HTTP/알림 발송이 없다. 등록 결과 동기화 trigger는 undecided에 대해 새 결과를 쓰지 않는다.
- 일정 확정 Push는 application_logs INSERT를 원천으로 쓰며 이 SQL은 로그를 만들지 않는다. 현재 DB confirmed Push mode는 off이고 설정을 바꾸지 않는다. 기존 cron이 활성화되어 있어도 이 SQL은 delivery queue를 생성하지 않는다.
- 체험 전 알림은 confirmed + 다음날 일정만 조회하므로 이번 과거 completed 신청은 대상이 아니다. 후기 알림은 발행본과 parent_report_engagement가 필요하며 둘 다 만들지 않는다. 앱 신청·완료·발행 action과 알림 wrapper도 호출하지 않는다.

## 검증 증거

검증기: `scripts/verify-math-demo-prepare.cjs`. 실제 schema-only baseline에 배포된 후속 migration을 적용한 폐기 가능한 로컬 Docker DB에서 실행한다. 실제 DB table constraint/trigger/function과 일치하는지 먼저 검사한다. 테스트 baseline의 식별자는 격리 DB에만 준비하며 계정/JWT를 가장하지 않는다.

관련 검증: 3개 테이블 각각 +1행, 나머지 기존 데이터·권한·RLS 보존, 수학 분류, 완료 상태·Parent 연결, 잘못된 시간/닫힌 회차 실패와 전체 rollback, 잘못된 조직/Parent/과목 거부, 재실행 중복 거부. 리포트·로그·알림·등록 결과 추가 없음.

결과/실행 기록: `/Users/1to6/.codex/artifacts/report-math-demo-sql-20261011`. 현재 SQL 승인 전이며 실제 계정 화면·저장 E2E는 미검증이다. UI 앱 소스 변경이 없어 기존 typecheck/lint/build를 반복하지 않는다.

정상 실행 소스: `/Users/1to6/Desktop/firstsuup-report-math-review`, 포트 3000 유지. 적용 승인 후 생성될 URL은 `http://localhost:3000/studio/applications/020993c4-4c97-466a-aeb5-04118e9af764`이며, 현재는 미생성 URL이다.
