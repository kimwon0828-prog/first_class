# Parent App Experience V1 — Short Audit

- 기준: 2026-10-01 작업 시작 시 `git fetch origin` 완료. 최신 `origin/main`: `cd05173931f3e45f5e7964faedb563fbb2c62947`.
- 방법: 최신 main을 별도 임시 디렉터리에 추출하여 route → frame/component → CSS/caller를 정적 조사. `docs/PARENT_DESIGN_SYSTEM.md`, MyPage 계정 UX 문서, Parent Account Release 문서를 기준으로 확인.
- 로컬 작업 트리는 main과 다르므로 현재 localhost 화면을 최신 main의 증거로 사용하지 않았다. 기존 변경 파일과 localhost 서버를 유지했다.
- 범위: 아래 웹 route와 공통 UI, `firstsuup-mobile/App.tsx` 읽기만. 실기기 WebView/키보드/화면 측정은 수행하지 않았다. 코드로 확인한 사실과 기기 검증이 필요한 위험을 구분한다.
- 이번 변경은 이 문서뿐이다. 제품/Studio/native 코드, DB/Auth/schema/migration, 환경 파일 변경 및 commit/push/deploy 없음.
- 동일 기준의 후속 SHORT AUDIT 요청을 반영했다. 이번 산출물은 구현 전 App Shell mockup 범위이며 mockup/제품 구현은 수행하지 않는다.

## 1. 결론: 웹처럼 느껴지는 원인 TOP 5

1. **페이지 단위 shell**: Bottom Nav 컴포넌트는 하나지만 호출부가 분산되어 탐색·상세 화면에서 사라진다. Home의 로딩 fallback에서도 사라진다.
2. **상단 패턴 불일치**: 24px 페이지 제목과 설명형 header, sticky/non-sticky, 화살표 도형, 고정 목적지 back이 혼재한다. Classes에는 profile 진입도 남아 있다.
3. **화면 전환의 단절**: 탭 label이 `이동 중`으로 변하고, 신청 fallback은 화면 전체에 대기 문구를 표시한다. 다른 화면들은 이미 skeleton을 갖췄지만 header/nav의 지속성이 다르다.
4. **하단 레이어의 불일치**: 거의 불투명한 glass, nav 없는 상세의 fixed CTA, 제각각인 safe-area/viewport 처리가 한 앱의 일관된 하단 영역을 만들지 못한다.
5. **웹 링크/history 중심 흐름**: 목록 조건이 일부 소실되고, sheet 닫기와 물리 Back 정책이 다르다. MyPage의 corporate footer도 마지막에 웹 문서 느낌을 보탠다. Footer가 모든 Parent 페이지에 있다는 가정은 사실이 아니다.

## 2. 주요 route별 현재 App Shell

`Nav 있음`은 정상 화면 기준이다. 대부분 `data-parent-design="v1"`에 opt-in했지만 Parent 공통 layout은 없다. `app/layout.tsx`는 전체 서비스 공용이며 body에 account boundary와 children만 배치한다.

