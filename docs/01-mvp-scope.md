# MVP 범위

## 포함
### 학부모
- 프로그램 리스트
- 프로그램 상세
- 회원가입 / 로그인
- 체험수업 / 레벨테스트 신청
- 신청 완료
- 내 신청내역

### 선생님(studio)
- 로그인
- 대시보드 요약
- 체험 신청함
- 체험 신청 상세
- 최소 일정 관리(class-linked schedule 우선)
- 간단 프로그램 관리
- 프로그램 유형: `trial_class`(체험수업), `level_test`(레벨테스트)

## 제외
- 입학고시 / entrance_test / admission_test
- 합격 / 불합격 / 재응시 / 반 배정 / 입학 가능 여부
- 결제
- 리뷰 작성/검수
- 카카오 알림 자동화
- 정산
- 드래그 앤 드롭 캘린더
- 고급 통계 대시보드
- 추천 알고리즘

## 상태값 메모
- 현재 통합 status는 `new | reviewing | confirmed | completed | canceled`를 유지
- 노쇼, 결과 기록, 상담, 등록 전환은 후속 phase에서 별도 축으로 분리
