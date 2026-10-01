# Parent App Experience V1 — Phase 1 local implementation

기준: 2026-10-01 fetch한 `origin/main`은 `cd05173931f3e45f5e7964faedb563fbb2c62947`. 기존 작업 branch/dirty/untracked를 유지하면서 로컬에 구현했다. 기준 감사는 `parent-app-experience-v1-audit.md`다. 이번 요청의 `/favorites → Home active`가 감사 당시의 기존 My active 정책보다 우선한다.

## 구현

- `ParentAppShell`: 기존 page/frame을 연결하는 공통 웹 shell. Bottom Nav 호출과 본문 하단 여유 공간을 한 곳에서 담당한다. 기존 URL/route tree는 유지한다.
- `ParentHeader`: Home brand/actions, root title/actions, detail back/title/actions. compact 높이, 긴 제목 ellipsis, Header/Nav 최소 44px hit area. 기존 본문 제목·카드·검색·자녀 선택은 유지한다.
- `ParentBottomNav`: 기존 floating V1 CSS 그대로 사용. Green active, neutral inactive, pill 없음. 기존 `이동 중`도 유지한다.
- `ParentDetailLink` / `ParentBackLink` / `parent-navigation.ts`: 상세 진입 시 현재 목록 URL을 명시적 returnTo로 전달하고, 허용된 내부 Parent URL만 Header back에서 사용한다. 안전한 returnTo가 없으면 기존 canonical 목록으로 복귀한다. 전체 화면을 무조건 history.back으로 바꾸지 않았다.
- Classes의 중복 profile 아이콘 제거. 알림 유지. Home은 로고/알림과 기존 Studio 계정 전용 목적지를 유지한다. MyHub의 avatar/이름/메뉴/profile·탈퇴 sheet는 수정하지 않았다.

## Route matrix

| route | active / header |
|---|---|
| `/` | Home / logo + notification |
| `/classes`, `/academies`, `/favorites` | Home / root title + optional action |
| `/classes/[id]`, `/academy/[handle]` | Home / detail back + title + existing action |
| `/my/schedule` | Schedule / root title |
| `/record` | Record / root title; 설명/콘텐츠 유지 |
| `/record/[experienceId]`, `/record/[experienceId]/report`, `/record/profile` | Record / detail header |
| `/my` | My / title + notification |
| `/my/children`, `/my/applications` | My / detail header |
| `/my/profile` | `/my?edit=profile`로 기존 redirect 유지 + child 보존 |
| `/my?edit=profile` | My / 기존 account sheet |
| `/notifications` | **Nav 없음** / detail header |

신청 task route `/classes/[id]/apply`, auth, 법적 문서, Studio는 새 Nav 적용 범위에서 제외했다. 기존 loading/error frame도 공통 shell을 사용하도록 필요한 연결만 변경했으며 skeleton/대기 문구 전면 개편은 하지 않았다.

## Context / back / 겹침

- 탭에는 child만 전달한다. q/subject/지역/returnTo/edit는 다른 탭에 복사하지 않는다. My는 탭 사이에서 child를 전달하는 역할만 추가하며 데이터 조회 소유권 검증은 기존대로다.
- 기존 sign-in 목적지 override와 중첩된 returnTo를 유지하고, 관련 Parent 인증 진입 주소에도 child 및 안전한 목록 returnTo를 보존한다.
- Classes/Academies 목록 query → 상세 → Header back, Schedule child → 상세 → Schedule, Record detail → report → detail 관계를 명시적 링크로 연결한다. 브라우저 history나 native physical Back의 새 시스템을 만들지 않았다.
- Class detail의 신청 CTA를 Nav 위에 배치하고 본문은 두 영역을 위한 공간을 확보한다. 기록/리포트/교육 프로필 하단도 Nav에 가리지 않게 공통 shell에서 여유 공간을 제공한다.
- 최종 safe-area 조정, keyboard 대응, animation은 다음 Phase다. query가 아닌 기존 컴포넌트 local state/스크롤의 새로운 복원 시스템은 추가하지 않았다.

