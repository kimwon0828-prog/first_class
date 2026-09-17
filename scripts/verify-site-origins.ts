// Offline only: npx tsx scripts/verify-site-origins.ts
import assert from "node:assert/strict"

import { PARENT_ORIGIN, STUDIO_ORIGIN, toParentUrl, toStudioUrl } from "@/shared/config/site-origins"
import robots from "../app/robots"

assert.equal(PARENT_ORIGIN, "https://firstsuup.com")
assert.equal(STUDIO_ORIGIN, "https://studio.firstsuup.com")
assert.equal(toParentUrl(), "https://firstsuup.com/")
assert.equal(toStudioUrl(), "https://studio.firstsuup.com/")
assert.equal(toParentUrl("/record/application-id/report"), "https://firstsuup.com/record/application-id/report")
assert.equal(toParentUrl("/academy/academy-slug"), "https://firstsuup.com/academy/academy-slug")
assert.equal(robots().sitemap, "https://firstsuup.com/sitemap.xml")

for (const path of ["/", "/classes/class-id", "/studio", "/classes?q=%ED%94%BC%EC%95%84%EB%85%B8#results"]) {
  assert.equal(toParentUrl(path), `https://firstsuup.com${path}`)
  assert.equal(toStudioUrl(path), `https://studio.firstsuup.com${path}`)
}

for (const path of ["", "classes", "https://example.com", "//example.com", "/\\example.com", "/\n/example.com", "/has space"]) {
  assert.throws(() => toParentUrl(path))
  assert.throws(() => toStudioUrl(path))
}

console.log("PASS site origins, URL preservation, robots sitemap, and path validation (offline)")
