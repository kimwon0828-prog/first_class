# 리포트 사진 첨부 — 승인된 Production 반영

기준 origin/main: `e55942f0c03fa18848d06dca6b0e7932dd4d4355` (작업 시작 fetch 확인).
작업 및 정상 3000: `/Users/1to6/Desktop/firstsuup-report-math-review`.
기존 미커밋 공통 리포트 작업·등록 상담 메모를 유지하고, 배포된 `신규 신청` 문구만 정확한 main 원문으로 합쳤다. branch/HEAD/index/env는 바꾸지 않았다.

## 화면과 제한

승인 이미지 `exec-6f18c7b5-3ce7-445e-96af-aa8c85866069.png`를 열어 확인했다. 기존 편집창의 총평 → 사진 첨부 → 접힌 추천 정보 순서다. 총평 1,000자 제한은 유지한다.

- 사진은 선택이며 최대 **6장**, 파일당 **4MiB (4,194,304 bytes)**, **2,400만 화소**, **JPEG / PNG / 정지 WebP** 지원. 설명은 선택, 최대 100자.
- HEIC, GIF, 애니메이션, SVG, PDF 등은 지원하지 않는다. 실제 바이트 식별 + 브라우저 디코딩과 서버 전체 디코딩을 각각 검사한다. 확장자/MIME만 믿지 않는다. 서버는 EXIF/GPS 등 메타데이터를 제거하고 회전 방향을 바로잡는다. 화소를 자르거나 결과지 비율을 바꾸지 않는다. 서버 처리 후에도 4MiB 제한을 적용한다.
- 서버에서 `sharp@0.34.5`를 직접 사용한다. 기존 Next 의존성으로 설치되어 있던 동일 버전을 직접 의존성에 명시했다. 클라이언트 bundle에는 포함하지 않는다.
- 업로드 중/실패한 파일은 기록 저장을 막고 완료·다시 시도·제외 행동을 제공한다. 총평·관찰·설명을 유지한다. 버튼 클릭만으로 리포트를 보내지 않는다.
- 사진 삭제는 편집 목록에서만 처리하며 저장 전 삭제 취소가 가능하다. 편집 취소는 기존 저장값을 보존한다. 추가 업로드는 취소 시 버려진 미참조 파일로 남아 아래 정리 대상이 된다.
- Parent와 Studio는 `ReportPhotos`를 같이 사용한다. 저장 순서·설명을 표시하고 첨부가 없으면 전체 영역을 숨긴다. 사진 확대 dialog는 1–4배 버튼, 모바일 가로/세로 스크롤·핀치, 닫기/Escape/키보드 포커스를 제공한다. 세로 결과지를 crop하지 않는다. Parent에는 편집 버튼이 없다.

## 저장·권한·잠금

기존 Storage 확인: 공개 `class-covers`, 공개 `academy-profile-assets`, 비공개 `academy-documents`. 이 버킷과 기존 정책을 수정하지 않는다.

새 `report-attachments` 비공개 버킷과 `report_attachment_files` registry를 제안한다. registry가 필요한 이유는 **기록 최초 저장 전 업로드도 존재**하고, 파일의 불변 ID·업로드 완료 상태·미참조 정리 수명이 총평 및 수정 가능한 첨부 설명과 다르기 때문이다. 실제 첨부 목록·순서·설명은 기존 `trial_results.attachments` JSONB에 저장한다. 별도 리포트 초안/작성 화면은 없다.

1. 실제 인증/학원 역할/기록 entitlement 확인 → byte/pixel 검사 → authenticated `reserve_report_attachment`가 기존 완료·학원·발행 잠금을 검사한다.
2. 서버만 private Storage에 새로운 UUID 경로로 `upsert:false` 업로드한다. 서버 전용 `finish_report_attachment`만 디코딩된 치수·MIME·용량으로 ready 상태를 만든다. 실패는 failed 상태로 남긴다. 10분 지난 업로드는 완료할 수 없다. 앱 API timeout 60초, 활성 업로드는 저장·발행을 막는다.
3. 기존 기록 저장 action → 새 `save_studio_trial_result_with_attachments`. 기존 save RPC의 과목·필수값·소유권·완료·revision 검증을 그대로 호출하고 같은 transaction에서 첨부를 갱신한다. 다른 신청의 파일·중복 ID·미완성/정리중 파일·초과 설명은 거부한다. 서버가 registry에서 치수/MIME를 조립하며 사용자 입력으로 경로나 파일을 바꾸지 못한다.
4. source/발행본 잠금 trigger는 변경하지 않는다. 발행 후 원본 공개 내용과 첨부 변경·재발행은 차단되고 등록 상담 메모는 기존 독립 RPC로 수정된다.
5. 파일 GET `/api/report-attachments/[id]`는 매번 실제 인증 + authenticated `read_report_attachment` 권한 판정을 거친다. 같은 학원의 academy/admin, 또는 자신에게 현재 published 상태로 전달된 V4 snapshot의 파일만 허용한다. Parent는 미발행/다른 신청/철회본을 읽지 못한다. 등록 상담 메모는 어떤 snapshot에도 들어가지 않는다.
6. Storage에 직접 접근하는 anon/authenticated는 해당 bucket의 SELECT/INSERT/UPDATE/DELETE를 restrictive 정책으로 거부한다. 서버 서비스 키는 이미 있는 설정을 재사용하며 클라이언트에 전달하지 않는다. 응답은 private/no-store, nosniff, same-origin이다. 공개 URL·signed URL을 생성하거나 snapshot에 저장하지 않는다.

