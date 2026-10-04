# 일정 확정 Push 운영 계약

기존 일정 확정 RPC와 `application_logs`가 source of truth다. notification key는 `status:<application_log.id>`이고, Push 탭은 기존 `/notifications`로 이동한다. 일정 변경·리포트 발행·피드백 요청은 연결하지 않는다. MOBILE 변경은 없다.

## 발송과 fallback

확정 트랜잭션의 로그 삽입 시 private 전용 ledger를 함께 기록한다. trigger 오류는 확정/웹 알림을 rollback하지 않는다. server action의 `after()`와 보호된 worker가 같은 atomic claim을 사용한다. 동일 로그의 Push send 및 Parent fallback은 각각 최대 한 번 선점한다. 외부 호출 결과가 불명확하거나 선점 뒤 프로세스가 종료되면 자동 재발송하지 않는다.

활성화·권한 허용·유효 session을 가진 해당 Parent의 iOS/Android 기기만 선점하고, 발송 직전 token/Parent 연결을 재확인한다. 기기 없음, 비활성/권한 거부, 무효 token, 명시적인 HTTP/ticket 거절, 모든 대상의 receipt 실패가 확인되면 기존 알림톡→SMS wrapper를 한 번 호출한다. 한 기기라도 receipt ok이면 Parent fallback을 하지 않는다. ticket accepted만으로 성공을 확정하지 않으며, receipt ok는 APNs/FCM 전달 결과이지 실기기 수신/열람 증명이 아니다.

네트워크 timeout/5xx/불명확한 ticket, 24시간 후에도 없는 receipt는 `unknown`으로 남겨 수동 확인한다. `sending`/`fallback_sending`은 재선점하지 않는다. `receipts`/`checking`은 외부 발송 없는 조회만 반복할 수 있다. DeviceNotRegistered는 발송 당시 token이 여전히 일치할 때만 해당 기기를 비활성화한다.

## Gate와 실기기 테스트

`PARENT_SCHEDULE_CONFIRMED_PUSH_ENABLED=true`는 새 코드 경로만 허용한다. 실제 이벤트 수집/대상은 service-role 전용 `parent_confirmed_push_settings.mode` (`off`/`test`/`all`)로 제한한다. 기존 `PARENT_PUSH_ENABLED`를 켤 필요가 없다.

`test`에서는 `test_parent_id`, `test_application_id`, `test_device_ids`가 모두 특정된 일정 확정 하나만 수집한다. 테스트 신청을 일반 흐름으로 만들 때에는 먼저 Parent/class/start time을 설정하고 application ID는 비운다. 이 범위의 새 신청에 대해서만 Studio 신청/확정 SMS를 건너뛰며, 신청 생성 직후 실제 application ID로 고정한다. 해당 테스트 ledger의 Parent fallback도 `test_suppressed`로 끝낸다. 일반 Parent fallback 설정은 변경하지 않는다. `all`로 전환한 뒤에도 정확한 테스트 application ID에 대한 legacy 차단은 유지한다.

## Migration / worker

`20261005000000`은 전용 settings/ledger 두 테이블, service-role claim RPC와 application_logs trigger만 추가한다. 기존 notification constraint/policy, 기존 데이터, 일정 RPC는 변경하지 않는다. `20261005001000`은 pg_cron/pg_net 및 이벤트 전용 5분 worker를 추가하되 job은 비활성 상태로 만든다. 기존 Vercel Hobby cron은 변경하지 않는다.

Production 기존 schema/data fingerprint를 보존한 뒤 두 migration을 적용한다. 기존 CRON_SECRET을 Vault의 `parent_confirmed_push_cron_secret`으로 저장하며 키를 재발급하지 않는다. 호환 Production이 READY이고 도메인이 해당 SHA를 가리킬 때만 cron job을 활성화한다. endpoint는 기존 CRON_SECRET bearer 인증을 요구한다. 외부 송신은 한 작업당 한 번이며 receipt 조회만 재시도한다. worker는 요청당 최대 3개 작업을 처리하므로 backlog와 unknown/sending/fallback_sending을 운영 시 확인한다.

## 복구 / 관측

문제가 있으면 먼저 settings.mode를 `off`로 바꾸어 신규 Push 수집과 발송을 막는다. 아직 미발송 pending은 worker가 기존 fallback으로 처리하고, 이미 accepted인 건은 receipt 처리를 마쳐 중복 fallback을 피한다. 테스트 건의 legacy 차단은 유지한다. 외부 호출 진행 중인 건은 소급 취소할 수 없으며 자동 재발송하지 않는다.

미처리 작업을 확인·정리한 후에만 환경 flag를 false로 바꾸거나 이전 코드로 rollback한다. 먼저 env만 끄거나 구버전으로 배포하면 기존 receipt의 fallback이 누락될 수 있다. 긴급 중단 시 cron을 비활성화하고 남은 ledger를 보존하여 수동 판정한다. migration을 DROP하지 않는다.

검증 명령: `node scripts/verify-schedule-confirmed-push.cjs`, `PGLITE_MODULE_PATH=<isolated-tool-path> node scripts/verify-schedule-confirmed-push-db.cjs`, typecheck/lint/build, 기존 Parent notification/foundation verifier. fixture는 실기기 수신을 증명하지 않는다.

공식 계약: [Expo tickets/receipts](https://docs.expo.dev/push-notifications/sending-notifications/), [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after), [Supabase scheduling/Vault](https://supabase.com/docs/guides/functions/schedule-functions), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
