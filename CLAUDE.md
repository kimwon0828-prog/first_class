# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

첫수업 (First Class) — a Korean pre-enrollment operations platform. Parents browse and apply for trial classes (체험수업) / level tests (레벨테스트); academies manage those applications, confirm schedules, record the trial, share a parent report, and track conversion to enrollment.

`AGENTS.md` holds the product/development rules in Korean and is authoritative for product policy. `docs/00-brief` → `05-implementation-plan` started as MVP-era planning docs; they now carry "현재 상태" notes where the code moved on. For the data model, `supabase/migrations/` is the source of truth (`docs/04-data-model.md` only summarizes it). The other `docs/*.md` files are per-feature release/review notes — read the relevant one before changing behavior in that area.

## Commands

```bash
npm run dev          # next dev
npm run build        # next build
npm run lint         # next lint (eslint-config-next)
npm run typecheck    # tsc --noEmit

npm run supabase:link      # link CLI to the hosted project
npm run supabase:push:dry  # dry-run migrations against the linked project

npx tsx scripts/seed-demo-academy.ts            # seed demo academy/parent data (needs SUPABASE_SERVICE_ROLE_KEY)
npx tsx scripts/reset-demo-academy-password.ts
npx tsx scripts/verify-phase5-capacity.ts
```

There is no test framework in this repo. "Done" means: the page runs, the core flow connects end to end, and `npm run typecheck` + `npm run lint` are clean.

## Architecture

Next.js 15 App Router (React 19, server components by default) + Supabase (auth, Postgres, RLS, storage). Deployed on Vercel. Path alias `@/*` → `./src/*`. Styling is plain CSS Modules (`*.module.css`) colocated with the route/component — no CSS framework.

### Route surfaces

Three audiences, each with its own auth posture:

- **Parent** (`/classes`, `/classes/[id]`, `/academies`, `/favorites`, `/my/*`) — mobile-first. Listing and detail are public (no login); applying and `/my/*` require a session.
- **Studio** (`/studio/*`, dashboard under `app/studio/(dashboard)`) — desktop-first, for academy accounts. Served on its own host `studio.firstsuup.com`, where internal `/studio/x` paths appear as `/x` (see `shared/config/studio-routes.ts`, `studio-navigation.ts`). Academies sign up publicly at `/studio/sign-up`, which files a `teacher_signup_requests` row (pending); an admin approves it at `/admin/academy-approvals`, which creates the `organizations` row and an `academy` profile. There is no invite flow. Teachers (`teachers`) are a roster the academy maintains — they have no login (`profile_id` is null).
- **Admin** (`/admin/*`) — academy approvals and update requests. Requires `profiles.role = admin`.

Plus `/partner` (landing), `(legal)` pages, and `app/api/*`: health, admin geocode, Toss webhook, report attachments, parent phone OTP, native app APIs, partner inquiry, and cron routes. `vercel.json` schedules five crons — `rolling-schedules`, `trial-reminders`, `billing-renewals`, `billing-reconciliation`, `trial-privacy-retention` — and `/api/cron/schedule-confirmed-push` is invoked by a pg_cron job that its migration creates **inactive**. All cron routes check `CRON_SECRET`.

`middleware.ts` matches `/my`, `/applications`, `/studio`, the apply route, and every path on the Studio host. It refreshes the Supabase session cookie, rewrites Studio-host paths to internal `/studio/*`, and redirects legacy `/studio/...` URLs to the Studio host — it does **not** authorize. Authorization lives in the server helpers below.

### Feature modules (`src/features/<domain>/`)

Consistent subfolders: `actions/` (`"use server"` mutations), `queries/` (server reads), `lib/` (pure logic, guards, formatters), `ui/` (components). Main domains: `auth`, `classes`, `applications`, `children`, `my`, `record`, `favorites`, `studio`, `admin`, `academies`, `organizations`, `billing`, `registration`, `reports`, `feedback`, `decisions`, `reservation-import`, `schedule`, `subjects`, `location`, `maps`, `notifications`, `native` (see `src/features/` for the full list).

`app/**` route files stay thin: they compose feature `queries` for data and pass feature `actions` to forms.

### Data access — the adapter

`src/shared/lib/db/` is the single data seam. `adapter.ts` defines the `DataAdapter` interface plus all shared domain types (`ClassSummary`, `ApplicationStatus`, `UserRole`, …); `index.ts` picks `supabase-adapter.ts` or `mock-adapter.ts` from `NEXT_PUBLIC_DATA_SOURCE` (falling back to supabase when Supabase env vars exist). Both implementations must stay in sync — adding an adapter method means implementing it in the mock too. Domain types belong in `adapter.ts`, not in route files.

Some features query Supabase directly rather than through the adapter (e.g. `features/classes/queries/*`, studio actions); that is expected — the adapter is the shared surface, not a hard boundary.

### Supabase clients — pick deliberately

`src/integrations/supabase/`:

- `client.ts` — browser client (`"use client"` only).
- `server.ts` — cookie-based server client for RSC/actions; also exports a cookie-parsing fallback used when the normal session read fails.
- `middleware.ts` — request/response cookie-syncing client for `middleware.ts`.
- `service-role.ts` — `server-only`, bypasses RLS. Use only where RLS cannot express the need (e.g. public class projections), and always project explicit safe fields — see `features/classes/queries/public-class-safe-projection.ts` for the pattern of stripping non-public columns before returning to unauthenticated visitors.

