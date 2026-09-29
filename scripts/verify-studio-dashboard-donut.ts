// Render geometry only. Does not read/write application data or change analytics.
import assert from "node:assert/strict"
import { buildStudioDonutArcs } from "@/features/studio/lib/studio-dashboard-donut"
import { STUDIO_DONUT_RADIUS, STUDIO_DONUT_STROKE, STUDIO_DONUT_VIEWBOX } from "@/features/studio/lib/studio-dashboard-analytics"

const cases = [[50, 50, 0, 0], [100, 0, 0, 0], [0, 100, 0, 0], [25, 25, 25, 25], [50, 25, 25, 0], [1, 99, 0, 0], [33, 33, 34, 0], [0, 0, 0, 0], [0, 0, 2, 2]]
const center = STUDIO_DONUT_VIEWBOX / 2
const outer = STUDIO_DONUT_RADIUS + STUDIO_DONUT_STROKE / 2
const inner = STUDIO_DONUT_RADIUS - STUDIO_DONUT_STROKE / 2
for (const counts of cases) {
  const total = counts.reduce((sum, count) => sum + count, 0)
  const arcs = buildStudioDonutArcs(counts, total)
  assert.equal(arcs.filter(Boolean).length, counts.filter(count => count > 0).length)
  const boundaries: Array<{ startOuter: number[]; endOuter: number[]; startInner: number[]; endInner: number[] }> = []
  arcs.forEach((arc, index) => {
    if (!arc) return
    if (arc.fullCircle) {
      assert.equal(counts[index], total)
      assert.equal(arc.path, "")
      return
    }
    assert.match(arc.path, /^M [\d .-]+ A [\d .-]+ L [\d .-]+ A [\d .-]+ Z$/)
    const n = arc.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    assert.equal(n.length, 18)
    assert.ok(n.every(Number.isFinite))
    assert.deepEqual([n[2], n[3], n[4], n[5], n[6]], [outer, outer, 0, counts[index] / total > 0.5 ? 1 : 0, 1])
    assert.deepEqual([n[11], n[12], n[13], n[14], n[15]], [inner, inner, 0, counts[index] / total > 0.5 ? 1 : 0, 0])
    const boundary = { startOuter: n.slice(0, 2), endOuter: n.slice(7, 9), endInner: n.slice(9, 11), startInner: n.slice(16, 18) }
    for (const [point, radius] of [[boundary.startOuter, outer], [boundary.endOuter, outer], [boundary.startInner, inner], [boundary.endInner, inner]] as const) {
      assert.ok(Math.abs(Math.hypot(point[0] - center, point[1] - center) - radius) < 1e-7)
    }
    // Each closing edge is radial, not a diagonal across the center hole.
    for (const [a, b] of [[boundary.startOuter, boundary.startInner], [boundary.endOuter, boundary.endInner]]) {
      assert.ok(Math.abs((a[0] - center) * (b[1] - center) - (a[1] - center) * (b[0] - center)) < 1e-6)
    }
    boundaries.push(boundary)
  })
  boundaries.forEach((current, i) => {
    const next = boundaries[(i + 1) % boundaries.length]
    assert.deepEqual(current.endOuter, next.startOuter)
    assert.deepEqual(current.endInner, next.startInner)
  })
}
assert.deepEqual(buildStudioDonutArcs([0, 0, 2, 2], 4).map(arc => arc?.path ?? null), [null, null,
  "M 60 1 A 59 59 0 0 1 60 119 L 60 105 A 45 45 0 0 0 60 15 Z",
  "M 60 119 A 59 59 0 0 1 60 1 L 60 15 A 45 45 0 0 0 60 105 Z"])
console.log("PASS: nine donut distributions, zero omission, full circle, exact shared boundaries, radial closure, opposite inner sweep, unchanged radii")
