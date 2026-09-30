# Studio 상담 기능 강등/제거 — READ-ONLY audit

## 조사 기준과 재개 지점

- 기준일: 2026-09-29. 실제 로컬 working tree(기존 dirty/untracked 포함)를 조사한다.
- branch: `feat/studio-ux-phase1`, HEAD: `02060e7d2fe41e5dd7ac10f403029b5e8193869a`.
- HEAD 또는 Production과 현재 로컬 구현이 같다고 가정하지 않는다. 운영 DB의 실제 migration 적용/데이터량은 이번 소스 감사로 확정하지 않는다.
- 허용 변경은 이 문서뿐. 제품 코드/DB/migration/route/component 수정, commit/push/deploy 없음.
- 현재 AGENTS.md의 상담 운영 원칙은 현행 계약이다. 사용자 요청의 체험 중심 전환은 향후 변경 제안으로만 정리한다.

## 진행 체크포인트

### CP0 — 범위와 기준 확보

- 확인완료: 요청서, 루트 AGENTS.md, 상담/next_contact_at 관련 파일 후보 검색.
- 작업 전 962개 파일(환경변수 포함)의 hash와 branch/HEAD/staged 상태를 세션에 보관했다. 종료 시 이 문서를 제외하고 비교한다.
- TODO: 화면별 실제 caller → query → adapter → DB 연결, 쓰기/캐시/RLS, 알림/analytics, 체험 기록 중복, 단계별 제안.
- 마지막 확인: `AGENTS.md`, 저장소 전체 상담 키워드 파일 목록.
- 다음 시작: `docs/studio-cases-v1.md`, `docs/studio-dashboard-phase11.md`, `docs/studio-application-detail-workflow-v2.md` 및 Studio route/shell.

## 최종 결과

소스 조사 완료. 조사 당시 체크포인트를 보존하며 최종 결론은 아래 1~10절을 기준으로 한다. 운영 실재 미확인 항목은 E로 구분한다.

### CP1 — 활성 UI와 핵심 결합 확인

- Sidebar는 독립 `상담관리` 메뉴가 아니라 `/studio/cases`의 **상담·등록** 메뉴다(`studio-shell.tsx:142`). route 삭제보다 이름/역할 축소 후보.
- Dashboard는 후속 연락 위젯과 pipeline query 호출을 이미 제거했다. 현재 `getStudioApplications` → dashboard metrics/view/analytics를 사용한다. 상담·결과 기록 안내 문구만 남는다. 제거할 위젯이 아직 있다고 가정하면 안 된다.
- Cases는 단계 필터 자체는 신청/일정 확정/체험 후 관리/등록·미등록·취소·노쇼지만, next action에는 첫 상담 기록/후속 연락/다음 연락 확인이 남는다. `getStudioCases`는 상담 로그와 작성자 조회가 실패하면 목록 전체를 error로 처리한다.
- **중요:** Application Detail의 `등록 결과 입력` 버튼도 `openConsultationEditor`를 호출한다(`application-trial-result-workflow.tsx:509`). 상담 작성과 등록 결과 입력을 먼저 분리하지 않고 상담 폼을 삭제하면 업무 단절 위험.
- 상담 생성 action은 `createStudioConsultationTransaction`을 호출한다. registration status, 미등록 사유, next contact, 일정 희망 snapshot을 상담 로그와 함께 저장한다.
- `/studio/applications`는 살아 있는 기존 신청 목록이다. `/studio/unregistered`도 실제 pipeline query/담당 상담 작성자 필터를 가진 legacy 화면으로 남아 있다.
- 확인완료 파일: `docs/studio-cases-v1.md`, `docs/studio-dashboard-phase11.md`, `docs/studio-application-detail-workflow-v2.md`; `src/features/studio/ui/studio-shell.tsx`; `app/studio/(dashboard)/{page,cases/page,applications/page,unregistered/page}.tsx`; `queries/get-studio-cases.ts`, `queries/get-consultation-pipeline-applications.ts`, `lib/case-filters.ts`, `lib/case-view-model.ts`, `lib/case-list-presentation.ts`, `lib/case-activity.ts`, `src/shared/lib/consultation-pipeline.ts`; 상담 create/update/reopen action의 guard/저장 호출; 상세/workflow 상담 관련 호출부.
- 다음 시작: 상담/등록 migration와 RPC, adapter 구현, 기록 비교, 알림·cron 및 나머지 화면.

### CP2 — 저장·등록 결과·권한 연결 확인

- `create_studio_consultation`은 신청 row를 `FOR UPDATE`로 잠그고 submission UUID를 consultation_logs PK로 사용해 멱등 처리한다. completed + 등록 미종결 guard 후 신청의 등록 상태/미등록 사유/next_contact_at/last_activity_at/희망 일정 cache와 상담 snapshot, application_logs를 같은 transaction에 쓴다.
- `trial_applications_sync_registration_result` trigger는 registration_status 변경을 `registration_results`의 현재 결과/과거 결과로 동기화한다. 현재 결과 1건 unique, supersede-only 수정 제약이 있다. 신규 독립 등록 입력을 만들더라도 이 불변식을 보존해야 한다.
- 상담 수정은 log UPDATE 후 최신 log일 때 신청 snapshot UPDATE를 **별도 요청**으로 수행한다. 생성의 원자성 보장과 다르다. `case-view-model.ts`의 “수정 시 cache 갱신 안 됨” 주석은 현 action과 불일치: 현재는 갱신을 시도하지만 부분 실패 위험이 남는다.
- 상담 재개는 not_enrolled → pending이며 현재 registration result를 과거로 보낸다. 미등록 사유가 최신 상담 snapshot에 보존됐는지 확인하는 guard가 있다. 상담 기록을 먼저 삭제/변환하면 재개 경로가 막힐 수 있다.
- 조회 RLS는 같은 조직 Studio teacher 의미의 role + `is_org_trial_application`; update는 CONSULTATION 타입만 허용. Parent/Public 조회 정책은 없다. 20260915090000 이후 생성 RPC는 SECURITY DEFINER이며 자체 academy/admin·조직 검사를 한다. 다음 migration에서 PUBLIC/anon EXECUTE를 revoke하고 authenticated만 명시 허용한다. 운영 DB에 실제 적용됐는지는 미확인.
- 상담 저장 성공 후 등록 전환에 대해 `trial_enrolled` SMS safe wrapper를 호출한다. 이 경로를 제거하면 등록 알림도 함께 사라질 수 있다.
- next_contact_at 기반 notification/cron은 소스 검색에서 발견되지 않았다. 체험 전일 알림은 confirmed_slot_at, 리포트/피드백 알림은 별도 발행·열람 기록을 사용한다(세부 caller 최종 확인 중).
- 확인완료: `adapter.ts` 상담/결과 interface; `supabase-adapter.ts` 상담 읽기·쓰기/상세/결과 구간; `mock-adapter.ts` 대응 메서드 위치와 상태 write; 20260815 상담 foundation, 20260818 update, 20260819 sentiment, 20260906 atomic RPC, 20260914 registration_results, 20260915 Parent boundary 및 RPC revoke migration; 상담 history modal 수정·추가 caller; Schedule/Classes/Settings/My Page route entry 및 상담 검색.
- 다음 시작: 정책 분류표·중복 필드·나머지 알림/analytics/legacy caller·검증 영향 정리. Production runtime/사용량 통계는 아직 확인하지 않음.

## 1. 최종 핵심 결론

**상담을 1급 업무에서 내리는 것은 가능하다. 단, 등록 결과 저장을 먼저 분리하고, 상담 이력은 보존해야 한다.** 현 구조에서는 “상담 UI 삭제”가 등록 결과·등록 알림 중단으로 연결된다.

분류: **A** 완전 제거 추천(의존성 해소 후 코드/UI만), **B** UI에서 제거하고 데이터 보존, **C** 이름/역할 축소, **D** 유지 필요, **E** 추가 확인 필요. DB 데이터 삭제를 추천하는 A 항목은 없다.

| 요청한 판단 | 결론 | 분류 / 조건 |
|---|---|---|
| 1. Sidebar 상담관리 제거 | 현재 독립 메뉴는 없고 `상담·등록` → `/studio/cases`이다. 메뉴 자체 삭제보다 `체험 신청 관리`로 축소 추천 | C. route·상세 복귀 링크 유지 |
| 2. Dashboard 후속 연락 제거 | 이미 위젯과 query 호출이 제거됨. 다시 구현하거나 이중 제거할 필요 없음 | A(남은 홍보 문구만 후보), D(체험·등록 업무/지표) |
| 3. Cases 상담 filter/column 제거 | 현재 단계 filter는 유지 가능. 다음 행동/연락 기한/첫 상담 요구 판정과 상담 전용 조회를 제거 후보로 분류 | B. 최근 기록은 legacy 이벤트로 축소(C) |
| 4. 상세 상담 카드 제거 | 현 카드의 1급 노출/새 상담 CTA 제거 가능. 등록 입력부터 독립시켜야 함 | B, 선행 조건 필수 |
| 5. 기존 기록 표시 | `이전 연락 기록`으로 기본 접힘·읽기 전용 추천. 빈 경우 작성 유도 없음 | C. 원래 상담 방식·시각·작성자·내용·snapshot 보존 |
| 6. 신규 log 작성 유지 | 최종 방향에서는 중단 추천. 전환 기간 동안 등록 결과 저장 경로로 쓰이는 현 RPC는 즉시 폐기 불가 | B → A(write caller만). 서비스 운영 경로 확인(E) |
| 7. next_contact_at 중단 | 향후 업무 selector/기한 표시/신규 쓰기 중단. 기존 값을 일괄 NULL로 만들지 않음 | B. legacy log의 당시 예정일은 읽기 허용 |
| 8. 상담 notification | next_contact 전용 알림/cron은 발견 못 함. 상태 알림과 등록 알림을 상담 기능으로 오인해 제거하면 안 됨 | D(등록·일정·리포트·체험 알림), C(상담 문구) |
| 9. 상담 analytics | 활성 Dashboard에 상담 KPI/상담자 성과 chart 없음. 등록 전환·미등록 사유는 실제 결과 분석으로 유지 | D. legacy pipeline counts/상담자 필터는 B |
| 10. consultation_logs DB | 테이블·FK·index·데이터·조직별 SELECT 경계 보존 | D. DB write 중단 ACL은 별도 승인 후 검토(E) |

`reviewing`을 삭제하거나 의미를 새 상태로 바꾸는 제안이 아니다. 현 신청 상태 계약과 legacy URL은 유지한다. 사용자 후보인 `결과 정리 필요` 등은 향후 UI 파생 상태로 검토할 수 있으나 새 DB status를 만들 필요가 있다고 단정하지 않는다.

## 2. 화면/route 전수 분류

route는 저장소 내부 `/studio/...` 기준이다. Production Studio host의 clean path 변환은 기존 navigation helper를 유지한다.

