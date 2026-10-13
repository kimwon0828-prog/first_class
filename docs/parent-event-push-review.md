# Parent native push completion review — 2026-10-13

## Scope and result

Implemented schedule-confirmed routing compatibility, actual confirmed-time-change capture, first report publication, and the existing 24-hour unanswered-feedback reminder. Automatic business-event delivery is NOT yet verified end-to-end: the explicitly approved migration is now applied, while both DB modes remain OFF and the new backend has not been deployed. No all-user switch, production code deployment, commit, or git push has been performed.

The existing trial-day reminder, rejection/completion Alimtalk/SMS and Studio notifications retain their existing channels; this change does not turn every notification into a mobile push.

## Actual iPhone evidence

- Existing basic push: user confirmed reception and opening the notification screen.
- Cold-start report check: terminated Firstsuup process 34727, sent exactly one `[검증] 체험 리포트 열기` to installation `83cce04f-4a75-42a0-88c3-0dc73a26635b` owned by the current Parent.
- Application `b1aa183a-c9e3-47a0-9f0d-94309efb56bf` was verified to belong to that Parent and already contain a published demo report. No report or application mutation.
- Notification key `report_published:474d338c-e411-4e32-bbdb-515ad83d0366`; Expo ticket `01a134a6-852a-7701-969d-9a6ffa7277d3`; receipt `ok`.
- User confirmed “알림을 눌렀고 리포트가 열려”. This proves terminated-app reception/navigation for the development installation, NOT a newly published business event, Android, or a store release build.
- Token-free operator journal: `/private/tmp/firstsuup-push-events-work/report-cold-device-result.json`.

## Database change to review

`supabase/migrations/20261013100000_parent_event_push.sql` adds private settings/delivery queues and service-only enqueue/claim/completion RPCs, captures actual report publication and confirmed-time changes, and allows `push` as a feedback reminder completion channel. It extends the existing scheduled worker's queue detection and timeout without activating it. Default OFF; no historical backfill; no customer rows modified; no device tokens exposed to new client roles.

Atomic claims prevent parallel duplicate sends. Tickets are not treated as delivery. Receipts can be retried; send/fallback cannot be automatically retried after an ambiguous external result. Missing/withdrawn/changed sources and deleted/detached accounts are checked before send/fallback. Explicit failure uses the existing report/feedback fallback once; test jobs suppress SMS/Alimtalk. Schedule-change has no invented legacy SMS event.

## Scoped verification and rollout order

1. **DONE after explicit user approval:** Apply this exact reviewed migration to `vfkfpekfwrjjocltqbty`, leaving new settings OFF and the existing confirmed setting unchanged. Compare migration history and existing business data/schema fingerprints first; do not run broad `db push`.
2. Enable only process-local feature flags for local verification. Pin test mode to a new dedicated demo application, Parent `b6802298-69b9-42c1-8b7a-1e006ed9bd32`, and installation `83cce04f-4a75-42a0-88c3-0dc73a26635b`. Current old test application/device list must not be blindly reused. Keep legacy delivery suppressed for that demo.
3. Exercise actual authorized demo confirmation, schedule-time update, first report publication and due feedback candidate through their real callers/DB capture. Poll provider receipts and verify tap destinations on iPhone; do not alter a customer application or rewrite prior feedback/view timestamps to manufacture eligibility.
4. Deploy the reviewed backend before hosted scoped testing if local device routing is insufficient. Server flags `PARENT_SCHEDULE_CONFIRMED_PUSH_ENABLED=true` and `PARENT_EVENT_PUSH_ENABLED=true` must precede turning DB collection ON. Production native registration endpoint must include the authenticated native bridge from this worktree.
5. Global `mode=all` and scheduled worker activation are separate rollout actions; do not enable while new code is not deployed. No backward event sends. Inspect pending/unknown/sending states before rollout/rollback. Turn DB mode OFF first to stop new capture; keep receipt processing running before disabling server flags.

## Checks

