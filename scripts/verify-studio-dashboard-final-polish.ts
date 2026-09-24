// Dashboard final polish source checks. No DB, network, or mutation.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const page = read("app/studio/(dashboard)/page.tsx")
const pageCss = read("app/studio/(dashboard)/page.module.css")
const period = read("src/features/studio/ui/studio-dashboard-period-picker.tsx")
const periodCss = read("src/features/studio/ui/studio-dashboard-period-control.module.css")
const launcher = read("src/features/reports/ui/conversion-infographic-launcher.tsx")

assert.ok(page.includes("dashboardToolbar") && page.includes("toolbarStart") && page.includes("toolbarEnd"))
assert.ok(page.indexOf("ConversionInfographicLauncher") < page.indexOf("StudioDashboardPeriodControl"))
assert.equal((page.match(/ConversionInfographicLauncher model=/g) ?? []).length, 1)
assert.ok(launcher.includes("인포그래픽 보기"))

assert.ok(period.includes('role="dialog"') && period.includes('aria-expanded={isOpen}'))
assert.ok(period.includes('document.addEventListener("pointerdown"'))
assert.ok(period.includes('event.key === "Escape"'))
assert.ok(period.includes('action={basePath}') && period.includes('method="get"'))
assert.ok(!period.includes("onSubmit="))
assert.ok(period.includes("fieldGrid") && period.includes("cancelButton") && period.includes("applyButton"))
assert.ok(periodCss.includes("position: absolute") && periodCss.includes("width: 360px"))
assert.ok(periodCss.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"))
assert.ok(periodCss.includes("min-height: 40px") && periodCss.includes("gap: var(--s2)"))

assert.ok(pageCss.includes("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)"))
assert.ok(pageCss.includes("grid-template-rows: repeat(2, minmax(min-content, 1fr))"))
assert.ok(pageCss.includes(".actionsPanel { height: 100%; }"))
assert.ok(pageCss.includes(".rowLink:hover { background: var(--brand-50); }"))
assert.ok(pageCss.includes("transition: background-color 150ms ease"))

for (const label of ["체험 완료", "노쇼", "일반 취소", "진행 전·진행 중"]) {
  assert.ok(page.includes(label), `trial donut label missing: ${label}`)
}
assert.ok(page.includes("analytics.donutSegments"))
assert.ok(!page.includes("getCurrentParentDecision"))

console.log("PASS: Dashboard toolbar, anchored popover, full-row hover, workspace stretch, and unchanged analytics surfaces")
