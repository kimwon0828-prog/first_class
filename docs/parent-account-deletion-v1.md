# Parent 회원탈퇴 + 개인정보 계약 Release V1 — 로컬 구현

> 이 문서는 로컬 구현 단계의 기록이다. 승인된 최종 릴리스 계약과 활성화 조건은 `parent-account-release-v1.md`를 따른다.

2026-10-01. 이번 요청의 최종 계약을 적용한다. `parent-account-release-audit.md`의 과거 익명화 제안은 이번 계약의 근거가 아니며, 학원이 이미 확보한 학생/보호자 개인정보 snapshot은 보존한다.

## 범위와 실행 환경

- 작업 시작 시 `git fetch origin`으로 확인한 main: `86cc8efb1c5fe3053a2222cb4c22850e055874a2`.
- 기존 root branch `feat/studio-ux-phase1`, HEAD `02060e7d2fe41e5dd7ac10f403029b5e8193869a` 유지. 기존 dirty/untracked 위에 필요한 부분만 수정했다.
- migration `supabase/migrations/20261001150000_parent_account_deletion_v1.sql`은 **로컬 Docker Supabase에만 적용**했다. Production DB/Auth/Storage write, migration, commit, push, deploy 없음.
- `node scripts/parent-account-deletion-local.cjs`: localhost:3000을 local Supabase(127.0.0.1:54321)에 연결한다. 기존 `.env*`는 수정하지 않으며 프로세스 환경변수만 덮어쓴다. SMS/알림톡 실발송 비활성화.
- server action은 `PARENT_ACCOUNT_DELETION_ENABLED=1` AND loopback Supabase URL일 때만 활성화된다. 현재 코드로 Production 탈퇴를 실행할 수 없다. Production 전환은 별도 승인/검수 범위다.

## 최종 데이터 계약

| 대상 | 탈퇴 처리 |
|---|---|
| Auth, profile(이름/전화/생년월일), 개인 children | 삭제 |
| ParentDecision | 삭제. Studio는 `학부모 응답 정보가 없습니다.` 표시 |
| experience_feedback / selected chips / private_note | row 삭제. 공개 집계에서 제외되며 최소 표본 기준도 재계산 |
| parent_notification_reads / parent_report_engagement | 삭제. 계정용 알림·읽음·리포트 반응 상태 제거 |
| favorites | 서버 테이블이 없는 browser localStorage. 현재 브라우저 삭제, 계정 UUID 변경/로그아웃 시 이전 목록 제거 |
| 실제 Parent 소유 Storage object | pending 본인 RPC로 목록 조회 → server admin Storage API로 실제 파일 삭제 → Auth 삭제 |
| trial_applications | 행, 학생/보호자 이름·연락처·학교·학년·관심과목·메모 등 기존 snapshot 보존. `parent_id`, `child_id`만 NULL로 detach |
| 진행 중 신청 / 일정 / 상태 | 보존, 자동 취소 없음. 완료일·다음 연락·희망 일정 등 보존 |
| consultation_logs / trial_results / experience_reports | 내용·작성/발행 사실·snapshot 보존. Parent 소유권은 신청 detach로 차단 |
| registration_results / 미등록 사유 | 별도 학원 사실로 보존. ParentDecision 삭제와 독립 |
| application_logs | 사실·메모 보존. 탈퇴 계정을 참조하는 `actor_id`만 NULL. UI fallback `탈퇴한 사용자` |
| SMS/알림톡 운영 이력 / 일정 block / import 이력 | 학원 운영 기록으로 보존. 일부 작성자 FK의 기존 SET NULL 동작 유지 |

기존 Studio adapter는 신청 snapshot을 사용한다. 개인 children/profile을 새 광범위한 snapshot으로 복제하지 않았다. 신청의 기존 `updated_at` trigger는 ownership detach 시 갱신되므로 보존 fingerprint에서 ownership 두 컬럼과 이 timestamp만 제외한다.

## 실제 로컬 FK와 최소 변경

기존 감사 문서와 실제 로컬 `pg_constraint`, nullability, trigger, RLS를 함께 확인했다. 원문 증거는 `/tmp/parent-deletion-v1/{fk.txt,columns.txt,triggers.txt,policies.txt}`.

