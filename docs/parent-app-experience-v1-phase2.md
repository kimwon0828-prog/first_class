# Parent App Experience V1 — Phase 2 local implementation

2026-10-01. Phase 1 + approved Home + Home Visual Polish working tree를 보존하고 공통 navigation/loading/viewport 동작만 보완했다. 로컬 구현이며 commit/push/deploy 또는 Production 데이터 write는 하지 않았다.

## 변경

- `ParentBottomNav` V1: white 68%, blur20 + saturate160%, translucent highlight와 약한 floating shadow. backdrop 미지원 시 white96% fallback. 기존 64px·20px gutter·12px bottom inset과 본문 clearance 유지. active pill 없음.
- active: `/`만 Home; `/my/schedule*` Schedule; `/record*` Record; 나머지 `/my*` My. `/classes*`, `/academies`, `/academy*`, `/favorites`는 Nav 표시 + active 없음. Notifications는 Nav/추가 clearance 없음.
- 정확한 `/classes/[id]`에서만 첫 진입/상단 보임, 12px 누적 하향 scroll 숨김, 상향 복귀. 16px 이내 top 보임. 180ms transform/opacity, hidden Nav는 inert/aria-hidden. 본문 높이를 바꾸지 않는다.
- Nav의 `이동 중` 라벨을 제거하고 Next Link의 실제 pending signal로 icon 위치에 spinner를 표시한다. label 유지, 중복 activation 차단, reduced motion에서는 회전/transition 없음.
- 모바일 ≤480px My의 corporate Footer 숨김, desktop 유지. 기존 정책 링크 유지 + My 서비스 메뉴에 `/terms#business-info` 연결. 기존 법적 문서의 사업자 영역에 anchor만 추가했으며 정책 내용은 바꾸지 않았다.
- 신청 loading의 `신청 화면을 불러오는 중입니다...`, `잠시만 기다려 주세요.`를 중립색 form skeleton으로 교체. Classes/Class detail/Record detail loading에도 실제 ParentHeader를 유지. My skeleton은 profile/menu 형태로 개선. Academies/Schedule/Record/Academy detail/Report의 기존 shape skeleton 유지; Schedule/Record에 busy semantics 보완. Home loading/본문은 변경하지 않았다.
- Shared Nav keyboard hook: editable focus + 120px 초과 viewport 축소. VisualViewport height/scale를 함께 보아 zoom 자체를 keyboard로 처리하지 않는다. window resize fallback 제공. keyboard 시 Nav 숨김; inline input은 visible viewport 안으로 보정.
- 신청 sheet는 keyboard가 열리면 기존 grid의 높이/하단 offset을 visible viewport에 맞춘다. body만 스크롤하고 footer CTA는 남는다. 계정 sheet는 기존 VisualViewport 계약을 유지하면서 focus를 내부 스크롤로 드러내고 cleanup 시 rAF를 취소한다. 회원탈퇴 sheet에는 keyboard input이 없으며 실제 탈퇴는 실행하지 않았다.

## Safe area

`app/layout.tsx`는 별도 viewport-fit을 설정하지 않고 Next의 기존 `width=device-width, initial-scale=1` 계약을 유지한다. native `App.tsx`를 read-only로 확인했으며 SafeAreaProvider/SafeAreaView가 WebView 전체를 감싼다. native inset 값을 웹에 다시 더하지 않고 Header/Nav의 기존 CSS env에 0px fallback만 명시했다. iOS Safari/WebView가 제공하는 값이 0이면 추가 safe-area도 0이다. 기기별 추정 padding이나 UA 분기는 추가하지 않았다.

참고한 browser API 계약: [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport), [CSS env](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env). 실제 iOS/Android keyboard와 WebView 최종 검수는 Production 웹 반영 후 별도 native QC 대상이다.

## 검증

- typecheck, lint, isolated build, git diff --check PASS. build는 env 파일을 제외한 임시 사본에서 mock data source로 수행해 실행 중 localhost `.next`와 Production 설정을 보존했다.
- 기존 App Shell: 15개 화면 ×390/430/480/1280, Header/Nav/active/touch/query/back PASS. Schedule→detail→back, Classes filters→detail→back, Record flow, My edit/legacy alias 유지.
- 기존 Home visual/region/child/search/report/favorite/academy logo verifier PASS. Home source와 CSS는 작업 전 hash 동일.
- 기존 MyPage actual UI + inert action verifier PASS: profile open/close/focus, 실패 시 입력 보존, mock save, back/forward, short viewport, 탈퇴 진입. 운영 action 호출 없음.
- Phase 2 actual component fixture (최종 `/tmp/parent-phase2-browser-oFXltr`): glass, root visibility, detail down/up/top/jitter, Footer/policy rows, Notifications padding, 10개 loading route, profile/application/feedback keyboard geometry, CTA 접근·복귀, pending spinner/중복차단, reduced motion, positive/zero safe-area PASS.
- 실제 localhost: Home/Classes/Academies/Favorites ×4개 폭의 glass/active/root visibility PASS. 실제 공개 수업 상세 최초/down/up/top 및 학원 상세 no-active PASS. runtime 오류 0. GET/HEAD 외 `POST /_store` 1건은 브라우저에서 차단했으며 전송하지 않았다. 실제 viewport meta는 `width=device-width, initial-scale=1`이다.
- Record/Academy/Schedule/Nav source/query 회귀 PASS. routing 설명 문구 전역 재검색에서 해당 Parent 문구 없음. 데이터 조회 실패/저장 상태 안내와 screen-reader status는 유지했다.

검증 증거는 `/tmp/parent-phase2`의 로그 및 `verify-parent-phase2-browser.cjs`가 출력하는 fixture 경로에 보관한다. Fixture는 모든 server action을 inert stub으로 치환하고 외부 요청을 차단한다. 실제 localhost 검수는 공개 화면 GET/HEAD만 허용하며 로그인·신청·저장·탈퇴를 실행하지 않는다. 보호 계정 화면은 위 fixture 검증과 사용자 직접 시각 검수를 구분한다.

## 보존 및 검수

- localhost:3000 기존 PID 65995, Production Supabase/Auth 연결 유지. env 파일과 `app/layout.tsx` 변경 없음.
- 기존 Home, query/action/adapter, `parent-navigation.ts`, Studio/DB/schema/migration 변경 없음.
- `/Users/1to6/Desktop/firstsuup-mobile`의 작업 전 파일 hash와 동일. native 수정 없음.
- 수정 31개 파일: 제품 23 + verifier 6 + 문서 2. 기존 파일 삭제 없음. git index 변경 없음; commit/push/deploy 없음.
- 사용자 검수 시작: http://localhost:3000/ → 수업 상세 스크롤, My 프로필 sheet, Record 피드백. 운영 data write 자동 실행 없음.
