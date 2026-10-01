# Parent App Experience V1 — Web Release

2026-10-01. Integration base: `cd05173931f3e45f5e7964faedb563fbb2c62947`.
User-approved Phase 1, Home redesign/visual polish and final Phase 2 are integrated on a clean worktree. Original workspace files, branch, HEAD, index and environment remain separate.

## Released contract

- Shared ParentAppShell/Header/Nav and child/query/returnTo/back preservation.
- Home retains the approved hero, context controls, search, subject rail, real report/feedback CTA, class carousel and public academy logos.
- Nav active: `/` Home, `/my/schedule*` Schedule, `/record*` Record, remaining `/my*` My. Classes/Academies/Academy/Favorites show Nav without active; Notifications has none.
- Final Glass: white 50%, blur20, saturate160%, thin 75% white top highlight, subtle gradient, no pill.
- Class detail retains the existing favorite/application actions in one dock. Shared Nav state moves bottom from 84px to 12px plus browser safe-area in 180ms; down/up/top behavior, reduced motion and fixed final-content clearance remain.
- Mobile corporate Footer, neutral loading/pending, safe-area and keyboard contracts follow PARENT_DESIGN_SYSTEM.md. No native inset is added twice.
- The earlier phase documents describe intermediate states. The final design system and this release contract supersede their older active/opacity values.

## Clean verification

- Typecheck, lint, build and diff whitespace checks.
- App Shell: 15 screen fixtures at 390/430/480/1280px, Header/Nav/touch/overflow, query/back and auth-return contracts.
- Home: actual components, subject shortcuts, region/child/search, report/reflection routing, independent favorite, carousel, logo/fallback, read-only logo query boundaries.
- Phase 2: glass, active matrix, detail hide/reveal/jitter, dock offset, Footer, 10 loading screens, Notifications, pending, reduced motion, keyboard layout and positive/zero safe-area.
- MyPage: real UI with mocked actions, account sheets, error preservation, focus, keyboard and back/forward.
- 25 source/pure-function regression scripts cover Parent discovery, child selection, applications, reports/records, schedule, notifications, favorites, actions and Home failure isolation.
- Seven historical verifier assertions were updated for approved shared Header/Shell, no-active discovery routes, child-aware auth return, existing account sheets and extracted HomeReportCta. No application behavior was changed during integration.

Authenticated fixture checks use inert actions. Production smoke is read-only; authenticated real-account coverage is reported separately from fixtures. iPhone/Android WebView physical-device QC remains the next step after web deployment.

## Exclusions

No Studio changes, DB/schema/migration, native changes, unrelated dirty/untracked files, dependency changes or extra optimization. The original approved Hero copy and Green favorite remain; `우리 아이에게 맞는 수업의 시작` and red hearts are deferred.
