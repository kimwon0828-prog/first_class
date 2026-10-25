# 학원 소식(광고성 정보) 수신 동의 — 서버 계약

대상: 학부모 앱(firstsuup-mobile) · 학부모 웹 작업자
상태: 서버 구현 완료(웹 action `setAcademyNewsConsentAction` · `getMyAcademyNewsConsentAction`, 앱 `GET · POST /api/native/me/marketing-consent`).
마이그레이션 `20261026120000_academy_news_single_consent`가 운영에 적용된 뒤 사용할 수 있다.

> 2026-10-25 변경: 동의를 학원별에서 **첫수업 하나**로 바꿨다. 옛 `/api/native/me/marketing-consents`(복수형, 학원별)는 없어졌다.

## 무엇에 대한 동의인가

- 체험 온 학생의 보호자에게 보내는 **학원 소식 문자**(새 반 개설 · 특강 · 시간표 변경)다. 광고성 정보다.
- 보내는 주체는 **첫수업**이다. 동의도 첫수업에 한 번 받는다(학원마다 따로 받지 않는다).
- 동의하지 않아도 체험 신청 · 일정 안내 · 리포트 같은 서비스 문자는 그대로 받는다(광고가 아니다).
- 발송 시간: 08:00~21:00(KST)만.
- 문자 모양:
  ```
  (광고) [첫수업] 010-8384-0825
  [중계 코딩랩] 하람이 보호자님, 지난 9월 로봇 코딩 체험에 와 주셔서 감사했어요.
  …
  무료수신거부 080-…
  ```

## 화면에서 받아야 하는 것

| 자리 | 동작 |
|---|---|
| 체험 신청 시트 | 선택 체크 "첫수업 학원 소식 받기 (광고)". 기본값 **꺼짐**. 체크하면 아래 POST |
| 마이 › 학원 소식 | 스위치 하나(철회 · 재동의) |

문구 버전 `firstsuup-academy-news-2026-10`(앱 `MARKETING_CONSENT_TEXT_VERSION`, 웹도 같은 값). 문구를 바꾸면 값을 바꾼다(서버는 기록만 한다).

## API

공통: 로그인한 **학부모** 세션만. 다른 사람 대신 바꿀 수 없다(서버가 `auth.uid()`로 판단). 학원 계정은 403.
입구 확인(Bearer 토큰 · 학부모 · 탈퇴 진행 · 휴대폰 확인)은 푸시 기기 등록 API와 같다.

### 1) 내 동의 — `GET /api/native/me/marketing-consent`

응답 200
```json
{ "consented": true, "consentedAt": "2026-10-25T05:12:00Z", "withdrawnAt": null }
```
- 기록이 없으면 `{ "consented": false, "consentedAt": null, "withdrawnAt": null }`.
- 철회 상태면 `consented: false` · `withdrawnAt` 있음 · `consentedAt`은 마지막 동의 시각.

### 2) 동의 · 철회 — `POST /api/native/me/marketing-consent`

웹은 같은 계약의 server action, DB에서는 RPC `set_my_academy_news_consent(p_consented, p_source, p_text_version)`.

요청
```json
{ "consented": true, "source": "parent_app", "textVersion": "firstsuup-academy-news-2026-10" }
```
- `source`: 앱 API는 `parent_app`, 웹 action은 `parent_web`. 앱 API에 `parent_web`을 보내면 400 `invalid_consent_input`, 그 밖의 값은 400 `invalid_consent_source`.
- `textVersion`: 1~60자. 본문에 학원 id가 있어도 쓰지 않는다.

응답 200 — GET과 같은 모양
```json
{ "consented": true, "consentedAt": "2026-10-25T05:12:00Z", "withdrawnAt": null }
```
- 다시 동의하면 동의 시각을 새로 찍고 철회 시각을 지운다. 철회하면 마지막 동의 시각은 남는다.
- 같은 값으로 여러 번 불러도 된다(멱등, 이력은 매번 남는다).

오류(GET · POST): 401 `login_required` · 403 `parent_required` · 403 `account_deletion_pending` · 403 `phone_verification_required` ·
400 `invalid_consent_input` · 400 `invalid_consent_source` · 503 `account_unavailable` · 503 `temporarily_unavailable` · 그 밖의 메서드 404 `not_found`.

## 저장 · 보관

- 현재 상태: `parent_academy_news_consents`(학부모 1행, 동의 시각 · 철회 시각 · 출처 · 문구 버전).
- 이력: `parent_academy_news_consent_events`(동의 · 철회마다 한 행, 지우지 않음). 출처는 `parent_app` · `parent_web` · `opt_out_080` · `admin`.
- 보유: 동의 철회 시까지(개인정보처리방침 선택 항목). 학부모 탈퇴 시 두 표 모두 함께 지워진다.
- 080 무료수신거부로 들어온 번호는 `marketing_opt_out_phones`(번호 해시)에 남아 모든 학원 소식에서 빠진다. 그 번호가 계정 번호인 학부모의 동의는 매일 동기화가 철회로 바꾼다(source `opt_out_080`). 080으로 거부한 번호는 앱에서 다시 동의해도 번호 표가 발송을 계속 막는다.

## 처리 결과 알림(정보통신망법 제50조 제7항)

동의 · 철회가 **실제로 바뀌면** 서버가 학부모 계정 번호(`profiles.phone`)로 서비스 문자(광고 아님) 한 통을 보낸다. 앱은 따로 할 일이 없다.

- 동의: `[첫수업] 학원 소식 수신에 동의했어요(2026년 10월 25일). 마이 > 학원 소식에서 언제든 끌 수 있어요.`
- 철회: `[첫수업] 학원 소식 수신을 거부했어요(2026년 10월 25일). 앞으로 학원 소식 문자는 보내지 않아요.`
- 080 무료수신거부: 철회와 같은 문구.

바뀐 것 판정: 없음 → 동의, 동의 → 거부, 거부 → 동의만. 같은 값을 다시 보내거나 처음부터 거부를 보내면 문자는 없다.
판정은 RPC가 학부모 잠금(advisory lock) 안에서 해 돌려주는 `changed` 하나로 한다(같은 요청을 동시에 두 번 보내도 알림은 한 통). 응답 본문에는 `changed`가 없다.
문자는 응답을 보낸 뒤 보내고, 실패해도 저장 응답(200)은 그대로다.
계정 번호가 없으면 알림은 건너뛰고 기록만 남긴다. 결과는 `marketing_consent_notices`(service role 전용, 학원 없음)에 남는다.
개발 환경에서 운영 DB를 보면(로컬 가드) 보내지도 기록하지도 않고, `SMS_SEND_ENABLED`가 꺼져 있으면 시험 발송(dry_run)이다. 앱 심사용 계정에는 보내지 않는다.
080 무료수신거부는 매일 동기화(`/api/cron/marketing-opt-out-sync`)가 처리하고, 그 번호가 계정 번호인 학부모에게 번호마다 한 번 보낸다.

## 학원 쪽에서 보이는 것

학원은 **자기 학원에 신청한 적 있는 학부모**의 동의 여부와 동의 · 철회 시각만 본다(출처 · 문구 버전 · 휴대폰 번호는 보이지 않는다).
Studio "학원 소식 보내기"는 동의한 학부모만 고를 수 있다. 엑셀로 가져온 신청(학부모 계정 없음)은 동의를 받을 방법이 없어 잠긴다.
