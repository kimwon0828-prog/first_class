# Studio Dashboard UX / Visual Phase 1.1

2026-09-22 구현 및 로컬 검증 기록. 기존 Phase 1 작업을 유지한 후속 변경이다.

1. **Dashboard 구조**: 인사/현재 날짜/분석 기간 → 핵심 인포그래픽 3개 → 왼쪽 업무 목록, 오른쪽 일정·최근 등록 결과 → 접힌 미등록 사유와 기존 인포그래픽 내보내기.
2. **대형 전환 현황 제거**: 체험 이후 전환 현황, 리포트 발행/부모 의향 숫자 카드, 부모 의향×실제 결과 matrix를 Dashboard에서 제거했다. 기존 분석 library/query는 다른 caller와 검증 계약을 위해 보존했다.
3. **신청→등록 흐름**: 신청 / 신청 확인 / 일정 확정 / 체험 완료 / 등록. 기존 `buildStudioDashboardMetrics` 단계 판정과 전 단계 대비 비율을 그대로 쓴다. 상담 단계는 추가하지 않았다.
4. **체험 결과 도넛**: 같은 신청일 cohort의 실제 저장 상태를 완료 / 노쇼 / 일반 취소 / 진행 전·진행 중으로 나눈다. 노쇼는 `canceled && noShowAt != null`. 중앙은 전체 신청 수이며 범례에 건수와 전체 신청 대비 비율을 표시한다. 시각이 지난 confirmed를 완료로 집계하지 않는다.
5. **등록 결과 도넛**: 기존 `buildStudioDashboardAnalytics`의 등록/미등록/결과 미확정과 체험 완료 분모를 유지한다. ParentDecision은 사용하지 않는다. 공유 인포그래픽의 기존 등록률(등록÷결정 완료)도 바꾸지 않았다.
6. **후속 연락 제거**: Dashboard UI와 `getConsultationPipelineApplications` 호출만 제거했다. Cases, 상담, `next_contact_at`은 유지한다.
7. **오늘 처리할 신청**: 기존 selector·우선순위·5건 preview를 유지한다. 전체 건수와 전체 보기, 학생/학년/수업/할 일/상태/상세 링크를 표시한다. 분석 기간으로 조회를 제한하지 않는다.
8. **체험 일정**: 기존 KST 일정 selector와 오늘이 비면 가까운 일정으로 바꾸는 정책을 유지한다. 학년을 기존 신청 데이터에서 붙이고 담당자·상태를 함께 표시한다. 빈 상태는 한 줄이다.
9. **최근 등록 결과**: 기존 신청 조회에 이미 존재하는 `lost_at`만 추가하고 Supabase/mock mapping을 함께 맞췄다. 실제 completed 신청의 등록/미등록 결과를 `enrolled_at`/`lost_at` 최신순으로 5건 표시한다. timestamp가 없거나 잘못된 항목의 날짜를 만들어내지 않는다. 새 query/schema는 없다.
10. **체험 중 노쇼 action**: 담당자 미배정이어도 체험이 시작되면 완료/노쇼를 접지 않는다. Header와 동일한 공용 시작 판정(확정 블록→확정 시각)을 사용한다. 네이티브 modal dialog에서 취소/Esc/초기 안전 버튼 focus를 지원하고 확인 후 기존 server action을 호출한다.
11. **상태별 검증**:
    - confirmed + 시작 전: 완료/노쇼 숨김, 기존 일정 링크 유지.
    - confirmed + 시작 도달/종료 경과: 완료/노쇼 표시. 미배정 및 블록 시각 우선순위도 확인.
    - completed: 결과/리포트 workflow 유지, 완료/노쇼 없음.
    - canceled: 추가 완료/노쇼 없음.
    - canceled + no_show_at: 노쇼 표기, 추가 완료/노쇼 없음.
    - 확정 시각 불명: 희망 시각으로 체험 중을 추정하지 않음.
