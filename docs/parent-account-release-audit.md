# Parent Account Release Closeout — SHORT AUDIT

감사일: 2026-10-01 (KST). 제품 코드·DB를 변경하지 않은 출시 준비 조사다.

## 기준과 결론

- 이번 작업에서 `git fetch origin` 후 확인한 최신 `origin/main`: `86cc8efb1c5fe3053a2222cb4c22850e055874a2`.
- 기존 작업 디렉터리는 `feat/studio-ux-phase1`, HEAD `02060e7d2fe41e5dd7ac10f403029b5e8193869a`이며 기존 변경이 많다. 구현 판정은 작업 디렉터리 대신 **최신 origin/main의 파일**을 읽어 수행했다.
- Production Supabase `vfkfpekfwrjjocltqbty`에서 FK, 컬럼 nullability, 함수·트리거, Storage bucket·RLS 메타데이터를 read-only 조회했다. 개인 데이터 원문은 조회하지 않았다.
- **기본 프로필 수정·로그아웃·정책 링크는 연결돼 있다. 회원탈퇴는 미구현이며, Parent 사진은 fallback만 있다. 계정 출시 범위 전체를 완료로 볼 수 없다.** 임의의 완료율 백분율은 산정하지 않는다.
- 핵심 장애물은 Auth 삭제가 아니라 **Parent FK의 RESTRICT와 운영 기록 속 개인정보 및 불변 트리거**다. Auth 삭제만 호출하거나 신청을 일괄 삭제하는 방식은 부적절하다.
- 실제 계정 로그인·수정·탈퇴·이미지 삭제 테스트는 하지 않았다. 아래 A는 소스의 UI→서버 연결 확인이며, 인증된 실계정 E2E PASS를 뜻하지 않는다.

## 1. 현재 화면과 기능 분류

구현 분류: A 완료 / B UI만 존재 / C backend만 존재 / D 미구현 / E 중복·legacy. 뒤의 데이터 분류 A/B/C와는 별개다.

| 대상 | 분류 | 확인 결과 |
|---|---|---|
| `/my` | A | Parent 접근 가드, 이름, 자녀·신청·찜·프로필 링크, 로그아웃 및 정책 링크. 전화번호 prop은 받지만 허브에 표시하지 않는다. |
| `/my/profile` | A | Parent 접근 가드, 이름·전화번호·생년월일 조회/수정, 로딩·오류·저장 중·성공 상태가 연결돼 있다. |
| 이메일·로그인 방식 표시 | C | 이메일/password·Kakao 인증은 있으나 계정 query/DTO와 화면에 이메일·방식 표시가 없다. Auth 정보를 검증해서 표시하는 연결이 필요하다. |
| Parent 사진 | B + D | 선택적 imageUrl을 받는 avatar 컴포넌트/fallback은 있다. 업로드·저장·삭제 기능은 없다. |
| 회원탈퇴 | D | 진입 UI, action, cleanup RPC, Auth 삭제, 실패 복구, 완료 화면 모두 없다. |
| 로그아웃 | A / E | 실제 허브는 POST `/auth/sign-out` 사용. 별도 `signOutAction`은 정의만 있고 caller가 없어 E로 분류한다. 삭제·정리하지 않았다. |
| 정책 링크 | A | `/my`에서 약관·개인정보·제3자 제공 동의 접근 가능. `/my/profile` 폼 자체에는 링크가 없다. 내용 확정은 별도 과제다. |

주요 근거: `app/my/page.tsx`, `app/my/profile/page.tsx`, `src/features/my/ui/my-hub.tsx`, `src/features/my/ui/parent-profile-form.tsx`, `src/features/my/queries/get-my-parent-profile-detail.ts`, `src/features/my/actions/update-parent-profile.ts`.

## 2. 계정정보

- 이름: 조회·수정 가능. 폼 필수값이며 server action에서 인증된 본인 Parent ID로 갱신한다.
- 전화번호: 선택 입력이지만 실제 신청 연락처와 알림에 사용한다. 신청 생성은 profile.phone을 읽어 `trial_applications.parent_phone` 등으로 복사한다. 프로필 수정만으로 과거 신청·SMS의 복사본이 바뀌거나 삭제되지는 않는다.
- 생년월일: `profiles.parent_birth_date` nullable, 조회·수정 가능. Kakao 가입 후 비어 있을 수 있다는 안내가 있다.
- 이메일·로그인 방식: 검증된 Auth user에서 읽어 이메일/Kakao 같은 사용자용 라벨로 표시하는 최소 확장을 권장한다. 내부 UUID, provider 원본 metadata는 표시하지 않는다.
- V1에 이메일 변경이나 별도 비밀번호 관리 화면을 새로 확대할 필요는 없다. 이메일/password 로그인과 기존 reset-password → recovery → update-password 경로를 재사용한다.

