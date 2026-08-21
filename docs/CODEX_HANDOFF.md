# FirstSuup Codex Handoff

## 1. Project Overview
- CURRENT: This repository is a Next.js 15 App Router service for FirstSuup, a parent-facing trial class / level test discovery and application flow plus a studio/admin operations surface for academies.
- CURRENT: The active stack in `package.json` is `next`, `react`, `typescript`, `@supabase/ssr`, `@supabase/supabase-js`, `iconv-lite`, and `nodemailer`.
- CURRENT: Parent-facing routes are mobile-first. Studio routes are desktop-first.
- CURRENT: The root route `app/page.tsx` re-exports `app/classes/page.tsx`, so `/` currently resolves to the classes listing surface.
- CURRENT: MVP program types used in code are `trial_class` and `level_test`.

## 2. Architecture
- CURRENT: `app/**` route files are thin entry points. Most domain logic lives under `src/features/**`.
- CURRENT: Feature domains include `auth`, `applications`, `classes`, `children`, `my`, `studio`, `admin`, `academies`, `notifications`, `partner`, and supporting shared modules.
- CURRENT: Shared data access is centered on `src/shared/lib/db/adapter.ts`, with runtime selection in `src/shared/lib/db/index.ts`.
- CURRENT: `src/shared/lib/db/supabase-adapter.ts` is the main production implementation. `src/shared/lib/db/mock-adapter.ts` mirrors the same interface for mock mode.
- CURRENT: Supabase clients are intentionally split:
  - `src/integrations/supabase/client.ts`: browser client
  - `src/integrations/supabase/server.ts`: SSR / server action client
  - `src/integrations/supabase/middleware.ts`: middleware cookie sync client
  - `src/integrations/supabase/service-role.ts`: service-role client for privileged reads/writes
- CURRENT: Notifications are separated into parent notifications via Alimtalk with SMS fallback and studio/admin notifications via SMS logging + send wrappers.

## 3. Route Map
- CURRENT: Parent public routes
  - `/`
  - `/classes`
  - `/classes/[id]`
  - `/academies`
  - `/academy/[handle]`
  - `/favorites`
  - `/partner`
  - `/(legal)/privacy`
  - `/(legal)/terms`
  - `/(legal)/third-party-consent`
- CURRENT: Parent authenticated routes
  - `/classes/[id]/apply`
  - `/my`
  - `/my/applications`
  - `/my/children`
  - `/my/profile`
- CURRENT: Auth routes
  - `/auth/sign-in`
  - `/auth/sign-in/email`
  - `/auth/sign-up`
  - `/auth/find-email`
  - `/auth/recovery`
  - `/auth/reset-password`
  - `/auth/update-password`
  - `/auth/account-conflict`
- CURRENT: Studio routes
  - `/studio/sign-in`
  - `/studio/sign-up`
  - `/studio/access`
  - `/studio/pending`
  - `/studio`
  - `/studio/applications`
  - `/studio/applications/[id]`
  - `/studio/classes`
  - `/studio/classes/new`
  - `/studio/classes/[id]/edit`
  - `/studio/schedule`
  - `/studio/teachers`
  - `/studio/settings`
  - `/studio/mypage`
  - `/studio/mypage/profile`
  - `/studio/unregistered`
- CURRENT: Admin routes
  - `/admin/academy-approvals`
  - `/admin/academy-update-requests`
- CURRENT: API routes
  - `/api/admin/organizations/geocode`
  - `/api/cron/trial-reminders`
  - `/api/debug/auth-profile`
  - `/api/health/supabase`
  - `/api/partner-inquiry`
- STALE DOCUMENTATION: `docs/03-screen-list.md` mentions `/applications/complete`, but no matching route exists under `app/`.
- NEEDS VERIFICATION: `middleware.ts` still matches `/applications/:path*`, but no `app/applications/**` route exists in the current tree.

