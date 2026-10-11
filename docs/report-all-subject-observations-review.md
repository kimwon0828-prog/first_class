# 공통 리포트 9개 대분류 · 81문항 검토안

상태: 문항 사용자 검토 및 COMPAT DB 적용 승인 대기. 구현 전에 작성한 검토안이다.

한 번의 체험에서 실제로 확인한 행동만 선택한다. 영역별 선택은 필수가 아니며 선택하지 않은 영역은 리포트에서 숨긴다. 총평·추천 정보·필수 입력은 기존 계약을 유지한다. 특정 도구·활동을 수업에 요구하지 않으며 해당하지 않는 문항은 선택하지 않는다.

분류는 저장된 대분류 FK(또는 세부 과목 FK의 상위 대분류)로 결정한다. 세부 과목별 템플릿이나 수업 제목 추측은 없다. 기존 관찰을 자동 변환하지 않는다. 코드의 의미는 재사용하지 않고 전달본에는 문구·영역을 고정한다.

수학·음악 각 9문항과 승인된 영역 제목은 그대로다. `other` 및 미분류는 기존 범용 7문항이다. 신규 81 + 수학 9 + 음악 9 + 범용 7 = 허용 코드 총 106개. 이 상한은 이전 과목 선택 보존을 위한 저장 상한이며 선택 요구 개수가 아니다.

## 국어·논술 — `korean_language`

실제 대분류 ID: `9c309401-7bdf-4aac-9506-83ce9497ca52`

### 관심과 참여

| 코드 | 관찰 문항 |
| --- | --- |
| `korean_language_asked_about_text` | 읽은 내용에서 궁금한 점을 물었어요 |
| `korean_language_joined_familiar_topic` | 익숙한 이야기나 주제부터 참여했어요 |
| `korean_language_volunteered_thought` | 자기 생각을 먼저 이야기했어요 |

### 읽고 표현한 모습

| 코드 | 관찰 문항 |
| --- | --- |
| `korean_language_found_text_details` | 글에서 필요한 내용을 찾아냈어요 |
| `korean_language_retold_main_content` | 읽은 내용의 중심 생각을 자기 말로 설명했어요 |
| `korean_language_expressed_with_reason` | 생각과 그 이유를 말이나 글로 표현했어요 |

### 안내 후 반응

| 코드 | 관찰 문항 |
| --- | --- |
| `korean_language_reread_after_question` | 질문을 들은 뒤 글을 다시 살펴봤어요 |
| `korean_language_revised_with_example` | 예시를 본 뒤 자기 표현을 고쳐 봤어요 |
| `korean_language_explained_with_prompt` | 단서를 받은 뒤 생각을 이어서 설명했어요 |

## 영어 — `english`

실제 대분류 ID: `b05172cf-eca8-492b-be8a-b08ff3cef4c9`

### 관심과 참여

| 코드 | 관찰 문항 |
| --- | --- |
| `english_responded_familiar_expression` | 익숙한 영어 표현에 반응했어요 |
| `english_asked_expression_meaning` | 궁금한 영어 표현의 뜻을 물었어요 |
| `english_tried_new_expression` | 새로운 영어 표현을 스스로 사용해 봤어요 |

### 듣고 읽고 표현한 모습

| 코드 | 관찰 문항 |
| --- | --- |
| `english_identified_heard_content` | 들은 내용에 맞는 말이나 행동으로 답했어요 |
| `english_found_reading_content` | 읽은 글에서 필요한 내용을 찾았어요 |
| `english_expressed_in_english` | 배운 표현으로 생각을 말하거나 썼어요 |

### 안내 후 반응

| 코드 | 관찰 문항 |
| --- | --- |
| `english_retried_after_model` | 시범을 듣거나 본 뒤 표현을 다시 시도했어요 |
| `english_used_expression_in_context` | 설명을 들은 뒤 다른 상황에 표현을 사용했어요 |
| `english_revised_after_feedback` | 안내를 받은 뒤 말이나 글을 고쳐 봤어요 |

## 과학 — `science`

실제 대분류 ID: `c3b5e55b-4035-47a0-b28e-31f3390ebb76`

### 관심과 참여

| 코드 | 관찰 문항 |
| --- | --- |
| `science_asked_about_phenomenon` | 관찰한 현상에 대해 질문했어요 |
| `science_joined_familiar_phenomenon` | 익숙한 현상을 다루는 활동부터 참여했어요 |
| `science_suggested_investigation` | 궁금한 점을 확인할 방법을 제안했어요 |

### 관찰하고 탐구한 모습