| FK | 기존 삭제 동작 / nullability | 해결 |
|---|---|---|
| profiles.id → auth.users | CASCADE / NOT NULL | profile 먼저 정리, Auth 마지막 |
| children.parent_id → profiles | CASCADE / NOT NULL | 신청 child 연결 해제 후 개인 children 삭제 |
| trial_applications.parent_id → profiles | RESTRICT / nullable | NULL detach, FK 변경 없음 |
| trial_applications.child_id → children | SET NULL / nullable | 명시적으로 NULL detach |
| parent_decisions.parent_id → profiles | RESTRICT / NOT NULL | 개인 응답 먼저 삭제 |
| parent_report_engagement.parent_id → profiles | RESTRICT / NOT NULL | 개인 열람 상태 먼저 삭제 |
| experience_feedback.parent_id → profiles | CASCADE / NOT NULL | 집계/메모를 포함해 명시 삭제 |
| parent_notification_reads.parent_id → profiles | CASCADE / NOT NULL | 명시 삭제 |
| application_logs.actor_id → profiles | RESTRICT / **NOT NULL** | 이번 migration에서 nullable 변경 후 actor만 detach |
| reports / trial_results / consultation / registration → application | 각 기존 RESTRICT/CASCADE 유지 | application 자체를 삭제하지 않으므로 운영 이력 유지 |

새 `app.parent_account_deletions`는 최소 재시도 marker이며 auth.users CASCADE. RLS 활성화, anon/authenticated 직접 table 권한 없음. `prepare_my_parent_account_deletion`, `get_my_parent_account_deletion_status`, `get_my_parent_deletion_storage_objects`는 인자를 받지 않고 auth.uid()만 사용한다. 공개/anon 실행 권한 없음, authenticated 실행만 허용. cleanup RPC는 Parent role을 검증한다. service-role을 탈퇴 대상 조회의 우회 경로로 쓰지 않는다.

개인 응답의 불변 trigger는 자체 탈퇴 transaction의 postgres/current UID/processing marker 조합일 때 DELETE만 허용한다. UPDATE 불변성은 유지한다. trigger 비활성화, client GUC 우회는 없다. Studio 작성자/교사 등 혼합 역할 참조가 있으면 정리를 시작하기 전에 거부한다. 리포트·체험 기록의 불변 trigger는 변경하지 않았다.

## 서버 순서 / 실패 / 동시성

1. Auth `getUser()`로 현재 사용자를 검증한다. form에는 대상 user ID가 없다.
2. authenticated RPC가 사용자별 advisory transaction lock + Parent profile row lock을 획득한다.
3. marker 생성 → 개인 데이터 삭제 → 신청/actor detach → children/profile 삭제 → db_cleaned marker. 한 DB transaction으로 처리한다.
4. 본인 소유 Storage 목록과 실제 파일을 정리한다.
5. 서버의 기존 service-role helper로 검증된 현재 UID의 Auth user만 삭제한다.
6. Auth 완료 후 세션/cookie 제거 및 `/account-deleted`로 명시 redirect. 보호된 `/my` 재렌더에 의한 로그인 redirect 경쟁을 피한다.
7. 짧은 HttpOnly 완료 cookie가 확인된 공개 완료 화면에서 browser favorites/세션을 정리한다. localStorage 차단 시 수동 사이트 데이터 삭제 안내를 표시한다.

DB 실패는 전부 rollback되며 Auth delete를 호출하지 않는다. Storage/Auth 실패는 fake success가 아닌 error를 반환하고 marker를 보존한다. retained JWT의 profile 재생성은 DB trigger로 막는다. 로그인/소셜 callback과 `/my`는 pending 계정을 탈퇴 마무리 화면으로 보낸다. 재시도는 cleanup을 반복하지 않고 남은 단계를 수행한다. Auth 성공 시 marker도 제거된다.

