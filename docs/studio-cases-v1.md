# Studio Cases V1

2026-09-22. 확정 시안 기반 목록 UX 구현. 기존 Studio 디자인 토큰과 사이드바 유지.

1. **최종 구조**: Header → 진행 중/완료·종료 탭 → 기존 단계 필터와 검색 → 현재 검색 결과 수 → 목록 → 하단 페이지 이동. 탭별 전체 건수는 현재 query에서 제공하지 않으므로 표시하지 않는다.
2. **Row hierarchy**: 학생·표시용 학년/보호자 연락처, 현재 단계, 체험수업/희망·확정 일정, 다음 행동, 배정 담당자, 최근 기록의 6열 + chevron. 학생은 `getChildGradeLabel`, 단계 tone은 `getCaseStageTone` 재사용. 긴 수업명은 말줄임과 title, 긴 학생명은 줄바꿈.
3. **다음 행동**: 기존 `nextAction.key`를 짧은 목록 문구로 표현한다. workflow selector, attention 우선순위, 상태 판정은 수정하지 않았다. 기존 NONE은 그대로 두며 신규 업무를 만들지 않는다.
4. **next_contact 표시**: 기존 timestamp의 Asia/Seoul 날짜로 이전 날짜=연락 지연(red), 오늘=오늘 연락(amber), 오늘 시각 경과=경과 보조 문구, 내일 이후=연락 예정(neutral). null은 진행 중인 completed에서만 다음 연락 미정(neutral), 종료에서는 숨긴다. UTC/서울 자정·연도 경계와 잘못된 날짜도 순수 verifier로 확인.
5. **미배정 + 연락**: 다음 행동 담당자 배정과 연락 지연/오늘 연락을 독립적으로 표시한다. 기존 미배정 우선 selector를 변경하지 않고 두 정보를 함께 읽게 했다.
6. **담당자**: 배정 선생님 이름 또는 미배정. 최근 상담 작성자와 혼용하지 않으며 inline 변경과 전화 버튼은 추가하지 않았다.
7. **최근 기록**: 기존 후보(신청, 체험 완료, 실제 상담 기록, 종료 기록)의 날짜/이벤트만 표시. `최근 활동`을 `최근 기록`으로 바꿨으며 상담 기록이 있다는 이유로 통화 성공/상담 완료라고 표시하지 않는다. `last_activity_at`으로 전체 시스템 이력을 추정하지 않는다.
8. **완료·종료**: 등록/미등록/취소/노쇼와 종료일 중심 5열 + chevron. 다음 행동 없음. 노쇼의 canceled+no_show_at 계약 유지. 진행 중 completed에는 기존 registration_status의 등록 미결정/고민 중만 보조 표시. ParentDecision은 읽거나 통합하지 않는다.
9. **Pagination**: 기존 DB 25건 및 정렬 유지. 상단 compact 이전/다음과 하단 이전/다음이 같은 URL/context 사용. 진행 중 결과 헤더는 검색 결과 N건·신청 최신순. 완료·종료에는 실제 정렬과 다른 신청 최신순 문구를 붙이지 않는다. 범위 밖 페이지는 첫 페이지 복귀 안내.
10. **Visual**: White/Green/Charcoal, thin border, soft badge. 일반 행 80px, 긴 이름은 자연스럽게 늘어난다. list padding 0, full-width Link padding으로 150ms 전체 행 hover와 pointer, inset focus 표시. loading도 동일 Grid에 맞췄다. 실제 StudioQueryRetry 사용. 새 라이브러리 없음.
11. **검증**: 최종 typecheck/lint/build/git diff --check 통과. build는 작업 중 dev cache 충돌을 피하기 위해 `/tmp/cases-v1-build`에 동일 소스를 복사해 실행했고 실제 서비스 자격증명은 복사하지 않았다. 관련 순수 verifier 12개 통과: Cases V1, case in-trial filter, trial progress, Studio UX Phase 1, Dashboard Phase 1.1, navigation contract/migration, route contract, host rewrite, final UX coherence, registration result, consultation preference write. 기존 로컬 DB 정리 단계에서 FK 오류가 있었던 consultation-atomicity 통합 검사는 이번 읽기/표시 작업에서 재실행하지 않았다.
12. **브라우저/Phase 2**: `/tmp/cases-v1-qa`의 분리된 합성 query fixture와 기존 QA adapter로 1280/1440/1920px 검증. 실제 앱의 Cases UI와 helper를 사용했다. 신규/확인/일정 확정(미래 체험)/체험 중/완료/미배정/지연/오늘 예정·경과/미래/미배정+지연/등록 미결정/고민 중/등록/미등록/취소/노쇼/긴 이름·수업명, empty/error/retry/loading, Enter 검색, 상세 복귀, 상하단 pagination 확인. 가로 넘침·열 불일치·중첩 interactive 없음, 브라우저 오류 없음. 1440px 행과 카드 내부 폭 1130px 일치, 양쪽 edge hit test 통과. 실제 Supabase auth/RLS/DB query E2E를 증명하는 검사는 아니다. 연락/담당자/미배정 필터, urgency 정렬, 종료일 최신순 query, legacy route 통합은 Phase 2로 남긴다.
13. **변경 경계**: DB query/schema/migration, stage/workflow/registration/consultation selector, server action, ParentDecision 계약 변경 없음. git add/commit/push 없음.

증빙: `/tmp/cases-v1-full-1440.png`, `/tmp/cases-v1-{overdue,today,unassigned-overdue}-row-1440.png`, `/tmp/cases-v1-browser-results.json`, `/tmp/cases-v1-verifiers.json`.
