# Studio Class Form V1

> Schedule persistence/90-day behavior below records the original Form phase. The subsequent
> [Rolling Schedule V1](studio-rolling-schedule-v1.md) supersedes it for classes with saved operating rules.

## Scope

`/studio/classes/new` and `/studio/classes/[id]/edit` render the same `StudioClassForm`.
Routes retain authentication and data-loading responsibilities. No DB schema, monthly tuition,
application state, Parent eligibility, auth, or RLS changes. No commit/push.

## Shared screen

A. Basic information: title, program type, subject category/subject, learner grades, optional class format.
B. Price: explicit free/paid choice; existing `trial_price` is the one-time fee.
C. Operations: assignment mode/default teacher, operating period/weekdays/time/capacity, generated schedule preview.
D. Description: description, recommended audience, experience points, curriculum.
E. Image: existing image or successful upload; replacement only.
F. Visibility: existing `is_active` contract.

Both modes have section anchor navigation, a 312px sticky summary (320px at wide desktop),
Parent draft preview dialog and a primary save action. No wizard/tab gating.
The former Wizard entry is a compatibility wrapper. Its unused stylesheet is removed.
The operating summary has an inline variant to avoid nested card surfaces.

## Validation choices

- Title: same server minimum of two trimmed characters. Removed the UI-only 60-character cap;
  a future server max-length policy would be a separate decision.
- Class format: optional in both modes, matching the server.
- Price: no automatic blank-to-zero conversion. Free explicitly sends zero; paid requires a positive
  integer. The input uses step 1, matching the existing integer server contract.
- Capacity: positive integers; removed the modal-only 30-person upper bound. Existing nullable
  saved capacities are preserved when not edited. Generating new hours requires an explicit capacity.
- Field errors and first-error focus/scroll are shared. Failed saves preserve inputs.
- Existing server validation remains in place; the new schedule snapshot check is a conflict guard.

## Schedule persistence boundary

The main form contains deferred basic-hours edits only. Date-specific add/delete/capacity/status
operations live in a separate native dialog outside the form and are labelled as immediately saved.
All existing routes and schedule actions remain available.

For updates, `scheduleWriteMode=preserve` resolves schedules from the existing authenticated,
organization-scoped class read. The stale array from an untouched form is not replayed.
When basic hours are edited, `scheduleWriteMode=replace` carries a baseline schedule snapshot.
If IDs/time/capacity/status/reference metadata changed in the meantime, the action returns before
upserting the class. The user can reload only saved schedules while keeping other draft fields.
Immediate operations are disabled while a basic-hours edit is pending. While an immediate operation
is in flight, the operations dialog cannot close via its button, Escape, or backdrop; the main form
remains inert so its save cannot overlap the operation.

This is not a new database transaction/locking mechanism. It covers the stale-form and detected
concurrent-edit paths; it does not remove the existing adapter's read/write race window or partial
class/schedule persistence behavior.

Existing schedule IDs, booking status, series IDs, application references and legacy weekly slots
are preserved. Basic-hour generation skips times already occupied by preserved schedules, avoiding
a duplicate generated row for a protected/exception time.

The 90-day mode now shows its actual generated-through date and states that it does not automatically
extend. The interval explains both duration and start spacing. The modal button says “설정 적용”;
the final form action persists those settings.

## Remaining mode differences

- Create: empty values, private default, explicit price choice, browser-local draft recovery.
- Update: stored values, inactive teacher fallback, dirty indication, protected/weekly summaries,
  separate immediate operations.
- Public guard: preserved intentionally. Create requires a schedule to publish; update retains its
  existing no-schedule behavior. A single publishing eligibility rule still needs a product decision.
- Main CTAs: “수업 등록하기” / “변경사항 저장”.

## Image and draft behavior

JPEG/PNG/WebP and 5MB limits retained. The preview URL changes only after upload succeeds.
Failure leaves the previous image and hidden persisted URL intact. No delete operation was added.
Existing `class-covers` storage path and `cover_image_url` contract are unchanged.

Create keeps the organization-scoped localStorage/session keys, with a version 5 record and legacy
version 1–4 read support. It restores on reload, prompts on a new session, and clears after success.
The copy explicitly describes browser-local storage, not a server draft.

## Verification (local fixtures only)

- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`.
- `npx tsx scripts/verify-studio-class-form-v1.ts`.
- Existing verifiers: regular-schedule-preference, parent-schedule, parent-class-detail-apply,
  studio-route-contract, studio-navigation-migration, final-ux-coherence.
- The navigation verifier now verifies that the legacy Wizard entry delegates to the shared form,
  instead of requiring an unused navigation hook in that wrapper.
- Browser: actual Form/Shell components and server actions with isolated in-memory adapter/auth
  substitutes, at 1280, 1440, 1920px. All browser network requests restricted to localhost.
- Create: empty errors/focus, free/paid, type label, both assignment modes, generation, public guard,
  private/free save, local draft reload, Parent preview, local image upload success/failure.
- Update: initial data, price, teacher, visibility, basic hours, image replacement, protected and
  legacy weekly preservation, inactive teacher.
- Immediate add/delete/capacity/close/reopen followed by final save: all retained. Unrelated title
  draft also retained across refresh.
- Additional runtime: intentionally stale FormData, detected concurrent basic-hours edit with
  safe recovery, invalid MIME and >5MB file rejection.

SKIP: production Supabase mutations, deployed RLS/auth integration, production Storage uploads.
No production accounts/data were used. Fixture screenshots are visual evidence, not production data.

## Next phase

Monthly tuition belongs as a separate “정규수업 월 수강료 — 월 기준” item in B. Price, with a separate
future data contract. No field, disabled placeholder, or schema change is introduced in V1.