Env is read through `shared/config/env.ts` (public) and `shared/config/server-env.ts` (`server-only`, service role + Naver secrets), never `process.env` directly in feature code.

### Auth and roles

DB roles (`profiles.role`) and app roles differ. The DB CHECK allows only `parent | academy | admin`. `normalizeProfileRole` in `features/auth/lib/profile-sync.ts` maps `parent → parent`; `academy → academy`; `operator | admin → admin`; anything else (including the removed `teacher` role) → `null` (unsupported). `operator` survives only as a legacy value in app code and some RLS policies. In RLS, `app.current_role()` folds `academy`/`admin` into `'teacher'`, so `'teacher'` in policy names means "academy login account". Always normalize before comparing roles.

Guards, all `cache()`-wrapped and redirect-on-failure:

- `features/auth/lib/session.ts` — `getSession` / `requireSession`.
- `features/my/lib/require-parent-access.ts` — parent routes.
- `features/studio/lib/require-teacher-studio-access.ts` — studio routes; resolves profile → role (academy/admin/operator) → `organization_id` (no `teachers` row is involved), and redirects to `/studio/access?reason=…`, `/studio/pending`, or `/classes` with a specific reason for each failure. Keep new failure paths distinguishable by reason.

Set `NEXT_PUBLIC_DEBUG_AUTH=1` to log the middleware, server-client cookie state, and every studio-access decision.

### Database

Migrations are timestamped SQL in `supabase/migrations/` — append a new file, never edit an applied one. RLS is the primary authorization mechanism (parents see only their own children/applications; teachers are scoped to their organization); a schema change that adds a parent- or teacher-visible table needs its policies in the same migration. `supabase/seed.sql` seeds one parent and one academy account for local use (the `teacher@example.com` login gets `role = academy`). Public signup on the parent side creates `parent` profiles only; academy accounts come from the sign-up → approval flow above.

### Notifications

`features/notifications/` sends SMS via NCP SENS (`sms/providers/ncloud.ts`) and Alimtalk, with templates and `sms_logs` event logging. Sending is gated by `SMS_SEND_ENABLED`; call sites use the `…Safely` wrappers so a delivery failure never fails the user's action.

## Conventions

- Double quotes, no semicolons, 2-space indent.
- Server-first: reach for a client component only when interaction requires it.
- Every screen handles loading, empty, and error states.
- Server actions return a discriminated result (`{ status: "success" | "error", message }` or `ActionResult<T>` from `shared/actions`) rather than throwing to the UI.
- User-facing copy is Korean.
- The academy-area concept is gone (`academy_area` column dropped). Parent-facing discovery is limited to 서울 노원구 via `features/location/lib/parent-launch-region.ts`.
- MVP program types are exactly `trial_class` and `level_test`; application status is `new | reviewing | confirmed | completed | canceled`. Don't widen either without a docs change — attendance/result/consultation/registration live on separate axes (`no_show_at`, `trial_results`, `experience_reports`, `registration_results`, …). Academy actions today: confirm (new·reviewing → confirmed), complete (confirmed → completed), cancel (→ canceled), no-show (confirmed → canceled + `no_show_at`). Nothing moves an application *into* `reviewing` anymore; it remains for older rows.

## Studio UI 작업

`/studio` 하위 UI를 생성하거나 수정할 때는 루트의 `STUDIO_DESIGN_SYSTEM.md`(Studio Design System v2, Figma `2148:4687` 기준)를 **먼저 읽고 준수한다.**
v2 토큰은 `app/studio/studio-v2-tokens.css`(`--sv2-*`), 공통 부품은 `src/features/studio/ui/v2/`에 있다.

- 문서에 정의되지 않은 color / spacing / radius / max-width / card pattern / button hierarchy / status representation / page layout pattern 을 임의로 추가하지 않는다.
- List / Detail / Settings / Form 화면을 만들기 전에 문서의 해당 Page Pattern(특히 Case List Pattern, Case Detail Pattern)을 먼저 확인하고, 화면마다 새 레이아웃을 발명하지 않는다.
- 필요한 규칙이 문서에 없거나 기존 코드와 문서가 충돌하면 임의로 구현하지 말고 먼저 보고한다.
- 규칙을 바꿔야 하면 문서를 먼저 고치고 코드에 반영한다.

단, 아래 `작업 제약`의 안전/DB/git 규칙이 이 문서보다 우선한다.

## 작업 제약 (Working Constraints)
- 데이터 로직(src/features/**/queries/*, supabase-adapter.ts)을 포함해 코드 전반을 다룰 수 있다.
  단, 쿼리 파일/adapter/DB 스키마를 수정하기 전에는 반드시 "제안 → 확인"을 거친다.
- DB 스키마 변경, 마이그레이션 파일 생성/수정은 명시적 승인 없이 실행하지 않는다.
- git add, commit, push 등 git 작업은 명시적 승인 없이 절대 실행하지 않는다.
- 새 패키지 설치(npm install 등) 금지 — 명시적 승인 없이는.
- 테스트 데이터의 이상 징후를 임의로 지적하거나 수정하지 않는다.
- 각 구현 단계는 "제안 → 확인 → 실행 → 보고" 순서를 따른다. 확인 없이 바로 실행하지 않는다.
