# Studio 학원 메모 통합 — 승인된 DB COMPAT 적용 완료 / 사용자 저장 검토 대기

2026-10-09, 기준 origin/main `f8ee813`. 기존 신청 상세·신청관리 UI 미커밋 변경 위에서 진행했다.

## 제품 변경과 저장 구조

- 별도 상담 추가 버튼/입력 모달과 상담 기록 수정 UI를 제거했다. 신청관리와 legacy 미등록 화면의 작성 안내는 학원 메모로 연결한다. 기존 상담 테이블, 데이터, backend RPC, 조회·분류·정렬은 보존한다. 신규 UI에서 기존 상담 create/update action을 호출하지 않는다.
- 신청 상세에 선택 입력인 학원 메모 한 곳과 `메모 저장`을 둔다. 학원 메모는 신청 상세의 독립 영역에서만 조회·편집한다. 승인된 상세 배치를 적용하면서 리포트 편집창의 메모 이동 링크도 제거했다. 기록 저장/리포트 보내기/등록 결과 저장과 메모 저장을 합치지 않는다.
- 과거 상담은 기존 note·발생 시각·채널·당시 등록 상태·사유·희망 일정·다음 연락 snapshot을 접힌 `이전 상담 기록`에서 읽기 전용으로 보여 준다. 이력이 없으면 영역 자체를 생략한다. 자동 메모 합치기 없음.
- `trial_results.note`는 발행 후 source 잠금 대상이다. 이를 예외 처리하면 원본 revision/리포트 잠금 계약에 영향을 주므로 **신청별 private 메모 1행 + 좁은 scalar RPC**를 선택했다. 원본 및 snapshot 잠금 함수는 수정하지 않는다.
- 메모 행이 없을 때만 기존 `trial_results.note`를 읽는다. 첫 메모 수정부터 새 행이 현재 메모가 되며, 빈 메모 저장도 명시적 현재 값이다. 빈 값에서 이전 메모가 다시 나타나지 않는다. 기존 source note는 원문 보존되며 새 report action은 클라이언트의 note를 받지 않고 저장된 legacy note를 유지한다. 데이터 일괄 복사/재작성 없음.
- 메모 RPC는 기존 `workflow_studio_application`의 본인 학원/완료/취소·불참 제외 guard와 application lock을 재사용한다. 발행 이력은 메모 잠금 조건이 아니다. 등록 완료/등록하지 않음에도 같은 기존 체험 완료 guard를 유지한다.
- UUID revision으로 동시 수정 충돌을 감지한다. 저장 실패/네트워크 실패에도 입력을 보존하고, 이중 클릭을 막는다. 메모 저장은 신청·활동 로그·등록 결과·trial_results·experience_reports를 쓰지 않으므로 업무 시각이나 목록 정렬을 바꾸지 않는다.
- Parent/타 학원/anon은 메모 조회·저장 불가. authenticated direct INSERT/UPDATE/DELETE도 불가. read RLS는 기존 조직 판별 helper, read/save RPC는 자체 권한 검사를 쓴다. memo scalar 외 공개 내용/등록 상태/actor/조직 등 조작된 form 값은 action에서 전달하지 않는다. 새 snapshot과 Parent 응답에 메모를 연결하지 않는다.

## 승인 대상 migration

`supabase/migrations/20261009120000_studio_academy_memo.sql`

- 새 `studio_academy_memos` 테이블(application_id PK, note, revision, updated_at, updated_by).
- 새 테이블의 own-org SELECT RLS 및 authenticated SELECT만 허용. 직접 DML 차단.
- `get_studio_academy_memo(uuid,uuid)`, `save_studio_academy_memo(uuid,text,text)` RPC. PUBLIC/anon EXECUTE 차단.
- 기존 테이블/데이터/policy/리포트 잠금/발행 RPC 변경 없음. 외부 알림 없음.
- **Production 미적용.** 실제 연결 DB에 0행 schema probe를 수행한 결과 새 테이블은 `404 / PGRST205`로 확인됐다. 현재 정상 3000에서 새 메모 저장은 불가능하며 DB 적용 승인 대기다. 기존 내부 메모는 저장 기능 준비 중 안내와 함께 읽기 전용으로 보존한다. fixture 성공을 실제 계정 저장 성공으로 간주하지 않는다.

