# Studio 신청 상세 — 최종 리디자인

> 발행 전 수정·저장 / 발행 후 잠금 계약은 [후속 변경](studio-report-edit-before-publication.md)을 따른다. DB COMPAT는 승인 후 적용했고 앱 변경의 commit/push도 승인됐다. 아래 최초 저장 잠금 설명은 기존 Production 이력이다.


## 2026-09-30 체험 기록 작성 모달 polish

- 체험 기록 작성 UI만 변경했다. 상담 모달의 CSS를 그대로 재사용하고 해당 파일은 수정하지 않았다. 600px native dialog, viewport 최대 높이, 내부 스크롤, 접근 가능한 하단 확정 안내/취소/확정, focus 순환과 Escape/복귀 패턴을 맞췄다.
- 수업 관찰 → 2열 추천 과정/레벨 → 추천 일정 → 총평 → 내부 메모 → 확정 안내/버튼. 기존 관찰 7개 code, 총평 1000자 제한과 공개/비공개 의미는 유지한다.
- 추천 일정은 복수 ISO 요일과 단일 시간대(오전 09~12, 오후 12~18, 저녁 18~21, 시간 무관) 선택이다. 재선택으로 해제 가능. 기존 nullable 문자열 필드에 `화·목 / 저녁` 형태로 저장하며, 요일만/시간대만/모두 미선택도 기존 선택 입력 계약 안에서 허용한다. 요일 순서는 월~일로 일정하다.
- 추천 방향을 Parent 희망 일정 JSON과 합치지 않는다. 기존 확정 기록과 발행 snapshot의 자유 입력 일정은 파싱/변환/수정하지 않는다.
- `upsertTrialResultAction` → adapter → `finalize_studio_trial_result`와 권한/1회 확정/삭제·수정 불가 계약을 유지한다. 실패 시 모든 draft 유지, pending 중 닫기·취소·Escape·연속 제출 방지. 기존 성공 확인/refresh 흐름 유지.
- 검증: 새 `verify-trial-record-modal.ts`는 문자열/Parent snapshot 왕복/비공개 메모 제외와 in-memory 10회 동시 확정 중 1회 성공·재확정 차단을 확인한다. 이는 live DB 동시성 테스트가 아니다. 기존 Phase 1 action/RPC/locking guard 소스와 이전 Local DB 검증 증거를 유지한다.
- 실제 route/component mock 브라우저: 단일·복수 요일, 네 시간대, 기존 form payload, 실패 draft, keyboard/focus, 1440/1280/1024 및 높이 500px, 상담 모달 포함 상세 회귀. Parent 실제 report page/CSS도 390/768px에서 새 추천 문자열·기존 자유 문자열을 표시하고 private note가 없는지 확인한다. Parent 열람 기록/피드백은 이 격리 fixture에서 실행하지 않는다.
- 실제 로그인 localhost:3000에서는 모달 열기·선택·취소만 검수. `체험 기록 확정` 클릭 및 action 요청 0건. 기존 운영 연결과 환경변수 유지. 증거/작업 전 fingerprint: `/tmp/trial-record-modal-polish-pHAph4/`.
- DB/schema/migration/RPC/RLS/action/adapter/Parent 제품 코드 변경 없음. commit/push/deploy 없음.


## 2026-09-30 연락·상담 추가 모달 polish