| 화면 / route | 실제 연결·현재 역할 | 권고 |
|---|---|---|
| Sidebar / layout | `studio-shell.tsx:142–146`의 상담·등록 메뉴가 Cases로 연결. 상담 badge 전용 pipeline count 호출 없음 | C: 라벨/설명/복귀 문구만 변경 후보. shell/권한/nav path 체계 유지 |
| Dashboard `/studio` | `page.tsx:47` → `getStudioApplications` → `listStudioApplications`; metrics/view/analytics. 후속 연락 query/import 없음. Free 안내 `상담·결과 기록` 문구 남음 | 상담 widget 추가 제거 불필요. D: 체험 일정/오늘 처리할 신청/등록 결과/분석; C: 문구 |
| Cases `/studio/cases` | `cases/page.tsx:132` 상담·등록 제목. `getStudioCases` → view 기반 신청 + teachers + consultation_logs + trial_results + 최신 작성자 profiles. 다음 행동에 상담/연락 urgency | B/C: 체험 신청 관리로 역할 축소. 상담 조회 제거와 selector 변경은 함께 |
| Application Detail `/studio/applications/[id]` | route → 상세 adapter → workflow. Aside 상담 이력 + 전체 보기 modal + 등록 결과 입력/상담 재개. 메인 체험 기록·리포트와 독립 표시지만 저장은 결합 | B/C. 아래 집중 분석 참고 |
| Schedule `/studio/schedule` | route → `getStudioApplications({scheduleRange})`, 일정 filter options → `StudioScheduleManager`. 해당 summary query에 next_contact/log 없음 | D: 실제 체험 일정/배정 담당자 유지. 상담 예정 캘린더는 현재 구현에서 발견 안 됨 |
| Classes `/studio/classes`, new/edit | `getStudioClassListItems`/수업 form. 상담 로그 연결 없음. `regularPriceType = consultation`, 문구 `상담 후 안내`는 수강료 공개 방식 | D: 별개 가격 계약. 문자열 일괄 제거 금지 |
| Settings `/studio/settings` | `getStudioSettingsOrganization` + `getPendingAcademyUpdateRequest` → 공식정보/연락처 변경 요청 | D. contactPhone은 학원 연락처이며 상담 기능 아님 |
| My Page `/studio/mypage`, `/profile` | 조직명/공개 프로필 query/action. 상담 log·next contact caller 없음 | D. 이번 승인된 프로필 UI와 무관 |
| Teachers `/studio/teachers` | 담당 선생님 계정/배정 영역. 키워드 검색상 상담 CRUD 연결 없음 | D. assigned_teacher를 상담자와 혼동하지 않음 |
| legacy `/studio/applications` | 현재도 실제 `StudioApplicationTable` 렌더. 신청일/선생님 filter 사용. table에서 reviewing 설명 `상담 및 일정 조율 중` 잔존(`:190`) | C: 문구 정리 후보. route 유지, 필요하면 후속 redirect 설계(E). 기간필터 정책을 Cases에 그대로 복제하지 않음 |
| legacy `/studio/unregistered` | `getConsultationPipelineApplications` → adapter → completed 신청 + 상담/결과. 마지막 상담 작성자 filter, TODAY_CONTACT/NEEDS_CONSULTATION/NO_NEXT_CONTACT/UPCOMING_CONTACT/CLOSED 그룹 | B: 신규 진입 유도 중단/호환 동선 검토. route 삭제는 금지, 북마크 동작 보존. 실제 조건은 `canUseConversionAnalytics` gate이며 주석의 “상담 권한” 설명과 다름 |
| Notifications | 별도 `/studio/notifications` route 없음. Parent 웹 알림과 SMS/알림톡 service 구조 존재 | D: 체험·등록·리포트 알림 유지. 아래 의존성 참고 |
| Billing / sign-in 등 주변 카피 | billing entitlements/presentation, 로그인 안내에 상담·등록 문구. 권한 flag는 상담과 등록 저장에 공용 | C(카피), D(권한 분리 전 gate). 요금제 동작 삭제 금지 |

### Cases 현재 filter/column의 정확한 범위

- `case-filters.ts` active: 전체, 신청 접수(new+reviewing), 일정 확정, 체험 후 관리(completed + undecided/pending). closed: 등록/미등록/취소/노쇼. **상담자·상담 sentiment·next_contact 전용 filter는 현재 Cases에 없다.** 해당 filter는 legacy unregistered에 있다.
- active row는 학생, 현재 단계, 체험수업/일정, 다음 행동, 담당자, 최근 기록. 연락 기한은 다음 행동 아래 보조 표시다. `latestConsultation`/`consultationCount`는 모델에 남지만 별도의 “상담 건수” column이 현재 row의 중심은 아니다.
- `case-view-model.ts:212`의 completed attention은 pipeline group을 참조. 연락 기한이 체험 기록 미작성보다 먼저 평가될 수 있다. UI 문구만 지우면 이 우선순위가 남는다.
- `case-list-presentation.ts:17–21`: NEEDS_CONSULTATION → 첫 상담 기록, NO_NEXT_CONTACT → 다음 연락 확인, 연락 그룹 → 후속 연락. `:32` 연락 지연/오늘/예정/미정 표시. `:72` 최신 상담을 최근 기록 후보로 사용.
- `getStudioCases:281–360` 상담/작성자 조회 실패는 전체 목록 실패. legacy history를 상세에서만 남길 때 Cases의 이 두 조회를 제거할 수 있지만 query DTO와 selector/types/mock/verifier를 함께 정리해야 한다.
- 현재 단계/진행·종료는 status와 registration_status에 의존한다. 상담 로그 유무로 completed/enrolled를 새로 추정하지 않는다. 기간/정렬/pagination 변경은 본 제안 범위 아님.

## 3. Application Detail: 실제 연결과 제거 선행 조건

```text
applications/[id]/page.tsx
  → getStudioApplicationDetail
    → dataAdapter.getStudioApplicationDetail
      → studio_trial_applications + application_logs + trial_results + consultation_logs
  → ApplicationTrialResultWorkflow
    ├─ 체험 기록: upsertTrialResultAction → upsertStudioTrialResult
    ├─ 리포트: ApplicationReportPublishing → 기존 report 발행 경로
    ├─ 상담 기록 / 등록 결과 입력: 동일 openConsultationEditor
    │   → createConsultationLogAction → createStudioConsultationTransaction
    │     → create_studio_consultation RPC
    │       → trial_applications 등록상태·cache + consultation_logs + application_logs
    │       → sync_registration_result trigger → registration_results
    │     → commit 뒤 trial_enrolled SMS safe wrapper
    ├─ 상담 이력 전체 보기: ConsultationHistoryModal
    │   → updateConsultationLogAction → log UPDATE → 최신 snapshot UPDATE
    └─ 상담 재개: reopenRegistrationConsultationAction
        → updateStudioApplicationOutcome → registration_status pending
        → sync_registration_result로 종전 실제 결과 supersede
```

- 표시: workflow `:387` 상담 이력 카드에 최근 1건·다음 연락, 전체 보기. `:488` 학원 등록 결과 카드. `:822` 상담 추가 modal. 시스템 이력과 상담 이력을 `buildCaseActivityEvents`로 구분한다.
- 신규 작성은 completed, 비종결, 등록 조회 정상, `canWriteConsultations` 조건. 등록 결과 입력도 이 조건을 공유한다. 체험 전·취소·노쇼를 무조건 상담 입력 대상으로 바꾸지 않는다.
- `ConsultationHistoryModal:143`은 CONSULTATION 타입이면 수정 버튼이 나온다. `canAddConsultation=false`만으로 기존 수정은 막히지 않는다. 읽기 전용 강등 시 **추가 버튼뿐 아니라 편집 진입/state/action 경로도** 별도로 끊어야 한다. LEGACY_IMPORT는 이미 수정 대상 아님.
- `application-detail-workflow-state.ts:93,106`에 다음 연락 도래와 ParentDecision=considering → 상담 권장 primary 판정이 남아 있다. visible card를 없애도 journey/강조 판정이 stale하게 남지 않도록 후속 작업에 포함한다.
- 상세 adapter는 consultation_logs 조회 실패 시 전체 상세를 실패시킨다(`supabase-adapter.ts:4828`). trial result는 부분 조회 옵션이 있으나 상담 history는 같은 수준의 독립 오류 처리로 분리돼 있지 않다. legacy history query를 독립시키는 경우 오류가 기록/리포트/등록 결과를 가리지 않도록 해야 한다.
- `trial_results.note`라는 내부 메모가 이미 존재한다. 새 internal memo 테이블은 현 감사에서 필요하다고 판단하지 않는다. 단, 상담 note를 자동 복사하면 날짜별 대화 이력이 단일 최신 체험 메모로 손실되므로 금지한다.

### 독립 등록 결과 UX의 실현 가능성

가능하다. 현재 route가 `getStudioRegistrationResult`로 실제 결과를 별도로 읽으며, ParentDecision과 구분한다. 체험 결과 정리 영역에 체험 기록/리포트/등록 결과를 함께 놓는 것은 저장 통합을 뜻하지 않는다.

다만 **현재 `src/features/registration`에는 등록 결과 전용 write action이 없고 read query/lib만 있다.** 단순히 상담 폼 제목을 바꾸거나 channel/sentiment/note를 가짜 기본값으로 보내는 우회는 추천하지 않는다.

후속 설계에서 최소한 다음을 보장해야 한다: 실제 등록 결과 독립 command, completed/조직/권한 guard, 동시 제출·재시도 안전성, 결과 timestamp·미등록 사유 보존, 기존 registration_results trigger/current unique·supersede 계약, 저장 성공 후 등록 알림, 기존 legacy result 호환. DB/RPC 변경 필요 여부는 이 command 설계에서 최소 변경안으로 별도 승인받는다. 이번에는 구현/DDL 없음.

## 4. 저장 개념과 중복 분석

| 개념 | 실제 저장 필드/구조 | 중복과 차이 | 권고 |
|---|---|---|---|
| 체험 기록 | `trial_results`: application 1건 unique; observations, recommended_course/level/schedule, public_summary, note; legacy parent_reaction/next_action 보존 | 체험 관찰/추천과 내부 설명을 저장. 최신 기록이며 상담 회차 이력이 아님 | D |
| 학부모 리포트 | `experience_reports`의 발행 snapshot/version/status/content | 관찰·추천·공개 총평을 발행 시점에 복제. 내부 note/parent_reaction/next_action/registration은 제외 | D. 상담 내부 내용을 공개로 이동 금지 |
| 내부 메모 | 현재 UI의 `trial_results.note` | 자유 서술이라 상담 핵심 참고 내용을 앞으로 기록할 수 있음. 상담 날짜/방식/작성자/반응/후속 연락의 구조화 이력을 대체하지 못함 | D. 신규 일상 메모 용도로 충분할 수 있으나 legacy 자동 병합 금지 |
| 실제 등록 결과 | 신청 `registration_status`, enrolled_at/lost_at, unregistered_reason(+note) + `registration_results` current/history | 학원이 확인한 결과. 현재 상담 저장이 producer이나 데이터 의미는 독립 | D. ParentDecision과 합치지 않음 |
| 상담 이력 | `consultation_logs`: 여러 회차, occurred_at/channel/sentiment/note/next_action/next_contact_at/작성자 + 등록상태/사유/희망일정 snapshot | note는 메모와, sentiment는 legacy parent_reaction과 주제가 겹침. snapshot은 당시 사실이고 current 결과와 다름 | B/C. 원본 그대로 읽기 전용 보존 |
| 과거 신청 메모/cache | `trial_applications.consultation_note`, follow_up_note, trial_feedback, final_level/final_schedule/registered_course | 초기 시스템 메모/결과. foundation migration에서 일부를 LEGACY_IMPORT/체험 기록으로 backfill. 현재 모든 row가 완전 이관됐다고 단정 불가 | D/E. 삭제·재이관 금지 |
| 학부모 신청 메모 | `trial_applications.memo`, child_notes 등 | 학부모가 신청 당시 제공한 내용. Studio 내부 메모와 다름 | D |
| 정규수업 희망 일정 | 신청 regular_schedule_preference(+note/updated_at), 상담 시점 snapshot | 체험 추천 일정(recommended_schedule)과 희망 일정은 다름. 상담 쓰기 중단 때 수정 경로도 사라질 수 있음 | D(데이터), E(향후 편집 필요성) |

