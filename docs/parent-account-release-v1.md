# Parent Account Release V1

2026-10-01, 사용자 MyPage/탈퇴 시각 검수 승인 후 최종 릴리스.

## 통합 범위

`origin/main` `86cc8efb1c5fe3053a2222cb4c22850e055874a2`에서 clean worktree를 생성했다. 승인된 MyPage/프로필 bottom sheet/원형 avatar/아이콘/Home 중복 진입 제거, 탈퇴 UI·서버·migration, 정책·검증·관련 문서만 반영한다. 기존 root의 branch/HEAD/index/dirty/untracked/env는 그대로 둔다.

main에 이미 있는 피드백 알림 claim/completion 및 SMS fallback 계약은 유지하고 탈퇴 Parent 수신자 확인과 nullable 처리만 추가했다. 과거 로컬 파일로 최신 알림 코드를 덮어쓰지 않았다.

## 활성화와 데이터 계약

- migration `20261001150000_parent_account_deletion_v1.sql` 적용 후 앱을 배포한다. 신규 retry marker/RPC/자체 탈퇴 guard와 `application_logs.actor_id` nullable 변경이다. 기존 컬럼 삭제/이름 변경, 기존 정상 사용자 권한 revoke는 없다.
- 최종 릴리스는 Production을 포함해 탈퇴 기능을 활성화한다. `PARENT_ACCOUNT_DELETION_ENABLED=0`은 명시적 서버 kill switch다. 대상은 언제나 Auth 검증 UID와 인자 없는 self-only RPC가 결정한다. 로컬 전용 검증 스크립트는 여전히 loopback Supabase만 허용한다.
- Auth/profile/children/ParentDecision/feedback·private_note/개인 알림·engagement/현재 브라우저 찜/실제 소유 파일 삭제.
- 학원에 전달된 신청 snapshot·예약·상담·체험·리포트·등록 및 사유·활동 이력은 보존한다. application.parent_id/child_id 및 탈퇴한 log actor만 detach. 기존 신청은 자동 취소하지 않는다.
- DB transaction cleanup → 실제 Storage 삭제 → Auth admin 삭제 → 세션 종료/공개 완료 화면. 부분 실패 marker와 재시도, profile 재생성 차단, 동일 이메일 새 UUID 비연결 유지.
- browser favorites는 legacy 소유 표식이 없으면 첫 계정 연결 때 초기화된다. 다른 기기의 오프라인 저장소 즉시 원격 삭제는 불가능하며 재접속/계정 변경 때 정리한다.

## 검증

Clean typecheck/lint/build/diff check, DB/JWT 권한·FK rollback·Auth/Storage 실패와 재시도·동시성·개인 cleanup·학원 기록 fingerprint·재가입 isolation, 실제 clean localhost:3001 Parent/Studio 브라우저, MyPage 프로필·포커스·레이아웃, Home header·Parent read boundary·알림 회귀를 검증한다. 사용자 localhost:3000은 별도로 기존 Production 연결을 유지한다.

Production 검증은 두 부분으로 나눈다.

1. `verify-parent-account-deletion-production.sql`: 임의 UUID의 transaction-only 계정/수업/진행 중 및 완료 신청/상담/체험/리포트/등록/피드백/응답으로 실제 role·JWT claim·RPC를 검사한다. 항상 ROLLBACK, 외부 알림 없음. 삭제가 금지된 운영 history를 영구 TEST 데이터로 남기거나 광범위하게 trigger를 끄는 cleanup을 피한다.
2. `verify-parent-account-deletion-production-browser.cjs`: READY 배포 확인 후 명시적 opt-in으로 synthetic Parent만 생성한다. 개인 자녀/알림/브라우저 찜을 준비하고 실제 Production 탈퇴 CTA→Auth 삭제→로그인 불가→동일 이메일 재가입을 검사한다. 기존 사용자·학원 데이터에는 쓰지 않고 생성한 UUID만 정리한다. 풍부한 운영 history와 Auth 삭제를 하나의 영구 fixture로 연결하는 시나리오는 Production에서 생략하며, 로컬 전체 시나리오와 Production rollback RPC 검증으로 보완한다.

로컬 SQL 리허설에서 `SET ROLE anon` 후 임시 함수로 권한 오류를 포착하는 조합이 DB backend crash를 일으켰다. 해당 패턴은 Production 스크립트에서 제거하고 anon ACL + 실제 익명 HTTP RPC 거부로 나눴다. 수정된 전체 rollback SQL은 로컬에서 23개 검사를 통과했다.

검증 증거는 `/tmp/parent-account-final-release`에 보관한다. synthetic 계정 비밀번호·token·service-role key는 커밋하지 않는다. Production migration 전후 기존 테이블/Auth 사용자 count 및 fingerprint를 비교한다.

## 정책 및 법률 TODO

개인정보처리방침과 제3자 제공 동의는 실제 삭제·보존 계약 및 신청 payload에 맞춘 검토용 문안이다. 학원이 제공받은 정보를 탈퇴만으로 자동 삭제하지 않음을 명시했다. 구체적 보유기간, 첫수업/학원의 법적 관계, 아동 동의, 동의 증빙, 로그·백업 처리 범위는 법률 최종 검토 TODO로 유지한다. 없는 문의 처리/증빙 보존 시스템은 약속하지 않는다.

## 릴리스 순서

단일 atomic commit → Production migration 1회 및 기존 데이터·ACL 검증 → push 직전 fetch/기준 SHA 재확인 → fast-forward `HEAD:main` → Vercel SHA/READY/firstsuup.com 확인 → Production safe smoke → synthetic/임시 환경 정리 및 원래 working tree fingerprint 확인. force/rebase/PR은 사용하지 않는다.
