# MVP 범위

> MVP 시점의 범위 문서다. 아래 "제외" 중 일부는 이후 구현됐다 — 맨 아래 "현재 상태 (2026-10)"를 함께 본다.

## 포함
### 학부모
- 프로그램 리스트
- 프로그램 상세
- 회원가입 / 로그인
- 체험수업 / 레벨테스트 신청
- 신청 완료 (현재 별도 완료 화면은 없고 신청 후 `/my/applications`로 이동)
- 내 신청내역

### 학원(studio)
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
- 통합 status는 `new | reviewing | confirmed | completed | canceled`를 유지
- 노쇼, 결과 기록, 상담, 등록 전환은 별도 축으로 분리됐다(노쇼 = canceled + `no_show_at`, 체험 기록 `trial_results`, 리포트 `experience_reports`, 등록 결과 `registration_results`)

## 현재 상태 (2026-10)
MVP "제외"였지만 지금은 구현된 것:
- 결제: Toss 정기결제(무료 / 스탠다드). 요금제 판정은 `src/features/billing/lib/entitlements.ts`
- 카카오 알림 자동화: 알림톡 우선 발송, 실패 시 SMS(NCP SENS)
- 학부모 피드백: 체험 리포트를 본 학부모의 피드백·등록 의향 제출(`experience_feedback`, `parent_decisions`)
- 체험 기록 · 학부모 리포트 발행 · 등록 결과 기록 · 전환 분석(스탠다드)

여전히 제외: 입학고시, 합격/불합격·반 배정, 정산, 드래그 앤 드롭 캘린더, 추천 알고리즘
