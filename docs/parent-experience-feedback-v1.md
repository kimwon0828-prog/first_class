# Parent Experience Feedback V1 — 로컬 구현 및 검수

> 현재 화면·열람/알림 정책은 [Report-first 최종 흐름](parent-report-feedback-flow.md)을 따른다. 아래 문서는 해당 단계의 구현 이력이다. 신규 적용에는 0930 migration까지 필요하다.

> **정책 변경 (2026-09-29):** 현재 구현은 [최종 1회 제출 정책](parent-experience-feedback-final-submission.md)을 따른다. 아래 문서는 최초 mutable V1 구현/검증 이력이다. upsert·수정·독립 제출 설명과 예전 verifier 기대값은 현재 사용자 제출 정책에 적용하지 않는다. Migration은 0900 → 0910 → **0920**까지 함께 검토한다.

2026-09-29. 시작 시 실제 fetch한 origin/main: `4e03f1cd0ee6f9ec8fe88368ce50c969f0ebbd4e`.
Production migration/data write, commit, push, PR, main 변경은 하지 않았다.

**1. 신청 생성 권한과 선행 보강**

기존 Parent INSERT 정책은 본인 parent_id와 역할만 검사하고 초기 상태를 제한하지 않았다. 정상 adapter payload의 열만 INSERT 가능하게 제한하고, RLS에서 `new`, 운영 시각 NULL, `registration_status='undecided'`, 운영 기록 초기값을 강제한다. 선배정 수업은 실제 class.teacher_id를 허용하고 후배정 수업은 NULL만 허용한다. 연결된 자녀가 있으면 본인 소유여야 한다. 정상 payload에는 id, parent/class/child, 선배정 담당자, 학생·보호자 snapshot, 희망 일정, 문의사항 등이 포함된다. confirmed/completed/canceled 시각, 상담·등록 결과, import batch, 생성/수정 시각의 직접 주입은 막는다.

실제 로컬 점검에서 추가 우회를 확인했다. 기존 profiles 자기 수정 정책으로 Parent가 자신의 role을 academy로, organization_id를 임의 학원으로 바꿀 수 있었다(트랜잭션 안에서 재현 후 rollback). 이를 허용하면 신청 INSERT 제한과 조직별 피드백 RLS를 모두 우회할 수 있다. 같은 선행 migration의 invoker trigger가 authenticated/anon의 id·role·organization_id 변경만 거부한다. 이름·연락처·생년월일 수정은 유지한다. service role 및 기존 승인용 SECURITY DEFINER RPC는 유지한다. Studio가 자기 소속을 다른 학원으로 바꾸는 우회도 차단한다.

**2. 데이터 계약**

`experience_feedback`: UUID id, application_id UNIQUE, parent_id/class_id/organization_id/program_type snapshot, selected_chip_ids text[], private_note, created_at, updated_at. 별점·별도 selection table·version history 없음.

- 0~5개, 중복/NULL element/알 수 없는 ID/다차원 배열 금지.
- 의견은 trim 후 NULL 또는 최대 1000자. Unicode 공백도 정규화한다.
- 칩 또는 의견 중 하나는 있어야 한다. 의견만 제출해도 저장하고 Studio에서 읽을 수 있다.
- 수정은 선택 배열과 의견을 교체한다. snapshot 및 created_at은 trigger로 불변.
- 신청/학부모 삭제 시 피드백은 CASCADE. 기존 신청의 RESTRICT 등 기존 계정 삭제 계약은 바꾸지 않았다. 전체 계정 탈퇴 기능을 새로 구현한 것은 아니다.

**3. RPC 및 자격**

| 함수 | 권한 | 반환 |
|---|---|---|
| get_parent_experience_feedback_context(uuid) | authenticated Parent 본인 | 자격 boolean, programType, 본인 피드백 DTO |
| save_parent_experience_feedback(uuid,text[],text) | authenticated Parent 본인 | void |
| get_public_class_feedback_summary(uuid) | anon/authenticated | chips: id/count만 |
| get_public_academy_feedback_summary(uuid) | anon/authenticated | chips: id/count만 |