| 코드 | 관찰 문항 |
| --- | --- |
| `science_described_observation` | 관찰한 특징이나 변화를 말로 설명했어요 |
| `science_compared_results` | 예상한 것과 실제 결과를 비교했어요 |
| `science_explained_with_evidence` | 관찰한 내용을 근거로 현상을 설명했어요 |

### 안내 후 반응

| 코드 | 관찰 문항 |
| --- | --- |
| `science_reobserved_with_prompt` | 안내받은 부분을 다시 관찰했어요 |
| `science_retried_inquiry_steps` | 설명을 들은 뒤 탐구 과정을 다시 시도했어요 |
| `science_revised_explanation` | 질문을 받은 뒤 설명을 보완했어요 |

## 사회·역사 — `social_history`

실제 대분류 ID: `08c74dc1-438d-4e86-ad29-b501c7287d12`

### 관심과 참여

| 코드 | 관찰 문항 |
| --- | --- |
| `social_history_asked_about_topic` | 오늘 다룬 주제에 대해 질문했어요 |
| `social_history_connected_known_event` | 알고 있던 일과 연결해 이야기에 참여했어요 |
| `social_history_shared_viewpoint` | 자료를 보고 자기 생각을 먼저 이야기했어요 |

### 자료를 읽고 설명한 모습

| 코드 | 관찰 문항 |
| --- | --- |
| `social_history_summarized_topic` | 배운 내용의 핵심을 자기 말로 설명했어요 |
| `social_history_found_source_details` | 자료에서 필요한 정보를 찾아냈어요 |
| `social_history_explained_with_source` | 자료를 근거로 자기 생각을 설명했어요 |

### 안내 후 반응

| 코드 | 관찰 문항 |
| --- | --- |
| `social_history_rechecked_source` | 질문을 들은 뒤 자료를 다시 확인했어요 |
| `social_history_compared_after_example` | 예시를 본 뒤 공통점이나 차이점을 찾아봤어요 |
| `social_history_added_explanation` | 설명을 들은 뒤 자기 이야기에 내용을 덧붙였어요 |

## 코딩·IT·로봇 — `coding_it_robotics`

실제 대분류 ID: `e30e8a71-d295-4370-a10e-54ff3d5eefa2`

### 관심과 참여

| 코드 | 관찰 문항 |
| --- | --- |
| `coding_it_robotics_explored_task` | 제시된 과제를 살펴보며 활동을 시작했어요 |
| `coding_it_robotics_asked_about_operation` | 동작 방식이나 결과에 대해 질문했어요 |
| `coding_it_robotics_suggested_implementation` | 만들어 보고 싶은 기능이나 방법을 제안했어요 |

### 만들고 수정한 모습

| 코드 | 관찰 문항 |
| --- | --- |
| `coding_it_robotics_described_task_goal` | 만들어야 할 결과를 자기 말로 설명했어요 |
| `coding_it_robotics_implemented_steps` | 생각한 순서에 따라 구현을 시도했어요 |
| `coding_it_robotics_located_error` | 예상과 다른 결과가 나온 부분을 찾아봤어요 |

### 안내 후 반응

| 코드 | 관찰 문항 |
| --- | --- |
| `coding_it_robotics_revised_with_guidance` | 안내를 받은 뒤 구현한 내용을 수정했어요 |
| `coding_it_robotics_retried_smaller_steps` | 과제를 작은 단계로 나눈 뒤 다시 시도했어요 |
| `coding_it_robotics_checked_changed_result` | 방법을 바꾼 뒤 결과가 달라졌는지 확인했어요 |

## 외국어 — `foreign_language`

실제 대분류 ID: `fe4b6b22-28ff-47a6-95fa-e0b1cf635bf4`

### 관심과 참여

| 코드 | 관찰 문항 |
| --- | --- |
| `foreign_language_responded_known_expression` | 알고 있던 표현에 반응하며 참여했어요 |
| `foreign_language_asked_new_expression` | 처음 접한 표현의 뜻이나 쓰임을 물었어요 |
| `foreign_language_initiated_expression` | 배운 언어로 먼저 말하거나 써 봤어요 |

### 이해하고 표현한 모습

| 코드 | 관찰 문항 |
| --- | --- |
| `foreign_language_showed_content_understanding` | 듣거나 읽은 내용에 맞게 답했어요 |
| `foreign_language_expressed_with_learning` | 배운 말이나 문장으로 생각을 표현했어요 |
| `foreign_language_used_context_expression` | 주어진 상황에 맞는 표현을 골라 사용했어요 |

### 안내 후 반응