12. **Visual**: White/Green/Charcoal, thin border, 기존 Studio 폰트·로고·IA·radius 유지. 1440px 3열 분석+2열 업무 구성. 상세 콘텐츠 폭과 헤더 간격을 줄였고 담당자/연락 버튼을 같은 줄로 정리했다. 노쇼는 Red, 완료는 Green. loading skeleton도 새 구조로 맞췄다. 새 라이브러리는 추가하지 않았다.
13. **검증**:
    - `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` 통과.
    - Studio UX Phase 1, Dashboard Phase 1.1, trial progress, case in-trial filter, conversion report, conversion analytics, final UX coherence, organization entitlements, navigation contract/migration, route contract, host rewrite, registration result verifier 통과.
    - 제거된 UI를 요구하던 Dashboard 정적 검사는 새 계약에 맞게 갱신했다. 기존 계산/권한 검사는 유지했다.
    - agent-browser: 1280/1440/1920px Dashboard, 빈 분석 기간과 오늘 업무의 독립성, 일곱 상세 상태, 확인창 취소/Esc/focus, 노쇼 server action 후 버튼 제거와 상태 갱신 검증. Free 권한 차단, 전체 빈 상태, 조회 오류와 재시도 표시도 확인했다. 콘솔 오류 및 가로 넘침 없음.
    - 화면 테스트는 별도 `/tmp/studio11-qa`에서 합성 데이터와 in-memory adapter를 사용했다. 프로덕션 auth/RLS를 우회하는 코드는 작업 저장소에 추가하지 않았다. 실제 Supabase 인증/RLS와 실데이터 변경 E2E를 증명한 검사는 아니다.
    - `verify-consultation-atomicity.ts`는 로컬 Supabase 전용 통합 검사다. 시작 시 고정 fixture의 로그 정리를 호출한 뒤, 기존 `registration_results_application_id_fkey` 참조 때문에 신청 fixture 삭제가 HTTP 409로 실패했다. 상담 RPC 본 검증에 도달하지 못했다. 해당 검사 및 DB schema는 이번 변경에 포함하지 않았다.
14. **Phase 2**: 부모 의향×실제 결과 등 상세 Analytics의 별도 화면, timestamp가 없는 legacy 종결 결과의 표시 정책. 현재 미등록 결과 자체는 Phase 1.1에 포함했다. 최근 3개월은 이번 달을 포함한 3개 달의 첫날부터 오늘까지다.
15. **변경 경계**: DB schema/migration, application/enrollment/ParentDecision 저장 계약, 상담·SMS safe wrapper, report 발행/철회 entitlement, route는 변경하지 않았다. git add/commit/push 없음.

스크린샷은 `/tmp/studio11-*-1440.png` 및 `/tmp/studio11-dashboard-{1280,1920}.png`, 브라우저 검증 결과는 `/tmp/studio11-browser-results.json`에 있다.

## Final UI Polish — 2026-09-23

- Header 아래에 Desktop toolbar를 두고 `인포그래픽 보기`를 왼쪽, 현재 날짜와 기간 선택을 오른쪽에 분리했다. 기간 버튼은 40px 높이와 8px 간격을 공유한다.
- 직접 설정은 360px anchored popover로 교체했다. 날짜 입력은 2열이며, 취소·밖 클릭·Esc로 닫힌다. 적용은 기존 GET query를 그대로 제출하고 성공한 navigation 뒤 닫힌 상태로 돌아온다.
- Dashboard 아래쪽 인포그래픽 launcher는 제거해 launcher를 한 곳만 유지한다. 기존 modal과 이미지 저장 동작은 바꾸지 않았다.
- 업무 영역은 2열 Grid와 오른쪽 2행 Grid로 stretch한다. 1280/1440/1920px에서 왼쪽 카드와 오른쪽 두 카드+gap의 높이 차이는 0px였다.
- 세 목록의 링크 wrapper가 카드 테두리 안쪽 전체 폭을 차지한다. hover/focus surface, pointer hit area, badge와 chevron 영역이 모두 같은 링크이며 transition은 150ms다.
- query, 성과 계산식, status, server action, DB 계약은 변경하지 않았다. 체험 결과의 노쇼/일반 취소 분리와 실제 학원 등록 결과 기준도 기존 verifier로 다시 확인했다.
- `typecheck`, `lint`, production `build`, `git diff --check`, Dashboard Phase 1.1/Final Polish, Studio UX Phase 1, conversion analytics/report, final UX coherence verifier를 통과했다.
- 최종 화면은 `/tmp/studio-dashboard-final-1440.png`, `/tmp/studio-dashboard-period-popover-1440.png`, `/tmp/studio-dashboard-toolbar-1440.png`, `/tmp/studio-dashboard-workspace-heights-1440.png`, `/tmp/studio-dashboard-hover-1440.png`에 있다.