근거: `src/features/auth/lib/profile-sync.ts`, `src/features/auth/actions/sign-in.ts`, `src/features/auth/ui/kakao-auth-button.tsx`, `app/auth/reset-password/reset-password-client.tsx`, `app/auth/update-password/page.tsx`, `src/features/applications/actions/create-trial-application.ts`.

## 3. Parent 프로필 사진

- Production `profiles`에 avatar/image 컬럼이 없다. `children`에도 사진 컬럼이 없으며 Parent 사진과 자녀 사진을 혼동하지 않았다.
- `ParentProfileAvatar`는 imageUrl과 로딩 실패 fallback을 지원하지만 Home·Classes caller는 `imageUrl={null}`을 전달한다. MyHub는 별도 기본 SVG다.
- Kakao에서 `profile_image` scope를 요청하는 것은 사진 저장/관리 기능의 구현을 의미하지 않는다.
- Parent 전용 Storage bucket/path, upload/delete action, RLS가 없다. Academy 문서·이미지 및 수업 커버는 별개 자산이다.
- **P1 권장:** 기본 이미지로 V1 출시 가능. 사진을 포함한다면 최소 `profiles.avatar_path` nullable + 전용 private bucket + 본인 ID 하위 임의 버전 경로 + 소유권/MIME/크기 검증 + 업로드/교체/삭제 action + fallback을 제안한다. 기존 avatar 표시 컴포넌트를 재사용한다. 이는 제안이며 생성하지 않았다.

근거: `src/features/classes/ui/parent-profile-avatar.tsx`, `app/page.tsx`, `app/classes/page.tsx`, Production columns/Storage metadata.

## 4. 회원탈퇴 현재 상태

최신 main에서 회원탈퇴 UI, server action, Auth admin.deleteUser 호출 및 계정 삭제 orchestration을 찾지 못했다. Production public/app 함수 목록에도 계정 탈퇴·익명화 RPC가 없다. **완성된 탈퇴 흐름은 D(미구현)**다. 개인정보처리방침에 탈퇴 문구가 있는 것과 실제 기능은 구분해야 한다.

## 5. 실제 Parent FK map

아래는 Production `pg_constraint`와 컬럼 메타데이터 결과다. 화살표 왼쪽이 참조하는 쪽이며 ON DELETE는 오른쪽 행 삭제 시 동작이다.

| 참조 관계 | ON DELETE / 제약 | 의미·작성자 식별 |
|---|---|---|
| `profiles.id → auth.users.id` | CASCADE | Auth UUID와 profile ID가 같다. |
| `children.parent_id → profiles.id` | CASCADE, NOT NULL | Parent 소유 자녀. |
| `trial_applications.parent_id → profiles.id` | RESTRICT, nullable | 신청 소유 Parent. Auth 삭제 cascade를 막는다. |
| `trial_applications.child_id → children.id` | SET NULL | 자녀 삭제 후에도 신청 자체는 남는다. 이름 등 snapshot은 별도다. |
| `parent_decisions.parent_id → profiles.id` | RESTRICT, NOT NULL | 의사결정 작성 Parent. |
| `parent_decisions.application_id → trial_applications.id` | RESTRICT | 신청 삭제를 막는다. |
| `parent_report_engagement.parent_id → profiles.id` | RESTRICT, NOT NULL | 리포트 열람 Parent. |
| engagement의 application / first_report FK | 각각 RESTRICT | 신청·최초 리포트 참조. |
| `parent_notification_reads.parent_id → profiles.id` | CASCADE, NOT NULL | 개인 읽음 상태. |
| `experience_feedback.parent_id → profiles.id` | CASCADE, NOT NULL | feedback 작성 Parent. |
| `experience_feedback.application_id → trial_applications.id` | CASCADE | 신청 삭제 시 feedback도 소실. class/org FK는 RESTRICT. |
| `application_logs.actor_id → profiles.id` | RESTRICT, NOT NULL | 실제 활동 작성자. Parent와 Studio 작성자를 구분해야 한다. |
| `application_logs.application_id → trial_applications.id` | CASCADE | 신청 삭제 시 변경 이력 소실. |
| `experience_reports.application_id → trial_applications.id` | RESTRICT | 발행 리포트가 신청 삭제를 막는다. |
| reports의 published_by / withdrawn_by / superseded_by → profiles | SET NULL | 리포트 작업자. Parent 소유 필드로 일괄 처리하면 안 된다. |
| `trial_results.application_id → trial_applications.id` | CASCADE | 체험 결과. created_by/updated_by는 profiles SET NULL. |
| `consultation_logs.application_id → trial_applications.id` | CASCADE | 상담 이력. created_by는 profiles SET NULL. |
| `registration_results.application_id → trial_applications.id` | RESTRICT | 등록 결과가 신청 삭제를 막는다. |
| `registration_results.recorded_by → profiles.id` | RESTRICT, nullable | 통상 Studio 기록자. 탈퇴 Parent와 같을 때만 처리 검토. |
| `schedule_blocks.related_application_id → trial_applications.id` | SET NULL | 일정과 신청 연결. |
| `sms_logs.trial_application_id → trial_applications.id` | SET NULL | 알림 로그. created_by는 profiles SET NULL. 수신자 snapshot은 따로 남는다. |
| `studio_import_rows.application_id → trial_applications.id` | SET NULL | 가져오기 이력 및 fingerprint는 별도 보존 판단. |