판단: **체험 기록 + 내부 메모는 앞으로의 체험 평가/참고 메모 업무를 상당 부분 대체할 수 있다.** 연락 회차, 당시 등록 판단, 희망 일정의 변경 이력까지 같은 것이라고 볼 수는 없다. 이 차이를 legacy 읽기 전용 history로 보존하면 단순화와 데이터 보존을 함께 달성할 수 있다.

리포트 경계 근거: `experience-report-snapshot.ts:97–130`의 allowlist/forbidden fields, `upsert-trial-result.ts:241–251`의 publicSummary와 note 분리. parentReaction/nextAction은 현재 UI에서 신규 입력하지 않고 기존 값을 보존한다. `trial-result-options.ts`의 `consultation/상담하기` option 정의는 export/caller 정리 대상이지 기존 저장값 삭제 근거가 아니다.

## 5. DB와 adapter — read/write/dependency 지도

| 저장소 / 필드 | write | read/UI | 제거 영향 / 추천 |
|---|---|---|---|
| consultation_logs | 생성 RPC; 수정 action의 adapter UPDATE; 구형 createStudioConsultationLog(현재 production caller 없음, verifier caller 있음) | 상세/history, Cases 최신 기록·attention, unregistered pipeline | B/D: UI만 축소, 테이블 보존. DROP하면 목록·상세까지 오류 |
| trial_applications.next_contact_at | 생성 RPC; latest snapshot UPDATE; 구형 snapshot adapter; 초기값 null | Cases 연락 기한·pipeline, 상세 다음 연락/권장 action, legacy pipeline | B: selector/read/write 단계적 중단. 기존값 그대로; null도 정상 값 |
| last_activity_at | 상담 RPC/구형 snapshot adapter | legacy pipeline 정렬, Cases 모델 | D/E: 상담 전용이라고 일괄 NULL 금지. 현재 canonical 값 재정의 별도 검토 |
| consultation_note / follow_up_note | 구형 outcome UPDATE 및 재개 시 기존값 전달; 과거 입력/이관 | 상세 DTO, legacy unregistered query, LEGACY_IMPORT backfill 원천 | D: 역사 데이터, 공개 금지 |
| registration_status / enrolled_at / lost_at / unregistered_reason | 상담 생성 RPC, 재개 outcome UPDATE | Cases closed 판정, 상세, Dashboard/전환 분석, registration trigger | D: 상담 제거의 핵심 분리 대상 |
| regular_schedule_preference(+note/updated_at) | 상담 create/update의 명시 입력 때만; 미전달이면 보존 | 상세 희망 일정, 로그 snapshot | D/E. 새 화면으로 옮길지 제품 판단 필요; 삭제 금지 |
| contacted_at | move_to_reviewing adapter 경로 | summary/detail legacy timestamp | D: 상담 성공 증거가 아님. 현 status action은 move_to_reviewing 허용 상태가 빈 배열 |
| application_logs | 신청 상태 변경/상담 등록 전환/재개/체험 기록 등 | 상세 시스템 이력, Parent 안전한 상태 event projection | D. 상담 관련 note가 있어도 테이블 전체 제거 금지 |
| registration_results | `sync_registration_result` trigger만 작성 | 상세 실제 결과, 분석/Parent 경계 관련 계약 | D. ParentDecision과 독립. 상담 로그와 FK 직접 결합이 아니라 신청 상태 write를 통한 간접 결합 |

### FK / index / RLS / migration 근거

- `20260815140000_add_conversion_pipeline_foundation.sql`: consultation_logs.application_id → trial_applications ON DELETE CASCADE; created_by → profiles ON DELETE SET NULL; `(application_id, occurred_at desc)` index. 신청 queue index는 assigned_teacher_id/next_contact_at/last_activity_at. trial_results는 application_id unique.
- `20260818103000_enable_consultation_log_updates.sql`: updated_at/trigger 추가, table-level UPDATE revoke 후 channel/note/next_contact_at column grant, 같은 조직 CONSULTATION-only update policy.
- `20260819103000_add_consultation_sentiment_and_snapshot.sql`: sentiment/registration snapshot CHECK 및 sentiment update grant.
- `20260903120000_add_regular_schedule_preference_snapshots.sql`, `20260903140000_grant_consultation_preference_snapshot_updates.sql`, `20260905090000_add_consultation_unregistered_reason_snapshots.sql`: 희망일정/미등록 사유 snapshot shape·조건·수정 권한. 선택적 값/미전달 보존 의미 있음.
- `20260906090000_add_create_studio_consultation_transaction.sql`: UUID PK 멱등, org 검사, row lock, completed 및 terminal guard, 원자 생성.
- `20260914230000_create_registration_results.sql`: 신청 FK는 RESTRICT, 현재 결과 partial unique, immutable trigger, registration status 동기화. 현재 결과를 삭제해서 재개하는 방식 아님.
- `20260915090000_enforce_parent_application_read_boundary.sql:156,289–319`: base trial_applications 대신 Studio view/안전 함수 경계; 상담 정책은 `is_org_trial_application` 재사용; RPC SECURITY DEFINER 전환.
- `20260915100000_restrict_create_studio_consultation_execute.sql`: PUBLIC·anon 실행 차단. 직접 RPC 호출을 막으려면 UI/action 삭제만으로 충분하지 않다.
- Parent insert hardening migration(`20260929090000`)도 상담 cache/운영 상태가 null이어야 하는 계약을 갖는다. 컬럼 삭제는 Parent insert policy까지 영향을 준다. 이번 감사에서 이 migration의 운영 적용 여부는 확인하지 않았다.
- 현재 RLS로 읽기 전용 화면 구현은 가능하지만, **DB 수준 불변성은 별개**다. authenticated CONSULTATION UPDATE/INSERT와 RPC execute가 살아 있으면 직접 호출 가능. write retirement 시 최소 ACL/RPC 변경안을 별도 검토해야 하며 service role/운영 복구 경로의 사용량은 확인 전 폐쇄하면 안 된다.

### next_contact_at 폐기 시 데이터 정책

1. 기존 신청/log 값을 보존한다. 전량 NULL update나 자동 날짜 이관을 하지 않는다.
2. 먼저 Cases/상세/pipeline에서 contactDue, NEEDS_CONSULTATION, NO_NEXT_CONTACT 등의 업무 유도 판정을 제거한다.
3. 독립 등록 결과 저장이 준비된 뒤 신규 상담 next_contact 쓰기를 중단한다. 기존 table nullable/default 의미는 유지한다.
4. legacy history에 당시 예정일을 표시할 수 있으나 “현재 해야 할 일”로 다시 계산하지 않는다.
5. registration closure 시 null을 쓰던 기존 계약과 새 결과 command의 관계를 명시한다. 오래된 next_contact를 활성 업무에 재유입하지 않도록 검증한다.
6. last_activity_at, completed_at 등 다른 workflow의 원천 값을 상담 제거 명목으로 바꾸지 않는다.

## 6. 알림·cron·분석 의존성

### 확인된 알림

- `create-consultation-log.ts:286`은 최초 저장 + enrollmentTransition일 때 `trial_enrolled` SMS를 보낸다. duplicate submission은 재발송하지 않으며 safe wrapper 실패는 commit을 취소하지 않는다. 독립 결과 write로 옮길 때 이 성질을 보존해야 한다.
- `trial_contact_started`는 SMS type/template/DB event constraint에 남아 있다. 현재 `update-application-status.ts`에서는 move_to_reviewing을 허용하지 않고 해당 event 발송 caller가 발견되지 않았다. **과거 event/log 보존**, template 제거는 다른 배포/운영 caller 확인 후(E).
- Parent 알림의 `application_reviewing`은 application_logs의 안전한 status event에서 파생한다. 실제 상담 기록을 읽지 않으며 자유 note를 Parent로 보내지 않는다. 과거 알림이므로 단순 삭제보다 신청 확인 의미로 유지(D/C).
- 알림톡/SMS의 `상담 및 등록 안내`, `수업 후 등록 상담`은 문구다. 템플릿의 이벤트 코드·승인된 외부 template ID를 임의 삭제/교체하면 안 된다. 제품 전환 시 카피와 공급자 승인 여부를 별도로 확인한다(E).
- 전일 알림: `run-trial-reminders.ts:111–117`의 confirmed_slot_at 범위. 같은 runner `:335`에서 `create_parent_feedback_reminders` RPC 호출. 피드백 알림은 리포트 최초 열람 등 별도 정책이며 next_contact_at과 다르다.
- `vercel.json`과 `app/api/cron`의 trial-reminders, rolling-schedules, billing-renewals/reconciliation을 조사했다. 이 소스 범위에서 next_contact_at 또는 consultation_logs를 이용한 예약 알림은 발견되지 않았다. 외부 Supabase scheduled job/운영 수동 자동화는 미확인(E).
- 전화/연락처 UI는 일정 조율에도 필요하다(D). 전화 클릭을 상담 완료/통화 성공으로 해석하지 않는 기존 규칙 유지. SMS logs/알림톡 logs도 상담 table과 함께 삭제하지 않는다.

### Analytics

- 활성 Dashboard의 `studio-dashboard-metrics.ts`, `studio-dashboard-analytics.ts`는 신청 status/체험 결과/실제 등록 status·미등록 사유 cohort를 계산한다. consultation log 수/상담 sentiment/상담자 성과를 직접 집계하지 않는다.
- `studio-dashboard-view.ts`는 summary에 next_contact_at/trial_results/consultation_logs가 없음을 명시한다. 따라서 상담 history read를 제거해도 Dashboard query가 직접 깨지는 구조는 아니다. 단, **등록 producer를 없애면 이후 등록 KPI가 갱신되지 않는 간접 회귀**가 있다.
- `get-studio-conversion-analytics.ts` → 별도 report/ParentDecision/registration sources. 현재 route caller 검색에서 사용처가 발견되지 않은 보존 코드이며 상담 analytics로 오인해 지우면 안 된다. `get-studio-dashboard-summary.ts`도 활성 Dashboard와 별도 구형 집계 경로다.
- legacy `getConsultationPipelineApplications`의 group summary 및 `UnregisteredStudentsManager` 상담자/반응 표시는 B. 분석 기간이 아니라 실제 연락 queue용으로 설계돼 있다.
- billing `canWriteConsultations`/`canReopenConsultation`은 현재 Free에서도 허용되는 기록 권한이며, 등록 결과도 첫 flag를 공유한다. `false`로 바꾸면 등록 입력까지 차단된다. canUseConversionAnalytics / canUseUnregisteredReasonAnalysis 등 실제 결과 분석 entitlement는 유지한다. 새 chart 제안 없음.

## 7. 삭제 후보와 보존 경계