- 추가 모달만 `ConsultationLogDialog`로 분리했다. 600px native dialog, viewport 최대 높이, 내부 body 스크롤, 항상 접근 가능한 footer. 기존 상세·체험 기록·등록·리포트·상담 이력 편집은 그대로다.
- 상담 방식 → 상담 일시 → 학부모 반응 → 상담 내용 → 선택적 희망 일정 → 시간 조정 가능 범위 → 추가 메모 → 취소/저장하기 순서다. 방식/반응의 저장 ID는 기존 상수를 사용한다.
- 희망 일정 NULL이면 추가 버튼만 표시. 행은 기존 JSON group 한 개에 대응하며 최대 3개, 30분 select와 기존 domain validator를 재사용한다. 기존 여러 요일, 이후/이전/시간 무관, 30분 격자 밖의 저장 시간도 원래 의미와 값으로 표시·보존한다. 자유 텍스트를 구조화 값으로 추정하지 않는다.
- 기존 action/RPC에서 `flexible`은 row 없이 허용한다. 행이 있을 때만 조정 범위 select를 표시하고, flexible 선택 후 마지막 행을 삭제해도 해당 선택은 유지한다. 이때 행 없는 상태를 기존 null 계약으로 보내며 undecided로 추정하지 않는다.
- 새 상담의 유연성을 이전 상담에서 임의 추정하지 않는다. 기존 상담의 유연성·일정·메모 조회 및 수정 화면은 이번 범위 밖이므로 그대로 유지한다.
- 일정/메모 무변경이면 form field를 생략해 기존 Case 값을 보존한다. `nextContactAt`도 생략하여 기존 action이 현재 DB 값을 보존한다. 읽지 못한 미래 버전은 새 행을 직접 입력하기 전까지 보존하고, 메모만 바꿔 원본이 삭제되는 경로는 차단한다.
- 기존 `createConsultationLogAction` → `createStudioConsultationTransaction` → `record_studio_contact` 그대로다. action/adapter/RPC/validator/DB/migration/env 변경 없음. 기존 note 길이 정책 유지.
- 실패 시 전체 draft 유지, inline 오류, pending 중 닫기/Escape/연속 제출 방지. 성공 시 닫고 refresh하며 기존 성공/중복 응답 메시지는 연락 영역에 표시한다. 키보드 focus 순환·복귀, label, aria-pressed 유지.
- 검증: 실제 route/component의 네트워크 차단 mock 브라우저에서 14개 상세 상태 회귀, 상담 저장/실패/draft/중복 클릭/성공 refresh/legacy 및 기존 복합 일정 보존. 실제 로그인 localhost에서는 1440/1280/1024와 높이 500px의 열기/추가/선택/취소/Escape만 검수했다. 저장 클릭 및 action 요청 0건.
- 증거: `/tmp/consultation-modal-polish-Vm1NvX/` (작업 전 fingerprint, 순수 verifier 로그, mock/실제 화면 캡처). Production 쓰기 DB 테스트는 실행하지 않았다. 이전 Local Phase 1 DB 검증 증거는 그대로다.


## UX V2 최종 미세수정

- 상단 더보기/수업 미리보기 메뉴만 제거. 수업 route와 공용 링크 생성 계약은 유지한다. 전화·문자 링크는 그대로다.
- `ApplicationAssigneeControl`은 기존 Studio의 native dialog/showModal 패턴을 사용하는 420px 모달이다. 현재 담당, 미배정/기존 조직 활성 선생님 select, 취소/저장만 제공한다. Escape·취소·focus 복귀를 지원하며 scrollbar 잠금 시 폭을 보정해 헤더를 밀지 않는다.
- 기존 `updateApplicationAssigneeAction` → adapter → `set_studio_application_schedule(operation=assign)` 그대로 사용. action/RPC/query/RLS 수정 없음. 선택과 취소는 client-only. 성공 응답 후 헤더 갱신·닫기·서버 refresh. 실패 시 draft 유지. form 자동 reset 없이 기존 action을 transition으로 실행한다.
- 제품 변경은 상세 `page.tsx`, 신규 `application-assignee-control.tsx`, 기존 `application-assignee-form.module.css`의 모달 전용 class뿐이다. 기존 card form과 나머지 Application Detail 기능은 유지한다.
- UI verifier에 담당자 변경 mock 성공/실패/미배정 복귀/조회 오류/취소/Escape/focus/layout shift 검사를 추가했다. 실제 localhost 계정에서는 열기·선택·취소만 확인하고 저장하지 않았다. 실제 헤더 bounding box 전후 동일, 모달 폭 420px.
- 작업 전 fingerprint와 증거: `/tmp/detail-final-polish-TbZqjh/`. Production write/migration/commit/push/deploy 없음.
- 최종 typecheck/lint/build/diff PASS. 담당자 미배정 verifier 및 기존 Phase 1 순수 verifier 총 11종 PASS, 실제 컴포넌트 브라우저 verifier PASS. 표준 빌드 후 원래 프로젝트에서 동일 `.env.local`로 `npm run dev` 재시작(npm PID 27624). 기존 dirty/untracked·branch/HEAD/staged·환경변수·action/query/adapter/DB 보존 확인.

## 2026-09-30 Application Detail UX V2 (Phase 1 위의 UI 변경)

이 절이 아래 9월 28일 기록보다 최신이다. 현재 기록은 1회 확정, 리포트는 1회 발송이며 등록 결과는 독립 저장한다. 기존 action/adapter/RPC/권한/DB는 이번 작업에서 수정하지 않았다.