추가 profile/Auth 참조: teachers.profile_id CASCADE, academy_update_requests.requester_profile_id RESTRICT / reviewed_by SET NULL, academy_public_profiles.updated_by SET NULL, teacher_signup_requests.user_id→auth.users CASCADE / reviewed_by SET NULL, studio_import_batches.created_by·billing_checkout_sessions.requested_by·organization_entitlement_overrides.granted_by SET NULL. Parent 탈퇴 시 역할이 혼합된 예외 데이터가 있는지 대상 ID에 한정해 사전 검사해야 한다. 이 감사에서는 개인별 행을 조회하지 않았다.

Favorites는 DB FK가 아니라 브라우저 `firstclass_favorites` localStorage의 수업 ID 목록이다. 별도 Parent 알림 설정 저장소는 확인되지 않았고 개인 알림 읽음 상태는 위 테이블이다.

## 6. 탈퇴 시 삭제 가능한 데이터 — 데이터 분류 A

- 개인 profile 및 Auth 계정: 아래 운영 연결 정리 후 삭제.
- 개인 children: 운영 신청의 식별정보/snapshot 처리와 함께 삭제. 자녀 삭제 UX 재설계는 범위 밖이다.
- 개인 알림 읽음 상태, 개인 리포트 열람 식별 기록: 삭제 권장. 열람 지표를 별도로 보존하려면 C 정책 판단.
- raw feedback 전체(private_note와 selected chips 포함): 삭제 권장. 아래 집계 영향 참고.
- 브라우저 favorites 및 사용자별 캐시: 완료 시 현재 브라우저에서 제거. 다른 기기의 localStorage까지 서버에서 즉시 지울 수 있다고 약속하지 않는다.
- Parent 소유 사진이 향후 생기면 실제 Storage 객체와 DB 경로도 삭제한다. 현재 업로드 기능은 없다.

## 7. 개인정보 제거 후 운영 사실 보존 — 데이터 분류 B/C

**신청 전체를 삭제하면 안 된다.** reports/decisions/registration의 RESTRICT에 막히며, CASCADE로 체험 결과·상담·로그를 잃을 수 있다. 신청 ID 및 학원 운영 사실을 유지하면서 식별정보를 제거하는 최소안을 권장한다. 최종 보존 범위·기간은 제품/법적 판단 C이며 이 감사에서 확정하지 않는다.

| 기록 | 제안 |
|---|---|
| 신청 | nullable parent_id를 해제하고 child 연결/식별 snapshot 정리. class/org 연결, 상태 변화와 완료 사실은 보존 후보. |
| 체험 결과·상담·등록 결과 | 결과/발생일 같은 운영 사실은 보존 후보. 이름·연락처·자녀 식별정보·자유 입력 원문은 삭제/치환 정책 필요. |
| 발행 리포트 | 발행·버전·철회 사실은 보존 후보. content JSON의 자녀 displayName 등 snapshot은 별도 제거. |
| ParentDecision | 의사결정 결과 보존 시 Parent 연결 및 자유 입력 제거가 필요. 현재 NOT NULL 및 불변 트리거 때문에 migration 필요. |
| 활동 로그 | 탈퇴 Parent actor만 해제하고 note의 개인정보 제거. Studio 작성자 정보까지 지우지 않는다. |
| 일정·SMS·가져오기 이력 | 진행 전 일정, 재연락, 발송 대기 처리 정책 C. SMS 이름/마스킹 전화/메시지 preview와 가져오기 fingerprint도 검토 대상. |