## 실행과 검증

- 정상 localhost:3000, 실행 소스 `/Users/1to6/Desktop/firstsuup-studio-phase1-review`. 원래 WEB env symlink 유지. 별도 사용자 검토 서버/로그인/프로필 없음.
- 검토 URL: http://localhost:3000/studio/applications/97327ac5-1a6d-408f-86c8-a39a7741cb76 및 http://localhost:3000/studio/cases .
- 격리 DB: 로컬 Supabase의 schema-only(고객 행 없음)를 별도 Docker DB로 복원하고 기존 20261007120000 COMPAT + 새 migration을 재현했다. 신규 합성 fixture만 생성했다. 원래 local Supabase/실제 연결 DB에는 mutation하지 않았다.
- DB 검사: migration 전후 기존 전체 테이블 fingerprint 보존, 원본/발행 잠금 함수 불변; 기존 메모/V1/V2/상담 보존; 미발행/발행/철회 후 메모 조회·저장·재조회·지우기·revision 충돌; 타 학원/Parent/anon/direct DML 차단; 체험 전 저장 차단; 공개 내용/발행본 수정 차단; 새 Parent snapshot에 비공개 canary 없음; 상담 없는 독립 등록 입력·변경; 메모 저장 전후 기존 모든 테이블/시각 불변 PASS.
- 실제 server action의 격리 검사: auth/entitlement, form whitelist, 위조 actor/org/공개 필드 무시, 길이/revision/오류 처리, 저장 후 cache 실패 시 성공 보존, 기존 source note 보존, 발행 후 record action 차단 PASS.
- 실제 route/CSS 내부 fixture: 1440/1024 포함 상태별 렌더, 메모 저장 중/성공/실패·네트워크 실패·입력 보존·재진입·빈 값 보존·중복 저장 방지, 이전 상담 접힘/읽기 전용/빈 영역 생략, 단일 메모 이동, 공개 리포트 잠금/Parent 비노출, 독립 등록 결과 PASS. 신청관리 행 클릭/Enter/텍스트 선택/열 중심/헤더/긴 수업명/returnTo/anchor 회귀 PASS.
- 관련 순수 검사, typecheck/lint/build/diff-check 모두 PASS. NEW FAILURES=0 (실제 계정 화면/저장은 미검증). 빌드는 env 없는 소스 사본에서 실행해 정상 3000 dev cache를 보존한다.
- 실제 계정 화면과 고객 저장은 미검증: CUA 브라우저 목록이 비어 있고 기존 Chrome CDP 연결은 ECONNREFUSED 127.0.0.1:9222. 고객 저장/상태 변경/리포트 보내기/외부 알림은 실행하지 않았다.
- 검증 도중 발견한 신규 RLS의 base-table 직접 참조 권한 오류는 기존 security-definer 조직 판별 helper 사용으로 수정했다. 시험 스키마의 없는 fixture 컬럼과 UI 비동기 렌더 대기 조건도 수정 후 재검증했다. 최종 미해결 실패는 없다.
- 증거: `/Users/1to6/.codex/artifacts/studio-academy-memo-20261009`.

원래 WEB/MOBILE branch·HEAD·staged·dirty·untracked·env 보존. 기존 신청관리 열 정렬 CSS/행 링크 구현 보존. MOBILE/환경설정/자동 Push 설정 변경 없음. git stage/commit/push/Production DB 적용/배포 없음.


## 2026-10-09 승인된 단일 DB COMPAT 적용 완료

사용자가 `20261009120000_studio_academy_memo.sql` 한 개의 실제 연결 DB 적용을 승인했다. 위 승인 대기 항목은 적용 전 기록이며 현재 상태는 이 절을 따른다.