- 학생·수업·확정 일정 헤더의 전화/문자/담당자 변경 기능 유지. 라벨과 함께 작은 inline SVG 사용.
- 진행 현황은 체험 완료 / 체험 기록 / 학부모 리포트 / 등록 결과의 4개 읽기 전용 요약. 등록 의향을 실제 등록 결과로 추정하지 않는다.
- 체험 결과 정리 안에서 기록, 리포트, 등록 결과를 구분선으로 분리. 기록 미작성에도 리포트 미발송 행을 표시한다. 확정된 기록과 발송된 snapshot은 접힌 읽기 전용 상세로 확인한다.
- 등록 결과의 사유·메모는 고민 중(기존 8개), 미등록(기존 9개)에서만 표시. 숨겨진 기존 메모도 form에 보존한다. 저장된 상태·사유 집합·메모와 같은 draft는 저장 비활성, 변경 후 원래 값으로 되돌려도 비활성. pending 중 중복 제출 차단, 실패 시 controlled draft 유지.
- 연락·상담 최근 3건은 방법/보호자/요약/시각 행으로 표시. 전체 이력과 기존 작성 modal·희망 일정/시간 유연성 계약 유지. 최근 활동은 기존 event 데이터 사용.
- Aside: 학생·학부모 → 체험 일정 → ParentDecision → 신청 참고 정보. 기존 Feedback 읽기 전용 표시도 보존. 1024px은 자연스럽게 한 열로 전환한다.

변경 UI 파일:

- `app/studio/(dashboard)/applications/[id]/page.tsx`, `page.module.css`
- `src/features/studio/ui/application-trial-result-workflow.tsx`, 대응 CSS
- `src/features/studio/ui/application-report-publishing.tsx`, 대응 CSS
- `src/features/studio/ui/registration-result-editor.tsx`
- `src/features/studio/ui/application-detail-icon.tsx` (신규, 패키지 추가 없음)
- `src/features/decisions/ui/studio-parent-decision.tsx` (선택적 제목 아이콘 prop만 추가, 다른 caller 영향 없음)

검증:

- `verify-application-detail-ux-v2-browser.cjs`: 실제 route·컴포넌트·CSS·StudioShell을 bundle하고 query/action 경계만 격리. 브라우저 network 전부 차단, Production/Local DB 연결 없음. 14개 상태 × 1440/1280/1024의 DOM/스크린샷/overflow, 등록 사유 8/9개, 키보드/focus, 변경 감지, 실패 draft 보존, legacy 이력 확인. mocked action 실패 검증은 실제 DB rollback 검증과 구분한다.
- 기존 순수 verifier 10종: Application Detail, report publication, trial result observations, registration, regular schedule, consultation preference, Parent report, Cases, Dashboard, entitlements.
- Phase 1 쓰기 DB/browser 검증은 이전 Local 증거(`/tmp/studio-workflow-phase1/`)를 유지한다. localhost가 Production을 보는 동안 mutation browser verifier는 실행하지 않는다. 기존 browser verifier의 문구 selector와 동일값 저장 비활성 assertion만 최신 UI에 맞췄다.
- 검증 증거 및 작업 전 fingerprint: `/tmp/studio-detail-uxv2-7dkLg2/`. 처음에는 운영 인증 세션이 없어 로그인 화면까지만 확인했다. 이후 사용자가 직접 로그인해 연 실제 신청 상세를 읽기 전용으로 검수했다. 실제 1489px viewport에서 4단계·기록/리포트/등록 결과·Aside·상담·최근 활동 표시, 가로 overflow 없음, 변경 전 저장 비활성 확인. 운영 저장/확정/발송 클릭 없음. 캡처 `localhost-actual-detail.png`.
- 원래 localhost:3000과 `.env*` 운영 연결 유지. Production write/1B/migration/commit/push/deploy 없음.
- 최종 `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` PASS. 첫 캐시 분리 빌드는 worker가 기본 캐시를 사용해 실패했고, 해당 dev PID만 종료한 뒤 표준 빌드와 재시작으로 해결했다. Next가 추가한 임시 tsconfig include도 작업 전 byte/hash로 복원했다.
- 재시작 후 로그인 HTTP 200, Cases/Application Detail 비인증 HTTP 307, 브라우저 로그인 폼 정상. dev npm PID 21361 / Next PID 21375, 원래 프로젝트의 `npm run dev` 유지. branch/HEAD/staged 및 관련 없는 dirty/untracked·env·action/query/adapter/DB fingerprint 동일.

아래는 이전 UI의 변경 기록이다.

2026-09-28. Workflow V2의 상태/저장 계약을 유지하고 최종 승인 정보 구조로 재배치했다.
원래 프로젝트에서 작업. DB/schema/migration, save action/RPC, 권한 정책 변경 없음.

## 화면 구조