SECURITY DEFINER 함수는 빈 search_path와 schema-qualified 참조를 사용한다. 기본 PUBLIC execute를 제거하고 필요한 역할만 허용한다. app 스키마의 집계/검증 helper는 직접 공개하지 않는다. class → application 순으로 잠그고, 신청당 UNIQUE와 같은 트랜잭션의 upsert로 동시 제출을 직렬화한다.

자격은 Parent role, auth.uid 소유, status=completed, canceled_at/no_show_at NULL이다. report/등록 결과/담당 선생님/child_id는 조건이 아니다. parent_id NULL legacy 신청은 금지한다. 전화·이름으로 소유권을 추정하지 않는다. 기존 feedback의 작성자와 현재 소유권·수업·학원 연결이 달라지면 수정/공개 집계를 차단하고 과거 의견을 새 소유자/학원으로 전달하지 않는다. program_type은 최초 snapshot을 유지한다.

**4. RLS 및 공개 집계**

Parent는 본인 feedback SELECT만, Studio는 자기 학원의 현재 신청 연결과 snapshot이 일치하는 feedback SELECT만 가능하다. 직접 INSERT/UPDATE/DELETE는 두 역할 모두 불가하다. 저장은 Parent RPC만 사용한다. anon은 raw table을 읽을 수 없다.

Class=CLASS+BOTH, Academy=ACADEMY+BOTH. 해당 scope의 칩을 선택한 완료 신청 3건 이상이면서 서로 다른 Parent 3명 이상이어야 하고, 개별 칩도 서로 다른 Parent 3명 이상이어야 공개된다. count는 application별 선택 횟수다. count DESC → taxonomy 순서, 최대 6개. 적격 칩이 없으면 section 자체가 없다. 의견-only는 공개 표본에 포함하지 않는다. Academy는 비활성/종료 수업의 과거 피드백을 유지한다. Class 자체의 공개 여부는 기존 active 경계를 유지한다.

Public DTO에 private_note·개인/신청 식별자 필드는 없다. 공개 query는 집계 RPC만 사용하고 별도 원문 fallback이 없다. HTML/RSC/serialized props를 실제 guest 및 로그인 화면에서 검사했다. 로그인 Class 신청 UI의 기존 '현재 접속자 본인' auth ID는 피드백 작성자 데이터와 구분하여 검사한다. 다른 Parent ID, 모든 피드백 application ID, 의견/아이 이름 canary는 허용하지 않는다. metadata/JSON-LD/analytics에 피드백 의견을 추가하지 않았다.

**5. 고정 taxonomy**

| ID | 문구 | scope |
|---|---|---|
| child_enjoyed | 아이가 즐거워했어요 | CLASS |
| child_focused | 수업에 집중했어요 | CLASS |
| child_participated | 적극적으로 참여했어요 | CLASS |
| good_child_fit | 아이에게 잘 맞았어요 | CLASS |
| good_level_fit | 아이 수준에 잘 맞았어요 | CLASS |
| understood_child | 아이 성향을 잘 이해해줬어요 | BOTH |
| clear_instruction | 설명이 이해하기 쉬웠어요 | CLASS |
| structured_lesson | 수업이 체계적이었어요 | CLASS |
| interesting_activities | 활동이 흥미로웠어요 | CLASS |
| good_hands_on | 직접 해보는 활동이 좋았어요 | CLASS |
| kind_teacher | 선생님이 친절했어요 | BOTH |
| tailored_guidance | 아이에게 맞춰 지도해줬어요 | CLASS |
| attentive_teacher | 아이 반응을 세심하게 봐줬어요 | BOTH |
| specific_feedback | 피드백이 구체적이었어요 | BOTH |
| kind_consultation | 상담이 친절했어요 | ACADEMY |
| clear_consultation | 설명이 명확했어요 | ACADEMY |
| clean_facilities | 시설이 깔끔했어요 | ACADEMY |
| comfortable_atmosphere | 분위기가 편안했어요 | ACADEMY |