| 구분 | 대상 | 조건 |
|---|---|---|
| A: 코드 제거 후보 | 구형 `getUnregisteredApplications`, `getConsultationPipelineActiveCount`, 구형 `createStudioConsultationLog`, `updateStudioApplicationConsultationSnapshot` | app/src 실제 production caller 없음 또는 구형 query에만 연결. interface/mock/verifier caller가 남으므로 지금 삭제 가능하다고 단정하지 않음. 최종 import 검사 후 한 묶음 정리 |
| B: 활성 UI 강등 | 신규 상담 modal, 편집 modal, 상담 재개, legacy pipeline groups/filters, 연락 기한 CTA | 독립 결과 write/재개 정책 확정과 단계적 적용 이후 |
| C: 명칭 축소 | 상담·등록 메뉴/제목/복귀 링크/로딩문구, 이전 연락 기록, 상담 성공/작성 안내, pricing/billing 외 상담 중심 카피 | 전체 문자열 치환 금지. route contract 및 내부 event code 유지 |
| D: 보존 | consultation_logs와 snapshots, application_logs, trial_results, registration_results, ParentDecision, reports, 원천 timestamp, 조직 권한/공개 경계 | 데이터 개념별 구분 유지 |
| E: 외부 확인 | 실제 DB ACL/적용 migration, 외부 cron/RPC client/service role, 운영자 사용 빈도, legacy 북마크/딥링크, 원장 희망일정 편집 요구 | 운영 READ-ONLY 현황 audit/제품 판단 후 결정 |

“LEGACY_IMPORT만 남기면 된다”는 해석은 틀리다. 현재 CONSULTATION 타입의 정상 작성 데이터도 강등 이후 legacy 읽기 전용 이력으로 보존해야 한다. activity_type 값을 일괄 바꿀 필요도 없다.

## 8. 위험과 후속 검증 매트릭스

| 위험 | 구체적인 파손 지점 | 후속 검증 |
|---|---|---|
| 등록 결과 입력 소실 | 두 CTA가 같은 상담 editor/action 사용 | 독립 enrolled/not_enrolled 입력, 미등록 사유, 권한·동시성·재시도 |
| 상담 UI만 숨겨 write 잔존 | history 수정 버튼, server action, direct RPC, column UPDATE grant | 읽기 history의 추가/수정 없음 + 직접 호출 허용 정책 의도 확인 |
| null/stale cache | null이면 첫 상담/연락 미정 task, stale next_contact가 다시 강조 | 기존 null/과거/미래 날짜 모두 체험 workflow와 독립 |
| 목록·상세 전체 오류 | getStudioCases/상세 adapter의 필수 consultation query | history 조회 실패가 체험 기록/리포트/등록을 가리지 않음 |
| 수정 부분 저장 | log update 성공, snapshot update 실패 | 현재 알려진 위험을 단계 전환 시 유지/폐기 여부 명시. 생성 원자성과 혼동 금지 |
| 재개로 현재 결과 소실 | pending 전환 → registration result supersede; 사유 snapshot guard | 미등록 재개 유지 여부 명시, legacy 사유 보존, enrolled 재개 금지 유지 |
| analytics 지연/오염 | 등록 write 중단 또는 ParentDecision을 실제 결과로 사용 | 기존 cohort/분모/등록·미등록 수치 보존 |
| URL/접근 경로 파손 | legacy routes, detail return allowlist, query params | nav helper/북마크/직접 URL/필터 복귀 호환 |
| 상태 의미 혼동 | reviewing, contacted_at, 전화 클릭 | 신청 확인은 상담 완료가 아님. new→confirmed 경로/legacy reviewing 보존 |
| 알림 소실/중복 | trial_enrolled가 상담 action 안에 있음 | commit 후 1회, duplicate no-send, 실패가 결과 저장 방해 안 함 |
| 개인정보 공개 | 내부 note/snapshot을 리포트·Parent로 재사용 | report allowlist, Public HTML/RSC/알림 payload 금지 필드 유지 |
| 조직/RLS 회귀 | Studio view, is_org_trial_application, definer RPC | 타 학원/Parent/anon 차단, 같은 조직 read history, 운영 role 영향 별도 |

영향 verifier(실행하지 않고 소스/이름·호출 계약 조사):

- `verify-consultation-atomicity.ts`(로컬 DB fixture write 포함하므로 이번 audit에서는 실행 금지), `verify-consultation-preference-write.ts`.
- `verify-registration-result.ts`, `verify-parent-decision.ts`, `verify-parent-application-boundary.ts`, `verify-parent-notifications.ts`, `verify-parent-notifications-v2.ts`.
- `verify-studio-cases-v1.ts`, `verify-studio-ux-phase1.ts`, `verify-final-ux-coherence.ts`, `verify-application-detail-workflow-v2.ts`와 workflow fixtures.
- `verify-conversion-analytics.ts`, `verify-conversion-report.ts`, `verify-studio-dashboard-phase11.ts`, `verify-studio-dashboard-final-polish.ts`.
- navigation contract/migration/route/host rewrite, billing/entitlement, experience-report publication 및 교육 프로필 verifier.
- 향후 제품 변경 시 typecheck/lint/build와 해당 regression을 수행한다. 이번 문서-only audit에서 build/DB tests는 실행하지 않았다(제품 변경 없음, 읽기 전용 원칙).

## 9. 추천 구현 순서 — 아직 구현하지 않음

1. **명칭과 navigation만 축소:** 상담·등록 → 체험 신청 관리 등. route/권한/기존 데이터 유지. Dashboard는 이미 후속 연락이 제거됐으므로 잔여 카피만 점검.
2. **등록 결과 독립 저장 설계·검증을 선행:** 기존 RPC/trigger/등록 알림/entitlement를 대체할 안전한 command 결정. 필요 DB 변경은 별도 최소안 승인. 상담 필드를 가짜값으로 만들어 우회하지 않음.
3. **Application Detail 체험 결과 정리:** 체험 기록·리포트·등록 결과·내부 메모 배치, 과거 상담은 기본 접힘 읽기 history. 신규/수정/재개 UI 제거 또는 재개를 실제 결과 재검토 정책으로 명시. 이 단계 이전에 상담 editor 삭제하지 않음.
4. **Cases에서 상담 업무 판정 제거:** next contact 우선순위/첫 상담 요구/연락 보조 표시와 상담 전용 batch query를 함께 축소. 상태/filter/폐기되지 않은 이력·담당 선생님 유지. 과거 URL 호환 유지.
5. **Dashboard/알림/분석 회귀 확인:** chart 추가 없이 현 체험/실제 등록 수치 유지, 등록 알림 producer 이전, legacy reviewing notification 보존. next_contact 소스 알림이 없다는 결론은 운영 자동화 확인으로 보강.
6. **legacy write retirement:** production UI caller뿐 아니라 server action/직접 RPC/column grant·운영 service-role 영향을 검토 후 차단. 데이터와 SELECT 유지. DB ACL 변경은 별도 승인/rollback 계획 필요.
7. **미사용 코드 정리:** interface/Supabase/mock/action/query/component/CSS/verifier를 import graph 확인 후 정리. legacy route는 삭제 대신 호환 정책을 먼저 결정.
8. **Pilot 이후 DB cleanup 여부 별도 판단:** 현 추천은 테이블·이력 보존. 사용량이 낮다는 이유만으로 이력 삭제/일괄 NULL 금지.

사용자가 제시한 Phase 순서와의 차이: **등록 결과 command 분리가 상담 카드 제거보다 먼저** 와야 한다. Dashboard 후속 연락은 이미 제거돼 있어 독립 구현 phase보다 회귀 확인으로 충분하다.

## 10. 조사 완료 상태 / 다음 세션 체크포인트

- 소스 기반 요청 영역 9/9 완료: Sidebar, Dashboard, Cases, 상세, Schedule, Classes, Settings, My Page, Notifications. legacy 두 route, DB/RPC/RLS/adapter, 분석·중복 필드·등록 결과·위험·단계 제안 포함.
- 미확인(E): 운영 DB 실 적용 catalog/ACL/데이터량, 외부 cron 및 직접 RPC/service-role 사용, 실제 계정의 작업 빈도·북마크. 이번에는 운영 시스템 접속/DB SQL 실행을 하지 않았다. 소스 근거와 운영 실재를 구분한다.
- 브라우저 UI·JWT/RLS E2E는 실행하지 않았다. 이번 결론은 소스 감사이며 운영 데이터 변경 테스트를 뜻하지 않는다.
- 마지막 확인: `ConsultationHistoryModal` 수정 CTA, `supabase-adapter` 상세 필수 consultation 조회/summary projection, `mock-adapter` transaction/cache 갱신, 구형 query의 caller 유무.
- 재개 시: 이 문서의 E 항목부터 시작한다. 이미 확인한 로컬 파일을 처음부터 다시 조사할 필요 없다. 구현을 시작하려면 독립 등록 결과 command와 legacy write 중단의 최소 변경안을 먼저 구체화한다.
- 최종 보존 검사: 아래 CP3에 기록.

### CP3 — 교차 확인 및 조사 파일 ledger

- 최종 교차 확인에서 `/studio/unregistered`의 실제 entitlement는 `canUseConversionAnalytics`임을 확인하고 표를 정정했다. 주석·문서보다 실행 코드를 우선했다.
- 상세 전화 버튼은 `page.tsx:393,544`의 `tel:` 링크이며 상담 저장 action을 호출하지 않는다. legacy pipeline 전화도 `tel:` 링크다. 클릭만으로 상담 완료로 기록하는 경로는 이 버튼에서 발견되지 않았다.
- 신규 체험 기록 저장은 `getStudioTrialResultSaveContext`라는 좁은 query를 사용한다. `getStudioApplicationDetail`의 상담 조회 결합과 구별한다. 기록 mutation 자체는 상담 이력을 먼저 저장할 필요가 없다.
- 조회한 core 파일 목록(중복 조사 방지를 위한 ledger):
  - 화면/route: `app/studio/(dashboard)/layout.tsx`, `page.tsx`, `cases/page.tsx`, `cases/loading.tsx`, `applications/page.tsx`, `applications/[id]/page.tsx`, `unregistered/page.tsx`, `schedule/page.tsx`, `classes/page.tsx`, `settings/page.tsx`, `mypage/page.tsx`, `mypage/profile/page.tsx`.
  - UI: `src/features/studio/ui/studio-shell.tsx`, `application-trial-result-workflow.tsx`, `consultation-history-modal.tsx`, `unregistered-students-manager.tsx`, `studio-application-table.tsx`, `regular-schedule-preference-editor.tsx`; schedule/class/settings/mypage/teacher UI의 상담 관련 검색 및 route import 확인. CSS는 상담 표시 class 존재를 확인했으며 변경하지 않았다.
  - action: `src/features/studio/actions/create-consultation-log.ts`, `update-consultation-log.ts`, `reopen-registration-consultation.ts`, `upsert-trial-result.ts`, `update-application-status.ts`.
  - query: `src/features/studio/queries/get-studio-cases.ts`, `get-consultation-pipeline-applications.ts`, `get-studio-applications.ts`, `get-studio-application-detail.ts`, `get-unregistered-applications.ts`, `get-studio-dashboard-summary.ts`, `get-studio-conversion-analytics.ts`, `get-studio-trial-result-save-context.ts`; `src/features/registration/queries/get-studio-registration-result.ts`.
  - selector/helper: `src/features/studio/lib/case-filters.ts`, `case-view-model.ts`, `case-list-presentation.ts`, `case-activity.ts`, `application-detail-workflow-state.ts`, `application-status-labels.ts`, `studio-detail-navigation.ts`, `studio-dashboard-view.ts`, `studio-dashboard-metrics.ts`, `studio-dashboard-analytics.ts`, `studio-conversion-analytics.ts`, `consultation-log-options.ts`, `regular-schedule-preference-input.ts`, `regular-schedule-preference.ts`, `trial-result-options.ts`, `trial-completion.ts`; `src/shared/lib/consultation-pipeline.ts`, `regular-price.ts`。
  - data: `src/shared/lib/db/adapter.ts`, `supabase-adapter.ts`, `mock-adapter.ts`의 상담·상세·summary·결과·cache 관련 부분. 별도 untracked `adapter 2.ts`는 활성 import가 확인되지 않은 복제 파일로 제품 계약의 근거로 사용하지 않았다.
  - notification/report/billing: `src/features/notifications/lib/parent-notifications.ts`, `queries/get-parent-notifications.ts`의 호출 검색, `reminders/run-trial-reminders.ts`, sms types/templates 및 상담 action의 발송 caller, alimtalk types/templates, `app/api/cron/trial-reminders/route.ts`, `vercel.json`; `src/features/reports/lib/experience-report-snapshot.ts`; billing entitlements/require-entitlement/subscription-presentation/subscription-actions 관련 부분.
  - migration: 5절에 열거한 SQL과 초기 consulting/outcome field, Parent insert hardening, report/feedback 관련 SQL의 상담 참조 검색. 실제 SQL 실행 없음.