| 코드 | 관찰 문항 |
| --- | --- |
| `foreign_language_retried_after_example` | 예시를 듣거나 본 뒤 표현을 다시 시도했어요 |
| `foreign_language_applied_guided_expression` | 안내받은 표현을 다른 상황에 활용했어요 |
| `foreign_language_revised_expression` | 설명을 들은 뒤 말이나 글을 고쳐 봤어요 |

## 미술·디자인 — `art_design`

실제 대분류 ID: `40dd842a-c75f-48cf-9098-934ca56c81ec`

### 관심과 참여

| 코드 | 관찰 문항 |
| --- | --- |
| `art_design_explored_expression` | 여러 표현 방법을 살펴보며 참여했어요 |
| `art_design_started_familiar_method` | 익숙한 표현 방법부터 시도했어요 |
| `art_design_proposed_idea` | 만들고 싶은 모습이나 아이디어를 제안했어요 |

### 탐색하고 표현한 모습

| 코드 | 관찰 문항 |
| --- | --- |
| `art_design_expressed_intention` | 자기 생각을 작품에 표현했어요 |
| `art_design_tried_taught_method` | 배운 방법을 작품에 사용해 봤어요 |
| `art_design_described_choices` | 표현 방법을 선택한 이유를 이야기했어요 |

### 안내 후 반응

| 코드 | 관찰 문항 |
| --- | --- |
| `art_design_retried_after_demonstration` | 시범을 본 뒤 표현 방법을 다시 시도했어요 |
| `art_design_adjusted_expression` | 안내를 받은 뒤 작품의 일부를 바꿔 봤어요 |
| `art_design_continued_in_steps` | 과정을 작은 단계로 나눈 뒤 작업을 이어갔어요 |

## 체육·무용 — `sports_dance`

실제 대분류 ID: `a2e56c44-f2b5-4e4f-ad63-305970f11db1`

### 관심과 참여

| 코드 | 관찰 문항 |
| --- | --- |
| `sports_dance_joined_warmup` | 준비 활동부터 몸을 움직이며 참여했어요 |
| `sports_dance_started_familiar_movement` | 익숙한 동작부터 시도했어요 |
| `sports_dance_attempted_new_movement` | 새로운 동작이나 활동을 스스로 시도했어요 |

### 움직이고 수행한 모습

| 코드 | 관찰 문항 |
| --- | --- |
| `sports_dance_followed_movement` | 제시된 동작을 따라 해 봤어요 |
| `sports_dance_connected_movement_sequence` | 배운 동작을 순서대로 이어갔어요 |
| `sports_dance_adjusted_to_rules` | 활동의 규칙이나 약속에 맞춰 움직였어요 |

### 안내 후 반응

| 코드 | 관찰 문항 |
| --- | --- |
| `sports_dance_retried_after_model` | 시범을 본 뒤 같은 동작을 다시 시도했어요 |
| `sports_dance_continued_slow_steps` | 속도를 낮추거나 동작을 나눈 뒤 이어갔어요 |
| `sports_dance_adjusted_after_guidance` | 안내받은 부분을 바꿔 움직여 봤어요 |

## 창의·두뇌 — `creative_mind`

실제 대분류 ID: `9f2e4d8a-9d21-4a25-a016-299eb052a442`

### 관심과 참여

| 코드 | 관찰 문항 |
| --- | --- |
| `creative_mind_explored_problem` | 주어진 문제나 활동을 살펴보며 참여했어요 |
| `creative_mind_began_known_method` | 알고 있던 방법부터 시도했어요 |
| `creative_mind_proposed_alternative` | 다른 방법으로 해 보자고 제안했어요 |

### 방법을 찾고 해결한 모습

| 코드 | 관찰 문항 |
| --- | --- |
| `creative_mind_compared_methods` | 여러 방법의 결과를 비교했어요 |
| `creative_mind_explained_strategy` | 자기가 선택한 방법을 설명했어요 |
| `creative_mind_changed_strategy` | 막힌 부분에서 방법을 바꿔 시도했어요 |

### 안내 후 반응

| 코드 | 관찰 문항 |
| --- | --- |
| `creative_mind_used_hint` | 힌트를 들은 뒤 다음 단계를 시도했어요 |
| `creative_mind_retried_small_problem` | 문제를 작은 단계로 나눈 뒤 다시 풀어 봤어요 |
| `creative_mind_applied_example_method` | 예시에서 본 방법을 비슷한 문제에 사용했어요 |

## 기존 데모 활용과 부족한 사례

