# Parent Report → 최종 Feedback 흐름

2026-09-29. 로컬 구현/검증. Production 쓰기·migration·Git commit/push/PR/main·Vercel 배포 없음.

## 확정 정책과 화면

리포트 열람은 피드백과 무관하다. Record 상세에서 Feedback/ParentDecision 입력과 해당 조회를 제거하고 기존 경험 정보·발행본 관찰 요약·리포트 진입을 유지했다. Report 상세는 기존 소유자 조회로 발행본 전체를 먼저 보여준 다음 `#experience-feedback`에 통합 입력을 표시한다. Feedback 또는 Decision 조회가 실패해도 리포트는 보이며, 두 입력의 오류는 각각 표시하고 제출은 막는다.

입력 순서는 칩(최대 5) → 비공개 의견 → 등록 의향 → 필요한 사유/일정 → `보내고 나면 수정할 수 없어요.` → 마지막 `피드백 보내기` 한 개다. 선택은 client state만 변경한다. 이전 단일 action/transaction, 실패 시 모든 입력 보존, 완료 후 서버 재조회·읽기 전용, 중복/동시 제출 방어를 유지한다. 실제 Studio 등록 결과는 별개다.

기존 Feedback만 있으면 Decision만, 기존 Decision만 있으면 Feedback만 한 번 보완한다. 기존 응답·이력은 변경하지 않는다. 두 응답이 모두 있으면 완료로 취급한다. 기존 `canCollectParentDecision` 조건도 유지한다.

## 감사 결과와 저장 위치

- 리포트: `experience_reports`는 발행 당시 내용을 담는 불변 snapshot이며, 발행/철회 RPC는 신청 row를 먼저 잠근다. Parent RLS는 `status='published' AND is_own_trial_application(application_id)`다. 이 정책과 기존 안전한 `getMyExperienceReport` 조회를 유지했다.
- 웹 알림함: 범용 발송/queue 테이블이 없다. `application_logs`/`experience_reports`의 사건을 selector가 알림으로 만들고 `parent_notification_reads`에 읽음 receipt만 저장한다. SMS/알림톡의 `sms_logs`를 웹 알림함 소스로 쓰지 않는다.
- 최초 열람은 mutable Parent 표시 상태이므로 immutable report나 Studio 신청 상태에 컬럼을 추가하지 않고 **`parent_report_engagement`**에 신청별 한 row를 둔다. `application_id` PK, 소유자 snapshot, 최초 열람 report ID, `report_first_viewed_at`, `feedback_reminder_sent_at`만 저장한다. 응답 내용/연락처/비공개 의견을 복제하지 않는다. 재발행해도 신청별 최초 열람·1회 알림은 초기화하지 않는다.

## 서버·DB 경계

0930 migration은 기존 `submit_parent_experience` 본문을 유지하면서 발행 리포트의 공유 잠금과 **동일 ownership predicate**를 추가한다. Class SHARE → Application UPDATE → Published Report SHARE 순서다. 발행/철회와 같은 신청 잠금으로 직렬화하므로 검사와 저장 사이에 철회되는 틈이 없다. 발행본이 없으면 직접 RPC도 `feedback_report_required`로 거부한다. 원래 Feedback/Decision 테이블, 스냅샷·taxonomy·공개 집계, 현재 Decision unique와 Parent 불변성 trigger는 그대로다. service/admin 운영 경로를 새로 제한하거나 Parent에 재개방하지 않는다.

`mark_parent_report_viewed(report_id)`는 authenticated Parent 역할·신청 소유·현재 published를 검사한다. `INSERT … ON CONFLICT(application_id) DO NOTHING`으로 최초 시각을 보존한다. Parent/Academy/Public의 engagement 직접 쓰기는 불가하다. Parent SELECT는 본인만 가능하다. 다른 Parent·Academy·Public은 열람 기록 RPC도 거부한다.

Report의 client mount effect가 document visible일 때 별도 POST를 보낸다. 서버 page/query/metadata는 기록 함수를 호출하지 않는다. RSC prefetch는 mount하지 않으므로 열람이 기록되지 않는다. 기록 실패가 리포트 본문 열람을 막지 않는다. 다음 실제 열람에서 다시 시도한다. 이는 열람 기록이며 스크롤 완독 여부를 추정하지 않는다.

## 웹 알림

