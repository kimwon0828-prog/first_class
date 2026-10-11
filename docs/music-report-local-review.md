# 음악 공통 관찰 — 미적용 피아노 시안 교체 / DB 승인 대기

이번 수정은 피아노 전용 범위를 음악 대분류 공통으로 바로잡는다. 공통 화면·저장·미리보기·V3 snapshot을 그대로 사용하며 다른 디자인/필수 입력/점수/사진 기능을 추가하지 않는다.

실행 소스: `/Users/1to6/Desktop/firstsuup-report-math-review`, 정상 `localhost:3000`·기존 env·실제 인증 유지.

## 문항 및 분류 계약

- 새 `MUSIC_OBSERVATION_GROUPS`는 관심과 참여 / 오늘 활동의 수행 / 안내 후 반응의 3영역·각 3문항이다. 사용자가 제공한 음악 공통 문구를 그대로 사용한다. 건반·손의 움직임·특정 악기 연주 구간 문항은 제거했다.
- 저장 코드는 새로운 `music_*` 9개이다. 실제 DB 읽기 확인에서 미적용 피아노 migration, 미생성 피아노 데모, `piano_*` source/snapshot 0건을 확인한 뒤 미적용 코드만 교체했다. 기존 저장값을 변환/재작성하지 않았다.
- `classes.subject_category_id` 또는 `subject_id → subject_categories` FK가 가리키는 저장된 대분류 `music`이면 같은 문항을 사용한다. 피아노·바이올린·첼로·플루트·기타·드럼·성악·작곡(실제 code `vocal`, `composition`) 8개가 음악 마스터에 속함을 읽기로 확인했다. 세부 과목 whitelist/템플릿, 수업명 추론, legacy 텍스트를 이용한 음악 추측은 없다.
- 수학 대분류 및 기존 수학 fallback 규칙은 유지한다. 그 밖의 과목은 범용 7개 문항을 유지한다. 영역 선택 강제 없음, 미선택 영역 숨김, 총평/추천 구조 동일.
- 기존 선택은 별도 표시·보존·명시 해제를 유지한다. V1/V2/V3 전달본 문구와 영역, 발행 잠금, 권한, 등록 상담 메모의 독립 수정 조건은 그대로다.

## 수정본 1 — 음악 COMPAT migration (미적용)

`supabase/migrations/20261011180000_music_report_observations.sql`

SHA-256: `274abe0fefc9c6c1e51d0d93847f6598b7be597bb9a962112ebaa5e426e21a67`

이 파일이 이전 `20261011180000_piano_report_observations.sql`을 대체한다. 피아노 미적용 파일은 저장소에서 제거했으며 이전 해시 `c15f3494…f9bee7c5`는 더 이상 검토 대상이 아니다. 실제 DB migration 이력에 해당 version이 없음을 확인했다.

변경 범위는 기존 CHECK의 허용 집합 16→25, 관찰 문구/영역 함수와 기존 과목 guard 확장이다. 최초 작성 `finalize_studio_trial_result`와 수정/신규 저장 `save_studio_trial_result`가 같은 guard를 호출한다. guard는 음악 대분류만 검사하며 세부 과목이 달라도 같은 문항을 허용한다. 기존 관찰은 과목 변경 이후에도 유지/해제할 수 있다.

저장 RPC의 개수 제한 한 표현과 기존 V2 RPC의 새 과목 문항 발행 차단 한 표현만 해시 검증 후 교체한다. 기존 함수 정의가 다르면 전체 중단한다. 새 RPC/권한/정책/trigger, 기존 데이터 재작성 없음. V3 publisher·reader 구조는 바꾸지 않는다.

이미 적용된 `20261011140000_math_report_observations.sql`은 수정·재적용하지 않았다. 해시는 `777be32af359428894d3b5641fe6a1a828bc2283742a6326d352a176605f044a` 그대로다.

## 수정본 2 — 피아노 한 사례의 음악 검토용 데모 SQL (미적용)

`docs/sql/manual/20261011_prepare_piano_report_demo.sql`

SHA-256: `37f947ea653c02a392d2882e4658d0d06053b40e0a33d53e391743acedc7411f`

선행 조건을 `experience_report_observation_label('music_followed_rhythm_or_sound')` 존재 검사와 `demo_music_migration_required` 중단 조건으로 변경했다. 설명도 음악 공통 문항의 피아노 검토용임을 명시한다. 이전 피아노 전용 migration으로는 이 조건을 통과하지 못한다.

대상은 기존 첫수업 데모학원 `29e8c477-dabb-404c-bac4-ba96ffd1e999`와 기존 데모 보호자 1이다. 생성 예정 ID와 개수는 유지한다.

| 대상 | 생성 예정 ID | 내용 |
| --- | --- | --- |
| 수업 1행 | `20a8770d-8001-4b33-978b-01bc46a86d27` | 비공개 피아노 체험수업, 실제 music/piano FK |
| 회차 1행 | `c7fa66c6-27bc-4be4-b7ec-7bb93a31f596` | 2026-10-10 14:00–15:00 KST, 정원 1, 기존 제약상 open |
| 신청 1행 | `c62170cd-4bce-480a-b5aa-474c972a664b` | 체험 완료 데모학생, 등록 여부 미정, 기존 데모 Parent 연결 |

다른 악기 데모나 계정은 실제 DB에 추가하지 않는다. 수업 비공개·과거 회차, trigger/RLS/권한/Push off·중복 중단 조건은 그대로다. 기존 수학 데모 SQL도 수정·재적용하지 않았다.

## 검토 URL과 검증의 구분

- 정상 신청관리: `http://localhost:3000/studio/cases`.
- 기존 수학 회귀 URL: `http://localhost:3000/studio/applications/020993c4-4c97-466a-aeb5-04118e9af764`.
- 음악 검토 예정 URL: `http://localhost:3000/studio/applications/c62170cd-4bce-480a-b5aa-474c972a664b` (**미생성**, SQL 승인·적용 후에만 유효).
- 실제 음악 화면·저장/재진입은 미검증이다. DB가 새 음악 코드를 아직 허용하지 않으므로 **로컬 검토 준비 완료가 아니다**. 실제 V3 보내기도 Parent reader 배포 전까지 보류한다.
- 집중 격리 검증: 실제 음악 마스터의 8개 세부 code 모두 최초 작성·저장·수정·재조회에 같은 9문항, 음악 대분류만 있는 경우/세부 FK에서 대분류를 읽는 경우, 다른 대분류/수업명/legacy 추측 차단, 기존 선택 보존, 미선택 영역 숨김, math/generic/V1/V2/V3·권한·잠금·독립 메모 회귀.
- 공통 실제 component/route/CSS를 네트워크 차단 자동 검증에서 사용한다. Studio 1440/1024, Parent 390, 문항 선택·실패 입력 보존·저장값 재진입·Studio/Parent 미리보기 일치 검사이며 실제 계정 E2E가 아니다.
- 수정 데모 SQL은 폐기 가능한 격리 DB에서 제약·trigger를 유지한 채 3행 추가/기존 행·권한 보존/잘못된 입력·중복 전체 rollback을 검증한다. 실제 SQL 실행 없음.
- typecheck/lint/build/diff-check 및 집중 검증의 로그와 최종 결과는 `/Users/1to6/.codex/artifacts/report-music-20261011`에 기록한다. 무관한 전체 검증은 반복하지 않는다.

DB 적용·실제 데모 생성·리포트 발송·외부 알림·env/계정/MOBILE 변경·commit/push/배포 없음.
