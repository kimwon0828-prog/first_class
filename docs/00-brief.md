# 첫수업 MVP 브리프

## 한 줄 정의
첫수업은 학부모의 신청부터 일정 확정, 결과 기록, 상담, 등록 전환까지 이어지는
등록 전 운영 관리 SaaS다.

## 목표
- 학부모가 모바일에서 쉽게 프로그램을 찾고 신청할 수 있게 한다.
- 학원/선생님이 신청을 놓치지 않고 일정 확정과 후속 상담까지 이어서 관리할 수 있게 한다.
- 신청 데이터가 사용자 계정과 연결되고 studio 운영 데이터로 이어지게 한다.

## 핵심 사용자
- parent: 5세~13세 자녀를 둔 학부모
- teacher: 선생님(운영 주체)

## 핵심 원칙
1. 리스트/상세는 로그인 없이 접근 가능
2. 신청과 내 신청내역은 로그인 필요
3. 공개 회원가입은 parent만 허용
4. teacher는 초대/수동 생성 기반 계정만 허용
5. `/studio/*`는 teacher 전용
6. 모바일 우선은 학부모, 데스크톱 우선은 teacher(studio)
7. Figma가 UI 최종 기준
8. MVP 프로그램 유형은 `trial_class`, `level_test` 두 가지만 지원
9. 입학고시는 MVP에서 제외하고 후순위 확장으로 미룸
10. 상태값은 당장 크게 늘리지 않고, 후속 phase에서 attendance/result/consultation/registration 축으로 분리

## 기술 방향
- Frontend: Next.js
- Runtime: Node.js
- Backend/Auth/DB: Supabase
- Deployment: Vercel + Supabase

## 성공 기준
- 학부모가 리스트 → 상세 → 로그인 → 신청까지 완료할 수 있다.
- teacher가 신청 목록 → 신청 상세 → 일정 확정까지 처리할 수 있다.
- teacher가 체험수업/레벨테스트 프로그램을 등록하고 프로그램별 가능 시간을 연결할 수 있다.
- 신청 데이터가 사용자와 연결되어 내 신청내역에서 보인다.