- 영어: `638cf258-3224-49d2-be01-e44c6db1b42e` — 완료·미전달·기존 기록 있음.
- 코딩·IT·로봇: `312ab2ab-5018-4df0-9f01-eb6c7ab72ebd` — 완료·미전달·기존 기록 있음.
- 위 사례의 상태·과목·기록을 에이전트가 수정하지 않는다. 사용자가 DB 적용 후 직접 검토하며 이전 관찰은 보존한다.
- 국어·논술, 과학, 사회·역사, 외국어, 미술·디자인, 체육·무용, 창의·두뇌: 적합한 기존 사례 없음. 각 비공개 수업·과거 회차·완료 신청 1개씩, 총 21행의 미적용 SQL만 준비한다.
- 기존 수학·음악 데모와 계정을 그대로 보존한다. 새 계정·리포트 원본·발행본은 준비 SQL에 포함하지 않는다.

## 생성 승인 대기 ID (실제 DB 미생성)

| 대분류 | 실제 세부 과목 FK 코드 | 수업 | 회차 | 신청 |
| --- | --- | --- | --- | --- |
| 국어·논술 | `korean` | `fc2a65a7-a049-47f0-a99c-cadc89c4a7a8` | `b4745226-419e-4bf4-926b-1a1291480698` | `c830f295-62f3-47f9-8712-a77a23f3cec8` |
| 과학 | `science` | `dcffc2d6-eb5e-4960-af90-4d6ccfa4de99` | `3dd31933-aab3-49f3-ac4b-462868a6b5e4` | `1930955b-ef54-4a5c-8a9e-5b4cd6c5ac15` |
| 사회·역사 | `social` | `d8d49de7-8535-4614-b455-285fdd1261f9` | `61cbbe75-4330-419f-8f62-1202eef6eeef` | `7dbf219a-f7cc-46dd-aa09-1c640026451f` |
| 외국어 | `chinese` | `1aafd1e9-fcff-4b29-99a7-4e199d17e501` | `22965749-f1f3-41f4-abb8-98cb39bed070` | `8fdd8af8-67a7-4c4b-b679-7709e84999ff` |
| 미술·디자인 | `art` | `da93f169-f413-41f1-b2fd-6a6932b007b4` | `3971a109-4c2c-4521-bc95-829499014bdf` | `41645455-4ece-4637-a3ba-fe9202a96907` |
| 체육·무용 | `taekwondo` | `d724b52b-7f36-43aa-bbfb-6781a21bc4b1` | `d233bebe-a47d-4e1f-9819-0d6bc1bb114b` | `386f42b9-9b43-45fe-9397-6bd1733620fa` |
| 창의·두뇌 | `chess` | `05250fa4-77fe-480a-a336-ae7bf368f416` | `248e0413-9f9a-41bb-bf70-8af02b047159` | `e41261ca-90c9-4549-b3a3-74a1c9c33d00` |

## DB 승인 대상과 적용 순서

두 파일 모두 실제 DB 미적용이다. 사용자가 문항과 SQL을 검토·승인한 다음 COMPAT migration, 데모 준비 SQL 순서로 적용한다. 이번 작업은 승인 요청 대상을 준비할 뿐 실제 쓰기를 실행하지 않는다.

- `supabase/migrations/20261011200000_report_subject_observations.sql`
  - SHA-256: `9f8d1aa7410a1fe26f62f481d0c4060b9957cef9b796f40ae5702328b4aab785`
- `docs/sql/manual/20261011_prepare_report_subject_demos.sql`
  - SHA-256: `1e9efc5bf7e103c91ea99e387af2aff32d61786efaaec9e24f2cb12f4c89621d`

Migration 범위: 기존 관찰 CHECK 허용 집합/상한 25→106, label/group 함수에 새 81개 문구·영역 추가, private 과목 helper에 9개 실제 대분류 조건 추가, 저장 RPC의 상한 한 표현만 변경. 최초 작성 RPC와 수정 RPC는 기존 동일 helper를 사용한다. 저장 RPC 정의 MD5가 검토값과 다르면 전체 중단한다. V2는 이미 영역 있는 문항을 차단하며 V3 publisher는 기존 label/group 함수를 사용하므로 둘 다 수정하지 않는다.

새 테이블/RPC/권한/RLS/trigger 없음. 기존 데이터 재작성·기존 선택 자동 변환 없음. 이미 적용된 수학/음악 migration 및 데모 SQL은 수정/재실행하지 않았다. 코드별 새 문구와 기존 코드 집합을 모두 보존하며, 전달본의 문구·영역은 snapshot에서 그대로 읽는다.