| Route | 현재 header / 구현 위치 | Nav | Footer | Loading 판정 |
|---|---|---|---|---|
| `/` | `app/page.tsx`: 로고·알림, 지역·자녀 행. 중복 profile 제거 완료 | 있음, page 직접 호출 | 없음 | A+D: `HomeLoading` skeleton 유지, fallback의 nav 부재 개선 |
| `/classes` | page: 홈 back + 수업찾기 H1 + 알림 + profile | **없음** | 없음 | A+D: `loading.tsx`와 page Suspense skeleton, header/back 지속성 개선 |
| `/classes/[id]` | page: 수업 상세 + back + 찜; 본문 수업명 H1 | **없음** | 없음 | A+D: 상세 skeleton 유지, fallback back 부재 개선 |
| `/academies` | `AcademiesFrame`: 홈 back + 학원 찾기 | **없음** | 없음 | A: page 내부 Suspense + skeleton |
| `/academy/[handle]` | `AcademyDetailFrame`: 목록 back + 학원 소개 | **없음** | 없음 | A: frame 유지 + `loading.tsx` skeleton |
| `/my/schedule` | `ScheduleFrame`: 내 일정 H1 | 있음, frame 호출 | 없음 | A: `loading.tsx` → ScheduleSkeleton |
| `/record` | `RecordFrame`: 기록 H1 + 설명 | 있음, frame 호출 | 없음 | A: page Suspense → RecordSkeleton |
| `/record/[id]` | 실제 `[experienceId]`: 기록/신청 현황 back + 체험 기록/신청 정보 | **없음** | 없음 | A+D: skeleton은 있으나 back 사라짐 |
| `/record/[id]/report` | `ReportFrame`: 체험 리포트 + 조건부 back | **없음** | 없음 | A+D: skeleton frame에 backHref가 없어 back 사라짐 |
| `/my` | `MyFrame`: 마이페이지 + 알림 | 있음, frame 호출 | **있음** | A: MyFrame + skeleton |
| `/my/children` | `ChildrenFrame`: My back + 자녀 관리, sticky | 있음, frame 호출 | 없음 | A: frame + skeleton |
| `/my/applications` | `ApplicationsFrame`: My back + 신청 현황, sticky | 있음, frame 호출 | 없음 | A: loading 및 page Suspense + skeleton |
| `/favorites` | `FavoritesFrame`: My back + 관심수업 + 브라우저 저장 안내 | 있음, frame 호출 | 없음 | A: frame + skeleton |
| `/notifications` | `NotificationsFrame`: 홈 back + 알림 | **없음: 의도된 예외** | 없음 | A: frame + skeleton |

추가 조사: `/record/profile`도 nav 없음. `/my/profile` 정상 응답은 `/my?edit=profile` redirect이며, 이전 `ProfileFrame`은 loading/error에서 nav를 렌더한다. `/classes/[id]/apply` 별도 신청 route는 nav 없이 fixed submit을 갖는다.

### 화면별 A/B/C 판단

A는 웹페이지처럼 느껴지는 원인, B는 공통 shell 적용 가능성, C는 본문 디자인을 유지한 개선 범위다. 아래 전 화면에서 본문 redesign은 필요하지 않다.

| 화면 | A: 원인 | B: 공통화 | C: 기존 화면을 유지할 범위 |
|---|---|---|---|
| Home | loading 때 nav/header 단절 | 가능: Home header | 로고·검색·추천 그대로, shell 지속 |
| Classes | nav 없음, 상단 action 밀집 | 가능: 탐색 header | 필터·카드 유지, profile 중복과 전환 정리 |
| Class detail | nav 없음, fixed CTA 독립 배치 | 가능: detail + 하단 CTA 슬롯 | 수업 정보·신청 흐름 유지 |
| Academies | nav 없음, 홈 고정 back | 가능: 탐색 header | 지역/검색·목록 유지 |
| Academy detail | nav 없음, 목록 query 소실 | 가능: detail | 학원 소개·수업 목록 유지 |
| Schedule | 제목 블록·상세 복귀 단절 | 가능: root header | 일정 카드·탭 유지, child/back 보존 |
| Record | 제목+설명 블록, 독립 frame | 가능: root header | 자녀 선택·기록 카드 유지 |
| Record detail | nav/back·loading 패턴 단절 | 가능: detail | 기록·feedback·decision 유지 |
| Report | nav 없음, loading back 없음 | 가능: detail | 리포트 본문·발행 snapshot 유지 |
| My | 독립 header·corporate footer | 가능: root header | 메뉴·계정 sheet 유지 |
| Children | 독립 sticky header | 가능: detail | 자녀 form·row 유지 |
| Applications | 독립 sticky header | 가능: detail | 신청 상태·카드 유지 |
| Favorites | 독립 header·My 고정 back | 가능: detail | 찜 카드·저장 안내 유지 |
| Notifications | 진입 경로와 다른 홈 back | 가능: nav 없는 shell | 알림 row·읽음 계약 유지 |