- 미확인 범위는 10절 E 항목으로 한정. 후속 세션은 운영 실제 의존성 확인 또는 독립 등록 결과 설계부터 이어간다.
- 완료율: **요청된 저장소 소스 감사 100%**. 운영 DB/runtime/외부 자동화 검증은 별도 미확인으로 남기며 완료율에 포함하지 않는다.
- 보존 확인 PASS: 작업 전후 962개 기존 파일 및 환경변수 hash 동일. 추가/변경 파일은 이 감사 문서 한 개뿐. branch/HEAD/staged 동일. 제품 코드·기존 dirty/untracked 보존, commit/push/deploy/DB 실행 없음.
- `git diff --check` PASS. typecheck/lint/build는 문서-only audit이므로 실행하지 않음. 데이터 변경 verifier도 실행하지 않음.

## 11. Production Preflight — Phase 0 (2026-09-29)

### PF0. 기준 / 읽기 전용 체크포인트

- 새 `git fetch origin` 확인: origin/main `dd1e9921d6f53da0886ce8d27a66d09fa2afc212`; local HEAD `02060e7d2fe41e5dd7ac10f403029b5e8193869a`, branch `feat/studio-ux-phase1`. 기존 dirty/untracked 유지. 문서 존재 확인.
- Vercel Production `dpl_J7FxKAhRyKLFxkURczxLdU6ymVUx`, READY, `studio.firstsuup.com` alias와 gitSource SHA가 위 main과 일치.
- `.env.local`의 Production Supabase host는 `vfkfpekfwrjjocltqbty.supabase.co`. 환경변수 내용/키·비밀값은 보고하지 않고 원본 유지. linked DB에서 READ ONLY transaction 설정 `on` 확인.
- DB 조회는 `BEGIN ... READ ONLY; SELECT ...; ROLLBACK`만 사용. 사용자 이름/연락처/이메일/상담 메모 원문을 select하지 않음. 데이터 집계·catalog·정의 비교만 수행. 쓰기 RPC·알림 발송 없음.
- 소스 기준을 Production main으로 보강했다. 상담 create/update/reopen action, 상세 workflow, Cases query/selector, adapter의 핵심 파일은 로컬과 main이 일치. **알림 runner는 다름:** main에는 feedback reminder claim/complete 및 알림톡/SMS fallback이 있고 로컬에는 이전 구현이 있다. 해당 기능을 next_contact 알림으로 혼동하지 않음.

### PF1. Production 집계 체크포인트

관측: 2026-09-29 13:26:18 UTC(22:26:18 KST), REPEATABLE READ + READ ONLY 단일 snapshot. 전체 Production row 기준이며 실제 사용자/과거 데모를 임의 구분하지 않았다.

| 항목 | count |
|---|---:|
| trial_applications 전체 | 62 |
| registration_status undecided / pending / enrolled / not_enrolled | 44 / 2 / 12 / 4 |
| registration_status NULL / 예상 밖 값 | 0 / 0 |
| application status new / reviewing / confirmed / completed / canceled | 5 / 3 / 5 / 28 / 21 |
| registration_results 전체 / 현재 row / 결과 있는 신청 | 16 / 16 / 16 |
| 현재 결과 있으나 consultation_logs 없는 신청 | 6 |
| consultation_logs 있으나 현재 결과 없는 신청 | 6 |
| any 과거·현재 결과 기준 위 두 count | 각각 6 / 6 |
| current result와 신청 registration_status 불일치 | 0 |
| 최신 CONSULTATION 결과 snapshot과 신청 cache 불일치 | 0 |
| enrolled인데 enrolled_at NULL | 2 |
| not_enrolled인데 lost_at NULL | 1 |
| 현재 result의 resolved_at NULL | 3 |
| 현재 결과가 있는데 status != completed | 0 |
| terminal registration인데 status != completed | 0 |
| canceled 또는 no_show_at 있음 + enrolled | 0 |
| 현재 결과 중복 / terminal cache인데 current result 없음 | 0 / 0 |

상담 로그: 전체 21건, 신청 16건, CONSULTATION 10 + LEGACY_IMPORT 11. 로그가 있는 신청 기준 평균 1.3125/최대 4; 전체 신청 기준 평균 0.33871. created_at 기준 최근 30일 6건(모두 CONSULTATION), 최근 7일 0건. 마지막 생성 2026-09-04 15:10:01 UTC(9/5 00:10:01 KST). 따라서 최근 30일 사용 흔적은 있지만 최근 7일 신규 생성은 없음. 활성 기능이 더 이상 쓰이지 않는다고 단정할 근거는 아님.

next_contact_at: NULL 61, non-NULL 1. 서울 날짜 기준 과거 1/오늘 0/미래 0. 상담 log 없이 next_contact만 있는 신청 0. completed 또는 canceled 기준 1건이나, 실제 업무 종결(canceled/no-show 또는 등록 enrolled/not_enrolled) 기준은 **0건**. completed는 체험 완료일 뿐 등록 workflow 종결과 같지 않다. 최신 consultation next_contact와 cache 불일치 0.

확인완료: 실제 CHECK 값, 상담/등록 관련 function catalog와 MD5 비교. `create_studio_consultation`, `sync_registration_result`, `reject_registration_result_mutation`, `has_current_registration_result`의 Production 본문 MD5가 main migration 정의와 일치.
다음 확인: 실제 GRANT/RLS/view/trigger, 다른 write function 후보, Supabase cron/외부 자동화, Phase 1 최소 설계.

### PF2. 실제 저장 계약과 권한 — 확인완료

**분류는 C(여러 write 경로), B(독립 등록 저장 RPC)는 현재 없음.** 현재 정상 UI에서 신규 등록 결과를 확정하는 경로는 상담 action/RPC다. 그러나 DB 전체가 상담 RPC만으로 쓰이도록 봉쇄된 구조는 아니다.

1. `createConsultationLogAction` → `createStudioConsultationTransaction` → `public.create_studio_consultation`: 상담 log 생성과 함께 신청 registration_status, enrolled_at/lost_at, 미등록 사유, next_contact_at/last_activity_at, 희망 일정 current/snapshot을 갱신한다. application_logs도 같은 transaction에 쓴다.
2. `reopenRegistrationConsultationAction` → `updateStudioApplicationOutcome` → `studio_trial_applications` 직접 UPDATE: not_enrolled를 pending으로 되돌리는 별도 경로. 실제 결과 trigger가 기존 current result를 supersede한다. 등록 1차 확정 전용 RPC는 아니다.
3. 같은 조직 Studio authenticated는 `studio_trial_applications` view에서 registration_status/next_contact_at을 직접 UPDATE할 수 있다. 결과 trigger는 이 경로에서도 실행되지만, RPC의 completed/terminal guard·상담 log·SMS 발송을 강제하지 않는다.
4. service_role은 RLS bypass 및 대상 table write 권한이 있다. 수동 운영/외부 client의 실제 사용 유무는 catalog만으로 알 수 없다.
5. `set_studio_application_schedule`, `import_studio_trial_reservations`도 신청 table write 함수지만, Production 본문에는 registration_status/next_contact_at 직접 지정 및 dynamic EXECUTE가 없다. import 신규 row는 기존 default를 이용한다. 등록 결과 전용 대체 경로가 아니다. `publish_experience_report`의 registration_status 참조는 보고서 작업의 읽기 문맥이며 등록 상태 setter가 아니다.

**실제 값 계약:** native enum이 아니라 text + CHECK. 신청 registration_status=`undecided|pending|enrolled|not_enrolled`, NOT NULL, default undecided. registration_results.result=`enrolled|not_enrolled` 두 값만; `superseded_at IS NULL`인 신청당 current row unique. status=`new|reviewing|confirmed|completed|canceled`. no-show는 별도 status 값이 아니라 canceled/no_show_at 축이다.

| Production 함수 | SECURITY DEFINER | EXECUTE(실효) | write / side effect |
|---|---|---|---|
| create_studio_consultation(15 args) | 예 | authenticated/service_role/owner 허용, anon/PUBLIC 차단 | 신청·상담·application_logs write, 등록 trigger 간접 호출, next_contact 변경. 네트워크/알림 발송 없음 |
| sync_registration_result() | 예 | owner/service_role, anon/authenticated 차단 | trigger 전용. registration_results insert/supersede. next_contact/log/네트워크 write 없음 |
| reject_registration_result_mutation() | 아니오 | PUBLIC/anon/authenticated/service_role grant 존재 | trigger 반환형, 직접 일반 RPC로 실행 가능한 setter가 아님. immutable 검사, 외부 발송 없음 |
| has_current_registration_result(trial_applications) | 예 | authenticated/service_role/owner 허용, anon/PUBLIC 차단 | 조회 전용. 결과 존재 여부 판정 |

본문 MD5: create `45f548b9b1e110206b761330cf2e38bb`, sync `09f7b05970ccf2f8dcf869e9123a2f39`, immutable `751806957240847ffbd316e6b13310eb`, has_current `2307ca015b7020fa3f15f478ffa017ea`. Production catalog와 main SQL 정의가 일치한다. 실제 write RPC 호출로 검증하지 않았다.

