# iOS Push foundation release

2026-10-04. Scope was narrowed with explicit user approval to additive device registration, RLS and one operator-triggered test Push. The original `20261004090000_parent_push_mvp.sql` is **excluded**, including its existing notification constraint/policy replacements and all automatic event integration. Do not apply that historical local draft after this foundation: a future event phase must use a reviewed follow-up migration.

Migration: `20261004130000_parent_push_foundation.sql`. Adds only `parent_push_settings`, `parent_push_devices` and the authenticated registration RPC. No DROP, backfill, existing-row rewrite, notification-policy change, event queue, worker, cron or source trigger. Existing Alimtalk/SMS, notifications, Studio and Apple/Auth source remains identical to the release base `c744fbfe8ffe1c756a65b7ff118a1ad8c0cea46b`.

Registration requires both Production `PARENT_PUSH_REGISTRATION_ENABLED=true` and DB `registration_enabled=true`; the migration defaults false. The old automatic-event flag `PARENT_PUSH_ENABLED` stays false. No event transport is deployed. The fixed-content test transport has no public route or automatic caller, sends once, and never retries an ambiguous result or invokes fallback.

The web session supplies Parent identity. Client Parent IDs are rejected. RPC verifies Parent role, active matching auth session, account deletion state and installation proof. Own-device RLS and column grants prevent foreign token reads and owner/session/token mutation. The unique Expo token cannot belong to two installations. SecureStore installation secret permits an atomic same-device account switch. Session/profile deletion cascades the device binding; ordinary logout uses the existing Auth implementation. Supabase documents that sign-out removes affected sessions: https://supabase.com/docs/guides/auth/sessions .

Native permission requires an authenticated Parent handshake, explanatory UI and explicit opt-in. Denial does not repeatedly prompt. Native tokens and installation secrets are never logged. The new one-off payload uses `type=test`, `path=/notifications` and a UUID `test:` key. The native queue waits for trusted WebView readiness and acknowledges navigation once. Origin/path validation rejects external URLs and executable strings. Existing WebView session, back gestures, loading and reconnect flows are preserved.

Validation: isolated actual foundation SQL/RLS verifier, actual registration API/test-transport fixtures, Chromium/WebKit 390/430 bridge tests, existing notification/auth/phone regression, lint/typecheck/production build. Device delivery and navigation are separately confirmed on the iPhone; an Expo ticket alone is not proof of display.

Tools: `scripts/verify-parent-push-foundation-db.cjs` (`PGLITE_MODULE_PATH`), `scripts/verify-parent-push-foundation.cjs`, `scripts/verify-parent-push-browser.cjs` (`ESBUILD_MODULE_PATH`, `PLAYWRIGHT_MODULE_PATH`). All automated verifiers use inert transports or isolated DBs.

No Android/FCM setup or build is part of this release. No operational schedule/report/application event is created for testing. Automatic event Push requires a separate approved phase, including any previously deferred notification schema extension.