- 14 new event runtime suites PASS, actual sender and orchestration with inert providers.
- 16 existing schedule-confirmed runtime suites PASS.
- 7 new isolated DB suites PASS, actual migration applied in PGlite.
- 9 existing confirmed DB suites PASS.
- 10 native push suites PASS (strict route pairing, legacy path compatibility, cold/warm mount, account switching, token callbacks, permission and actual root wiring).
- Web and mobile typecheck; targeted lint; diff-check PASS.
- `verify-parent-followup-feedback.ts`: notification checks PASS, but **3 existing failures** remain both before and after this change: old Studio two-field UI assertion, Parent summary-card assertion, action field-forwarding assertion. Baseline replay used pre-change publish import/call and pre-change verifier expectations; unrelated current files were unchanged. Do not report the entire old verifier PASS.

## Sources

Web `/Users/1to6/Desktop/firstsuup-report-math-review`; mobile `/private/tmp/firstsuup-native-parent-phase1`. Existing env files and other workspaces are preserved. Local 3000/8081 remain active.

Reviewed migration SHA-256: `75feff0e9b1a1211dac855de085584371c9c2db8fd645188b81b97ccf2803132`.

## Hosted application verification

Approved exact source SHA-256 was applied to `first-class-mvp / vfkfpekfwrjjocltqbty` with atomic migration-history insertion and guards for unchanged settings/function/history. History: 139 previous entries unchanged plus one new `20261013100000` entry, whose stored SQL SHA-256 matches the approved file.

Before/after whole-row fingerprints are identical for 75 applications, 10 published/superseded report rows, 25 trial results and 5 report-engagement rows. Existing policy fingerprint and existing report/feedback/trial/push function definitions/ACLs are unchanged except the approved worker function body. Existing push cron was already ACTIVE every five minutes; that setting was preserved. Both automatic event settings remain OFF, and new queue count is zero. Two new private tables enforce RLS with no Parent/anon access; all three new public RPCs are service-only. Both capture triggers are enabled but capture nothing while OFF.

Checks: 25 related mobile tests PASS, including the 10 new native push tests. Full legacy feedback verifier still has the same three baseline failures described above. Evidence: `/private/tmp/firstsuup-push-events-work/production-verification.json` and neighboring token-free pre/post snapshots.

Still pending: production native API/event-worker deployment, explicit scoped automatic-event testing, global activation, Android/device release-build verification. No claim that all production notifications are now push-enabled.

## 2026-10-13 production release preparation

User approved production deployment with automatic sending kept OFF. Release branch `release/parent-push-20261013` starts from production/main `1ff72dd69e164de690f068cc5a0c906b0c47a989` (see Git for the full base SHA). Only push changes and a standalone authenticated `/api/native/parent/push-devices` bridge are included; other native APIs remain outside this release. The original native catchall remains in the development worktree.

- Release source: `/private/tmp/firstsuup-parent-push-release-20261013`. Existing 3000/8081 and original workspaces remain untouched.
- Native registration has 10 additional handler tests: verified JWT, Parent role, deletion/phone gates, caller-bound RPC, input limits, OFF mode and bounded errors. No service-role registration.
- Runtime suites: event 14, confirmed 16, native registration 10 PASS. Isolated DB: event 7, confirmed 9 PASS. Typecheck, touched-code lint, production-environment Next build and diff-check PASS.
- On the clean production base, the legacy feedback verifier has **2 existing UI-source assertion failures**, identical before/after: former two-field Studio UI and former Parent summary card. Notification checks PASS. This differs from the dirty development branch's three baseline failures above; no UI code was copied into this release.
- Both hosted DB collection modes were re-read as `off`; event queue 0; confirmed queue only one previously delivered job. Approved migration hash unchanged. No migration replay.
- The new runtime flag `PARENT_EVENT_PUSH_ENABLED=true` is added for the production worker. Existing confirmed and registration runtime flags were already true. **Runtime readiness does not activate collection**: both DB modes remain OFF. Global activation and scoped business-event delivery are still pending.
- Vercel project `first-class` (`prj_odHDLjP1UK07CIJJdtwWTYbgHn92`) already deploys main automatically. This release uses that existing integration after local checks; no Git-integration or cron activation settings are changed.

Deployment completion, exact release SHA and post-deploy observations must be verified after Git push; preparation alone is not a production success claim.