## 3. Header: 웹 공통 App Header로 통일

- Home은 이미 **logo / notification** 구조이므로 유지. 프로필 중복이 남아 있다고 보고하면 안 된다.
- Classes는 `searchTitle`에 `--font-h1`(모바일 24px), back·알림·profile까지 한 행에 있다. nav 보장 이후 profile 진입 중복을 정리할 후보다.
- Schedule/Record는 H1 24px와 상하 24px 공간, Record 설명문으로 콘텐츠형 제목 블록을 사용한다. My는 별도 header, Children/Applications는 sticky header다. 모든 화면이 과도하게 큰 제목인 것은 아니다.
- detail의 back은 chevron, 꼬리 있는 SVG, 리포트의 문자 `←`로 다르다. 로딩에서는 일부 back 자체가 사라진다.
- 제안: Home `logo / notification`, root tab `screen title / optional action`, detail·하위 목록 `back / title / optional action`. 기존 의미 있는 본문 H1과 자녀/지역 선택은 유지하고 chrome만 공통화한다.
- 별도 native header를 만들지 않는다. 기존 `ParentHeader` 공통 구현은 검색상 없으며 웹 component로 추출한다. 디자인 문서의 일반 App Header 표에는 avatar 문구가 남아 있어, Home 전용 최신 정책과 함께 정리해야 한다.

## 4. Bottom Navigation 정책과 누락

실제 호출 전체: `app/page.tsx`, `MyFrame`, `ChildrenFrame`, `ApplicationsFrame`, `FavoritesFrame`, `RecordFrame`, `ScheduleFrame`, 그리고 redirect route의 `ProfileFrame`. 즉 정상 route는 **`/`, `/my`, `/my/children`, `/my/applications`, `/favorites`, `/record`, `/my/schedule` 7개**다. JSX 자체를 복사한 것이 아니라 삽입 책임이 페이지/frame에 분산되어 있다.

필수 조사 route에서 누락: **`/classes`, `/classes/[id]`, `/academies`, `/academy/[handle]`, `/record/[experienceId]`, `/record/[experienceId]/report`**. 추가 관련 누락은 `/record/profile`. Notifications는 예외로 유지한다.

권장 V1 계약:

- 홈 / 일정 / 기록 / 마이페이지 4탭 유지. 위 주요 목록·상세에서 공통 shell이 nav를 보장하고 loading/error에도 유지한다.
- 상세에서도 표시하되 수업 상세의 기존 `.fixedCta`(bottom 0, z-index 30)를 nav(z-index 60)와 함께 배치할 하단 공간 계약이 먼저 필요하다. 단순 추가하면 CTA를 덮는다.
- Notifications는 nav 숨김. 신청 task route와 로그인/법적 문서는 탭 화면과 구분해 명시적 정책을 갖는다. 신청 route에 무조건 nav를 더하지 않는다.
- `resolveParentNavTab`은 일정 우선 → record → my/favorites → home/discovery 순서여서 주요 active 판정은 이미 있다. `/classes/.../apply`도 현재 구현상 home 판정이므로 shell에 붙이기 전 task 예외를 명시한다.
- nav는 pathname만 사용하고 href 기본값이 query 없는 주소다. Home/Favorites의 auth 목적지 override는 유지해야 하며, 자녀 query 보존 기능으로 오해하면 안 된다. Home의 로그인한 Parent 일정/기록 href도 query 없는 주소다.
- 소유권 검증을 통과한 child context를 root tab과 관련 detail 이동에 전달한다. `withRecordChild`, `buildClassesHref`를 재사용하고 `edit=profile` 같은 일회성 query는 다른 탭에 복사하지 않는다.
- 1차는 Parent 전용 공통 Shell을 기존 frame에서 사용하도록 추출하는 방식이 작은 범위다. 모든 페이지에 탭을 직접 추가하거나 전체 서비스 `app/layout.tsx`에 무조건 넣지 않는다. 영속 layout까지 옮길 경우 URL 변경 없는 Parent 범위 분리와 loading/error 중복 제거를 별도 검토하며 Studio/auth 경계는 유지한다.