## 4. Authentication & Authorization
- CURRENT: `middleware.ts` refreshes Supabase auth cookies for `/my`, `/applications`, `/studio`, and `/classes/:id/apply`. It does not perform business authorization.
- CURRENT: Parent route authorization is enforced in `src/features/my/lib/require-parent-access.ts`.
- CURRENT: Session access is centralized in `src/features/auth/lib/session.ts`.
- CURRENT: Studio authorization is enforced in `src/features/studio/lib/require-teacher-studio-access.ts`.
- CURRENT: Admin authorization is enforced in `src/features/admin/lib/require-admin.ts`.
- CURRENT: `src/features/auth/lib/profile-sync.ts` normalizes DB roles into app roles:
  - `parent -> parent`
  - `teacher | academy -> academy`
  - `operator | admin -> admin`
- CURRENT: Actual code supports more than the simplified `parent/teacher` wording in `AGENTS.md`. Present code paths include `academy`, `admin`, and some `operator` compatibility handling.
- STALE DOCUMENTATION: `AGENTS.md` describes teacher signup as invite/manual only, but current code includes a public `/studio/sign-up` request flow that creates `teacher_signup_requests` and then waits for approval.

## 5. Trial Application Lifecycle
- CURRENT: Parent application creation starts at `app/classes/[id]/apply/page.tsx` and submits through `src/features/applications/actions/create-trial-application.ts`.
- CURRENT: The write path for creation is `dataAdapter.createTrialApplication(...)` and the production implementation is in `src/shared/lib/db/supabase-adapter.ts`.
- CURRENT: The base status contract in code is:
  - `new -> reviewing -> confirmed -> completed`
  - `canceled` exists as an exit state
- CURRENT: Do not rename or repurpose these base statuses without explicit approval and a full impact check.
- CURRENT: Status transitions are handled by `src/features/studio/actions/update-application-status.ts`.
- CURRENT: That action writes through `dataAdapter.updateStudioApplicationStatus(...)`, which updates `trial_applications` and appends `application_logs`.
- CURRENT: Confirmation work must be treated as a multi-surface change area:
  - `trial_applications`
  - `application_logs`
  - `schedule_blocks` and/or `class_schedules`
  - notification logs / send wrappers
  - downstream registration funnel data
- CURRENT: Assignee updates are handled separately in `src/features/studio/actions/update-application-assignee.ts`.
- CURRENT: The main detail route for studio lifecycle work is `app/studio/(dashboard)/applications/[id]/page.tsx`.

## 6. Schedule & Timezone Rules
- CURRENT: The service operates on `Asia/Seoul` semantics for schedule interpretation.
- CURRENT: KST datetime parsing/formatting utilities live in `src/features/studio/lib/seoul-datetime.ts`.
- CURRENT: `parseSeoulDateTimeLocalToIso()` converts a local KST datetime input into a UTC ISO string by applying the Seoul offset explicitly.
- CURRENT: Schedule occurrence validation and confirmation logic is in `src/shared/lib/db/supabase-adapter.ts`, including `buildRequestedOccurrenceEndAt(...)`.
- CURRENT: That function includes an explicit guard for a past regression:
  - `requested_slot_at` is stored as UTC
  - `class_schedules.start_time/end_time` are local KST clock values
  - the code converts the stored timestamp into KST before comparing the hour/minute
- CURRENT: If you touch occurrence generation, requested slot validation, or confirmation logic, re-check the KST conversion logic before changing comparisons.
- CURRENT: Public slot listing uses `src/features/applications/queries/get-public-class-available-slots.ts`, which calls `listAvailableScheduleSlotsByClassIdWithClient(...)` with the service-role client.

## 7. Consultation & Registration Funnel
- CURRENT: Funnel foundation was added by `supabase/migrations/20260815140000_add_conversion_pipeline_foundation.sql`.
- CURRENT: Current funnel data spans:
  - `trial_applications.completed_at`
  - `trial_applications.next_contact_at`
  - `trial_applications.last_activity_at`
  - `trial_applications.registration_status`
  - `trial_applications.enrolled_at`
  - `trial_applications.lost_at`
  - `trial_applications.unregistered_reason`
  - `trial_results`
  - `consultation_logs`