데모 SQL 범위: 첫수업 데모학원과 기존 데모 보호자 1만 사용한다. 위 7개 대분류의 수업·회차·신청 각 7개, 총 21행. 모든 수업 비공개, 2026-10-10 14:00–15:00 KST 과거 회차, 체험 완료·등록 여부 미정. 기존 제약에 따라 회차 booking_status는 open이며 수업 비공개로 모집을 막는다. 중복·기존 계정·실제 FK·적용 문항·trigger fingerprint·RLS·Push off가 검토 조건과 다르면 전체 rollback한다. 기존 영어/코딩/수학/음악 수업과 신청은 수정하지 않는다. 새 계정·연락처 복사·리포트 원본·발행·활동/알림 로그는 만들지 않는다.

## 정상 3000 검토와 실제 검증의 구분

실행 소스: `/Users/1to6/Desktop/firstsuup-report-math-review`.

- 영어 기존 사례: http://localhost:3000/studio/applications/638cf258-3224-49d2-be01-e44c6db1b42e
- 코딩 기존 사례: http://localhost:3000/studio/applications/312ab2ab-5018-4df0-9f01-eb6c7ab72ebd
- 수학 회귀: http://localhost:3000/studio/applications/020993c4-4c97-466a-aeb5-04118e9af764
- 음악 회귀: http://localhost:3000/studio/applications/c62170cd-4bce-480a-b5aa-474c972a664b
- 나머지 7개는 위 표의 신청 ID로 URL이 정해지지만 **아직 생성되지 않았다**.

수학·음악의 실제 정상 동작은 사용자가 확인했다고 보고한 사항이다. 에이전트가 이번에 실제 저장을 관측한 것은 아니다. 브라우저 연결 도구는 연결된 브라우저가 없음을 반환했다. 새 9개 대분류의 실제 로그인 화면·저장·재진입은 미검증이다. 실제 DB가 신규 81개 코드를 아직 허용하지 않으므로 **로컬 검토 준비 완료가 아니다**.

Parent V3 reader Production 배포 전까지 실제 리포트 보내기는 계속 보류한다. 고객 데이터 쓰기·외부 알림·commit/push/배포 없음. 새로운 디자인·신청관리·이미지 첨부·환경설정·MOBILE 변경 없음.

## 집중 검증 결과

- PASS: 실제 마스터 12개 대분류·64개 세부 과목 읽기 확인. 추가 9개 대분류와 소속 세부 FK 연결, 최초 작성/수정/재조회, 다른 대분류 코드 180건 차단, 제목/legacy 텍스트 추정 차단, 과목 변경 후 이전 선택 유지·명시 해제.
- PASS: 허용 106개 전체의 SQL label/group과 공통 UI 목록 일치, 이전 범용/수학/음악 25개의 label/group 동일. 신규 81개 검토 문서·선택 코드·문구 일치. 9개 대분류의 실제 격리 V3 발행 결과와 TS 미리보기 deep-equal.
- PASS: V1/V2/V3와 기존 기록 보존, 빈 영역 숨김, 106개 보존 상한 및 초과/알 수 없는 값 차단, 발행 후 공개 내용 수정/재전달 차단, Parent/타 학원/anon 권한 경계, 메모 독립 수정·충돌 및 등록 결과 경로 유지.
- PASS: 공통 실제 route/component/CSS를 네트워크 차단 fixture에서 실행한 Studio 1440/1024·Parent 390. 추가 9개와 수학/음악의 문항 선택·이전 선택 표시·실패 입력 유지·재진입·미리보기/Parent 동일 문구·미선택 영역 숨김·가로 넘침 없음. 실제 계정 E2E로 계산하지 않는다.
- PASS: 데모 SQL은 격리 DB에서 정확히 21행 추가, 기존 행·권한 유지, 실제 제약/trigger 일치, 잘못된 조직/Parent/과목/회차/중복 중단 시 원자적 rollback. 실제 DB 미적용.
- PASS: typecheck / lint / build / diff-check. NEW FAILURES=0. Build는 실행 중인 3000의 캐시를 건드리지 않도록 동일 runtime 소스 사본에서 수행했다. 기존 Next lint deprecation 및 webpack cache 성능 안내 외 신규 오류 없음.
- 정상 localhost:3000 기존 PID/cwd 유지. 비인증 URL 요청은 307 로그인 이동이며 실제 로그인 화면 성공을 의미하지 않는다. 원래 WEB/MOBILE/phase1-review의 HEAD·branch·staged·dirty·untracked·env 보존을 검사했다.

검증 산출물: `/Users/1to6/.codex/artifacts/report-all-subjects-20261011`. 문항 검토 → SQL 별도 승인 → 실제 계정 저장 검토 순서가 남아 있다.