## 5. Footer

- `ParentFooter` 실제 caller는 **`app/my/page.tsx` 한 곳**: `showLegalLinks={false}`, `designVersion="v1"`.
- 사업자 전체 정보는 기본부터 펼쳐진 긴 목록이 아니라 `<details>` 안에 접혀 있다. 로고, 사업자 정보 summary, 플랫폼 안내, copyright는 기본 노출한다. 약관/개인정보/제3자 동의 링크는 MyHub의 메뉴 row에 있다.
- 공통 footer CSS에 mobile/WebView 숨김 분기는 없다. 권장: 모바일 MyPage에서는 회사/서비스 정보 진입과 접힌 정보 위주로 더 줄이고 정책 접근을 유지한다. Home·목록에서 이미 없는 footer를 제거하는 작업은 불필요하다.
- Desktop public web·법적 문서·Studio/partner footer를 함께 숨기지 않는다. 모바일 viewport와 WebView를 동일하게 단정하지 말고, V1은 Parent mobile surface 범위의 표시 계약으로 한정한다.

## 6. Liquid Glass: 선언과 약한 효과의 원인

근거: `src/features/classes/ui/parent-bottom-nav.module.css`, `app/globals.css:121–124`.

| 항목 | legacy base | 실제 사용되는 V1 override |
|---|---|---|
| 배경 | white alpha .86 | `--parent-glass`: white **.92** |
| backdrop | blur 18px + saturate 180% | blur **20px만**, saturate를 덮어씀 |
| 경계/빛 | 옅은 rgba border | solid border token, 별도 highlight 없음 |
| 그림자 | 0 4px 16px alpha .07 | **none** |
| 형태 | radius 22, inset 14 | radius 24, 가로 gutter 20, bottom 12 + safe-area, 높이 64 |

컴포넌트 전체 opacity는 없고 배경색 alpha만 사용한다. prefix 포함 backdrop-filter는 구현되어 있다. 하지만 흰색 92%가 대부분을 덮고, 흰색 본문·짧은 화면·본문 끝 nav reserve 96px 때문에 뒤가 단색일 때 흐림 효과가 드러나기 어렵다. 이는 CSS에 근거한 원인 판단이며 기기 GPU/브라우저 미지원으로 단정하지 않는다. 스크롤 도중 카드/이미지가 아래를 통과하는지 별도로 시각 검증해야 한다.

V1 후보는 기존 CSS에서 alpha·saturate·얇은 highlight/경계를 조정하고 실제 뒤 콘텐츠로 평가하는 것. 접근성 대비와 blur 미지원 fallback을 유지하며, 새 라이브러리·가짜 배경·과한 그림자·앱 전체 redesign은 필요 없다. 현재 디자인 문서의 .92/no-shadow 계약을 바꾸는 항목임을 구현 때 명시한다.

이번 요청의 최종 glass 목표는 **floating + translucent + 실제 backdrop blur + 뒤 콘텐츠가 조금 비침 + thin highlight + soft floating shadow + active Green + active pill 없음**이다. V1 active pill은 이미 제거되어 있으므로 유지한다. 부드러운 floating shadow는 현재 `box-shadow: none`과 다르며 이번 mockup에서 비교할 명시적 변경 후보다. alpha/blur/shadow 수치는 아직 확정하지 않고 스크롤 중 카드가 뒤로 지나가는 장면에서 대비와 투명감을 함께 확인한다.

## 7. Safe Area와 Keyboard

### Safe area

