# 화면 목록

> 2026-10 현재 라우트 기준. 메뉴에서 감춘 legacy 화면은 따로 적었다.

## 학부모
- P-01 프로그램 리스트 `/classes`
- P-02 프로그램 상세 `/classes/[id]`
- P-03 회원가입 `/auth/sign-up`
- P-04 로그인 `/auth/sign-in`
- P-05 프로그램 신청 `/classes/[id]/apply`
- (P-06 신청 완료 — 별도 화면 없음. 신청 후 `/my/applications`로 이동)
- P-07 마이페이지 홈 `/my`
- P-08 내 신청내역 `/my/applications`
- P-09 자녀 관리 `/my/children`
- 그 밖에: 홈 `/`, 학원 찾기 `/academies`, 학원 공개 페이지 `/academy/[handle]`, 관심수업 `/favorites`, 내 일정 `/my/schedule`, 기록 `/record`(+ 체험 상세·리포트), 알림 `/notifications`

## 학원(studio)
- 접근 대상: academy 계정(organization이 있는 admin 포함)
- B-00 홈(대시보드) `/studio`
- B-01 로그인 `/studio/sign-in` · 가입 신청 `/studio/sign-up` · 승인 대기 `/studio/pending`
- B-02 신청 관리 `/studio/cases` (+ 기존 예약 가져오기 `/studio/cases/import`)
- B-03 신청 상세 `/studio/applications/[id]`
- B-04 일정 관리 `/studio/schedule`
- B-05 수업 관리 `/studio/classes` (+ `/studio/classes/new`, `/studio/classes/[id]/edit`)
- B-06 설정 — 학원 정보 `/studio/mypage/profile` · `/studio/settings`, 선생님 `/studio/teachers`, 플랜·결제 `/studio/billing`, 내 계정 `/studio/mypage`
- 메뉴에서 감춘 legacy: `/studio/applications`(구 신청 관리 표), `/studio/unregistered`(구 상담 파이프라인)

## 운영자(admin)
- 신규 학원 승인 `/admin/academy-approvals`
- 정보수정 요청 `/admin/academy-update-requests`

## 프로그램 유형 메모
- `trial_class`: 체험수업
- `level_test`: 레벨테스트
- 입학고시는 MVP 범위에서 제외