## 버전과 배포 순서

기존 V3 decoder는 미지의 최상위 필드를 거부한다. 따라서 새 **V4** snapshot의 `attachments`에 안정적인 파일 ID·순서·설명·치수·MIME를 고정한다. V1/V2/V3 reader는 그대로 지원하며 기존 전달본을 재작성하지 않는다. 사진 없는 신규 발행은 V3를 유지한다. 기존 V2/V3 발행 RPC는 첨부가 있으면 `attachment_reader_required`로 중단하여 사진을 조용히 누락하지 않는다.

별도 승인한 COMPAT DB·Storage → **Parent V4 reader Production 준비 확인 → Studio V4 보내기 배포/사용** 순서다. 같은 배포 단위라면 동일 승인 commit에서 두 화면이 반영됐는지 확인해야 한다. 실제 첨부 리포트 보내기는 그 전까지 금지한다. 이번에는 로컬 코드와 격리 검증만 수행한다.

## 파일 정리

자동 스케줄/운영 UI/일괄 삭제는 추가하지 않았다. `scripts/cleanup-report-attachments.cjs`는 운영자용이며 지정한 UUID 최대 50개만 다룬다. 기본 실행은 조회 preview이고 `--execute`는 별도 운영 승인 후에만 사용한다. 이번 작업에서는 실제 파일을 조회·업로드·삭제하지 않았다.

7일 이상 지난 미참조 파일만 claim 가능하다. 현재 저장된 첨부 및 모든 발행 이력(철회 포함)의 참조는 제외한다. application → registry 순서로 잠그고 state를 deleting으로 바꿔 동시 저장/발행과 경합하지 않는다. Storage 삭제 성공 후만 deleted로 확정한다. 네트워크 실패 시 claim을 유지해 같은 명시 ID로 재시도하며 파일을 다시 첨부하지 못한다. 삭제로 사라지는 전달본은 없다. 사용자 편집 삭제 자체가 Storage 삭제를 호출하지 않는다.

## 승인 migration (실제 적용 완료)

- `supabase/migrations/20261011220000_report_photo_attachments.sql`
- 새 registry 1개, trial_results JSONB 컬럼 1개, 비공개 버킷 1개, 해당 버킷에만 제한하는 Storage 정책 4개.
- 예약/완료/실패/읽기/원자 저장/V4 발행/정리 RPC. 서비스 전용 RPC의 authenticated/anon/PUBLIC 실행은 차단.
- 기존 V2/V3 발행 함수에는 첨부 누락 및 업로드 중 발행 방지 guard만 추가. 기존 source lock/Parent RLS/과목 함수/등록 메모/고객 데이터는 변경하지 않는다.
- 적용 시 원문 해시와 프로젝트 `vfkfpekfwrjjocltqbty`, 현재 함수·이력을 다시 확인해야 한다. 기존 과목 migration/데모 준비 SQL 재적용 금지.

SHA-256: `7543bdb23a5818cc9b69e887e23317050b031f428e7c0e7bf216ae3da3aaf990`

## 검토 URL과 검증 구분