| 표면 | authenticated GRANT | RLS/실효 경계 | 직접 write 결론 |
|---|---|---|---|
| trial_applications base | SELECT/INSERT/UPDATE/DELETE 없음 | RLS enabled, teacher org UPDATE policy는 있으나 base GRANT가 없음 | 직접 base registration/next_contact INSERT·UPDATE 불가 |
| studio_trial_applications view | SELECT/UPDATE 허용, INSERT/DELETE 없음 | updatable YES, view WHERE teacher + same org, CASCADED CHECK OPTION. security_invoker 옵션 없음 | 같은 조직 registration_status/next_contact UPDATE 가능. view 경계는 status terminal 전이를 제한하지 않음 |
| consultation_logs | SELECT/INSERT/DELETE grant, table-level UPDATE 없음; 아래 column UPDATE 허용 | SELECT/INSERT same-org teacher. INSERT created_by=self 또는 NULL. UPDATE는 same-org + activity_type CONSULTATION. DELETE policy 없음 | 제한된 INSERT/UPDATE 가능. 신규 UI/action 제거만으로 DB write는 멈추지 않음 |
| registration_results | 일반 table write grant 존재 | RLS enabled, authenticated same-org SELECT policy만 있음; INSERT/UPDATE/DELETE 정책 없음 | 일반 authenticated 직접 row write 불가. definer sync trigger를 통함 |

consultation_logs의 실제 UPDATE 허용 6개 컬럼: channel, sentiment, note, next_contact_at, regular_schedule_preference_snapshot, regular_schedule_preference_note_snapshot. registration_status_snapshot UPDATE는 불가. anon은 일부 table ACL이 넓어도 해당 row RLS 정책이 없어 조회/row write가 허용된 것으로 해석하면 안 된다. service_role은 rolbypassrls=true; anon/authenticated는 false다.

`app.current_role()`은 profiles.role의 academy/admin을 teacher로 정규화하고, `app.current_org_id()`는 auth.uid()의 organization을 읽는다. 직접 write 가능성은 **실제 GRANT + RLS + view definition의 결론**이며, 운영 INSERT/UPDATE/JWT mutation으로 시험하지 않았다. 이번 조사로 기존 등록 상태 전이가 DB 전 표면에서 fail-closed라고 보장할 수는 없다.

### PF3. 집계 해석과 anomaly 보강

- 현재 registration_results 16건은 전부 `origin=legacy_registration_status`. 상담 log가 없는 6건과 시각 NULL 3건도 이 legacy 결과에 속한다. 상담 없이 생성된 6건을 RPC 우회 사고라고 단정하지 않는다. 과거 상태 backfill과 부합한다.
- enrolled_at NULL 2건 + lost_at NULL 1건은 현재 result.resolved_at NULL 3건과 일치한다. **시각 누락 count 3**으로 보고하며 임의로 now/created_at을 채우지 않는다.
- result timestamp와 신청 결과 timestamp의 불일치 0. current result와 cache 불일치 0. current result와 최신 non-NULL 상담 결과 snapshot 불일치 0.
- 최신 CONSULTATION이 있는 신청은 6건: snapshot 비교 가능 5, snapshot NULL 1. “최신 상담 cache 불일치 0”은 **비교 가능한 5건 기준**이며 NULL 1건까지 일치 증거로 포함하지 않는다. 최신 occurred_at 동률 신청 0. 최신 상담 next_contact와 신청 cache 불일치 0.
- 상담이 있으나 결과가 없는 6건은 미결정 흐름일 수 있어 그 자체로 anomaly가 아니다. 결과 이력과 상담을 필수 1:1로 강제하면 기존 6건/6건 호환이 깨진다.
- next_contact non-NULL 1건은 completed + undecided이며 과거 서울 날짜다. 체험 완료를 business terminal로 잘못 취급해 NULL로 만들면 현재 후속 업무 데이터가 삭제된다. 취소/no-show/등록 종결에서 next_contact가 남은 경우는 0건.
- 자동 수정 대상은 없음. counts는 특정 시점의 전체 DB 수치이며 사용자 활동으로 이후 달라질 수 있다.

### PF4. next_contact_at 전체 read/write 경로

| 경로 | 실제 Production main 함수/파일 | 용도 / 결합 |
|---|---|---|
| write: 상담 생성 | create-consultation-log.ts → createStudioConsultationTransaction → create_studio_consultation | 입력을 KST datetime으로 정규화. enrolled/not_enrolled이면 action이 NULL 전달. RPC는 받은 값을 신청 cache와 상담 snapshot에 함께 씀 |
| write: 상담 수정 | update-consultation-log.ts → updateStudioConsultationLog → (최신일 때) updateStudioApplicationLatestConsultationSnapshot | log와 신청 cache를 별도 UPDATE. 과거 log 수정은 current cache 유지 |
| write: 구형 adapter | updateStudioApplicationConsultationSnapshot / createStudioConsultationLog | interface/mock/Supabase 구현 존재, 현재 app/src production caller 없음. verifier caller와 구별 |
| write: 직접 view/table | studio_trial_applications UPDATE, consultation_logs 허용 column UPDATE | 동일 조직에서 가능. UI/RPC 폐기만으로 차단되지 않음 |
| trigger | 실제 연결 trigger: updated_at, 일정 잠금, registration result sync/immutable | next_contact를 자동 계산/발송하는 trigger 없음 |
| webhook/cron/admin | origin/main app/api, features/admin, notifications 전체 검색 | 해당 필드/상담 table caller 없음. 외부 미관리 client는 미확인 |
| read: Cases | getStudioCases → case-view-model → consultation-pipeline → case-list-presentation | row의 다음 행동/지연·오늘·예정·미정 표시. closed row는 연락 표시 숨김 |
| read: 상세 | getStudioApplicationDetail → workflow-state / workflow / history | 다음 연락 및 권장 CTA, 당시 log 예정일 |
| read: legacy queue | getConsultationPipelineApplications → listStudioConsultationPipelineApplications → sortConsultationPipelineItems | 연락 그룹/next_contact 오름차순 및 last_activity fallback |
| Dashboard | getStudioApplications summary → dashboard-view/metrics | next_contact/log 미조회. 연락 위젯 없음 |
| analytics / SMS / 알림톡 / email / 웹 알림 | 실제 main caller 검색 및 DB function/trigger catalog | next_contact를 기준으로 발송/집계하는 경로 발견 없음. 실제 등록 결과 분석 및 아래 등록 SMS는 별개 |

신규 next_contact write만 중단하면 기존 과거 1건의 “연락 지연”은 계속 남는다. 이후 NULL 값의 completed 신청에는 “다음 연락 미정”, 상담 log가 없으면 “첫 상담 기록”이 만들어진다. DB 오류보다 **잘못된 업무 유도**가 우선 위험이다. legacy current값을 보존한 채 selector를 먼저 축소해야 한다.

### PF5. 등록 알림 / history / 외부 자동화

**등록 알림은 DB 결과 변경 자체(A)나 log INSERT(C) trigger가 아니다. 상담 RPC 성공을 받은 server action(B 연계)의 후처리다.** application lifecycle status 변경(D) action도 trial_enrolled의 발송 주체가 아니다.

- main `create-consultation-log.ts:286–299`: result.mode=created AND enrollmentTransition → 상세 재조회 → `logSmsEventSafely(eventType=trial_enrolled)` → SMS sender/provider와 sms_logs. duplicate이면 재발송하지 않음. 실패는 핵심 저장 rollback으로 연결되지 않음.
- **현재 등록 알림은 SMS 경로**다. main alimtalk event 목록에는 trial_enrolled가 없다. Parent 웹 notification kind에도 등록 결과 전용 event 없음. 새 등록 RPC만 호출하면 기존 SMS가 자동 발생하지 않으므로 새 action으로 옮겨야 한다.
- Production sms_logs에서 trial_enrolled 전체 5, sent 2, dry_run 3, failed 0, 최근 30일 생성 0. 수신자/본문/전화번호는 select하지 않음.
- SQL 함수 본문에 네트워크/pg_notify side effect 없음. 관련 4개 table/view의 실제 trigger는 일정 잠금/updated_at/registration sync/immutable만 존재. 전체 사용자 trigger의 http/webhook/pg_notify 패턴 count도 0. catalog 검사 범위를 넘어 외부 provider automation 부재를 단정하지 않음.
- history는 두 갈래: 상담 RPC의 application_logs(상태가 같아도 등록 결과 변경 이벤트)와 registration_results trigger 이력. 독립 등록 action은 둘을 보존해야 하며 Parent 알림 selector의 `from_status == to_status` 제외 규칙도 유지한다.

**실제 Vercel Production cron 확인:** project API의 crons.deploymentId가 위 READY 배포와 일치, disabledAt=null, 아래 4개 등록됨(UTC).

| path | schedule | 상담/next_contact 의존 |
|---|---|---|
| /api/cron/rolling-schedules | `15 15 * * *` | 없음 |
| /api/cron/trial-reminders | `0 1 * * *` | confirmed_slot_at 전일 알림 및 별도 피드백 reminder. next_contact 없음 |
| /api/cron/billing-renewals | `0 3 * * *` | 없음 |
| /api/cron/billing-reconciliation | `30 2 * * *` | 없음 |

Production DB `cron.job` 없음, pg_cron/pg_net/http 확장 없음. 따라서 이 DB의 pg_cron 기반 “다음 연락 예정” 자동화는 존재하지 않는다. Supabase 외부 Edge Function 호출, 외부 SaaS/운영 PC scheduler, 수동 service-role 사용은 별도 계정·실행 로그를 보지 않아 **미확인**. Vercel cron은 등록 상태만 확인했으며 실제 실행 성공/발송 여부를 테스트하지 않았다.

### PF6. Cases / 상세 재확인

| 속성 | Cases 사용 위치 | 필터·정렬·담당자 의미 |
|---|---|---|
| next_contact_at | 다음 행동 + 연락 기한 row 보조 문구 | Cases DB filter/order 기준 아님. legacy unregistered queue에서는 grouping/sort 기준 |
| consultation count | query/DTO에 보존 | 현재 Cases row에 별도 건수 column/필터 없음 |
| last consultation | 최근 기록 날짜 후보, history 여부 판정 | 상담이 최근일 경우 `상담 기록` 표시. row 정렬은 active created_at desc, closed completed_at desc 뒤 created_at desc |
| follow-up state | getCaseAttentionState/getCaseNextAction | 연락 기한이 체험 기록 미작성보다 앞설 수 있음. 독립 버튼보다 전체 row 상세 링크의 행동 안내 |
| assignee | assigned_teacher_id → teachers.display_name | Cases 담당자는 배정 선생님이다. 마지막 상담 작성자 filter는 legacy unregistered의 별도 개념 |

상세에는 **외관상 별도 `학원 등록 결과` 카드**가 있으나 버튼은 동일 `openConsultationEditor`로 들어간다. 그 modal의 한 제출은 channel/sentiment/note + registrationStatus/미등록 사유 + nextContactAt을 함께 처리한다. 따라서 입력 위치 이동만으로는 분리가 끝나지 않는다. 새 action/RPC가 선행돼야 한다. 체험 기록/리포트 완료·ParentDecision 제출은 실제 결과 입력의 필수 조건으로 추가하지 않는다.

### PF7. Phase 1 최소 설계 (제안만, 구현 없음)

**새 table/column/native enum 변경 없이 가능하다. 그러나 새 RPC 정의와 EXECUTE 권한은 DB DDL이므로 migration이 필요하다. “schema 필드 추가 없음”을 “Production migration 없음”이라고 보고하면 안 된다.** 이번에는 migration 파일도 만들지 않았다.

**A. 독립 RPC/action**