- 실행 env의 Supabase URL과 관리 API 대상 `first-class-mvp` (`vfkfpekfwrjjocltqbty`, ACTIVE_HEALTHY) 일치를 확인했다. 승인 SQL의 SHA-256 `d5a59672fd30ef3d0b20fecfb7555d062d0a57cc33363a903fac7c324dd70895`는 검토/빌드 사본과 일치했다. 기존 guard·권한 helper 등 6개 의존 함수 정의도 격리 검증 DB와 일치했다.
- 기존 migration 이력 134건과 대상 미적용을 확인한 뒤, 승인 SQL 및 해당 version의 이력 1건만 같은 transaction으로 적용했다. SQL 본문은 변경하지 않았으며 statements에 정확한 원문을 보존했다. 다른 pending migration 실행 없음.
- 적용 후 이력 135건 중 기존 134건의 전체 row fingerprint가 동일하다. 기존 public/app 함수 정의·ACL·table ACL·RLS·policy·trigger 불변, 새 table 1개/function 2개/policy 1개만 추가된 것을 확인했다. 기존 고객 데이터 DML 없음.
- 새 table RLS ON, authenticated SELECT/own-org policy, client direct DML·anon access 차단. RPC 2개는 authenticated EXECUTE만 허용하고 PUBLIC/anon EXECUTE 차단, SECURITY DEFINER 및 빈 search_path 유지. 실제 DB RPC 정의는 격리 검증 정의와 정확히 같다.
- 실제 REST schema 0행 조회 200, 조회/저장 RPC OPTIONS 200으로 API 반영 확인. 저장 RPC는 실행하지 않았다. 사후 확인 당시 새 메모 table 0행.
- 정상 localhost:3000 PID/cwd와 기존 env 유지. 미인증 실제 신청 URL 요청은 정상 로그인 redirect 307이다. 실제 로그인 브라우저는 CUA 목록 없음/CDP 연결 거부로 조회 화면·버튼 활성 상태가 미검증이다. 실제 계정의 메모 조회 성공 및 저장 성공으로 보고하지 않는다. 고객 메모 저장/리포트 보내기는 사용자가 직접 검토한다.
- CLI 직접 연결은 IPv6 경로 문제로 실패해 기존 CLI 인증의 관리 API로 전환했다. 인증 정보 출력·저장·변경 없음. 원래 WEB/MOBILE·기존 미커밋 작업·env 보존, commit/push/앱 배포 없음. 이번 코드 변경이 없으므로 이미 통과한 무관한 전체 검사는 반복하지 않았다.
- 적용 증거: `/Users/1to6/.codex/artifacts/studio-academy-memo-apply-20261009`.

## 2026-10-11 승인된 Studio 1단계 릴리스 검증

- 사용자가 정상 localhost:3000의 실제 화면 배치를 검토하고 현재 변경의 commit/push/Production 배포를 승인했다. 실제 계정의 메모 저장·새로고침 유지 성공은 에이전트가 관측하지 않았으며 PASS로 기록하지 않는다.
- 최신 origin/main `f8ee813`에서 clean integration worktree를 만들고 승인된 44개 경로만 통합했다. 사용자 검토 소스와 실행 코드가 동일하며, 최종 정적 검사 2개만 제거된 상담 UI 및 서로 배타적인 리포트 표시 구조에 맞췄다. 검토 전용 인증/route 또는 환경설정 변경은 포함하지 않는다.
- 실제 DB 이력 135건에서 `20261009120000`과 승인 SQL 원문/SHA-256 일치를 재확인했다. 기존 메모 권한/RPC·리포트 잠금은 적용 직후와 동일하다. 이번 릴리스에서 DB 재적용·신규 migration·고객 데이터 쓰기는 실행하지 않았다.
- 통합 소스의 typecheck/lint/build/diff-check와 신청관리/상세 UI, report snapshot/잠금, workflow/시간 판정, 실제 action 경계, 격리 DB 메모 저장·충돌·권한·보존 검사를 통과했다. NEW FAILURES=0. 고객 저장·리포트 보내기·외부 알림 검증은 실행하지 않았다.
- Production `PARENT_PUSH_ENABLED=false`, 일정 확정 Push의 DB mode=`off`를 읽기로 확인했다. 환경변수와 발송 설정 변경 없음.
- 정상 3000은 계속 검토 소스에서 실행된다. 통합 소스: `/Users/1to6/Desktop/firstsuup-studio-phase1-release`. 검증 증거: `/Users/1to6/.codex/artifacts/studio-phase1-release-20261011`.
