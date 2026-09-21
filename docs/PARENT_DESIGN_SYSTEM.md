# Parent Design System V1.3

Authoritative Parent specification. First adoption: Home `/` (2026-09-20).
CSS source: `app/globals.css`, `[data-parent-design="v1"]`.
The existing `STUDIO_DESIGN_SYSTEM.md` remains Studio-only. No global replacement of legacy Parent or Studio tokens.

## Foundation

- White surface, charcoal type, green actions, thin borders, no normal card shadows.
- Reference viewport 390px; minimum 360px; content column max 480px, centered on desktop; horizontal gutter 20px. No desktop multi-column layout.
- Font stack: Pretendard Variable, Pretendard, system-ui, sans-serif. No bundled Pretendard asset exists currently; browsers without it use system-ui.
- All text: line-height 1.5, letter-spacing 0.
- H1/H2/H3/H4/H5 mobile: 24/20/18/16/14px; desktop (768px+): 28/24/20/18/16px. Weights: 600/600/600/700/600.
- B1/B2/C1: 16/14/12px, weight 500.
- Spacing: 4/8/12/16/20/24/32/40/48/64px. Section gap 32, heading-to-content 16, card gap 12–16.
- Radius: 8 small, 12 button/input, 16 card, 24 sheet/nav, 999 chip.
- Border: 1px Neutral 200; strong Neutral 300; focus 2px Green 700.
- Primary button: Green 700, hover 800, pressed 900, white text. Heights 36/44/48/52; main mobile CTA 52. Touch targets at least 44×44 (a smaller visual chip needs a larger hit area).
- Secondary: white + border; Dark: Neutral 950 + white; Ghost: transparent. Standard selected filter: charcoal + white.

### Parent Layout / App Shell