level_test는 child_focused/structured_lesson/interesting_activities/good_hands_on을 UI와 RPC 모두 금지한다. 알 수 없는 program_type의 trial_class fallback은 없다.

**6. 실제 화면**

Record 상세에서 report 발행이나 ParentDecision 수집 가능 여부와 독립적으로 표시한다. 칩은 native button/aria-pressed/disabled/focus-visible을 갖고, 5개 선택 후에도 기존 선택 해제는 가능하다. 제출 완료 후 본인 응답과 수정하기를 제공한다. 실패 시 입력을 유지하고, 조회 실패는 재시도 안내로 표시하여 빈 폼으로 덮어쓰지 않는다. 저장 중 form aria-busy 및 버튼 disabled를 적용한다.

Class 소개 다음과 Academy 소개 다음에 조건을 충족한 공개 집계만 표시한다. Studio 신청 상세 ParentDecision 인접 영역은 읽기 전용이다. 새 workflow 단계, 별점, 등록 의향 질문, 요금제 gate, Dashboard 지표를 추가하지 않았다. 기존 Green 및 Parent/Studio 레이아웃을 유지한다. Report Detail은 변경하지 않았고 기존 경로 smoke/정적 검증으로 확인했다.

**7. 검증 결과와 재현 방법**

- 실제 Local Supabase Auth JWT/PostgREST 기준 신규 DB verifier **89 PASS**: 정상 Parent 생성과 선배정, 상태·운영 필드 위조, profile 권한 상승/소속 변경, RLS, note-only, Unicode 공백, 10회 동시 저장, 수정/집계/과거 수업, snapshot 변경 차단.
- 실제 localhost route browser verifier **22 PASS**, page/console error 0. 별도로 기존 Class 신청 sheet의 실제 server action/adapter를 통한 new 신청 생성 → Record에서 Parent 취소까지 PASS. 필수 15개 fixture screenshot + 조회 실패 + 390/768/1440 화면 확인.
- 새 migration의 clean feature apply/reapply/rollback/reapply 검증 PASS. 기존 신청 데이터 hash 유지, rollback 시 신청 권한 보강 유지.
- Workflow SQL: ParentDecision, 등록 결과 trigger, 등록 후 feedback 수정, cancel/no-show 의미/자격 PASS.
- 기존 unassigned confirmation SQL, Rolling A–N·권한 SQL, Rolling 동시성 PASS.
- 기존 필수 static regression 중 Dashboard schedule charts 1개 실패는 작업 전 사본에서도 같은 expected/actual mismatch. 추가로 확인한 Parent account UI verifier의 25개 assertion 실패 역시 작업 전/후 출력이 완전히 동일하다. 두 기존 verifier는 수정하지 않았다.
- application-interest-snapshot은 임시 CJS TS loader에서 ESM 변수 충돌이 났으나, 지정 실행기 `npx tsx`로 PASS했다. 이를 제품 실패로 계산하지 않는다.
- typecheck/lint/build/git diff --check PASS. build는 원래 프로젝트, 로컬 Supabase 환경값으로 수행했다.

```sh
node scripts/verify-parent-experience-feedback-db.mjs
npx tsx scripts/verify-parent-experience-feedback.ts
node scripts/verify-parent-experience-feedback-migrations.cjs
# 설치된 Playwright 경로를 지정. 프로젝트 dependency 추가 없음.
PLAYWRIGHT_MODULE_PATH=/path/to/playwright node scripts/verify-parent-experience-feedback-browser.cjs
```

DB verifier는 `supabase status --local`에 해당하는 로컬 상태에서만 URL/key를 얻고 loopback host를 확인한다. TEST 데이터는 검수용으로 로컬에 남긴다. SQL verifier는 로컬/격리 DB에서만 실행하고 rollback한다. migration verifier는 이름이 `firstclass-rolling-*-test`인 격리 컨테이너만 허용한다.