- nav: `bottom = inset + env(safe-area-inset-bottom)`, body reserve도 env 포함. 상세 CTA/신청 submit/sheet에도 bottom env가 있다. 각각 필요한 바닥 영역이지만 합산 소유자가 없다.
- Classes 상세, Academies, Academy 상세, My 하위, Notifications 등은 top env를 사용한다. Home/Classes 공용 shell, Schedule/Record는 일반 padding이며 top 처리가 통일되지 않았다.
- `app/layout.tsx`에는 명시적 viewport export/`viewportFit: cover`가 없다. env가 실제 WebView에서 양수라는 보장은 없다.
- native `App.tsx`는 `SafeAreaProvider` → `SafeAreaView` → WebView 구조. native가 이미 inset을 소비한 상태에서 web env까지 양수면 중복 여백 위험이 있다. 현재 기기에서 실제 중복 발생했다고 확정한 것은 아니다.
- 검수 계약: iPhone home indicator, 상단 notch, Android inset을 각각 측정하여 native/web 중 어떤 층이 여백을 소유하는지 먼저 정한다. 웹에서 무조건 env를 더하거나 빼지 않는다.

### Keyboard: 확인 위치와 위험

| 흐름 | 현재 구현 | 위험 / 필요한 확인 |
|---|---|---|
| My profile·탈퇴 sheet | `ParentAccountSheet`: native HTML dialog, body lock, focus 복귀, visualViewport height/offset 구독, 내부 scroll. 프로필 action은 sticky | 가장 준비된 패턴. 작은 높이·키보드 닫기·focus 복귀를 실기기 재확인. 탈퇴 실행은 이번 audit에서 하지 않음 |
| 수업 상세 신청 sheet | `class-detail-application-sheet`: local state, fixed bottom, max 85vh/min 60vh, body scroll 영역+footer, 별도 focus/Escape 처리 | visualViewport 보정 없음. 이름·연락처·메모 입력 시 키보드가 footer/input을 가리거나 높이 제약과 충돌할 위험 |
| `/classes/[id]/apply` | `apply-form.module.css` fixed submit(bottom 영역), 본문 110px+safe-area reserve | nav가 현재 없어 기존 nav 충돌은 아님. 키보드 resize/submit 겹침 우선 검증 |
| 기록 feedback/decision | `parent-feedback-form` textarea, `feedback.module.css` 일반 문서 flow; textarea 14px | 현재 기록 상세에는 nav가 없음. nav 추가 후 입력/제출 가림 회귀를 확인. iOS focus 확대/점프 가능성은 실기기 검증 항목 |
| 자녀 관리·검색·선택 sheet | `my-children-client`, ClassesSearchPill, shared BottomSheet | 자녀 화면 nav는 fixed이고 공통 keyboard 대응 없음. shared sheet는 70vh, 내부 scroll, focus 관리는 opt-in; 입력 있는 sheet의 viewport 축소 검증 |

새 keyboard system은 제안하지 않는다. 기존 account sheet의 검증된 보정을 참고하여 문제 있는 위치만 맞추고, nav를 무조건 키보드 위로 띄우지 않는다.

회원탈퇴 form에는 텍스트 입력이 없고 hidden confirmation과 확인/취소 버튼만 있다(`parent-account-deletion.tsx`). 자체 키보드를 여는 흐름으로 분류하지 않는다. profile 입력 후 키보드를 닫고 탈퇴 sheet로 전환할 때 남은 viewport offset과 focus, 물리 Back을 확인한다. 조사한 account/application sheet에 input focus/blur 자체로 닫는 handler는 없었다. **input focus 후 자동 닫힘이 재현됐다는 증거는 없으며**, viewport 변화 중 backdrop 오탭·focus 복귀·Back 이탈을 실기기 회귀 항목으로 남긴다.

## 8. Back, query, history