- 예시 이름 `set_studio_registration_result` / `saveStudioRegistrationResultAction`(미생성). 새 form은 enrolled/not_enrolled 확정값과 기존 미등록 사유·선택적 기타 설명만 전달. undecided/pending은 기존 미결정 상태로 보존; 기존 CHECK 값/등록 결과 의미 변경 없음.
- RPC는 auth.uid()의 academy/admin + 같은 organization을 내부에서 검사한다. organization/actor를 client 신뢰값으로 받지 않는다. SELECT ... FOR UPDATE로 신청을 잠그고 completed + no_show_at 없음, canceled 아님을 검사한다.
- 미결정(undecided/pending)에서만 최초 결과 확정. 이미 같은 결과·동일 의미 payload가 저장된 재시도는 기존 current result를 반환하며 새 history/알림 없음. 다른 결과/사유로 terminal 값을 덮어쓰는 요청은 conflict. legacy 시각 NULL은 읽기 호환하고 재제출로 임의 보정하지 않는다. 기존 결과를 자동으로 다시 열지 않는다.
- 신청 registration_status/결과 시각/미등록 사유를 갱신하고 기존 sync_registration_result trigger가 실제 결과를 생성하도록 한다. application_logs는 같은 transaction에서 별도 등록 결과 이벤트를 남긴다. 상담 logs insert/update와 ParentDecision write는 하지 않는다.
- terminal 확정 시 next_contact_at NULL은 현 상담 action의 종결 의미를 따를 수 있다. 전역 NULL cleanup은 하지 않으며 last_activity_at을 새 등록 이벤트 시각으로 갱신할지 명시적으로 정한다. 단순히 과거 상담 발생 시각으로 조작하지 않는다.
- 재시도/동시 10건 검증은 기존 current result unique + row lock + terminal guard로 설계할 수 있다. 새 멱등 table은 필수 아님. 성공 응답의 result ID를 안정적인 근거로 사용한다.
- action은 entitlement와 org guard를 유지하고 RPC 성공 후 최초 enrolled 전환에 한해 현 SMS safe wrapper를 호출한다. 알림톡 새 template 추가는 범위 아님. 현 방식은 best-effort 후처리이며 DB commit과 알림의 exactly-once 전달을 보장한다고 주장하지 않는다. 새 outbox 설계는 최소 분리 범위 밖이다.

**B. 상세 입력 위치/연결 분리**

- 현재 등록 결과 카드 버튼을 독립 form/action에 연결. 상담 방식/반응/메모/다음 연락은 등록 필수 입력에서 제외. 기록·리포트·ParentDecision과 독립 저장, 오류 시 입력 보존, 성공 후 current result 재조회. 새 디자인 확대 없음.

**C. 상담 form 및 기존 write 경로 조정**

- 상담 form에서 등록 결과 입력을 제거할 때 RPC의 p_registration_status write도 함께 중단해야 한다. UI만 제거하면 old client/직접 RPC가 계속 결과를 쓴다.
- 호환 전환안: 현 RPC signature를 잠시 유지하되 신청 현재값과 다른 등록 결과 변경은 거절하고, 상담 snapshot에는 현재 결과를 읽어 담는다. 실제 적용 시 terminal 상담 정책·기존 editor·재개 action까지 재검증해야 한다. 곧 상담 신규 쓰기를 폐기할 경우 단계가 중복되지 않도록 배포 순서를 결정한다.
- **직접 view UPDATE 우회가 남음:** DB 모든 표면에 terminal guard를 보장하려면 table-level view UPDATE와 column grant를 별도 검토해야 한다. column REVOKE만 해도 table UPDATE가 남으면 효과가 없다. 필요한 다른 신청 상태·일정·배정 수정 권한을 보존하는 column allowlist 또는 좁은 RPC 계약으로 설계한다. 재개 action도 이 경로를 쓰므로 묵시적으로 고장내지 않는다. 이 권한 정리는 기존 사용 경로 영향 분석 후 승인할 항목이다.
- 최소 Phase 1이 새 RPC/action 추가까지만이라면 “새 command는 안전하지만 기존 write 우회가 남는다”는 제한을 명시한다. 전체 상담 강등 완료로 선언하지 않는다.

**D. regression (후속 구현 시 수행)**

- 완료/미완료/취소/no-show, 같은 조직/타 조직/Parent/anon, enrolled/not_enrolled 및 미결정 상태 보존.
- 동시 10건·중복 재시도·상반된 결과 충돌, RPC 중간 실패 rollback, current result unique/history, 미등록 사유, NULL legacy 시각 3건·상담 없는 결과 6건 호환.
- 상담 log 수 불변, ParentDecision/리포트/내부 메모 불변, application_logs 이벤트 의미, 등록 SMS 최초 전환만/실패 비차단.
- Cases row·closed 판정·Dashboard 기존 등록 숫자, stale next_contact 및 상담 요구 selector, 기존 direct view/reopen 정책.
- Local Supabase JWT/RLS 검증 + typecheck/lint/build/관련 verifier. Production mutation으로 테스트하지 않는다.

**E. migration/배포 순서**

- additive RPC + 명시적 PUBLIC/anon EXECUTE revoke 및 authenticated grant → 별도 검증 → UI/action 연결 → 구형 상담 등록 writer·직접 view 권한 전환은 호환성 확인 후 별도 적용. 기존 데이터 backfill/삭제/새 컬럼은 최소안에 포함하지 않음.
- rollback은 새 UI caller를 되돌릴 수 있는 전환 창을 유지하고 구형 writer 폐쇄와 함께 계획한다. 새 RPC만 먼저 지우면 배포된 client가 실패한다. 기존 정상 결과/이력은 rollback 명목으로 삭제하지 않는다.
- 이번 단계에서는 위 변경을 생성·적용하지 않았다. Phase 1 구현 승인은 별도다.

### PF8. 완료 / 미확인 / 보존

- Production count·constraint·function body 동일성·EXECUTE·GRANT·RLS·view·trigger·cron catalog 확인완료. origin/main/실제 Production 배포·Vercel cron 기준 확인완료.
- 미확인: 외부 운영자/service-role/독립 SaaS 자동화 호출 로그, 실제 사용자 계정으로 하는 mutation 동작, cron 실행 성공 이력. 권한 가능성은 catalog 해석이며 write 호출로 확인한 것이 아니다.
- 제품 코드, 환경변수, Storage, DB 업무 데이터 변경 없음. 실제 상태/상담/등록/알림 변경, migration 생성·적용, commit/push/deploy 없음. 문서 하단 Production Preflight만 추가.
- 작업 전후 963개 파일 fingerprint 비교: 이 감사 문서만 변경. branch/HEAD/staged/status(230줄) 동일. `.env.example`, `.env.local`, `.env.local.save`, `.env.production-secrets.local` 해시 동일. 기존 dirty/untracked 및 실제 계정 연결 환경 보존.
- `git diff --check` PASS. 코드 변경이 없는 READ-ONLY 감사이므로 typecheck/lint/build 및 mutation verifier는 실행하지 않았다. localhost:3000 프로세스·환경은 변경하지 않았다.


## 12. Workflow Simplification Phase 1 — 로컬 구현 (2026-09-30)

이 절은 위 PF7 제안 중 **등록 결과 terminal 잠금** 및 **등록 시 next_contact_at 초기화**를 대체한다. 사용자 확정 정책대로 등록 결과는 계속 변경 가능하며 등록 command는 상담/다음 연락일을 쓰지 않는다. Production에는 적용하지 않았다.

### 구현 계약

| 영역 | 최종 계약 |
|---|---|
| 체험 기록 | 작성 중 값은 client state. `finalize_studio_trial_result`가 최초 INSERT만 허용. 기존 application_id unique + 신청 row lock. 이미 row가 있으면 `trial_result_already_finalized`. 일반 Studio INSERT/UPDATE/DELETE 권한 제거, UPDATE/DELETE trigger로 삭제 후 재작성도 차단. 저장된 기존 기록을 수정·변환하는 backfill 없음. |
| 학부모 리포트 | 기존 `publish_experience_report`의 Parent-safe snapshot builder를 재사용. 같은 신청의 **어떤 발행 이력이라도** 있으면 `report_already_sent`. row lock + INSERT/UPDATE/DELETE trigger 방어. UI에는 발송 완료·시각·리포트 보기만 남음. 기존 운영 안전 철회 RPC는 유지하지만 철회 후에도 재발행 불가. |
| 등록 결과 | `set_studio_registration_result` → `saveStudioRegistrationResultAction` → `RegistrationResultEditor`. undecided/pending/enrolled/not_enrolled 유지. 완료·non-no-show 신청에서 네 상태 사이 변경 가능, not_enrolled → enrolled 포함. 체험 기록/리포트/ParentDecision 완료를 선행조건으로 삼지 않음. |
| 이유 / 메모 | pending 8개, not_enrolled 9개 고정 taxonomy; 표시 문구와 ID 분리, 복수 선택. 선택적 note 최대 2,000자. 다른 상태의 reason 거부. undecided/enrolled에는 active reasons=[]; 상태 변경 전후 이유/메모는 내부 event에 보존. 기존 단일 legacy reason 컬럼은 임의 매핑/삭제하지 않음. |
| 최초 enrolled SMS | 신청 lock 아래 기존 registration_results의 전체 enrolled 이력을 확인해 최초 전환 1건만 `enrollmentTransition=true`. action 성공 후 기존 `logSmsEventSafely` 호출. 같은 상태 재저장 및 enrolled → 다른 상태 → enrolled는 추가 발송 없음. 네트워크 전달 보장은 기존 best-effort 그대로이며 새 outbox는 만들지 않음. |
| 연락·상담 | 기존 JSONB regular_schedule_preference 및 상담 snapshot 재사용. `record_studio_contact`는 상담·희망 일정·next_contact snapshot만 저장. 등록 입력 인자를 RPC에서 제거하고 구형 결합 RPC의 authenticated EXECUTE 폐쇄. 등록 종결 후에도 실제 연락을 보조 기록할 수 있음. |
| 희망 요일·시간 | ISO 1=월…7=일, KST HH:mm. 기존 요일 버튼·30분 간격 07:00–23:30 select 재사용. 최대 3개 조건 그룹, 각 그룹 복수 요일 지원. 같은 요일의 여러 range도 지원. 기존 range/after/before/any 모델 유지. DB에서 잘못된 요일/시간/end<=start 차단. |
| 시간 유연성 | consultation_logs.time_flexibility: exact / plus_minus_30 / same_day_flexible / flexible, nullable. 기존 희망 일정 보충 메모 재사용. 기존 로그의 NULL 값은 정상 조회하며 자동 변환 없음. |
| next_contact_at | 등록 command는 읽기·쓰기에 포함하지 않음. 연락 기록의 기존 UI와 write 계약 유지, 신규 기록에서 입력을 건드리지 않으면 기존 값을 보존. Phase 2 Cases 설계는 미실행. |
| 권한 | 내부 helper가 auth.uid() → profiles role(academy/admin)·organization과 실제 신청 class 소유권 확인 후 row lock. Parent/anon/타 조직 거부. 기존 Studio view의 등록 컬럼 UPDATE 우회는 제거하고 다른 컬럼 UPDATE는 보존. |
| 이력 보안 | application_logs는 Parent SELECT 정책이 있으므로 새 등록의 상세 before/after event만 is_internal=true. 해당 row를 Parent RLS에서 제외. 기존 상태 이벤트/알림 조회는 유지. 새 등록 사유·메모 컬럼은 Parent base projection/GRANT에 추가하지 않음. |