- CURRENT: Product discussions may refer to `trial_completed_at`, but the current persisted field in code/schema is `trial_applications.completed_at`, exposed as `completedAt` in adapter types.
- CURRENT: `next_contact_at` is nullable in both schema and code. Do not force it to be required.
- CURRENT: No fixed stale-lead threshold is hard-coded in the consultation pipeline grouping code. Grouping is based on current registration status, `nextContactAt`, and consultation history in `src/shared/lib/consultation-pipeline.ts`.
- CURRENT: The consultation management surface is `/studio/unregistered`, backed by `getConsultationPipelineApplications(...)` and `UnregisteredStudentsManager`.
- CURRENT: Consultation pipeline intent is different from initial application queue intent:
  - application management: intake, review, confirm, complete
  - consultation management: post-completion follow-up, re-contact, conversion, closed lost leads
- CURRENT: Avoid changes that make active consultation leads disappear only because their original application date falls outside a dashboard period filter.
- CURRENT: `next_contact_at` is treated as a stronger follow-up signal than “has consultation history” when present.
- CURRENT: Phone buttons must be treated as “call attempt” actions only. Current code supports explicit consultation log entry/editing as a separate manual step.

## 8. Notifications
- CURRENT: SMS sending entry point is `src/features/notifications/sms/sender.ts`.
- CURRENT: Actual provider integration is `src/features/notifications/sms/providers/ncloud.ts`.
- CURRENT: SMS template rendering lives in `src/features/notifications/sms/templates.ts`.
- CURRENT: Parent notifications first attempt Alimtalk in `src/features/notifications/alimtalk/send-parent-notification.ts`, then fall back to SMS logging/send behavior.
- CURRENT: Studio/admin notifications are handled by `src/features/notifications/sms/send-studio-notification.ts`.
- CURRENT: Reminder automation is implemented in `src/features/notifications/reminders/run-trial-reminders.ts` and exposed through `/api/cron/trial-reminders`, with scheduling in `vercel.json`.
- CURRENT: Notification failure handling is intentionally decoupled from core actions through safe wrappers such as:
  - `sendStudioNotificationSafely(...)`
  - `sendParentNotificationSafely(...)`
  - `logSmsEventSafely(...)`
- IMPORTANT DOMAIN CONTRACT: Do not make core user actions fail only because SMS or Alimtalk delivery failed.

## 9. Supabase & Adapter Architecture
- CURRENT: Core initial schema tables come from `20260410000000_core_tables_v2.sql`:
  - `organizations`
  - `profiles`
  - `teachers`
  - `classes`
  - `trial_applications`
  - `schedule_blocks`
  - `application_logs`
- CURRENT: Later operational tables include:
  - `teacher_signup_requests`
  - `class_schedules`
  - `academy_update_requests`
  - `sms_logs`
  - `trial_results`
  - `consultation_logs`
  - `academy_public_profiles`
  - `partner_inquiries`
- CURRENT: Migrations are timestamped SQL files under `supabase/migrations/`.
- CURRENT: Local Supabase CLI config is in `supabase/config.toml`.
- CURRENT: The adapter interface is defined in `src/shared/lib/db/adapter.ts`.
- CURRENT: If the adapter interface changes, update:
  - `src/shared/lib/db/adapter.ts`
  - `src/shared/lib/db/supabase-adapter.ts`
  - `src/shared/lib/db/mock-adapter.ts`
  - all callers of the changed method signatures
- IMPORTANT DOMAIN CONTRACT: Do not create migrations or run `supabase db push` without user approval.

## 10. Important Domain Contracts
- CURRENT: Base application status contract must remain `new -> reviewing -> confirmed -> completed`, with `canceled` as the current exit state.
- CURRENT: Status-related work must inspect not only `trial_applications` but also `application_logs`, schedule data, notification logs, and registration funnel fields.
- CURRENT: Post-completion funnel source timestamps that must be preserved carefully are:
  - `completed_at`
  - `last_activity_at`
  - `next_contact_at`