- 수업 상세 back은 history back이 아니라 `/classes?sido&sigungu&bname&child` 링크다(`app/classes/[id]/page.tsx:60–66`). 검색어/과목 등 전체 검색 조건과 원래 진입 경로까지 복원하지 않는다. Home/Favorites에서 왔어도 Classes로 간다.
- Academy 상세 back은 `/academies` 고정. 학원 목록 지역/검색 query가 보존되지 않는다.
- Record list/detail/report는 `withRecordChild`로 child를 보존하는 부분이 이미 있다. 이를 shell 통합 시 유지한다.
- **Schedule → 상세는 `schedule-view.ts:24`의 `/record/${row.id}`로 child를 전달하지 않는다.** 상세 back은 완료 여부에 따라 `/record` 또는 `/my/applications`여서 Schedule로 돌아오는 흐름과 다르다.
- Record detail와 Schedule 인증 `returnTo`에는 child가 빠지며, report는 child를 포함한다. 안전한 내부 returnTo와 기존 소유권 검증을 유지하면서 일관성을 맞출 후보다.
- Children/Applications/Favorites back은 `/my`, Notifications back은 `/` 고정이다. My의 알림에서 왔어도 화면 back은 Home으로 간다.
- profile sheet는 `?edit=profile`을 pushState하고 자체 marker가 있으면 router.back, 직접 진입이면 query를 replaceState로 제거한다. **탈퇴와 신청 sheet는 local state여서 history에 열림이 기록되지 않는다.**
- native Android handler는 `canGoBack`이면 `webView.goBack()`, 아니면 앱 종료 확인이다. 웹 sheet 닫기나 root tab 의미를 알지 못한다. 따라서 local-state sheet에서 이전 페이지로 이탈, 탭 이동 이력 역순 탐색, 화면 back 링크로 추가된 중복 목록 이력이 발생할 수 있다. SPA history의 canGoBack 갱신은 실기기 확인이 필요하다.
- V1 회귀 계약: list → detail → back은 child/필터/scroll 복원, sheet → back은 우선 sheet 닫기, root tab → back은 중복 history loop 방지. 웹 내 fallback 목적지와 history 정책을 먼저 정의하고, 물리 Back bridge가 필요한 부분은 native 후속 범위로 분리한다. 이번에 native navigation을 도입하지 않는다.

## 9. Routing 문구와 Loading 분류

요청 문자열을 `app`, `src` 전체 검색한 결과:

| 정확한 위치 | 문구 | 판정 |
|---|---|---|
| `src/features/classes/ui/parent-bottom-nav.tsx:123` | `이동 중` | D: 탭 label 유지 + aria-busy/작은 pending 표시, 이전 화면 유지 |
| `app/classes/[id]/apply/loading.tsx:28` | `신청 화면을 불러오는 중입니다...` | B+C: 신청 폼 skeleton으로 교체 |
| 같은 파일 `:41` | `잠시만 기다려 주세요.` | C: 화면 전체 대기 문구 제거 |
| `src/features/studio/ui/studio-schedule-manager.tsx:544` | `일정을 불러오는 중입니다.` | Studio: 조사 결과만 기록, 수정 제외 |
| `src/features/studio/ui/studio-classes-manager.tsx:240,314,336` | `이동 중...` | Studio: 수정 제외 |
| `src/features/studio/ui/studio-shell.tsx:204` | `이동 중...` | Studio: 수정 제외 |

`페이지로 이동 중`, `이동하고 있습니다`는 검색 일치 없음. 모든 “이동” 문구를 삭제하는 작업은 아니다. 목적지를 설명하는 링크 label, 접근성 sr-only/aria-label, retry 버튼의 `불러오는 중…`, 지도/지역선택의 부분 로딩은 유지 가능하다.

분류 정의: **A = KEEP** 기존 skeleton/inline pending 유지, **B = SKELETON으로 교체**, **C = FULL PAGE 제거**(전체 화면 대기 표현), **D = IMMEDIATE FEEDBACK 필요**(고정 label·inline pending과 shell/이전 화면 유지). route별 결과는 2절 표 참조. Parent 전체가 full-page spinner라는 증거는 없으며 대부분 skeleton이 이미 있다. Native 초기 1회 loading overlay는 별도이고 이번 웹 수정 대상이 아니다.

