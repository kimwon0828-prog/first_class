# Parent / Studio origins — Phase S1

`src/shared/config/site-origins.ts` is the shared, browser-safe source for public origins:

- Parent: `https://firstsuup.com`
- Studio: `https://studio.firstsuup.com`

`toParentUrl(path)` and `toStudioUrl(path)` accept root-relative paths, including queries and fragments. The default path is `/`. Absolute URLs, protocol-relative URLs, backslashes, whitespace and control characters are rejected. Callers must encode dynamic URL components where needed.

S1 deliberately uses fixed production origins, preserving the previous public-link behavior on localhost and preview builds. No environment-variable overrides or request-host inference are introduced.

Existing Parent metadata, sitemap, robots, academy sharing and report-notification URLs use this configuration. Studio's origin/helper is prepared for a later phase and has no application callers yet. It does not add or remove `/studio` from paths.

Middleware, authentication, cookies, OAuth callbacks, routes, internal `/studio` hrefs, and Vercel/domain settings are unchanged. A configured Studio origin does not imply that its DNS or deployment is active.

Verify the origin contract without network or database access:

```sh
npx tsx scripts/verify-site-origins.ts
```

Local QA uses Production Supabase. Do not start local Supabase or run seed scripts.