- 페이지 제목과 설명 → 학생/수업 핵심 헤더 → **진행 현황 한 번** → Main/Aside → 시스템 이력.
- 헤더: 학생·학년·상태, 수업·학원, 실제 확정 일정(없으면 희망 일정), 전화/문자/더보기. 담당 선생님은 compact block, `변경` disclosure에서 기존 배정 form을 연다.
- 진행 현황: 체험 완료 / 체험 기록 · 리포트 / 학부모 응답 / 등록 결과. 번호/check, 요약, 상태 badge. 순차 잠금이나 새 DB status가 아니다.
- V2의 대형 `지금 할 일` 배너와 같은 4단계 accordion을 제거했다.
- Main: 독립적인 체험 기록·리포트, 실제 이벤트 최신 3건, 신청 당시 참고 정보.
- Aside: 학생/학부모, 실제 체험 일정, 최근 상담 1건과 기존 이력 modal, 실제 ParentDecision, 실제 학원 등록 결과. Main에 응답/결과를 중복하지 않는다.
- 시스템 이력은 맨 아래 한 줄 disclosure, 기본 접힘.

## 기존 계약 보존

- 체험 기록 작성/수정, 발행/철회, 상담 저장/수정/재개, 담당자 변경, 상태 변경은 기존 action을 사용한다.
- 등록 결과 입력은 기존 상담 편집기/transaction을 연다. 필수 상담 내용을 임의로 채우지 않는다.
- 리포트 미발행, Free, Parent 미연결/미응답이어도 completed 신청의 등록 결과를 기록할 수 있다. planned를 enrolled로 추정하지 않는다.
- 종료 상태는 불필요한 Primary를 없애되 기존 권한으로 가능한 기록 수정·리포트·상담 이력·미등록 상담 재개는 유지한다.
- 완료/연락 시각 해석, 요금제 entitlement, report revision/snapshot 계약을 바꾸지 않았다.

## 기록과 발행본

미발행 기록은 공개 총평/추천 요약과 접힌 상세를 제공한다. 내부 메모에는 비공개 표시를 유지한다.
발행된 리포트의 기본 preview는 **실제 발행 snapshot**의 총평, 관찰 최대 3개, 추천만 사용한다.
전체 문서는 `자세히 보기`, 현재 작성본은 별도 미리보기다. 내부 메모나 추정한 작성자를 포함하지 않는다.
현재 작성본을 확인했던 revision은 기존 hidden field와 server action으로 검증한다.

## 오류와 데이터 출처

조회 실패는 미작성·미응답·미등록으로 바꾸지 않는다. 재시도 경로를 유지한다.
체험 기록 실패와 발행본 조회는 독립적이므로, 기록 조회 실패만으로 정상 발행본을 숨기지 않는다.
이전 V2의 표시 전용 `allowPartialTrialResult` 옵션을 유지한다. 상세 page만 사용하고 mutation caller는 strict read를 유지한다.
새 event, 학부모 열람 이력, 신청 경로, 주소/생년월일, 리포트 작성자 등을 추정하지 않는다.

## 반응형

기존 Studio max-width를 사용한다. Desktop Main/Aside는 약 63:37이며 1024px에서도 2열이다.
900px 이하에는 DOM 순서 그대로 Header → Progress → 기록/리포트 → Aside 각 카드 → 최근 활동 → 참고 정보 → 시스템 이력을 표시한다.
540px 이하 progress는 세로 4단계로 전환하며 숨기지 않는다.

## 상담 atomicity fixture 수정

로컬 `verify-consultation-atomicity.ts`가 test application을 지우기 전에 해당 test ID의 `registration_results`를 먼저 삭제하도록 정리 순서만 수정했다.
로컬 hostname을 정확히 검사한다. 고정 테스트 application ID 범위를 벗어나지 않으며 FK/trigger/grant/schema 변경 없이 실행한다.
6개 시나리오 PASS: 정상 transaction, 동일 submission 재시도, 실패 rollback, 동시 저장, 희망 일정 유지/변경, 타 조직 차단. 실행 후 fixture 정리 완료.

## 검증

- typecheck, lint, build, git diff --check.
- Application Detail 30개 상태 fixture 및 단일 progress/중복 CTA/모바일 DOM/발행 snapshot 검사.
- Trial progress/no-show, Trial result observations, Experience report publication, ParentDecision, Registration result, Consultation preference write, Studio UX Phase 1, Studio navigation contract/migration, Cases V1, In-trial filter, Final UX coherence.
- 실제 route/component/CSS를 사용하는 합성 브라우저 fixture. Query/auth/action 경계만 대체하고 Production 데이터에는 쓰지 않는다.
- 1440/1024/768/390/360px 상태별 화면, report whitelist/revision, 독립 등록 편집기, 종료 기록 수정, 담당자 변경, 상담 이력 modal 확인.
- localhost:3000은 원래 프로젝트 서버. 자동화 브라우저의 인증 세션이 없어 실제 인증 후 상세 저장 E2E는 수행하지 않았다.
- build는 현재 dev cache와 분리된 `.next/application-detail-final-build`에 생성. 저장소 설정 및 next-env는 보존.
- 증빙/로그: `/tmp/application-detail-final/`.