추가 주의: `/academies`는 canonical redirect가 실제 307을 내도록 route-level loading 대신 내부 Suspense를 쓰는 주석/구조가 있다. shell 공통화 때 무심코 상위 streaming boundary를 추가하지 않는다. nav pending은 pathname 변경 때만 해제되므로 실패·취소·같은 pathname 전환도 확인한다.

## 10. Touch target과 Sheet 후보

코드로 확인한 작은 hit area:

- 신청 sheet `.closeButton`, `.monthNavButton`: **36×36px**.
- 신청 sheet `.inlineTextButton`, `.inlineAddButton`: padding 0, font 14/line-height 1.5, 최소 hit 높이 없음.
- 신청 calendar는 7열/8px gap/aspect-ratio 1. 390px 화면, 좌우 body padding 16px 기준 약 44px보다 작아질 수 있다. 기기 실제 box 측정 필요.
- Home `.reportAction`: C1 text link, 최소 높이 없음. 실제 report action 노출 상태에서 확인.
- 공통 footer `.link`에는 최소 높이가 없지만 현재 My caller는 법적 링크를 숨긴다. 노출 중인 오류로 분류하지 않는다.

유지할 좋은 패턴: nav item 최소 44px, Home header/filter/section link 44px, My 메뉴 전체 row tap, schedule 카드 전체 link, feedback chip 44px·submit 52px, 상세 찜/back의 iconButton. 시각 아이콘 크기와 실제 hit box를 혼동하지 않는다. Record는 cardMain과 report CTA가 나뉘어 있어 중첩 링크로 합치지 않는다.

Sheet 정책: profile edit와 account deletion은 이미 ParentAccountSheet를 사용한다. 기존 지역·자녀·과목 선택 sheet 및 신청 sheet를 정돈하는 것이 우선이다. 새 후보는 **MyPage 사업자/서비스 정보 열람** 정도가 자연스럽고, 자녀 관리 안의 짧은 편집은 필요가 확인될 때만 검토한다. 기록/리포트/목록 전체를 sheet로 바꾸지 않는다.

## 11. WEB / NATIVE 경계

| WEB V1에서 해결 | NATIVE 후속 책임 |
|---|---|
| Parent shell/header/footer/nav, route active/child query, loading·pending, CSS glass/safe-area, sheet scroll/focus/웹 history | app icon/splash, Android physical Back handler, 외부 URL 처리, deep link, WebView 및 native build 설정 |
| 기존 viewport/CTA 배치 보정 | OS keyboard resize와 native inset 설정 자체 |

경계 공동 검증: inset의 소유자, SPA history와 canGoBack 동기화, physical Back의 sheet 우선 닫기. 웹만으로 native 완료를 주장하지 않는다. `firstsuup-mobile`은 읽기만 했고 Expo Router 도입/앱 수정은 없다.

## 12. P0/P1와 예상 수정 파일

이번 주 QC의 P0는 **탐색·입력·복귀를 끊지 않는 App Shell**에 한정한다. 누락 nav/header, 최소 glass 목표, 모바일 footer 표시 계약, routing/loading 피드백은 구현 대상이다. safe-area/keyboard/back은 반드시 검수하되 정적 위험만으로 전면 재작성하지 않고 재현된 결함과 확인된 query 손실을 보정한다. 이미 충분한 44px row와 account sheet까지 일괄 수정하지 않는다. 추가 sheet 전환·전체 route 재배치·새 keyboard/history 시스템은 QC 필수 범위에서 제외한다.