발행 알림은 기존 `report_published:<report UUID>`를 재사용하며 문구는 `체험수업 리포트가 도착했어요`, 링크는 `/record/:id/report`다. 동일 event key를 selector에서 중복 제거한다. 읽음과 발행 알림의 존재는 분리되어 있다.

`claim_parent_feedback_reminders()`와 `complete_parent_feedback_reminder()`는 service_role에만 실행 권한이 있다. 기존 `/api/cron/trial-reminders`의 인증/스케줄을 재사용한다. 조건은 published, 최초 열람 ≥24시간, 두 응답이 모두 존재하지 않음, completed이고 canceled/no-show 아님, reminder timestamp 없음이다. `FOR UPDATE … SKIP LOCKED`로 대상을 선점하고 15분 lease로 중복 발송을 막는다. 알림톡 또는 SMS fallback이 provider에서 수락된 뒤에만 `feedback_reminder_sent_at`을 기록하며, 실패 시 claim을 해제해 다음 실행에서 재시도한다.

학부모 리마인더의 기본 채널은 카카오 알림톡 `trial_feedback_reminder`다. 버튼은 `/record/{applicationId}/report#experience-feedback`으로 연결한다. Ncloud에서 동일한 본문과 `피드백 남기기` 웹링크 버튼을 승인받은 뒤 `ALIMTALK_TEMPLATE_TRIAL_FEEDBACK_REMINDER`에 template code를 설정해야 실제 발송된다. 템플릿·provider·환경 설정이 없으면 SMS로 조용히 바꾸지 않고 다음 cron에서 재시도한다. 설정이 완료된 뒤 실제 provider 요청이 실패하는 경우에만 기존 Parent 알림 정책대로 SMS fallback을 시도한다. 외부 발송 실패는 리포트 열람이나 피드백 제출을 실패시키지 않는다.

기존 알림함은 **DB의 확정된 사건 자체가 알림**이므로 reminder timestamp의 성공적인 transaction commit이 알림 생성이다. 별도 전송을 시도하기 전에 sent flag를 먼저 쓰는 구조가 아니다. UPDATE/transaction 실패 시 사건과 timestamp 모두 없고 재시도 가능하다. 한 번 생성된 사건은 제출 후에도 이력으로 남으며 링크의 결과는 readonly다. 철회되어 현재 발행본이 없으면 기존 발행 알림과 마찬가지로 표시되지 않는다.

알림 key는 `feedback_reminder:<application UUID>`, 제목 `체험은 어떠셨나요?`, 설명 `짧게 의견을 남겨주세요.`, 링크 `/record/:id/report#experience-feedback`다. 기존 읽음 RLS validator를 이 key에만 확장했다. payload에는 고정 문구와 기존 공개적인 수업/아이 표시 정보만 있으며 private note/Feedback 응답은 읽지 않는다.

기존 cron은 매일 01:00 UTC(10:00 KST) 실행이다. **24시간이 지난 후 다음 실행에서** 생성하며 정확히 24시간 시점의 실시간 발송은 아니다. 실행당 최대 500건이다. 조건을 만족하지 않는 완료/철회 건은 batch를 차지하지 않는다. 웹 알림 실패는 기존 SMS/알림톡 루프 결과와 분리해 보고한다. 외부 SMS 문구/전송 정책은 바꾸지 않았다.

App Store 후속 준비 항목: iOS/Android native push, device token/권한 동의/전송 재시도/중복 방지 설계. 이번에는 웹 알림함만 구현했다.

## Migration와 rollback

적용 순서: 0900 신청 권한 보강 → 0910 Feedback → 0920 원자 최종 제출 → **0930 `parent_report_feedback_flow`**. 이 기능을 아직 적용하지 않은 환경에서는 네 파일과 UI를 함께 검토된 배포 단위로 적용해야 한다. 0910만 노출하거나, 새 정책에서 0920 RPC만 복구하지 않는다. 이번에는 원래 프로젝트의 loopback Local Supabase에만 transaction으로 적용했다. Production 적용은 하지 않았다.

안전 rollback: `docs/sql/manual/rollback_parent_report_feedback_flow.sql`. 제출/열람 기록/리마인더 생성 RPC만 제거하고 모든 응답·리포트·열람/알림 사건·읽음 이력·RLS·불변성 방어를 보존한다. 조회는 유지되고 쓰기는 fail closed다. 운영 시 읽기 전용 유지보수 UI와 함께 사용한다. 복구는 prerequisites 이후 0930 재적용이다. 기존 mutable RPC를 재허용하거나 데이터를 삭제/자동 변환하지 않는다.