버튼 pending 동안 중복 클릭·닫기를 막는다. 6개 동시 cleanup 요청 및 검증을 마친 두 전체 workflow의 중복 Auth delete(404 포함)를 검사했다. 이미 Auth 삭제가 끝난 뒤 새로 시작한 요청은 인증 실패로 종료하며 다른 계정에 영향을 주지 않는다. 이전 JWT가 아직 만료되지 않아도 소유권 detach와 profile/child 삭제로 과거 Parent data 접근이 불가능하다. Auth 삭제가 JWT를 즉시 만료시키지 않는 점과 소유 Storage 파일의 삭제 제약은 [Supabase 사용자 데이터 관리 문서](https://supabase.com/docs/guides/auth/managing-user-data), 서버 admin 삭제 경로는 [공식 deleteUser 문서](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)를 확인했다.

같은 이메일로 재가입하면 새 Auth UUID를 사용하며 이메일/이름/전화번호로 과거 신청을 연결하는 코드가 없다. 실제 Kakao 외부 OAuth 가입은 수행하지 않았다. 소셜도 기존 callback의 새 Auth UID를 기준으로 처리한다.

## 알림 / 브라우저 저장소의 범위

- Parent 알림 발송 직전에 현재 application.parent_id와 살아 있는 Parent profile을 재확인한다. stale queued context도 Alimtalk/SMS provider에 전달되지 않는다.
- reminder는 detached Parent를 skip하고 학원 담당자/관리자 흐름은 유지한다. safe wrapper 유지, 알림 실패가 핵심 업무 mutation을 실패시키지 않는다.
- 이미 외부 provider에 전달된 메시지를 소급 취소하는 기능은 없다.
- favorites는 계정 소유 표식이 없던 legacy 목록도 첫 인증 UUID 연결 시 비운다. 소유 불명 목록이 재가입 계정으로 넘어가지 않도록 한 선택이며, 향후 Production 전환 검수 시 이 일회성 변화도 확인해야 한다.
- 다른 기기·오프라인 브라우저의 localStorage를 원격으로 즉시 삭제할 수는 없다. 앱 재접속/계정 전환 시 정리한다. 서버에 favorites/개인 설정 테이블을 새로 만들지 않았다.
- Parent avatar upload는 없고 기존 Parent 소유 객체는 로컬 조사에서 0개였다. Storage 검증은 별도 local 임시 bucket/단일 계정 정책/실제 파일로 수행하고 해당 임시 정책을 제거한다.

## 정책 정렬과 법률 검토 TODO

`/privacy`: 첫수업 직접 계정/개인 서비스 데이터와 학원이 이미 제공받은 운영 기록을 분리, 탈퇴 시 삭제/detach/예약 유지/재가입 비연결 및 기존 문의처 안내. 과거 초안의 임의 고정 보유기간과 검증되지 않은 별도 DB 이관·즉시 복구 불가능 파기 표현을 삭제했다. 로그/백업의 최종 검토 필요성을 명시했다.

`/third-party-consent`: 실제 create-trial-application payload를 확인해 보호자 이름·연락처, 학생 이름·학년·학교·관심과목, 수업·일정, 자녀 특이사항·경험/기간·수준·희망 정규 일정·목표/메모를 기재했다. 전달하지 않는 Parent 이메일/생년월일은 제공 목록에 추가하지 않았다. 학원별 보관 및 정정/삭제 문의 경로를 설명한다.

`/terms`: 회원탈퇴/계정 종료 관련 최소 문구만 정렬했다. 기존 고객 문의 이메일/전화 재사용, 자동 삭제 요청 처리 시스템은 새로 만들거나 있다고 쓰지 않았다.

법률 최종 검토가 필요한 항목:

- 첫수업/학원의 개인정보 처리자·제3자 제공/위탁 관계와 책임 구분.
- 학원별 보유 목적·기간·파기/정정/처리정지 절차 및 탈퇴 후 진행 중 예약 연락 범위.
- 아동/법정대리인 확인 및 동의 방식, 현행 초안 표현의 적절성.
- 동의 버전·시각·증빙 보존 범위. 현재 신청 action은 동의 checkbox를 검증하지만 별도 영구 Parent 동의 증빙 table은 확인되지 않았다. 증빙 보유기간을 임의로 만들지 않았다.
- Auth/호스팅 로그, 백업, 분쟁 증빙의 보유·파기 범위 및 기존 문안의 계약/보안 관련 주장 검증.
- 외부 오프라인 브라우저 cache 및 localStorage 삭제 한계.

이는 실제 제품 동작을 설명하는 검토용 문안이며 법률 적합성 확정이 아니다.

## 검증과 증거

재현 명령(모두 local-only):

```
node scripts/verify-parent-account-deletion.cjs
node scripts/verify-parent-account-deletion-storage.cjs
node scripts/verify-parent-account-deletion-support.cjs
PLAYWRIGHT_MODULE_PATH=<existing playwright module> node scripts/verify-parent-account-deletion-browser.cjs
ESBUILD_MODULE_PATH=<existing esbuild module> PLAYWRIGHT_MODULE_PATH=<existing playwright module> node scripts/verify-parent-mypage-account.cjs
npm run typecheck
npm run lint
```

- DB/JWT: anon/Studio/타 Parent 대상 인자 거부, 실제 FK blocker를 이용한 transaction rollback, Auth 실패/재시도, pending profile/children 생성 거부, 무신청/진행 중/완료/복수 자녀/응답/feedback/등록/리포트 fixture, 동일 이메일 재가입, Studio JWT 보존 조회.
- 보존 fingerprint: 신청 2개, 체험 1개, 상담 1개, 리포트 1개, 등록 1개의 전후 SHA256 동일. 신청은 앞서 명시한 ownership/updated_at만 제외. 활동 로그도 actor 외 원문 동일. `/tmp/parent-deletion-v1/preservation-fingerprints.json`.
- feedback: 세 Parent의 공개 집계에서 1개 탈퇴 → 남은 2개가 최소 표본 미달로 비공개. 개인 private_note/decision 행도 0개.
- Storage: 실제 파일 소유권 발견, 삭제 실패 시 Auth 미삭제, pending 추가 업로드 차단, 재시도 파일/Auth 삭제, 두 겹친 전체 workflow 성공.
- notifications: 실제 로컬 application/profile을 조회하며 fake delivery sink로 provider 호출 없음 검증. 실제 reminder 함수에 격리 candidate를 주입해 Parent skip + admin flow 유지 확인. 실 SMS/알림톡 발송 없음.
- browser: 실제 localhost/local Auth 쿠키로 탈퇴 전 Parent routes, 2단계 sheet, 취소, 강제 network 실패/재시도, 실제 local 탈퇴/공개 완료, 세션·favorites 제거, 탈퇴 후 로그인 요구, pending 마무리, 정책 HTTP 200, Studio Cases/detail/상담/체험/등록/ParentDecision fallback 및 보존된 리포트 펼침 확인. 동일 이메일 재가입 계정의 실제 MyPage·신청·기록·찜 비연결도 별도 read-only browser 실행으로 확인했다.
- 이전 MyPage 프로필 편집/뒤로가기/포커스/모바일 390·430·480/desktop 회귀 verifier 유지. 탈퇴 준비중 기대값만 새 2단계 UI 계약으로 수정.
- build는 `/tmp/parent-deletion-v1/build`에 현재 source를 복사해 PASS. 운영 env 없이 mock data + loopback Auth 설정. 기존 실행 중 localhost `.next`를 덮어쓰지 않았다.
- evidence JSON/screenshots는 `/tmp/parent-deletion-v1/`. local fixture token은 repository에 저장하지 않는다.

## 로컬 시각 검수

`http://localhost:3000/auth/sign-in/email?returnTo=%2Fmy`에서 `/tmp/parent-deletion-v1/review-credentials.txt`의 **local 전용** 계정으로 로그인한다. `/my` → 회원탈퇴 → 설명 → 최종 확인 → 완료. 준비된 review 계정은 자동 검증으로 탈퇴시키지 않았다. 최종 클릭하면 해당 local fixture는 실제 삭제된다.

실패 화면 screenshot과 pending recovery screenshot도 증거 디렉터리에 있다. 브라우저에서 실패를 직접 검수하려면 최종 확인 후 개발자도구의 Offline을 켜고 제출한 뒤 다시 Online으로 돌려 재시도할 수 있다. UI에 테스트 전용 버튼이나 Production 우회 인증은 넣지 않았다.

최종 결과: typecheck PASS, lint PASS(기존 Next lint 명령 deprecation 안내만), build PASS, git diff --check PASS. browser 합계 12개 검증 기록, page runtime error 0. 기존 HEAD/index/.env와 이번 범위 16개 수정 파일 이외의 원본 tracked/untracked SHA256 보존 확인. 상세 결과는 `/tmp/parent-deletion-v1/{db-results.json,storage-results.json,support-results.json,browser-results.json,browser-extra-results.json,preservation-results.json}`.