| 우선순위 | 범위 | 예상 파일 |
|---|---|---|
| P0 | Parent 전용 shell + header 통일, 누락 nav, Notifications 예외, fallback shell 유지 | 신규 `src/features/classes/ui/parent-app-shell.tsx`, `parent-app-header.tsx` 및 CSS 후보; 위 route page/frame/loading/error 호출부 |
| P0 | 4탭 active/child/auth 목적지·back/query 보존 | `parent-bottom-nav.tsx`, `classes/lib/parent-nav.ts`, `classes-href.ts`, `record/lib/record-href.ts`, `schedule/lib/schedule-view.ts`, detail caller들 |
| P0 | glass·safe-area·nav/CTA 공간 계약 | `app/globals.css` Parent scope, `parent-bottom-nav.module.css`, `app/classes/[id]/page.module.css`, 각 Parent shell CSS. viewport는 `app/layout.tsx`의 서비스 전체 영향 검토 후 필요 시 |
| P0 | 모바일 My footer 최소화·정보 접근 | `parent-footer.tsx`/CSS, `app/my/page.tsx`, `my-hub.tsx`/CSS; desktop/법적 페이지 보존 |
| P0 | routing 문구·신청 skeleton | `parent-bottom-nav.tsx`, `app/classes/[id]/apply/loading.tsx`, `home-loading.tsx`와 상세 loading/frame |
| P0 | keyboard/back 회귀·44px 결함 | `class-detail-application-sheet.tsx`/CSS, `apply-form.module.css`, `parent-account-sheet.tsx`/CSS, `my-hub.tsx`, 필요 시 `shared/ui/bottom-sheet.tsx`; feedback는 nav 추가 후 확인된 보정만 |
| P1 | 미세 animation·advanced transition·비핵심 polish | 기존 CSS 범위, reduced-motion 유지. 추가 라이브러리 없음 |

위 파일 목록은 **다음 구현 단계의 후보**이며 이번 audit에서 수정하지 않았다. 공통 `feedback.module.css`, root globals/layout처럼 Studio 또는 타 제품이 공유하는 파일은 Parent 범위 밖 스타일을 바꾸지 않는다.

**예상 구현 변경 파일 수: 약 35–45개**(웹 TSX/CSS, 신규 shell/header 및 CSS 약 4개 포함; 테스트·문서 제외). 기존 page/frame 연결, 중복 header CSS 및 loading 조정이 대부분이고 새 화면을 그만큼 만드는 뜻은 아니다. 이는 공통 shell을 기존 frame에 연결하는 최소 접근의 계획 추정치이며 확정 파일 목록/실제 diff 수가 아니다. mockup에서 CTA와 header 구조를 결정한 후 범위를 좁힌다. 이번 실제 변경 파일은 감사 문서 **1개**다.

## 13. 구현 순서와 완료 검수

가장 짧은 순서: **공통 header/nav/CTA mockup → 기존 frame에 shell 연결 → safe-area/glass/footer → loading·query/back·확인된 keyboard 결함 보정 → WebView QC**. 본문 카드·리포트·신청 데이터 계약은 유지한다.

1. Parent route별 header/nav/CTA 표시 계약과 child/back 정책 확정. Notifications 예외·신청 task 경계·desktop footer 영향 포함.
2. 웹 shell/header를 추출하고 7개 기존 nav caller 및 누락 목록·상세를 연결. loading/error와 중복 header/nav 제거, auth 목적지 유지.
3. 하단 CTA/nav reserve와 safe-area를 맞춘 후 glass를 조정. 실제 스크롤 콘텐츠 뒤에서 확인. My footer 최소화.
4. 신청 skeleton·고정 탭 label 적용. sheet keyboard/focus·작은 hit target을 필요한 위치에서만 보정.
5. list → detail → back, root tab 전환, child/검색 query·scroll, profile/deletion/application sheet 닫기를 웹과 실제 WebView에서 회귀 검수. 새 native 시스템은 별도 작업이다.
6. 다음 구현 때 lint/typecheck 및 필요한 UI 회귀 확인. 360/390px·desktop, iPhone home indicator·키보드, Android physical Back을 포함한다. 실제 신청/피드백/탈퇴 mutation 없이도 shell 검수는 가능하다.

이번은 문서 전용 정적 감사라 lint/typecheck/build 및 DB/로그인 mutation은 실행하지 않았다. 실기기 현상을 검증 완료로 표시하지 않는다. 기존 작업 diff/index 보존과 새 문서 whitespace 검사를 수행한다.
