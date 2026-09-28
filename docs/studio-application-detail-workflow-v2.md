# Studio 신청 상세 — 최종 리디자인

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
