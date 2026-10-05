# QC 1 — 신규 신청 대시보드 미리보기

2026-10-05. 기준 main/Production `b61549a`, Vercel READY 및 Studio 운영 도메인 연결을 조회했다.

## 원인과 최소 수정

- 로그인한 학원 권한으로 조직별 신청 38건을 읽었다. 최신 신청은 저장·과정/학원 연결이 정상이며 KST 10월 5일 00:55 접수, 01:03 일정 확정 이력이 있다. 현재 new/reviewing은 0건이다. 신청 상태를 되돌리거나 새 신청을 만들지 않았다.
- 대시보드는 `getStudioApplications(organizationId)` → `listStudioApplications`를 사용한다. 실제 신청 관리 `/cases`는 `getStudioCases`로 같은 조직 제한 view를 조회한다. 대시보드에는 접수일·희망일·담당자 필터가 없고 exact count 기준 페이지를 모두 읽는다. 이번 조회도 38/38건이었다. 일반 로그인으로 타 조직 조건 조회는 0건이었다.
- **표시 단계의 우선순위와 5건 제한 문제**다. new/reviewing의 `CONFIRM_SCHEDULE`이 completed 후속 업무의 `NEEDS_REGISTRATION` 뒤에 정렬되어 신규 신청이 총건수에는 포함되지만 미리보기에서 빠졌다.
- 최신 실제 신청의 new→confirmed 로그와 접수 전에 이미 완료되어 이후 로그가 없는 후속 업무 6건을 메모리에서 재현했다. 수정 전 총 7건/미리보기 5건에 신규 신청 없음, 수정 후 동일 건수에 신규 신청 있음. 이는 현재 Production 신규 상태의 직접 관측이 아니라 읽은 이력으로 재구성한 검증이다.
- Dashboard 전용 순서에서 `CONFIRM_SCHEDULE`을 `NEEDS_REGISTRATION` 앞으로 이동했다. 기존 완료 처리 우선순위, 업무 판정, 상태값, 신청관리 정렬, 일정·최근 등록 결과는 유지한다.
- 표시 제한이 적용될 때 `전체 N건 중 5건 미리보기`를 안내한다. 전체 건수와 미리보기는 기존 동일 selector 결과에서 파생한다.

## 조회·갱신·안전 경계

- 신청 생성은 `trial_applications.status=new` 저장 후 학부모 view로 읽고 application log를 남긴다. SMS safe wrapper는 변경하지 않았다.
- application_logs, 확정/희망 일정, completed_at, last_activity_at, nullable next_contact_at, registration_results 및 SMS 로그를 읽어 비교했다. 개인정보 본문은 증거 문서에 포함하지 않는다.
- 서버 조회는 로그인 cookie를 사용하는 요청 단위다. 업무 처리 action의 기존 `/studio` revalidation과 client refresh를 유지한다. 별도 캐시·폴링·신청 생성 action 변경은 하지 않는다.
- KST 자정 전후에도 신규/확인 중 업무는 날짜로 제외되지 않는다. 시간·일정 selector는 변경하지 않았다.
- 권한 확대, 서비스 역할 조회 우회, DB migration/rewrite, 실제 고객 신청 mutation, Push/SMS/알림톡 발송 없음. 자동 이벤트 Push 설정과 MOBILE/APNs/FCM 변경 없음.

## 검증

- `scripts/verify-studio-dashboard-pending.ts`: 후속 업무 6건과 신규/확인 중 신청, 미래 체험일, 이전 접수일, 배정/미배정, KST 자정, 확정 후 목록/건수 감소, 종결 제외, 상세 href, mock 타 조직 제외, 다른 업무 패널 보존.
- 기존 Dashboard Phase 1.1/schedule charts/final polish, Studio UX, trial progress, conversion analytics/report, entitlements, navigation/route/host, Cases workflow verifier 통과.
- typecheck/lint/build/diff check 통과. 기존 lint deprecation 안내 외 실패 없음.
- 격리 브라우저에서 실제 Dashboard route/component/CSS를 사용했다. auth/query/외부 연동만 fixture로 대체했다. 1440/1024px 신규 표시와 총건수/5건 안내, 합성 확정 후 7→6건, 빈/에러 상태, 실제 링크의 상세 목적지, console 오류/가로 넘침 없음을 확인했다. 합성 상세 목적지는 링크 동작 검증이며 실제 운영 상세는 별도로 읽기 확인한다.
- Production에는 현재 신규 미처리 신청이 없어 새 접수→표시→확정 mutation E2E는 수행하지 않는다. 기존 실제 신청의 화면/상세와 배포 후 미리보기 안내를 읽기 확인한다. 관측하지 않은 신규 신청 실시간 반영은 PASS로 간주하지 않는다.
