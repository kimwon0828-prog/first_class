# Parent MyPage 계정 UX 통합

> 이 문서는 로컬 구현 단계의 기록이다. 승인된 최종 릴리스 계약과 활성화 조건은 `parent-account-release-v1.md`를 따른다.

기준: 작업 시작 시 fetch한 `origin/main` `86cc8efb1c5fe3053a2222cb4c22850e055874a2`.
기존 작업 브랜치와 dirty/untracked 파일을 유지했다. 수정 대상 기존 제품 파일은 변경 전 최신 main과 동일함을 확인했다.

## 동작

- `/my`: 기본 원형 person 아이콘, 현재 Parent 이름, 내 정보 수정 → 우리 아이 → 내 활동 → 계정 및 서비스 안내.
- 편집 버튼은 `/my?edit=profile` 상태를 열며 이름·연락처·생년월일을 기존 `updateParentProfileAction`으로 저장한다. 이메일이 있으면 읽기 전용 텍스트로 표시한다.
- 실패는 입력값과 sheet를 유지한다. 성공은 제출한 값으로 이름을 즉시 반영하고 sheet를 닫는다. 기존 action의 `/my` revalidation을 유지한다.
- profile detail 조회 실패는 오류/재시도를 표시한다. 기존 `/my/loading.tsx`와 error boundary를 유지한다.
- `/my/profile/page.tsx`는 삭제하지 않고 `/my?edit=profile`로 redirect한다. 비로그인 접근도 로그인 returnTo에 편집 상태를 보존한다.
- 브라우저 뒤로/앞으로로 편집 상태를 이동할 수 있다. 직접 deep link로 진입한 sheet의 닫기는 `/my`에 머문다.
- native dialog 기반 bottom sheet: 배경 inert, Tab/Shift+Tab 순환, Escape·취소·닫기, opener 포커스 복귀. 직접 진입도 편집 버튼으로 포커스를 돌린다. visualViewport 변화와 safe area를 반영하고 내부 스크롤을 제공한다.
- Home 상단 profile icon만 제거했다. 알림 bell, Classes의 profile entry, Bottom Navigation은 유지한다.
- 자녀 `/my/children`, 신청 `/my/applications`, 관심수업 `/favorites`, 정책 `/terms`·`/privacy`·`/third-party-consent`, POST `/auth/sign-out` 계약을 유지한다.
- 회원탈퇴는 마지막 row에서 준비 중 안내를 연다. 신청/삭제 요청이나 성공 처리는 없다.

사진 업로드, Storage, avatar 필드, RPC/migration, 실제 회원탈퇴 backend는 추가하지 않았다. 새 라이브러리도 없다.

## 변경 파일

- `app/my/page.tsx`
- `app/my/profile/page.tsx`
- `app/page.tsx`
- `src/features/my/ui/my-hub.tsx`, `my-hub.module.css`
- `src/features/my/ui/parent-profile-form.tsx`, `parent-profile-form.module.css`
- `src/features/my/ui/parent-account-sheet.tsx`, `parent-account-sheet.module.css` (신규)
- `scripts/verify-parent-home.ts` (승인된 Home header 계약 갱신)
- `scripts/verify-parent-mypage-account.cjs` (신규, 격리된 mock 검증)
- `docs/PARENT_DESIGN_SYSTEM.md` (Home/MyPage 진입 계약 갱신)
- 이 문서

기존 profile server action·query, auth, DB adapter, 정책 본문, Bottom Nav 파일은 수정하지 않았다.

## 검증

| 확인 | 결과/방법 |
|---|---|
| Typecheck / lint | PASS. 제품 코드와 기존 로컬 변경을 함께 확인. |
| Build | 최신 main archive에 이번 변경만 복사한 격리 디렉터리에서 PASS. mock/loopback 환경 사용, localhost 서버와 build 산출물 분리. |
| 기존 Home verifier | PASS. Home profile icon 제거와 bell 유지 계약 반영. |
| 기존 profile action | 실제 함수 코드를 실행하고 인증·DB 의존성만 mock. Parent 역할, 본인 ID 한정, 잘못된 입력, nullable 값, DB 실패, revalidation PASS. |
| 실제 UI 컴포넌트 + mock transport | 390/430/480/1280px 렌더, max-width 480, overflow 없음, MyPage active PASS. |
| Sheet | 열기/닫기, Escape, Tab/Shift+Tab, focus restore, 작은 viewport 스크롤 PASS. 실제 모바일 OS 키보드는 별도 수동 확인 대상. |
| 저장 | 반환형 서버 오류·throw 오류 모두 입력 유지, success 이름 즉시 갱신·닫기·재진입 값 유지 PASS. 모든 저장은 mock. |
| Navigation | browser Back/Forward, 직접 deep-link 닫기, 기존 목적지·로그아웃 form 계약 PASS. UI verifier의 Next navigation은 mock이며 실제 localhost에서는 비로그인 redirect를 별도로 확인. |
| 회원탈퇴 | 안내만 표시, form/action 없음, fake success 없음 PASS. |
| Runtime | 격리 UI 브라우저 pageerror 없음. localhost Home 의미 있는 렌더·bell 유지·profile icon 제거 확인. |
| 정책 HTTP | `/terms`, `/privacy`, `/third-party-consent` 모두 200. |
| 실제 localhost | Production Supabase 연결 유지. `/my/profile` → `/my?edit=profile` → 비로그인 시 `/auth/sign-in?returnTo=%2Fmy%3Fedit%3Dprofile` 확인. 실계정 인증 후 화면/저장은 자동 실행하지 않음. |

`scripts/verify-parent-mypage-account.cjs`는 설치된 도구의 `ESBUILD_MODULE_PATH`와 `PLAYWRIGHT_MODULE_PATH`를 받을 수 있다. 임시 디렉터리에 실제 컴포넌트 bundle을 만들고, 오직 자체 loopback 서버로만 브라우저 요청을 허용한다. Supabase 접속·계정 생성·DB write를 하지 않는다.

React action 반환 후에도 실패 입력이 보존되도록 controlled input을 사용했다. [React form 문서](https://react.dev/reference/react-dom/components/form). 편집 URL은 Next와 연동되는 native history API를 사용한다. [Next navigation 문서](https://nextjs.org/docs/app/getting-started/linking-and-navigating).

## 사용자 검수

현재 localhost 서버에서 기존 Parent 계정으로 `http://localhost:3000/my`를 연다. 직접 편집 진입은 `http://localhost:3000/my?edit=profile`; 과거 주소 `http://localhost:3000/my/profile`도 유지된다.

자동화는 Production profile 저장·Auth 삭제·Storage 삭제를 하지 않았다. commit/push/deploy도 수행하지 않았다. 기존 dirty/untracked·환경 파일·HEAD·index 보존 검사를 통과했고 이번 범위의 13개 파일만 변경됐다. `git diff --check`도 통과했다.
