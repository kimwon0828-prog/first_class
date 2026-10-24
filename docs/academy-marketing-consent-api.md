# 학원 안내 문자(광고성 정보) 수신 동의 — 서버 계약

대상: 학부모 앱(firstsuup-mobile) · 학부모 웹 작업자
상태: 서버 구현 완료(웹 action `setAcademyMarketingConsentAction`, 앱 `GET · POST /api/native/me/marketing-consents`).
마이그레이션 `20261024120000_students_recontact`가 운영에 적용된 뒤 사용할 수 있다. 앱 화면은 별도 작업이다.

## 무엇에 대한 동의인가

- 학원이 체험 온 학생의 보호자에게 보내는 **광고성 문자**(새 반 개설 · 특강 · 시간표 변경 안내)다.
- 동의는 **학원마다** 따로 받는다. 한 학원 동의가 다른 학원 광고를 허락하지 않는다.
- 동의하지 않아도 체험 신청 · 일정 안내 · 리포트 같은 서비스 문자는 그대로 받는다(광고가 아니다).
- 발송 시간: 08:00~21:00(KST)만. 문자 첫 줄 `(광고) [학원명] 학원대표번호`, 끝 줄 `무료수신거부 080-…`.

## 화면에서 받아야 하는 것

| 자리 | 동작 |
|---|---|
| 체험 신청 완료 직전(학원 · 수업 화면) | 선택 체크 "○○학원의 새 반 · 특강 안내 문자 받기(광고)". 기본값 **꺼짐**. 체크하면 아래 API 호출 |
| 내 정보 › 알림 설정 | 동의한 학원 목록 + 학원별 토글(철회 · 재동의) |

동의 문구 예시(버전 `academy-marketing-2026-10`):
> ○○학원이 새 반 개설 · 특강 · 시간표 변경 소식을 문자로 보내는 데 동의해요(광고). 언제든 내 정보 › 알림 설정에서 끌 수 있어요.

문구를 바꾸면 `textVersion` 값을 바꾼다(서버는 버전을 기록만 한다).

## API

공통: 로그인한 **학부모** 세션만. 다른 사람 대신 바꿀 수 없다(서버가 `auth.uid()`로 판단). 학원 계정 · 비로그인은 403.

### 1) 동의 · 철회 — `POST /api/native/me/marketing-consents`

웹은 같은 계약의 server action, DB에서는 RPC `set_my_academy_marketing_consent(p_organization_id, p_consented, p_source, p_text_version)`.

요청
```json
{ "organizationId": "uuid", "consented": true, "source": "parent_app", "textVersion": "academy-marketing-2026-10" }
```
- `source`: 앱 `parent_app`, 웹 `parent_web`. 그 밖의 값은 400(`invalid_consent_source`).
- `textVersion`: 1~60자.

응답 200
```json
{ "organizationId": "uuid", "consented": true, "consentedAt": "2026-10-24T05:12:00Z", "withdrawnAt": null }
```
- 철회(`consented: false`)면 `withdrawnAt`이 찍히고 `consentedAt`은 마지막 동의 시각 그대로다.
- 같은 값으로 여러 번 불러도 된다(멱등, 이력은 매번 남는다).

오류: 401 `login_required` · 403 `parent_required` · 403 `account_deletion_pending` · 403 `phone_verification_required` ·
404 `organization_not_found` · 400 `invalid_consent_input` · 400 `invalid_consent_source` · 503 `temporarily_unavailable`.
입구 확인(로그인 · 학부모 · 탈퇴 진행 · 휴대폰 확인)은 푸시 기기 등록 API와 같다.

### 2) 내 동의 목록 — `GET /api/native/me/marketing-consents`

RPC `list_my_academy_marketing_consents()`.

응답 200
```json
{ "items": [ { "organizationId": "uuid", "organizationName": "중계 코딩랩", "consented": true, "consentedAt": "…", "withdrawnAt": null } ] }
```
최근에 바꾼 순서. 한 번도 동의 · 철회하지 않은 학원은 목록에 없다(= 동의 안 함).

## 저장 · 보관

- 현재 상태: `parent_marketing_consents`(학부모 × 학원 한 행, 동의 시각 · 철회 시각 · 출처 · 문구 버전).
- 이력: `parent_marketing_consent_events`(동의 · 철회마다 한 행, 지우지 않음).
- 학부모 탈퇴 시 두 표 모두 함께 지워진다.
- 080 무료수신거부로 들어온 번호는 모든 학원 안내에서 빠진다(학원별 동의와 별개).

## 처리 결과 알림(정보통신망법 제50조 제7항)

동의 · 철회가 **실제로 바뀌면** 서버가 학부모 계정 번호(`profiles.phone`)로 서비스 문자(광고 아님) 한 통을 보낸다. 앱은 따로 할 일이 없다.

- 동의: `[첫수업] ○○학원 안내 문자 수신에 동의했어요(2026년 10월 24일). 마이 > 학원 안내 문자에서 언제든 끌 수 있어요.`
- 철회: `[첫수업] ○○학원 안내 문자 수신을 거부했어요(2026년 10월 24일). 앞으로 이 학원의 안내 문자는 보내지 않아요.`
- 080 무료수신거부: `[첫수업] 학원 안내 문자 수신을 거부했어요(날짜). 앞으로 첫수업을 통한 학원 안내 문자는 보내지 않아요.`

바뀐 것 판정: 없음 → 동의, 동의 → 거부, 거부 → 동의만. 같은 값을 다시 보내거나 처음부터 거부를 보내면 문자는 없다.
판정은 RPC 가 학부모 · 학원 잠금 안에서 해 돌려주는 `changed` 하나로 한다(같은 요청을 동시에 두 번 보내도 알림은 한 통).
문자는 응답을 보낸 뒤 보내고, 실패해도 저장 응답(200)은 그대로다. 응답 본문은 바뀌지 않는다(`changed` 는 서버만 본다).
받는 번호는 학부모 계정 번호(010 휴대폰)이고, 학원 안내 문자도 같은 번호로 간다. 계정 번호가 없으면 알림은 건너뛰고 기록만 남긴다.
결과는 `marketing_consent_notices`(service role 전용)에 남는다.
개발 환경에서 운영 DB를 보면(로컬 가드) 보내지도 기록하지도 않고, `SMS_SEND_ENABLED`가 꺼져 있으면 시험 발송(dry_run)이다. 앱 심사용 계정에는 보내지 않는다.
080 무료수신거부는 매일 동기화(`/api/cron/marketing-opt-out-sync`)가 처리하고, 그 번호가 계정 번호인 학부모에게 번호마다 한 번 보낸다.

## 학원 쪽에서 보이는 것

학원은 자기 학원에 대한 **동의 여부와 동의 · 철회 시각만** 본다(출처 · 문구 버전 · 다른 학원 동의는 보이지 않는다).
엑셀로 가져온 신청(학부모 계정 없음)은 동의를 받을 방법이 없어 안내 대상에서 잠긴다.