## 검증 결과

- typecheck / lint / build / `git diff --check`: PASS. lint는 기존 Next lint deprecation 안내만 있으며 lint 오류/경고는 없다.
- build는 실행 중인 localhost의 `.next`에 영향을 주지 않도록 임시 사본에서 수행했다. env 파일을 복사하지 않았고 build runtime만 mock data source로 설정했다. localhost 설정에는 적용하지 않았다.
- `verify-parent-app-shell.ts`: 16-route source 연결·active·Notifications 예외·child/query/auth return·안전하지 않은 return 거부 PASS.
- `verify-parent-app-shell-browser.cjs`: 실제 공통 frame/CSS + fixture 본문, action transport 차단. 15개 주요 화면 × 390/430/480/1280px에서 단일 shell/header/nav, active, 44px, 가운데 정렬, overflow/본문·CTA overlap 검사 PASS. child/filter back, 상세→탭, My edit/alias close, 긴 제목 검사 PASS. runtime 오류 0.
- 기존 Home/Nav/Classes discovery/Academies design/Record home·design/Schedule 회귀 verifier PASS. source assertion 중 페이지 직접 Nav 삽입·이전 active·이전 auth URL을 고정하던 항목은 공통 shell과 이번 정책에 맞게 보강했다.
- MyPage verifier PASS: 실제 MyHub + mock action으로 4개 폭, profile sheet 열기/닫기/focus/오류 보존/저장 및 탈퇴 진입을 확인. Production action은 호출하지 않았다.
- 실제 `localhost:3000`: Home/Classes/Academies/Favorites × 4개 폭, 실제 공개 수업·학원 상세 왕복 및 CTA/Nav 비중첩 PASS. runtime 오류 0. 보호 route는 비로그인 상태에서 sign-in redirect 확인. 이 브라우저 검사에서는 GET/HEAD 외 요청을 차단했다.
- **실제 Parent 계정의 보호 화면 데이터 렌더는 이번 자동검수에서 로그인하지 않았으므로 미검증**이다. 위 보호 화면 검증은 격리된 frame fixture이며 사용자의 기존 계정으로 최종 시각 검수한다. 실제 Android/iOS physical Back/keyboard 검증 완료를 뜻하지 않는다.

검증 증거: `/tmp/parent-app-shell-phase1`, shell fixture `/tmp/parent-shell-browser-W71bmp`, MyPage fixture `/tmp/parent-mypage-verifier-Lv2aKB`. 전용 verifier는 필요 시 기존 설치된 esbuild/playwright 경로를 환경변수로 받아 실행한다. 신규 dependency는 없다.

## Localhost / 변경 범위

- localhost:3000 기존 PID **65995** 유지, 재시작 없음.
- 기존 Production Supabase URL `https://vfkfpekfwrjjocltqbty.supabase.co` 유지. URL shell override 없음. env 파일 변경 없음.
- 검수 진입: `http://localhost:3000/`, `/classes`, `/academies`, `/favorites`, 로그인 후 `/my`, `/my/schedule`, `/record` 및 각 상세. `/notifications`는 Nav 예외 확인.
- 수정 파일 **59개 = 제품 TSX/CSS/함수 49개 + verifier 9개 + 이 문서 1개**. 기존 감사 문서는 수정하지 않았다. 기존 파일 삭제 0, git index 변경 없음.
- Footer와 Nav visual CSS, MyHub/account sheet, 신청 loading 문구는 작업 전 hash와 동일. 기존 Studio·migration 파일도 hash 동일.
- firstsuup-mobile 수정 없음. DB/schema/migration/Auth/운영 데이터 write 없음. commit/push/deploy 없음.

PARENT APP EXPERIENCE V1 PHASE 1 IMPLEMENTED LOCALLY
READY FOR APP SHELL VISUAL REVIEW
