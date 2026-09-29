# 학부모 피드백 리마인더 알림톡

## 발송 조건

- 학부모가 발행된 체험 리포트를 실제로 열람했다.
- 최초 열람 후 24시간이 지났다.
- 피드백과 등록 의향이 모두 제출된 상태가 아니다.
- 신청 상태가 `completed`이고 취소·노쇼가 아니다.
- 발행 상태인 리포트가 존재한다.
- 신청당 한 번만 발송한다.

기존 `/api/cron/trial-reminders`가 매일 10:00 KST에 실행되므로 실제 발송 시점은 최초 열람 후 약 24~48시간이다.

## Ncloud 승인 템플릿

- 권장 template code: `FIRSTSUUP_FEEDBACK_REMINDER_V1`
- 환경변수: `ALIMTALK_TEMPLATE_TRIAL_FEEDBACK_REMINDER`
- 버튼 유형: 웹링크 `WL`
- 버튼 이름: `피드백 남기기`
- 모바일/PC 링크: `https://firstsuup.com/record/#{신청ID}/report#experience-feedback`

승인 요청 본문:

```text
[첫수업] 체험은 어떠셨나요?

#{학생명}님의 #{학원명} 체험수업은 어떠셨나요?

리포트를 확인하셨다면
짧은 피드백과 등록 의향을 남겨주세요.
```

코드는 실제 발송 시 `#{학생명}`, `#{학원명}`, `#{신청ID}`에 신청 snapshot 값을 넣는다. Ncloud에서 본문과 버튼을 위 구성으로 승인받고 Production 환경변수에 승인된 template code를 넣어야 발송된다.

## 실패와 중복 방지

발송 대상은 DB에서 15분 lease로 선점한다. 알림톡 또는 SMS fallback이 provider에서 수락된 뒤에만 완료 시각을 기록한다. 템플릿 승인·provider·환경 설정이 빠진 상태에서는 SMS를 보내지 않고 다음 cron에서 알림톡을 재시도한다. 설정이 끝난 뒤 실제 provider 요청이 실패한 경우에만 SMS fallback을 사용한다. 이미 피드백과 등록 의향을 모두 제출했거나 완료 발송 기록이 있는 신청은 다시 선점하지 않는다.
