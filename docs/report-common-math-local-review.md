# 리포트 공통 형식 + 수학 관찰 — 로컬 구현 / DB 적용 승인 대기

기준: origin/main `6395f1439b22d6b37d5efacb48fed672cb776e45` (2026-10-11 fetch 확인).
작업/정상 3000 실행 소스: `/Users/1to6/Desktop/firstsuup-report-math-review`.
기존 WEB의 `.env.local` 링크와 실제 Supabase 인증을 유지하며 별도 로그인/검토 route/포트를 만들지 않았다.

## 화면과 관찰 계약

- 오늘의 수업 → 수업에서 보인 모습 → 선생님 이야기 → 입력된 추천 정보 순서. Parent 디자인/진입/피드백은 유지한다. 추천은 텍스트이며 가짜 링크가 없다.
- 수학은 관심과 참여 / 오늘 내용의 이해 / 안내 후 반응의 각 3개 문항을 선택한다. 모든 영역 선택을 강제하지 않으며 비어 있는 영역은 공개 화면에 나타나지 않는다. 총평/추천은 기존 필드이고 자동 문장 생성이나 새로운 필수 필드가 없다.
- `classes.subject_category_id` → `subject_categories.code`, 또는 `subject_id`의 대분류를 사용한다. master가 없는 기존 수업만 저장된 정확한 과목 코드(math/school_math/thinking_math/competition_math/arithmetic/abacus)를 사용한다. 수업명·학부모 관심 과목으로 추측하지 않는다. 비수학은 기존 범용 7개 문항을 유지한다.
- 기존 7개 코드/문구와 과거 legacy 문구는 변경하지 않는다. 현재 과목 문항에 없는 기존 선택은 별도 펼침에서 확인·해제할 수 있다. 수정하지 않은 관찰은 서버 원본을 유지한다. 명시적인 선택 변경으로만 저장값이 바뀐다.
- V1/V2 전달본을 재작성하지 않는다. 새 V3 전달본은 선택한 code/label/group(code/label)을 함께 고정한다. 조회는 snapshot의 문구/영역을 읽고 현재 과목 설정으로 재해석하지 않는다. Studio와 Parent는 같은 관찰 렌더러를 사용한다.
- 총평만 있는 리포트의 미리보기 가능 판정을 기존 DB 발행 계약과 일치시켰다. DB는 이미 총평 단독 발행을 허용했다. 새 필수 조건은 없다.
- 기록 저장/리포트 보내기 분리, 발행 후 source/snapshot 수정·재발행 차단, 독립 등록 상담 메모/CAS/권한, 등록 결과, 이전 상담 이력을 보존한다.

## 승인 대상 DB COMPAT migration (미적용)

`supabase/migrations/20261011140000_math_report_observations.sql`

SHA-256: `777be32af359428894d3b5641fe6a1a828bc2283742a6326d352a176605f044a`

1. 관찰 CHECK 2개를 같은 transaction 안에서 허용 집합의 superset(기존 7 + 수학 9)으로 교체한다. 기존 legacy-only 배열은 그대로 허용한다. 기존 행 rewrite/자동 매핑은 없다.
2. 기존 문구 함수에 새 코드만 추가하고 영역 snapshot helper를 추가한다. `save_studio_trial_result`와 최초 작성 `finalize_studio_trial_result`가 같은 비공개 helper `trial_observations_match_subject`로 저장된 과목 분류를 검사한다. 클라이언트의 helper 직접 실행은 차단한다. 관찰 허용 집합은 기존 7개와 신규 수학 9개다. 과목 변경 전에 저장된 수학 선택은 유지/해제할 수 있다. 본인 학원/완료/revision/발행 잠금은 그대로다.
3. 기존 `publish_experience_report`는 V2를 유지한다. 새 수학 코드가 있으면 이전 client 발행을 명확히 차단한다. 새 authenticated 전용 `publish_experience_report_v3`가 동일한 권한/잠금/발행 검증으로 V3를 생성한다. 새 앱 adapter만 V3 RPC를 호출한다. DB 선적용 때문에 기존 앱이 갑자기 읽을 수 없는 V3를 만들지 않는다.
4. 기존 정책/잠금 trigger/권한을 풀지 않는다. 새 helper/RPC의 PUBLIC·anon 실행을 차단한다. 기존 DB 데이터나 발행본 변경, 알림 호출 없음.

실제 연결 DB에서 기존 관찰 제한(7개), 새 migration 미적용을 읽기로 확인했다. 새 수학 저장·V3 발행은 이 파일 적용 전 불가능하다. **로컬 검토 준비 완료가 아니며 DB 적용 승인 대기다.** 실제 DB 재적용/변경은 실행하지 않았다.