`trial_applications`의 parent_name/parent_phone, child_name/child_school/child_notes, memo·goal_note·상담/체험/등록 메모·선호 시간 JSON 등에 개인정보가 복제될 수 있다. reports.content, trial_results의 요약/메모, consultation_logs의 note/snapshot, application_logs.note, feedback.private_note, sms_logs.message_preview/error_message도 FK만 끊는 것으로 해결되지 않는다. 자유 입력에서 개인정보만 자동으로 완벽하게 구별한다고 가정하지 말고, 최소안은 정해진 필드를 삭제/치환하는 방식이다. NOT NULL 필드는 식별 불가 대체값 등 명시적 계약이 필요하다.

신청 상태 계약 `new → reviewing → confirmed → completed`는 유지한다. completed_at/last_activity_at 같은 사실과 탈퇴 이후 미래 next_contact_at/알림 중단은 구분한다. 진행 중 예약을 어떻게 종료할지는 구현 전 정책 결정이 필요하며 완료 기록을 일괄 취소하지 않는다.

## 8. Feedback 처리

Experience Feedback V1은 구현돼 있다. selected_chip_ids와 private_note가 있고, public DTO에는 chip 집계만 노출된다. public aggregate는 원본 feedback과 유효 신청/Parent 연결을 실시간 집계하며, 고유 신청/Parent 수 최소 3 조건과 chip별 최소 조건을 적용한다. 별도 익명 집계 영구 보관 테이블은 없다.

추천: 탈퇴 시 raw feedback 행 전체를 지우고 집계가 줄거나 임계값 미달로 숨겨지는 것을 수용한다. 기존 parent FK CASCADE와 가장 가깝다. private_note 원문을 작성자 연결만 제거한 채 남기지 않는다. parent_id만 NULL로 바꾸는 안은 NOT NULL·snapshot 불변 트리거와 집계 join/distinct-parent 계약에 맞지 않는다. 익명 chip 통계 영구 보존은 별도 C/P1 정책이며 이번 V1에 새로 만들지 않는다.

Production `app.reject_parent_experience_revision`은 authenticated/anon의 수정·삭제를 막는다. 서버 전용 cleanup은 권한과 대상을 좁혀 설계해야 하며, UI에서 직접 delete하게 만들면 안 된다.

## 9. Storage 처리

실제 bucket은 `class-covers`(public), `academy-documents`(private), `academy-profile-assets`(public, 10 MB, JPEG/PNG/WebP)다. Parent avatar bucket은 없다. 현재 Parent profile ID와 Storage owner/owner_id가 일치하는 객체 수는 **0**이었다. 경로나 service 업로드까지 포함해 Parent 관련 객체가 전혀 없다는 증명은 아니다.

`storage.objects`에 Auth 소유자 삭제 CASCADE FK는 없고 bucket FK만 확인됐다. 기존 class-covers에는 넓은 authenticated 정책과 조직 경로 정책이 공존한다. Parent 사진에 이 bucket/policy를 재사용하지 않는다. 기존 정책 정비는 이 감사 범위 밖이다.