## 검증

실제 로컬 Auth JWT/PostgREST/RLS, 원래 프로젝트의 `localhost:3000` 최적화 빌드를 사용한다. 테스트는 기존 검수 응답을 삭제하지 않고 새 TEST 신청을 만든다. 인증 자료는 `/tmp`의 0600 파일이며 보고서/스크린샷에 포함하지 않는다.

- `verify-parent-report-feedback-db.cjs`: Report gate, 타인/역할 경계, SELECT 부작용 없음, 최초 view 불변성, 직접 쓰기 차단, 24시간 경계, 10개 동시 cron, 읽음 RLS, 제출·취소·노쇼·철회 제외, 알림 transaction 실패/재시도.
- `verify-parent-experience-final-db.cjs`: 새 발행본 fixture를 추가한 기존 원자 제출·10회 동시 제출 1회 성공·두 번째 저장 실패 rollback·legacy/부분 상태·불변성·service maintenance·Public DTO 검증.
- `verify-parent-report-feedback-browser.cjs`: HTML/metadata/RSC prefetch 부작용, Record 입력 없음, 실제 report 진입/재열람, 본문/폼 순서, 키보드, readonly, 알림 문구/중복/deep link/비공개 payload, 타인 접근, 390/768 화면.
- `verify-parent-experience-final-browser.cjs`: 실제 Report route에서 하나의 CTA/선택 POST 0, 전체 draft 보존, 더블클릭 방지, legacy/부분 상태, 조회 오류 독립 처리, Public HTML/RSC·Studio 회귀.
- migration verifier: 새 적용/재적용/안전 rollback/복구 및 기존 신청·Decision 이력 JSON 보존. 별도 isolated DB transaction을 마지막에 rollback.
- workflow SQL: Studio 등록 결과 trigger, 완료 응답의 독립성, legacy 보완, 수집 종료, 취소/노쇼 계약.

시각 검증 중 발견한 문제: App Router의 hash 이동이 sticky header가 있는 리포트에서 스크롤 0에 머무는 사례를 실제 DOM 위치로 확인했다. mount 후 고정된 `#experience-feedback`만 찾아 이동·초점 처리하여 보완했다. 임의 selector/외부 링크를 실행하지 않는다. 다른 Parent의 notFound는 Next 스트리밍 응답에서 HTTP 200일 수 있으므로 접근 거부 화면과 실제 내용 비노출을 함께 검증한다.

## 실행 결과와 검수 화면

- Local JWT/RLS: 기존 최종 제출 **42 PASS**, 신규 report/view/reminder **12 PASS**.
- 실제 localhost 브라우저: 기존 통합 제출 회귀 **12 PASS**, 신규 report-first 흐름 **8 PASS**.
- migration clean apply/reapply, safe rollback/restore, 기존 신청·Decision 이력 보존 PASS. 별도 workflow SQL PASS.
- typecheck, lint(오류/경고 0), optimized build, 관련 정적 verifier, `git diff --check` PASS.
- 실제 Public Class/Academy HTML·RSC와 notification HTML·RSC에서 private note canary 비노출. Studio readonly와 공개 DTO/집계 정책 유지.
- 모바일은 localhost Chrome 390×844 및 768px viewport로 확인했다. 기존 safe-area CSS를 유지하며 native iOS/Android 기기 검증은 이번 범위가 아니다.
- 시작 baseline 대비 관련 기존 파일 23개 수정, 신규 9개, 삭제 0. 나머지 924개 baseline 파일 hash 동일. 기존 dirty 변경을 되돌리거나 정리하지 않았다.
- 검수 서버: `http://localhost:3000/record/d95037b1-deef-458d-9e88-15d4644c7c10/report` (로컬 TEST Parent 로그인). 본문 뒤에 미제출 폼이 있는 상태를 유지한다.
- 검수 창 복구: `node scripts/open-parent-feedback-review.cjs report`. 서버는 로컬 Supabase process environment를 주입한 `next start`다. `.env.local` 값을 그대로 사용해 서버를 띄우지 않는다.
- 증빙: `/Users/1to6/Desktop/첫수업 아카이브/2026-09-29-parent-report-feedback-flow/`의 스크린샷·검증 결과. TEST credential/session 파일은 복사하지 않는다.

Production DB write/migration, commit, push, PR, main 반영, Vercel 배포 없음.