- 수학: http://localhost:3000/studio/applications/020993c4-4c97-466a-aeb5-04118e9af764
- 음악: http://localhost:3000/studio/applications/c62170cd-4bce-480a-b5aa-474c972a664b
- 실제 계정 연결·정상 3000/env는 유지한다. 고객 및 데모 데이터 저장/실제 업로드/보내기/외부 알림/commit/push/배포 없음.
- 새 DB/Storage가 미적용이므로 실제 첨부 저장이 불가능하다. **로컬 검토 준비 완료가 아니며 DB/Storage 적용 승인 대기**다.
- 브라우저 연결 목록이 비어 있어 실제 로그인 화면·업로드·저장·새로고침 유지·실기기 핀치 검증은 미완료다. 비인증 health 200, 지정 상세 307 정상 로그인 이동, 파일 GET 404 차단만 실제 3000에서 관측했다.
- 자동 검증은 실제 route/component/CSS를 사용하는 네트워크 차단 fixture 및 독립 PostgreSQL rehearsal DB다. 별도 사용자용 fixture route/로그인/검토 포트는 만들지 않았다. 사진 샘플은 격리용 활동 이미지와 세로 결과지이며 고객 사진이 아니다.

참고: [Supabase private bucket](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [sharp output metadata](https://sharp.pixelplumbing.com/api-output/).

## 최종 검증 기록

- typecheck / lint / build / diff-check PASS. build는 정상 3000의 `.next`를 건드리지 않는 소스 사본에서 실행했으며 최종 runtime 679개 파일의 해시 일치를 확인했다.
- 독립 PostgreSQL: 첨부 최초 저장·순서·설명·삭제·재조회·동시 CAS·원자 실패·활성 업로드 차단·발행 잠금·V4 snapshot 고정·V3 무첨부·기존 발행본·학원/Parent/anon 권한·Storage restrictive 정책·독립 메모·참조 파일 정리 제외 PASS. 기존 35개 테이블 값(새 컬럼 제외)과 source lock 정의 보존.
- 실제 서버 이미지 디코더: JPEG/PNG/WebP, 잘못된 MIME·깨진 파일·용량/화소 초과·EXIF 제거·방향 보정 PASS. 실제 업로드/조회 API를 격리 auth/RPC/Storage 경계에서 실행하여 비로그인/역할/CSRF/실패 처리/no-overwrite/no-store 검증 PASS.
- 실제 기록 저장 action: 첨부 형식·중복·설명 제한, 11개 과목 검증·기존 선택 보존·등록 상담 메모 독립성 PASS. TS 미리보기와 격리 DB V4 snapshot deep-equal PASS. V1/V2/V3 관련 회귀 PASS.
- 실제 route/component/CSS의 네트워크 차단 UI: Studio 1440/1024, Parent 390에서 사진 추가·삭제 취소·순서·설명·저장 요청·격리 재진입·취소·실패 보존·재시도, 빈 영역 숨김, 원본 비율과 확대 후 2축 스크롤을 확인했다. 수학·음악·추가 9개 작성·미리보기·Parent 회귀 PASS.
- 검사에서 숨긴 file input에 기존 modal 스타일이 적용되는 가로 넘침을 발견해 해당 컴포넌트만 수정했다. 검증 도구의 빈 초기 레코드/CAS no-op/catalog 경로/저장 시 설명 trim 가정도 바로잡았다.
- 실제 Storage API 왕복, 실제 로그인 화면, 실제 업로드·저장·새로고침 유지·발행 및 실기기 핀치는 **미검증**이다. 격리 성공이나 health 응답으로 대체하지 않는다.
- 원래 WEB/MOBILE 전체 파일·branch/HEAD/index/dirty/untracked/env 보존 확인. 검토 workspace HEAD/index/env와 기존 미커밋 자료 보존. 실제 DB·Storage 버킷/정책 전후 일치, pending migration 미적용, 자동 Push OFF 확인.
- 증거: `/Users/1to6/.codex/artifacts/report-photos-20261011`. 고객 데이터 및 실제 파일 업로드 없음.

## Production 반영 시 확인 (2026-10-11)

- 위 미적용/미검증 기록은 최초 구현 시점 기록이다. 이후 사용자 승인으로 해당 SHA-256 원문의 migration 1개를 실제 DB/Storage에 적용했고, 적용 이력과 API 반영·권한·기존 데이터 보존을 확인했다. 배포 작업에서는 원문/이력만 조회하고 재적용하지 않는다.
- 사용자가 실제 계정의 로컬 사진 첨부 검토 완료를 보고하고 commit/push/Production 배포를 승인했다. 에이전트가 실제 업로드·저장·발행을 직접 관측한 것으로 간주하지 않는다.
- Parent V4 reader, 파일 조회 API, Studio 첨부/V4 발행은 동일 Next.js 프로젝트와 동일 승인 commit에 함께 배포한다.
- 자동 파일 정리/스케줄은 없으며, 배포 검증 중 실제 파일 업로드·삭제·리포트 저장·보내기를 실행하지 않는다.