- CURRENT: `next_contact_at` is optional and may be null.
- CURRENT: Do not hard-code stale lead rules such as “30 days means stale” into DB or canonical domain state without approval.
- CURRENT: Route names are compatibility-sensitive. Do not rename routes for cleanup or consistency without approval.
- CURRENT: Notification delivery is observational and supportive, not a prerequisite for successful business writes.

## 11. Legacy / Compatibility Areas
- CURRENT: `src/features/studio/actions/upsert-trial-result.ts`
  - Called by `src/features/studio/ui/application-trial-result-workflow.tsx`
  - That workflow is rendered by `app/studio/(dashboard)/applications/[id]/page.tsx`
  - Status: CURRENT
- CURRENT: `src/features/studio/actions/create-consultation-log.ts`
  - Called by `src/features/studio/ui/application-trial-result-workflow.tsx`
  - Render path confirmed through the same studio application detail route
  - Status: CURRENT
- CURRENT: `src/features/studio/actions/update-consultation-log.ts`
  - Called by `src/features/studio/ui/consultation-history-modal.tsx`
  - The modal is imported by `application-trial-result-workflow.tsx`
  - Status: CURRENT
- LEGACY CANDIDATE: `src/features/studio/actions/update-application-outcome.ts`
  - Action is imported by `src/features/studio/ui/application-outcome-form.tsx`
  - `ApplicationOutcomeForm` was not found in any current route/UI import tree
  - Adapter method is still implemented and active in both `supabase-adapter.ts` and `mock-adapter.ts`
  - Treat as a compatibility surface until removal is explicitly proven safe
- LEGACY CANDIDATE: `src/features/studio/ui/application-outcome-form.tsx`
  - Present and wired to `updateApplicationOutcomeAction`
  - No current caller was found with `rg`
  - Do not delete or merge without verifying historical usage expectations
- LEGACY CANDIDATE: `operator` role support
  - `docs/05-implementation-plan.md` says operator would be removed
  - Current runtime and migrations still reference `operator`
  - Confirmed examples:
    - `src/features/studio/lib/require-teacher-studio-access.ts`
    - `supabase/migrations/20260617031500_add_class_schedules_table.sql`
    - `supabase/migrations/20260624210000_create_sms_logs.sql`
  - Do not remove these references without a full policy/runtime audit

## 12. Known Documentation Drift
- STALE DOCUMENTATION: `docs/03-screen-list.md` lists `/applications/complete`, but no such route exists in `app/`.
- NEEDS VERIFICATION: `middleware.ts` still includes `/applications/:path*` in its matcher although no current `app/applications/**` route exists.
- STALE DOCUMENTATION: `AGENTS.md` says teacher signup begins as invite/manual only, but current code has a public `/studio/sign-up` request-and-approval flow.
- STALE DOCUMENTATION: `docs/05-implementation-plan.md` says `operator` is no longer used, but current code and migrations still reference it.

## 13. Verification Commands
- CURRENT: Basic project commands from `package.json`
  - `npm run dev`
  - `npm run build`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run supabase:link`
  - `npm run supabase:push:dry`
- CURRENT: For documentation-only changes, the user requested verification commands are:
  - `git diff --check`
  - `git diff -- AGENTS.md docs/CODEX_HANDOFF.md`
  - `git status --short`
- CURRENT: There is no test script in `package.json`.

## 14. Development Workflow
- CURRENT: Read `AGENTS.md` first for repository-level rules.
- CURRENT: Read the relevant `docs/**` file for the feature area before changing behavior.
- CURRENT: Inspect current route, server action, feature query, adapter method, and migration context before proposing refactors.
- CURRENT: Before large changes, share a short plan and the files that will change.
- CURRENT: Before changing DB schema, adapter interfaces, or migrations, report the need and impact first.
- CURRENT: Before deleting or consolidating suspected legacy code, confirm:
  - all imports
  - all callers
  - actual route/UI usage
  - adapter dependencies
- CURRENT: After code changes, run the smallest relevant verification set and report anything not run.