향후 사진 구현 시 객체 경로를 확보한 후 Storage API로 삭제하고 DB 경로를 제거한다. 중간 실패 시 재시도할 경로를 잃지 않도록 해야 한다. Storage 메타데이터 행 삭제는 실제 파일 삭제가 아니다. [Supabase Storage schema 안내](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/storage/schema/design.mdx), [객체 삭제 API 안내](https://supabase.com/docs/guides/storage/management/delete-objects).

private bucket의 짧은 signed URL·버전 경로와 UI 캐시 무효화를 권장한다. 이미 내려받거나 외부 캐시에 남은 public 이미지를 즉시 회수한다고 약속하지 않는다. Kakao 원격 사진은 자체 Storage 객체와 구분한다. 객체 ownership 자체가 접근 제어를 대신하지 않으므로 본인 경로 RLS가 필요하다. [Storage ownership](https://supabase.com/docs/guides/storage/security/ownership).

## 10. 권장 Auth 삭제 순서와 실패 처리

다음은 구현 제안이며 실행하지 않았다.

1. 서버에서 현재 Auth user와 Parent 역할 확인. 클라이언트가 넘긴 임의 target ID로 삭제하지 않는다.
2. 설명이 있는 한 번의 확인 sheet/modal. 필요한 인증 확인 외에 반복 확인 단계를 늘리지 않는다.
3. 최소한의 진행 상태로 중복 요청과 신규 activity 차단. 현재 세션 외 경로·RLS·예약 알림도 검토한다.
4. 소유 Storage 경로 확보 후 객체 삭제. 없으면 건너뛰며 실패 시 성공 표시 없이 재시도 가능하게 한다.
5. DB transaction에서 운영 기록 식별정보/연결 정리, 개인 데이터 삭제. Auth 삭제 전까지 최소 profile/진행 가드를 유지한다.
6. cleanup 성공 후 서버 전용 Auth admin 삭제. 먼저 Auth를 지워 FK와 cleanup 접근을 깨뜨리지 않는다.
7. 세션·쿠키 종료 및 현재 브라우저 favorites/사용자 캐시 정리.
8. 탈퇴 완료 상태로 이동. Auth/Storage 실패라면 완료로 표시하지 않고 처리 대기/재시도 상태를 제공한다.

DB·Storage·Auth는 단일 transaction이 아니다. 작은 durable 진행 상태 하나(예: deletion_requested_at 또는 최소 요청 행)로 재시도 가능하게 하되 새 soft-delete/retention engine은 만들지 않는다. DB 정리 후 Auth 실패 시 `ensureParentProfile`이 개인정보를 재생성하지 않도록 pending 상태를 확인해야 한다. 현재 구현에는 이 가드가 없다.

Auth 삭제 직후 기존 JWT가 자동으로 즉시 모두 무효화되는 것은 아니다. 만료까지의 접근을 profile 부재/진행 상태와 서버·RLS 검사로 차단하고 세션도 정리해야 한다. 소유 Storage 객체가 Auth 삭제를 막을 수 있다는 공식 안내도 있다. [Supabase 사용자 데이터 관리](https://supabase.com/docs/guides/auth/managing-user-data).

## 11. 약관·개인정보 route 및 확인 한계

| Canonical route | Production GET | 접근 |
|---|---|---|
| `/terms` | 200, 이용약관 | `/my` 링크 있음 |
| `/privacy` | 200, 개인정보처리방침 | `/my` 링크 있음 |
| `/third-party-consent` | 200, 개인정보 제3자 제공 동의 | `/my` 링크 있음 |

확인 주소는 `https://firstsuup.com`이다. 소스는 `app/(legal)/terms/page.tsx`, `app/(legal)/privacy/page.tsx`다. `/my`와 `/my/profile` 비로그인 응답은 HTTP 200 안의 Next streamed redirect로 `/auth/sign-in` 이동 지시가 있었다. 이를 인증된 프로필 화면 정상 로드로 판정하지 않는다.

약관은 MVP 초안/법률 최종 검토 전임을 표시한다. 개인정보처리방침의 신청 이력 보유 문구는 “회원 탈퇴 또는 목적 달성 시까지”와 별도 분쟁 대응 정책 가능성을 담고 있다. 위 운영 기록 비식별 보존안과 실제 구현을 맞춘 최종 문구 검토가 P0다. 기존 법정기간처럼 보이는 문구를 이 감사에서 검증·승인하거나 새 기간을 정하지 않았다. 사진 추가 시 수집 항목/처리 목적도 함께 검토한다.

## 12. 탈퇴 후 재가입 영향

현재 소유권은 이메일/전화번호가 아니라 Auth/profile UUID 기반이다. 정상 hard delete와 cleanup 후 새 Auth UUID로 재가입한다면 과거 자녀·신청·feedback이 자동으로 새 계정 소유가 되는 FK 구조가 아니다. 조사한 profile-sync/신청 조회 경로에 이메일·전화번호로 과거 데이터를 재소유시키는 로직은 없었다.

실제 동일 이메일/Kakao 재가입 테스트는 하지 않았다. 살아 있는 Auth 계정에 대한 provider linking과 탈퇴 후 신규 가입은 구분해야 한다. 탈퇴 미완료 상태에서 profile 재생성으로 복구되는 위험은 위 pending 가드로 처리한다. 계정과 무관한 localStorage favorites는 같은 브라우저에 남을 수 있어 별도 정리가 필요하다.

## 13. P0 / P1

| 우선순위 | 범위 |
|---|---|
| P0 신규 구현 | 회원탈퇴 UI·서버 orchestration, 본인/역할 검증, 신규 activity 차단, 운영 history 개인정보 제거, 개인 데이터 삭제, Auth/session 종료, 부분 실패 재시도. |
| P0 계약 결정 | 진행 중 신청·예정 알림 처리, 운영 사실/자유 입력/발행 snapshot 보존 범위, feedback 삭제 후 집계 감소, 정책 문구와 실제 동작 일치. 법적 기간은 별도 확정. |
| P0 계정/회귀 | 기본 이메일·로그인 방식 읽기 표시 연결. 기존 이름/연락처 수정·로그아웃·정책 링크는 유지하고 실계정 회귀 검수. |
| P1 | Parent 사진 업로드·관리. 이메일 변경·새 비밀번호 관리 UI는 확장하지 않고 기존 재설정 경로 재사용. |

자녀 삭제 UX, 알림 설정 고도화, 결제, 추천 기능은 이번 출시 정리 범위에 추가하지 않는다.

## 14. 필요한 최소 DB 변경

**권장 보존 계약을 구현하려면 좁은 migration이 필요하다.** Auth API만 추가해서 끝낼 수 없다.

- `trial_applications.parent_id`는 이미 nullable이므로 재사용한다. 모든 FK를 CASCADE로 바꾸지 않는다.
- ParentDecision을 보존한다면 parent_id nullable 및 제한된 익명화 경로가 필요하다. `reject_parent_decision_mutation`은 Parent ID 등 기존 필드 변경을 막는다.
- Parent 작성 application_logs를 보존하면서 actor_id를 해제하려면 현재 NOT NULL 계약 조정이 필요하다. Studio actor는 유지한다.
- `lock_final_trial_result`는 UPDATE/DELETE를 무조건 막는다. service role이라는 이유만으로 결과의 개인정보를 지울 수 없다.
- 리포트의 `reject_experience_report_content_update`와 `report_send_once`는 content 수정·terminal 행 수정·삭제를 제한한다. 발행 사실을 유지하면서 snapshot PII만 제거하는 전용 경로가 필요하다.
- registration_results.recorded_by는 nullable이지만 mutation guard가 변경을 막는다. 실제 탈퇴 Parent가 작성자일 때의 예외만 검토한다.
- feedback은 controlled 서버 삭제를 사용하고 익명 feedback 구조로 확장하지 않는다. 삭제/익명화 RPC가 필요하면 public/authenticated 실행을 열지 않고 서버 권한·대상·허용 필드를 제한한다.
- 최소 탈퇴 진행 상태를 마련한다. 일반 요청이 설정 가능한 flag/GUC만으로 불변 트리거를 우회하게 하거나 전체 trigger를 disable하지 않는다.

기존 적용 migration 파일을 고치는 대신 승인된 새 migration에서 최소 변경을 해야 한다. 이번 감사에서는 migration 생성·적용 모두 하지 않았다.

## 15. 예상 수정 파일 — 후속 구현 제안

| 목적 | 파일/영역 |
|---|---|
| 계정 표시·배치 | `app/my/profile/page.tsx`, `src/features/my/ui/parent-profile-form.tsx`, `src/features/my/ui/my-hub.tsx`, `src/features/my/queries/get-my-parent-profile-detail.ts` |
| 검증된 Auth 정보/진행 가드 | `src/features/auth/lib/profile-sync.ts` 및 Parent access/session 호출부 |
| 탈퇴 UI·orchestration | `src/features/my` 아래 확인 UI, server action, 서버 전용 cleanup 서비스 신규 파일(이름은 구현 때 확정) |
| FK/불변 guard·cleanup | 승인 후 `supabase/migrations` 새 migration 및 전용 검증 SQL |
| 세션·브라우저 정리 | `app/auth/sign-out/route.ts`와 완료 client 흐름, `src/features/favorites/lib/storage.ts` |
| 정책 | `app/(legal)/terms/page.tsx`, `app/(legal)/privacy/page.tsx` |
| 선택적 P1 사진 | 기존 ParentProfileAvatar와 profile DTO, 전용 Storage action/RLS |

데이터 adapter 계약을 추가한다면 `src/shared/lib/db/adapter.ts`, `supabase-adapter.ts`, `mock-adapter.ts`와 caller를 함께 맞춘다. 불필요하면 계정 전용 서버 경로로 범위를 제한한다. 기존 route rename/remove, 미사용 action 삭제는 제안하지 않는다.

## 16. 추천 구현 순서

1. 보존/삭제 대상 필드와 진행 중 신청 처리 계약 확정, 정책 문구 정렬.
2. 아래 네 상태의 기존 Parent 디자인 시안 확정.
3. 제한된 cleanup·불변 guard 예외·진행 상태 DB 설계와 승인.
4. 서버 탈퇴 흐름과 실패 복구 구현, 이후 계정 표시/확인/완료 UI 연결.
5. 격리된 검증 데이터로 운영 기록 보존·PII 제거·권한·재시도·재가입 비연결을 검증하고 lint/typecheck 수행. Production 실계정 삭제 테스트는 별도 승인 없이는 하지 않는다.
6. 기존 로그인·프로필·로그아웃·정책 링크 회귀 확인 후 출시 판단. 사진은 P1로 분리 가능.

## 17. 시안 구조

1. **Parent 프로필/계정:** 기본 avatar와 이름 → 계정 정보(읽기 전용 이메일/로그인 방식, 기존 연락처·생년월일 수정) → 정책(약관/개인정보처리방침) → 계정 관리. 내부 ID/metadata는 없다.
2. **탈퇴 진입:** 계정 관리에 로그아웃과 회원탈퇴를 구분해 배치. 사진 편집은 P1이면 표시하지 않는다.
3. **확인 modal/sheet:** “회원탈퇴” 제목, “탈퇴하면 첫수업 계정과 개인정보가 삭제됩니다. 이미 진행된 체험의 학원 운영 기록은 개인정보가 제거된 형태로 일부 보존될 수 있습니다.” 계약 확정 후 문구 조정. 취소/회원탈퇴 계속, 처리 중 중복 입력 방지, 실패 시 재시도. 과도한 3~4단계 확인은 없다.
4. **완료/실패 상태:** 성공 시 완료 안내와 로그인/수업 둘러보기. 부분 실패는 완료 화면으로 보내지 않고 처리 상태·재시도 안내. 실제 정리된 범위 이상으로 “모든 데이터 즉시 삭제”를 약속하지 않는다.

기존 mobile-first Parent Design System과 로딩·빈 상태·오류 패턴을 유지한다. 이번 산출물은 시안 제작을 위한 구조이며 실제 디자인/제품 구현은 하지 않았다.

## 18. 주요 위험과 감사 검증

- Auth 선삭제: profile CASCADE가 RESTRICT에 막히거나 cleanup 재시도를 어렵게 한다.
- 신청 일괄 삭제: 학원 체험/상담/로그 손실 또는 RESTRICT 실패.
- FK만 해제: 신청 snapshot·발행 JSON·자유 입력·SMS에 개인정보 잔존.
- NULL 허용만 추가: 결과/리포트/의사결정 불변 트리거에 계속 차단.
- 과도한 우회: 일반 계정이 발행 기록을 수정하거나 타인 계정을 지우는 권한 확대 위험.
- 부분 실패: Auth와 DB/Storage 불일치, profile 재생성, 남은 JWT/캐시 접근.
- 정책 불일치: 현재 약관 초안·보유 문구와 실제 삭제/보존 동작 정렬 필요.

검증 근거는 최신 main 소스와 Production 메타데이터, 공개 정책 GET 및 비로그인 접근 가드 확인이다. 실제 Parent 행·이미지를 삭제하거나 수정하지 않았다. 인증된 화면 E2E, 탈퇴/재가입 성공, 법적 보존기간 적합성은 확인 범위가 아니다.

이번 저장소 변경은 이 문서 한 파일뿐이다. 제품 코드·환경 파일·기존 작업 변경은 보존했다. 문서 변경만 있어 lint/typecheck/build는 재실행하지 않으며, `git diff --check` 및 새 문서 whitespace 검사에 문제가 없었고, 문서를 제외한 기존 tracked/untracked 파일·환경 파일의 내용과 branch/HEAD/index/status 보존 검사가 통과했다. DB write, Storage delete, migration 생성/적용, 계정 생성/삭제, commit/push/deploy는 수행하지 않았다.