- Mobile, viewport ≤ 480px: Page/App background = #FFFFFF. The Parent surface fills the viewport width.
- Desktop, viewport > 480px: Outer Canvas = Neutral 50 (#F7F8F8); Parent App Surface = #FFFFFF. Maximum width remains 480px, centered with `margin-inline: auto`, single column.
- Reuse existing shell tokens: `--bg` for outer canvas, `--surface` for App Surface, `--col` for 480px maximum. The shared V1 token scope switches `--bg` at >480px; keep the white surface independent of it.
- The existing shell fills at least the viewport height, including short/loading/error content. No new wrapper, shadow, gradient or widened layout. Bottom navigation remains centered within the Parent surface.
- Existing legacy Parent pages keep their current scope; this restores Home's use of the established outer-page/inner-shell pattern without a global layout migration.

### Palette and semantic aliases

| Scale | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| Green | #F1FAF2 | #E3F6E5 | #C3EBC8 | #92DA9B | #59C768 | #2BAD39 | #228F2F | #1A7426 | #165D20 | #124C1B |
| Neutral | #F7F8F8 | #F1F3F2 | #E5E8E6 | #D4D8D6 | #AEB4B1 | #858C88 | #626966 | #454B48 | #2D312F | #202321 |

Neutral 0: #FFFFFF; Neutral 950: #111312.
Text primary/secondary/tertiary: Neutral 950/600/500. Surface: Neutral 0; secondary surface: Neutral 50.
Green 500 is brand expression, not a white-text CTA background. Required body information uses Neutral 600; Neutral 500 is limited to placeholder/inactive navigation per specification.

### Previous values and adoption

| Existing source | Before | V1 opt-in |
|---|---|---|
| globals brand 50/100/500/700/900 | #eaf7ec / #d3efd8 / #2aad38 / #1b7a26 / #12561a | Green scale above |
| text 1/2/3 | #1a1a1a / #5c5c5c / #8e8e8e | Neutral 950/600/500 |
| background / border | #f5f5f5 / #e8e8e8 | Neutral 0 / 200 |
| gutter | 16px | 20px |
| font | Inter first, 13/15px and negative tracking in Home | Pretendard stack, fixed scale, zero tracking |
| home card | 4:3 thumbnail, no containing border | 272px width, 2.2:1 thumbnail, 16px radius + border |
| floating nav | inset 14, radius 22, blur 18, alpha .86, active green pill | x 20, bottom 12 + safe-area, radius 24, blur 20, alpha .92, active icon/text only |

Keep all new foundation values in globals. Home/card CSS uses these variables. Portal sheets inherit the same tokens only while V1 Home is mounted. Shared navigation opts in through `designVersion="v1"`; other routes retain their current presentation and IA.

## Home composition and existing data contracts

1. Brand + notifications + Parent profile. Parent identity comes from AuthProfile, never the selected child. There is no image field in the current profile projection; use a 40px Neutral surface/User 20px fallback inside a 44px link. The presentation accepts a future image URL, including image-load failure fallback. Guests use existing sign-in; no fake unread count.
2. Location + child context. `LocationFilter` uses administrative URL fields or the existing geolocation cookie. `HomeChildSelector` uses `?child=` and ownership validation. Canonical location redirects preserve child. Guest/no-child entry goes to existing sign-in/child management.
3. Search: 48px high, 12px radius, Neutral 50. Home uses a semantic Link named “수업 검색하기” to enter `/classes` immediately, without an input or keyboard. `buildClassesHref` preserves the owned selected child and canonical region/radius; the existing shared location cookie remains unchanged. Classes keeps its real `ClassesSearchPill` input.
4. Category shortcuts have no “전체” entry. Use a 40px full-radius Neutral 50 circle, 24px colored pictogram and Neutral 700 label. Desktop hover: Green 50 circle, original subject color, Neutral 950 label. Touch/pointer pressed: Green 100 circle, original subject color. No charcoal fill, white inversion, scale or bounce. `--motion-fast: 120ms` is defined in globals; reduced motion still disables transitions. Pictograms follow the existing inline SVG convention with consistent rounded 2px strokes and at most three existing token colors. Actual `subjectCatalog` controls labels, codes, order, and availability; fallback icon for unknown codes. No new taxonomy.
5. “다가오는 수업 일정” is an independent section, shown when an owned child is selected and has an upcoming confirmed schedule. Use the existing child-scoped summary and route; show a full-content-width 2.2:1 class image, title, academy, Seoul date/time. Do not fabricate missing images or schedules. The report-review link is a separate conditional aside and cannot replace or suppress a schedule. A report query error cannot suppress an available schedule.
6. “이런 수업은 어때요?”: existing public class query. With a selected owned child, reuse `isChildEligibleForClass(child.grade, class.targetAge)` from the application action; invalid/missing grades or target ranges fail closed. No age-to-grade mapping. Filter before slicing to six; remove the early discovery query limit when a child parameter is present. Without selected child retain general discovery. Horizontal snap rail, 272px cards, 2.2:1 image. Body order: title → neutral price → academy/location → subject/real distance. Never overlay price on the image. Card link and favorite button remain siblings.
7. Academy list: existing `getAcademiesForList` with the same administrative or nearby organization filter as `/academies`. Up to three, alphabetical (distance first when nearby). Do not derive academies from the limited class preview. No paid priority. Unselected location uses “학원 둘러보기”; selected location uses “우리 동네 학원”.
8. Existing tabs: 홈 / 일정 / 기록 / 마이페이지. 64px height, 20px horizontal margins, bottom 12px + safe-area. Body reserves 96px + safe-area.

Home post-experience actions use the current published report's persisted receipt separately from ParentDecision. Unread report takes priority and opens the report through the read-saving link. Once read, missing ParentDecision leads to the existing record decision form (only when canCollectParentDecision permits it); any current decision, including considering, completes this step. Missing academyEvaluationCompleted means unavailable, never false/complete; a future real evaluation source and destination must be connected together. Current decision-complete experiences have no Home action. Unknown read state does not generate an action. Notifications keeps its event history and independent ParentDecision helper; Home bell still reflects all real unread notifications. No DB/auth or new evaluation fields.

## States and accessibility

- Page-local Suspense skeleton follows header/category/slider/academy structure. Page-local error boundary offers reload and discovery. Neither adds a root loading/error boundary to unrelated routes.
- Section errors use plain user messages and existing discovery links; empty sections offer further exploration.
- Semantic H1/H2/H3, labelled search and icon buttons, visible focus, accessible image alternatives, keyboard-focusable horizontal rail, and reduced motion.
- Reused location buttons retain native button semantics (previous role=listitem suppressed that role).
- Shared BottomSheet still has existing focus-trap/focus-return limitations; it is not redesigned in this Home task.

## Authoritative sources and adoption boundary

This is the **only authoritative Parent design-system document**. Runtime foundation: `app/globals.css` under `[data-parent-design="v1"]`; component CSS consumes those tokens. The CSS scope name `v1` is the adoption switch and includes Home V1.3, not an obsolete visual version.

- `STUDIO_DESIGN_SYSTEM.md`: independent Studio-only specification; explicitly excludes Parent. Preserve it and its references in `CLAUDE.md` and globals.
- `docs/CODEX_HANDOFF.md`: project entry guide linking here, not a second design system.
- `docs/partner-landing-reference.html`: partner landing reference, not Parent authority.
- `AGENTS.md`: product/development constraints, not a parallel token catalog.
- Existing route CSS is implementation, not an alternative standard. Legacy `/classes`, `/my`, `/record` share outer `--bg` / inner `--surface` / `--col` conventions; `/academies` now adopts the scoped V1 Academies pattern below. Unrelated legacy routes are not globally migrated.
- The pre-existing untracked HTML/canvas artifacts are not authoritative; preserve them without staging.

## Core token registry

Approved values below are the contract for Parent components. **A documented value is not a claim that a CSS variable or reusable component is already implemented.** Only Home-consumed tokens have been adopted into the runtime scope; do not create unused runtime variables or replace legacy styles in bulk.

| Family | Approved values | Current runtime coverage |
|---|---|---|
| Spacing | 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px | EXISTS: inherited `--s1`…`--s10`, scoped `--s12`, `--s16`; gutter 20 |
| Radius | 8 / 12 / 16 / 24 / 999px | EXISTS: `--r-sm/md/lg/sheet/full` |
| Control size | 32 / 36 / 44 / 48 / 52px | PARTIAL: used as dimensions, not a complete named variable set. Visual 32/36 controls need 44px hit areas |
| Icon | 16 / 20 / 24px | EXISTS as SVG/CSS sizes; no universal component |
| Opacity | disabled 40%, secondary 60%, overlay 48%, glass 92% | PARTIAL: glass .92 implemented; other values are documented contract. Prefer semantic text colors over opacity for legible content |
| Motion | 80 / 120 / 200 / 300ms | PARTIAL: `--motion-fast:120ms` implemented; other durations reserved in specification. Reduced motion disables nonessential transitions |
| Layer | 0 / 10 / 20 / 30 / 40 / 50 / 60 / 70 / 80 | PARTIAL: nav uses existing 60. Intended roles: base 0, local raised 10, sticky header 20, sticky controls 30, popover 40, backdrop 50, nav 60, dialog 70, toast 80. Existing sheet 200 is a compatibility exception |
| Media | 1:1 / 4:3 / 16:9 | PARTIAL: approved reusable media presets, not a CSS ratio registry. **Home landscape exception: 2.2:1**, required by the finalized Home card/schedule design |
| Font | Pretendard Variable → Pretendard → system-ui → sans-serif | PARTIAL: stack implemented; no bundled or loaded font asset. No new font/dependency introduced in finalization |
| Typography | Foundation scale above, line-height 1.5, zero tracking | PARTIAL: sizes implemented as variables, weights in consuming CSS/document. Desktop type scale at 768px+, while outer canvas changes at >480px |

Subject color accents reuse root blue/amber/red foreground/background tokens plus scoped Green. They identify categories only, not success/error statuses. Primary CTA remains Green 700+, brand identity Green 500.

## Component contracts

The following is the complete **documentation contract**, not a claim that every component has a shipped reusable implementation. Home implementations remain fixed. New adoption on another route is a separate task.

Common states for interactive components: default; hover; pressed; visible 2px Green 700 focus; disabled (noninteractive, 40% opacity only where legible); pending when applicable (announce progress, prevent duplicate submission). Status is never communicated by color alone. All hit targets at least 44×44; all icon-only actions labelled; respect reduced motion. Common prohibitions: fabricated facts, arbitrary palette/type/spacing/layers, nested interactive elements, unnecessary shadows, inaccessible color-only or hover-only actions.

Abbreviations: N = Neutral, G = Green; R = radius in px; “common” refers to the states/prohibitions above. Every row specifies geometry, appearance, states, purpose and additional prohibitions.

| Component | Size / radius | Color / token | States | Usage | Prohibited patterns |
|---|---|---|---|---|---|
| App Header | 480px max, 20px X, ≥44px actions; R0 | Surface N0, text N950 | common actions; guest/Parent/Studio destinations | Brand + notifications + Parent avatar; distinct region/child row | Child name owned by avatar; mixed Parent/Child group |
| Page Header | H1; 20px X, 16px gap; R0 | N950 title, N600 supporting text | default, loading | Page identity/back action | Extra decorative hero on every page |
| Section Header | H3/H4; content gap16; action hit44; R0 | N950 / N600 | default; common link states | Title plus real destination if available | Forced “전체보기” with no route |
| Button | h36/44/48/52; R12 | Primary G700/N0, hover G800, pressed G900; secondary N0/border N200; dark N950/N0; ghost transparent | common, loading | Explicit action; main mobile CTA52 | White text on G500; disabling only visually |
| Icon Button | hit44; icon20/24; R12 or full | Neutral or Green semantic | common; selected/toggled labelled | Compact named action | Missing aria-label; fake badges |
| Search | h48; R12; icon20 | N50, placeholder N500, text N950 | common, pending, clear | Home: Link navigation; Classes: submit Enter/button to canonical results | Fake local filter; unrequested typing mutations |
| Input | h44/48; X12; R12 | N0, border N200, N950 | common, empty, filled, invalid | Labelled single-line entry | Placeholder-only label; raw technical errors |
| Textarea | ≥3 B2 lines + padding12; R12 | Input palette | common, empty, filled, invalid | Multiline note | Fixed clipping of entered content |
| Select | h44/48; R12; chevron16 | Input palette | common, open, selected, empty/error options | Choose existing options | Inventing taxonomy options |
| Checkbox | mark20, hit44; R8 | N0/N300, checked G700/N0 | common, checked, mixed | Independent multiple choices | Whole-row nested controls; color-only check |
| Radio | mark20, hit44; Rfull | N0/N300, selected G700 | common, selected | Mutually exclusive choice group | Multiple checked values in one group |
| Switch | visual40×24, hit44; Rfull | off N300, on G700, thumb N0 | common, on/off, saving | Immediate reversible boolean setting | Using it to submit unrelated forms |
| Chip / Filter | visual h32, hit44, X12; Rfull | N0/N200/N700; selected N950/N0 | common, selected, removable | Actual filter state | Green selected fill by default; fake filter state |
| Badge | C1, padding4×8; Rfull | N100/N700; semantic colors only for real status | default, semantic state | Compact actual status/count | Invented unread count/rating/rank |
| Subject Category Pictogram | circle40, icon24, C1 label, item hit≥44; Rfull | N50 circle, N700 label, ≤3 existing pictogram colors | hover G50, pressed G100, focus ring; icon color unchanged | Taxonomy-driven search shortcut | “전체”; charcoal hover; white inversion; 3D/emoji/scale/bounce |
| Segmented Control | segment hit44, rail padding4; R12 | N100 rail, N0/N950 selected surface | common, selected | Small mutually exclusive view switch | Double nested tabs; invented state |
| Tabs | hit44, gap16; R0 or12 | N600 idle, G700 active indicator | common, selected, keyboard navigation | Distinct related panels/routes | Color-only selection; changing IA casually |
| Card | padding16/20, gap12/16; R16 | N0, border N200, no shadow | default; common if clickable | Group related content | Card nesting without purpose; shadow per card |
| Landscape Class Card | w272, image2.2:1, padding16; R16 | Card palette; neutral price | default, favorite, missing image, focused link | Title → price → academy/location → subject | Price overlay; portrait return; uneven image/body height |
| Academy List Row | thumbnail64 square, gap12, vertical16; R12 thumbnail | N0, N200 divider, N950 title/N600 metadata | common link, missing image, empty/error list | Academy discovery, same location context | Ranking or paid-priority signals |
| Divider | 1px; R0 | N200 | static | Quiet structural boundary | Heavy decorative rules |
| Accordion | trigger≥44; content padding16; R12 if bounded | N950/N600, N200 border | common, expanded/collapsed; aria-expanded | Optional supporting detail | Hiding required next action; hover-only opening |
| Bottom Navigation | h64; x20; bottom12+safe-area; R24 | glass92%, border N200, blur20; active G700, inactive N500 | common, active page, pending | 홈 / 일정 / 기록 / 마이페이지 | Active pill, new tab IA, wide desktop nav |
| Sticky CTA | button52; X20, gap12, safe-area; R12 | N0 surface, G700 CTA, optional N200 top border | common, pending, unavailable | Primary page action with reserved content clearance | Covering content/nav; multiple competing sticky layers |
| Bottom Sheet | max480; content scrolls; X20; top R24 | N0, overlay48% standard | opening/open/closing, focus/escape, loading/error content | Mobile selection/task | Background interaction, trapped scroll, no focus return; see legacy exceptions |
| Modal / Dialog | max480 within gutter20; padding24; R24 | N0, overlay48%, thin border | open/closed, focus trapped/restored, pending/error | Focused confirmation/task | Unlabelled dialog, irreversible default action |
| Dropdown / Popover | rows≥44, padding8/12, viewport-constrained; R12 | N0/N200/N950 | common, open, selected, escape | Anchored short choices/context | Offscreen menus; hover-only access |
| Toast | B2; padding12/16; R12 | N950/N0 or semantic notice | shown/dismissed, polite status | Transient confirmation | Only location for important errors; interruptive live region |
| Inline Notice | padding12/16; R12 | N50/N600; existing semantic palette | info/success/error; action common | Contextual feedback | Raw stack/SQL/error details |
| Empty | padding20, B2; R16 if bounded | N0/N600, optional N200 border | true empty with next action | Explain absence and offer real destination | Treating failed fetch as empty; decorative giant art |
| Loading / Skeleton | match final frames/rows; same radii | N100 on N0 | busy, reduced motion | Preserve layout and announce loading | Fake data presented as real; unnecessary shimmer |
| Error | B2, padding20, action≥44; R16 | N0/N600, semantic error if needed | retry/pending/recovered | Friendly failure and discovery/retry | Technical internals; dead-end error |
| ImageFallback | fills parent frame, icon24; inherits frame radius | N50 background, Image icon N400; optional C1/N500 | missing URL | Same language for schedule/class/academy | Large centered text, decorative replacement image |
| Avatar | circle40, User20, link hit44; Rfull | N50/N600 fallback; image cover | image/missing/load failure; common link | Parent identity only | Child identity in Parent avatar; DB field invented for presentation |
| Thumbnail | 1:1 /4:3 /16:9, Home2.2:1 exception; R12/16 | Original image or ImageFallback | loaded/missing, meaningful alt | Real content imagery | Stretching, invented academy photos |
| Progress | track8, gap8, C1; Rfull | N100 track/G700 progress | determinate/indeterminate, accessible value | Real measured completion | Fake percentage or matching score |
| Stepper | indicator32 with hit44 if interactive, gap12; Rfull | N100/N600, active G700 | current/completed/upcoming; aria-current | Finite actual steps | Invented workflow statuses; color-only step |
| Date/Time Trigger | h44/48, icon20, X12; R12 | Input palette | common, selected, unavailable, error | Existing Asia/Seoul schedule choices | Comparing UTC timestamps directly to local clock strings |
| Data Visualization | constrained to Parent width, label C1/B2, gap16; R16 if card | Neutral labels, G700 emphasis; subject colors only for subject categories | loading/empty/error/data, textual alternative | Actual observations/counts/trends | Fake ranking, matching %, truncated misleading axes, unsupported paid features |

Home's class body reserves token-derived rows: title two B1 lines (48px), price one B2 line (21px), academy/location one C1 line (18px), subject one C1 line (18px), with 4px gaps and 16px padding. Blank metadata retains the row; title clamps after two lines. At 390px the next card exposure is 66px. Actual image URLs/rendering stay unchanged; shared ImageFallback handles absent URLs, not network-error recovery for every image.

## Content rules

Firstsuup supports exploration, observation, records and informed choice; it does not decide for the family. Use direct factual labels: “다가오는 수업 일정”, “이런 수업은 어때요?”, “우리 동네 학원”, “리포트 확인하기”. Never add BEST, 최고의 학원, 가장 잘 맞는 학원, fabricated recommendation order, matching score/96% matching, ratings or review counts. Schedule and report remain independent; never rename the schedule to “우리 아이의 지금”.

## Audit classification and compatibility exceptions

Audit date: 2026-09-20. EXISTS = source/contract present; PARTIAL = some implementation/coverage missing; MISSING = absent before this audit; CONFLICT = different rules in the same intended scope or an explicit legacy deviation. Documentation completeness and runtime component availability are separate.

| Audit area | Before finalization | Resolution / remaining runtime status |
|---|---|---|
| Parent authority | EXISTS | This file + scoped globals; no duplicate Parent specification discovered |
| Version notes | CONFLICT | Replaced iterative V1.1–V1.3 records with one final contract; old dark/white subject hover is not a current rule |
| Foundation colors/layout/spacing/radius | EXISTS | Exact V1 palette and white/Neutral50 shell confirmed |
| Typography/font delivery | PARTIAL | Sizes/stack exist; actual Pretendard Variable asset remains absent; browser falls back to system font |
| Core registry | PARTIAL / MISSING | Full approved values documented above; unused runtime variables intentionally not added |
| Home component documentation | PARTIAL | Complete geometry/colors/states/usage/prohibitions now documented |
| General forms/overlays/progress/chart documentation | MISSING | Component contracts added; not newly implemented or restyled |
| Product rules | EXISTS | Parent≠Child, URL ownership, eligibility, report/schedule separation and discovery retained |
| Home-vs-document conflict | CONFLICT | Category outline wording updated to colored pictogram; landscape2.2:1 explicitly remains an exception to generic media presets |
| Legacy root tokens | CONFLICT if applied as Parent V1 | V1 is opt-in; Studio and old pages keep current values until separately migrated |
| Shared BottomSheet | PARTIAL / CONFLICT | Legacy z-index200, overlay40%, some inline 13/15px text, incomplete focus trap/return remain. Home applies scoped radius24/buttonsB2/reduced motion; remaining differences are compatibility exceptions, not the target standard |
| Contrast | PARTIAL | N600 used for body information; specified N500 small inactive/placeholder text needs separate AA contrast review. Do not claim full WCAG conformance |

No new UI, route, auth, data, library, Studio or schema work is authorized by this documentation audit. In particular, do not fix the legacy sheet by silently changing shared runtime behavior.

## Final regression and verification

- Required commands: `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`, all `scripts/verify-parent-*.ts`.
- Build in an isolated copy when a dev server uses the working tree's `.next`; do not disturb the running dev server.
- Browser widths: 360 /390 /480 /1440. Mobile outer/surface white; desktop Neutral50 outer + white 480px surface, navigation inside, no page overflow.
- Confirm public search/category destinations, location continuity, Parent/Child ownership, original images/shared fallbacks, price position and equal-height 272px cards. Report-review and confirmed-schedule selection/child eligibility are covered by pure verifiers.
- Existing browser evidence: 66px next card at 390; same 122.72px image height and 273.72px card height; long-title/empty-metadata stress leaves height unchanged; hover Green50, pressed Green100, pictogram colors stable, 120ms, no scaling. Root JSX/content structure remains Home V1.3.
- Limit: no authenticated Parent session was available for browser testing of actual child names, reports and upcoming schedules. No fake live profiles, reports or schedules were introduced. No geolocation permission flow tested.
- Finalization preserves pre-existing unrelated untracked files and stages only the explicit Parent change list. Commit/push are authorized by the finalization request; no PR is created.


## Classes discovery adoption

`/classes` adopts the same V1 scope, shell, 20px gutter, search, region/child controls, pictograms and fallback. Classes is a standalone exploration screen: back to Home, canonical notification/profile links, and no Bottom Navigation. Home/Schedule/Record/My navigation remains unchanged. Page order: Page Header → region/child context → submitted search → subject category filter → detail subject sheet → result count → single-column list. No Home hero, recommendation rail or additional navigation tab.

- Subject pictograms also serve as real category filters on Classes. Preserve their colors and soft hover/pressed surfaces; selected category adds a Green700 outline plus `aria-current`. Use an edge-to-edge horizontal rail with unchanged Home icon/font/gap sizes: at 390px, about five items and part of the next remain visible. No permanent “전체 과목” button; existing removable chips clear category/subject filters. The detail-sheet trigger stays “세부 과목”, and the result heading only shows “수업 N개”. Show search-condition reset once, only for multiple active conditions with a resettable search/subject condition. The existing Home shortcut rule is unchanged.
- Home Class Card = horizontal discovery slider (272px landscape cards). Classes Class Card = horizontal comparison list card; these are separate components and purposes.
- Classes comparison card: left 112px square thumbnail (spacing48 + spacing64), right metadata (subject/target) → title B1 (maximum two lines) → body price B1 → academy/location C1. Full list width, R16, N0/N200, no shadow, padding12/gap12. No description or additional schedule/distance rows in the compact card. ImageFallback handles missing URLs; missing/invalid price is “가격 정보 확인 필요”, never inferred free. Card link and top-right real 44px favorite button are siblings. No image price overlay, fake rating or ranking.
- Classes reuses `HomeChildSelector` with an explicit unselected label and a clear-child choice even for one child. An owned `?child=` filters using the same `isChildEligibleForClass` as Home/application; missing selection is general discovery. Search/category/location changes retain the selection. No new age mapping. Child loading failure must not present unfiltered results as personalized.
- Real filters are query, subject category/subject, administrative region and nearby radius. The old unused stage component is not a supported filter. No day/time/grade/sort options are invented. General ordering remains created_at descending; nearby ordering remains distance then ID.
- The detail subject sheet keeps draft radio state until “결과 보기”; “초기화” clears the draft subject only. Search-condition reset clears query and subject filters while preserving region/child context. Region is changed/cleared in the existing region control; a nearby cookie has its existing explicit clear action.
- Classes opts into `BottomSheet.manageFocus`: keyboard containment, Escape, focus return, scrollable content and 48% backdrop, layer70. Legacy callers keep their default behavior. Skeleton follows the vertical 16:9 list; friendly errors reuse the existing page-local boundary, without changing detail-route error handling.
- Count is based on the retrieved eligible results, including zero. The old ten-card discovery cap is not used on Classes. Existing optional schedule summaries cover the first 20 results and do not promise booking availability; a schedule-query failure does not suppress the list. Backend pagination beyond the existing public query limit remains a future task.

## Class Detail adoption

`/classes/[id]` is for understanding, checking and applying. It uses the existing V1 white/480px shell and gray desktop canvas; no Bottom Navigation. The independent header has Back, “수업 상세”, and the real wishlist. Home remains discovery, Classes remains comparison.

- **Class Detail Hero:** existing 4:3 media preset, R16, cover image or shared ImageFallback; no overlays. Body order: subject/target badges → semantic class H1 styled H2 → neutral H3 price → canonical academy summary card. Academy profile slug is preferred, organization ID remains the supported fallback. Optional public academy-image lookup failures do not suppress the class.
- **Detail Info Row:** semantic `dl`, B1, icon/label and right-aligned value with gap16, N200 internal dividers in a White/R16 card. Only actual program type/class format and the existing post-assignment notice. Do not repeat academy/region/subject/target/price in this table or invent a class-wide duration. Schedule duration comes from actual start/end timestamps in Asia/Seoul.
- **Detail Accordion:** 52px native button with `aria-expanded`/`aria-controls`, H3 under the section H2, independently collapsed panels. Preserve original recommendedFor/experiencePoints/curriculum strings and line breaks; no generated bullets or curriculum count. Introduction previews four lines, with “더보기/접기” only when content overflows. No nonessential animation. Schedule shows only the earliest future reservable occurrence using the shared availability predicate and timestamp ordering. Other dates remain in the application sheet.
- **Sticky CTA:** button52/R12/G700/N0; white container, N200 top border, padding16×20 plus bottom safe area, max480, layer30. Content reserves 112px plus safe area. Opens the existing application sheet; does not invent unavailable/duplicate states. Guests may inspect slots before the existing sign-in step. An owned selected child gets factual eligibility text; ineligible children still use the sheet's existing alternate-child flow, and the server continues to enforce ownership/grade/slot/consent rules. The sheet traps keyboard focus, restores it on close, and is not hidden from assistive technology.

Academy summary uses real public logo/cover or ImageFallback; the full address and existing Naver provider remain in the Location section (240px preview). Detail's existing missing-data panel and query-error branch remain distinct; this task does not change its existing HTTP not-found semantics or the `/apply` route. Loading follows Hero/title/info/content without extra card decoration. No auth, DB, migration, workflow or Foundation changes.

### Class Detail V1.1 visual grouping

- Primary title H2, price H3, section headings H3, introduction/body B1 (supporting text B2), metadata C1. Section gap32 and heading-to-content16.
- Academy identity below price is a compact image/name/region link card. No duplicate lower academy section is rendered.
- Owned selected-child eligibility uses a User fallback and factual text: eligible Green50 with a check icon, otherwise Neutral50. No invented child images or assessments.
- Class info uses monochrome icon/label/value rows; schedule uses a Green50 calendar surface. Info, schedule, academy and accordion groups use White/N200/R16, padding16 and no shadow. Accordion rows keep native button/aria behavior and internal dividers. Introduction and location remain unboxed; the existing CTA tray and hero stay unchanged.

### Class Detail V1.2 child and schedule context

- Classes links preserve owned `?child=`. Detail validates ownership again; detail has no child selection UI. Without query context, summarize owned eligible children: one child by name, multiple children by count and names, none eligible with Neutral factual text, no children with no card. Invalid/foreign query IDs never expose a child. The application sheet remains the authoritative application child selection.
- Keep only the top Academy Summary link; omit the duplicate lower academy section. Keep location/address/Naver map independently.
- “가장 빠른 체험 일정” shows one concrete future reservable occurrence: reuse `isBookablePublicSlot`, sort by parsed timestamp (not string or input order), display in Seoul time. Empty/error states remain truthful. All other date/time choices stay in the existing application sheet.

- **Parent Map:** all Parent detail viewport widths use `zoomControl: false`, `scaleControl: false`, `pinchZoom: true`; retain drag, marker, NAVER logo/attribution and external map link. The 240px map keeps its existing radius. Its app-owned wrapper uses `position: relative; z-index: 0; isolation: isolate; overflow: hidden` so provider children stay below the layer30 Sticky CTA during scrolling. Do not modify provider DOM/CSS or hide attribution. Keep the existing 112px + safe-area content clearance separately.


## Parent Schedule V1 — `/my/schedule`

- 메인 탭 Header는 `내 일정`; Back 없이 기존 Parent 480px shell과 Floating Bottom Nav(일정 active)를 사용한다. 하단 여백은 `--parent-nav-space`.
- 자녀 Context는 공용 HomeChildSelector와 owned `?child=` 계약을 사용한다. 이미지 필드가 없는 자녀는 Neutral 원형 User outline fallback. 선택 시 예정/완료 count와 list 모두 child ID로 필터링한다. 미선택은 기존 전체 보기이며 카드에 자녀 이름을 구분한다.
- Segmented Control: 예정/완료와 실제 count, Green 700 selected, Neutral unselected, 최소 44px. tablist/tab/tabpanel, aria-selected와 좌우/Home/End 키 지원.
- Calendar grid 대신 월 heading + 날짜 리스트. 예정은 기존 future confirmed 판정/오름차순. 완료는 completed 상태/기존 경험 날짜 규칙(확정 수업일 우선)/내림차순. 취소 및 canceled로 처리되는 노쇼는 두 탭에서 제외한다. 날짜·오늘은 Asia/Seoul.
- Schedule List Card: White, Neutral 200 border, Radius 16, shadow 없음. 왼쪽 날짜·요일, 오른쪽 시작 시간/수업명/학원명/실제 주소/예정 또는 완료 배지. 거리·종료 시각·가격을 임의로 추가하지 않는다. 기존 `/record/[id]`로 이동.
- 예정 Empty는 `예정된 체험수업이 없어요.` / `새로운 수업을 둘러보세요.`와 child를 보존한 수업찾기 CTA. 완료 Empty는 `완료한 일정이 없어요.` / `체험수업이 완료되면 여기에 표시돼요.`.
- Loading은 자녀 Context/탭/카드 형태의 정적 skeleton. 조회 실패는 Empty와 분리하고 친근한 안내와 재시도 제공.


## Parent Record V1 — `/record`

- Header `기록` / `아이의 경험과 남겨진 기록을 확인해보세요.` → 공용 Child Selector의 Schedule Context 스타일 → 조건부 교육 프로필 compact Green 50 card → `교육 기록 N개` → 최신 경험순 월별 목록 → V1 Floating Bottom Nav(기록 active).
- 전체 Context는 `모든 아이` / `총 N명의 자녀`, 선택 Context는 실제 이름·학년과 User outline fallback. owned `?child=` 사용. 교육 프로필은 선택 자녀 또는 유일한 자녀일 때만 노출한다.
- Experience Card: White/N200/R16/no shadow. Schedule 카드와 같은 왼쪽 고정 40px 날짜 컬럼(큰 일 숫자 + 요일), 오른쪽 C1 프로그램 유형/수업명(최대 두 줄)/학원명/chevron. 월은 바깥 그룹 heading에만 표시한다. 날짜 H1, 본문 gap4, 컬럼 gap16/padding16을 Schedule과 맞춘다. 전체 보기에서만 자녀 정보. completed만 있는 목록이므로 완료 badge는 반복하지 않는다.
- 카드 본문과 리포트 링크는 별도 영역으로, 중첩 link 없이 기존 상세/리포트 route를 사용한다. 현재 published report와 확인된 ParentDecision 신호만 표시한다. `내 생각 남김`은 기존 조회 범위(발행본 있는 경험)에 한정되며 전체 기록의 작성률/완료 상태로 해석하지 않는다.
- 월별 최신순은 resolveParentExperienceDate와 Asia/Seoul 계약 유지. 상세/리포트/교육 프로필/탐색 링크에 검증된 child Context를 전달한다. 데이터와 권한 계약을 변경하지 않는다.
- 중앙 Empty: `아직 쌓인 교육 기록이 없어요.` / `체험수업이나 레벨테스트를 완료하면 아이의 경험이 이곳에 차곡차곡 쌓여요.` / child를 유지한 `수업 찾아보기`. 자녀·기록 조회 오류는 Empty와 분리하며 현재 URL을 유지하는 실제 retry를 제공한다. 신호 조회 실패는 부정 배지를 만들지 않는다.
- 새 필터·정렬 UI·NEW/read-state·점수·순위·사진·평가를 추가하지 않는다. 기존 typography/spacing/shell/nav safe-space token만 사용한다.


## Parent Record Detail V1 — `/record/[experienceId]`

- 완료 경험: Back Header `체험 기록` → 자녀/유형/수업/학원/Seoul 날짜·시간/장소를 한 번만 보여주는 Summary → 발행 관찰 → 부모 생각 → 조건부 교육 프로필 → `수업 다시 보기`. Bottom Nav 없음. 480px white surface와 desktop Neutral 50 outer 유지.
- Summary/section은 N200 border/R16/no shadow, 버튼 R12, chip full radius. 기존 typography/spacing token만 소비한다. 종료 시각은 현재 데이터에 없으므로 만들지 않는다.
- 관찰은 published snapshot의 첫 두 관찰 원문과 존재하는 총평만 표시하고 canonical report로 연결한다. 빈 상태는 `아직 등록된 리포트가 없어요.`; 실패는 재시도와 구분한다. 추측/요약/NEW 없음.
- 완료 경험의 ParentDecision 조회와 수정 권한은 분리한다. 저장된 생각은 canCollectParentDecision=false여도 읽기 전용으로 표시한다. 변경 UI만 기존 capability로 제한하며 기존 form/action을 재사용한다. 부모 의향을 학원 등록 결과로 해석하지 않는다. 기존 가능한 일정과 legacy 날짜는 저장된 의미 그대로 표시한다.
- 교육 프로필은 experience.childId가 owned children에서 확인될 때만 연결한다. URL child context는 목록/리포트/수업 이동에 유지하며 경험의 자녀를 대체하지 않는다.
- 미완료 신청은 기존 상태/일정/취소 계약을 유지한다. 완료 경험 전용 관찰/생각을 노출하지 않는다. 취소된 신청에 수업 진행 예정이라는 약속을 하지 않는다.
- 상세 skeleton, 조회 실패 retry, 본인 기록 없음/not-found를 구분한다. 내부 CRM/상담/학원 등록 결과 원문을 추가로 조회하지 않는다.


## Parent Report Detail V1 — `/record/[experienceId]/report`

- `체험 리포트` Back Header → snapshot 경험 요약 카드(자녀/학년/유형/수업/학원/경험 날짜) → 관찰 원문 전체 → 조건부 총평 → 조건부 과정·레벨 제안 → 조건부 일정 제안 → 발행일/학원 출처/상세 복귀 CTA. Bottom Nav 없음.
- 요약만 N200/R16 카드로 표현하고 본문은 section gap32/heading gap16과 얇은 구분선으로 읽는다. B1 본문, 원문 줄바꿈 유지, gutter20/max480, desktop N50 canvas/white surface. 기존 typography/token만 사용한다.
- 없는 관찰·총평·제안은 해당 section을 생략한다. snapshot label을 재해석하거나 줄이지 않는다. 일정은 발행된 자유 텍스트이며 확정/예약 가능 일정으로 표시하지 않는다. 점수/순위/적합도/읽음 신호/내부 메모 없음.
- 본인 신청/RLS/published source 유지. 소유 조회 실패와 not-found를 구분한다. report 전용 loading/error, 조회 실패 실제 retry, 리포트 없음 중립 안내+상세 복귀를 제공한다. owned child context를 상단/하단 복귀에 유지한다. 로그인 returnTo의 child는 이동 context일 뿐 소유권 근거가 아니다.


## Parent My V1 — `/my`

- `마이페이지` Header + 알림 링크 → 학부모 프로필(avatar/이름/내 정보 수정하기) → 우리 아이(자녀 관리/등록 자녀 수) → 내 활동(신청 현황/관심수업) → 계정 및 서비스 안내(로그아웃/약관/개인정보/제3자 제공 동의) → 공용 Footer 사업자 정보 → V1 Floating Bottom Nav(마이페이지 active).
- owned children 조회의 실제 개수만 표시한다. 실패는 0명으로 바꾸지 않고 자녀 영역 retry로 제한하며 프로필/메뉴/로그아웃은 유지한다. 신청 dashboard 집계는 조회하지 않는다. My 전용 skeleton/error를 제공한다.
- 일정/기록은 Bottom Nav에만 둔다. `/my/actions`는 이번 My에서 노출하지 않는다. 관심수업의 localStorage 계약, 기존 인증과 로그아웃 POST는 유지한다.
- 프로필은 학부모 본인이다. 실제 이미지 필드가 없어 User outline fallback을 사용한다. 20px gutter/480px white surface/desktop Neutral 50, 기존 type/radius/spacing token을 사용한다. Footer는 opt-in V1과 약관 링크 숨김으로 본문 중복을 방지한다.
- 회원 탈퇴 route/action이 없어 이번 버전에는 가짜 링크를 렌더하지 않는다. 실제 기능이 마련되는 별도 작업에서 서비스 안내 카드 밖 하단 중앙의 작은 Neutral text link로 제공한다.

- My visual refinement: 프로필은 Green 50/R16, 64px User outline avatar, 학부모 이름과 하단 전폭 outline `내 정보 수정하기`. 우리 아이와 내 활동에는 40px soft icon surface/24px monochrome outline/제목/설명을 함께 둔다. 자녀 0명은 실제 빈 상태 문구, 조회 실패는 기존 부분 오류로 구분한다. 계정 안내는 동일 stroke의 outline icon과 중립 로그아웃을 사용한다.
- My Footer는 48px logo, C1 Neutral 보조 문구와 border 없는 compact 사업자 details로 본문보다 약하게 표현한다. 공용 V1 nav/safe-area는 유지한다. 회원 탈퇴가 구현되기 전에는 안내 카드와 Footer 사이에 가짜 UI/링크를 만들지 않는다.


## Parent Children V1 — `/my/children`

- Back Header `자녀 관리` → `/my`. 관리 화면이며 `?child=` 선택 context와 편집 상태는 분리한다. 기존 최신 등록순/owned children/create·update action/RLS/필드는 유지한다. 삭제 기능과 새 필드는 추가하지 않는다.
- `등록된 자녀 N명` 목록은 User outline avatar, 이름, 표시용 학년, 실제 학교명만 노출한다. 긴 메모/수준/목표는 목록에 반복하지 않는다. 알 수 없는 학년은 코드를 노출하지 않고 확인 안내를 사용한다.
- White/R16/Neutral 200 card, gutter20/max480, Green action. 수정 hit area 최소44px. 선택 자녀처럼 radio/선택 pill을 만들지 않는다. 수정 폼만 해당 카드 바로 아래 펼치며 heading focus/scroll과 reduced-motion을 지원한다.
- 목록 아래 `+ 자녀 추가하기`. 0명은 중앙 Empty와 Primary CTA, 버튼을 누르면 추가 폼을 연다. 이름·학년 필수, 기존 선택 필드는 `추가 정보 (선택)` details에서 확인/수정한다. 추가/수정 모두 저장·취소, 저장 오류는 입력값과 함께 유지한다.
- loading은 공통 frame 안의 정적 skeleton, 조회 오류는 실제 재조회 + `/my` 복귀, 저장 오류는 form alert로 구분한다. 기존 Floating Bottom Nav V1의 마이페이지 active 및 safe-space를 유지한다.


## Parent Academies V1 — `/academies`

- 독립 탐색 화면: Home 복귀 Back Header `학원 찾기`, Bottom Nav 없음. White/max480/gutter20/desktop Neutral 50와 R16 thin-border/no shadow card를 사용한다.
- 기존 위치 설정을 지역 Context로 분리하고 실제 q 검색 → 과목/학년/정렬 → 해제 가능한 검색 조건 → `학원 N개` → 카드 목록 순서로 표시한다. 지역·cookie는 기존 위치 설정에서 변경하며 검색 조건 초기화는 q/subjectCategory/subject/grade만 해제한다.
- `recommended` query/default comparator는 유지하고 표시명만 `기본순`으로 바꾼다. 내 주변은 기존 거리순을 유지한다. 추천/평가/순위 의미를 추가하지 않는다.
- 카드 전체가 `/academy/{organizationId}` 단일 링크다. 공통 outline 건물 아이콘은 로고가 아닌 fallback이다. 실제 이름/지점/지역 또는 거리/과목/대상/주소만 표시한다. 대표 수업·중복 CTA·사진·별점은 목록에 넣지 않는다.
- getAcademiesForList 공개 범위, Subject Master, 학년/지역/query/cookie와 handle resolver는 변경하지 않는다. child eligibility나 새 조회 계약을 만들지 않는다.
- 지역 canonical redirect를 완료한 뒤 결과 조회에 Suspense skeleton을 적용하여 기존 HTTP 307을 유지한다. route 전체 loading 대신 결과 fallback을 사용한다. 위치/목록 조회 실패는 0건과 분리하고 router.refresh retry를 제공한다. 상위 초기 조회 오류는 route error boundary에서 retry한다.

## Parent Academy Detail V1 — `/academy/[handle]`

- Back Header `학원 소개`, `/academies` 복귀, hit44. White/max480/gutter20, desktop Neutral 50, single column. Bottom Nav/고정 전화 tray 없음.
- 공개 cover/profile 이미지가 있으면 실제 이미지를 비율 유지하여 표시한다. 둘 다 없을 때만 academy outline fallback. Gradient/가짜 이미지 없음.
- 학원명·지점·기존 조직 행정지역·실제 짧은 소개·공개 수업의 과목 → 공개된 수업 N개 → 실제 소개 본문 → 실제 방문 정보. 주소는 방문 정보에서 한 번만 표시한다.
- 수업 카드는 유형/제목/과목/학년/실제 일정 요약/chevron, 전체가 기존 class detail 링크. 가격·thumbnail·예약 가능 추측 없음. 0건은 `현재 공개된 수업이 없어요.`
- 전화는 공개용 organizations.academy_phone만 사용한다. 담당자 contact_phone fallback은 금지한다. 방문 정보 안에 실제 번호와 보조 전화하기 링크만 제공한다.
- 소개/운영시간/주차/오시는 길은 실제 값이 있을 때만 표시. 구조화된 가짜 특징 없음. 지도·child 전달·목록 query 복원은 이번 범위에 없다.
- route loading/error(reset retry)/not-found를 구분하며 학원 존재 + 수업 0건은 학원 정보를 유지한다.

## Parent Notifications V1 — `/notifications`

- 독립 사건 이력 화면: Back Header `알림` → Home, 다른 navigation/Bottom Nav 없음. V1 White/max480/gutter20/R16/thin border.
- 기존 본인 신청·상태 로그·published report·5종 mapping·destination 유지. Action 목록과 합치지 않는다. 내부 note/직원/전화/SMS 로그는 노출하지 않는다.
- Seoul 최신순 날짜 그룹: 오늘 / 같은 연도 월·일·요일 / 다른 연도 연·월·일·요일. 행은 Green outline icon surface → 제목 → 자녀·수업 → 학원 → 실제 HH:mm → chevron. 행 전체 링크, 반복 확인하기 없음.
- 읽음 표시는 아래 Persisted notification reads 규칙을 따른다. 숫자 badge·NEW·localStorage 추론 없음.
- Home bell은 기존 href/접근성/터치영역을 유지한 채 공통 아이콘 presentation만 사용한다.
- Empty에는 CTA 없음. 조회 실패는 router.refresh retry, route error는 reset 병행. Loading은 날짜 heading + 행 skeleton. Pagination/child context는 추가하지 않는다.

## Parent Notifications V2 — Report card timeline

- 단일 날짜별 timeline 유지. 별도 action section 없음. report_published만 Green 50/Green 200/R16 카드와 44px `리포트 보기` 링크로 표시. 일반 4종 row/destination/time/grouping 유지.
- 기존 getParentActions 결과의 experience/report href가 일치할 때만 생각 남기기 보조문구를 추가한다. ParentDecision 저장은 event 제거 조건이 아니다. 알림 source/selector는 action selector와 분리한다.
- `/my/actions` page/CSS는 제거하고 `/notifications` 영구 redirect로 호환한다. action domain과 Home query는 유지한다.
- Home bell은 아래 persisted read 규칙을 사용한다. pending report action은 보조문구 판정에 사용하며 bell과 분리한다.
- 데이터 조회 실패는 실제 retry를 제공하고 action 조회 실패를 결정 존재로 추정하지 않는다. 결정 저장 후 Notifications/Home 재검증. 기존 후보 20건 제한을 유지하며 전체 unread count를 의미하지 않는다.

## Persisted notification reads

- Stable key는 기존 `status:<application_logs.id>` / `report_published:<experience_reports.id>` 그대로다. 완료 알림도 실제 완료 전이 log ID다. 새 버전 report ID는 별도 알림이다.
- `parent_notification_reads`는 본인 parent/key의 최초 읽음 시각을 저장한다. 현재 event와 receipt를 매칭하며 조회 실패를 unread로 추측하지 않는다. 원본 사건과 ParentDecision은 변경하지 않는다.
- 일반 unread 행은 Green50, 제목600, 6px red dot; read 행은 White/제목500. Report는 읽은 후에도 Green 강조 variant/버튼을 유지하고 dot과 제목 강조만 해제한다.
- Home bell dot은 실제 unread event가 있을 때만 표시한다. V2 pending-report bell 정책을 대체한다. ParentDecision 보조문구는 action selector로 별도 판정한다.
- 클릭은 읽음 저장 후 canonical destination으로 이동한다. read 행은 write를 생략한다. 저장 실패 또는 1.5초 지연 시에도 이동하며, 실패한 receipt는 다음 조회 때 unread로 남는다. 수정키/새 탭은 기본 링크 동작을 유지하며 저장을 시도한다.
- source가 철회/삭제되어도 receipt는 inert 상태로 보존한다. orphan cleanup은 별도 유지보수 범위이며 자동 삭제하지 않는다.

- Read-state 조회 실패 시 event 목록은 유지한다. `readStateStatus=unavailable`, `isUnread=undefined`로 unknown을 표현한다. dot/읽음 저장 enhancement만 비활성화하고 기본 surface로 렌더한다. 이를 읽음 완료로 저장하거나 추정하지 않는다. 실제 event 조회 실패만 전체 Error이며 서버 로그에 단계/code/message를 남긴다.

- Receipt RLS의 source 소유권 검사는 `my_trial_applications` Parent view를 사용한다. Parent에게 비공개 원본 trial_applications SELECT 권한을 추가하지 않는다.

### Home 부가 조회 실패

알림 읽음 상태, bell indicator, 체험 후 action 조회 실패는 Home 전체 오류로 전파하지 않는다. 읽음 상태 불명은 `readStateStatus: unavailable` / `isUnread: undefined`로 유지하고 dot을 표시하지 않는다. Action 조회 실패는 부분 안내로 표현하며 정상 조회된 일정과 탐색 영역은 유지한다. 실패를 읽음 또는 할 일 없음으로 해석하지 않고 서버에 조회 단계와 오류를 기록한다.

## Education Profile V1 — /record/profile

- Owned `?child=` remains required. Back returns to `/record?child=…`; no child selector or Bottom Nav. Missing/unowned children keep the same not-found response.
- Child name + “발행된 체험 리포트의 관찰을 시간순으로 모았어요.” + “N개의 체험 리포트”. Count unique experiences with a current published snapshot, not all applications.
- One timeline entry per experience, newest experience first, month groups in Asia/Seoul using the existing Record date resolver. Preserve per-report observation labels in full; never substitute the latest label from another experience.
- Date, snapshot class/academy names and recognized trial/level-test type; no subject without source data. Neutral thin timeline line with small Green dots, White R16 thin-border cards. Full-width report link has a 44px minimum touch target and preserves child context.
- No observation-frequency display, traits, scores, ranking, ParentDecision, AI summary or evaluation. Existing aggregate domain consumers remain unchanged.
- Distinguish no published reports, a published report with zero observations, query failure with server refresh retry, and skeleton. Unexpected route errors offer a full-request retry. Missing observation entries do not hide the report link.
- Shared Parent V1 scope: gutter20, max480, desktop Neutral50 outer canvas, white centered surface, no shadow; semantic dates, headings, focus and no motion-dependent loading.

- Education Profile headers use a 64px square, R12 class thumbnail beside snapshot metadata. Read current active public `classes.cover_image_url` in one batch after owned experience/published report lookup; no academy substitution. Missing/failed images use the shared ImageFallback. Media lookup failure keeps observations available.

## Applications V1 — /my/applications

- Back Header `신청 현황` → `/my`; intro → accessible 진행 중 N / 취소 N tabs → application cards. No child selector; every card names the child and formats the stored grade. No new child query contract.
- Existing selectors preserve new/reviewing/confirmed and canceled, newest application first; completed stays in Record. Do not infer completion from dates. Canonical detail destination `/record/[applicationId]` and detail-only cancellation guards stay unchanged.
- 64px R12 actual active-public class image or shared fallback, type/status → class → academy, then child and Seoul schedule. Confirmed timestamp takes precedence; otherwise requested timestamp. No academy image substitution. Optional image failure does not fail applications.
- V1 White/R16/thin-border cards, gutter20, max480, desktop Neutral50, no shadow. Neutral canceled styling. V1 Floating Bottom Nav, My active, no active nav pill; reserve bottom safe space.
- Progress empty invites discovery at `/classes`; canceled empty is separate. Card skeleton and route-specific errors preserve the frame; query errors use router.refresh, unexpected route errors reload. No registration/CRM fields, fake status, or in-card cancellation.
