# Class Lifecycle V1 release contract

Approved scope: nullable archive state, same-organization lifecycle RPC, Classes filters/actions, Parent discovery/application guards, and archived Rolling guards. Restoring always leaves a class private. Permanent deletion requires no operating history. Nonarchived private fixed-period generation retains its prior behavior.

## Deployment order

1. Apply COMPAT `20261001130000` only (completed before this release).
2. Verify the clean integration against the current main; commit only Lifecycle files and fast-forward main.
3. Verify the Git SHA of the READY Production deployment and the `studio.firstsuup.com` alias.
4. Run authenticated new-app + COMPAT read smoke. Do not mutate operating classes.
5. Apply only HARDENING `20261001131000`, recording its history in the same transaction.
6. Run the rollback-only SQL contract smoke and authenticated read smoke again. Compare all existing public table counts/fingerprints. Remove TEST fixtures and temporary worktree/database/server.

Do not run bulk `db push`. The earlier `20261001120000` SQL is historical, local-only and stored under `docs/sql/archive/`; it must never enter the active migration sequence.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`.
- `verify-class-lifecycle.ts` and `verify-rolling-schedules.ts`: mock/public-query and private-fixed-period regression.
- `verify-class-lifecycle-compat.cjs`: restore the saved pre-COMPAT schema-only Production snapshot into a new disposable local database; baseline → COMPAT → HARDENING, existing catalog/privilege compatibility and Rolling SQL A–N.
- `verify-class-lifecycle-compat-ui.cjs`: real Classes component/CSS rendered from actual COMPAT SQL output; filters, eligibility and action menus; network/mutations blocked.
- `verify-class-lifecycle-hardening.sql`: 44 assertions covering raw-delete denial, eligible RPC deletion, history protection, archive/restore state, publish/application/schedule/rule guards, zero archived reconcile/refill, private fixed-period generation, same/other organization, Parent/anon denial and historical report access. All TEST rows are in a transaction ending in ROLLBACK. No external messaging call.
- `verify-class-lifecycle-release-smoke.cjs --allow-test-fixtures`: explicit TEST identities/private classes only; authenticated Studio Classes/Schedule/Cases/Dashboard/Application Detail and Parent Home/Classes/Class Detail/Academy Detail/Favorites/application history. Browser requests are read-only. Finally removes only its recorded fixture IDs, using the lifecycle RPC for class cleanup. Existing account rows are never mutated.
- Existing Schedule/Cases/Dashboard/Parent verifier suite is run from the clean integration (27 scripts total including lifecycle/rolling).

The release browser smoke requires an already approved Production TEST-fixture run, the project environment, and `PLAYWRIGHT_MODULE_PATH` when Playwright is installed outside the project. Default app URL is the isolated build at localhost:3100. For Production use `LIFECYCLE_SMOKE_STUDIO_ORIGIN=https://studio.firstsuup.com`, `LIFECYCLE_SMOKE_PARENT_ORIGIN=https://firstsuup.com`, and a separate `LIFECYCLE_SMOKE_OUTPUT` directory. It never starts or changes the user's localhost:3000 server.

The archived/private detail route may return a streamed HTTP 200 with Next.js not-found content; the smoke asserts the unavailable-page heading and absence of an application button rather than relying only on HTTP status.

Release evidence and final deployment/schema result are retained outside the original working tree in `/tmp/class-lifecycle-final-release/`. The original branch, HEAD, staged state, all tracked/untracked file contents, and environment fingerprints are compared before/after.