### 화면 / 기존 작업 보존

- 기본 신청 정보·일정과 기존 상세 레이아웃을 유지. 핵심 카드 `체험 결과 정리` 안에 체험 기록 → 학부모 리포트 → 독립 등록 결과 순서.
- 진행 단계에서 Parent 응답을 필수 단계로 취급하지 않는다. ParentDecision은 기존 별도 참고 패널 유지.
- `연락·상담 기록`은 핵심 카드 밖 보조 영역. `+ 기록 추가`, 이력, 희망 일정·시간 유연성 표시.
- 제출 실패 후 기록·등록·상담의 controlled draft 유지. 동일 버튼 처리 중 중복 클릭 방지.
- Parent 페이지, Cases/Dashboard 구현·analytics, Feedback/ParentDecision/알림톡 구현은 이번 작업에서 수정하지 않음.
- 레코드가 존재하면 기존 legacy 기록도 잠금. 과거 비표준 관찰 문구는 자동 변환하지 않으며 기존 publication validator를 통과하지 못하는 legacy 기록은 자동 발행하지 않는다. 운영 보정 도구는 이번 범위 밖.

### Migration / 적용 경계

파일: `supabase/migrations/20260930100000_studio_experience_workflow_phase1.sql`.

- additive 컬럼 4개: trial_applications.registration_reason_ids / registration_note, consultation_logs.time_flexibility, application_logs.is_internal.
- 새 table, native enum 변경, 기존 row UPDATE/DELETE/backfill 없음. record/report는 기존 row·snapshot·이력으로 최초 여부를 판정.
- 새 RPC/helper, 제약 trigger, 기존 publish RPC guard, column 권한 및 Parent event RLS 변경이 있으므로 이후 Production 릴리스에는 이 migration이 필요하다.
- 로컬 Supabase 컨테이너 `supabase_db_first-class-mvp`에만 적용. 실제 JWT/RLS 검증 완료. 별도 빈 스키마 복제 DB에서 **전체 파일을 단일 transaction으로 적용**하는 rehearsal도 PASS했고 복제 DB는 제거했다.
- `.env*`는 변경하지 않음. localhost 실행 프로세스에만 loopback Supabase와 SMS/알림톡 비활성 환경을 전달. Local TEST fixtures만 생성했고 실제 운영 데이터로 저장/발송하지 않음.
- 향후 승인된 배포 순서: DB 계약 → 대응 app 코드. 구버전 앱은 구형 상담 RPC·기록 upsert를 사용하므로 기존 client와 무중단 양방향 호환이라고 주장하지 않는다. 승인 전 Production 적용 금지.
- rollback 시 새 데이터/확정 기록을 삭제해서 되돌리지 않는다. 먼저 쓰기 중단 후 원래 SQL 정의와 ACL을 재검토하여 command/UI를 함께 복구해야 한다. 이유·내부 event 컬럼을 DROP하면 새 이력이 사라지므로 보존하며, 일회 확정 정책을 되돌리는 것은 별도 제품 승인 사항이다.

### 검증

- Local Auth JWT + PostgREST/RLS **58개 PASS** (`scripts/verify-studio-workflow-phase1-db.cjs`).
- 기록 finalize 동시 10회 → 성공 1, row/event 각각 1. report send 동시 10회 → 성공 1, snapshot 1.
- enrolled 동시 10회 → 최초 전환 flag/event/result 각각 1. 연락 동일 submission 10회 → created 1, duplicate 9.
- 후반부 application_logs 실패를 주입해 등록 result/기록 INSERT 전체 rollback 확인.
- Parent/anon/타 조직, new/canceled/no-show 차단. 직접 view 등록 변경, 기록 수정/삭제, 리포트 수정/삭제, 구형 결합 RPC 차단.
- 기존 안전 철회 유지 + 철회 후 재발행 차단. Parent 직접 API로 새 등록 note/내부 event 조회 차단.
- 실제 localhost browser **14개 PASS** (`scripts/verify-studio-workflow-phase1-browser.cjs`). 작성 중 서버 저장 없음, 독립 저장, 잠금, 오류 후 모든 draft 유지, 실제 dry-run SMS 1회, legacy 조회, Parent HTML/RSC private field 부재, 1440/1024/390px 가로 넘침 없음, 키보드 선택/focus, Cases/Dashboard smoke·pageerror 0.
- migration rehearsal PASS (`scripts/verify-studio-workflow-phase1-migration.cjs`).
- 기존 관련 verifier 10개: registration-result, experience-report-publication, trial-result-observations, application-detail-workflow-v2, studio-cases-v1, studio-dashboard-phase11, parent-report-detail, regular-schedule-preference, consultation-preference-write, organization-entitlements PASS.
- 과거 재발행·mutable upsert·상담 우선 CTA를 전제로 한 assertion은 현재 정책으로 갱신. 구형 `verify-consultation-atomicity.ts`는 retired RPC를 전제로 하므로 실행하지 않음; 원본은 보존하고 위 새 JWT verifier가 분리 command의 rollback·동시성·권한을 검증한다.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` PASS. build와 localhost는 로컬 DB 환경을 프로세스에만 전달하여 실행했다.

### localhost 검수 fixture

DB verifier는 다른 작업의 /tmp fixture에 의존하지 않고 전용 TEST 조직·Auth 계정을 직접 준비한다. Local TEST Studio 로그인 상태로 열어 둔다. 운영 계정이 아닌 로컬 Auth 계정이며 세션/비밀번호는 저장소에 넣지 않는다. 검수용 private fixture manifest: `/tmp/studio-workflow-phase1/fixtures.json` (0600). 스크린샷과 검증 결과도 같은 디렉터리.

- A. 완료 / 기록 미작성: http://localhost:3000/studio/applications/68f4866c-25cf-4b6b-bcf6-a423624367d5
- B. 기록 작성 시작: A 화면의 `체험 기록 작성` 버튼으로 진입 (작성 중에는 서버 저장 없음). 자동 검증의 B fixture는 확정까지 검사하므로 작성 중 상태 캡처는 `B-draft.png` 참조.
- C/D. 기록 확정 / 리포트 미발송: http://localhost:3000/studio/applications/8e9b7eb5-ea32-46c0-ae3f-58ce27ffbdaf
- E. 리포트 발송 완료: http://localhost:3000/studio/applications/e551cb3b-d689-4d1b-8513-23433abee6d5
- F. 고민 중 + 이유: http://localhost:3000/studio/applications/f682ba96-1cd6-43ad-9f11-7932c143a2b8
- G. 미등록 + 이유: http://localhost:3000/studio/applications/851aa258-7970-4fa6-a0dc-e4390b2e1e8a
- H. 등록 완료: http://localhost:3000/studio/applications/8bf9c0be-306e-42ee-95bf-f0b8857a06f1
- J. 화·목 희망 시간 + 유연성: http://localhost:3000/studio/applications/a100f908-d705-4c41-b2d9-c490900ece13
- K. legacy 연락 기록: http://localhost:3000/studio/applications/5ce01b2b-8f69-4ece-9566-e8eb16a0361b

I. 연락 기록 추가는 각 완료 fixture의 `+ 기록 추가`. B의 작성 중 draft와 J의 복수 시간 입력 캡처는 `B-draft.png`, `I-J-contact-draft.png`.

### 최종 변경 / 보존 기록

작업 시작 전 snapshot(963개 파일)과 비교해 이번 작업 범위의 24개 파일만 변경/추가했다. 기존 파일 17개, 신규 파일 7개이며 해당 파일 안의 기존 미커밋 변경은 보존했다. 그 외 원본 파일은 fingerprint가 동일하다.

```text
app/studio/(dashboard)/applications/[id]/page.tsx
docs/studio-consultation-deprecation-audit.md
scripts/verify-application-detail-workflow-v2.ts
scripts/verify-experience-report-publication.ts
scripts/verify-studio-workflow-phase1-browser.cjs
scripts/verify-studio-workflow-phase1-db.cjs
scripts/verify-studio-workflow-phase1-migration.cjs
scripts/verify-trial-result-observations.ts
src/features/registration/actions/save-registration-result.ts
src/features/registration/lib/registration-input.ts
src/features/studio/actions/create-consultation-log.ts
src/features/studio/actions/publish-experience-report.ts
src/features/studio/actions/reopen-registration-consultation.ts
src/features/studio/actions/upsert-trial-result.ts
src/features/studio/lib/application-detail-workflow-state.ts
src/features/studio/ui/application-report-publishing.tsx
src/features/studio/ui/application-trial-result-workflow.module.css
src/features/studio/ui/application-trial-result-workflow.tsx
src/features/studio/ui/consultation-history-modal.tsx
src/features/studio/ui/registration-result-editor.tsx
src/shared/lib/db/adapter.ts
src/shared/lib/db/mock-adapter.ts
src/shared/lib/db/supabase-adapter.ts
supabase/migrations/20260930100000_studio_experience_workflow_phase1.sql
```

- 작업 전후 branch `feat/studio-ux-phase1`, HEAD `02060e7d2fe41e5dd7ac10f403029b5e8193869a`, staged 상태 동일. 기존 dirty/untracked를 정리하지 않았다.
- `.env.example`, `.env.local`, `.env.local.save`, `.env.production-secrets.local` fingerprint 동일. localhost:3000만 Local Supabase TEST 세션으로 유지한다. 실제 운영 계정 연결 파일은 변경하지 않았다.
- Production DB/Storage write, Production migration, commit/stage/push/main 변경/배포 없음.
- 로컬 검수 창에 등록 이유, 발송 완료, 구조화 연락 기록, 기록 작성 화면을 열어 두었다. 추가 상태의 직접 링크는 위 fixture 목록 참조.
- 작업 전 백업: `/tmp/studio-workflow-phase1-1790754535/`; 검증 결과·스크린샷·최종 fingerprint 비교: `/tmp/studio-workflow-phase1/`. 인증 자료는 private 로컬 파일이며 저장소에 포함하지 않았다.

## 13. 실제 계정 QA 전환 — 최신 상태 (2026-09-30)

상세 기준은 [Phase 1A/1B 전환 기록](./studio-workflow-phase1-rollout.md)이다. 위 12절의 통합 migration은 byte-identical archive로 보관하고 canonical 확장/잠금 SQL로 분리했다. Production에는 backward-compatible `20260930110000` 확장만 적용됐으며 `20260930111000` 잠금은 미적용이다. Local DB history는 원본 이력 백업·최종 함수 동등성 확인 후 1A/1B로 전환했다.

운영 스키마에서 기존 미등록 사유 CHECK 충돌을 재현하여 새 등록 RPC에 최소 보정을 포함했다. not_enrolled 밖으로 전환할 때 active legacy 사유는 비우고 원문은 같은 transaction의 내부 before 이력에 보존한다. 기존 업무 row backfill·자동 변환은 없다. 따라서 12절의 “legacy 단일 컬럼은 항상 그대로 둔다”보다 이 실제 CHECK 호환 정책이 우선한다.

현재 localhost:3000은 `.env*` 수정 없이 원래 Production Supabase/Auth 설정으로 실행된다. 실제 계정 READ UI QA만 허용하며 확정·발송·등록 저장·상담 저장은 별도 승인 전 수행하지 않는다. 앱 commit/push/deploy는 없고 기존 Production 앱 SHA도 유지됐다.
