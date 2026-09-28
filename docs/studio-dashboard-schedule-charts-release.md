# 오늘 릴리스 검증 기록

- Dashboard 잘못된 18:29/20:17의 원천은 취소 신청의 canceled_at. confirmed_slot_at과 확정 block이 모두 없는 취소 기록이었다. updated_at도 동일하지만 selector가 직접 선택한 필드는 canceled_at이다.
- Dashboard는 confirmed/completed 중 실제 confirmed_slot_at, 없으면 confirmed block.start_at이 있는 항목만 표시한다. KST로 날짜/시간을 구한다. new/reviewing/canceled 및 시각 불명 completed는 제외한다. 일정 관리의 별도 기록 처리 계약은 유지한다.
- 도넛은 SVG circle의 pathLength=100 / strokeDasharray / dashoffset 방식. 50/50과 25% 분포에서 browser의 원 경로 dash 경계가 안쪽으로 꺾이는 현상을 재현했다. 0 조각을 제외해도 재현됐다. arc path + butt cap, 100%는 undashed circle, 0%는 렌더 생략으로 해결했다. 집계·범례·색·크기·카드 CSS 변경 없음.
- 분포 50/50,100/0,0/100,25/25/25/25,50/25/25/0,1/99,전체0 및 실제 검수 Dashboard 4/0/0/5 확인.
- 흐름 5단계와 신청 접수 cohort 중복 없음은 verifier로 검증. 신청 확인 별도 단계 없음.
- 기존 실패를 수정하기 위해 범위를 넓히지 않았다: parent-account-ui의 과거 markup 정적 기대값 25개, phase5-capacity의 과거 slot-2 fixture 부재, supabase-server-client-scope의 과거 Home gate 정적 기대값 1개. 변경 전후 동일.
- parent-ia-migration은 작업공간에 migration/domain 수정이 없는지를 검사하므로 원래 dirty workspace에서 기존 2개 실패. clean commit 환경에서 재검증한다.
- reservation-import DB 검사는 현재 local RLS schema에서 조회 관련 5개 실패. 변경 전후 동일한 5개 실패임을 확인했다.
- Production migration은 이번 작업에서 재적용하지 않았다.

## 검증 결과

원본과 clean integration에서 typecheck/lint/build/diff-check를 실행했다. 순수·소스·mock verifier 83개 중 기능 회귀 79개가 통과했고, 위 기존 검사 4개는 변경 전후 동일한 실패였다. parent-ia-migration은 clean commit 이후 다시 검사한다. 상담 transaction과 미배정 확정 A–J 실제 local DB fixture는 통과했다. Excel import 조회 5개 실패는 baseline/local/integration에서 같은 원인임을 확인했다.

localhost:3000은 원래 프로젝트 cwd의 서버 한 개만 사용했다. 별도 TEST 학원에서 미배정 확정과 실제 confirmed_slot_at 19:00 표시, Cases의 일정 확정 필요 문구, 별도 선생님 저장 버튼이 없는 미확정 상세를 검수했다. 범례·집계·카드 CSS를 유지했다.

신청 흐름 commit은 시작 시점 승인된 변경 33개 파일만 포함하며, Dashboard 수정 commit은 별도 6개 파일이다(공통 selector 1개). 원본 working tree의 branch/HEAD/index와 기존 dirty/untracked를 보존하고, 배포는 origin/main 기반 clean integration에서 진행한다. Production DB migration은 재실행하지 않았다.