환경의 기존 차이도 분리했다. 로컬 migration chain에는 Academy query가 이미 사용하는 academy_public_profiles.slug가 없었다. Production에서 해당 열의 존재를 READ-ONLY SELECT로 확인한 후 로컬에만 nullable text 열을 맞춰 실제 Academy route를 검수했다. 이 보정은 신규 feature migration에 넣지 않았다. 또한 기존 문서에 기록된 Supabase PostgreSQL preload 확장의 authenticated SET ROLE SIGSEGV가 재현되어, 별도 컨테이너에서 shared/session preload를 끄고 기존 Rolling SQL/동시성 검증을 통과시켰다. Production 환경의 확장 문제를 수정했다고 주장하지 않는다.

**8. Production READ-ONLY preflight**

PostgREST SELECT/count만 사용. 신규 migration/TEST row/계정 생성 없음.

| 확인 | 결과 |
|---|---:|
| new | 5 |
| reviewing | 3 |
| confirmed | 6 |
| completed | 27 |
| canceled | 21 |
| 완료 + canceled_at/no_show_at 충돌 | 0 |
| 완료 + parent_id NULL | 0 |
| class/organization 연결 오류 | 0 |
| trial_class 수업 | 24 |
| level_test 수업 | 2 |

Production에는 experience_feedback 테이블이 없다(PGRST205/404). 기존 Parent create payload와 새 allowlist를 대조했고 실제 로컬 Class 신청 sheet → server action → adapter → new 신청 생성도 확인했다. 이 점검은 과거 27건의 실제 출석이나 과거 작성자의 정당성을 입증하는 조사는 아니다. 기존 상태를 backfill/변경하지 않았다. Management API CLI 조회가 완료되지 않아 중단한 뒤 read-only REST 조회로 확인했다.

**9. Migration/rollback**

- `20260929090000_harden_parent_application_insert.sql`
- `20260929091000_parent_experience_feedback.sql`

Production 적용은 별도 승인 단계다. 배포 시에는 DB 두 migration → 코드 순서가 필요하다. 코드만 먼저 배포하면 Parent는 조회 실패 안내, Public은 section 없음으로 fail closed한다.

`docs/sql/manual/rollback_parent_experience_feedback.sql`은 피드백 기능만 제거하며 Parent INSERT/profile 권한 보강은 유지한다. 저장된 피드백을 유지해야 한다면 rollback 전에 별도 export가 필요하다. application/report/decision/registration 데이터는 건드리지 않는다. 이미 막은 권한 상승/완료 위조 경계를 다시 여는 rollback은 제공하지 않는다.

**10. localhost 검수 및 작업 폴더**

원래 프로젝트에서 최종 build를 `localhost:3000`으로 제공 중이다. 프로세스에만 Local Supabase 값과 SMS_SEND_ENABLED=false를 넣었고 원래 .env 파일은 변경하지 않았다.

```sh
cd "/Users/1to6/Desktop/첫수업 트레이"
node scripts/open-parent-feedback-review.cjs parent
node scripts/open-parent-feedback-review.cjs studio
```

Parent의 공개 로그인 화면은 Kakao 전용이므로 제품에 TEST 로그인 route를 만들지 않았다. 위 실행기는 로컬 TEST 계정으로 로그인한 검수 브라우저를 연다. 계정·정확한 route·로컬 세션은 `/tmp/parent-feedback-v1/fixtures.json` 및 `visual-review.md`에 있고 비밀 세션 파일은 0600으로 저장한다. 계정 정보는 git에 넣지 않는다.

작업 전 922개 파일 fingerprint, branch/HEAD/staged/status/env를 외부에 기록했다. 총 28개 파일(기존 8개 수정 + 신규 20개)을 변경했다. 수정 대상 8개 파일의 작업 전 내용은 origin/main과 동일했다. 기존 8개 파일에 최소 연결을 추가했으며 해당 파일의 작업 전 사본/기존 diff도 보관했다. 나머지 기존 파일과 env, branch/HEAD/staged 상태를 보존했다. 이번 변경만의 patch와 상세 결과는 `/tmp/parent-feedback-v1/`에 있다. git add/commit/push/PR/main 반영 없음.