추후 배포 시: 승인된 COMPAT DB → V3 reader와 새 adapter를 포함한 앱 배포 순서. V3 전달본 생성은 Parent V3 reader가 Production에 준비된 뒤에만 사용자 검토한다. 이번 작업에서는 고객 저장·리포트 보내기를 실행하지 않았다.

## 검증과 실제 관측의 구분

- 격리 DB: 기존 34개 테이블 fingerprint 보존, 기존 정책/잠금 유지, 범용/legacy/V1/V2 보존, 수학 9개 저장·재조회, 과목 분류 우선순위, 선택 유지/명시 수정, 총평 단독 발행, V3 고정 영역/문구, 기존 client V2 호환, Parent/타 학원/anon 차단, 발행 후 기록/재발행 잠금, 독립 메모 수정 및 등록 결과 회귀 PASS.
- 실제 server action을 격리 boundary로 실행: auth/entitlement, 저장 분류, 필드 whitelist, revision, 원본 내부 메모 보존, 발행 잠금 PASS. 실제 DB publication 결과와 TS 미리보기 snapshot을 deep-equal 비교해 PASS.
- 실제 route/component/CSS의 네트워크 차단 fixture: Studio 1440/1024, Parent 390, 3개 영역/9개 문항, 미선택 영역 숨김, 선택/실패 입력 보존/재진입, 이전 선택 표시, 같은 미리보기/Parent 문구, 메모/등록 편집·취소 및 신청관리 행/헤더/칩 회귀 PASS. 이미지/새 수업/로그인 fixture route를 서비스에 추가하지 않았다.
- typecheck/lint/build/diff-check PASS, NEW FAILURES=0. 마지막 build는 dev cache와 분리된 소스 사본에서 실행했다.
- 실제 정상 3000은 새 경로로 전환하고 Supabase auth/db_read health 200을 확인했다. 지정 신청 URL은 비인증 요청에서 정상 307 로그인 이동이다. 브라우저 연결 목록이 비어 있어 실제 로그인 화면·저장·재진입은 미검증이다.
- 기존 검토 신청 `97327ac5-1a6d-408f-86c8-a39a7741cb76`은 저장 분류가 piano/music이므로 범용 문항 대상이다. 같은 학원의 완료·미전달 수학 신청은 읽기 조회에서 찾지 못했다. 이를 위해 고객 신청을 생성/변경하지 않았다.
- 실제 계정 URL: http://localhost:3000/studio/applications/97327ac5-1a6d-408f-86c8-a39a7741cb76 및 http://localhost:3000/studio/cases .
- 원래 WEB/MOBILE/phase1-review의 HEAD·branch·index·dirty·untracked·env·파일 hash 보존 확인. MOBILE/환경설정/자동 Push OFF 변경, 고객 쓰기/외부 알림, git add/commit/push/배포 없음.
- 검증 증거: `/Users/1to6/.codex/artifacts/report-math-20261011`.

## 데모 데이터 준비 후속 확인 (2026-10-11)

- 사용자가 확인한 대상: **첫수업 데모학원**, organization ID `29e8c477-dabb-404c-bac4-ba96ffd1e999`. 기존 피아노 신청 소속과 다르며 그 신청은 그대로 보존했다.
- 실제 DB 쓰기 함수 정의를 읽어 확인한 뒤 최초 작성/수정 두 경로에 동일한 과목 검증을 적용했다. 최초 작성 수학 9개 저장·재조회, 비수학 거부/행 미생성, 범용 유지, Parent/타 학원/anon/체험 전 거부, helper 직접 호출 차단 및 기존 잠금/메모 회귀를 격리 DB에서 통과했다. 기존 34개 테이블 데이터 fingerprint 보존.
- **데모 수업/신청 미생성**: 현재 연결 브라우저 목록이 비어 있고 기존 CDP 9222 연결도 불가하다. 정상 3000은 실제 인증을 유지한다.
- **지원 경로 차단**: 기존 예약 가져오기 `getReservationImportOrganizationContext`가 `classes.is_active=true`만 조회하므로 비공개 수업은 preview의 `class_not_found`로 차단된다. Parent 신청도 비공개 수업을 거부한다. 직접 SQL 삽입, preview 검증을 생략한 RPC 호출, 임시 공개 전환은 실행하지 않았다.
- 수학 데모 신청 URL/생성 ID는 없으며 실제 3영역/9문항 표시·미리보기·저장은 미검증이다. 새 migration 적용도 여전히 별도 승인 대기다.
- 이번 후속 변경은 pending SQL, 격리 검증, 이 문서뿐이다. 앱 소스는 이전 typecheck/lint/build PASS와 동일하므로 무관한 전체 검증을 반복하지 않았다. 후속 격리 DB 검사와 diff-check PASS, NEW FAILURES=0.
- 후속 증거: `/Users/1to6/.codex/artifacts/report-math-demo-20261011`. commit/push/배포·Production DB 적용·외부 알림 없음.
